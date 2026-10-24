/**
 * The local remix gallery: programs you ran or remixed (localStorage), the 8 seeds, and the remix
 * graph drawn in dots — nodes are tiny thumbnails of each program, edges are dotted parent → child links.
 */
import type { GridConfig, Layer } from '../../engine/types'
import { checkShared, programHash, type SharedProgram } from '../../lib/share'
import { layoutFor } from '../../widgets/types'
import { EXAMPLES } from './examples'
import { compileSource, dataFor, programName } from './program'

export interface Entry extends SharedProgram { id: string; name: string; at: number; seed?: boolean }
const KEY = 'dot480.dots.gallery'
const MAX = 40

export const SEEDS: Entry[] = EXAMPLES.map((e, i) => ({ ...e, id: programHash(e), at: i, seed: true }))

export function loadGallery(): Entry[] {
  let stored: Entry[] = []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (Array.isArray(raw)) for (const r of raw) {
      try { const p = checkShared(r); stored.push({ ...p, id: programHash(p), name: programName(p.src), at: Number((r as Entry).at) || 0 }) } catch { /* drop bad rows */ }
    }
  } catch { stored = [] }
  const seen = new Set(SEEDS.map(s => s.id))
  return [...SEEDS, ...stored.filter(e => !seen.has(e.id) && (seen.add(e.id), true))]
}

/** Add (or refresh) a program; returns the new list. Seeds are never stored; the oldest own entries drop past `MAX`. */
export function recordProgram(list: Entry[], p: SharedProgram): Entry[] {
  const id = programHash(p)
  if (list.some(e => e.id === id && e.seed)) return list
  const entry: Entry = { src: p.src, grid: p.grid, lattice: p.lattice, tone: p.tone, ...(p.parent && p.parent !== id && { parent: p.parent }), id, name: programName(p.src), at: Date.now() }
  const own = [...list.filter(e => !e.seed && e.id !== id), entry].slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(own.map(({ src, grid, lattice, tone, parent, at }) => ({ src, grid, lattice, tone, parent, at })))) } catch { /* private mode / full */ }
  return [...list.filter(e => e.seed), ...own]
}

export const clearGallery = () => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return [...SEEDS] }

// ── graph layout ── one row per remix depth, nodes in slots; thumbnails on a 2× lattice
const K = 2, THUMB = 18, SLOT_W = 21, SLOT_H = 27, PAD = 1
export interface GraphNode { entry: Entry; col: number; row: number; parent?: GraphNode }
export interface Graph { nodes: GraphNode[]; grid: GridConfig; slotCols: number; slotRows: number }

export function layoutGraph(list: Entry[]): Graph {
  const byId = new Map(list.map(e => [e.id, e]))
  const depth = new Map<string, number>()
  const depthOf = (e: Entry, guard = 0): number => {
    const known = depth.get(e.id)
    if (known !== undefined) return known
    const parent = e.parent ? byId.get(e.parent) : undefined
    const d = parent && guard < 32 ? depthOf(parent, guard + 1) + 1 : 0
    depth.set(e.id, d)
    return d
  }
  list.forEach(e => depthOf(e))
  // rows ordered so children follow their parent's position
  const rows: Entry[][] = []
  for (const e of list) (rows[depth.get(e.id)!] ??= []).push(e)
  const pos = new Map<string, number>()
  rows.forEach((row, r) => {
    if (r > 0) row.sort((a, b) => (pos.get(a.parent!) ?? 0) - (pos.get(b.parent!) ?? 0) || a.at - b.at)
    row.forEach((e, i) => pos.set(e.id, i))
  })
  const slotCols = Math.max(8, ...rows.map(r => r.length)), slotRows = rows.length
  const nodes = new Map<string, GraphNode>()
  rows.forEach((row, r) => row.forEach((e, i) => nodes.set(e.id, { entry: e, col: i, row: r })))
  for (const n of nodes.values()) if (n.entry.parent) n.parent = nodes.get(n.entry.parent)
  const grid = { cols: (slotCols * SLOT_W + PAD * 2) * K, rows: (slotRows * SLOT_H - (SLOT_H - THUMB) + PAD * 2 + 2) * K, pitch: 1.5 }
  return { nodes: [...nodes.values()], grid, slotCols, slotRows }
}

/** Thumbnail origin in lattice cells. */
const origin = (n: GraphNode): [number, number] => [PAD + n.col * SLOT_W + 1, PAD + n.row * SLOT_H + 1]

/** Graph → layers: all thumbnails in one 2× lattice layer, dotted remix edges, the current node framed in the accent. */
export function graphLayers(g: Graph, current: string | undefined, t = 1.5): Layer[] {
  const sub = { cols: Math.floor(g.grid.cols / K), rows: Math.floor(g.grid.rows / K) }
  const slots = new Map<number, (u: number, v: number) => number>()
  for (const n of g.nodes) {
    const c = compileSource(n.entry.src)
    if (!c.program) continue
    const f = c.program({ t, data: dataFor(c.program.info.data, {}) }), [ox, oy] = origin(n)
    slots.set(oy * sub.cols + ox, f)
  }
  const thumbs = (u: number, v: number) => {
    const x = Math.round(u * (sub.cols - 1)), y = Math.round(v * (sub.rows - 1))
    const sc = Math.floor((x - PAD) / SLOT_W), sr = Math.floor((y - PAD) / SLOT_H)
    const ox = PAD + sc * SLOT_W + 1, oy = PAD + sr * SLOT_H + 1, lx = x - ox, ly = y - oy
    if (lx < 0 || ly < 0 || lx >= THUMB || ly >= THUMB) return 0
    const f = slots.get(oy * sub.cols + ox)
    return f ? f((lx + .5) / THUMB, (ly + .5) / THUMB) : 0
  }
  const T = layoutFor(g.grid)
  const edges: [number, number][] = []
  for (const n of g.nodes) if (n.parent) {
    const [px, py] = origin(n.parent), [cx, cy] = origin(n)
    const x0 = (px + THUMB / 2) * K, y0 = (py + THUMB + .6) * K, x1 = (cx + THUMB / 2) * K, y1 = (cy - .6) * K
    edges.push(...(T.dotLine(x0, y0, x1, y1, { spacing: 3.2, size: 1.2 }).sites ?? []))
  }
  const layers: Layer[] = [{ field: thumbs, lattice: K, tone: 'auto' }]
  if (edges.length) layers.push({ ...T.dots(edges, 1.2), tone: 'mid' })
  const cur = g.nodes.find(n => n.entry.id === current)
  if (cur) {
    const [ox, oy] = origin(cur), x0 = (ox - .5) * K - .5, y0 = (oy - .5) * K - .5, s = THUMB * K + 1
    const frame: [number, number][] = []
    for (let i = 0; i <= s; i += 2) frame.push([x0 + i, y0], [x0 + i, y0 + s], [x0, y0 + i], [x0 + s, y0 + i])
    layers.push({ ...T.dots(frame, 1.1), tone: 'active' })
  }
  return layers
}

/** Which node sits under a point given as fractions of the graph card. */
export function nodeAt(g: Graph, fx: number, fy: number): GraphNode | undefined {
  const x = fx * g.grid.cols / K, y = fy * g.grid.rows / K
  return g.nodes.find(n => { const [ox, oy] = origin(n); return x >= ox - 1 && x < ox + THUMB + 1 && y >= oy - 1 && y < oy + THUMB + 1 })
}
