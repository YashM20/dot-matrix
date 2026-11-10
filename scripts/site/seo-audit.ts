/**
 * Summarises the SEO audit (.github/workflows/seo-audit.yml) as Markdown: Lighthouse scores and failing audits per
 * route (`seo-audit/lh/<target>__<route>__<form>.json`), the W3C Nu checker's messages on the built pages
 * (`seo-audit/vnu.json`) and lychee's broken links (`seo-audit/lychee.json`). Report only: it never fails the run.
 *
 *   npx tsx scripts/site/seo-audit.ts [dir=seo-audit]   → Markdown on stdout
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] ?? 'seo-audit'
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const out: string[] = []

interface Audit { id: string; title: string; score: number | null; scoreDisplayMode: string }
interface Lhr { categories: Record<string, { score: number | null; auditRefs: { id: string }[] }>; audits: Record<string, Audit> }
const lhDir = join(DIR, 'lh')
if (existsSync(lhDir)) {
  const cats = ['seo', 'best-practices', 'accessibility', 'performance']
  const rows: string[] = [], fails = new Map<string, Set<string>>()
  for (const f of readdirSync(lhDir).filter(f => f.endsWith('.json')).sort()) {
    const [target, route, form] = f.replace(/\.json$/, '').split('__'), lhr: Lhr = read(join(lhDir, f))
    const score = (c: string) => (lhr.categories[c]?.score == null ? '' : String(Math.round(lhr.categories[c].score! * 100)))
    rows.push(`| ${target} | \`${decodeURIComponent(route)}\` | ${form} | ${cats.map(score).join(' | ')} |`)
    for (const c of cats.slice(0, 3)) for (const { id } of lhr.categories[c]?.auditRefs ?? []) {
      const a = lhr.audits[id]
      if (!a || a.score === null || a.score >= 1 || !['binary', 'numeric', 'metricSavings'].includes(a.scoreDisplayMode)) continue
      const key = `${c}: ${a.title} (\`${id}\`)`
      fails.set(key, (fails.get(key) ?? new Set()).add(`${target} ${decodeURIComponent(route)} ${form}`))
    }
  }
  out.push('## Lighthouse', '', `| target | route | form | ${cats.join(' | ')} |`, `|---|---|---|${cats.map(() => '---:').join('|')}|`, ...rows, '')
  out.push('### Failing audits', '', ...(fails.size ? [...fails].map(([k, v]) => `- ${k}: ${[...v].join(', ')}`) : ['None.']), '')
}

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
