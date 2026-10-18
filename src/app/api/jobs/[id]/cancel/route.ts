import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cancelJobRunner } from '@/lib/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/jobs/[id]/cancel — set the cancellation flag so the runner bails
// out at the next sleep boundary.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const job = await db.job.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  cancelJobRunner(id)
  return NextResponse.json({ ok: true })
}
