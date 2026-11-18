/**
 * Dot-level checks for the POND board (#246), one per fixed defect, each failing on the board before the fix:
 * - `pond-koi`: the accent sits on one dot pitch (the koi's lattice dots, never a tile glyph), and the bank fades
 *   toward the card edge (its ink falls band by band away from the water).
 * - Big tile dots sit centred on the 3 × 3 glyph box they stand for, so a lattice dot keeps more air to the tile
 *   glyphs beside it than two lattice dots keep to each other (`pond-marble`'s koi touched the ink, `pond-koi` too).
 * - `pond-fireflies`: the grass follows its blades, so most grass tiles are not one snapped line glyph.
 * - `pond-murmur`: one dot per bird, so few tiles show a whole 3-dot line glyph.
 * - `pond-turing`: the skin draws no spot dots (no 3 × 3 blocks); each counted spot is a site, clear of the eye.
 * Called from scripts/life.ts (`lifeChecks`); also runnable alone: `pnpm exec tsx scripts/life-pond-dots.ts`.
 */
import { BIRDS, EDGE3, falconView, RAMP3 } from '../src/engine/life'
import { SKIN_NX } from '../src/engine/life/turing'
import { spotCount } from '../src/engine/life/turingView'
import { worldAt, worldReset } from '../src/engine/physics/world'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import type { DotInstance, Layer } from '../src/engine/types'
import { withChrome, type WidgetPreset } from '../src/widgets/types'

type Assert = (name: string, cond: boolean, detail?: string) => void
type PondModule = typeof import('../src/widgets/boards/pond/index')

/** Card px per cell on the TILE grid. */
const PX = 2.25
const TS = [0, 1.3, 7.1, 13.4, 21.7, 33.2, 41.9]
const dotsOf = (p: WidgetPreset, t: number): DotInstance[] =>
  sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480).filter(d => d.opacity > 0 && d.r > 0)
/** The lit card cells of a tile raster's tile (3 × 3 glyph box), as a 9-bit mask. */
function tileMask(tone: Int8Array, cardW: number, x0: number, y0: number, only?: (t: number) => boolean): number {
  let m = 0
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const t = tone[(y0 + y) * cardW + x0 + x]; if (t >= 0 && (!only || only(t))) m |= 1 << (y * 3 + x) }
  return m
}
const glyphMask = (bits: Uint8Array) => { let m = 0; for (let i = 0; i < 9; i++) if (bits[i]) m |= 1 << i; return m }
const LINES = new Set(['-', '|', '\\', '/'].map(c => glyphMask(EDGE3.glyphs.find(g => g.ch === c)!.bits)))

