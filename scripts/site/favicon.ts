/**
 * `public/favicon.ico` from the app icon's art (`public/icons/icon.svg`: a rounded square of dots), for crawlers and
 * tools that only ask for `/favicon.ico` (#198). The SVG holds one `<rect rx>` and plain `<circle>`s, so this draws
 * them itself (8×8 supersampled coverage) and packs 16, 32 and 48 px PNGs into one ICO. Node built-ins only.
 *
 *   npx tsx scripts/site/favicon.ts           → rewrite public/favicon.ico
 *   npx tsx scripts/site/favicon.ts --check   → exit 1 if the committed file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SRC = 'public/icons/icon.svg', OUT = 'public/favicon.ico', SIZES = [16, 32, 48], SS = 8
const svg = readFileSync(SRC, 'utf8')
const attr = (tag: string, k: string) => Number(new RegExp(`\\b${k}="([\\d.]+)"`).exec(tag)?.[1] ?? 0)
const hex = (tag: string) => { const m = /fill="#([0-9a-f]{6})"/i.exec(tag)![1]; return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)) }
const box = attr(/<svg[^>]*>/.exec(svg)![0], 'width')
const rect = /<rect[^>]*>/.exec(svg)![0]
const circles = [...svg.matchAll(/<circle[^>]*>/g)].map(([t]) => ({ x: attr(t, 'cx'), y: attr(t, 'cy'), r: attr(t, 'r'), c: hex(t) }))
const [rw, rr, bg] = [attr(rect, 'width'), attr(rect, 'rx'), hex(rect)]

/** The art's colour at a point in SVG units, or null outside the rounded square. */
function at(x: number, y: number): number[] | null {
  const dx = Math.max(rr - x, x - (rw - rr), 0), dy = Math.max(rr - y, y - (rw - rr), 0)
  if (x < 0 || y < 0 || x > rw || y > rw || dx * dx + dy * dy > rr * rr) return null
  for (const d of circles) if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) return d.c
  return bg
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b: Buffer) => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 }
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]) }

/** One RGBA PNG of the art at `n` px. */
function png(n: number): Buffer {
  const rows = Buffer.alloc(n * (n * 4 + 1)), unit = box / n
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const sum = [0, 0, 0, 0]
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = at((px + (sx + .5) / SS) * unit, (py + (sy + .5) / SS) * unit)
      if (c) { sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; sum[3]++ }
    }
    const o = py * (n * 4 + 1) + 1 + px * 4
    if (sum[3]) for (let k = 0; k < 3; k++) rows[o + k] = Math.round(sum[k] / sum[3])
    rows[o + 3] = Math.round(sum[3] * 255 / (SS * SS))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ICO: a header, one 16-byte entry per image, then the PNGs
const images = SIZES.map(png), head = Buffer.alloc(6 + 16 * images.length)
head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4)
let offset = head.length
images.forEach((img, i) => {
  const e = 6 + 16 * i, n = SIZES[i]
  head[e] = n; head[e + 1] = n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
  head.writeUInt32LE(img.length, e + 8); head.writeUInt32LE(offset, e + 12)
  offset += img.length
})
const ico = Buffer.concat([head, ...images])
if (process.argv.includes('--check')) {
  let same = false
  try { same = readFileSync(OUT).equals(ico) } catch { /* missing */ }
  console.log(same ? `✓ ${OUT} matches ${SRC}` : `✗ ${OUT} is stale: run npx tsx scripts/site/favicon.ts`)
  process.exit(same ? 0 : 1)
}
writeFileSync(OUT, ico)
console.log(`${OUT}: ${SIZES.join(', ')} px, ${ico.length} bytes`)
