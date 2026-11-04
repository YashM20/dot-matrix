/**
 * Prose lint: catches AI-writing tells in visitor prose (docs/WRITING.md; GitHub #77). Sources: Wikipedia's
 * "Signs of AI writing" plus the owner's banned sentence shapes. Only prose is read, never code, so a word like
 * "robust" in a comment, a code span or a fenced block is fine. The rules live in scripts/site/prose-rules.ts.
 *
 *   npx tsx scripts/site/prose-lint.ts                     → the default set (DEFAULT_FILES below): the essay, blog
 *                                                            posts and guides, both changelogs, the legal pages,
 *                                                            README, CONTRIBUTING, board blurbs, About and post deks
 *   npx tsx scripts/site/prose-lint.ts src/essay/Essay.tsx → only the files given (.tsx JSX text, .ts string fields,
 *                                                            .html body blocks, .md paragraphs)
 *   npx tsx scripts/site/prose-lint.ts --warn-only         → print everything, always exit 0
 *
 * Output: `file:line  rule  "excerpt"` and a `fix:` hint under it, then a count. Exit 1 on any `error` (banned words,
 * stock phrases, em dashes, contrast frames, set-up reveals); `warn` rules (rhetorical questions, cliché openers,
 * "From X to Y", moral closers, density checks) never fail the run. Runs in `pnpm check`.
 *
 * Quoted third-party text (credits, licence lines) goes in scripts/site/prose-allow.json: an entry skips one rule
 * in blocks of one file that contain its snippet. An entry that no longer matches anything is an error, so the
 * list can't go stale.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { all, FILE_RULES, RULES, type Block, type Hit, type Kind, type Severity } from './prose-rules'

const ROOT = join(import.meta.dirname, '../..')
const mdIn = (dir: string) => existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.md')).map(f => `${dir}/${f}`) : []
const DEFAULT_FILES = [
  'src/essay/Essay.tsx', 'src/changelog.ts', 'src/components/About.tsx', 'src/widgets/blurbs.ts', 'src/blog/posts.ts',
  'privacy.html', 'terms.html', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', ...mdIn('docs/blog'), ...mdIn('docs/guides'),
]
/** .ts files where every string value in an object literal is visitor text (the blurb tables) */
const ALL_STRINGS = new Set(['src/widgets/blurbs.ts'])
/** in other .ts files, only these keys hold visitor text (changelog rows, post deks) */
const TEXT_KEYS = new Set(['text', 'summary', 'title', 'dek'])

// ---- extraction: every block keeps a map from its collapsed text back to source offsets --------------------------
/** markup is masked with MASK, which is dropped from the text (unlike whitespace), so offsets stay 1:1 with the source */
const MASK = '\u0000'
const blankRange = (a: string[], s: number, e: number, fill = '') => { for (let i = s; i < e; i++) a[i] = MASK; for (let i = 0; i < fill.length && s + i < e; i++) a[s + i] = fill[i] }

function block(file: string, src: string, kind: Kind, start: number, masked: string, boldRaw: [number, number][] = []): Block | null {
  let text = ''
  const map: number[] = []
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    if (c === MASK) continue
    if (/\s/.test(c)) { if (text && !text.endsWith(' ')) { text += ' '; map.push(start + i) } continue }
    text += c; map.push(start + i)
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop() }
  if (!/[A-Za-z]{2}/.test(text)) return null
  const at = (raw: number) => { const k = map.findIndex(o => o >= start + raw); return k < 0 ? text.length : k }
  return { file, src, kind, text, map, bold: boldRaw.map(([s, e]) => [at(s), at(e)]) }
}

