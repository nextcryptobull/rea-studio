import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateRetailoredReport } from '@/lib/ai'
import type { FindingDTO, ReportAudience, ReportDTO, TargetType } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_AUDIENCES: ReportAudience[] = ['developer', 'executive', 'qa', 'auditor']

function reportToDTO(r: any): ReportDTO {
  return {
    id: r.id,
    jobId: r.jobId,
    audience: r.audience,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
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
  const reports = await db.report.findMany({
    where: { jobId: id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ reports: reports.map(reportToDTO) })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const audience = body?.audience as ReportAudience
  if (!audience || !VALID_AUDIENCES.includes(audience)) {
    return NextResponse.json({ error: 'audience must be one of: developer, executive, qa, auditor' }, { status: 400 })
  }

  const job = await db.job.findUnique({
    where: { id },
    include: { findings: true },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'done') {
    return NextResponse.json({ error: `Job is ${job.status}, not done. Wait for analysis to finish before generating a report.` }, { status: 409 })
  }

  const findings = job.findings.map(findingToDTO)
  const content = await generateRetailoredReport({
    targetType: job.targetType as TargetType,
    target: job.target,
    audience,
    findings,
  })

  const report = await db.report.create({
    data: { jobId: id, audience, content },
  })
  return NextResponse.json({ report: reportToDTO(report) }, { status: 201 })
}
