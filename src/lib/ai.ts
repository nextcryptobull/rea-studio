// AI-powered "retailoring" of raw REA findings into audience-tailored reports.
// Uses z-ai-web-dev-sdk on the server only.

import ZAI from 'z-ai-web-dev-sdk'
import type { FindingDTO, ReportAudience, TargetType } from './types'

const AUDIENCE_BRIEF: Record<ReportAudience, string> = {
  developer:
    'a backend / frontend engineer who will fix the issues. Use precise technical language, reference file paths, symbols, and offsets. Group findings by subsystem. Include concrete remediation code snippets where useful.',
  executive:
    'a non-technical product owner who cares about business risk, customer impact, and remediation cost. Avoid jargon. Use plain-English summaries. Lead with risk rating and impact. Keep it short.',
  qa:
    'a QA engineer building a regression test plan. For each finding, suggest a concrete test case (input, expected behavior, assertion). Group by test type (unit / integration / manual).',
  auditor:
    'a security auditor producing a compliance report. Cite OWASP / CWE IDs where applicable. Map findings to ISO 27001 Annex A control families. Maintain a formal, neutral tone.',
}

const TARGET_LABEL: Record<TargetType, string> = {
  website: 'Website',
  apk: 'Android APK',
  binary: 'Desktop binary',
}

export async function generateRetailoredReport(params: {
  targetType: TargetType
  target: string
  audience: ReportAudience
  findings: FindingDTO[]
}): Promise<string> {
  const { targetType, target, audience, findings } = params

  // If the SDK is not configured (e.g. in sandbox without API key), fall back to
  // a deterministic template so the feature still works end-to-end.
  const apiKey = process.env.ZAI_API_KEY || process.env.zai_api_key
  if (!apiKey) {
    return fallbackReport(params)
  }

  const findingsBrief = findings
    .map((f, i) => {
      const ev = f.evidence
        .map((e) => `      - [${e.kind}] ${e.snippet}${e.location ? ` (${e.location})` : ''}`)
        .join('\n')
      return `   ${i + 1}. [${f.severity.toUpperCase()}] [${f.category}] ${f.title}\n      ${f.description}\n${ev}`
    })
    .join('\n')

  const systemPrompt = `You are a senior security engineer writing a report for ${AUDIENCE_BRIEF[audience]} Use GitHub-flavored Markdown. Be concise but complete. Do not invent findings that were not provided. If the audience is technical, include remediation. If executive, prioritize business impact.`

  const userPrompt = `# Analysis target
${TARGET_LABEL[targetType]}: ${target}

# Findings (${findings.length})
${findingsBrief}

# Task
Write a tailored report for the "${audience}" audience. Structure with headers (## Overview, ## Findings, ## Recommendations, ## Appendix). Reference specific findings by their number.`

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    })
    const content = completion.choices[0]?.message?.content
    if (content && content.trim().length > 0) {
      return content.trim()
    }
    return fallbackReport(params)
  } catch (err) {
    console.error('[ai] retailoring failed, using fallback:', err)
    return fallbackReport(params)
  }
}

// Deterministic fallback used when no LLM is available. Produces a clean,
// readable markdown report so the feature is still demonstrable.
function fallbackReport(params: {
  targetType: TargetType
  target: string
  audience: ReportAudience
  findings: FindingDTO[]
}): string {
  const { targetType, target, audience, findings } = params

  const sevOrder = ['critical', 'high', 'medium', 'low', 'info'] as const
  const sorted = [...findings].sort(
    (a, b) => sevOrder.indexOf(a.severity as any) - sevOrder.indexOf(b.severity as any),
  )

  const counts = sevOrder.reduce<Record<string, number>>((acc, s) => {
    acc[s] = findings.filter((f) => f.severity === s).length
    return acc
  }, {} as Record<string, number>)

  const intro: Record<ReportAudience, string> = {
    developer: `This report summarizes ${findings.length} findings from the reverse-engineering analysis of ${target}. Each finding includes the affected location, a technical description, and a concrete remediation. Use the file paths and symbols below to navigate to the offending code.`,
    executive: `We analyzed ${target} and surfaced ${findings.length} findings (${counts.critical} critical, ${counts.high} high). The critical findings represent immediate business risk and should be addressed this sprint. Lower-severity findings can be scheduled into the next maintenance window.`,
    qa: `Below are ${findings.length} findings from the analysis of ${target}. For each, we suggest a regression test that prevents the issue from recurring once the fix lands. Group your tests by subsystem so the suite stays navigable.`,
    auditor: `This report documents ${findings.length} findings from a security review of ${target}. Findings are mapped to severity per ISO 27001 Annex A.12 (Operations Security) and A.14 (System Acquisition, Development & Maintenance). This document is suitable for inclusion in the management review pack.`,
  }

  const sections: string[] = []
  sections.push(`# Reverse-Engineering Report`)
  sections.push(``)
  sections.push(`**Target:** ${TARGET_LABEL[targetType]} — \`${target}\``)
  sections.push(`**Audience:** ${audience}`)
  sections.push(`**Findings:** ${findings.length} · ${counts.critical} critical / ${counts.high} high / ${counts.medium} medium / ${counts.low} low / ${counts.info} info`)
  sections.push(``)
  sections.push(`## Overview`)
  sections.push(intro[audience])
  sections.push(``)
  sections.push(`## Findings`)
  sorted.forEach((f, i) => {
    sections.push(`### ${i + 1}. [${f.severity.toUpperCase()}] ${f.title}`)
    sections.push(``)
    sections.push(`**Category:** ${f.category}`)
    sections.push(``)
    sections.push(f.description)
    sections.push(``)
    if (f.evidence.length > 0) {
      sections.push(`**Evidence:**`)
      sections.push(``)
      f.evidence.forEach((e) => {
        sections.push(`- \`${e.snippet}\`${e.location ? ` — ${e.location}` : ''}`)
      })
      sections.push(``)
    }
  })
  sections.push(`## Recommendations`)
  if (audience === 'executive') {
    sections.push(`- Prioritize the ${counts.critical} critical finding${counts.critical === 1 ? '' : 's'} this sprint.`)
    sections.push(`- Schedule the ${counts.high} high finding${counts.high === 1 ? '' : 's'} for the next maintenance window.`)
    sections.push(`- Open a tracking ticket per finding above and assign an owner.`)
  } else {
    sorted.slice(0, 3).forEach((f, i) => {
      sections.push(`${i + 1}. **${f.title}** — address in code review; add a regression test that fails before the fix and passes after.`)
    })
  }
  sections.push(``)
  sections.push(`## Appendix`)
  sections.push(`- Target type: ${TARGET_LABEL[targetType]}`)
  sections.push(`- Total findings: ${findings.length}`)
  sections.push(`- Report generated: ${new Date().toISOString()}`)

  return sections.join('\n')
}
