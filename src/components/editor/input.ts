/**
 * The editor's input logic without React (docs/EDITOR-PLAN.md §4, §7): which tool a key picks, where an
 * old MAKE mode lands, the camera maths (zoom about a point, pinch, fit) and the geometry of the canvas
 * gestures (resize by a corner, drag a frame or a layer, drag out a new frame). `Canvas.tsx`, `Editor.tsx`
 * and `store.ts` call these; `scripts/editor.ts` tests them in Node.
 */
import type { GridConfig } from '../../engine/types'
import type { Mode } from '../../site/views'
import { frameById, layerOf, pitchOf, resizeFrame, topDown, type EditorDoc, type EditorFrame, type Sel } from './doc'
import type { LeftTab, RightTab, Tool } from './store'

// ── keys and entries ───────────────────────────────────────────────────────
/** Single-letter tool keys (P is the pen alias of B). */
export const KEY_TOOL: Readonly<Record<string, Tool>> = { v: 'move', h: 'hand', f: 'frame', b: 'draw', p: 'draw', t: 'text', c: 'code' }

/** Each old MAKE mode (`?make=<mode>`, any old `?tab=`) opens the editor on a tool and the panels it used to be. */
export const MODE_ENTRY: Readonly<Record<Mode, { tool: Tool; left: LeftTab; right: RightTab }>> = {
  TUNE: { tool: 'move', left: 'assets', right: 'design' },
  COMPOSE: { tool: 'move', left: 'layers', right: 'design' },
  DRAW: { tool: 'draw', left: 'layers', right: 'design' },
  CODE: { tool: 'move', left: 'layers', right: 'code' },
}

/** DRAW's selection: the selected frame's paint layer, else the first visible frame that has one (undefined = keep). */
export function paintTarget(d: EditorDoc, sel: Sel): Sel | undefined {
  const cur = frameById(d, sel.frame)
  const f = cur?.card.layers.some(l => l.kind === 'paint') ? cur : d.frames.find(x => !x.hidden && x.card.layers.some(l => l.kind === 'paint'))
  if (!f) return undefined
  return { frame: f.id, layer: topDown(f.card).find(x => x.kind === 'paint')?.id }
}
/** CODE's selection (no `?p=`): keep a selected code layer, else the topmost visible frame's top code layer (undefined = keep). */
export function codeTarget(d: EditorDoc, sel: Sel): Sel | undefined {
  if (layerOf(d, sel)?.kind === 'ir') return undefined
  for (const f of [...d.frames].reverse()) {
    const l = topDown(f.card).find(x => x.kind === 'ir')
    if (l && !f.hidden) return { frame: f.id, layer: l.id }
  }
  return undefined
}

// ── camera ─────────────────────────────────────────────────────────────────
export interface Camera { x: number; y: number; z: number }
export const ZOOM_MIN = .1, ZOOM_MAX = 16
export const clampZ = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
/** Zoom to `z` keeping the world point under screen `sx`, `sy` where it is. */
export function zoomCam(c: Camera, z: number, sx: number, sy: number): Camera {
  const nz = clampZ(z), k = nz / c.z
  return { z: nz, x: sx - (sx - c.x) * k, y: sy - (sy - c.y) * k }
}
/** Two fingers: scale by the change in their distance about their first midpoint, and follow the new midpoint. */
export function pinchCam(c0: Camera, d0: number, mx0: number, my0: number, d: number, mx: number, my: number): Camera {
  const z = clampZ(c0.z * d / Math.max(1, d0)), k = z / c0.z
  return { z, x: mx - (mx0 - c0.x) * k, y: my - (my0 - c0.y) * k }
}
/** The camera that fits world box `b` in a `w`×`h` viewport (padded, at most `max` zoom); no box centres the origin. */
export function fitCam(b: readonly [number, number, number, number] | undefined, w: number, h: number, max = 2): Camera {
  if (!b) return { x: w / 2, y: h / 2, z: 1 }
  const pad = Math.min(96, Math.max(24, Math.min(w, h) * .08)), bw = b[2] - b[0], bh = b[3] - b[1]
  const z = clampZ(Math.min(max, (w - pad * 2) / Math.max(1, bw), (h - pad * 2) / Math.max(1, bh)))
  return { z, x: (w - bw * z) / 2 - b[0] * z, y: (h - bh * z) / 2 - b[1] * z }
}

// ── gestures ───────────────────────────────────────────────────────────────
export type Handle = 'nw' | 'ne' | 'sw' | 'se'
/** How far a press may wander (screen px) and still be a tap: touch is looser than a mouse. */
export const PRESS_SLOP = { mouse: 3, touch: 8 } as const
/**
 * A frame resized by dragging corner `handle` by `dwx`, `dwy` world px from where the gesture started
 * (`f0`): whole cells, 8…512 per side; a west / north corner moves the frame so the opposite edge stays put.
 */
export function resizeByHandle(f0: EditorFrame, handle: Handle, dwx: number, dwy: number): EditorFrame {
  const p = pitchOf(f0.card), dx = Math.round(dwx / p), dy = Math.round(dwy / p)
  const west = handle.includes('w'), north = handle.includes('n')
  const cols = f0.card.grid.cols + (west ? -dx : dx), rows = f0.card.grid.rows + (north ? -dy : dy)
  const cc = Math.max(8, Math.min(512, cols)), rr = Math.max(8, Math.min(512, rows))
  return resizeFrame(f0, cc, rr, west ? cc - f0.card.grid.cols : 0, north ? rr - f0.card.grid.rows : 0)
}
/** A dragged frame's new position: snapped to 4 px, or 1 px with Shift. */
export function dragFramePos(x0: number, y0: number, dwx: number, dwy: number, fine = false): { x: number; y: number } {
  const snap = fine ? 1 : 4
  return { x: Math.round((x0 + dwx) / snap) * snap, y: Math.round((y0 + dwy) / snap) * snap }
}
/** A dragged text / sites layer moves in whole cells, so its dots stay on the grid. */
export const dragCells = (pitch: number, dwx: number, dwy: number): [number, number] => [Math.round(dwx / pitch), Math.round(dwy / pitch)]

/** The Frame tool's cell pitch (the TILE pitch). */
export const FRAME_PITCH = 2.25
/**
 * The Frame tool, from press (`wx0`, `wy0`) to release (`wx1`, `wy1`) in world px: a drag over 12 px each
 * way makes a card of that size (≥ 8 cells a side) at its top-left; a click makes a default tile centred
 * on the press (no `grid`: the caller's default).
 */
export function draftFrame(wx0: number, wy0: number, wx1: number, wy1: number): { grid?: GridConfig; at: { x: number; y: number } } {
  const x0 = Math.min(wx0, wx1), y0 = Math.min(wy0, wy1), w = Math.abs(wx1 - wx0), h = Math.abs(wy1 - wy0), pitch = FRAME_PITCH
  if (w > 12 && h > 12) return { grid: { cols: Math.max(8, Math.round(w / pitch)), rows: Math.max(8, Math.round(h / pitch)), pitch }, at: { x: x0, y: y0 } }
  return { at: { x: wx0 - 162, y: wy0 - 162 } }
}
