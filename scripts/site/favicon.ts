/**
 * The site's icons from one source, the MATRIX mark (`src/site/brand/mark.svg`: plain `<circle class>` dots on a 16-unit
 * box, its dark and light fills in a `<style>`). Node built-ins only: this draws the circles itself (8×8 supersampled
 * coverage) and writes RGBA PNGs.
 *  - `public/favicon.svg`: the mark as it is (it follows the browser's light or dark scheme);
 *  - `public/favicon.ico`: 16, 32 and 48 px on the dark tile, for crawlers and tools that only ask for `/favicon.ico`;
 *  - `public/icons/icon.svg`, `icon-192.png`, `icon-512.png`: the dark rounded tile (manifest `any`);
 *  - `public/icons/apple-touch-icon.png` (180) and `icon-maskable-512.png`: full-bleed squares (iOS and Android cut
 *    their own corners; the maskable mark stays inside the 80% safe circle).
 *  - `src/site/brand/mark.css`: the header's mark (`<i class="mark">`), one radial-gradient dot per circle in theme
 *    roles (--value, --dot-faint, the accent), so it follows every scheme and accent with no image request and no JS.
 *
 *   npx tsx scripts/site/favicon.ts           → rewrite every icon
 *   npx tsx scripts/site/favicon.ts --check   → exit 1 if a committed icon is stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SRC = 'src/site/brand/mark.svg', SS = 8
const svg = readFileSync(SRC, 'utf8')
type Dot = { x: number; y: number; r: number; tone: string }
const dots: Dot[] = [...svg.matchAll(/<circle class="(\w+)" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)].map(([, tone, x, y, r]) => ({ x: +x, y: +y, r: +r, tone }))
/** The dark fills (the style's first rule set) as RGB, and the tile under them: {colors.bg}. */
const fill: Record<string, number[]> = Object.fromEntries([...svg.matchAll(/\.(\w+)\{fill:#([0-9A-F]{6})\}/gi)].reverse().map(([, k, h]) => [k, rgb(h)]))
const BG = '070809'
function rgb(h: string) { return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }

/** An icon: the mark at `scale` of the tile, centred; `round` cuts the tile's corners (else a full-bleed square). */
interface Icon { size: number; scale: number; round: boolean }
const ANY = 2 / 3, MASKABLE = 1 / 2
const radius = (size: number) => size * 0.225
/** The mark's offset and unit in px. At 16 px the dots land on pixel centres (pitch 2) instead of a half-pixel blur. */
function place({ size, scale }: Icon) { const k = (size / 16) * scale; return { k, o: size === 16 ? 4.5 - 2 * k : (size - 16 * k) / 2 } }

/** The icon's colour and coverage at a point in px. */
function at(icon: Icon, x: number, y: number): number[] | null {
  const { size, round } = icon, rr = round ? radius(size) : 0
  const dx = Math.max(rr - x, x - (size - rr), 0), dy = Math.max(rr - y, y - (size - rr), 0)
  if (x < 0 || y < 0 || x > size || y > size || dx * dx + dy * dy > rr * rr) return null
  const { k, o } = place(icon), d = near((x - o) / k, (y - o) / k)
  return d && ((x - o) / k - d.x) ** 2 + ((y - o) / k - d.y) ** 2 <= d.r * d.r ? fill[d.tone] : rgb(BG)
}
/** The dot of the cell a point (in mark units) falls in: the dots sit on pitch 3 from 2, one per cell, r < 1.5. */
const cells: Dot[] = []
for (const d of dots) cells[((d.y - 2) / 3) * 5 + (d.x - 2) / 3] = d
const near = (ux: number, uy: number) => { const i = Math.round((ux - 2) / 3), j = Math.round((uy - 2) / 3); return i >= 0 && i < 5 && j >= 0 && j < 5 ? cells[j * 5 + i] : undefined }
/** True when a whole pixel is one colour: its centre is over a px from every dot edge and from the tile's edge. */
function flat(icon: Icon, cx: number, cy: number): boolean {
  const { size, round } = icon, rr = round ? radius(size) : 0, { k, o } = place(icon), d = near((cx - o) / k, (cy - o) / k)
  const qx = Math.max(rr - cx, cx - (size - rr), 0), qy = Math.max(rr - cy, cy - (size - rr), 0)
  if ((qx > 0 && qy > 0 ? rr - Math.hypot(qx, qy) : Math.min(cx, cy, size - cx, size - cy)) < 1) return false
  return !d || Math.abs(Math.hypot(cx - (o + d.x * k), cy - (o + d.y * k)) - d.r * k) > 1
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b: Buffer) => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 }
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]) }

