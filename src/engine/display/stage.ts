/**
 * The display stage: a post-raster pass that shows a card's rasterized dots as a physical display.
 * Input = the card canvas (dots on transparent, backing px); output = one 2D canvas the same size.
 * Browser Canvas 2D only (no WebGL, no deps); emissive skins stay on GPU-friendly ops (drawImage,
 * composite modes, mip downsamples, one colour-matrix filter), the reflective ones (e-ink, flip-disc)
 * read back a cols × rows cell image a few times a second at most.
 *
 *   crt      afterglow persistence (max(v, old·e^(−Δt/τ))), 2-level mip bloom, scanlines, barrel glass; power-on collapse
 *   vfd      neutrals → the accent's phosphor (the accent itself kept), glow, diamond mesh + filament wires; warm-up
 *   led      cell average → round lens per cell in the accent's LED colour, unlit lenses visible, 1-cell bleed; row scan-in
 *   eink     1-bit blue-noise ink on paper, partial refresh ghosts, full-refresh flash (first refresh is full)
 *   flipdisc 2-tone discs, column sweep, underdamped flips (device physics), clack events
 *   nixie    neutrals → warm neon, 3-level glow, hex anode mesh; ignition flicker
 *   lcd      reflective LCD: cell average, symmetric liquid-crystal lag (τ), square pixels with a clear gutter, ink on a
 *            pale backplane with the pixels' shadow under them; the accent prints as pigment; pixels fade in from blank
 *   grout    mosaic: one flat tile per cell on grout lines, a 1 px bevel, a fixed ± luma jitter per tile; tiles set in a sweep
 *
 * Time `t` is seconds on any monotonic clock the caller owns (the engine never reads the time itself).
 */
import { hash01 } from '../math'
import { dot480 } from '../theme/tokens'
import { decayFactor, ghostStep, settleSeconds } from './afterglow'
import { cellFrame, createEinkPanel, createFlipPanel } from './panels'
import { SKIN_PHYSICS, lcdMatrix, phosphorMatrix, rgbOf, skinPhosphor, type AccentLit, type Phosphor, type SkinName } from './skins'

type C2D = CanvasRenderingContext2D
interface Surface { c: HTMLCanvasElement; x: C2D }

export interface StageColors {
  /** Flip-disc bright face, black face and panel; e-ink paper and ink. */
  bright: string; off: string; panel: string; paper: string; ink: string
  /** Mosaic (grout skin): an unlit tile (the card surface) and the grout between tiles. */
  tile: string; grout: string
}
/**
 * Physics colours of the reflective skins. Disc faces and ink are the dot480 tones (`value`, `dotFaint`, `bg`).
 * The flip-disc panel (a hair above `bg`) matches no token; the e-ink paper grey is deliberately not one.
 */
export const STAGE_COLORS: StageColors = { bright: dot480.value!, off: dot480.dotFaint!, panel: '#0A0B0C', paper: '#D3D3CD', ink: dot480.bg, tile: dot480.surface, grout: dot480.bg }

