/**
 * Prose lint: catches AI-writing tells in visitor prose (docs/WRITING.md; GitHub #77). Sources: Wikipedia's
 * "Signs of AI writing" plus the owner's banned sentence shapes. Only prose is read, never code, so a word like
 * "robust" in a comment is fine.
 *
 *   npx tsx scripts/site/prose-lint.ts                     → the default set: the essay's JSX text (src/essay/Essay.tsx),
 *                                                            the visitor rows of src/changelog.ts, the legal pages
 *                                                            (privacy.html, terms.html) and docs/blog/*.md (if any)
 *   npx tsx scripts/site/prose-lint.ts src/essay/Essay.tsx → only the files given (.tsx JSX text, .ts string fields
 *                                                            text/summary/title, .html body blocks, .md paragraphs)
 *   npx tsx scripts/site/prose-lint.ts --warn-only         → print everything, always exit 0
 *
 * Output: `file:line  rule  "excerpt"`, then a count. Exit 1 on any `error` (high-confidence tells: banned words,
 * stock phrases, em dashes, contrast frames, set-up reveals); `warn` rules are density checks (triplets, hedging,
 * bold in running prose, quote mixing, Title Case headings) and never fail the run. The rules are the RULES table.
 * Not in CI yet; it runs at the checkpoint gate (docs/CHECKPOINTS.md).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

type Severity = 'error' | 'warn'
type Kind = 'prose' | 'heading'
/** One block of visitor text (a paragraph, list item, caption or heading), whitespace-collapsed, with a source map. */
interface Block { file: string; src: string; kind: Kind; text: string; map: number[]; bold: [number, number][] }
interface Hit { at: number; len: number }
interface Rule {
  id: string
  severity: Severity
  why: string
  /** regex rules run on every block (headings too); `check` rules on prose blocks only, unless `on` says so */
  re?: RegExp
  check?: (b: Block) => Hit[]
  on?: Kind
}

