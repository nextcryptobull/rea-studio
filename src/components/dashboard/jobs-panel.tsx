'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import { useJobs, useDeleteJob } from '@/hooks/use-jobs'
import { useApp } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { StatusBadge } from './status-badge'
import { TargetBadge } from './target-badge'
import type { JobDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function JobsPanel() {
  const jobsQ = useJobs()
  const selectedId = useApp((s) => s.selectedJobId)
  const selectJob = useApp((s) => s.selectJob)
  const setTab = useApp((s) => s.setTab)

  if (jobsQ.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (jobsQ.data && jobsQ.data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-10 pb-10 flex flex-col items-center gap-3 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium">No jobs yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Submit a target from the <button onClick={() => setTab('submit')} className="text-emerald-400 underline">Submit</button> tab.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Jobs</h2>
        <span className="text-xs text-muted-foreground font-mono">
          {jobsQ.data?.length ?? 0} total
        </span>
      </div>
      <div className="grid gap-2">
        {jobsQ.data?.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            selected={selectedId === job.id}
            onSelect={() => { selectJob(job.id); setTab('jobs') }}
          />
        ))}
      </div>
    </div>
  )
}

function JobRow({ job, selected, onSelect }: {
  job: JobDTO
  selected: boolean
  onSelect: () => void
}) {
  const del = useDeleteJob()
  const selectJob = useApp((s) => s.selectJob)
  const { toast } = useToast()
  const [confirming, setConfirming] = React.useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 2500)
      return
    }
    try {
      await del.mutateAsync(job.id)
      if (selected) selectJob(null)
      toast({ title: 'Job deleted', description: job.target })
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent/40',
        selected && 'ring-1 ring-emerald-400/40 bg-accent/30',
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <TargetBadge type={job.targetType} />
              <StatusBadge status={job.status} />
              {job.engine && (
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  · {job.engine}
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground">
                {new Date(job.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="font-mono text-sm truncate text-foreground">{job.target}</p>
            {job.label && (
              <p className="text-xs text-muted-foreground mt-0.5">{job.label}</p>
            )}
            {job.status === 'running' && (
              <div className="mt-3 space-y-1.5">
                <Progress value={job.progress} className="h-1" />
                <p className="text-[11px] font-mono text-emerald-400 truncate">
                  {job.progress < 80 ? 'analyzing target…' : 'recording findings…'}
                </p>
              </div>
            )}
            {job.status === 'failed' && job.error && (
              <p className="text-[11px] text-red-500 mt-2 font-mono truncate">{job.error}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-xs font-mono">
                <span className="text-foreground">{job.findingCount}</span>
                <span className="text-muted-foreground"> findings</span>
              </p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{job.progress}%</p>
            </div>
            <Button
              size="icon"
              variant={confirming ? 'destructive' : 'ghost'}
              className="h-8 w-8"
              onClick={handleDelete}
              title={confirming ? 'Click again to confirm' : 'Delete job'}
            >
              {del.isPending && del.variables === job.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
