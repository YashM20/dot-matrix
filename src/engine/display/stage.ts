/**
 * The display stage: a post-raster pass that shows a card's rasterized dots as a physical display.
 * Input = the card canvas (dots on transparent, backing px); output = one 2D canvas the same size.
 * Browser Canvas 2D only (no WebGL, no deps); every skin stays on GPU-friendly ops (drawImage, composite
 * modes, mip downsamples, one colour-matrix filter) and never reads pixels back.
 *
 *   crt      afterglow persistence (max(v, old·e^(−Δt/τ))), 2-level mip bloom, scanlines, barrel glass; power-on collapse
 *   vfd      neutrals → the accent's phosphor (the accent itself kept), glow, diamond mesh + filament wires; warm-up
 *   nixie    neutrals → warm neon, 3-level glow, hex anode mesh; ignition flicker
 *
 * Time `t` is seconds on any monotonic clock the caller owns (the engine never reads the time itself).
 */
import { hash01 } from '../math'
import { dot480 } from '../theme/tokens'
import { decayFactor, settleSeconds } from './afterglow'
import { SKIN_PHYSICS, phosphorMatrix, rgbOf, skinPhosphor, type AccentLit, type Phosphor, type SkinName } from './skins'

type C2D = CanvasRenderingContext2D
interface Surface { c: HTMLCanvasElement; x: C2D }

export interface StageOptions {
  /** Card grid (cells) and the backing size of the frames (px). */
  cols: number; rows: number; w: number; h: number
  /** Seconds after the first frame before the power-on refresh starts (a page-wide scan). */
  delay?: number
  /** The board's accent (`#RRGGBB`, the theme's `dotActive`; default dot480's): VFD glows in it, every skin passes it through. */
  accent?: string
  /** Skip the power-on refresh (a resize, reduced motion): the first frame lands settled. */
  instant?: boolean
  doc?: Document
}
export interface DisplayStage {
  readonly skin: SkinName
  /** A new card frame (any CanvasImageSource; scaled to w × h). */
  frame(src: CanvasImageSource, t: number): void
  /** Draw the display at t into `out` (a w × h canvas). True while it needs more frames (decay, power-on). */
  render(out: C2D, t: number): boolean
  dispose(): void
}

const smooth = (x: number) => { const s = Math.max(0, Math.min(1, x)); return s * s * (3 - 2 * s) }

function surface(doc: Document, w: number, h: number, settings?: CanvasRenderingContext2DSettings): Surface {
  const c = doc.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const x = c.getContext('2d', settings) as C2D
  return { c, x }
}
const black = (s: Surface | C2D, w: number, h: number) => {
  const x = 'x' in s ? s.x : s
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.fillStyle = '#000'; x.fillRect(0, 0, w, h)
}

/**
 * One hidden SVG colour-matrix filter per (skin, accent), shared by every stage on the page: VFD sends neutrals
 * to the accent's light and keeps the accent; Nixie sends them to its neon and passes only the red column (physics).
 */
function phosphorFilter(doc: Document, skin: AccentLit | 'nixie', accent: string): { url: string; phosphor: Phosphor } {
  const a = skin === 'nixie' ? undefined : rgbOf(accent), phosphor = skin === 'nixie' ? SKIN_PHYSICS.nixie.phosphor : skinPhosphor(skin, a!)
  const id = a ? `dm-phosphor-${skin}-${accent.slice(1).toLowerCase()}` : 'dm-phosphor-nixie'
  return { url: matrixFilter(doc, id, phosphorMatrix(phosphor, a)), phosphor }
}
/** A shared hidden SVG feColorMatrix filter (sRGB) by id; returns its `url(#id)`. */
function matrixFilter(doc: Document, id: string, values: number[]): string {
  if (!doc.getElementById(id)) {
    const ns = 'http://www.w3.org/2000/svg'
    let host = doc.getElementById('dm-display-filters') as SVGSVGElement | null
    if (!host) {
      host = doc.createElementNS(ns, 'svg') as SVGSVGElement
      host.id = 'dm-display-filters'; host.setAttribute('aria-hidden', 'true'); host.setAttribute('width', '0'); host.setAttribute('height', '0')
      host.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none')
      doc.body.appendChild(host)
    }
    const filter = doc.createElementNS(ns, 'filter'), m = doc.createElementNS(ns, 'feColorMatrix')
    filter.id = id; filter.setAttribute('color-interpolation-filters', 'sRGB')
    m.setAttribute('type', 'matrix'); m.setAttribute('values', values.join(' '))
    filter.appendChild(m); host.appendChild(filter)
  }
  return `url(#${id})`
}
/** Mip chain for cheap bloom: each level a 1/k downsample; drawn back up with `lighter` at its alpha. */
function mips(doc: Document, w: number, h: number, ks: readonly number[]): Surface[] {
  return ks.map(k => { const s = surface(doc, Math.max(4, w / k), Math.max(4, h / k), { alpha: false }); s.x.imageSmoothingQuality = 'high'; return s })
}
function bloom(dst: C2D, src: HTMLCanvasElement, levels: Surface[], alphas: readonly number[], w: number, h: number) {
  let prev: HTMLCanvasElement = src
  for (const m of levels) { m.x.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, m.c.width, m.c.height); prev = m.c }
  dst.globalCompositeOperation = 'lighter'
  dst.imageSmoothingEnabled = true
  levels.forEach((m, i) => { dst.globalAlpha = alphas[i]; dst.drawImage(m.c, 0, 0, w, h) })
  dst.globalAlpha = 1; dst.globalCompositeOperation = 'source-over'
}

