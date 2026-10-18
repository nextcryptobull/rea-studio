import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = process.env.REA_UPLOAD_DIR
  ? resolve(process.env.REA_UPLOAD_DIR)
  : resolve(process.cwd(), 'uploads')

const MAX_UPLOAD_BYTES = Number(process.env.REA_MAX_UPLOAD_MB ?? 200) * 1024 * 1024

// POST /api/upload — multipart file upload for APK / binary targets.
//
// The runner's path-safety check requires filesystem targets to live under
// REA_UPLOAD_DIR. This endpoint enforces that: the file is written to
// `<UPLOAD_DIR>/<uuid>-<safe-filename>` and the absolute path is returned.
//
// The frontend doesn't currently call this — the Submit panel still takes a
// string path. When you wire APK / binary support into the UI, replace the
// "Path or filename" input with a file picker that POSTs here first.
//
// Phase 6 hardening:
//   - Filename is sanitized to remove path traversal attempts
//   - File size capped at REA_MAX_UPLOAD_MB (default 200MB)
//   - Every upload is logged to the AuditLog table
//   - Uploads dir is created on first request

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded (expected multipart field "file")' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({
        error: `Uploaded file is ${(file.size / 1024 / 1024).toFixed(1)}MB; max is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB. Set REA_MAX_UPLOAD_MB to raise the limit.`,
      }, { status: 413 })
    }

    // Sanitize the filename: keep only the basename, strip path separators,
    // replace anything that isn't [a-zA-Z0-9._-]
    const safeBase = (file.name || 'upload').replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const storedName = `${randomUUID()}-${safeBase}`
    const storedPath = resolve(UPLOAD_DIR, storedName)

    // Final sanity check: resolved path must be inside UPLOAD_DIR
    const rel = relative(UPLOAD_DIR, storedPath)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return NextResponse.json({ error: 'Resolved path escapes upload dir' }, { status: 400 })
    }

    await mkdir(UPLOAD_DIR, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(storedPath, buffer)

    // Audit log
    try {
      await (db as any).auditLog.create({
        data: {
          jobId: null,
          event: 'upload',
          payload: JSON.stringify({
            originalName: file.name,
            storedName,
            storedPath,
            bytes: file.size,
            mimeType: file.type,
          }),
        },
      })
    } catch (e) {
      console.warn('[upload] audit log write failed:', e)
    }

    return NextResponse.json({
      path: storedPath,
      filename: file.name,
      bytes: file.size,
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
