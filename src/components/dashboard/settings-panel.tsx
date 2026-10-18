'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Cpu, Server, FileText, Beaker } from 'lucide-react'
import { useSettings, useSaveSettings } from '@/hooks/use-jobs'
import { useApp } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

export function SettingsPanel() {
  const settingsQ = useSettings()
  const save = useSaveSettings()
  const workerMode = useApp((s) => s.workerMode)
  const workerEngine = useApp((s) => s.workerEngine)
  const workerConnected = useApp((s) => s.workerConnected)
  const { toast } = useToast()

  const [draft, setDraft] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (settingsQ.data) setDraft(settingsQ.data)
  }, [settingsQ.data])

  if (settingsQ.isLoading || !settingsQ.data) {
    return <Skeleton className="h-64 w-full" />
  }

  function update(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    try {
      await save.mutateAsync(draft)
      toast({ title: 'Settings saved' })
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the worker connection and AI model. These values are stored in the local SQLite database.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4 text-emerald-400" /> Worker status
          </CardTitle>
          <CardDescription>Live status of the connected REA worker service</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Connection">
            <span className={`font-mono text-xs ${workerConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {workerConnected ? '● connected' : '○ disconnected'}
            </span>
          </Row>
          <Row label="Mode">
            <span className="font-mono text-xs uppercase tracking-wider">
              {workerMode === 'demo' ? (
                <span className="text-amber-400">DEMO (synthesized findings)</span>
              ) : (
                <span className="text-emerald-400">LIVE (real REA CLI)</span>
              )}
            </span>
          </Row>
          <Row label="Engine">
            <span className="font-mono text-xs">{workerEngine}</span>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-emerald-400" /> Worker configuration
          </CardTitle>
          <CardDescription>
            Where the dashboard sends analysis jobs. Leave blank to use the bundled Socket.io worker.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              REA binary path
            </Label>
            <Input
              value={draft.reaBinaryPath ?? ''}
              onChange={(e) => update('reaBinaryPath', e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Command used to invoke REA in <code>live</code> mode (e.g. <code>npx rea-agents@latest</code>)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              External worker URL (optional)
            </Label>
            <Input
              value={draft.workerUrl ?? ''}
              onChange={(e) => update('workerUrl', e.target.value)}
              placeholder="https://my-worker.example.com"
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              If set, jobs are dispatched to this remote worker instead of the bundled one. Useful when REA + Ghidra run on a separate VM.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/40 p-3">
            <div>
              <Label className="text-sm font-medium">Demo mode</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Synthesize realistic findings instead of invoking REA. Default ON so the UI works without <code className="font-mono">rea-agents</code> installed. Turn OFF to spawn the real CLI.
              </p>
            </div>
            <Switch
              checked={draft.demoMode === 'true'}
              onCheckedChange={(v) => update('demoMode', v ? 'true' : 'false')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-emerald-400" /> Report defaults
          </CardTitle>
          <CardDescription>Default audience for newly generated reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Default audience
            </Label>
            <Select
              value={draft.defaultAudience ?? 'developer'}
              onValueChange={(v) => update('defaultAudience', v)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="developer">Developer (technical)</SelectItem>
                <SelectItem value="executive">Executive (business)</SelectItem>
                <SelectItem value="qa">QA (test plan)</SelectItem>
                <SelectItem value="auditor">Auditor (compliance)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Beaker className="h-4 w-4 text-emerald-400" /> Deployment notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>
            This dashboard deploys to any Next.js-compatible host (Vercel, Render, Railway, fly.io). The dashboard itself needs only Node 20+ and ~512 MB RAM.
          </p>
          <p>
            The worker is heavier — it shells out to <code className="font-mono">rea-agents</code> which in turn drives Ghidra (for ELF/PE/Mach-O) and JADX (for APKs). For desktop binaries and APKs, deploy the worker to a host with &gt;= 4 GB RAM and Java 17+ installed.
          </p>
          <p>
            For websites-only analysis, the worker runs fine on the same host as the dashboard.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
