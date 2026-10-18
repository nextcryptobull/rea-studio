// In-process job runner.
//
// MODES
//   - "demo"   (default): synthesizes realistic findings without invoking the
//               `rea-agents` CLI. Used when rea isn't installed or when the
//               user explicitly enables demo mode in Settings. Lets you try
//               the UI end-to-end without any external dependencies.
//   - "live":  spawns `npx rea-agents@latest <command> <target> --json` as a
//               child process. Parses NDJSON from stdout, normalizes each
//               finding into our schema, and inserts into the DB.
//
// CANCELLATION
//   - Demo mode: a `cancelled` flag is checked between simulated steps.
//   - Live mode: SIGTERM to the child, escalated to SIGKILL after 5s.
//
// TIMEOUTS
//   - Per-target-type hard timeout kills zombie processes.
//
// PATH SAFETY
//   - Filesystem targets (apk/binary) must resolve under REA_UPLOAD_DIR.
//
// PHASE 1 STATUS
//   - Website targets enabled in both demo and live modes.
//   - APK / binary targets throw a clear "not yet enabled" error. Flip the
//     `enabled` flag in COMMAND_BY_TARGET after verifying the real CLI command
//     name in `rea --help` and confirming Java + Ghidra/JADX are installed.

import { spawn, type ChildProcess } from 'node:child_process'
import * as readline from 'node:readline'
import { resolve, relative, isAbsolute } from 'node:path'
import { db } from '@/lib/db'
import { getEngine, getFindingTemplates, getLogLines } from '@/lib/demo-data'
import type { Evidence, FindingCategory, Severity, TargetType } from '@/lib/types'

type Tracker = { cancelled: boolean; child: ChildProcess | null; timeout: NodeJS.Timeout | null }

const activeJobs = new Map<string, Tracker>()

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function startJobRunner(jobId: string) {
  if (activeJobs.has(jobId)) return
  const tracker: Tracker = { cancelled: false, child: null, timeout: null }
  activeJobs.set(jobId, tracker)
  void runJob(jobId, tracker).catch((err) => {
    console.error(`[runner] job ${jobId} crashed:`, err)
  })
}

export function cancelJobRunner(jobId: string) {
  const tracker = activeJobs.get(jobId)
  if (!tracker) return
  tracker.cancelled = true
  if (tracker.child && !tracker.child.killed) {
    tracker.child.kill('SIGTERM')
    setTimeout(() => {
      if (tracker.child && !tracker.child.killed) tracker.child.kill('SIGKILL')
    }, 5000)
  }
}

// ─── Per-target-type config ────────────────────────────────────────────────
//
// `command` is the subcommand passed to `rea`. Update these strings after
// running `rea --help` to confirm the exact names.
//
// `needsJava` gates whether the host must have JDK 17+ installed.
//
// `enabled` is the Phase-1 / Phase-2 switch. Flip to true after you've tested
// the command locally.

const COMMAND_BY_TARGET: Record<TargetType, {
  command: string
  needsJava: boolean
  enabled: boolean
  maxRuntimeMs: number
}> = {
  website: {
    command: 'analyze-javascript-application',
    needsJava: false,
    enabled: true,
    maxRuntimeMs: 15 * 60 * 1000, // 15 min
  },
  apk: {
    command: 'analyze-android-apk',
    needsJava: true,
    enabled: false, // Phase 2: flip after confirming command name + Java install
    maxRuntimeMs: 30 * 60 * 1000,
  },
  binary: {
    command: 'analyze-binary',
    needsJava: true,
    enabled: false, // Phase 2: flip after confirming command name + Ghidra install
    maxRuntimeMs: 60 * 60 * 1000,
  },
}

// ─── Mode selection ────────────────────────────────────────────────────────
//
// Returns "demo" or "live" based on:
//   1. The `demoMode` Setting (highest priority)
//   2. The `REA_DEMO_MODE` env var
//   3. Default: "demo" (safer — works even when `rea` isn't installed)

async function resolveMode(): Promise<'demo' | 'live'> {
  const setting = await db.setting.findUnique({ where: { key: 'demoMode' } })
  if (setting?.value === 'false') return 'live'
  if (setting?.value === 'true') return 'demo'
  if (process.env.REA_DEMO_MODE === 'false') return 'live'
  return 'demo'
}

