/**
 * The dot shell's screen: output lines folded into rows of the screen's width, the links in them, and the
 * `textAt` layers that draw the visible rows and the prompt on one grid (Field → Grid Sampler → Renderer, like
 * any card). The same rows feed the selectable text mirror over the dots, so both wrap at the same place.
 */
import { rectCells, textAt } from '../../engine/layout'
import { hasGlyph } from '../../engine/fields/bitmapFont'
import type { GridConfig, Layer, Tone } from '../../engine'
import type { Kind } from './shellRun'

export const LH = 9, PAD = 3, CW = 6
export interface Line { id: number; kind: Kind; text: string }
/** One screen row: a slice of a line, in code points, with the links that cross it. */
export interface Row { key: string; kind: Kind; text: string; parts: { text: string; href?: string }[] }

export const gridFor = (chars: number, lines: number): GridConfig => ({ cols: chars * CW + PAD * 2, rows: (lines + 1) * LH + PAD * 2, pitch: 2.25 })

/** Screen size from the window: up to 78 characters (dots stay ≥ ~2 px) and as many lines as fit 60% of the height. */
export function screenSize(): { chars: number; lines: number } {
  const w = Math.min(1000, innerWidth) - 32
  const chars = Math.max(30, Math.min(78, Math.floor((w / 2 - PAD * 2) / CW)))
  const dot = w / (chars * CW + PAD * 2), h = (window.visualViewport?.height ?? innerHeight) * 0.6
  return { chars, lines: Math.max(6, Math.min(18, Math.floor(h / (LH * dot)) - 1)) }
}

const URL = /https?:\/\/[^\s<>"'`]+/g
/** http(s) links in a line, as code-point ranges; anything that doesn't parse as a URL stays text. */
function links(cps: string[]): { from: number; to: number; href: string }[] {
  const s = cps.join(''), out: { from: number; to: number; href: string }[] = []
  for (const m of s.matchAll(URL)) {
    const raw = m[0].replace(/[.,;:!?)]+$/, '')
    try { const u = new globalThis.URL(raw); if (u.protocol !== 'http:' && u.protocol !== 'https:') continue } catch { continue }
    const from = [...s.slice(0, m.index)].length
    out.push({ from, to: from + [...raw].length, href: raw })
  }
  return out
}

/** Every line folded into rows of `chars` characters. */
export function toRows(lines: readonly Line[], chars: number): Row[] {
  const rows: Row[] = []
  for (const l of lines) {
    const cps = [...(l.kind === 'in' ? `> ${l.text}` : l.text)], ls = links(cps)
    for (let at = 0, n = 0; at < cps.length || n === 0; at += chars, n++) {
      const end = Math.min(cps.length, at + chars), parts: Row['parts'] = []
      let i = at
      for (const k of ls) {
        if (k.to <= at || k.from >= end) continue
        const a = Math.max(at, k.from), b = Math.min(end, k.to)
        if (a > i) parts.push({ text: cps.slice(i, a).join('') })
        parts.push({ text: cps.slice(a, b).join(''), href: k.href }); i = b
      }
      if (end > i || !parts.length) parts.push({ text: cps.slice(i, end).join('') })
      rows.push({ key: `${l.id}:${n}`, kind: l.kind, text: cps.slice(at, end).join(''), parts })
      if (end >= cps.length) break
    }
  }
  return rows
}

/** Into the 5×7 font: unknown glyphs draw as `?` (the text mirror keeps the real characters). */
const fold = (s: string) => [...s].map(ch => (ch === ' ' || hasGlyph(ch) ? ch : '?')).join('')
const TONE: Record<Kind, Tone> = { in: 'value', out: 'idle', dim: 'faint', err: 'mid' }

export interface Prompt { input: string; caret: number; busy: string | null; focused: boolean; below: number }

/** The visible rows and the prompt line, each a `textAt` field on one grid. */
export function screenLayers(grid: GridConfig, rows: readonly Row[], chars: number, lines: number, p: Prompt): Layer[] {
  const ls: Layer[] = []
  rows.forEach((r, i) => {
    let col = 0
    for (const part of r.parts) {
      if (part.text.trim()) ls.push({ field: textAt(grid, fold(part.text), PAD + col * CW, PAD + i * LH), tone: part.href ? 'value' : TONE[r.kind] })
      col += [...part.text].length
    }
  })
  const y = PAD + lines * LH, vis = chars - 2
  ls.push({ field: textAt(grid, '>', PAD, y), tone: p.busy ? 'faint' : 'active' })
  if (p.busy && !p.input) {
    ls.push({ field: textAt(grid, fold(`running ${p.busy}`.slice(0, vis - 16) + ' · ctrl+c stops'), PAD + 2 * CW, y), tone: 'faint' })
    return ls
  }
  // the line scrolls sideways to keep the caret in view; the cursor sits on the caret
  const off = Math.max(0, p.caret - (vis - 1)), shown = [...p.input].slice(off, off + vis), at = p.caret - off
  const x0 = PAD + 2 * CW, cursor: Tone = p.focused ? 'active' : 'faint'
  const before = shown.slice(0, at).join(''), after = shown.slice(at + 1).join('')
  if (before.trim()) ls.push({ field: textAt(grid, fold(before), x0, y), tone: 'value' })
  if (after.trim()) ls.push({ field: textAt(grid, fold(after), x0 + (at + 1) * CW, y), tone: 'value' })
  if (at >= shown.length) ls.push({ field: textAt(grid, '■', x0 + at * CW, y), tone: cursor })
  else {
    if (shown[at] !== ' ') ls.push({ field: textAt(grid, fold(shown[at]), x0 + at * CW, y), tone: cursor })
    ls.push({ field: rectCells(grid, x0 + at * CW, y + 8, 5, 1), tone: cursor })
  }
  const more = `pgdn +${p.below}`
  if (p.below > 0 && 2 + shown.length + more.length + 2 < chars) ls.push({ field: textAt(grid, more, grid.cols - PAD - 1, y, { align: 'right' }), tone: 'faint' })
  return ls
}
