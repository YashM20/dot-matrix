/**
 * Checks for the ASCII glyph tiles (#36, docs/living-matter/Q-squares.md Q3.10): the glyph ramp rises in ink and is
 * the 5 × 7 font pixel for pixel; every tile holds a ramp glyph, each write moves the cursor one tile and changes at
 * most the tile it wrote, at the loop wrap too, and one redraw uses the whole ramp; and the card (each tile's square
 * dots are its glyph's bitmap on the card grid, the red is the cursor block alone, the loop wraps, frame time).
 * Called from verify.ts (`asciiChecks(assert)`); also runnable alone: `npx tsx scripts/ascii.ts`.
 * Timings are warnings unless DOT_TIMING=strict (scripts/lib/check.ts).
 */
import { ASCII57, ASCII_RAMP, ASCII_SCREEN, asciiCount, asciiFrame, asciiLoop, asciiPeriod, asciiTiles } from '../src/engine/squares/ascii'
import { RAMP_GLYPHS, glyph } from '../src/engine/fields/bitmapFont'
import { installSquares } from '../src/engine/squares'
import { sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import type { DotInstance } from '../src/engine/types'
import { withChrome } from '../src/widgets'
import { ASCII_CARD, sqAscii } from '../src/widgets/boards/squaresAscii'
import { sampleCard } from './lib/cards'
import { detLint } from './lib/detLint'
import { fmtLoaded, medianLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void

export function asciiChecks(assert: Assert): void {
  installSquares()
  const S = ASCII_SCREEN, n = asciiTiles(S), period = asciiPeriod(S), ramp = ASCII57.ramp, area = ASCII57.w * ASCII57.h

  // ── the ramp ───────────────────────────────────────────────────────────────────────────────────────
  {
    const inks = ramp.map(g => Math.round(g.ink * area))
    const rising = inks.every((k, i) => i === 0 || k > inks[i - 1])
    assert('ascii: ramp (ten glyphs in ramp order, ink strictly rising from the blank)', ramp.length === ASCII_RAMP.length && ramp.every((g, i) => g.ch === ASCII_RAMP[i]) && inks[0] === 0 && rising, `${[...ASCII_RAMP].map((c, i) => `'${c}' ${inks[i]}`).join(', ')} of ${area}`)
    let off = 0
    for (const g of ramp) {
      if (g.ch === '@') continue
      const ramp = RAMP_GLYPHS[g.ch as keyof typeof RAMP_GLYPHS], f = ramp ? ramp.map(r => [...r].map(b => b === '1')) : glyph(g.ch)
      for (let y = 0; y < ASCII57.h; y++) for (let x = 0; x < ASCII57.w; x++) if ((f[y][x] ? 1 : 0) !== g.bits[y * ASCII57.w + x]) off++
    }
    assert('ascii: font glyphs (every ramp glyph but @ is the 5 × 7 font bitmap, or its dense ramp form for % and *, pixel for pixel)', off === 0, `${off} pixels off`)
    const det = detLint(['src/engine/squares/ascii'])
    assert('det: no engine-specific Math in the ASCII screen (in the determinism lint)', !det.violations.length && det.scanned.length === 1, det.violations.map(x => `${x.file}:${x.line} ${x.rule}`).join('; ') || `${det.scanned.length} files`)
  }

  // ── the screen ─────────────────────────────────────────────────────────────────────────────────────
  {
    let outside = 0, jumps = 0, extra = 0
    for (const c of [0, 1, 133, n - 1, n, 2 * n + 17, period - n, period - 2, period - 1]) {
      const a = asciiFrame(S, c), b = asciiFrame(S, c + 1)
      for (const g of a.glyph) if (g >= ramp.length) outside++
      if (b.cursor !== (a.cursor + 1) % n) jumps++
      for (let i = 0; i < n; i++) if (i !== a.cursor && a.glyph[i] !== b.glyph[i]) extra++
    }
    const w0 = asciiFrame(S, period), w1 = asciiFrame(S, 0), same = w0.glyph.every((g, i) => g === w1.glyph[i]) && w0.cursor === w1.cursor
    assert('ascii: tiles (every tile holds a ramp glyph; each write moves the cursor one tile and changes no tile but the one it wrote, across the loop wrap too)', outside === 0 && jumps === 0 && extra === 0 && same, `${outside} off the ramp, ${jumps} cursor jumps, ${extra} other tiles changed`)
    // one redraw: the tile written at each count, over a whole pass of the screen
    const seen = new Set<number>()
    for (let c = 0; c < n; c++) seen.add(asciiFrame(S, c + 1).glyph[c])
    assert('ascii: the whole ramp (one redraw writes every glyph of the ramp at least once)', seen.size === ramp.length, `${seen.size} of ${ramp.length} glyphs`)
  }

  // ── the card ───────────────────────────────────────────────────────────────────────────────────────
  {
    const { origin: [ox, oy], offset } = ASCII_CARD, pitch = sqAscii.grid.pitch, loop = asciiLoop(S)
    const cellOf = (d: DotInstance) => [Math.round(d.x / pitch - .5), Math.round(d.y / pitch - .5)] as const
    const inScreen = (c: number, r: number) => c >= ox && r >= oy && c < ox + S.cols * S.pitch && r < oy + S.rows * S.pitchY
    const tileOf = (c: number, r: number) => Math.floor((r - oy) / S.pitchY) * S.cols + Math.floor((c - ox) / S.pitch)
    // per tile: the card's dots against the frame's glyph (lit pixels in value, unlit in faint, the cursor all red)
    let wrong = 0, gutter = 0, red = 0, strayRed = 0
    for (const t of [0, 1.3, 23.7]) {
      const f = asciiFrame(S, asciiCount(S, t, offset)), seen = new Map<number, string>()
      for (const d of sampleCard(sqAscii, t)) {
        const [c, r] = cellOf(d)
        if (d.color === dot480.dotActive) { red++; if (!inScreen(c, r) || tileOf(c, r) !== f.cursor) strayRed++ }
        if (!inScreen(c, r)) continue
        const lx = (c - ox) % S.pitch, ly = (r - oy) % S.pitchY
        if (lx >= ASCII57.w || ly >= ASCII57.h) { gutter++; continue }
        seen.set(tileOf(c, r) * area + ly * ASCII57.w + lx, d.color)
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < area; k++) {
        const want = i === f.cursor ? dot480.dotActive : ramp[f.glyph[i]].bits[k] ? dot480.value : dot480.dotFaint
        if (seen.get(i * area + k) !== want) wrong++
      }
    }
    assert('ascii: card pixels (t 0, 1.3, 23.7: every glyph pixel is one square dot on the card grid, lit in value and unlit in faint as the ramp glyph says, gutters empty)', wrong === 0 && gutter === 0, `${wrong} pixels wrong, ${gutter} dots in gutters`)
    assert('ascii: one red (the cursor block, 35 dots per frame, and nothing red outside it)', red === 3 * area && strayRed === 0, `${red} red over 3 frames, ${strayRed} outside the cursor`)
    const keys = (t: number, skip?: Set<number>) => sampleCard(sqAscii, t).filter(d => {
      const [c, r] = cellOf(d)
      return !skip || (inScreen(c, r) && !skip.has(tileOf(c, r)))
    }).map(d => `${d.x},${d.y},${d.r},${d.opacity},${d.color},${d.join}`).join()
    const wrap = period / S.rate - offset, a = asciiFrame(S, asciiCount(S, wrap - 1e-3, offset)), b = asciiFrame(S, asciiCount(S, wrap + 1e-3, offset))
    const skip = new Set([a.cursor, b.cursor])
    assert('ascii: loop (t and t + one loop draw the same card; where the loop wraps only the cursor\'s two tiles change on the screen)', keys(1.3) === keys(1.3 + loop) && keys(0) === keys(loop) && keys(wrap - 1e-3, skip) === keys(wrap + 1e-3, skip) && a.count === period - 1 && b.count === 0, `loop ${loop} s, wrap at t ${wrap.toFixed(2)}: count ${a.count} → ${b.count}`)

    const frame = (t: number) => sampleLayersInto(withChrome(sqAscii)({ t, data: {} }), sqAscii.grid, sqAscii.style, dot480)
    for (let i = 0; i < 4; i++) frame(i / 12)
    const r = medianLoaded(i => frame(1.5 + i * .37), 13)
    assert('ascii: sq-ascii frame ≤ 4 ms (layers + sample, median warm × load)', r.ms <= 4 * r.load, `${fmtLoaded(r)}, ${frame(1.5).n} dots`)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('ascii')
  asciiChecks(assert)
  done()
}