// ─── REA binary resolution ──────────────────────────────────────────────────

async function getReaInvocation(): Promise<{ binary: string; args: string[] }> {
  const setting = await db.setting.findUnique({ where: { key: 'reaBinaryPath' } })
  const configured = setting?.value?.trim()
  if (configured && configured.length > 0) {
    const [binary, ...args] = configured.split(/\s+/)
    return { binary, args }
  }
  return { binary: 'npx', args: ['-y', 'rea-agents@latest'] }
}

// ─── Path safety for filesystem targets ─────────────────────────────────────

const UPLOAD_DIR = process.env.REA_UPLOAD_DIR
  ? resolve(process.env.REA_UPLOAD_DIR)
  : resolve(process.cwd(), 'uploads')

function safeResolveTarget(target: string, targetType: TargetType): { ok: true; path: string } | { ok: false; reason: string } {
  if (targetType === 'website') {
    return { ok: true, path: target }
  }
  if (!isAbsolute(target)) {
    return { ok: false, reason: 'Path must be absolute' }
  }
  const resolved = resolve(target)
  const rel = relative(UPLOAD_DIR, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { ok: false, reason: `Path must be inside ${UPLOAD_DIR}` }
  }
  return { ok: true, path: resolved }
}

// ─── Main job runner ────────────────────────────────────────────────────────

async function runJob(jobId: string, tracker: Tracker) {
  const logHolder = { current: '' }
  const appendLog = (line: string) => { logHolder.current = `${logHolder.current}${line}\n` }

  try {
    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) {
      console.warn(`[runner] job ${jobId} not found in DB`)
      return
    }

    const targetType = job.targetType as TargetType
    const config = COMMAND_BY_TARGET[targetType]

    if (!config.enabled) {
      throw new Error(
        `Target type "${targetType}" is not enabled yet. ` +
        `Flip \`enabled: true\` in src/lib/runner.ts COMMAND_BY_TARGET after confirming ` +
        `the "${config.command}" subcommand exists in \`rea --help\` and ` +
        `${config.needsJava ? 'JDK 17+ is installed' : 'all dependencies are met'}.`
      )
    }

    // Path safety check (no-op for website targets — URLs are validated by the API route)
    const safe = safeResolveTarget(job.target, targetType)
    if (!safe.ok) {
      throw new Error(`Unsafe target path: ${safe.reason}`)
    }
    const actualTarget = safe.path

    const mode = await resolveMode()

    // In live mode, the `analyze-javascript-application` command requires a
    // LOCAL DIRECTORY — it does not accept URLs. Reject website targets that
    // are URLs in live mode so users get a clear error message instead of a
    // cryptic ENOENT from REA.
    //
    // To analyze a website in live mode, the user must first download the
    // site (e.g. with `wget --recursive`) and submit the local path. A
    // future enhancement could add an automatic pre-download step here.
    if (mode === 'live' && targetType === 'website' && /^https?:\/\//.test(actualTarget)) {
      throw new Error(
        `Live mode cannot analyze URLs directly. REA's analyze-javascript-application ` +
        `requires a local directory. Either: (1) switch to demo mode in Settings, or ` +
        `(2) download the site first (e.g. \`wget --recursive --level=1 https://example.com\`) ` +
        `and submit the resulting local path.`
      )
    }
    await db.job.update({
      where: { id: jobId },
      data: { status: 'running', progress: 0, engine: mode === 'demo' ? `${getEngine(targetType)} (demo)` : config.command },
    })
    appendLog(`rea: mode=${mode} target=${actualTarget}`)
    await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } })

    // Hard timeout — kills the child if it runs longer than maxRuntimeMs
    tracker.timeout = setTimeout(() => {
      if (!tracker.cancelled) {
        appendLog(`rea: timed out after ${config.maxRuntimeMs / 60000}min, cancelling…`)
        cancelJobRunner(jobId)
      }
    }, config.maxRuntimeMs)

    if (mode === 'demo') {
      await runDemo(jobId, tracker, targetType, logHolder, appendLog)
    } else {
      await runLive(jobId, tracker, targetType, actualTarget, config, logHolder, appendLog)
    }

    if (tracker.cancelled) throw new Error('cancelled')

    appendLog('rea: analysis complete')
    await db.job.update({
      where: { id: jobId },
      data: { status: 'done', progress: 100, log: logHolder.current },
    })

    await writeAuditLog(jobId, 'job.done', {
      mode,
      targetType,
      target: actualTarget,
      logBytes: logHolder.current.length,
    }).catch(() => null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'cancelled') {
      await db.job.update({
        where: { id: jobId },
        data: { status: 'cancelled', progress: 0, log: logHolder.current },
      }).catch(() => null)
    } else {
      console.error(`[runner] job ${jobId} failed:`, err)
      await db.job.update({
        where: { id: jobId },
        data: { status: 'failed', error: message, log: logHolder.current },
      }).catch(() => null)
    }
    await writeAuditLog(jobId, 'job.failed', { message }).catch(() => null)
  } finally {
    if (tracker.timeout) clearTimeout(tracker.timeout)
    if (tracker.child && !tracker.child.killed) tracker.child.kill('SIGKILL')
    activeJobs.delete(jobId)
  }
}

