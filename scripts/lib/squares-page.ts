/**
 * Browser side of `scripts/squares-browser.ts` (bundled by esbuild, driven over CDP): each squares card drawn by
 * Canvas from `DotInstance[]`, Canvas from a `DotBuffer`, WebGL2, SVG (through an <img>) and the CPU reference
 * (`insideJoined`, 4×4 supersampled), plus synthetic crack / double-blend blocks. Exposed as `window.SQ`.
 */
import { sampleLayers, sampleLayersInto } from '../../src/engine/sampler/gridSampler'
import { renderCanvas } from '../../src/engine/renderer/canvasRenderer'
import { renderCanvasBuffer } from '../../src/engine/renderer/canvasBuffer'
import { renderSVG } from '../../src/engine/renderer/svgRenderer'
import { renderWebGL, sharedDotGL } from '../../src/engine/renderer/webgl/dotgl'
import { shapeExt } from '../../src/engine/renderer/ext'
import { squircleExponent } from '../../src/engine/renderer/shapePath'
import { insideJoined, installSquares } from '../../src/engine/squares'
import { dot480 } from '../../src/engine/theme/tokens'
import type { DotInstance, GridConfig, Layer } from '../../src/engine/types'
import { widgetById, withChrome } from '../../src/widgets'
import { squareStyle } from '../../src/widgets/boards/squares'

installSquares()
const theme = dot480
type Surface = { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
function surface(w: number, h: number, scale: number): Surface {
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale)
  const ctx = c.getContext('2d')!; ctx.fillStyle = theme.surface; ctx.fillRect(0, 0, c.width, c.height); ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return { c, ctx }
}
const grab = (s: Surface) => s.ctx.getImageData(0, 0, s.c.width, s.c.height)

