'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/types'

const MAP: Record<Severity, { cls: string; label: string }> = {
  critical: { cls: 'bg-sev-critical border-sev-critical sev-critical', label: 'CRITICAL' },
  high: { cls: 'bg-sev-high border-sev-high sev-high', label: 'HIGH' },
  medium: { cls: 'bg-sev-medium border-sev-medium sev-medium', label: 'MEDIUM' },
  low: { cls: 'bg-sev-low border-sev-low sev-low', label: 'LOW' },
  info: { cls: 'bg-sev-info border-sev-info sev-info', label: 'INFO' },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = MAP[severity] ?? MAP.info
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-[10px] font-semibold tracking-wider', m.cls)}
    >
      {m.label}
    </Badge>
  )
}
