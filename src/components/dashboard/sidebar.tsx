'use client'

import * as React from 'react'
import { Rocket, ListChecks, Filter, FileText, Settings, Github } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp, type TabId } from '@/lib/store'
import { useJobs } from '@/hooks/use-jobs'

const NAV: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'submit',   label: 'Submit',   icon: Rocket,     desc: 'New analysis' },
  { id: 'jobs',     label: 'Jobs',     icon: ListChecks, desc: 'Live job stream' },
  { id: 'findings', label: 'Findings', icon: Filter,     desc: 'All findings' },
  { id: 'reports',  label: 'Reports',  icon: FileText,   desc: 'Retailored reports' },
  { id: 'settings', label: 'Settings', icon: Settings,   desc: 'Worker & AI config' },
]

export function Sidebar() {
  const activeTab = useApp((s) => s.activeTab)
  const setTab = useApp((s) => s.setTab)
  const jobsQ = useJobs()
  const runningCount = (jobsQ.data ?? []).filter((j) => j.status === 'running').length
  const doneCount = (jobsQ.data ?? []).filter((j) => j.status === 'done').length

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border/40 bg-sidebar/40">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border/40">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-400/15 ring-1 ring-emerald-400/40">
          <span className="font-mono text-emerald-400 text-sm font-bold">R</span>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">REA Studio</div>
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            v0.1 · in-process
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          const badge =
            item.id === 'jobs' && runningCount > 0
              ? `${runningCount}`
              : item.id === 'findings' && doneCount > 0
                ? `${doneCount}`
                : null
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'group w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-emerald-400/15 text-emerald-400'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-emerald-400' : 'text-muted-foreground group-hover:text-foreground')} />
              <span className="flex-1 text-left">{item.label}</span>
              {badge && (
                <span className={cn(
                  'text-[10px] font-mono px-1.5 py-0.5 rounded',
                  active ? 'bg-emerald-400/20 text-emerald-400' : 'bg-muted-foreground/15 text-muted-foreground',
                )}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-border/40 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
          <span className="text-muted-foreground">Runner</span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ready
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
          <span className="text-muted-foreground">Engine</span>
          <span className="text-emerald-400">in-process</span>
        </div>
      </div>

      <div className="border-t border-border/40 px-4 py-3">
        <a
          href="https://github.com/morluto/rea"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Github className="h-3.5 w-3.5" />
          REA on GitHub
        </a>
      </div>
    </aside>
  )
}