// ─── Demo mode ──────────────────────────────────────────────────────────────
//
// Synthesizes realistic findings from src/lib/demo-data.ts without invoking
// any external CLI. Used by default so the UI works out of the box.

async function runDemo(
  jobId: string,
  tracker: Tracker,
  targetType: TargetType,
  logHolder: { current: string },
  appendLog: (line: string) => void,
) {
  const lines = getLogLines(targetType)
  const templates = getFindingTemplates(targetType)
  const perLine = Math.floor(80 / (lines.length + templates.length))

  for (let i = 0; i < lines.length; i++) {
    if (tracker.cancelled) throw new Error('cancelled')
    const progress = Math.min(80, (i + 1) * perLine)
    appendLog(lines[i])
    await db.job.update({
      where: { id: jobId },
      data: { progress, log: logHolder.current },
    })
    await sleep(280)
  }

  for (let i = 0; i < templates.length; i++) {
    if (tracker.cancelled) throw new Error('cancelled')
    const t = templates[i]
    await db.finding.create({
      data: {
        jobId,
        category: t.category,
        severity: t.severity,
        title: t.title,
        description: t.description,
        evidence: JSON.stringify(t.evidence),
      },
    })
    appendLog(`rea: finding #${i + 1} recorded`)
    const progress = 80 + Math.floor(((i + 1) / templates.length) * 20)
    await db.job.update({
      where: { id: jobId },
      data: { progress: Math.min(99, progress), log: logHolder.current },
    })
    await sleep(420)
  }
  appendLog('rea: demo analysis complete')
}

// ─── Live mode ──────────────────────────────────────────────────────────────
//
// Spawns `rea-agents analyze-* --json` and streams NDJSON output.

