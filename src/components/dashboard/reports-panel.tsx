'use client'

import * as React from 'react'
import { useQueries } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Inbox, FileText, Download, ArrowLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useJobs } from '@/hooks/use-jobs'
import { useApp } from '@/lib/store'
import type { ReportDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ReportsPanel() {
  const jobsQ = useJobs()
  const selectedReportId = useApp((s) => s.selectedReportId)
  const selectReport = useApp((s) => s.selectReport)
  const setTab = useApp((s) => s.setTab)

  const doneJobs = (jobsQ.data ?? []).filter((j) => j.status === 'done')
  const reportsByJob = useAllReports(doneJobs)

  const allReports = reportsByJob
    .filter((r) => r.data)
    .flatMap((r) => r.data!)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (jobsQ.isLoading) return <Skeleton className="h-64 w-full" />

  if (doneJobs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-10 pb-10 flex flex-col items-center gap-3 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium">No reports yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete an analysis first, then generate a report from the job detail view.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const selected = selectedReportId ? allReports.find((r) => r.id === selectedReportId) : allReports[0]

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1 h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-emerald-400" /> Reports
            <span className="text-muted-foreground font-normal text-xs ml-1">
              {allReports.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[calc(100vh-280px)] min-h-[300px]">
            <div className="space-y-1">
              {allReports.map((r) => {
                const job = jobsQ.data?.find((j) => j.id === r.jobId)
                return (
                  <button
                    key={r.id}
                    onClick={() => selectReport(r.id)}
                    className={cn(
                      'w-full text-left p-2.5 rounded-md transition-colors',
                      selected?.id === r.id
                        ? 'bg-emerald-400/15 ring-1 ring-emerald-400/40'
                        : 'hover:bg-accent/40',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider text-emerald-400 border-emerald-400/40">
                        {r.audience}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {job?.target ?? r.jobId}
                    </p>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">
            {selected ? `Report · ${selected.audience}` : 'Select a report'}
          </CardTitle>
          {selected && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => { useApp.getState().selectJob(selected.jobId); setTab('jobs') }}
              >
                <ArrowLeft className="h-3 w-3" /> Source job
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => downloadMarkdown(selected.content, `report-${selected.id}.md`)}
              >
                <Download className="h-3 w-3" /> .md
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selected ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-foreground mb-3 mt-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold text-foreground mt-5 mb-2 pb-1 border-b border-border/40">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-4 mb-1.5">{children}</h3>,
                  p: ({ children }) => <p className="text-sm text-foreground/80 leading-relaxed my-2">{children}</p>,
                  ul: ({ children }) => <ul className="text-sm text-foreground/80 my-2 space-y-1 list-disc pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="text-sm text-foreground/80 my-2 space-y-1 list-decimal pl-5">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="text-muted-foreground">{children}</em>,
                  code: ({ children }) => <code className="font-mono text-[12px] bg-black/40 text-emerald-400 px-1.5 py-0.5 rounded">{children}</code>,
                  pre: ({ children }) => <pre className="font-mono text-xs bg-black/40 border border-border/40 rounded-md p-3 my-3 overflow-x-auto scrollbar-thin">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-emerald-400/60 pl-3 italic text-muted-foreground my-3">{children}</blockquote>,
                  hr: () => <hr className="border-border/40 my-4" />,
                }}
              >
                {selected.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a report on the left.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function useAllReports(jobs: { id: string }[]) {
  return useQueries({
    queries: jobs.map((j) => ({
      queryKey: ['reports', j.id],
      queryFn: async () => {
        const r = await fetch(`/api/jobs/${j.id}/reports`)
        const d = await r.json()
        return (d.reports ?? []) as ReportDTO[]
      },
    })),
  })
}
