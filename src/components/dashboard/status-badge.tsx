'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@/lib/types'

const MAP: Record<JobStatus, { dot: string; label: string; cls: string }> = {
  queued:    { dot: 'bg-muted-foreground',                  label: 'QUEUED',    cls: 'text-muted-foreground border-muted-foreground/40' },
  running:   { dot: 'bg-emerald-400 animate-pulse',          label: 'RUNNING',   cls: 'text-emerald-400 border-emerald-400/40' },
  done:      { dot: 'bg-emerald-500',                        label: 'DONE',      cls: 'text-emerald-500 border-emerald-500/40' },
  failed:    { dot: 'bg-red-500',                            label: 'FAILED',    cls: 'text-red-500 border-red-500/40' },
  cancelled: { dot: 'bg-amber-400',                          label: 'CANCELLED', cls: 'text-amber-400 border-amber-400/40' },
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const m = MAP[status] ?? MAP.queued
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-[10px] font-semibold tracking-wider gap-1.5', m.cls)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </Badge>
  )
}
