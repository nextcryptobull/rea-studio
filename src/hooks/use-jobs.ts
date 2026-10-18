'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  FindingDTO,
  JobDTO,
  ReportAudience,
  ReportDTO,
  TargetType,
} from '@/lib/types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(e.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const r = await fetch('/api/jobs')
      return json<{ jobs: JobDTO[] }>(r).then((d) => d.jobs)
    },
    refetchInterval: 1500, // light polling — picks up runner updates from the DB
  })
}

export function useJobDetail(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const r = await fetch(`/api/jobs/${jobId}`)
      return json<{ job: JobDTO; log: string; findings: FindingDTO[] }>(r)
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data
      // Stop polling once the job is terminal.
      if (data && ['done', 'failed', 'cancelled'].includes(data.job.status)) {
        return false
      }
      return 1000
    },
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { targetType: TargetType; target: string; label?: string }) => {
      const r = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      return json<{ job: JobDTO }>(r).then((d) => d.job)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useDeleteJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) => {
      const r = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      return json<{ ok: boolean }>(r)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useReports(jobId: string | null) {
  return useQuery({
    queryKey: ['reports', jobId],
    queryFn: async () => {
      const r = await fetch(`/api/jobs/${jobId}/reports`)
      return json<{ reports: ReportDTO[] }>(r).then((d) => d.reports)
    },
    enabled: !!jobId,
  })
}

export function useGenerateReport(jobId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (audience: ReportAudience) => {
      if (!jobId) throw new Error('No job selected')
      const r = await fetch(`/api/jobs/${jobId}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audience }),
      })
      return json<{ report: ReportDTO }>(r).then((d) => d.report)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', jobId] })
    },
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const r = await fetch('/api/settings')
      return json<{ settings: Record<string, string> }>(r).then((d) => d.settings)
    },
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Record<string, string>) => {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })
      return json<{ ok: boolean }>(r)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
