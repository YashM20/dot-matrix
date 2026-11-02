/**
 * Blog images: for every post and the blog index, a hero (`public/og/blog/<slug>-hero.png`, 1600×640, top of the
 * post) and a social card (`<slug>-social.png`, 1200×630, Open Graph and Twitter), plus `alt.json` (the alt text
 * the blog and `scripts/site/postbuild.ts` read). The hero is a PNG: the raster path has no WebP encoder (Node
 * built-ins only), and with adaptive row filters dot art stays small (under 40 kB each).
 *
 *   pnpm og:blog                     → every image + alt.json
 *   npx tsx scripts/og-blog.ts living-matter --out .snapshots/og-blog   → one post, elsewhere
 *
 * Each image is three samplings onto one raster, like `scripts/og.ts`: the post's pattern (an existing field: the
 * essay's sphere and metaballs, the IR plasma, the ripple solver, fbm noise) on a coarse grid, the title in smooth
 * dot type on a fine grid, and "DOT/480 · BLOG" in small dot type. One `active` element per image is the accent.
 * The pattern fades out around the text, so the title always reads. Same input, same bytes: no clock, no random.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { place, textAt, textSize } from '../src/engine/layout'
import { createRipple, rippleSplat, rippleStep } from '../src/engine/life/ripple'
import { fbm2 } from '../src/engine/noise/gradient'
import { irProgram } from '../src/engine/ir'
import { squircleExponent } from '../src/engine/renderer/shapePath'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import type { DotStyle, Field, GridConfig, Layer } from '../src/engine/types'
import { blobs, sphere } from '../src/essay/figures/fields'
import { PLASMA_SRC } from '../src/widgets/boards/ir'
import { BLOG, POSTS } from '../src/blog/posts'
import { Raster } from './lib/raster'
import { theme, visible } from './lib/stats'

export const OUT = join('public', 'og', 'blog')
/** Image frame: size, margin, pattern pitch, title and tag dot pitch (px). */
interface Frame { w: number; h: number; m: number; pitch: number; tp: number; sp: number }
export const SOCIAL: Frame = { w: 1200, h: 630, m: 64, pitch: 14, tp: 5, sp: 4 }
export const HERO: Frame = { w: 1600, h: 640, m: 72, pitch: 16, tp: 6, sp: 5 }

/** What a post's pattern needs to know: the frame, its grid, and the px box the art should fill. */
interface Ctx { f: Frame; g: GridConfig; box: [x: number, y: number, w: number, h: number] }
interface Art { title: string; alt: { hero: string; social: string }; layers: (c: Ctx) => Layer[]; caret?: boolean }

/** A square-field in a px box, as u/v over the whole pattern grid. */
const inBox = (field: Field, { f, box: [x, y, w, h] }: Ctx): Field => place(field, x / f.w, y / f.h, w / f.w, h / f.h)
/** The px box → the box's own u/v (for `toneOf`, which sees the grid's u/v). */
const boxUV = ({ f, box: [x, y, w, h] }: Ctx, u: number, v: number): [number, number] => [(u * f.w - x) / w, (v * f.h - y) / h]
/** One big dot at box u/v (a site: a single bigger dot, not a cluster). */
const siteAt = (c: Ctx, bu: number, bv: number, size = 1.6): Layer => {
  const [x, y, w, h] = c.box, col = (x + bu * w) / c.f.pitch - .5, row = (y + bv * h) / c.f.pitch - .5
  return { field: () => 1, sites: [[col, row]], size, tone: 'active' }
}

/** The ripple solver after `steps` steps from a few drops; the height's size, so crests and troughs both read as rings. */
function rippleField(c: Ctx, drops: [x: number, y: number, amp: number][], steps: number): Field {
  const { cols: w, rows: h } = c.g, r = createRipple({ w, h, damp: .992 }), s = new Float32Array(r.size)
  drops.forEach(([x, y, amp], i) => {
    rippleSplat(r, s, x * (w - 1), y * (h - 1), amp, 2.5)
    for (let k = 0; k < (i === drops.length - 1 ? steps : 12); k++) rippleStep(r, s)
  })
  return (u, v) => Math.min(1, Math.abs(s[r.H + Math.round(v * (h - 1)) * w + Math.round(u * (w - 1))]) * 2.4)
}

const plasma = irProgram(PLASMA_SRC)
/** Where the reader holds the third metaball. */
const HELD = [.45, .47] as const, held = blobs(...HELD)

