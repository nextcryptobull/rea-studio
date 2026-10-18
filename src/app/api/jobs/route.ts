import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { JobDTO, TargetType } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TARGETS: TargetType[] = ['website', 'apk', 'binary']

function toDTO(job: any): JobDTO {
  return {
    id: job.id,
    targetType: job.targetType,
    target: job.target,
    label: job.label ?? null,
    status: job.status,
    progress: job.progress,
    engine: job.engine ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    findingCount: job._count?.findings ?? 0,
  }
}

// GET /api/jobs — list most recent first
export async function GET() {
  const jobs = await db.job.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { findings: true } } },
    take: 200,
  })
  return NextResponse.json({ jobs: jobs.map(toDTO) })
}

// POST /api/jobs — create a new job (does NOT trigger the worker; the UI
// does that via socket.io after the POST returns the job id)
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { targetType, target, label } = body ?? {}
  if (!targetType || !VALID_TARGETS.includes(targetType)) {
    return NextResponse.json({ error: 'targetType must be one of: website, apk, binary' }, { status: 400 })
  }
  if (!target || typeof target !== 'string' || target.trim().length === 0) {
    return NextResponse.json({ error: 'target must be a non-empty string' }, { status: 400 })
  }
  // For website targets, accept EITHER a URL (https://...) OR an absolute
  // filesystem path (for live-mode analysis of a downloaded site). URLs work
  // in demo mode; paths are required for live mode (REA's CLI doesn't fetch URLs).
  if (targetType === 'website') {
    const trimmed = target.trim()
    const isUrl = /^https?:\/\//.test(trimmed)
    const isAbsPath = trimmed.startsWith('/')
    if (!isUrl && !isAbsPath) {
      return NextResponse.json(
        { error: 'target must be a URL (https://...) or an absolute path (/...)' },
        { status: 400 },
      )
    }
    if (isUrl) {
      try {
        new URL(trimmed)
      } catch {
        return NextResponse.json({ error: 'target is not a valid URL' }, { status: 400 })
      }
    }
  }

  const job = await db.job.create({
    data: {
      targetType,
      target: target.trim(),
      label: typeof label === 'string' && label.trim() ? label.trim() : null,
      status: 'queued',
      progress: 0,
      log: '',
    },
    include: { _count: { select: { findings: true } } },
  })
  return NextResponse.json({ job: toDTO(job) }, { status: 201 })
}
