'use client'

import * as React from 'react'
import { useApp } from '@/lib/store'
import { Sidebar } from '@/components/dashboard/sidebar'
import { SubmitPanel } from '@/components/dashboard/submit-panel'
import { JobsPanel } from '@/components/dashboard/jobs-panel'
import { JobDetail } from '@/components/dashboard/job-detail'
import { FindingsPanel } from '@/components/dashboard/findings-panel'
import { ReportsPanel } from '@/components/dashboard/reports-panel'
import { SettingsPanel } from '@/components/dashboard/settings-panel'

export default function Home() {
  const activeTab = useApp((s) => s.activeTab)
  const selectedJobId = useApp((s) => s.selectedJobId)

  return (
    <div className="flex h-screen min-h-screen bg-background text-foreground grid-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border/40 px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-tight">
              {activeTab === 'submit' && 'Submit new analysis'}
              {activeTab === 'jobs' && (selectedJobId ? 'Job detail' : 'Jobs')}
              {activeTab === 'findings' && 'Findings'}
              {activeTab === 'reports' && 'Retailored reports'}
              {activeTab === 'settings' && 'Settings'}
            </h1>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            reverse-engineer anything · web ui
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-6xl p-6">
            {activeTab === 'submit' && <SubmitPanel />}
            {activeTab === 'jobs' && (selectedJobId ? <JobDetail jobId={selectedJobId} /> : <JobsPanel />)}
            {activeTab === 'findings' && <FindingsPanel />}
            {activeTab === 'reports' && <ReportsPanel />}
            {activeTab === 'settings' && <SettingsPanel />}
          </div>
        </div>
      </main>
    </div>
  )
}