/** One RGBA PNG of an icon. */
function png(icon: Icon): Buffer {
  const n = icon.size, rows = Buffer.alloc(n * (n * 4 + 1))
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const sum = [0, 0, 0, 0], ss = flat(icon, px + .5, py + .5) ? 1 : n > 64 ? SS / 2 : SS
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = at(icon, px + (sx + .5) / ss, py + (sy + .5) / ss)
      if (c) { sum[0] += c[0] * SS * SS / ss / ss; sum[1] += c[1] * SS * SS / ss / ss; sum[2] += c[2] * SS * SS / ss / ss; sum[3] += SS * SS / ss / ss }
    }
    const o = py * (n * 4 + 1) + 1 + px * 4
    if (sum[3]) for (let k = 0; k < 3; k++) rows[o + k] = Math.round(sum[k] / sum[3])
    rows[o + 3] = Math.round(sum[3] * 255 / (SS * SS))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** ICO: a header, one 16-byte entry per image, then the PNGs. */
function ico(sizes: number[]): Buffer {
  const images = sizes.map(size => png({ size, scale: ANY, round: true })), head = Buffer.alloc(6 + 16 * images.length)
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach((img, i) => {
    const e = 6 + 16 * i, n = sizes[i]
    head[e] = n; head[e + 1] = n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(img.length, e + 8); head.writeUInt32LE(offset, e + 12)
    offset += img.length
  })
  return Buffer.concat([head, ...images])
}

/** The tile as SVG (the manifest's scalable icon), fills fixed to the dark scheme. */
function tileSvg(size: number): string {
  const { k, o } = place({ size, scale: ANY, round: true }), hex = (c: number[]) => `#${c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
  const circles = dots.map(d => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${hex(fill[d.tone])}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius(size)}" fill="#${BG}"/><g transform="translate(${o} ${o}) scale(${k})">${circles}</g></svg>\n`
}

/** The header mark as CSS: the circles as gradient dots on a 16 px box (--space-4), edges softened by half a px. */
function markCss(): string {
  const role: Record<string, string> = { on: 'var(--value)', off: 'var(--dot-faint)', accent: 'var(--red)' }
  const layers = dots.map(d => `    radial-gradient(circle at ${d.x}px ${d.y}px, ${role[d.tone]} ${d.r - .25}px, transparent ${d.r + .25}px)`)
  return `/* The MATRIX mark in the header and the site nav (<i class="mark" aria-hidden="true">). Generated from
   src/site/brand/mark.svg by scripts/site/favicon.ts: do not edit. 16 px, four units of the 4 px grid; the dots
   sit at pitch 3 on whole pixels, so they stay crisp at 1x and 2x. */
.mark {
  display: inline-block;
  flex: none;
  width: var(--space-4);
  height: var(--space-4);
  background:
${layers.join(',\n')};
  background-repeat: no-repeat
}
`
}

const outputs: [file: string, make: () => Buffer | string][] = [
  ['src/site/brand/mark.css', markCss],
  ['public/favicon.svg', () => svg],
  ['public/favicon.ico', () => ico([16, 32, 48])],
  ['public/icons/icon.svg', () => tileSvg(512)],
  ['public/icons/icon-192.png', () => png({ size: 192, scale: ANY, round: true })],
  ['public/icons/icon-512.png', () => png({ size: 512, scale: ANY, round: true })],
  ['public/icons/apple-touch-icon.png', () => png({ size: 180, scale: ANY, round: false })],
  ['public/icons/icon-maskable-512.png', () => png({ size: 512, scale: MASKABLE, round: false })],
]

if (dots.length !== 25 || !fill.on || !fill.off || !fill.accent) { console.log(`✗ ${SRC}: expected 25 circles and on / off / accent fills`); process.exit(1) }
const check = process.argv.includes('--check')
let stale = 0
for (const [file, make] of outputs) {
  const want = make(), buf = typeof want === 'string' ? Buffer.from(want) : want
  if (!check) { writeFileSync(file, buf); console.log(`${file}: ${buf.length} bytes`); continue }
  let same = false
  try { same = readFileSync(file).equals(buf) } catch { /* missing */ }
  if (!same) { stale++; console.log(`✗ ${file} is stale: run npx tsx scripts/site/favicon.ts`) }
}
if (check) { if (!stale) console.log(`✓ ${outputs.length} icons match ${SRC}`); process.exit(stale ? 1 : 0) }
