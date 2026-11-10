/**
 * Summarises the SEO audit (.github/workflows/seo-audit.yml) as Markdown: the W3C Nu checker's messages on the built
 * pages (`seo-audit/vnu.json`) and lychee's broken links (`seo-audit/lychee.json`). Lighthouse writes its own table
 * (scripts/ci/lighthouse.ts, `seo-audit/lh-*`). Report only: it never fails the run.
 *
 *   npx tsx scripts/site/seo-audit.ts [dir=seo-audit]   → Markdown on stdout
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] ?? 'seo-audit'
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const out: string[] = []

interface NuMessage { type: string; subType?: string; message: string; url?: string; lastLine?: number; extract?: string }
const vnu = join(DIR, 'vnu.json')
if (existsSync(vnu)) {
  const msgs: NuMessage[] = read(vnu).messages ?? []
  // "Trailing slash on void elements" is an info note on valid HTML (Vite writes `<meta … />`)
  const real = msgs.filter(m => !/Trailing slash on void elements/.test(m.message))
  const groups = new Map<string, string[]>()
  for (const m of real) { const k = `${m.type}${m.subType ? `/${m.subType}` : ''}: ${m.message}`; groups.set(k, [...(groups.get(k) ?? []), `${(m.url ?? '').replace(/^.*\/dist\//, '')}:${m.lastLine ?? ''}`]) }
  out.push('## W3C Nu HTML checker', '', `${msgs.filter(m => m.type === 'error').length} errors, ${msgs.filter(m => m.subType === 'warning').length} warnings, ${msgs.length - real.length} trailing-slash notes.`, '')
  out.push(...[...groups].map(([k, v]) => `- ${k} (${v.length}x: ${v.slice(0, 4).join(', ')}${v.length > 4 ? ', …' : ''})`), '')
}

const lychee = join(DIR, 'lychee.json')
if (existsSync(lychee)) {
  const j = read(lychee), bad: [string, { url: string; status?: { text?: string; code?: number } }[]][] = Object.entries(j.error_map ?? j.fail_map ?? {})
  out.push('## lychee (links)', '', `${j.total ?? '?'} links, ${j.successful ?? '?'} ok, ${j.errors ?? j.failures ?? 0} broken, ${j.excludes ?? 0} excluded, ${j.timeouts ?? 0} timeouts.`, '')
  for (const [page, links] of bad.slice(0, 40)) for (const l of links) out.push(`- ${page}: ${l.url} (${l.status?.code ?? l.status?.text ?? '?'})`)
  out.push('')
}

console.log(out.join('\n') || 'seo-audit: no results found')