export interface StageOptions {
  /** Card grid (cells) and the backing size of the frames (px). */
  cols: number; rows: number; w: number; h: number
  /** 1 / the cell coverage of a full-size dot: normalises cell light for LED / e-ink / flip-disc. */
  gain?: number
  /** Seconds after the first frame before the power-on refresh starts (a page-wide scan). */
  delay?: number
  colors?: Partial<StageColors>
  /** The board's accent (`#RRGGBB`, the theme's `dotActive`; default dot480's): VFD and LED glow in it, every emissive skin passes it through. */
  accent?: string
  /** Skip the power-on refresh (a resize, reduced motion): the first frame lands settled. */
  instant?: boolean
  /** No full-refresh flash on e-ink (reduced motion): every refresh is a partial one. */
  noFlash?: boolean
  /** Flip-disc column writes: `at` = seconds from now, `count` = discs flipped (app-side clack). */
  onFlip?: (events: { at: number; count: number }[]) => void
  doc?: Document
}
export interface DisplayStage {
  readonly skin: SkinName
  /** A new card frame (any CanvasImageSource; scaled to w × h). */
  frame(src: CanvasImageSource, t: number): void
  /** Draw the display at t into `out` (a w × h canvas). True while it needs more frames (decay, flips, refresh). */
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
 * One hidden SVG colour-matrix filter per (skin, accent), shared by every stage on the page: VFD / LED send neutrals
 * to the accent's light and keep the accent; Nixie sends them to its neon and passes only the red column (physics).
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
/** A pattern surface (w × h) that is opaque on each cell's inset square and clear in the gutter, edges snapped to device px. */
function cellMask(doc: Document, w: number, h: number, cols: number, rows: number, inset: number): Surface {
  const s = surface(doc, w, h), cw = w / cols, ch = h / rows
  s.x.fillStyle = '#fff'
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * ch + inset * ch / 2), y1 = Math.round((r + 1) * ch - inset * ch / 2)
    for (let c = 0; c < cols; c++) { const x0 = Math.round(c * cw + inset * cw / 2), x1 = Math.round((c + 1) * cw - inset * cw / 2); if (x1 > x0 && y1 > y0) s.x.fillRect(x0, y0, x1 - x0, y1 - y0) }
  }
  return s
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

