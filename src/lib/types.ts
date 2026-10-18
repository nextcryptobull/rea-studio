// Shared types used across the dashboard UI, API routes, and worker service.

export type TargetType = 'website' | 'apk' | 'binary'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export type FindingCategory =
  | 'api'
  | 'network'
  | 'crypto'
  | 'permission'
  | 'behavior'
  | 'string'
  | 'other'

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type ReportAudience = 'developer' | 'executive' | 'qa' | 'auditor'

export type Evidence = {
  kind: 'code' | 'url' | 'header' | 'permission' | 'symbol' | 'string' | 'file'
  snippet: string
  location?: string
}

export type JobDTO = {
  id: string
  targetType: TargetType
  target: string
  label: string | null
  status: JobStatus
  progress: number
  engine: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  findingCount: number
}

export type FindingDTO = {
  id: string
  jobId: string
  category: FindingCategory
  severity: Severity
  title: string
  description: string
  evidence: Evidence[]
  createdAt: string
}

export type ReportDTO = {
  id: string
  jobId: string
  audience: ReportAudience
  content: string
  createdAt: string
}

// Socket.io events — kept in sync between client and worker.
export type ClientToServerEvents = {
  'job:start': (payload: { jobId: string }) => void
  'job:cancel': (payload: { jobId: string }) => void
}

export type ServerToClientEvents = {
  'job:progress': (payload: { jobId: string; progress: number; line: string }) => void
  'job:finding': (payload: { jobId: string; finding: Omit<FindingDTO, 'id' | 'jobId' | 'createdAt'> }) => void
  'job:done': (payload: { jobId: string; engine: string | null }) => void
  'job:error': (payload: { jobId: string; message: string }) => void
  'worker:status': (payload: { mode: 'demo' | 'live'; engine: string; ready: boolean }) => void
}
