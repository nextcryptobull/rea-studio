'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Terminal,
  Filter,
  Ban,
  Cpu,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { useJobDetail, useGenerateReport, useReports } from '@/hooks/use-jobs'
import { cancelJob } from '@/hooks/use-socket'
import { useApp } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { StatusBadge } from './status-badge'
import { TargetBadge } from './target-badge'
import { SeverityBadge } from './severity-badge'
import { FilterChip } from './filter-chip'
import type { FindingCategory, FindingDTO, ReportAudience } from '@/lib/types'
import { cn } from '@/lib/utils'

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

const SEVERITY_FILTERS = ['critical', 'high', 'medium', 'low', 'info'] as const
const CATEGORY_FILTERS: FindingCategory[] = [
  'api', 'network', 'crypto', 'permission', 'behavior', 'string', 'other',
]

export function JobDetail({ jobId }: { jobId: string }) {
  const { data, isLoading, isError, error } = useJobDetail(jobId)
  const selectJob = useApp((s) => s.selectJob)
  const reportsQ = useReports(jobId)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {isError ? (error as Error).message : 'Job not found.'}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => selectJob(null)}>
            Back
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { job, log, findings } = data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => selectJob(null)}
        >
          <ArrowLeft className="h-4 w-4" /> All jobs
        </Button>
        {job.status === 'running' && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-amber-400 border-amber-400/40 hover:bg-amber-400/10"
            onClick={() => cancelJob(jobId)}
          >
            <Ban className="h-3.5 w-3.5" /> Cancel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <TargetBadge type={job.targetType} />
                <StatusBadge status={job.status} />
                {job.engine && (
                  <Badge variant="outline" className="font-mono text-[10px] gap-1">
                    <Cpu className="h-3 w-3" /> {job.engine}
                  </Badge>
                )}
              </div>
              <p className="font-mono text-lg text-foreground break-all">{job.target}</p>
              {job.label && (
                <p className="text-sm text-muted-foreground mt-1">{job.label}</p>
              )}
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground space-y-1">
              <div className="flex items-center justify-end gap-1.5">
                <Clock className="h-3 w-3" />
                {new Date(job.createdAt).toLocaleString()}
              </div>
              <div>{findings.length} findings</div>
              <div>job id: {job.id}</div>
            </div>
          </div>

          {job.status === 'running' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-400">analyzing…</span>
                <span className="text-muted-foreground">{job.progress}%</span>
              </div>
              <Progress value={job.progress} className="h-1.5" />
            </div>
          )}

          {job.status === 'failed' && job.error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-xs font-mono text-red-400">
              {job.error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4 text-emerald-400" /> Live log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LogViewer log={log} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-emerald-400" /> Retailored reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReportGenerator jobId={jobId} disabled={job.status !== 'done'} />
            <Separator />
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
              {reportsQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {reportsQ.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No reports yet. Generate one above.
                </p>
              )}
              {reportsQ.data?.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-border/60 p-2.5 text-xs hover:bg-accent/40 cursor-pointer"
                  onClick={() => useApp.getState().setTab('reports')}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono uppercase tracking-wider text-emerald-400 text-[10px]">
                      {r.audience}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-foreground line-clamp-2">{r.content.split('\n')[0]}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <FindingsForJob findings={findings} />
    </div>
  )
}

function LogViewer({ log }: { log: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [log])
  const lines = log.split('\n').filter(Boolean)
  return (
    <div
      ref={ref}
      className="h-72 overflow-y-auto scrollbar-thin font-mono text-xs space-y-0.5 bg-black/30 rounded-md p-3 border border-border/40"
    >
      {lines.length === 0 ? (
        <p className="text-muted-foreground italic">Waiting for output…</p>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground/50 select-none w-8 text-right shrink-0">
              {i + 1}
            </span>
            <span
              className={cn(
                'text-foreground/90 break-all',
                line.includes('error') && 'text-red-400',
                line.includes('complete') && 'text-emerald-400',
                line.includes('finding') && 'text-amber-400',
              )}
            >
              {line}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function ReportGenerator({ jobId, disabled }: { jobId: string; disabled: boolean }) {
  const [audience, setAudience] = React.useState<ReportAudience>('developer')
  const gen = useGenerateReport(jobId)
  const setTab = useApp((s) => s.setTab)
  const selectReport = useApp((s) => s.selectReport)
  const { toast } = useToast()

  async function handleGenerate() {
    try {
      const r = await gen.mutateAsync(audience)
      selectReport(r.id)
      setTab('reports')
      toast({ title: 'Report generated', description: `Audience: ${audience}` })
    } catch (e) {
      toast({
        title: 'Generation failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-2">
      <Select value={audience} onValueChange={(v) => setAudience(v as ReportAudience)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="developer">Developer (technical)</SelectItem>
          <SelectItem value="executive">Executive (business)</SelectItem>
          <SelectItem value="qa">QA (test plan)</SelectItem>
          <SelectItem value="auditor">Auditor (compliance)</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="w-full gap-2"
        onClick={handleGenerate}
        disabled={disabled || gen.isPending}
      >
        {gen.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {disabled ? 'Waiting for analysis…' : 'Generate report'}
      </Button>
    </div>
  )
}

function FindingsForJob({ findings }: { findings: FindingDTO[] }) {
  const [activeSev, setActiveSev] = React.useState<Set<string>>(new Set())
  const [activeCat, setActiveCat] = React.useState<Set<string>>(new Set())

  const filtered = findings.filter(
    (f) =>
      (activeSev.size === 0 || activeSev.has(f.severity)) &&
      (activeCat.size === 0 || activeCat.has(f.category)),
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-emerald-400" /> Findings
          <span className="text-muted-foreground font-normal text-xs">
            {filtered.length} / {findings.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {SEVERITY_FILTERS.map((s) => (
            <FilterChip
              key={s}
              label={s}
              active={activeSev.has(s)}
              onClick={() => setActiveSev((prev) => toggle(prev, s))}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((c) => (
            <FilterChip
              key={c}
              label={c}
              active={activeCat.has(c)}
              onClick={() => setActiveCat((prev) => toggle(prev, c))}
            />
          ))}
        </div>
        <Separator />
        <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No findings match the current filter.
            </p>
          ) : (
            filtered.map((f) => <FindingCard key={f.id} finding={f} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FindingCard({ finding }: { finding: FindingDTO }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div
      className="rounded-md border border-border/60 hover:border-emerald-400/30 transition-colors cursor-pointer"
      onClick={() => setOpen((v) => !v)}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <SeverityBadge severity={finding.severity} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">{finding.title}</p>
            <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-muted-foreground">
              <span className="uppercase tracking-wider">{finding.category}</span>
              <span>·</span>
              <span>{new Date(finding.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
          <ExternalLink className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        </div>
        {open && (
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-foreground/80 leading-relaxed">{finding.description}</p>
            {finding.evidence.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Evidence
                </p>
                {finding.evidence.map((e, i) => (
                  <div key={i} className="bg-black/40 border border-border/40 rounded p-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-emerald-400 uppercase text-[10px]">{e.kind}</span>
                      {e.location && (
                        <span className="text-muted-foreground text-[10px]">{e.location}</span>
                      )}
                    </div>
                    <pre className="text-foreground/90 whitespace-pre-wrap break-all">{e.snippet}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
