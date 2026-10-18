import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { startJobRunner } from '@/lib/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/jobs/[id]/start — kick off the in-process analysis runner for a job.
// Returns 200 immediately; the runner streams progress + findings into the DB
// over the next several seconds. The UI polls GET /api/jobs/[id] to see updates.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const job = await db.job.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status === 'running') {
    return NextResponse.json({ ok: true, alreadyRunning: true })
  }
  startJobRunner(id)
  return NextResponse.json({ ok: true })
}
