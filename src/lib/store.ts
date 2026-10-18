'use client'

import { create } from 'zustand'

export type TabId = 'submit' | 'jobs' | 'findings' | 'reports' | 'settings'

type State = {
  activeTab: TabId
  selectedJobId: string | null
  selectedReportId: string | null
  workerConnected: boolean
  workerMode: 'demo' | 'live'
  workerEngine: string
  // ephemeral toasts published by the socket layer for any panel to render
  lastEvent: { kind: string; jobId?: string; message: string; at: number } | null

  setTab: (t: TabId) => void
  selectJob: (id: string | null) => void
  selectReport: (id: string | null) => void
  setWorker: (s: { connected?: boolean; mode?: 'demo' | 'live'; engine?: string }) => void
  publishEvent: (e: { kind: string; jobId?: string; message: string }) => void
}

export const useApp = create<State>((set) => ({
  activeTab: 'submit',
  selectedJobId: null,
  selectedReportId: null,
  workerConnected: false,
  workerMode: 'demo',
  workerEngine: 'static',
  lastEvent: null,

  setTab: (t) => set({ activeTab: t }),
  selectJob: (id) => set({ selectedJobId: id }),
  selectReport: (id) => set({ selectedReportId: id }),
  setWorker: (s) =>
    set((prev) => ({
      workerConnected: s.connected ?? prev.workerConnected,
      workerMode: s.mode ?? prev.workerMode,
      workerEngine: s.engine ?? prev.workerEngine,
    })),
  publishEvent: (e) => set({ lastEvent: { ...e, at: Date.now() } }),
}))
