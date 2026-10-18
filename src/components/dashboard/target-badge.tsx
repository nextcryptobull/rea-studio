'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TargetType } from '@/lib/types'

const MAP: Record<TargetType, { label: string; cls: string; icon: string }> = {
  website: { label: 'WEB',    cls: 'text-emerald-400 border-emerald-400/40', icon: '◆' },
  apk:     { label: 'APK',    cls: 'text-amber-400 border-amber-400/40',     icon: '▤' },
  binary:  { label: 'BINARY', cls: 'text-orange-400 border-orange-400/40',   icon: '⚙' },
}

export function TargetBadge({ type }: { type: TargetType }) {
  const m = MAP[type] ?? MAP.website
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-[10px] font-semibold tracking-wider gap-1', m.cls)}
    >
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </Badge>
  )
}
