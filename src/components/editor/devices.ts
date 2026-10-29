/**
 * EXPORT · DEVICES (E5): a frame through `toDevice` onto every device profile (`src/engine/device`), at the
 * timeline's t. Previews use the TRMNL panel at ¼ resolution (as the surfaces board does); exports use every
 * profile at its own resolution. React-free, so `scripts/editor.ts` checks it in Node.
 */
import { DEVICES, penPlanSVG, plotPaths, previewProfile, toDevice, type DeviceFrame, type DeviceId, type DotSource } from '../../engine/device'
import { pitchOf, themeOf, type EditorFrame } from './doc'
import { frameDots } from './render'

export const DEVICE_IDS = Object.keys(DEVICES) as DeviceId[]
const PREVIEW_K: Partial<Record<DeviceId, number>> = { 'trmnl-800x480': .25 }

/** The frame's dots at t (its timeline), as `toDevice` reads already-sampled dots. */
export function frameSource(f: EditorFrame, t: number): DotSource {
  const pitch = pitchOf(f.card)
  return { dots: frameDots(f, { timeline: true, t }), width: f.card.grid.cols * pitch, height: f.card.grid.rows * pitch, style: f.card.style, pitch }
}
/** One device frame per profile (`preview`: the big panels at their preview size). */
export function deviceFrames(f: EditorFrame, t: number, preview = true): DeviceFrame[] {
  const src = frameSource(f, t), theme = themeOf(f)
  return DEVICE_IDS.map(id => { const k = preview ? PREVIEW_K[id] : undefined; return toDevice(src, k ? previewProfile(DEVICES[id], k) : DEVICES[id], { theme }) })
}
/** Paper devices (e-ink, the plotter) draw ink on paper; panels draw light on dark. */
const paper = (fr: DeviceFrame) => fr.profile.physics?.kind === 'eink' || fr.profile.physics?.kind === 'plotter'
/** RGBA pixels of a device frame, one per device pixel; pixels the panel does not have are near black. */
export function devicePixels(fr: DeviceFrame): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(fr.cols * fr.rows * 4), ink = paper(fr)
  for (let i = 0; i < fr.out.length; i++) {
    const v = fr.mask[i] ? fr.out[i] : 0, g = !fr.mask[i] ? 7 : ink ? Math.round(235 - v * 215) : Math.round(18 + v * 237)
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g; px[i * 4 + 3] = 255
  }
  return px
}
/** Whole-pixel upscale for an exported PNG: about 480 px on the long side, never below 1×. */
export const exportScale = (fr: Pick<DeviceFrame, 'cols' | 'rows'>) => Math.max(1, Math.round(480 / Math.max(fr.cols, fr.rows)))
/** File name of a device export. */
export const deviceFile = (name: string, fr: DeviceFrame) => `${name}-${fr.profile.id.replace('@', '-')}.png`
/** The plotter's pen plan as SVG (the plotter profile only). */
export function plotterPlan(fr: DeviceFrame): string | undefined {
  const ph = fr.profile.physics
  return ph?.kind === 'plotter' ? penPlanSVG(plotPaths(fr, ph)) : undefined
}