async function runLive(
  jobId: string,
  tracker: Tracker,
  targetType: TargetType,
  actualTarget: string,
  config: typeof COMMAND_BY_TARGET[TargetType],
  logHolder: { current: string },
  appendLog: (line: string) => void,
) {
  const { binary, args: baseArgs } = await getReaInvocation()
  const args = [...baseArgs, config.command, actualTarget, '--json']

  appendLog(`rea: spawning ${binary} ${args.join(' ')}`)
  await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } })

  const child = spawn(binary, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      ...(process.env.REA_GHIDRA_STARTUP_TIMEOUT_MS
        ? { REA_GHIDRA_STARTUP_TIMEOUT_MS: process.env.REA_GHIDRA_STARTUP_TIMEOUT_MS }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  tracker.child = child

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
  let lastProgressBump = Date.now()

  const stdoutDone = new Promise<void>((resolve) => {
    rl.on('line', async (line) => {
      if (tracker.cancelled) return
      const trimmed = line.trim()
      if (!trimmed) return

      let parsed: any
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        // Plain-text log line — append + heuristic progress bump
        appendLog(trimmed)
        if (Date.now() - lastProgressBump > 1000) {
          lastProgressBump = Date.now()
          await bumpProgress(jobId, 3, 95)
        }
        await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
        return
      }

      // ── Progress events: {"rea_progress": {...}} ────────────────────────
      //
      // REA emits one of these per phase. The shape is:
      //   { rea_progress: { phase, completed, total, message, sequence, terminal? } }
      //
      // We append the message to the log and bump progress based on
      // `completed`/`total` if available, otherwise heuristically.
      if (parsed.rea_progress) {
        const p = parsed.rea_progress
        appendLog(`rea: ${p.message ?? p.phase}`)
        if (typeof p.completed === 'number' && typeof p.total === 'number' && p.total > 0) {
          const progress = Math.min(95, Math.floor((p.completed / p.total) * 80) + 5)
          await db.job.update({
            where: { id: jobId },
            data: { log: logHolder.current, progress },
          }).catch(() => null)
        } else {
          await bumpProgress(jobId, 3, 95)
          await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
        }
        return
      }

      // ── Error events: {"error": "...", "message": "..."} ────────────────
      //
      // REA emits these when the CLI fails. We append the human-readable
      // message to the log; the non-zero exit code will throw below.
      if (parsed.error) {
        appendLog(`rea: error — ${parsed.message ?? parsed.error}`)
        if (parsed.remediation?.action) {
          appendLog(`rea:     remediation — ${parsed.remediation.action}`)
        }
        await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
        return
      }

      // ── Final result: {"evidence_id": "...", "normalized_result": {...}} ─
      //
      // This is the bulk of the output. It's a single NDJSON line containing
      // the application graph, with nodes holding observations. We walk the
      // graph and emit one finding per observation with a low/informational
      // severity. Custom vulnerability-pattern detection (e.g. "looks like
      // SHA1 hashing of passwords") should be layered on top later.
      if (parsed.evidence_id && parsed.normalized_result) {
        const observations = extractObservations(parsed.normalized_result)
        appendLog(`rea: analysis produced ${observations.length} observation(s)`)
        await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
        for (const obs of observations) {
          if (tracker.cancelled) break
          await db.finding.create({
            data: {
              jobId,
              category: obs.category,
              severity: obs.severity,
              title: obs.title,
              description: obs.description,
              evidence: JSON.stringify(obs.evidence),
            },
          })
          appendLog(`rea: observation — [${obs.severity}] ${obs.title}`)
          await bumpProgress(jobId, 1, 99)
        }
        await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
        return
      }

      // ── Legacy finding-shape fallback ────────────────────────────────────
      //
      // If REA ever emits a direct finding object (with `title`/`severity`),
      // handle it via the original normalizeFinding path. Kept for forward-
      // compatibility.
      const kind = parsed.type ?? parsed.kind ?? parsed.event
      if (kind === 'progress' || kind === 'log' || kind === 'status') {
        appendLog(parsed.message ?? trimmed)
        const progress = typeof parsed.progress === 'number' ? Math.min(99, parsed.progress) : undefined
        await db.job.update({
          where: { id: jobId },
          data: {
            log: logHolder.current,
            ...(progress !== undefined ? { progress } : {}),
          },
        }).catch(() => null)
      } else if (kind === 'finding' || parsed.title) {
        const finding = normalizeFinding(parsed)
        if (finding) {
          await db.finding.create({
            data: {
              jobId,
              category: finding.category,
              severity: finding.severity,
              title: finding.title,
              description: finding.description,
              evidence: JSON.stringify(finding.evidence),
            },
          })
          appendLog(`rea: finding recorded — [${finding.severity}] ${finding.title}`)
          await bumpProgress(jobId, 2, 99)
          await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
        }
      }
    })
    rl.on('close', () => resolve())
  })

  const stderrChunks: string[] = []
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderrChunks.push(text)

    // Try to parse stderr as NDJSON too — REA emits progress events
    // ({"rea_progress": {...}}) on stderr, and the final result on stdout.
    // If we don't parse stderr for progress events, the progress bar stays
    // at 0% until the final result arrives, which feels broken.
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let parsed: any
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        // Plain-text stderr — log it with the [stderr] prefix
        appendLog(`[stderr] ${trimmed}`)
        continue
      }
      if (parsed.rea_progress) {
        const p = parsed.rea_progress
        appendLog(`rea: ${p.message ?? p.phase}`)
        if (typeof p.completed === 'number' && typeof p.total === 'number' && p.total > 0) {
          const progress = Math.min(95, Math.floor((p.completed / p.total) * 80) + 5)
          void db.job.update({
            where: { id: jobId },
            data: { log: logHolder.current, progress },
          }).catch(() => null)
        }
        continue
      }
      if (parsed.error) {
        appendLog(`rea: error — ${parsed.message ?? parsed.error}`)
        if (parsed.remediation?.action) {
          appendLog(`rea:     remediation — ${parsed.remediation.action}`)
        }
        continue
      }
      // Unknown JSON on stderr — log it raw
      appendLog(`[stderr] ${trimmed}`)
    }
  })

  const exitCode = await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0))
  })
  await stdoutDone

  if (exitCode !== 0) {
    throw new Error(
      `rea exited with code ${exitCode}. ` +
      `stderr: ${stderrChunks.join('').slice(0, 500)}`
    )
  }

  await db.job.update({ where: { id: jobId }, data: { log: logHolder.current } }).catch(() => null)
}

