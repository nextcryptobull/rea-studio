import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { FindingDTO, JobDTO } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jobToDTO(job: any): JobDTO {
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

function findingToDTO(f: any): FindingDTO {
  let evidence: any[] = []
  try {
    evidence = JSON.parse(f.evidence || '[]')
  } catch {
    evidence = []
  }
  return {
    id: f.id,
    jobId: f.jobId,
    category: f.category,
    severity: f.severity,
    title: f.title,
    description: f.description,
    evidence,
    createdAt: f.createdAt.toISOString(),
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const job = await db.job.findUnique({
    where: { id },
    include: {
      _count: { select: { findings: true } },
      findings: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    job: jobToDTO(job),
    log: job.log,
    findings: job.findings.map(findingToDTO),
  })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  await db.job.deleteMany({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
