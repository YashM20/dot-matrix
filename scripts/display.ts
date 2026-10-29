/**
 * C7 display-skin checks (the pure parts of `src/engine/display/`; the canvas stage is browser-only, see
 * scripts/skins-browser.ts). Called from verify.ts (`displayChecks(assert)`); also runnable alone.
 */
import { afterglow, decayFactor, settleSeconds } from '../src/engine/display/afterglow'
import { accentLit, applyMatrix, phosphorMatrix, rgbOf, SKIN_NAMES, SKIN_PHYSICS, isSkinName, skinPhosphor } from '../src/engine/display/skins'
import { ACCENTS } from '../src/site/theme/names'
import { tokensOf } from '../src/site/theme/tokens'
import { cellFrame, createEinkPanel, createFlipPanel } from '../src/engine/display/panels'
import type { Raster } from '../src/engine/raster/raster'

type Assert = (name: string, cond: boolean, detail?: string) => void

const hue = ([r, g, b]: readonly number[]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

export function displayChecks(assert: Assert): void {
  // afterglow: v′ = max(v, old·e^(−Δt/τ))
  const grid = { cols: 3, rows: 1, pitch: 4 }
  const r = (d: number[]): Raster => ({ grid, space: 'card', data: Float32Array.from(d) })
  const g = afterglow(r([1, 0, .2]), r([0, .5, .9]), .1, .1)
  assert('display: afterglow keeps max(new, old·e^(−Δt/τ))', Math.abs(g.data[0] - Math.exp(-1)) < 1e-6 && g.data[1] === .5 && Math.abs(g.data[2] - .9) < 1e-6, Array.from(g.data).join(','))
  assert('display: afterglow with no history is the frame; decay(0) = 1, settles in τ·ln 255', afterglow(null, r([.3, 0, 1]), 1, .1).data[0] === Float32Array.from([.3])[0] && decayFactor(0, .1) === 1 && Math.abs(settleSeconds(.1) - .1 * Math.log(255)) < 1e-9)

  // the one accent keeps its hue on the emissive skins; neutrals take the phosphor (no accent: the red column passes)
  const red = [1, .231, .188] as const, white = [.95, .95, .96] as const
  {
    const m = phosphorMatrix(SKIN_PHYSICS.nixie.phosphor), a = applyMatrix(m, red), w = applyMatrix(m, white)
    const dh = Math.min(Math.abs(hue(a) - hue(red)), 360 - Math.abs(hue(a) - hue(red)))
    assert(`display: red-column matrix keeps the red hue (Δ ${dh.toFixed(1)}°) and tints white to the neon`, dh < 12 && Math.abs(hue(w) - hue(SKIN_PHYSICS.nixie.phosphor)) < 12, `${a} / ${w}`)
  }

  // skin × accent (docs/LAYOUT-THEME-PLAN.md §4, decision 4): emissive skins are dark glass, so every dark-scheme
  // accent: VFD / LED glow in the accent's hue and pass the accent unchanged; greys, white, accent and the dim
  // accent map inside sRGB unclamped; lit dots ≥ 3:1 on the stage (black glass for VFD, the tinted unlit lens for LED).
  // Nixie takes no accent (orange neon, red column), so it is the red-column check above in every theme.
  const lum = (c: readonly number[]) => { const l = c.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2] }
  const contrast = (x: readonly number[], y: readonly number[]) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
  const raw = (m: number[], [r, g, b]: readonly number[]) => [0, 5, 10].map(i => m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 4])
  const hd = (x: readonly number[], y: readonly number[]) => { const d = Math.abs(hue(x) - hue(y)); return Math.min(d, 360 - d) }
  const accents = ACCENTS.map(id => ({ id, a: rgbOf(tokensOf('dark', id).dotActive), dim: rgbOf(tokensOf('dark', id).dotActiveDim ?? '#000000') }))
  const issues: string[] = []
  for (const { id, a, dim } of accents) for (const skin of ['vfd', 'led'] as const) {
    const p = skinPhosphor(skin, a), m = phosphorMatrix(p, a), tag = `${skin}×${id}`
    const out = [white, a, dim, [.5, .5, .5], [.18, .18, .19]].map(c => raw(m, c))
    if (out.flat().some(v => v < -1e-3 || v > 1 + 1e-3)) issues.push(`${tag} out of sRGB ${out.map(c => c.map(v => v.toFixed(2)).join('/')).join(' ')}`)
    if (raw(m, a).some((v, i) => Math.abs(v - a[i]) > 1e-6)) issues.push(`${tag} accent moves`)
    if (hd(raw(m, [1, 1, 1]), a) > 6) issues.push(`${tag} white → hue ${hue(raw(m, [1, 1, 1])).toFixed(0)}°, want ${hue(a).toFixed(0)}°`)
    if (lum(raw(m, [1, 1, 1])) < lum(a)) issues.push(`${tag} white dimmer than the accent`)
    const glass = skin === 'led' ? p.map(v => v * Math.min(1, SKIN_PHYSICS.led.offGlow * 2.6)) : [0, 0, 0]
    for (const [what, c] of [['white', out[0]], ['accent', out[1]]] as const) {
      const k = contrast(c, glass)
      if (k < 3) issues.push(`${tag} ${what} ${k.toFixed(2)}:1 on the stage`)
    }
  }
  assert(`display: ${accents.length} accents × vfd/led: hue, accent kept, sRGB, lit ≥ 3:1 on the stage`, !issues.length, issues.join('; '))
  assert('display: vfd / led follow the accent, nixie and crt do not', accentLit('vfd') && accentLit('led') && !accentLit('nixie') && !accentLit('crt'))
  assert('display: skin names', SKIN_NAMES.length === 7 && isSkinName('crt') && !isSkinName('accent'))

  // e-ink: first refresh is full (flash: inverted, then solid ink), partials leave ghosts
  const cols = 8, rows = 4, n = cols * rows, rgba = (on: (i: number) => boolean) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const v = on(i) ? 255 : 0; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255 } return d }
  const full = cellFrame(rgba(() => true), cols, rows), none = cellFrame(rgba(() => false), cols, rows)
  const ink = new Float32Array(n), P = SKIN_PHYSICS.eink
  const panel = createEinkPanel(cols, rows, P)
  const k0 = panel.push(full, 0)
  panel.at(P.fullS * .3, ink); const solid = ink.every(v => v === 1)
  panel.at(P.fullS + .01, ink); const inked = ink.every(v => v === 1)
  const ready = panel.ready(P.fullS + P.gapS + .01)
  const k1 = panel.push(none, 2)
  panel.at(2 + P.partialS + .01, ink)
  assert('display: e-ink full refresh flashes, then a partial leaves a ghost', k0 === 'full' && solid && inked && ready && k1 === 'partial' && ink.every(v => Math.abs(v - P.ghost) < 1e-6), `${k0} ${solid} ${inked} ${ready} ${k1} ${ink[0]}`)

  // flip-disc: a change sweeps by column and every disc settles on its new face
  const F = SKIN_PHYSICS.flipdisc, flip = createFlipPanel(cols, rows, F), face = new Uint8Array(n), tilt = new Float32Array(n)
  const ev = flip.push(full, 0, F.threshold)
  const midMoving = flip.at(.02, face, tilt)
  flip.at(2, face, tilt)
  assert('display: flip-disc column sweep, discs settle on the new face', ev.length === cols && ev[cols - 1].at > ev[0].at && ev[cols - 1].at <= F.sweepS + 1e-9 && midMoving > 0 && face.every(f => f === 1) && tilt.every(t => t === 1), `${ev.length} ${midMoving}`)
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  let fail = 0
  displayChecks((name, ok, detail) => { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`) })
  process.exit(fail ? 1 : 0)
}
