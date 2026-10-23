/**
 * Glyph Toy frame export (Nothing Phone (3) Glyph Matrix, 25×25; Phone (4a Pro) 13×13 via --size 13).
 * Renders a card or IR program to per-LED brightness 0…255 (Rec. 709 luma of the device frame),
 * dark outside the round matrix, and writes the JSON asset the Kotlin template plays plus a PNG preview.
 *
 *   npx tsx targets/glyph-toy/export.ts --card home-clock [--seconds 2 --fps 10] [--size 25] [--out targets/glyph-toy/out]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { args, frameSource, luma } from '../lib/frame'
import { pngRGB } from '../lib/image'

export interface GlyphFrames { w: number; h: number; fps: number; source: string; frames: number[][] }

/** True for LEDs inside the round matrix (centre distance ≤ size/2): an approximation of the physical layout. */
export const onMatrix = (x: number, y: number, size: number) => Math.hypot(x + .5 - size / 2, y + .5 - size / 2) <= size / 2

export function glyphFrames(a: Record<string, string>): GlyphFrames {
  const size = +(a.size ?? 25), fps = +(a.fps ?? 10), n = Math.max(1, Math.round(+(a.seconds ?? 2) * fps))
  const frame = frameSource({ fit: 'cover', ...a }, size, size)
  const frames = Array.from({ length: n }, (_, i) => {
    const l = luma(frame(i / fps))
    return Array.from(l, (v, k) => (onMatrix(k % size, Math.floor(k / size), size) ? Math.round(Math.min(1, v) * 255) : 0))
  })
  return { w: size, h: size, fps, source: a.ir ? `ir:${a.ir}` : `card:${a.card ?? 'home-clock'}`, frames }
}

function main() {
  const a = args(), out = a.out ?? 'targets/glyph-toy/out', g = glyphFrames(a)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'dot480_frames.json'), JSON.stringify(g))
  const s = 8, w = g.w * s, rgb = new Uint8Array(w * w * 3)
  g.frames[0].forEach((v, k) => { const x = k % g.w, y = Math.floor(k / g.w); for (let j = 1; j < s - 1; j++) for (let i = 1; i < s - 1; i++) rgb.fill(v, ((y * s + j) * w + x * s + i) * 3, ((y * s + j) * w + x * s + i) * 3 + 3) })
  writeFileSync(join(out, 'preview.png'), pngRGB({ w, h: w, rgb }))
  console.log(`${out}/dot480_frames.json: ${g.frames.length} frames ${g.w}×${g.h} @ ${g.fps} fps (${g.source}); copy it to app/src/main/assets/`)
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
