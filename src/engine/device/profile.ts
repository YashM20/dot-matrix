/**
 * Device profiles (P5 · "One Field, Five Surfaces"): what a physical dot surface can show.
 * A profile is plain data — grid, mask, tone depth, tone map, pitch, dot shape, refresh and the
 * display physics its simulator reads. `toDevice` resamples a card onto it; the simulators in this
 * folder turn a sequence of device frames into what the panel actually looks like at time t.
 */

/** How a linear-light level in [0,1] becomes one of the device's 2^bits drive levels. */
export interface ToneMap {
  /** `linear`: round to the nearest level · `threshold`: on at ≥ `threshold` · `blueNoise`: blue-noise ordered dither (area-correct). */
  map: 'linear' | 'threshold' | 'blueNoise'
  threshold?: number
  /** Display gamma of the panel (drive → perceived), read by the emulators, not by `toDevice`. */
  gamma?: number
}
export interface EinkPhysics {
  kind: 'eink'
  /** Every Nth refresh is a full (flashing) refresh; the others are partial and leave ghosts. */
  fullEvery: number
  /** Seconds a partial / full refresh takes on screen. */
  partialS: number
  fullS: number
  /** Ink a pixel keeps after it is cleared by a partial refresh (0..1), and how much of it survives each later partial. */
  ghost: number
  ghostDecay: number
}
export interface FlipPhysics {
  kind: 'flipdisc'
  /** Seconds between two columns being written (the controller scans column by column). */
  columnS: number
  /** Natural frequency (rad/s) and damping of the disc's rotation: < 1 overshoots and settles (inertia). */
  omega: number
  zeta: number
}
export interface LedPhysics {
  kind: 'led'
  /** Halo: fraction of a lit LED's light seen on its 8 neighbours (PSF), and the diffuser's floor glow. */
  bloom: number
  /** Brightness of an unlit LED's lens (the visible matrix when off). */
  offGlow: number
}
export interface PlotterPhysics {
  kind: 'plotter'
  /** Pen speed while drawing and while travelling (device cells per second), and pen lifts per second. */
  drawSpeed: number
  travelSpeed: number
  /** Radius (cells) of the loop drawn for the top tone level; level k draws k concentric loops. */
  loop: number
  /** Pen width in cells (line weight of the preview). */
  pen: number
}
export type DevicePhysics = EinkPhysics | FlipPhysics | LedPhysics | PlotterPhysics

export interface DeviceProfile {
  id: string
  name: string
  cols: number
  rows: number
  /** Which pixels exist: `round` = the cells whose centre is within cols/2 of the centre (Glyph Matrix: 489 of 625). */
  mask?: 'round'
  /** Tone depth per pixel (1 = on/off). */
  bits: number
  tones: ToneMap
  /** Physical pixel pitch in mm (sizes the preview; the sampler works in device cells). */
  pitch: number
  dotShape: 'square' | 'circle' | 'disc' | 'pen'
  /** Frames per second the panel can take (e-ink / flip-disc: refreshes per second in the demo). */
  refresh: number
  physics?: DevicePhysics
}

export const DEVICES = {
  browser: { id: 'browser', name: 'Browser', cols: 144, rows: 144, bits: 8, tones: { map: 'linear', gamma: 2.2 }, pitch: .6, dotShape: 'circle', refresh: 60 },
  'glyph-matrix-25': {
    id: 'glyph-matrix-25', name: 'Glyph Matrix 25', cols: 25, rows: 25, mask: 'round', bits: 8, tones: { map: 'linear', gamma: 2.2 }, pitch: 1.5, dotShape: 'circle', refresh: 60,
    physics: { kind: 'led', bloom: .14, offGlow: .05 },
  },
  'trmnl-800x480': {
    id: 'trmnl-800x480', name: 'TRMNL 7.5" e-ink', cols: 800, rows: 480, bits: 1, tones: { map: 'blueNoise' }, pitch: .2, dotShape: 'square', refresh: 1,
    physics: { kind: 'eink', fullEvery: 10, partialS: .32, fullS: .9, ghost: .3, ghostDecay: .8 },
  },
  'flipdisc-28x14': {
    id: 'flipdisc-28x14', name: 'Flip-disc 28×14', cols: 28, rows: 14, bits: 1, tones: { map: 'threshold', threshold: .5 }, pitch: 10, dotShape: 'disc', refresh: 1,
    physics: { kind: 'flipdisc', columnS: .02, omega: 60, zeta: .32 },
  },
  plotter: {
    id: 'plotter', name: 'Pen plotter A6', cols: 48, rows: 48, bits: 2, tones: { map: 'blueNoise' }, pitch: 2, dotShape: 'pen', refresh: 0,
    physics: { kind: 'plotter', drawSpeed: 90, travelSpeed: 260, loop: .42, pen: .14 },
  },
} as const satisfies Record<string, DeviceProfile>
export type DeviceId = keyof typeof DEVICES
export const deviceProfile = (id: DeviceId): DeviceProfile => DEVICES[id]

/** `cols×rows`: the key a spec's curated `variants` use. */
export const gridKey = (p: { cols: number; rows: number }) => `${p.cols}x${p.rows}`

/** Pixel existence mask (1 = the pixel is there). */
export function deviceMask(p: DeviceProfile): Uint8Array {
  const m = new Uint8Array(p.cols * p.rows).fill(1)
  if (p.mask === 'round') {
    const cx = (p.cols - 1) / 2, cy = (p.rows - 1) / 2, R = Math.min(p.cols, p.rows) / 2
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if ((c - cx) ** 2 + (r - cy) ** 2 > R * R) m[r * p.cols + c] = 0
  }
  return m
}

/**
 * The same device at a smaller preview resolution (an 800×480 panel shown inside a 144-dot card):
 * cols/rows scaled by `k` (rounded), same tone map and physics. The dither then lives at the preview
 * pitch — what the card shows is the panel's look, not its pixel count.
 */
export function previewProfile(p: DeviceProfile, k: number): DeviceProfile {
  return { ...p, id: `${p.id}@${k}`, cols: Math.max(1, Math.round(p.cols * k)), rows: Math.max(1, Math.round(p.rows * k)), pitch: p.pitch / k }
}