export async function pondDotChecks(assert: Assert, pond: () => Promise<PondModule>): Promise<void> {
  const { pondBoard, pondWorlds, pondProbe } = await pond()
  // the card modules the pond index loaded (after the caller pinned the clock)
  const { murmurProbe } = await import('../src/widgets/boards/pond/murmur'), { turingProbe } = await import('../src/widgets/boards/pond/turing')
  const { firefliesProbe } = await import('../src/widgets/boards/pond/fireflies')
  const card = (id: string) => pondBoard.find(p => p.id === id)!
  const reset = () => { for (const w of pondWorlds) worldReset(w) }
  reset()

  // ── koi: one accent pitch ──
  const koi = card('pond-koi'), redSmall: string[] = []
  for (const t of TS) for (const d of dotsOf(koi, t)) if (d.color === dot480.dotActive && d.r < 2) redSmall.push(`t=${t} r=${d.r.toFixed(2)}`)
  assert('pond-koi: red only on the koi\'s lattice dots, never on a tile glyph (#246)', redSmall.length === 0, `${redSmall.length} small red dots, e.g. ${redSmall.slice(0, 3).join(', ')}`)

  // ── koi: the bank fades toward the card edge ──
  const kp = pondProbe.koi.pond, { cols, rows, pitch, ox, oy } = kp.spec.tiles, band = [0, 0, 0], bn = [0, 0, 0]
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const i = ty * cols + tx
    if (kp.water[i]) continue
    const d = kp.spec.sdf(ox + tx * pitch + 1.5, oy + ty * pitch + 1.5), b = d < 6 ? 0 : d < 14 ? 1 : 2
    band[b] += kp.bank[i] >= 0 ? RAMP3.glyphs[kp.bank[i]].ink : 0; bn[b]++
  }
  const ink = band.map((s, k) => s / Math.max(1, bn[k]))
  assert('pond-koi: the bank\'s ink falls away from the water (near > middle > outer, outer under half the near) (#246)',
    ink[0] > ink[1] && ink[1] > ink[2] && ink[2] < ink[0] / 2, ink.map(v => v.toFixed(3)).join(' > '))

  // ── big tile dots centred on their glyph box ──
  for (const id of ['pond-koi', 'pond-marble']) {
    let worst = Infinity, at = ''
    for (const t of TS) {
      const ds = dotsOf(card(id), t), big = ds.filter(d => d.r > 2), fine = ds.filter(d => d.r < 1.2 && d.y > 11 * PX)
      for (const b of big) for (const f of fine) {
        const g = Math.hypot(b.x - f.x, b.y - f.y) - b.r - f.r
        if (g < worst) { worst = g; at = `t=${t} (${(b.x / PX).toFixed(1)}, ${(b.y / PX).toFixed(1)})` }
      }
    }
    assert(`${id}: a lattice dot keeps at least 1.5 px to the tile glyphs beside it (#246)`, Number.isFinite(worst) && worst >= 1.5, `${worst.toFixed(2)} px at ${at}`)
  }

  // ── fireflies: grass along its blades (read off the card's own raster: the flies keep above row 112, the grass
  // is the bottom 26 rows, so nothing covers it) ──
  const ff = pondProbe.fireflies, fg = ff.spec.tiles
  card('pond-fireflies').layers({ t: 1.3, data: {} })
  const fr = firefliesProbe.raster
  let gt = 0, gl = 0, missing = 0
  for (const i of ff.grass) if (fr.tone[i] < 0) missing++
  for (let ty = Math.ceil((118 - fg.oy) / fg.pitch); ty < fg.rows; ty++) for (let tx = 0; tx < fg.cols; tx++) {
    const m = tileMask(fr.tone, fr.cardW, fg.ox + tx * fg.pitch, fg.oy + ty * fg.pitch)
    if (!m) continue
    gt++; if (LINES.has(m)) gl++
  }
  assert('pond-fireflies: the card draws every grass cell, and under half its grass tiles are one snapped line glyph (#246)', missing === 0 && gt > 30 && gl / gt < .5, `${gl} of ${gt} tiles, ${missing} grass cells missing`)

  // ── murmur: one dot per bird ──
  const mur = card('pond-murmur')
  let mt = 0, ml = 0, birds = 0, unlit = 0
  for (const t of TS) {
    mur.layers({ t, data: {} })
    const r = murmurProbe.raster, g = r.grid
    // every bird in the sky lights its own card cell (two birds in one cell share a dot), except under the falcon
    const ms = worldAt(pondProbe.murmur.world, t), { X, Y } = pondProbe.murmur.layout, f = falconView(pondProbe.murmur, ms)
    for (let i = 0; i < BIRDS; i++) {
      const x = ms[X + i], y = ms[Y + i]
      if (x < g.ox || y < g.oy || x >= g.ox + g.cols * g.pitch || y >= g.oy + g.rows * g.pitch || Math.hypot(x - f.x, y - f.y) < 9) continue
      birds++; if (r.tone[Math.floor(y) * r.cardW + Math.floor(x)] < 0) unlit++
    }
    for (let ty = 0; ty < g.rows; ty++) for (let tx = 0; tx < g.cols; tx++) {
      const m = tileMask(r.tone, r.cardW, g.ox + tx * g.pitch, g.oy + ty * g.pitch, k => k !== 5)
      if (!m) continue
      mt++; if (LINES.has(m)) ml++
    }
  }
  assert('pond-murmur: every bird lights its own cell (#246)', birds > 1000 && unlit === 0, `${unlit} of ${birds} birds unlit`)
  assert('pond-murmur: the flock is no longer lined up: under 15% of its tiles show a whole line glyph (#246)', mt > 100 && ml / mt < .15, `${ml} of ${mt} tiles`)

  // ── turing: spots as sites ──
  const tur = card('pond-turing'), probe = turingProbe
  let blocks = 0, short = 0, near = 0, seen = 0
  for (const t of [9, 15, 22, 26, 30, 34]) {
    const ls = tur.layers({ t, data: {} })
    const skin = ls.find(l => l.lattice === 2 && l.toneOf) as Layer
    const skinDots = sampleLayers([skin], tur.grid, tur.style, dot480).filter(d => d.opacity > 0 && d.r > 0)
    blocks += skinDots.filter(d => d.color === dot480.value || d.color === dot480.dotActive).length
    const sites = ls.filter(l => l.sites && (l.tone === 'value' || l.tone === 'active') && (l.size ?? 0) >= 2)
    const n = sites.reduce((a, l) => a + l.sites!.length, 0), want = spotCount(probe.spots()), p = probe.pose()
    // only while the whole fish is in the pond: a spot whose site would leave the card is not drawn
    if (want && p.headX <= 140 && p.headX - 1.3 * SKIN_NX * p.px >= 3) {
      seen++
      // one site per counted spot, and the splitting one is two lobes
      const sp = probe.spots(), split = sp.splitting >= 0 && sp.spots[sp.splitting].cells >= 3 ? 1 : 0
      if (n !== want + split) short++
    }
    const eye = probe.eye()
    for (const l of sites) for (const [x, y] of l.sites!) if (Math.hypot(x - eye[0], y - eye[1]) < eye[2] + (l.size ?? 0) / 2 + .9) near++
  }
  assert('pond-turing: the skin draws no spot dots (the spots are sites, not blocks of fine dots) (#246)', blocks === 0, `${blocks} spot dots on the skin lattice`)
  assert('pond-turing: one site per counted spot (two for the splitting one) while the fish is in the pond', seen > 3 && short === 0, `${short} of ${seen} frames off`)
  assert('pond-turing: spot sites keep a cell of air to the eye ring', near === 0, `${near} sites at the eye`)
  reset()
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/life-pond-dots.ts')) {
  const { freezeWallClock } = await import('./lib/freeze')
  let failed = 0
  const assert: Assert = (name, cond, detail) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }
  await pondDotChecks(assert, async () => { freezeWallClock(); return import('../src/widgets/boards/pond/index') })
  process.exit(failed ? 1 : 0)
}
