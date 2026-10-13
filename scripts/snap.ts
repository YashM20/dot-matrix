/**
 * Headless card snapshots: preset → sampleLayers → PNG, no browser needed.
 *
 *   pnpm snap good-morning timer          # single cards
 *   pnpm snap --board henry3              # whole board as one sheet
 *   pnpm snap --all                       # every board
 *   options: --out <dir> (default .snapshots)  --px <pixels per dot pitch unit> (default 2)  --t <seconds>
 *
 * Icons and CJK need a browser canvas, so they render empty here — everything else is exact.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { dot480 } from '../src/engine/theme/tokens'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { squircleExponent } from '../src/engine/renderer/shapePath'
import type { DotInstance, ThemeTokens } from '../src/engine/types'
import { boardById, boards, widgetById, type WidgetPreset } from '../src/widgets'
import { cardChrome } from '../src/widgets/types'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback }
const out = opt('out', '.snapshots'), px = +opt('px', '2'), t = +opt('t', '1.3'), board = opt('board', '')
const all = args.includes('--all'), ids = args.filter(a => !a.startsWith('--'))
const theme: ThemeTokens = dot480

// ── tiny RGBA canvas + PNG encoder ──────────────────────────────────────────
class Raster {
  data: Float32Array
  constructor(public w: number, public h: number, bg: string) { this.data = new Float32Array(w * h * 3); const [r, g, b] = rgb(bg); for (let i = 0; i < w * h; i++) this.data.set([r, g, b], i * 3) }
  blend(x: number, y: number, [r, g, b]: number[], a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return
    const i = (y * this.w + x) * 3, d = this.data
    d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a
  }
  /** Superellipse dot, 4×4 supersampled. */
  dot(cx: number, cy: number, r: number, n: number, color: string, alpha: number) {
    const c = rgb(color)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      let hit = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const dx = Math.abs((x + (sx + .5) / 4 - cx) / r), dy = Math.abs((y + (sy + .5) / 4 - cy) / r)
        if (dx ** n + dy ** n <= 1) hit++
      }
      this.blend(x, y, c, (hit / 16) * alpha)
    }
  }
  rect(x0: number, y0: number, w: number, h: number, color: string, radius = 0, stroke?: string) {
    const c = rgb(color), s = stroke ? rgb(stroke) : null
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(0, Math.max(x0 + radius - x - .5, x + .5 - (x0 + w - radius))), dy = Math.max(0, Math.max(y0 + radius - y - .5, y + .5 - (y0 + h - radius)))
      const d = Math.hypot(dx, dy) - radius
      if (d > .5) continue
      this.blend(x, y, c, 1)
      if (s && d > -1.5) this.blend(x, y, s, 1)
    }
  }
  paste(src: Raster, ox: number, oy: number) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = (y * src.w + x) * 3; this.blend(ox + x, oy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], 1) } }
  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h)
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 3 + 1)] = 0; for (let x = 0; x < this.w * 3; x++) raw[y * (this.w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(this.data[y * this.w * 3 + x]))) }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr.set([8, 2, 0, 0, 0], 8)
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  }
}
function rgb(color: string): number[] {
  const m = color.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
  const r = color.match(/rgba?\(([^)]+)\)/); if (r) return r[1].split(',').slice(0, 3).map(Number)
  return [255, 0, 255]
}
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }

// ── card rendering ──────────────────────────────────────────────────────────
const PAD = 14 // card padding in output px, like the CSS card
function renderCard(p: WidgetPreset): Raster {
  // bleed cards have no padding, so scale their dots up to fill the same footprint
  const base = (p.grid.pitch ?? theme.gridPx) * px, pitch = p.bleed ? base + (PAD * 2) / p.grid.cols : base, k = pitch / base * px
  const w = Math.round(p.grid.cols * pitch), h = Math.round(p.grid.rows * pitch)
  const dots: DotInstance[] = sampleLayers([...cardChrome(p), ...p.layers({ t, data: { ...p.defaults } })], p.grid, p.style, theme)
  const pad = p.bleed ? 0 : PAD
  const card = new Raster(w + pad * 2, h + pad * 2, theme.bg)
  card.rect(0, 0, card.w, card.h, theme.surface, 14, '#26292d')
  const n = squircleExponent(p.style.cornerRoundness ?? 0)
  for (const d of dots) if (d.opacity > 0 && d.r > 0) card.dot(pad + d.x * k, pad + d.y * k, d.r * k, d.shape === 'circle' ? 2 : d.shape === 'square' ? 40 : n, d.color, d.opacity)
  return card
}
function sheet(cards: Raster[], columns: number): Raster {
  const gap = 12, cw = Math.max(...cards.map(c => c.w)), ch = Math.max(...cards.map(c => c.h)), rows = Math.ceil(cards.length / columns)
  const s = new Raster(columns * cw + (columns + 1) * gap, rows * ch + (rows + 1) * gap, theme.bg)
  cards.forEach((c, i) => s.paste(c, Math.round(gap + (i % columns) * (cw + gap) + (cw - c.w) / 2), Math.round(gap + Math.floor(i / columns) * (ch + gap) + (ch - c.h) / 2)))
  return s
}

mkdirSync(out, { recursive: true })
const save = (name: string, r: Raster) => { const file = join(out, `${name}.png`); writeFileSync(file, r.png()); console.log(file) }
for (const b of all ? boards : board ? [boardById(board)!] : []) save(`board-${b.id}`, sheet(b.items.map(renderCard), b.columns))
for (const id of ids) { const p = widgetById(id); if (!p) { console.error(`unknown card ${id}`); continue } save(id, renderCard(p)) }
