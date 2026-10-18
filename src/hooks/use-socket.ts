'use client'

// Thin HTTP client helpers for kicking off / cancelling a job. Replaces the
// previous Socket.io-based worker communication — the in-process runner
// lives inside the Next.js app and writes progress / findings directly to the
// shared SQLite DB, so the frontend just polls.

export async function startJob(jobId: string) {
  try {
    await fetch(`/api/jobs/${jobId}/start`, { method: 'POST' })
  } catch (e) {
    console.error('startJob failed', e)
  }
}

export async function cancelJob(jobId: string) {
  try {
    await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
  } catch (e) {
    console.error('cancelJob failed', e)
  }
}