export const ART: Record<string, Art> = {
  'dot-matrix-essay': {
    title: 'Ditherpunk for UI',
    alt: {
      hero: 'A lit sphere drawn in grey dots, brighter at the top left, with a red dot where the light comes from. The title reads Ditherpunk for UI.',
      social: 'Ditherpunk for UI in white dot type, next to a lit sphere drawn in grey dots and one red dot.',
    },
    // the figure's sphere, zoomed in a little so it fills the box
    layers: c => [{ field: inBox((u, v) => sphere(.1 + .8 * u, .1 + .8 * v), c), tone: 'auto' }, siteAt(c, .12, .07, 2)],
  },
  'build-your-own-dot-engine': {
    title: 'Build your own dot engine',
    alt: {
      hero: 'Three metaballs drawn in dots, two grey and one red, with the red one touching a grey one. The title reads Build your own dot engine.',
      social: 'Build your own dot engine in white dot type, next to three metaballs drawn in dots, one of them red.',
    },
    layers: c => [{
      // the figure's field, zoomed to its middle so the three blobs fill the box
      field: inBox((u, v) => held(.18 + .64 * u, .16 + .64 * v), c), tone: 'auto',
      toneOf: (_, u, v) => { const [bu, bv] = boxUV(c, u, v); return Math.hypot(.18 + .64 * bu - HELD[0], .16 + .64 * bv - HELD[1]) < .1 ? 'active' : undefined },
    }],
  },
  'a-tiny-language-for-dots': {
    title: 'A tiny language for dots',
    alt: {
      hero: 'Grey plasma bands drawn in dots from a short formula, behind the title A tiny language for dots and a red text cursor.',
      social: 'A tiny language for dots in white dot type with a red cursor, over grey plasma bands drawn in dots.',
    },
    layers: () => [{ field: plasma({ t: 1.3, data: {} }), tone: 'auto' }],
    caret: true,
  },
  'living-matter': {
    title: 'Living matter',
    alt: {
      hero: 'Rings of grey dots spread across water from three drops, with a red dot where the last drop fell. The title reads Living matter.',
      social: 'Living matter in white dot type, next to rings of grey dots spreading from drops and one red dot.',
    },
    layers: c => {
      const [x, y, w, h] = c.box, at = (bu: number, bv: number): [number, number] => [(x + bu * w) / c.f.w, (y + bv * h) / c.f.h]
      const drops: [number, number, number][] = [[...at(.2, .75), 1.4], [...at(.85, .2), 1.2], [...at(.55, .45), 1.6]]
      return [{ field: rippleField(c, drops, 18), tone: 'auto' }, siteAt(c, .55, .45, 2)]
    },
  },
  [BLOG.slug]: {
    title: 'Long reads in dots',
    alt: {
      hero: 'Patches of grey dots from a noise field on a dark board, with one red dot. The title reads Long reads in dots.',
      social: 'The Dot/480 blog. Long reads in dots in white dot type, over patches of grey dots and one red dot.',
    },
    layers: c => [
      { field: (u, v) => { const n = .5 + .5 * fbm2(u * c.f.w / 260, v * c.f.h / 260, 4, 7); return n < .42 ? 0 : (n - .42) * 2.4 }, tone: 'auto' },
      siteAt(c, .62, .3, 2),
    ],
  },
}

/** Greedy word wrap into as few lines as `max` characters allows, then balanced so the lines are about even. */
function wrap(s: string, max: number): string[] {
  const greedy = (n: number) => s.split(/\s+/).reduce<string[]>((lines, w) => {
    const last = lines[lines.length - 1]
    if (last !== undefined && (last + ' ' + w).length <= n) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w)
    return lines
  }, [])
  const lines = greedy(max).length
  for (let n = Math.ceil(s.length / lines); n < max; n++) if (greedy(n).length <= lines) return greedy(n)
  return greedy(max)
}

