'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Rocket, Globe, Smartphone, Cpu, Loader2 } from 'lucide-react'
import { useCreateJob } from '@/hooks/use-jobs'
import { startJob } from '@/hooks/use-socket'
import { useApp } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import type { TargetType } from '@/lib/types'

const SAMPLE_TARGETS: Record<TargetType, string> = {
  website: 'https://example.com',
  apk:     '/uploads/com.example.app-2.4.1.apk',
  binary:  '/uploads/example-daemon',
}

const SAMPLE_LABELS: Record<TargetType, string> = {
  website: 'Example marketing site',
  apk:     'Example mobile app v2.4.1',
  binary:  'example-daemon',
}

export function SubmitPanel() {
  const [tab, setTab] = React.useState<TargetType>('website')
  const [target, setTarget] = React.useState('')
  const [label, setLabel] = React.useState('')
  const createJob = useCreateJob()
  const setAppTab = useApp((s) => s.setTab)
  const selectJob = useApp((s) => s.selectJob)
  const { toast } = useToast()

  function switchTab(t: TargetType) {
    setTab(t)
    setTarget('')
    setLabel('')
  }

  async function handleSubmit() {
    const t = target.trim() || SAMPLE_TARGETS[tab]
    const l = label.trim() || SAMPLE_LABELS[tab]
    try {
      const job = await createJob.mutateAsync({ targetType: tab, target: t, label: l })
      startJob(job.id)
      selectJob(job.id)
      setAppTab('jobs')
      toast({
        title: 'Job queued',
        description: `${tab.toUpperCase()} · ${t}`,
      })
      setTarget('')
      setLabel('')
    } catch (e) {
      toast({
        title: 'Failed to submit',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">New analysis</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a website URL, the path or filename of an APK, or a desktop binary. The worker
          streams findings back in real time — no MCP setup needed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-emerald-400" /> Target
          </CardTitle>
          <CardDescription>What are we reverse-engineering today?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Tabs value={tab} onValueChange={(v) => switchTab(v as TargetType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="website" className="gap-2">
                <Globe className="h-3.5 w-3.5" /> Website
              </TabsTrigger>
              <TabsTrigger value="apk" className="gap-2">
                <Smartphone className="h-3.5 w-3.5" /> Android APK
              </TabsTrigger>
              <TabsTrigger value="binary" className="gap-2">
                <Cpu className="h-3.5 w-3.5" /> Desktop binary
              </TabsTrigger>
            </TabsList>

            <TabsContent value="website" className="mt-5 space-y-4">
              <Field
                label="URL or local path"
                placeholder="https://example.com  or  /path/to/downloaded/site"
                value={target}
                onChange={setTarget}
                hint="URLs work in demo mode. In live mode, download the site first (e.g. wget --recursive) and pass the local path — REA's CLI doesn't fetch URLs."
              />
              <Field
                label="Label (optional)"
                placeholder="Example marketing site"
                value={label}
                onChange={setLabel}
              />
            </TabsContent>

            <TabsContent value="apk" className="mt-5 space-y-4">
              <Field
                label="APK absolute path"
                placeholder="/uploads/com.example.app-2.4.1.apk"
                value={target}
                onChange={setTarget}
                hint="Upload via the /api/upload endpoint, then pass the returned absolute path. Decoded with JADX (needs Java 17+)."
              />
              <Field
                label="Label (optional)"
                placeholder="Example mobile app v2.4.1"
                value={label}
                onChange={setLabel}
              />
            </TabsContent>

            <TabsContent value="binary" className="mt-5 space-y-4">
              <Field
                label="Binary absolute path"
                placeholder="/uploads/example-daemon"
                value={target}
                onChange={setTarget}
                hint="Upload via the /api/upload endpoint, then pass the returned absolute path. ELF/Mach-O/PE loaded into Ghidra (needs Java 17+)."
              />
              <Field
                label="Label (optional)"
                placeholder="example-daemon"
                value={label}
                onChange={setLabel}
              />
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setTarget(''); setLabel('') }}>
              Clear
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createJob.isPending}
              className="gap-2"
            >
              {createJob.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Start analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-mono text-emerald-400">demo mode (default):</span> the
            runner synthesizes realistic findings for each target type so you can explore
            the full UI without installing the <code className="font-mono">rea-agents</code>{' '}
            CLI. Switch to <span className="font-mono text-emerald-400">live mode</span> in
            Settings once you&apos;ve run <code className="font-mono">npm install --global rea-agents</code>{' '}
            and verified <code className="font-mono">rea --version</code> works.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Field(props: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {props.label}
      </Label>
      <Input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="font-mono text-sm"
      />
      {props.hint && (
        <p className="text-[11px] text-muted-foreground">{props.hint}</p>
      )}
    </div>
  )
}
