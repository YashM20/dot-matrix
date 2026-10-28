/**
 * The touchable hero (docs/LAYOUT-THEME-PLAN.md §1c #2, T2): drop or paste an image, or pick one (a tap on a phone),
 * and it becomes a live halftone through the same pipeline as every card: luma raster → `halftone` (step 2,
 * structure-aware, src/engine/halftone) → one layer (level → size, band → tone) → sampler → renderer. With no
 * image it shows a lit sphere whose light follows the mouse; with one, the mouse sets the exposure. Photos skip
 * quantization (AGENTS.md). Nothing leaves the page: the file is decoded into a 96 × 96 canvas and dropped.
 * Lazy: mounted by App once the page is idle, never in the first load.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { DotCanvas } from '../DotCanvas'
import { createRaster } from '../../engine/raster'
import { halftone } from '../../engine/halftone'
import type { DotStyle, Field, GridConfig, Layer, Tone } from '../../engine/types'
import { tileStyle } from '../../widgets/types'
import { useTheme, useThemeTokens } from '../../site/theme/useTheme'
import './hero.css'

const GRID: GridConfig = { cols: 96, rows: 96, pitch: 2.25 }
const N = GRID.cols * GRID.rows
/** Photo exemption: no quantization; luminance is carried by dot size, opacity and the tone band. */
const STYLE: DotStyle = { ...tileStyle, sizeMin: 0, sizeMax: 1.25, quantizeSteps: 0, opacityMode: 'fromValue' }
const LEVELS = 6
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const band = (v: number): Tone => (v < .69 ? 'faint' : v < .8 ? 'mid' : v < .91 ? 'idle' : 'value')

/** The waiting state: a sphere lit from (lx, ly) ∈ [-1, 1]², over a faint floor. */
function sphere(lx: number, ly: number): Float32Array {
  const out = new Float32Array(N), n = Math.hypot(lx, ly, 1.1), L = [lx / n, ly / n, 1.1 / n]
  const m = Math.hypot(L[0], L[1], L[2] + 1), H = [L[0] / m, L[1] / m, (L[2] + 1) / m] // half vector (viewer on +z)
  for (let y = 0; y < GRID.rows; y++) for (let x = 0; x < GRID.cols; x++) {
    const u = (x + .5) / GRID.cols - .5, v = (y + .5) / GRID.rows - .5, X = u / .34, Y = v / .34, q = X * X + Y * Y
    let lum = .05 + .1 * clamp(1 - Math.hypot(u + lx * .2, v - .38) * 2.2) // floor glow, opposite the light
    if (q < 1) {
      const Z = Math.sqrt(1 - q), d = Math.max(0, X * L[0] + Y * L[1] + Z * L[2])
      const h = Math.max(0, X * H[0] + Y * H[1] + Z * H[2])
      lum = .04 + .78 * d + .3 * h ** 24
    }
    out[y * GRID.cols + x] = clamp(lum)
  }
  return out
}

/** Decode `file`, cover-crop it into the grid and return its levelled luma (2nd–98th percentile stretched to 0–1). */
async function lumaOf(file: Blob): Promise<Float32Array> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('not an image')); i.src = url })
    const c = document.createElement('canvas'); c.width = GRID.cols; c.height = GRID.rows
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g) throw new Error('no canvas')
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, GRID.cols, GRID.rows)
    const px = g.getImageData(0, 0, GRID.cols, GRID.rows).data, out = new Float32Array(N)
    for (let i = 0; i < N; i++) out[i] = (.2126 * px[i * 4] + .7152 * px[i * 4 + 1] + .0722 * px[i * 4 + 2]) / 255
    const sorted = Float32Array.from(out).sort(), lo = sorted[Math.floor(N * .02)], hi = sorted[Math.floor(N * .98)], k = 1 / Math.max(.05, hi - lo)
    for (let i = 0; i < N; i++) out[i] = clamp((out[i] - lo) * k)
    return out
  } finally { URL.revokeObjectURL(url) }
}

/** Luma → step-2 halftone → one dot layer: the level sets the dot's size and opacity, the band its tone. */
function dotsOf(luma: Float32Array): Layer {
  const r = createRaster(GRID)
  r.data.set(luma)
  const d = halftone(r, { step: 2, levels: LEVELS }).data, kx = GRID.cols - 1, ky = GRID.rows - 1
  const field: Field = (u, v) => { const q = d[Math.round(v * ky) * GRID.cols + Math.round(u * kx)]; return q ? .55 + .45 * q : 0 }
  return { field, toneOf: band }
}

const imageIn = (items: DataTransferItemList | undefined) => [...(items ?? [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile() ?? null

export function HeroCard() {
  const [image, setImage] = useState<{ luma: Float32Array; name: string } | null>(null)
  const [aim, setAim] = useState<[number, number]>([-.55, -.6]) // the mouse over the card, in [-1, 1]²
  const [over, setOver] = useState(false)
  // a photo halftone: a dark inset on every page, in the current accent (the photo polarity rule, DESIGN.md › Theme)
  const { accent } = useTheme(), theme = useThemeTokens('dark')
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null), raf = useRef(0)
  const open = async (f: Blob | null | undefined, name = 'image') => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setNote('That file is not an image.'); return }
    try { setImage({ luma: await lumaOf(f), name }); setNote(`${name}: ${GRID.cols} × ${GRID.rows} dots, halftoned on this device.`) } catch { setNote('That image could not be read.') }
  }
  // paste anywhere on the page (outside text fields) lands here
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const f = imageIn(e.clipboardData?.items)
      if (f) { e.preventDefault(); void open(f, 'pasted image') }
    }
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('paste', onPaste); cancelAnimationFrame(raf.current) }
  }, [])
  const layers = useMemo(() => {
    const [ax, ay] = aim
    const luma = image ? image.luma.map(v => clamp(v * 2 ** (ax * .9))) : sphere(ax, ay)
    const dots = [dotsOf(luma)]
    return () => dots
  }, [image, aim])
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => setAim([Math.round(x * 12) / 12, Math.round(y * 12) / 12]))
  }
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; void open(f, f?.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'image') }
  const onDrag = (e: DragEvent<HTMLDivElement>) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setOver(true) } }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.current?.click() } }
  return <figure className="hero-fig">
    <div className="dot-card dot-card--bleed hero-card" data-scheme="dark" data-accent={accent} data-engaged={over || undefined} role="button" tabIndex={0}
      aria-label="Your image as dots: drop or paste an image, or press Enter to pick one" aria-describedby="hero-note"
      onClick={() => file.current?.click()} onKeyDown={onKey} onPointerMove={onMove} onDragOver={onDrag} onDragEnter={onDrag} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <DotCanvas layers={layers} grid={GRID} style={STYLE} theme={theme} change={false} enter={{ delay: 0, mask: 'bayer' }} />
    </div>
    <figcaption className="fig-cap"><b>FIG 00</b>{image ? image.name.toUpperCase() : 'YOUR IMAGE'} · {GRID.cols} × {GRID.rows} · HALFTONE STEP 2</figcaption>
    <p className="hero-note" id="hero-note">Drop or paste an image, or <button type="button" onClick={() => file.current?.click()}>pick one</button>{image && <> · <button type="button" onClick={() => { setImage(null); setNote('Back to the sphere.') }}>clear</button></>}. It stays on this device: nothing is uploaded.</p>
    <p className="sr-only" role="status" aria-live="polite">{note}</p>
    <input ref={file} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; void open(f, f?.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'image'); e.target.value = '' }} />
  </figure>
}