const pattern = (p: number): DotStyle => ({ shape: 'squircle', cornerRoundness: .25, sizeMin: p * .08, sizeMax: p * .39, opacityMode: 'fromValue', quantizeSteps: 5 })
const typeStyle = (p: number): DotStyle => ({ shape: 'circle', sizeMin: 0, sizeMax: p * .44, opacityMode: 'fromValue', quantizeSteps: 5 })
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** One image: pattern, then title and tag on top. */
export function blogImage(slug: string, f: Frame): Raster {
  const art = ART[slug]
  if (!art) throw new Error(`no art for ${slug}`)
  const out = new Raster(f.w, f.h, theme.bg)
  const draw = (layers: Layer[], g: GridConfig, style: DotStyle, ox = 0, oy = 0) => {
    const n = style.shape === 'circle' ? 2 : squircleExponent(style.cornerRoundness ?? 0)
    for (const d of sampleLayers(layers, g, style, theme)) if (visible(d)) out.dot(ox + d.x, oy + d.y, d.r, n, d.color, d.opacity)
  }

  // the art box: a square on the right, the height of the frame less half a margin each side
  const side = f.h - f.m, box: Ctx['box'] = [f.w - f.m / 2 - side, f.m / 2, side, side]
  // title: smooth (10×14) glyphs, bottom left, on the tp grid, in the column left of the art box
  const tg: GridConfig = { cols: Math.floor(f.w / f.tp), rows: Math.floor(f.h / f.tp), pitch: f.tp }
  const adv = 12, lineH = 14 + 5, m = Math.round(f.m / f.tp)
  const lines = wrap(art.title.toUpperCase(), Math.floor((box[0] / f.tp - m + 2) / adv))
  const top = tg.rows - m - lines.length * lineH + 5
  const title: Layer[] = lines.map((line, i) => ({ field: textAt(tg, line, m, top + i * lineH, { smooth: true }), tone: 'value' }))
  const lastW = textSize(lines[lines.length - 1], { smooth: true })[0]
  if (art.caret) title.push({ field: textAt(tg, '_', m + lastW + 2, top + (lines.length - 1) * lineH, { smooth: true }), tone: 'active' })
  const titleW = Math.max(...lines.map(l => textSize(l, { smooth: true })[0])) + (art.caret ? 12 : 0)
  // the tag: 5×7 glyphs, top left, on the sp grid
  const sg: GridConfig = { cols: Math.floor(f.w / f.sp), rows: Math.floor(f.h / f.sp), pitch: f.sp }
  const tag = 'DOT/480 · BLOG', sm = Math.round(f.m / f.sp)
  const keep: [number, number, number, number][] = [
    [m * f.tp, top * f.tp, (m + titleW) * f.tp, (top + lines.length * lineH - 5) * f.tp],
    [sm * f.sp, sm * f.sp, (sm + textSize(tag)[0]) * f.sp, (sm + 7) * f.sp],
  ]

  // pattern: a coarse grid over the whole frame; its art box sits right of the title
  const g: GridConfig = { cols: Math.floor(f.w / f.pitch), rows: Math.floor(f.h / f.pitch), pitch: f.pitch }
  const ox = (f.w - g.cols * f.pitch) / 2, oy = (f.h - g.rows * f.pitch) / 2
  const ctx: Ctx = { f, g, box }
  const pad = f.pitch * 1.5, fade = f.pitch * 7
  const clear = (u: number, v: number) => {
    const x = ox + (u * (g.cols - 1) + .5) * f.pitch, y = oy + (v * (g.rows - 1) + .5) * f.pitch
    let d = Infinity
    for (const [x0, y0, x1, y1] of keep) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)))
    return smoothstep(pad, pad + fade, d)
  }
  const art0 = art.layers(ctx).map(l => (l.sites ? l : { ...l, field: ((u, v) => l.field(u, v) * clear(u, v)) as Field }))
  draw(art0, g, pattern(f.pitch), ox, oy)
  draw(title, tg, typeStyle(f.tp))
  draw([{ field: textAt(sg, tag, sm, sm), tone: 'idle' }], sg, typeStyle(f.sp))
  return out
}

/** PNG with per-row adaptive filters (smaller than the plain encoder for dot art), deflate level 9: deterministic. */
export function png(r: Raster): Buffer {
  const { w, h } = r, stride = w * 3, px = new Uint8Array(stride * h)
  for (let i = 0; i < px.length; i++) px[i] = Math.max(0, Math.min(255, Math.round(r.data[i])))
  const raw = Buffer.alloc((stride + 1) * h), rows = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride))
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
  for (let y = 0; y < h; y++) {
    let best = 0, bestSum = Infinity
    for (let t = 0; t < 5; t++) {
      let sum = 0
      for (let i = 0; i < stride; i++) {
        const x = px[y * stride + i], a = i >= 3 ? px[y * stride + i - 3] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = y && i >= 3 ? px[(y - 1) * stride + i - 3] : 0
        const v = (x - [0, a, b, (a + b) >> 1, paeth(a, b, c)][t]) & 255
        rows[t][i] = v; sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) { bestSum = sum; best = t }
    }
    raw[y * (stride + 1)] = best; raw.set(rows[best], y * (stride + 1) + 1)
  }
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4)
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const hdr = Buffer.alloc(13); hdr.writeUInt32BE(w, 0); hdr.writeUInt32BE(h, 4); hdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

if (/[\\/]scripts[\\/]og-blog\.ts$/.test(process.argv[1] ?? '')) {
  const args = process.argv.slice(2), o = args.indexOf('--out'), dir = o >= 0 ? args.splice(o, 2)[1] : OUT
  const slugs = args.length ? args : [...POSTS.map(p => p.slug), BLOG.slug]
  mkdirSync(dir, { recursive: true })
  for (const slug of slugs) for (const [kind, f] of [['hero', HERO], ['social', SOCIAL]] as const) {
    const file = join(dir, `${slug}-${kind}.png`), buf = png(blogImage(slug, f))
    writeFileSync(file, buf)
    console.log(`${file} ${f.w}×${f.h} ${(buf.length / 1024).toFixed(1)} kB`)
  }
  if (!args.length) {
    const alt = Object.fromEntries(Object.entries(ART).map(([slug, a]) => [slug, a.alt]))
    writeFileSync(join(dir, 'alt.json'), JSON.stringify(alt, null, 2) + '\n')
  }
}
