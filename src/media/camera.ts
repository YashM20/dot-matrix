/**
 * Webcam capture for live-media cards (app-level, browser only; MASTER-PLAN P4 "webcam mirror").
 * `getUserMedia` → a `<video>` → each `grab()` draws the newest video frame into a small canvas at the
 * card's cell resolution (cover-cropped, mirrored), reads it back and writes luma into one `Raster`,
 * normalised by a smoothed auto-exposure (2nd–98th percentile stretch + a gamma that puts the median
 * near mid grey). The stream is only requested from `start()`, which callers run on a user action.
 */
import type { CellBounds, GridConfig } from '../engine/types'
import { createRaster, type Raster } from '../engine/raster'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'error'
export interface CameraCapture {
  /** Luma on `grid`, non-zero only inside `box`; the same object for the capture's lifetime. */
  readonly raster: Raster
  readonly status: CameraStatus
  /** Frames written so far. */
  readonly frame: number
  /** Ask for the camera (permission prompt). Resolves once live, denied or failed. */
  start(): Promise<void>
  /** Stop every track and release the device. */
  stop(): void
  /** Pull the newest video frame into `raster` if there is one. True when the raster changed. */
  grab(): boolean
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const BINS = 64
/** Auto-exposure smoothing per frame (0..1): low = no pumping when someone walks past. */
const AE_RATE = .12

export function createCamera(grid: GridConfig, box: CellBounds = [0, 0, grid.cols - 1, grid.rows - 1], opts: { mirror?: boolean; onStatus?: (status: CameraStatus) => void } = {}): CameraCapture {
  const [c0, r0, c1, r1] = box, w = c1 - c0 + 1, h = r1 - r0 + 1, mirror = opts.mirror ?? true
  const raster = createRaster(grid, 'card', box)
  let status: CameraStatus = 'idle', stream: MediaStream | null = null, video: HTMLVideoElement | null = null
  let ctx: Ctx2D | null = null, frame = 0, lastTime = -1, token = 0
  // smoothed exposure: black point, white point, gamma
  let lo = 0, hi = 1, gamma = 1, primed = false
  const hist = new Uint32Array(BINS), luma = new Float32Array(w * h)
  const set = (s: CameraStatus) => { status = s; opts.onStatus?.(s) }

  const surface = (): Ctx2D | null => {
    if (ctx) return ctx
    const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null
    return ctx
  }

  const cam: CameraCapture = {
    raster,
    get status() { return status },
    get frame() { return frame },
    async start() {
      if (status === 'live' || status === 'starting') return
      if (!navigator.mediaDevices?.getUserMedia) { set('error'); return }
      const mine = ++token
      set('starting')
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        if (mine !== token) { s.getTracks().forEach(t => t.stop()); return } // stopped while the prompt was open
        stream = s
        video ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true })
        video.srcObject = s
        await video.play()
        primed = false; lastTime = -1
        set('live')
      } catch (error) {
        if (mine !== token) return
        stream?.getTracks().forEach(t => t.stop()); stream = null
        set((error as DOMException)?.name === 'NotAllowedError' || (error as DOMException)?.name === 'SecurityError' ? 'denied' : 'error')
      }
    },
    stop() {
      token++
      stream?.getTracks().forEach(t => t.stop()); stream = null
      if (video) { video.pause(); video.srcObject = null }
      if (status !== 'denied' && status !== 'error') set('idle')
    },
    grab() {
      if (status !== 'live' || !video || video.readyState < 2 || video.currentTime === lastTime) return false
      const g = surface(), vw = video.videoWidth, vh = video.videoHeight
      if (!g || !vw || !vh) return false
      lastTime = video.currentTime
      // cover-crop the video to the box's aspect (cells are square), mirrored like a mirror
      const aspect = w / h, sw = Math.min(vw, vh * aspect), sh = sw / aspect
      g.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? w : 0, 0)
      g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h)
      const px = g.getImageData(0, 0, w, h).data
      hist.fill(0)
      for (let i = 0, j = 0; i < luma.length; i++, j += 4) {
        const l = (.2126 * px[j] + .7152 * px[j + 1] + .0722 * px[j + 2]) / 255
        luma[i] = l; hist[Math.min(BINS - 1, (l * BINS) | 0)]++
      }
      // auto-exposure: percentiles from the histogram, eased over frames
      const at = (p: number) => { let n = 0; const goal = p * luma.length; for (let b = 0; b < BINS; b++) { n += hist[b]; if (n >= goal) return (b + .5) / BINS } return 1 }
      const pLo = at(.02), pHi = Math.max(pLo + .08, at(.98)), med = Math.min(.95, Math.max(.05, (at(.5) - pLo) / (pHi - pLo)))
      const g1 = Math.min(1.6, Math.max(.6, Math.log(.45) / Math.log(med))), k = primed ? AE_RATE : 1
      lo += (pLo - lo) * k; hi += (pHi - hi) * k; gamma += (g1 - gamma) * k; primed = true
      const span = 1 / Math.max(.08, hi - lo), d = raster.data, cols = grid.cols
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = (luma[y * w + x] - lo) * span
        d[(r0 + y) * cols + c0 + x] = v <= 0 ? 0 : v >= 1 ? 1 : v ** gamma
      }
      frame++
      return true
    },
  }
  return cam
}
