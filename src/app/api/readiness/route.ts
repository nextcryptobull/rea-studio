import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { getEnabledTargetTypes, getTargetConfig } from '@/lib/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/readiness — checks whether the `rea` CLI is reachable and which
// target types are currently enabled in the runner. The Submit panel uses this
// to grey out the APK / Binary tabs until you've flipped `enabled: true` in
// src/lib/runner.ts.
//
// Returns 200 even if the CLI isn't installed — the body's `installed` field
// tells the client what to do.

export async function GET() {
  // 1. Static config: which target types are enabled in the runner code?
  const enabledTypes = getEnabledTargetTypes()
  const targetTypes = (['website', 'apk', 'binary'] as const).map((t) => ({
    type: t,
    enabled: enabledTypes.includes(t),
    needsJava: getTargetConfig(t).needsJava,
    command: getTargetConfig(t).command,
    maxRuntimeMs: getTargetConfig(t).maxRuntimeMs,
  }))

  // 2. Dynamic check: is the `rea` CLI actually installed and runnable?
  //    Spawn `rea --version` (or `npx rea-agents --version`) with a short
  //    timeout. Don't let this block the response for more than ~10s.
  const cliCheck = await checkCliInstalled(10_000)

  return NextResponse.json({
    installed: cliCheck.installed,
    version: cliCheck.version,
    installError: cliCheck.error,
    targetTypes,
    engine: process.env.REA_ENGINE_LABEL ?? 'in-process',
  })
}

async function checkCliInstalled(timeoutMs: number): Promise<{
  installed: boolean
  version: string | null
  error: string | null
}> {
  // Try the locally-installed `rea` binary first (fast). If not found, fall
  // back to `npx -y rea-agents@latest --version` which is slower but always
  // works.
  const attempts = [
    { binary: 'rea', args: ['--version'] },
    { binary: 'npx', args: ['-y', 'rea-agents@latest', '--version'] },
  ]

  for (const attempt of attempts) {
    try {
      const result = await runWithTimeout(attempt.binary, attempt.args, timeoutMs)
      if (result.exitCode === 0) {
        return {
          installed: true,
          version: result.stdout.trim().split('\n')[0] || null,
          error: null,
        }
      }
    } catch (err) {
      // Try the next attempt
      continue
    }
  }

  return {
    installed: false,
    version: null,
    error: 'Could not run `rea --version` or `npx rea-agents@latest --version`. Install with `npm install --global rea-agents`.',
  }
}

function runWithTimeout(binary: string, args: string[], timeoutMs: number): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGKILL')
        reject(new Error(`Timed out after ${timeoutMs}ms`))
      }
    }, timeoutMs)

    child.stdout.on('data', (c) => { stdout += c.toString() })
    child.stderr.on('data', (c) => { stderr += c.toString() })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ exitCode: code ?? 0, stdout, stderr })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
  })
}
