/**
 * A tiny Markdown reader for the blog posts (docs/blog/*.md): the subset they use and nothing more. Pure and
 * DOM-free. Blocks: `#`–`####` headings, paragraphs, `-` / `1.` lists (nested by indent), fenced code, `$$…$$`
 * display maths and the `<!-- VISUAL: kind=… · what=… · notice=… -->` figure notes. Inline: code spans, bold,
 * italics, links and `$…$` maths. Anything else stays plain text.
 */

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'code'; s: string }
  | { t: 'math'; s: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] }

export interface ListItem { c: Inline[]; sub?: ListBlock }
export interface ListBlock { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
export type VisualKind = 'card' | 'diagram' | 'steps' | 'interactive'
export type Block =
  | { t: 'h'; level: 1 | 2 | 3 | 4; text: string; id: string }
  | { t: 'p'; c: Inline[] }
  | ListBlock
  | { t: 'code'; lang: string; text: string }
  | { t: 'math'; tex: string }
  | { t: 'visual'; kind: VisualKind; what: string; notice: string }

/** A heading's anchor: lowercase words joined by dashes. */
export const slugify = (s: string): string => s.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Inline spans, left to right; the first marker that opens and closes wins. */
export function inline(src: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => { if (text) out.push({ t: 'text', s: text }); text = '' }
  for (let i = 0; i < src.length;) {
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^`([^`]+)`/.exec(rest))) { flush(); out.push({ t: 'code', s: m[1] }); i += m[0].length; continue }
    if ((m = /^\$([^$\s][^$]*?)\$(?![\w$])/.exec(rest))) { flush(); out.push({ t: 'math', s: m[1] }); i += m[0].length; continue }
    if ((m = /^\*\*(.+?)\*\*/.exec(rest))) { flush(); out.push({ t: 'b', c: inline(m[1]) }); i += m[0].length; continue }
    if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) { flush(); out.push({ t: 'a', href: m[2], c: inline(m[1]) }); i += m[0].length; continue }
    if ((m = /^\*([^*\s][^*]*?)\*/.exec(rest)) && !/\w/.test(src[i - 1] ?? '')) { flush(); out.push({ t: 'i', c: inline(m[1]) }); i += m[0].length; continue }
    text += src[i++]
  }
  flush()
  return out
}

const VISUAL_RE = /^<!--\s*VISUAL:\s*(.*?)\s*-->$/
const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const indentOf = (l: string) => /^\s*/.exec(l)![0].length

/** One list from `lines` (each a list line or an indented continuation), nested by indent. */
function list(lines: string[]): ListBlock {
  const first = LIST_RE.exec(lines[0])!, base = first[1].length, ordered = /\d/.test(first[2])
  const block: ListBlock = { t: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items: [] }
  let cur: { text: string; sub: string[] } | undefined
  const close = () => { if (cur) block.items.push({ c: inline(cur.text.trim()), ...(cur.sub.length && { sub: list(cur.sub) }) }) }
  for (const l of lines) {
    const m = LIST_RE.exec(l)
    if (m && m[1].length === base) { close(); cur = { text: m[3], sub: [] } }
    else if (cur && (m || cur.sub.length)) cur.sub.push(l)
    else if (cur) cur.text += ` ${l.trim()}`
  }
  close()
  return block
}

/** The visual note's `key=value` fields, split on `·`. */
function visual(body: string): Block | undefined {
  const f: Record<string, string> = {}
  for (const part of body.split('·')) { const i = part.indexOf('='); if (i > 0) f[part.slice(0, i).trim()] = part.slice(i + 1).trim() }
  const kind = f.kind as VisualKind
  return ['card', 'diagram', 'steps', 'interactive'].includes(kind) && f.what ? { t: 'visual', kind, what: f.what, notice: f.notice ?? '' } : undefined
}

export function parse(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'), out: Block[] = []
  for (let i = 0; i < lines.length;) {
    const l = lines[i], trimmed = l.trim()
    if (!trimmed) { i++; continue }
    let m: RegExpExecArray | null
    if ((m = /^```(\w*)\s*$/.exec(trimmed))) {
      const body: string[] = []
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i].trim()); i++) body.push(lines[i])
      out.push({ t: 'code', lang: m[1], text: body.join('\n') }); i++; continue
    }
    if ((m = VISUAL_RE.exec(trimmed))) { const v = visual(m[1]); if (v) out.push(v); i++; continue }
    if (trimmed.startsWith('<!--')) { while (i < lines.length && !lines[i].includes('-->')) i++; i++; continue }
    if ((m = /^\$\$(.+)\$\$$/.exec(trimmed))) { out.push({ t: 'math', tex: m[1].trim() }); i++; continue }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(trimmed))) {
      const text = m[2].trim()
      out.push({ t: 'h', level: m[1].length as 1 | 2 | 3 | 4, text, id: slugify(text) }); i++; continue
    }
    if (LIST_RE.test(l) && indentOf(l) === 0) {
      const body: string[] = []
      while (i < lines.length && lines[i].trim() && (LIST_RE.test(lines[i]) || indentOf(lines[i]) > 0)) body.push(lines[i++])
      out.push(list(body)); continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\$\$|<!--)/.test(lines[i].trim()) && !(LIST_RE.test(lines[i]) && indentOf(lines[i]) === 0)) para.push(lines[i++].trim())
    out.push({ t: 'p', c: inline(para.join(' ')) })
  }
  return out
}

/**
 * TeX as plain text with super- and subscripts marked: the handful of commands the posts use (`\frac`, `\text`,
 * `\sqrt`, Greek letters, `\cdot`, `\quad`). `^x` / `_x` (or `{…}`) become `sup` / `sub` runs.
 */
export type MathRun = { t: 'text' | 'sup' | 'sub'; s: string }
const GREEK: Record<string, string> = { pi: 'π', omega: 'ω', zeta: 'ζ', theta: 'θ', phi: 'φ', alpha: 'α', beta: 'β', lambda: 'λ', sigma: 'σ', cdot: '·', times: '×', quad: '  ', le: '≤', ge: '≥' }
export function tex(src: string): MathRun[] {
  let s = src
  // innermost first, so nested groups resolve
  for (let k = 0; k < 4; k++) {
    s = s.replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${/^\w+$/.test(a) ? a : `(${a})`}/${/^\w+$/.test(b) ? b : `(${b})`}`)
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${a.length > 1 ? `(${a})` : a}`)
  }
  s = s.replace(/\\([a-zA-Z]+)\s?/g, (all, name: string) => GREEK[name] ?? all.slice(1)).replace(/\\,/g, ' ')
  const out: MathRun[] = []
  const push = (t: MathRun['t'], v: string) => { const last = out[out.length - 1]; if (last && last.t === t) last.s += v; else if (v) out.push({ t, s: v }) }
  for (let i = 0; i < s.length;) {
    const c = s[i]
    if ((c === '^' || c === '_') && i + 1 < s.length) {
      const t = c === '^' ? 'sup' : 'sub'
      if (s[i + 1] === '{') { const j = s.indexOf('}', i + 2); push(t, s.slice(i + 2, j < 0 ? s.length : j)); i = j < 0 ? s.length : j + 1 } else { push(t, s[i + 1]); i += 2 }
      continue
    }
    push('text', c === '{' || c === '}' ? '' : c); i++
  }
  return out
}