const BLOCK_TAGS = new Set(['p', 'li', 'dd', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption', 'blockquote', 'Moment'])
const CODE_TAGS = new Set(['C', 'code', 'pre', 'kbd'])
const BOLD_TAGS = new Set(['b', 'strong'])

function fromTsx(file: string, src: string): Block[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: Block[] = []
  const tagOf = (n: ts.Node) => ts.isJsxElement(n) ? n.openingElement.tagName.getText(sf) : ts.isJsxSelfClosingElement(n) ? n.tagName.getText(sf) : ''
  const emit = (n: ts.Node, kind: Kind) => {
    const s = n.getStart(sf), raw = src.slice(s, n.getEnd()).split('')
    blankRange(raw, 0, raw.length)
    const bold: [number, number][] = []
    const keep = (m: ts.Node): void => {
      const tag = tagOf(m)
      if (CODE_TAGS.has(tag)) { blankRange(raw, m.getStart(sf) - s, m.getEnd() - s, 'x'); return }
      if (BOLD_TAGS.has(tag)) bold.push([m.getStart(sf) - s, m.getEnd() - s])
      if (ts.isJsxText(m)) for (let i = m.pos; i < m.end; i++) raw[i - s] = src[i]
      if (ts.isJsxExpression(m) && m.expression && ts.isStringLiteral(m.expression)) { raw[m.getStart(sf) - s] = m.expression.text || ' '; return }
      if (ts.isJsxAttributes(m)) return
      m.forEachChild(keep)
    }
    n.forEachChild(keep)
    const b = block(file, src, kind, s, raw.join(''), bold)
    if (b) out.push(b)
  }
  const walk = (n: ts.Node): void => {
    const tag = tagOf(n)
    if (BLOCK_TAGS.has(tag)) return emit(n, /^h\d$/.test(tag) ? 'heading' : 'prose')
    if (ts.isJsxFragment(n)) return emit(n, 'prose')
    if (ts.isJsxAttribute(n) && ['title', 'text'].includes(n.name.getText(sf)) && n.initializer && ts.isStringLiteral(n.initializer)) {
      const b = block(file, src, 'heading', n.initializer.getStart(sf) + 1, n.initializer.text)
      if (b) out.push(b)
    }
    n.forEachChild(walk)
  }
  walk(sf)
  return out
}

/** .ts: string literals under the visitor-facing keys, or every property string in an ALL_STRINGS file. Comments and other code are skipped. */
function fromTs(file: string, src: string): Block[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const out: Block[] = []
  const every = ALL_STRINGS.has(file)
  const walk = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && ts.isStringLiteralLike(n.initializer) && (every || TEXT_KEYS.has(n.name.getText(sf)))) {
      const b = block(file, src, n.name.getText(sf) === 'title' ? 'heading' : 'prose', n.initializer.getStart(sf) + 1, n.initializer.text)
      if (b) out.push(b)
    }
    n.forEachChild(walk)
  }
  walk(sf)
  return out
}

const ENTITIES: Record<string, string> = { '&mdash;': '—', '&ndash;': '–', '&amp;': '&', '&nbsp;': ' ', '&rarr;': '→', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”' }

/** Mask markup inside a block's raw source so offsets still line up; returns the masked text and bold ranges. */
function maskMarkup(raw: string, md: boolean): [string, [number, number][]] {
  const a = raw.split('')
  const bold: [number, number][] = []
  const each = (re: RegExp, f: (m: RegExpMatchArray) => void) => { for (const m of raw.matchAll(re)) f(m) }
  each(/<!--[\s\S]*?-->/g, m => blankRange(a, m.index!, m.index! + m[0].length))
  each(/<(code|kbd|pre)\b[^>]*>[\s\S]*?<\/\1>/g, m => blankRange(a, m.index!, m.index! + m[0].length, 'x'))
  each(/<(b|strong)\b[^>]*>[\s\S]*?<\/\1>/g, m => bold.push([m.index!, m.index! + m[0].length]))
  if (md) {
    each(/`[^`\n]+`/g, m => blankRange(a, m.index!, m.index! + m[0].length, 'x'))
    each(/!\[[^\]]*\]\([^)]*\)/g, m => blankRange(a, m.index!, m.index! + m[0].length))
    each(/\]\([^)]*\)/g, m => blankRange(a, m.index!, m.index! + m[0].length))
    each(/\*\*[^*\n]+\*\*/g, m => { bold.push([m.index!, m.index! + m[0].length]); blankRange(a, m.index!, m.index! + 2); blankRange(a, m.index! + m[0].length - 2, m.index! + m[0].length) })
    each(/^\s*(?:[-*+]|\d+\.|>|#+)\s|\[|^\s*\|?-{3,}.*$/gm, m => blankRange(a, m.index!, m.index! + m[0].length))
  }
  each(/<[^>]+>/g, m => blankRange(a, m.index!, m.index! + m[0].length))
  each(/&[#\w]+;/g, m => blankRange(a, m.index!, m.index! + m[0].length, ENTITIES[m[0]] ?? ''))
  return [a.join(''), bold]
}

function fromHtml(file: string, src: string): Block[] {
  const body = src.indexOf('<body')
  const out: Block[] = []
  for (const m of src.matchAll(/<(p|li|dd|dt|h[1-6]|figcaption|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    if (m.index! < body) continue
    const start = m.index! + m[0].indexOf('>') + 1
    const [masked, bold] = maskMarkup(m[2], false)
    const b = block(file, src, /^h/.test(m[1]) ? 'heading' : 'prose', start, masked, bold)
    if (b) out.push(b)
  }
  return out
}

function fromMd(file: string, src: string): Block[] {
  const out: Block[] = []
  let off = 0, fence = false, cur: { start: number; end: number } | null = null
  const flush = (kind: Kind = 'prose') => {
    if (!cur) return
    const [masked, bold] = maskMarkup(src.slice(cur.start, cur.end), true)
    const b = block(file, src, kind, cur.start, masked, bold)
    if (b) out.push(b)
    cur = null
  }
  for (const line of src.split('\n')) {
    const end = off + line.length
    if (/^\s*(```|~~~)/.test(line)) { flush(); fence = !fence }
    else if (fence) { /* code */ }
    else if (/^#{1,6}\s/.test(line)) { flush(); cur = { start: off, end }; flush('heading') }
    else if (!line.trim()) flush()
    else if (/^\s*(?:[-*+]|\d+\.)\s|^\s*\|/.test(line)) { flush(); cur = { start: off, end } }
    else if (cur) cur.end = end
    else cur = { start: off, end }
    off = end + 1
  }
  flush()
  return out
}