/** A static multiply layer (scanlines, meshes): white with dark structure. */
function layer(doc: Document, w: number, h: number, draw: (x: C2D) => void): Surface {
  const s = surface(doc, w, h, { alpha: false })
  s.x.fillStyle = '#fff'; s.x.fillRect(0, 0, w, h); draw(s.x)
  return s
}
const multiply = (dst: C2D, s: Surface) => { dst.globalCompositeOperation = 'multiply'; dst.drawImage(s.c, 0, 0); dst.globalCompositeOperation = 'source-over' }

/** Barrel glass: rows shrink towards the top/bottom, then columns towards the sides (separable, 24 strips each). */
function barrel(dst: C2D, src: HTMLCanvasElement, tmp: Surface, w: number, h: number, k: number, sy = 1) {
  const n = 24
  black(tmp, w, h)
  for (let i = 0; i < n; i++) {
    const y0 = Math.floor(i * h / n), y1 = Math.floor((i + 1) * h / n), v = (y0 + y1) / h - 1, s = 1 - k * v * v, dw = w * s
    tmp.x.drawImage(src, 0, y0, w, y1 - y0, (w - dw) / 2, y0, dw, y1 - y0)
  }
  black(dst, w, h)
  for (let j = 0; j < n; j++) {
    const x0 = Math.floor(j * w / n), x1 = Math.floor((j + 1) * w / n), u = (x0 + x1) / w - 1, dh = h * (1 - k * u * u) * sy
    if (dh >= .5) dst.drawImage(tmp.c, x0, 0, x1 - x0, h, x0, (h - dh) / 2, x1 - x0, dh)
  }
}

