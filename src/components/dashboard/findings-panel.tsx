'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Inbox, Filter } from 'lucide-react'
import { useJobs, useJobDetail } from '@/hooks/use-jobs'
import { useApp } from '@/lib/store'
import { SeverityBadge } from './severity-badge'
import { TargetBadge } from './target-badge'
import { FilterChip } from './filter-chip'
import type { FindingDTO, FindingCategory, Severity } from '@/lib/types'

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

// Aggregates findings across all jobs and lets the user filter / jump to the
// source job.
export function FindingsPanel() {
  const jobsQ = useJobs()
  const setTab = useApp((s) => s.setTab)
  const selectJob = useApp((s) => s.selectJob)

  const allFindingsQ = useAggregatedFindings(jobsQ.data ?? [])

  const [activeSev, setActiveSev] = React.useState<Set<Severity>>(new Set())
  const [activeCat, setActiveCat] = React.useState<Set<FindingCategory>>(new Set())
  const [activeJob, setActiveJob] = React.useState<Set<string>>(new Set())

  const filtered = allFindingsQ.filter(
    (f) =>
      (activeSev.size === 0 || activeSev.has(f.severity)) &&
      (activeCat.size === 0 || activeCat.has(f.category)) &&
      (activeJob.size === 0 || activeJob.has(f.jobId)),
  )

  if (jobsQ.isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  if ((jobsQ.data ?? []).length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-10 pb-10 flex flex-col items-center gap-3 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium">No findings yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Submit a target from the{' '}
              <button onClick={() => setTab('submit')} className="text-emerald-400 underline">
                Submit
              </button>{' '}
              tab.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const allSev: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
  const allCat: FindingCategory[] = ['api', 'network', 'crypto', 'permission', 'behavior', 'string', 'other']

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">All findings</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Aggregated across {jobsQ.data?.length} job{jobsQ.data?.length === 1 ? '' : 's'}.
          Click a finding to open its source job.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="h-4 w-4 text-emerald-400" /> Filters
            <span className="text-muted-foreground font-normal text-xs ml-1">
              {filtered.length} shown
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {allSev.map((s) => (
              <FilterChip
                key={s}
                label={s}
                active={activeSev.has(s)}
                onClick={() => setActiveSev((prev) => toggle(prev, s))}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allCat.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={activeCat.has(c)}
                onClick={() => setActiveCat((prev) => toggle(prev, c))}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
              No findings match the current filter.
            </CardContent>
          </Card>
        ) : (
          filtered.map((f) => {
            const job = jobsQ.data?.find((j) => j.id === f.jobId)
            return (
              <Card
                key={f.id}
                className="cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => { selectJob(f.jobId); setTab('jobs') }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <SeverityBadge severity={f.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{f.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {job && <TargetBadge type={job.targetType} />}
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                          · {f.category}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground truncate">
                          · {job?.target}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

// Loads all jobs' findings in parallel. Fine for the typical "single user, a
// few hundred jobs" case; for a heavier deployment you'd want a dedicated
// /api/findings endpoint with server-side filtering.
function useAggregatedFindings(jobs: { id: string; status: string }[]) {
  const [findings, setFindings] = React.useState<FindingDTO[]>([])
  React.useEffect(() => {
    let cancelled = false
    const done = jobs.filter((j) => j.status === 'done')
    Promise.all(
      done.map(async (j) => {
        const r = await fetch(`/api/jobs/${j.id}`)
        if (!r.ok) return []
        const d = await r.json()
        return d.findings as FindingDTO[]
      }),
    ).then((rows) => {
      if (!cancelled) setFindings(rows.flat())
    })
    return () => { cancelled = true }
  }, [jobs.map((j) => `${j.id}:${j.status}`).join('|')])
  return findings
}