interface Cmp { max: number; mean: number; over16: number; psnr: number }
function compare(a: ImageData, b: ImageData, diff?: ImageData): Cmp {
  let max = 0, sum = 0, over = 0, se = 0
  for (let i = 0; i < a.data.length; i += 4) {
    let m = 0
    for (let k = 0; k < 3; k++) { const d = Math.abs(a.data[i + k] - b.data[i + k]); m = Math.max(m, d); sum += d; se += d * d }
    max = Math.max(max, m); if (m > 16) over++
    if (diff) { const v = Math.min(255, m * 4); diff.data[i] = v; diff.data[i + 1] = v; diff.data[i + 2] = v; diff.data[i + 3] = 255 }
  }
  const n = a.data.length / 4, mse = se / (n * 3)
  return { max, mean: +(sum / (n * 3)).toFixed(3), over16: +(over / n * 100).toFixed(3), psnr: +(mse ? 10 * Math.log10(255 * 255 / mse) : 99).toFixed(2) }
}
function diffPng(a: ImageData, b: ImageData) {
  const c = document.createElement('canvas'); c.width = a.width; c.height = a.height
  const ctx = c.getContext('2d')!, d = ctx.createImageData(a.width, a.height), r = compare(a, b, d)
  ctx.putImageData(d, 0, 0)
  return { ...r, png: c.toDataURL('image/png') }
}
const hex = (c: string) => { const m = /^#([0-9a-f]{6})$/i.exec(c); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [255, 0, 255] }

/** CPU reference: per (colour, opacity) group, coverage summed over its dots (4×4 supersampled), blended once over the surface. */
function reference(dots: DotInstance[], w: number, h: number, scale: number, n: number): ImageData {
  const W = Math.round(w * scale), H = Math.round(h * scale), img = new ImageData(W, H), bg = hex(theme.surface)
  for (let i = 0; i < W * H; i++) { img.data.set(bg, i * 4); img.data[i * 4 + 3] = 255 }
  const groups = new Map<string, Float32Array>()
  for (const d of dots) {
    if (!(d.r > 0 && d.opacity > 0)) continue
    const key = `${d.color}|${Math.round(Math.min(1, d.opacity) * 1000) / 1000}`
    let cov = groups.get(key)
    if (!cov) groups.set(key, (cov = new Float32Array(W * H)))
    const cx = d.x * scale, cy = d.y * scale, s = d.r * scale, g = d.joint && d.join !== undefined ? { ...d.joint, hx: d.joint.hx * scale, hy: d.joint.hy * scale, ri: d.joint.ri * scale, seam: d.joint.seam * scale } : null
    const reach = (g ? Math.max(g.hx, g.hy, s) : s) + 1, e = d.shape === 'square' ? Infinity : d.shape === 'squircle' ? squircleExponent(d.roundness ?? 0) : n
    for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(H, Math.ceil(cy + reach)); y++) for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(W, Math.ceil(cx + reach)); x++) {
      let hit = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + .5) / 4, py = y + (sy + .5) / 4
        if (g ? insideJoined(px, py, cx, cy, s, g, d.join!) : e === Infinity ? Math.max(Math.abs(px - cx), Math.abs(py - cy)) <= s : (Math.abs(px - cx) / s) ** e + (Math.abs(py - cy) / s) ** e <= 1) hit++
      }
      cov[y * W + x] += hit / 16
    }
  }
  for (const [key, cov] of groups) {
    const cut = key.lastIndexOf('|'), c = hex(key.slice(0, cut)), a = +key.slice(cut + 1)
    for (let i = 0; i < cov.length; i++) if (cov[i] > 0) { const k = Math.min(1, cov[i]) * a; for (let j = 0; j < 3; j++) img.data[i * 4 + j] += (c[j] - img.data[i * 4 + j]) * k }
  }
  return img
}
async function svgImage(dots: DotInstance[], w: number, h: number, scale: number): Promise<Surface> {
  const s = surface(w, h, scale), img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(dots, w, h))}`
  await img.decode()
  s.ctx.drawImage(img, 0, 0, w, h)
  return s
}
const toSurface = (img: ImageData): Surface => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d')!; ctx.putImageData(img, 0, 0); return { c, ctx } }

/** Make sure the lazy GL hook is in; returns whether the first join frame fell back (false) before it loaded. */
async function loadGL(): Promise<{ firstFellBack: boolean; thenGL: boolean }> {
  const dots = sampleLayers([{ field: () => 1, join: true } as Layer], { cols: 4, rows: 4, pitch: 4 }, squareStyle, theme)
  const s = surface(16, 16, 2), first = renderWebGL(s.ctx, dots, [], theme)
  await shapeExt.glLoad?.()
  return { firstFellBack: !first, thenGL: renderWebGL(s.ctx, dots, [], theme) }
}

/** One card at t: every renderer against Canvas(array), and the CPU reference. */
async function card(id: string, t: number, scale: number) {
  const p = widgetById(id)!, grid = p.grid, pitch = grid.pitch ?? theme.gridPx, w = grid.cols * pitch, h = grid.rows * pitch
  const dots = sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), grid, p.style, theme)
  const A = surface(w, h, scale), B = surface(w, h, scale), G = surface(w, h, scale)
  renderCanvas(A.ctx, dots)
  renderCanvasBuffer(B.ctx, sampleLayersInto(withChrome(p)({ t, data: { ...p.defaults } }), grid, p.style, theme))
  const gl = renderWebGL(G.ctx, dots, [], theme)
  const S = await svgImage(dots, w, h, scale), R = toSurface(reference(dots, w, h, scale, squircleExponent(p.style.cornerRoundness ?? 0)))
  const a = grab(A), out: Record<string, unknown> = { id, t, dots: dots.length, joined: dots.filter(d => d.join !== undefined).length, gl, canvas: A.c.toDataURL('image/png') }
  for (const [name, s] of [['buffer', B], ['webgl', G], ['svg', S], ['cpu', R]] as const) {
    const d = diffPng(a, grab(s))
    out[name] = { mean: d.mean, over16: d.over16, psnr: d.psnr, max: d.max, png: s.c.toDataURL('image/png'), diff: d.png }
  }
  return out
}

/**
 * Crack and double-blend probe: a 10 × 8 block of joined cells (every interior cell FULL) at the card pitch, a 2×
 * lattice and a 3× lattice, drawn at opacity 1 and .5. Along every interior cell boundary (device px either side of
 * it), the darkest luma vs the cell-centre luma (cracks), and at .5 the brightest (double blend).
 */
async function cracks(scale: number) {
  const grid: GridConfig = { cols: 40, rows: 36, pitch: 2.25 }, rows: Record<string, unknown>[] = []
  const luma = (img: ImageData, x: number, y: number) => { const i = (y * img.width + x) * 4; return .2126 * img.data[i] + .7152 * img.data[i + 1] + .0722 * img.data[i + 2] }
  for (const k of [1, 2, 3]) for (const opacity of [1, .5]) {
    const cols = 10, rws = 8, field = Object.assign((u: number, v: number) => { const c = Math.round(u * (Math.floor(grid.cols / k) - 1)), r = Math.round(v * (Math.floor(grid.rows / k) - 1)); return c >= 1 && c <= cols && r >= 1 && r <= rws ? 1 : 0 }, {})
    const layer: Layer = { field, tone: 'idle', join: true, ...(k > 1 ? { lattice: k } : {}) }
    const dots = sampleLayers([layer], grid, squareStyle, theme).map(d => ({ ...d, opacity }))
    const w = grid.cols * grid.pitch!, h = grid.rows * grid.pitch!, P = k * grid.pitch!
    const C = surface(w, h, scale), G = surface(w, h, scale)
    renderCanvas(C.ctx, dots); const gl = renderWebGL(G.ctx, dots, [], theme)
    const S = await svgImage(dots, w, h, scale)
    const row: Record<string, unknown> = { k, opacity, gl }
    for (const [name, s] of [['canvas', C], ['webgl', G], ['svg', S]] as const) {
      const img = grab(s)
      // interior luma: centres of the interior cells
      let inside = 0, n = 0
      for (let r = 2; r < rws; r++) for (let c = 2; c < cols; c++) { inside += luma(img, Math.floor((c + .5) * P * scale), Math.floor((r + .5) * P * scale)); n++ }
      inside /= n
      let lo = 255, hi = 0
      // vertical boundaries between interior columns, scanned along interior rows (and horizontal ones likewise)
      for (let c = 2; c <= cols - 1; c++) {
        const bx = c * P * scale
        for (let y = Math.ceil(2 * P * scale); y < Math.floor(rws * P * scale); y++) for (const x of [Math.floor(bx - .5), Math.floor(bx), Math.floor(bx + .5)]) { const L = luma(img, x, y); lo = Math.min(lo, L); hi = Math.max(hi, L) }
      }
      for (let r = 2; r <= rws - 1; r++) {
        const by = r * P * scale
        for (let x = Math.ceil(2 * P * scale); x < Math.floor(cols * P * scale); x++) for (const y of [Math.floor(by - .5), Math.floor(by), Math.floor(by + .5)]) { const L = luma(img, x, y); lo = Math.min(lo, L); hi = Math.max(hi, L) }
      }
      row[name] = { inside: +inside.toFixed(2), crack: +(inside - lo).toFixed(2), blend: +(hi - inside).toFixed(2) }
    }
    rows.push(row)
  }
  return rows
}

function info() {
  const gl = sharedDotGL()
  if (!gl?.gl) return { webgl2: false }
  const ext = gl.gl.getExtension('WEBGL_debug_renderer_info')
  return { webgl2: true, renderer: ext ? gl.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.gl.getParameter(gl.gl.RENDERER) }
}

;(window as unknown as { SQ: unknown }).SQ = { info, loadGL, card, cracks }
