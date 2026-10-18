import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULTS: Record<string, string> = {
  reaBinaryPath: 'npx rea-agents@latest',
  workerUrl: '',
  defaultAudience: 'developer',
  demoMode: 'true',
}

export async function GET() {
  const rows = await db.setting.findMany()
  const settings: Record<string, string> = { ...DEFAULTS }
  for (const r of rows) settings[r.key] = r.value
  return NextResponse.json({ settings })
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
  }
  const ops = Object.entries(body).map(([key, value]) =>
    db.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    }),
  )
  await Promise.all(ops)
  return NextResponse.json({ ok: true })
}