function extract(path: string): Block[] {
  const src = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const inRepo = !relative(ROOT, path).startsWith('..')
  const file = relative(inRepo ? ROOT : process.cwd(), path).replace(/\\/g, '/')
  if (path.endsWith('.tsx')) return fromTsx(file, src)
  if (path.endsWith('.ts')) return fromTs(file, src)
  if (/\.html?$/.test(path)) return fromHtml(file, src)
  return fromMd(file, src)
}

// ---- allowlist ------------------------------------------------------------------------------------------------
interface Allow { file: string; rule: string; text: string; why: string; used?: boolean }
const ALLOW_PATH = join(ROOT, 'scripts/site/prose-allow.json')
const allow: Allow[] = existsSync(ALLOW_PATH) ? (JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) as { allow: Allow[] }).allow : []
const allowed = (b: Block, rule: string) => {
  const a = allow.find(x => x.file === b.file && x.rule === rule && b.text.includes(x.text))
  if (a) a.used = true
  return !!a
}

// ---- run ------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2)
const warnOnly = args.includes('--warn-only')
const given = args.filter(a => !a.startsWith('--'))
const files = given.length ? given.map(f => resolve(f)) : DEFAULT_FILES.map(f => join(ROOT, f))

interface Finding { file: string; line: number; rule: string; severity: Severity; hint: string; excerpt: string }
const findings: Finding[] = []
const lineOf = (src: string, off: number) => src.slice(0, off).split('\n').length
const report = (b: Block, h: Hit, r: { id: string; severity: Severity; hint: string }) => {
  if (allowed(b, r.id)) return
  const a = Math.max(0, h.at - 20), e = Math.min(b.text.length, h.at + Math.max(h.len, 1) + 20)
  const excerpt = (a > 0 ? '…' : '') + b.text.slice(a, e) + (e < b.text.length ? '…' : '')
  findings.push({ file: b.file, line: lineOf(b.src, b.map[Math.min(h.at, b.map.length - 1)]), rule: r.id, severity: r.severity, hint: r.hint, excerpt })
}
for (const f of files) {
  if (!existsSync(f)) { console.error(`prose-lint: no such file ${f}`); process.exit(2) }
  const blocks = extract(f)
  for (const b of blocks) {
    const plain = b.text.replace(/[‘’]/g, "'") // same length, so offsets still match b.text
    for (const r of RULES) {
      if (r.re) for (const m of all(r.re, plain)) report(b, { at: m.index!, len: m[0].length }, r)
      if (r.check && (r.on === 'all' || b.kind === (r.on ?? 'prose'))) for (const h of r.check(b)) report(b, h, r)
    }
  }
  for (const r of FILE_RULES) for (const [b, h] of r.check(blocks)) report(b, h, r)
}
// a stale entry only counts on a full run, where every file it could name was read
if (!given.length) for (const a of allow.filter(x => !x.used)) {
  findings.push({ file: 'scripts/site/prose-allow.json', line: 1, rule: 'stale-allow', severity: 'error', hint: 'this entry matches nothing now; delete it', excerpt: `${a.file} · ${a.rule} · ${a.text}` })
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
for (const x of findings) {
  console.log(`${x.file}:${x.line}  ${x.severity === 'error' ? x.rule : `${x.rule} (warn)`}  "${x.excerpt}"`)
  console.log(`    fix: ${x.hint}`)
}
const errors = findings.filter(x => x.severity === 'error').length
console.log(`prose-lint: ${files.length} file(s), ${RULES.length + FILE_RULES.length} rules, ${errors} error(s), ${findings.length - errors} warning(s)`)
process.exit(errors && !warnOnly ? 1 : 0)