// ─── Heuristic progress bump ────────────────────────────────────────────────
//
// Atomic-ish increment: serialize per-job to avoid lost updates.

const progressLock = new Map<string, Promise<void>>()
async function bumpProgress(jobId: string, delta: number, max: number) {
  const prev = progressLock.get(jobId) ?? Promise.resolve()
  const next = prev.then(async () => {
    const current = await db.job.findUnique({ where: { id: jobId }, select: { progress: true } })
    if (!current) return
    const newProgress = Math.min(max, current.progress + delta)
    if (newProgress > current.progress) {
      await db.job.update({ where: { id: jobId }, data: { progress: newProgress } }).catch(() => null)
    }
  })
  progressLock.set(jobId, next)
  await next.catch(() => null)
  progressLock.delete(jobId)
}

// ─── Finding normalization ─────────────────────────────────────────────────
//
// Maps the REA CLI's finding schema → our Finding model.
//
// IMPORTANT: the exact field names below are best-effort guesses. After
// running `rea analyze-javascript-application https://example.com --json | head -50`
// once, inspect the actual field names and update the `??` chains below.

function normalizeFinding(raw: any): {
  category: FindingCategory
  severity: Severity
  title: string
  description: string
  evidence: Evidence[]
} | null {
  if (!raw || typeof raw !== 'object') return null
  const title = raw.title ?? raw.name ?? raw.summary ?? '(untitled finding)'
  const description = raw.description ?? raw.explanation ?? raw.detail ?? ''
  const severity = normalizeSeverity(raw.severity ?? raw.risk ?? raw.level ?? 'info')
  const category = normalizeCategory(raw.category ?? raw.type ?? raw.kind ?? 'other')
  const evidence: Evidence[] = Array.isArray(raw.evidence)
    ? raw.evidence.map((e: any) => ({
        kind: normalizeEvidenceKind(e.kind ?? e.type ?? 'code'),
        snippet: String(e.snippet ?? e.text ?? e.value ?? e.code ?? ''),
        location: e.location ?? e.path ?? e.file ?? e.offset,
      })).filter((e: Evidence) => e.snippet.length > 0)
    : []
  return { category, severity, title, description, evidence }
}

// ─── Observation extraction from REA's normalized_result ────────────────────
//
// REA's `analyze-javascript-application` output is a graph:
//   normalized_result.graph.nodes[] → each node has observations[]
//
// We walk the graph and convert each observation into a Finding with severity
// 'info' (since REA itself doesn't classify observations as vulnerabilities).
// Custom vulnerability-pattern detection (e.g. "node references
// crypto.createHash('sha1')") can be layered on top later by inspecting the
// observation's `properties` and bumping severity accordingly.

