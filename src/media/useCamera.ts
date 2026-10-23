import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CellBounds, GridConfig, Layer } from '../engine/types'
import type { FrameContext } from '../engine/context'
import type { Raster } from '../engine/raster'
import { createCamera, type CameraStatus } from './camera'

/** `data.camState` codes a camera card reads (see `CAM` in the mirror board). */
const STATE: Record<CameraStatus, number> = { idle: 0, starting: 1, live: 2, denied: 3, error: 3 }

export interface CameraFeed {
  status: CameraStatus
  /** Data merged into the card's `data` (`camState`). */
  data: Record<string, number>
  /** The frame's `ctx.media`: grabs the newest video frame; undefined unless live. Stable identity. */
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
  const cam = useMemo(() => (enabled && cols && rows ? createCamera({ cols, rows }, boxKey ? (boxKey.split(',').map(Number) as CellBounds) : undefined, { onStatus: setStatus }) : null), [enabled, cols, rows, boxKey])
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
  const read = useCallback(() => {
    if (!cam || cam.status !== 'live') return undefined
    cam.grab()
    return cam.frame ? { camera: cam.raster } : undefined
  }, [cam])
  const data = useMemo(() => ({ camState: STATE[status] }), [status])
  return { status, data, read }
}

/** A layer source with the host's media merged into every frame's context (the card itself stays pure in ctx). */
export function withMedia<C extends FrameContext>(layers: (ctx: C) => Layer[], read: CameraFeed['read']): (ctx: C) => Layer[] {
  return ctx => { const media = read(); return layers(media ? { ...ctx, media } : ctx) }
}
