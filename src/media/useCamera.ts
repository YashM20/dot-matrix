import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CellBounds, GridConfig, Layer } from '../engine/types'
import type { FrameContext } from '../engine/context'
import type { Raster } from '../engine/raster'
import type { CameraStatus } from './camera'

type CameraCore = typeof import('./cameraCore')
let core: CameraCore | null = null, loading: Promise<CameraCore> | null = null
const loadCore = () => (loading ??= import('./cameraCore').then(m => (core = m), (error: unknown) => { loading = null; throw error }))

/** `data.camState` codes a camera card reads (see `CAM` in the mirror board). */
const STATE: Record<CameraStatus, number> = { idle: 0, starting: 1, live: 2, denied: 3, error: 3 }

export interface CameraFeed {
  status: CameraStatus
  /** Data merged into the card's `data` (`camState`; `tiltX` / `tiltY` in -1..1 where the device reports orientation). */
  data: Record<string, number>
  /**
   * The frame's `ctx.media`: grabs the newest video frame; undefined unless live. Stable identity.
   * `camera` = luma; `silhouette` = what differs from the room as first seen (0..1) and `motion` = a decaying
   * motion history, both computed on first read in a frame (cards that never read them pay nothing).
   */
  read: () => Record<string, Raster | undefined> | undefined
}

/**
 * Camera for a card that declares `media: 'camera'`. Nothing is requested until `on` turns true (a
 * control the user pressed), so the permission prompt only ever follows a user action. The stream stops
 * when `on` turns false, the card unmounts or the tab is hidden, and resumes when the tab is shown again.
 */
export function useCamera(enabled: boolean, on: boolean, grid: GridConfig | undefined, box?: CellBounds): CameraFeed {
  const cols = grid?.cols ?? 0, rows = grid?.rows ?? 0, boxKey = box?.join(',') ?? ''
  const [raw, setStatus] = useState<CameraStatus>('idle')
  // capture and vision code (./cameraCore.ts) load when a camera card mounts, well before its feed is switched on
  const [mod, setMod] = useState(core)
  useEffect(() => {
    if (!enabled || mod) return
    let live = true
    loadCore().then(m => { if (live) setMod(m) }, () => { if (live) setStatus('error') })
    return () => { live = false }
  }, [enabled, mod])
  const cam = useMemo(() => (mod && enabled && cols && rows ? mod.createCamera({ cols, rows }, boxKey ? (boxKey.split(',').map(Number) as CellBounds) : undefined, { onStatus: setStatus }) : null), [mod, enabled, cols, rows, boxKey])
  // switched off: always idle (a denial is forgotten, so the next tap asks again)
  const status: CameraStatus = on ? raw : 'idle'
  useEffect(() => {
    if (!cam) return
    if (!on) { cam.stop(); return }
    const sync = () => { if (document.hidden) cam.stop(); else void cam.start() }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { document.removeEventListener('visibilitychange', sync); cam.stop() }
  }, [cam, on])
  // silhouette / motion: a background model over the card's own luma, fed once per new camera frame
  const vision = useMemo(() => (mod && cam ? mod.visionOf(cam, cols, rows) : null), [mod, cam, cols, rows])
  useEffect(() => { if (on) vision?.reset() }, [on, vision])
  const read = useCallback(() => {
    if (!cam || cam.status !== 'live') return undefined
    cam.grab()
    return cam.frame ? vision?.media : undefined
  }, [cam, vision])
  // device tilt (phones): parallax for cards that read it; desktops never fire the event
  const [tilt, setTilt] = useState<[number, number] | null>(null)
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return
    let last: [number, number] = [0, 0]
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      const next: [number, number] = [Math.max(-1, Math.min(1, e.gamma / 35)), Math.max(-1, Math.min(1, (e.beta - 45) / 35))]
      if (Math.abs(next[0] - last[0]) + Math.abs(next[1] - last[1]) < .03) return
      last = next; setTilt(next)
    }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [enabled])
  const data = useMemo((): Record<string, number> => (tilt ? { camState: STATE[status], tiltX: tilt[0], tiltY: tilt[1] } : { camState: STATE[status] }), [status, tilt])
  return { status, data, read }
}

/** A layer source with the host's media merged into every frame's context (the card itself stays pure in ctx). */
export function withMedia<C extends FrameContext>(layers: (ctx: C) => Layer[], read: CameraFeed['read']): (ctx: C) => Layer[] {
  return ctx => { const media = read(); return layers(media ? { ...ctx, media } : ctx) }
}