function extractObservations(normalized: any): Array<{
  category: FindingCategory
  severity: Severity
  title: string
  description: string
  evidence: Evidence[]
}> {
  const out: Array<{
    category: FindingCategory
    severity: Severity
    title: string
    description: string
    evidence: Evidence[]
  }> = []

  const graph = normalized?.graph
  if (!graph || !Array.isArray(graph.nodes)) return out

  for (const node of graph.nodes) {
    const nodeId = node.node_id ?? '(unknown node)'
    const nodeKind = node.kind ?? 'unknown'
    if (!Array.isArray(node.observations)) continue

    for (const obs of node.observations) {
      const label = obs.label ?? `${nodeKind} observation`
      const props = obs.properties ?? {}
      const propSummary = Object.entries(props)
        .slice(0, 8)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`)
        .join(' ')

      // Heuristic severity bump: if observation mentions crypto/secret/etc.,
      // flag as medium. This is the start of vulnerability-pattern detection.
      const text = `${label} ${propSummary}`.toLowerCase()
      let severity: Severity = 'info'
      let category: FindingCategory = 'other'
      if (text.includes('sha1') || text.includes('md5') || text.includes('secret') || text.includes('password') || text.includes('api_key') || text.includes('api-key') || text.includes('token')) {
        severity = 'medium'
        category = 'crypto'
      } else if (text.includes('http://') || text.includes('cleartext') || text.includes('fetch(') || text.includes('xmlhttprequest')) {
        severity = 'low'
        category = 'network'
      } else if (nodeKind === 'artifact') {
        category = 'behavior'
      }

      out.push({
        category,
        severity,
        title: label,
        description: propSummary || `Observation on ${nodeKind} node ${nodeId.slice(0, 16)}`,
        evidence: [{
          kind: 'symbol',
          snippet: nodeId,
          location: nodeKind,
        }],
      })

      // Cap at 50 observations per job so a huge graph doesn't overwhelm the UI.
      if (out.length >= 50) return out
    }
  }
  return out
}

function normalizeSeverity(s: string): Severity {
  const v = String(s).toLowerCase()
  if (['critical', 'crit'].includes(v)) return 'critical'
  if (['high', 'warning'].includes(v)) return 'high'
  if (['medium', 'moderate'].includes(v)) return 'medium'
  if (['low'].includes(v)) return 'low'
  return 'info'
}

function normalizeCategory(c: string): FindingCategory {
  const v = String(c).toLowerCase()
  if (['api', 'endpoint'].includes(v)) return 'api'
  if (['network', 'traffic'].includes(v)) return 'network'
  if (['crypto', 'cryptography'].includes(v)) return 'crypto'
  if (['permission', 'manifest'].includes(v)) return 'permission'
  if (['behavior', 'runtime'].includes(v)) return 'behavior'
  if (['string', 'strings'].includes(v)) return 'string'
  return 'other'
}

function normalizeEvidenceKind(k: string): Evidence['kind'] {
  const v = String(k).toLowerCase()
  if (['code', 'snippet', 'source'].includes(v)) return 'code'
  if (['url', 'uri', 'link'].includes(v)) return 'url'
  if (['header', 'headers'].includes(v)) return 'header'
  if (['permission', 'perm'].includes(v)) return 'permission'
  if (['symbol', 'addr', 'address', 'offset'].includes(v)) return 'symbol'
  if (['string', 'str', 'literal'].includes(v)) return 'string'
  if (['file', 'path'].includes(v)) return 'file'
  return 'code'
}

// ─── Audit log ──────────────────────────────────────────────────────────────

async function writeAuditLog(jobId: string, event: string, payload: Record<string, unknown>) {
  try {
    await (db as any).auditLog.create({
      data: { jobId, event, payload: JSON.stringify(payload) },
    })
  } catch (err) {
    console.warn(`[runner] audit log write failed for ${jobId}:`, err)
  }
}

// Used by the readiness endpoint.
export function getEnabledTargetTypes(): TargetType[] {
  return (Object.entries(COMMAND_BY_TARGET) as [TargetType, typeof COMMAND_BY_TARGET[TargetType]][])
    .filter(([, c]) => c.enabled)
    .map(([t]) => t)
}

export function getTargetConfig(targetType: TargetType) {
  return COMMAND_BY_TARGET[targetType]
}