export function createDisplayStage(skin: SkinName, o: StageOptions): DisplayStage | null {
  if (skin === 'oled') return null
  const doc = o.doc ?? document, { cols, rows } = o, w = Math.max(1, Math.round(o.w)), h = Math.max(1, Math.round(o.h))
  const cw = w / cols, ch = h / rows
  const accent = /^#[0-9a-f]{6}$/i.test(o.accent ?? '') ? o.accent! : dot480.dotActive
  const raw = surface(doc, w, h, { alpha: false })
  black(raw, w, h)
  let start: number | null = o.instant ? -1e9 : null, changedAt = -Infinity
  /** 0..1 through the power-on refresh (counted from the first render + delay). */
  const powerOn = (t: number, onS: number) => { start ??= t + (o.delay ?? 0); return onS > 0 ? (t - start) / onS : 1 }
  const frame = (src: CanvasImageSource, t: number) => {
    black(raw, w, h)
    raw.x.imageSmoothingEnabled = true
    raw.x.drawImage(src, 0, 0, w, h)
    changedAt = t
  }
  const base = { skin, frame, dispose() { raw.c.width = raw.c.height = 0 } }

  if (skin === 'crt') {
    const P = SKIN_PHYSICS.crt, persist = surface(doc, w, h, { alpha: false }), comp = surface(doc, w, h, { alpha: false }), tmp = surface(doc, w, h, { alpha: false })
    black(persist, w, h)
    const levels = mips(doc, w, h, [4, 16])
    const period = Math.max(2, Math.round(ch / 2))
    const scan = layer(doc, w, h, x => {
      for (let y = 0; y < h; y++) {
        const v = Math.round(255 * (1 - P.scanline * (.5 - .5 * Math.cos(2 * Math.PI * (y + .5) / period))))
        x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, y, w, 1)
      }
    })
    let last: number | null = null
    return {
      ...base,
      render(out, t) {
        const dt = last === null ? 1 : t - last; last = t
        const px = persist.x
        px.globalCompositeOperation = 'source-over'; px.globalAlpha = 1 - decayFactor(dt, P.tau); px.fillStyle = '#000'; px.fillRect(0, 0, w, h)
        px.globalAlpha = 1; px.globalCompositeOperation = 'lighten'; px.drawImage(raw.c, 0, 0); px.globalCompositeOperation = 'source-over'
        comp.x.drawImage(persist.c, 0, 0)
        bloom(comp.x, persist.c, levels, P.bloom, w, h)
        multiply(comp.x, scan)
        // power-on: a beam line draws across, then the raster opens vertically from it
        const p = powerOn(t, P.onS)
        const line = Math.min(1, Math.max(0, p / .25)), open = p < .25 ? 0 : smooth((p - .25) / .75)
        if (p < 0) { black(out, w, h); return true }
        barrel(out, comp.c, tmp, w, h, P.curvature, p >= 1 ? 1 : Math.max(.004, open * (1 + .04 * Math.sin(open * Math.PI))))
        if (p < 1) {
          const a = 1 - open
          out.globalCompositeOperation = 'lighter'; out.globalAlpha = .9 * a
          out.fillStyle = '#E6F2FF'; out.fillRect(w / 2 - w * line / 2, h / 2 - Math.max(1, ch * .35), w * line, Math.max(2, ch * .7))
          out.globalAlpha = 1; out.globalCompositeOperation = 'source-over'
        }
        return p < 1 || t - changedAt < settleSeconds(P.tau)
      },
    }
  }

  // vfd, nixie: a colour-matrix phosphor, glow and a mesh over the glass
  const P = SKIN_PHYSICS[skin], comp = surface(doc, w, h, { alpha: false })
  const filter = phosphorFilter(doc, skin, accent).url
  const levels = mips(doc, w, h, skin === 'vfd' ? [4, 14] : [4, 12, 32])
  const mesh = layer(doc, w, h, x => {
    x.strokeStyle = `rgba(0,0,0,${P.mesh})`; x.lineWidth = Math.max(1, cw * .22)
    x.beginPath()
    if (skin === 'vfd') {
      // diamond wire mesh, ~1.6 cells, plus three filament wires across the glass
      const s = cw * 1.6
      for (let d = -h; d < w + h; d += s) { x.moveTo(d, 0); x.lineTo(d + h, h); x.moveTo(d, h); x.lineTo(d + h, 0) }
      x.stroke()
      x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = Math.max(1, ch * .15); x.beginPath()
      for (const f of [.27, .5, .73]) { x.moveTo(0, h * f); x.lineTo(w, h * f) }
    } else {
      // hex anode mesh, ~2.4 cells across a cell
      const r = cw * 1.4, dx = r * Math.sqrt(3), dy = r * 1.5
      for (let j = 0, y = 0; y < h + r; j++, y += dy) for (let x0 = j % 2 ? dx / 2 : 0; x0 < w + dx; x0 += dx) {
        for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = x0 + r * Math.cos(a), py = y + r * Math.sin(a); if (k) x.lineTo(px, py); else x.moveTo(px, py) }
      }
    }
    x.stroke()
  })
  return {
    ...base,
    render(out, t) {
      comp.x.filter = filter; comp.x.drawImage(raw.c, 0, 0); comp.x.filter = 'none'
      bloom(comp.x, comp.c, levels, P.bloom, w, h)
      multiply(comp.x, mesh)
      const p = powerOn(t, P.onS)
      black(out, w, h)
      // warm-up (filament) / ignition: brightness ramps in with a stutter, the glow overshoots a touch on the nixie
      const flick = p >= 1 ? 1 : p < 0 ? 0 : smooth(p) * (p < .7 ? .45 + .55 * hash01(Math.floor(t * (skin === 'vfd' ? 24 : 40)), 7) : 1)
      out.globalAlpha = flick; out.drawImage(comp.c, 0, 0); out.globalAlpha = 1
      return p < 1
    },
  }
}
