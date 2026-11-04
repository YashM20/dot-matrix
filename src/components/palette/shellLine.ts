/**
 * The dot shell's line editing helpers, apart from the screen: history kept in sessionStorage (untrusted on the
 * way back in: only short strings survive), Tab completion over the command table, and did-you-mean.
 */
import { commandWords, findCommand, type ShellCommand } from './shellHelp'

/** The longest line the shell takes (the input's maxLength; longer stored entries are dropped). */
export const LINE_MAX = 256
const HISTORY_MAX = 100
const KEY = 'dot480:shell-history'

// control characters out (they draw nothing and only confuse the line)
const clean = (s: string) => s.replace(/\p{Cc}/gu, '').trim()

/** This tab's history, newest first. Anything that isn't a short plain string is dropped. */
export function loadHistory(): string[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const s of v.slice(0, HISTORY_MAX)) if (typeof s === 'string' && s.length <= LINE_MAX && clean(s) && !out.includes(clean(s))) out.push(clean(s))
    return out
  } catch { return [] }
}
export function saveHistory(h: readonly string[]) {
  try { if (h.length) sessionStorage.setItem(KEY, JSON.stringify(h.slice(0, HISTORY_MAX))); else sessionStorage.removeItem(KEY) } catch { /* storage off: this shell only */ }
}
/** `line` at the front, an older copy of it dropped. */
export const addHistory = (h: readonly string[], line: string): string[] => {
  const l = clean(line).slice(0, LINE_MAX)
  return l ? [l, ...h.filter(x => x !== l)].slice(0, HISTORY_MAX) : [...h]
}

/** Where completion gets its words. Cards load lazily (every board chunk), the rest is at hand. */
export interface Sources {
  boards: readonly string[]
  places: readonly string[]
  cards(): Promise<readonly string[]>
  /** The palette action ids under a prefix, minus the prefix (`theme-` → system, light, dark). */
  palette(prefix: string): readonly string[]
}

/** The words a command's first argument takes. */
export async function argWords(c: ShellCommand, src: Sources): Promise<string[]> {
  const out = [...(c.words ?? []), ...(c.palette ? src.palette(c.palette) : [])]
  if (c.arg === 'command') out.push(...commandWords())
  if (c.arg === 'board' || c.arg === 'place') out.push(...src.boards)
  if (c.arg === 'place') out.push(...src.places)
  if (c.arg === 'card' || c.arg === 'place') out.push(...await src.cards())
  return [...new Set(out)]
}

export interface Completion { line: string; caret: number; /** Several matches and nothing more to add: list them. */ options: string[] }

const common = (ws: string[]) => ws.reduce((p, w) => { let i = 0; while (i < p.length && i < w.length && p[i].toLowerCase() === w[i].toLowerCase()) i++; return p.slice(0, i) })

/** Complete the word that ends at the caret: a command, or the command's first argument. Null when nothing fits. */
export async function complete(line: string, caret: number, src: Sources): Promise<Completion | null> {
  const head = line.slice(0, caret), tail = line.slice(caret)
  const token = /\S*$/.exec(head)![0], before = head.slice(0, head.length - token.length)
  const words = before.trim() ? before.trim().split(/\s+/) : []
  let pool: string[]
  if (!words.length) pool = commandWords()
  else if (words.length === 1) { const c = findCommand(words[0]); if (!c) return null; pool = await argWords(c, src) }
  else return null
  const t = token.toLowerCase()
  let hits = pool.filter(w => w.toLowerCase().startsWith(t))
  // `que` finds `lv-queen`: a word inside an id when nothing starts with it
  if (!hits.length && t) hits = pool.filter(w => w.toLowerCase().includes(t))
  hits.sort()
  if (!hits.length) return null
  const fill = (s: string) => ({ line: before + s + tail, caret: before.length + s.length })
  if (hits.length === 1) { const s = hits[0] + (tail.startsWith(' ') ? '' : ' '); return { ...fill(s), options: [] } }
  const p = common(hits)
  return p.length > token.length && hits.every(h => h.toLowerCase().startsWith(t)) ? { ...fill(p), options: [] } : { line, caret, options: hits }
}

/** Edit distance with swaps counted as one (optimal string alignment): `opne` is one away from `open`. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[a.length][b.length]
}

/** The closest word in `pool` to a mistyped one, if any is close enough to be a typo. */
export function nearest(word: string, pool: readonly string[]): string | undefined {
  const w = word.toLowerCase().slice(0, 40)
  if (!w) return undefined
  const limit = w.length <= 4 ? 1 : w.length <= 7 ? 2 : 3
  let best: string | undefined, bd = Infinity
  for (const p of pool) {
    const d = p.toLowerCase().startsWith(w) && w.length >= 2 ? 0.5 : distance(w, p.toLowerCase())
    if (d < bd) { bd = d; best = p }
  }
  return bd <= limit ? best : undefined
}