/** A static multiply layer (scanlines, meshes, paper): white with dark structure. */
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
  const colors = { ...STAGE_COLORS, ...o.colors }, gain = o.gain ?? 1, cw = w / cols, ch = h / rows
  const accent = /^#[0-9a-f]{6}$/i.test(o.accent ?? '') ? o.accent! : dot480.dotActive
  const raw = surface(doc, w, h, { alpha: false })
  black(raw, w, h)
  let start: number | null = o.instant ? -1e9 : null, changedAt = -Infinity, pending = false
  /** 0..1 through the power-on refresh (counted from the first render + delay). */
  const powerOn = (t: number, onS: number) => { start ??= t + (o.delay ?? 0); return onS > 0 ? (t - start) / onS : 1 }
  const frame = (src: CanvasImageSource, t: number) => {
    black(raw, w, h)
    raw.x.imageSmoothingEnabled = true
    raw.x.drawImage(src, 0, 0, w, h)
    changedAt = t; pending = true
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

  if (skin === 'vfd' || skin === 'nixie') {
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

  if (skin === 'led') {
    const P = SKIN_PHYSICS.led, cell = surface(doc, cols, rows, { alpha: false }), lit = surface(doc, w, h, { alpha: false })
    const bleed = surface(doc, cols, rows, { alpha: false })
    cell.x.imageSmoothingQuality = 'high'
    // one lens tile, repeated per cell (a non-integer cell pitch is a pattern transform, not drift)
    const S = 32, tile = surface(doc, S, S), g = tile.x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * P.lens)
    g.addColorStop(0, '#fff'); g.addColorStop(.72, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)')
    tile.x.fillStyle = g; tile.x.fillRect(0, 0, S, S)
    const lensFill = (x: C2D) => { const pat = x.createPattern(tile.c, 'repeat')!; pat.setTransform(new DOMMatrix().scale(cw / S, ch / S)); return pat }
    const lens = surface(doc, w, h, { alpha: false })
    black(lens, w, h); lens.x.fillStyle = lensFill(lens.x); lens.x.fillRect(0, 0, w, h)
    // the dies are the accent's LED colour: neutral light takes it (the accent passes), unlit lenses and the write line are tinted by it
    const die = phosphorFilter(doc, 'led', accent), cellFilter = `${gain !== 1 ? `brightness(${gain.toFixed(3)}) ` : ''}${die.url}`
    const tint = surface(doc, w, h, { alpha: false })
    tint.x.fillStyle = `rgb(${die.phosphor.map(v => Math.round(v * 255)).join(',')})`; tint.x.fillRect(0, 0, w, h)
    tint.x.globalCompositeOperation = 'multiply'; tint.x.drawImage(lens.c, 0, 0); tint.x.globalCompositeOperation = 'source-over'
    const off = surface(doc, w, h, { alpha: false })
    black(off, w, h); off.x.globalAlpha = Math.min(1, P.offGlow * 2.6); off.x.drawImage(tint.c, 0, 0); off.x.globalAlpha = 1
    return {
      ...base,
      render(out, t) {
        // cell light: mip-averaged dot area × opacity, normalised to a full dot, in the die colour
        cell.x.filter = cellFilter; cell.x.drawImage(raw.c, 0, 0, cols, rows); cell.x.filter = 'none'
        lit.x.imageSmoothingEnabled = false; lit.x.drawImage(cell.c, 0, 0, w, h); multiply(lit.x, lens)
        out.globalCompositeOperation = 'source-over'; out.drawImage(off.c, 0, 0)
        out.globalCompositeOperation = 'lighten'; out.drawImage(lit.c, 0, 0)
        // diffuser bleed: the cell image blurred by ~1 cell, added back between the lenses
        bleed.x.filter = 'blur(.9px)'; bleed.x.drawImage(cell.c, 0, 0); bleed.x.filter = 'none'
        out.globalCompositeOperation = 'lighter'; out.imageSmoothingEnabled = true; out.globalAlpha = Math.min(1, P.bloom * 2.4); out.drawImage(bleed.c, 0, 0, w, h)
        out.globalAlpha = 1; out.globalCompositeOperation = 'source-over'
        // scan-in: rows are driven top to bottom, a bright write line at the front
        const p = powerOn(t, P.onS)
        if (p < 1) {
          const y = Math.max(0, Math.round(rows * smooth(p))) * ch
          out.fillStyle = '#000'; out.fillRect(0, y, w, h - y)
          if (p > 0) { out.globalCompositeOperation = 'lighter'; out.globalAlpha = .35; out.drawImage(tint.c, 0, y, w, ch, 0, y, w, ch); out.globalAlpha = 1; out.globalCompositeOperation = 'source-over' }
        }
        return p < 1
      },
    }
  }

  if (skin === 'lcd') {
    const P = SKIN_PHYSICS.lcd, cell = surface(doc, cols, rows, { alpha: false }), ghost = surface(doc, cols, rows, { alpha: false })
    cell.x.imageSmoothingQuality = 'high'
    black(ghost, cols, rows)
    const hex = (c: Phosphor) => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`
    const a = rgbOf(accent), filter = `${gain !== 1 ? `brightness(${gain.toFixed(3)}) ` : ''}${matrixFilter(doc, `dm-lcd-${accent.slice(1).toLowerCase()}`, lcdMatrix(P.paper, P.ink, a, P.pigment))}`
    // square pixels: the ink-mapped image masked to each cell's inset square (gutter = paper), a touch darker than the paper when off
    const mask = cellMask(doc, w, h, cols, rows, P.gutter), pix = surface(doc, w, h), shade = surface(doc, w, h, { alpha: false })
    let last: number | null = null
    return {
      ...base,
      render(out, t) {
        const p = powerOn(t, 0), dt = last === null ? (o.instant ? 1e3 : 0) : t - last
        last = t
        if (p < 0) { out.fillStyle = hex(P.paper); out.fillRect(0, 0, w, h); return true }
        // liquid-crystal response: the new cell image drawn over the old at 1 − e^(−Δt/τ) (a blank panel fades in on power-on)
        cell.x.drawImage(raw.c, 0, 0, cols, rows)
        ghost.x.globalAlpha = ghostStep(dt, P.tau); ghost.x.drawImage(cell.c, 0, 0); ghost.x.globalAlpha = 1
        // pixels: nearest upscale through the LCD matrix, masked to squares
        const px = pix.x
        px.globalCompositeOperation = 'source-over'; px.clearRect(0, 0, w, h); px.imageSmoothingEnabled = false
        px.filter = filter; px.drawImage(ghost.c, 0, 0, w, h); px.filter = 'none'
        px.globalCompositeOperation = 'multiply'; px.fillStyle = `rgb(${Math.round(P.off * 255)},${Math.round(P.off * 255)},${Math.round(P.off * 255)})`; px.fillRect(0, 0, w, h)
        px.globalCompositeOperation = 'destination-in'; px.drawImage(mask.c, 0, 0); px.globalCompositeOperation = 'source-over'
        // backplane: paper, the pixel layer's shadow (offset, blurred, multiplied), then the pixels
        const sh = shade.x
        sh.fillStyle = '#fff'; sh.fillRect(0, 0, w, h)
        sh.filter = `blur(${(P.shadow.blur * cw).toFixed(2)}px)`; sh.drawImage(pix.c, P.shadow.dx * cw, P.shadow.dy * ch); sh.filter = 'none'
        out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1
        out.fillStyle = hex(P.paper); out.fillRect(0, 0, w, h)
        out.globalCompositeOperation = 'multiply'; out.globalAlpha = P.shadow.alpha; out.drawImage(shade.c, 0, 0)
        out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1; out.drawImage(pix.c, 0, 0)
        return t - changedAt < settleSeconds(P.tau)
      },
    }
  }

  if (skin === 'grout') {
    const P = SKIN_PHYSICS.grout, cell = surface(doc, cols, rows, { alpha: false }), card = surface(doc, w, h, { alpha: false }), tiles = surface(doc, w, h)
    cell.x.imageSmoothingQuality = 'high'
    const mask = cellMask(doc, w, h, cols, rows, P.gap)
    // bevel edges: per tile a 1 px top / left line (lighter) and bottom / right line (multiply), and a fixed per-tile luma jitter
    const hi = surface(doc, w, h), lo = layer(doc, w, h, () => {}), jitter = layer(doc, cols, rows, () => {})
    {
      const ccw = w / cols, cch = h / rows, lw = 1, g = lo.x
      hi.x.fillStyle = `rgba(255,255,255,${P.bevel.hi})`; g.fillStyle = `rgb(${Math.round(255 * (1 - P.bevel.lo))},${Math.round(255 * (1 - P.bevel.lo))},${Math.round(255 * (1 - P.bevel.lo))})`
      for (let r = 0; r < rows; r++) {
        const y0 = Math.round(r * cch + P.gap * cch / 2), y1 = Math.round((r + 1) * cch - P.gap * cch / 2)
        for (let c = 0; c < cols; c++) {
          const x0 = Math.round(c * ccw + P.gap * ccw / 2), x1 = Math.round((c + 1) * ccw - P.gap * ccw / 2)
          if (x1 - x0 < 3 || y1 - y0 < 3) continue
          hi.x.fillRect(x0, y0, x1 - x0, lw); hi.x.fillRect(x0, y0 + lw, lw, y1 - y0 - lw)
          g.fillRect(x0 + lw, y1 - lw, x1 - x0 - lw, lw); g.fillRect(x1 - lw, y0, lw, y1 - y0 - lw)
        }
      }
      const d = jitter.x.createImageData(cols, rows)
      for (let i = 0; i < cols * rows; i++) { const v = Math.round(255 * (1 - 2 * P.jitter * hash01(i % cols, Math.floor(i / cols), 23))); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255 }
      jitter.x.putImageData(d, 0, 0)
    }
    // the card over its own surface colour (not black), so a light card's dark dots read as ink on its tiles
    const frameOn = (src: CanvasImageSource, t: number) => {
      card.x.fillStyle = colors.tile; card.x.fillRect(0, 0, w, h); card.x.imageSmoothingEnabled = true; card.x.drawImage(src, 0, 0, w, h)
      changedAt = t; pending = true
    }
    return {
      ...base,
      frame: frameOn,
      render(out, t) {
        const p = powerOn(t, P.onS)
        // cell average → flat tiles (nearest), the per-tile jitter, bevels, cut to the tile squares
        cell.x.drawImage(card.c, 0, 0, cols, rows)
        cell.x.globalCompositeOperation = 'multiply'; cell.x.drawImage(jitter.c, 0, 0); cell.x.globalCompositeOperation = 'source-over'
        const x = tiles.x
        x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h); x.imageSmoothingEnabled = false; x.drawImage(cell.c, 0, 0, w, h)
        x.globalCompositeOperation = 'lighter'; x.drawImage(hi.c, 0, 0)
        x.globalCompositeOperation = 'multiply'; x.drawImage(lo.c, 0, 0)
        x.globalCompositeOperation = 'destination-in'; x.drawImage(mask.c, 0, 0); x.globalCompositeOperation = 'source-over'
        out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1
        out.fillStyle = colors.grout; out.fillRect(0, 0, w, h)
        // power-on: tiles are set in a diagonal sweep, top-left to bottom-right
        if (p >= 1) out.drawImage(tiles.c, 0, 0)
        else if (p > 0) {
          const k = smooth(p) * (cols + rows)
          for (let r = 0; r < rows; r++) { const n = Math.max(0, Math.min(cols, Math.ceil(k - r))); if (n) { const y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch), x1 = Math.round(n * cw); out.drawImage(tiles.c, 0, y0, x1, y1 - y0, 0, y0, x1, y1 - y0) } }
        }
        pending = false
        return p < 1
      },
    }
  }

  // reflective skins: read back the cell image (bounded rate), keep per-cell panel state
  const cell = surface(doc, cols, rows, { willReadFrequently: true })
  cell.x.imageSmoothingQuality = 'high'
  const sample = () => {
    black(cell, cols, rows)
    cell.x.filter = gain !== 1 ? `brightness(${gain.toFixed(3)})` : 'none'; cell.x.drawImage(raw.c, 0, 0, cols, rows); cell.x.filter = 'none'
    return cellFrame(cell.x.getImageData(0, 0, cols, rows).data, cols, rows)
  }

  if (skin === 'eink') {
    const panel = createEinkPanel(cols, rows, o.noFlash ? { ...SKIN_PHYSICS.eink, fullEvery: 1e9 } : SKIN_PHYSICS.eink), ink = new Float32Array(cols * rows)
    const img = surface(doc, cols, rows), data = img.x.createImageData(cols, rows)
    const hex = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16))
    const [pr, pg, pb] = hex(colors.paper), [ir, ig, ib] = hex(colors.ink)
    // paper grain: a fixed per-pixel tooth (hash noise), multiplied over the panel
    if (o.instant || o.noFlash) panel.count = 1
    const grain = layer(doc, w, h, x => {
      const d = x.createImageData(w, h)
      for (let i = 0; i < w * h; i++) { const v = 255 - Math.floor(hash01(i % w, Math.floor(i / w), 11) * 16); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255 }
      x.putImageData(d, 0, 0)
    })
    return {
      ...base,
      render(out, t) {
        powerOn(t, 0)
        if (pending && t >= start! && panel.ready(t)) { panel.push(sample(), t); pending = false }
        const busy = panel.at(t, ink), px = data.data, { rgb, colored } = panel
        for (let i = 0; i < ink.length; i++) {
          const k = ink[i], q = 1 - k, j = i * 4
          // accent pigment keeps the frame's hue (a colour e-paper), darkened to ink weight
          const cr = colored[i] ? rgb[i * 3] * .78 : ir, cg = colored[i] ? rgb[i * 3 + 1] * .78 : ig, cb = colored[i] ? rgb[i * 3 + 2] * .78 : ib
          px[j] = pr * q + cr * k; px[j + 1] = pg * q + cg * k; px[j + 2] = pb * q + cb * k; px[j + 3] = 255
        }
        img.x.putImageData(data, 0, 0)
        out.globalCompositeOperation = 'source-over'; out.imageSmoothingEnabled = false
        out.drawImage(img.c, 0, 0, w, h)
        multiply(out, grain)
        return busy || pending
      },
    }
  }

  // flipdisc
  const P = SKIN_PHYSICS.flipdisc, panel = createFlipPanel(cols, rows, P), n = cols * rows
  const face = new Uint8Array(n), tilt = new Float32Array(n), R = .46 * Math.min(cw, ch)
  let nextSample = -Infinity
  // dirty redraw: each cell remembers the sprite it shows (colour × width bucket); only changed cells are drawn
  const shown = new Int32Array(n).fill(-1), BUCKETS = 8, SW = Math.ceil(cw) + 1, SH = Math.ceil(ch) + 1
  const palette: string[] = [colors.off, colors.bright], paletteIx = new Map<string, number>(palette.map((c, i) => [c, i]))
  const sprites = new Map<number, HTMLCanvasElement>()
  const sprite = (ci: number, b: number) => {
    const key = ci * (BUCKETS + 1) + b
    let s = sprites.get(key)
    if (!s) {
      const sf = surface(doc, SW, SH)
      sf.x.fillStyle = colors.panel; sf.x.fillRect(0, 0, SW, SH)
      if (b > 0) { sf.x.fillStyle = palette[ci]; sf.x.beginPath(); sf.x.ellipse(cw / 2, ch / 2, R * b / BUCKETS, R, 0, 0, Math.PI * 2); sf.x.fill() }
      sprites.set(key, (s = sf.c))
    }
    return s
  }
  const colorIx = (i: number) => {
    const q = (v: number) => Math.min(255, Math.round(v / 17) * 17)
    const key = `rgb(${q(panel.rgb[i * 3])},${q(panel.rgb[i * 3 + 1])},${q(panel.rgb[i * 3 + 2])})`
    let ix = paletteIx.get(key)
    if (ix === undefined) { ix = palette.length; palette.push(key); paletteIx.set(key, ix) }
    return ix
  }
  return {
    ...base,
    render(out, t) {
      powerOn(t, 0)
      if (pending && t >= start! && t >= nextSample) {
        // the first frame of an instant stage lands settled (no sweep, no clack)
        const first = nextSample === -Infinity && o.instant, events = panel.push(sample(), first ? t - 60 : t, P.threshold)
        if (first) events.length = 0
        pending = false; nextSample = t + 1 / P.maxHz
        if (events.length && o.onFlip) {
          // one clack per ~12 columns (a real panel's write is a rattle, not 144 separate ticks)
          const buckets = new Map<number, { at: number; count: number }>()
          for (const e of events) { const b = Math.floor(e.col / 12), cur = buckets.get(b); if (cur) cur.count += e.count; else buckets.set(b, { at: e.at, count: e.count }) }
          o.onFlip([...buckets.values()])
        }
      }
      const moving = panel.at(t, face, tilt)
      out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1; out.imageSmoothingEnabled = false
      if (shown[0] === -1) { out.fillStyle = colors.panel; out.fillRect(0, 0, w, h) }
      for (let i = 0; i < n; i++) {
        const b = Math.ceil(tilt[i] * BUCKETS), f = face[i], ci = f === 2 ? colorIx(i) : f
        const key = ci * (BUCKETS + 1) + b
        if (shown[i] === key) continue
        shown[i] = key
        const c = i % cols, r = (i - c) / cols, x0 = Math.floor(c * cw), y0 = Math.floor(r * ch)
        out.drawImage(sprite(ci, b), 0, 0, Math.floor((c + 1) * cw) - x0, Math.floor((r + 1) * ch) - y0, x0, y0, Math.floor((c + 1) * cw) - x0, Math.floor((r + 1) * ch) - y0)
      }
      return moving > 0 || pending
    },
  }
}
