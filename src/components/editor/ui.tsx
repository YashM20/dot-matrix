/**
 * Editor chrome primitives. Tool icons are tiny dot cards: a bitmap field sampled through the engine
 * and drawn by the Canvas renderer, so even the toolbar is made of dots. Inputs are plain HTML with
 * labels (44 px targets on touch, editor.css).
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { useThemeTokens } from '../../site/theme/useTheme'
import type { DotStyle, Field, Layer, Tone } from '../../engine/types'
import { polylineCells } from '../../engine/layout'
import { ease, masks, type EaseName, type MaskName } from '../../engine/motion'
import { tileStyle } from '../../widgets/types'

/** 7-row bitmaps: `#` full, `+` dim, anything else empty. */
export const ICONS = {
  move: ['#......', '##.....', '###....', '####...', '#####..', '##.##..', '#...##.'],
  hand: ['..#.#..', '.##.##.', '.#####.', '.######', '.#####.', '..####.', '...##..'],
  frame: ['.#...#.', '#######', '.#...#.', '.#...#.', '.#...#.', '#######', '.#...#.'],
  draw: ['.....##', '....###', '...###.', '..###..', '.###...', '+#.....', '++.....'],
  text: ['#######', '#..#..#', '...#...', '...#...', '...#...', '...#...', '..###..'],
  code: ['.....#...', '..#..#...', '.#..#..#.', '#...#...#', '.#..#..#.', '..##...#.', '...#.....'],
  layers: ['...#...', '.##.##.', '#.....#', '.##.##.', '#.###.#', '.##.##.', '...#...'],
  assets: ['###.###', '###.###', '###.###', '.......', '###.###', '###.###', '###.###'],
  inspect: ['++#++++', '.......', '++++#++', '.......', '+#+++++', '.......', '+++#+++'],
  undo: ['.#.....', '##.....', '#####..', '##...#.', '.#...#.', '.....#.', '..###..'],
  redo: ['.....#.', '.....##', '..#####', '.#...##', '.#...#.', '.#.....', '..###..'],
  share: ['....##.', '...###.', '#.####.', '#..##..', '#...#..', '#......', '######.'],
  plus: ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'],
  back: ['...#...', '..#....', '.#.....', '#######', '.#.....', '..#....', '...#...'],
  play: ['#......', '###....', '#####..', '######.', '#####..', '###....', '#......'],
  pause: ['##..##.', '##..##.', '##..##.', '##..##.', '##..##.', '##..##.', '##..##.'],
} satisfies Record<string, string[]>
export type IconName = keyof typeof ICONS
const ICON_STYLE: DotStyle = { shape: 'squircle', sizeMin: 0, sizeMax: 1, cornerRoundness: .2, opacityMode: 'fromValue', quantizeSteps: 5 }

/** A tool icon as dots. `tone`: `active` (the accent) only for the active tool. */
export function DotIcon({ name, tone = 'value', px = 2.6 }: { name: IconName; tone?: Tone; px?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rows = ICONS[name], h = rows.length, w = rows[0].length
  // chrome icons take the site theme's dot tones (ink on paper in light)
  const theme = useThemeTokens()
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const k = Math.min(3, window.devicePixelRatio || 1)
    c.width = Math.round(w * px * k); c.height = Math.round(h * px * k)
    const field: Field = (u, v) => { const ch = rows[Math.round(v * (h - 1))]?.[Math.round(u * (w - 1))]; return ch === '#' ? 1 : ch === '+' ? .5 : 0 }
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.clearRect(0, 0, w * px, h * px)
    renderCanvas(ctx, sampleLayers([{ field, tone }], { cols: w, rows: h, pitch: px }, { ...ICON_STYLE, sizeMax: px * .46, sizeMin: px * .1 }, theme))
  }, [name, tone, px, rows, w, h, theme])
  return <canvas ref={ref} className="ed-icon" aria-hidden="true" style={{ width: w * px, height: h * px }} />
}

/** A small dot card for chrome (ease curves, mask orders), like the Studio timeline's. */
const MINI = { cols: 30, rows: 18, pitch: 2.25 }
export function MiniDots({ layers, label }: { layers: Layer[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useThemeTokens()
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const k = 2
    c.width = MINI.cols * MINI.pitch * k; c.height = MINI.rows * MINI.pitch * k
    ctx.setTransform(k, 0, 0, k, 0, 0)
    renderCanvas(ctx, sampleLayers(layers, MINI, { ...tileStyle, quantizeSteps: 4 }, theme))
  }, [layers, theme])
  return <canvas ref={ref} className="ed-mini" style={{ width: MINI.cols * MINI.pitch, height: MINI.rows * MINI.pitch }} role="img" aria-label={label} />
}
export function useCurve(name: EaseName): Layer[] {
  return useMemo(() => {
    const f = ease[name], pts: [number, number][] = []
    for (let i = 0; i <= 28; i++) pts.push([1 + i, MINI.rows - 2 - Math.round(f(i / 28) * (MINI.rows - 3))])
    return [{ field: polylineCells(MINI, [[1, MINI.rows - 1], [MINI.cols - 2, MINI.rows - 1]], 2, .35), tone: 'faint' }, { field: polylineCells(MINI, pts, 1, 1), tone: 'value' }]
  }, [name])
}
export function useMask(name: MaskName): Layer[] {
  return useMemo(() => { const m = masks[name]; return [{ field: (u: number, v: number) => 1 - m(Math.round(u * (MINI.cols - 1)), Math.round(v * (MINI.rows - 1)), MINI.cols, MINI.rows), tone: 'mid' }] }, [name])
}

export function Num({ label, value, onChange, min, max, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label className="ed-field"><span>{label}</span><input type="number" inputMode="decimal" value={Number.isFinite(value) ? +value.toFixed(3) : 0} min={min} max={max} step={step} disabled={disabled}
    onChange={e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max ?? v, Math.max(min ?? v, v))) }} /></label>
}
export function Pick<T extends string | number>({ label, value, options, onChange, fmt = String, disabled }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string; disabled?: boolean }) {
  return <label className="ed-field"><span>{label}</span><select value={String(value)} disabled={disabled} onChange={e => onChange(options.find(o => String(o) === e.target.value) as T)}>
    {!options.includes(value) && <option value={String(value)}>{fmt(value)}</option>}
    {options.map(o => <option key={String(o)} value={String(o)}>{fmt(o)}</option>)}</select></label>
}
export function Slider({ label, hint, value, onChange, min, max, step, fmt = v => v.toFixed(2) }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; fmt?: (v: number) => string }) {
  return <label className="ed-slider"><span>{label}{hint && <small>{hint}</small>}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /><output>{fmt(value)}</output></label>
}
export function Text({ label, value, onChange, max = 64, upper }: { label: string; value: string; onChange: (v: string) => void; max?: number; upper?: boolean }) {
  return <label className="ed-field ed-wide"><span>{label}</span><input value={value} maxLength={max} autoCapitalize={upper ? 'characters' : 'off'} spellCheck={false} onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)} /></label>
}
/** A segmented control (radio group). */
export function Seg<T extends string>({ label, value, options, onChange, fmt = String }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string }) {
  return <div className="ed-seg" role="radiogroup" aria-label={label}>{options.map(o => <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onChange(o)}>{fmt(o)}</button>)}</div>
}
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="ed-sec" aria-label={title}><h3><span>{title}</span>{aside && <small>{aside}</small>}</h3>{children}</section>
}