const ROOT = join(import.meta.dirname, '../..')
const words = (s: string) => s.match(/[A-Za-z][\w'’-]*/g)?.length ?? 0
const all = (re: RegExp, s: string) => [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]
const S = '(?:^|[.!?:] )' // sentence start

// ---- rules ----------------------------------------------------------------------------------------------------
const VOCAB = [
  'delve[sd]?', 'delving', 'tapestry', 'testament', 'intricate(?:ly)?', 'intricacies', 'pivotal', 'seamless(?:ly)?', 'robust(?:ly|ness)?',
  'leverag(?:e|es|ed|ing)', 'elevat(?:e|es|ed|ing)', 'unlock(?:s|ed|ing)?', 'realms?', 'vibrant', 'showcas(?:e|es|ed|ing)',
  'underscor(?:e|es|ed|ing)', 'boasts?', 'boasting', 'nestled', 'crucial(?:ly)?', 'foster(?:s|ed|ing)?', 'embark(?:s|ed|ing)?',
  'journey', 'meticulous(?:ly)?', 'bolster(?:s|ed|ing)?', 'garner(?:s|ed|ing)?', 'interplay', 'multifaceted', 'groundbreaking',
  'renowned', 'game-?changer', 'cutting-edge', 'ever-evolving', 'synerg(?:y|ies)', 'holistic', 'paradigm', 'empower(?:s|ed|ing)?',
  'unparalleled', 'transformative', 'harmonious(?:ly)?', 'captivating', 'breathtaking', 'indelible', 'enduring legacy',
]

const RULES: Rule[] = [
  // vocabulary and stock phrases
  { id: 'ai-vocab', severity: 'error', why: 'a word AI text overuses; say the plain thing',
    re: new RegExp(`\\b(?:${VOCAB.join('|')})\\b|\\b(?<!in )landscapes?\\b(?! mode| orientation)`, 'i') },
  { id: 'stock-phrase', severity: 'error', why: 'a stock phrase that carries no information',
    re: /\b(?:let'?s dive in|dive (?:in|into)|deep dive|in today'?s|fast-paced|in conclusion|it'?s worth noting|worth noting that|it should be noted|plays? an? (?:crucial|key|pivotal|vital|important|central) role|stands as an?|serves as an?|whether you'?re|a reminder that|in the heart of|at the end of the day|the world of|look no further|unleash(?:es|ed)?|rich history|a wide (?:range|array|variety) of|diverse array|when it comes to|in the realm of|navigat(?:e|ing) the)\b/i },
  { id: 'filler-opener', severity: 'error', why: 'a transition that pads; start with the point',
    re: new RegExp(`${S}(?:Moreover|Furthermore|Additionally|Ultimately|In summary|In short|Overall|All in all|In essence|Notably|Importantly),`) },
  // punctuation
  { id: 'em-dash', severity: 'error', why: 'no em dashes; use a period, comma, colon or parentheses', re: /—| -- / },
  { id: 'en-dash', severity: 'error', why: 'the en dash is only for number ranges (2–4, 12–120)', re: /(?<!\d)–|–(?![\dA-Za-z])/ },
  { id: 'emoji', severity: 'error', why: 'no emoji in prose', re: /(?![©®™↔↕])\p{Extended_Pictographic}/u },
  // contrast frames
  { id: 'its-not-x-its-y', severity: 'error', why: 'contrast frame ("it\'s not X, it\'s Y"); say what it is',
    re: /\b(?:it'?s|it is|this is|that'?s|that is) not\b[^.!?]{1,60}?[,;:] ?(?:it'?s|it is|but|this is|that'?s)\b/i },
  { id: 'not-just', severity: 'error', why: 'contrast frame ("not just X, but Y")', re: /\bnot (?:just|only|merely|simply)\b/i },
  { id: 'isnt-x-its-y', severity: 'error', why: 'contrast frame ("X isn\'t Y. It\'s Z."); state Z',
    re: /\b(?:isn'?t|is not|aren'?t|are not|wasn'?t|was not)\b[^.!?;]{1,80}(?:\. (?:it'?s|it is|it was|this is|that'?s|that is|they'?re|they are)\b(?! not)|; (?:it|this|that|they) (?!(?:does|is|are|was|do)n'?t\b|(?:does|is|are|do) not\b)\w+)/i },
  { id: 'not-x-but-y', severity: 'error', why: 'contrast frame ("not X but Y"); state Y', re: /\b(?:not|isn'?t|aren'?t)\b [^.,;:!?]{1,40} but (?!also\b)/i },
  { id: 'not-about', severity: 'error', why: 'contrast frame ("X isn\'t about Y")', re: /\b(?:isn'?t|is not|aren'?t|are not|wasn'?t|not) (?:really |just )?about\b/i },
  { id: 'less-x-more-y', severity: 'error', why: 'contrast frame ("less X, more Y")', re: /\bless [\w-]+(?: [\w-]+)?[,.;] (?:and )?more\b/i },
  { id: 'not-because', severity: 'error', why: 'contrast frame ("not because X, but because Y")', re: /\bnot because\b[^.!?]{0,120}\bbut because\b/i },
  { id: 'rather-than-reveal', severity: 'error', why: 'contrast frame opening on "Rather than"', re: new RegExp(`${S}Rather than\\b`) },
  // AI sentence shapes
  { id: 'no-no-just', severity: 'error', why: 'fragment triplet ("No X. No Y. Just Z.")',
    re: /\bno [^.!?,;]{1,40}[.,] no [^.!?,;]{1,40}[.,] (?:just|only)\b/i },
  { id: 'setup-reveal', severity: 'error', why: 'set-up then reveal ("Here\'s why:", "The catch?"); just say it',
    re: new RegExp(`${S}(?:Here(?:'s| is) (?:the \\w+|why|how|what|where)\\b|(?:And |But |So )?The (?:catch|result|kicker|twist|upshot|takeaway|answer|secret|trick|problem|best part|bottom line)[?:])`) },
  { id: 'rhetorical-q', severity: 'error', why: 'a question answered in the next sentence; make the statement', re: /[A-Za-z][^.!?]{2,120}\? (?=[A-Z])/ },
  { id: 'from-x-to-y', severity: 'error', why: '"From X to Y," as a list opener', re: new RegExp(`${S}From [^,.!?]{1,50} to [^,.!?]{1,50},`) },
  { id: 'x-meets-y', severity: 'error', why: '"X meets Y"', re: /\b\w+ meets (?!the |a |an |its |every |all |our |your |this |that |\d)\w+/i },
  { id: 'cliche-opener', severity: 'error', why: '"It turns out", "Think of it as", "Imagine …"',
    re: new RegExp(`\\bit turns out\\b|\\bthink of (?:it|this|them) (?:as|like)\\b|${S}Imagine\\b`, 'i') },
  { id: 'moral-close', severity: 'error', why: 'a one-line moral ("And that\'s the point.")',
    re: /\b(?:that'?s|this is|that is|it is|it'?s|which is) (?:the (?:whole )?(?:point|magic|beauty|secret|key|idea)|what matters)\b|(?:^|[.!?] )And that'?s [^.!?]{1,40}[.!]$/i },
  // density and format (warn)
  { id: 'comma-not', severity: 'warn', why: '", not Y" tail; often a softer contrast frame', re: /, not (?:a |an |the |per )?\w+/ },
  { id: 'triplets', severity: 'warn', why: '3+ "X, Y and Z" lists in one paragraph; not everything comes in threes',
    check: b => { const m = all(/\b[\w'-]+(?: [\w'-]+)?, [\w'-]+(?: [\w'-]+){0,2},? (?:and|or) [\w'-]+/, b.text); return m.length >= 3 ? [{ at: m[2].index!, len: m[2][0].length }] : [] } },
  { id: 'hedging', severity: 'warn', why: 'hedge words pile up (3+ in a paragraph); commit or cut',
    check: b => { const m = all(/\b(?:may|might|potentially|perhaps|possibly|arguably|somewhat|seemingly|generally|typically)\b/i, b.text); return m.length >= 3 || (m.length >= 2 && words(b.text) < 40) ? [{ at: m.at(-1)!.index!, len: m.at(-1)![0].length }] : [] } },
  { id: 'bold-in-prose', severity: 'warn', why: 'bold inside running prose; keep bold for a run-in lead',
    check: b => b.bold.filter(([s], i) => i > 0 || b.text.slice(0, s).trim() !== '').map(([s, e]) => ({ at: s, len: e - s })) },
  { id: 'title-case', severity: 'warn', why: 'Title Case heading; use sentence case', on: 'heading',
    check: b => { const w = b.text.match(/[A-Za-z][\w'-]*/g) ?? []; const big = w.slice(1).filter(x => !/^(?:a|an|the|and|or|of|in|on|to|for|with|at|by|vs)$/i.test(x) && x !== x.toUpperCase()); return big.length >= 2 && big.every(x => /^[A-Z]/.test(x)) ? [{ at: 0, len: b.text.length }] : [] } },
]
const FILE_RULES: { id: string; severity: Severity; why: string; check: (bs: Block[]) => [Block, Hit][] }[] = [
  { id: 'quote-mix', severity: 'warn', why: 'straight and curly quotes mixed in one file; pick one',
    check: bs => {
      const curly = bs.flatMap(b => all(/[‘’“”]/, b.text).map(m => [b, { at: m.index!, len: 1 }] as [Block, Hit]))
      const straight = bs.flatMap(b => all(/['"]/, b.text).map(m => [b, { at: m.index!, len: 1 }] as [Block, Hit]))
      return curly.length && straight.length ? (curly.length <= straight.length ? curly : straight) : []
    } },
]

// ---- extraction: every block keeps a map from its collapsed text back to source offsets --------------------------
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
/** markup is masked with MASK, which is dropped from the text (unlike whitespace), so offsets stay 1:1 with the source */
const MASK = '\u0000'
const blankRange = (a: string[], s: number, e: number, fill = '') => { for (let i = s; i < e; i++) a[i] = MASK; for (let i = 0; i < fill.length && s + i < e; i++) a[s + i] = fill[i] }

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

/** .ts: string literals under the visitor-facing keys (changelog rows). Comments and other code are skipped. */
function fromTs(file: string, src: string): Block[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const out: Block[] = []
  const walk = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && ['text', 'summary', 'title'].includes(n.name.getText(sf)) && ts.isStringLiteralLike(n.initializer)) {
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
  const lines = src.split('\n')
  let off = 0, fence = false, cur: { start: number; end: number } | null = null
  const flush = (kind: Kind = 'prose') => {
    if (!cur) return
    const [masked, bold] = maskMarkup(src.slice(cur.start, cur.end), true)
    const b = block(file, src, kind, cur.start, masked, bold)
    if (b) out.push(b)
    cur = null
  }
  for (const line of lines) {
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
  const file = relative(ROOT, path).replace(/\\/g, '/')
  if (path.endsWith('.tsx')) return fromTsx(file, src)
  if (path.endsWith('.ts')) return fromTs(file, src)
  if (/\.html?$/.test(path)) return fromHtml(file, src)
  return fromMd(file, src)
}

// ---- run ------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2)
const warnOnly = args.includes('--warn-only')
const given = args.filter(a => !a.startsWith('--'))
const blog = join(ROOT, 'docs/blog')
const files = given.length ? given.map(f => resolve(f)) : [
  'src/essay/Essay.tsx', 'src/changelog.ts', 'privacy.html', 'terms.html',
  ...(existsSync(blog) ? readdirSync(blog).filter(f => f.endsWith('.md')).map(f => `docs/blog/${f}`) : []),
].map(f => join(ROOT, f))

interface Finding { file: string; line: number; rule: string; severity: Severity; excerpt: string }
const findings: Finding[] = []
const lineOf = (src: string, off: number) => src.slice(0, off).split('\n').length
const report = (b: Block, h: Hit, rule: string, severity: Severity) => {
  const a = Math.max(0, h.at - 20), e = Math.min(b.text.length, h.at + Math.max(h.len, 1) + 20)
  const excerpt = (a > 0 ? '…' : '') + b.text.slice(a, e) + (e < b.text.length ? '…' : '')
  findings.push({ file: b.file, line: lineOf(b.src, b.map[Math.min(h.at, b.map.length - 1)]), rule, severity, excerpt })
}
for (const f of files) {
  if (!existsSync(f)) { console.error(`prose-lint: no such file ${f}`); process.exit(2) }
  const blocks = extract(f)
  for (const b of blocks) for (const r of RULES) {
    if (r.re) for (const m of all(r.re, b.text)) report(b, { at: m.index!, len: m[0].length }, r.id, r.severity)
    if (r.check && b.kind === (r.on ?? 'prose')) for (const h of r.check(b)) report(b, h, r.id, r.severity)
  }
  for (const r of FILE_RULES) for (const [b, h] of r.check(blocks)) report(b, h, r.id, r.severity)
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
for (const x of findings) console.log(`${x.file}:${x.line}  ${x.severity === 'error' ? x.rule : `${x.rule} (warn)`}  "${x.excerpt}"`)
const errors = findings.filter(x => x.severity === 'error').length
console.log(`prose-lint: ${files.length} file(s), ${RULES.length + FILE_RULES.length} rules, ${errors} error(s), ${findings.length - errors} warning(s)`)
process.exit(errors && !warnOnly ? 1 : 0)
