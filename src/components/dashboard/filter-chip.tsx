'use client'

import { cn } from '@/lib/utils'

export function FilterChip({ label, active, onClick }: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider border transition-colors',
        active
          ? 'bg-emerald-400/15 border-emerald-400/60 text-emerald-400'
          : 'border-border/60 text-muted-foreground hover:bg-accent/40',
      )}
    >
      {label}
    </button>
  )
}
