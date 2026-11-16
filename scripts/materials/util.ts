/** Shared helpers for the materials checks (scripts/materials.ts): timing, load factor, cell fields, the clock, options. */
import type { Pointer } from '../../src/engine/context'
import type { Field, GridConfig } from '../../src/engine/types'
import { freezeWallClock } from '../lib/freeze'

export type Assert = (name: string, cond: boolean, detail?: string) => void
export const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
export const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }
export const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => Object.is(x, b[i]))
export const DEG = Math.PI / 180

/** How much slower this machine is right now than the reference box (a fixed float loop of ~12 ms there); never below 1. */
export function loadFactor(): number {
  const run = () => { let s = 0; for (let i = 0; i < 1e7; i++) s += (i & 7) * .5; return s }
  run()
  const ms = median([0, 1, 2].map(() => time(run)[0]))
  return Math.max(1, ms / 12)
}

/** A field written in cells of `g` (x right, y down). */
export const cells = (g: GridConfig, f: (x: number, y: number) => number): Field => (u, v) => f(u * (g.cols - 1), v * (g.rows - 1))

export interface MaterialsOptions { only?: string; bench?: boolean; /** Skip the timing asserts (functional iteration outside the heavy lock). */ quick?: boolean }

/** A pointer inside the card at cell (x, y), pressed or hovering. */
export const POINTER = (x: number, y: number, down = false): Pointer => ({ id: 1, x, y, inside: true, down, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 })
/** Run `f` with the wall clock frozen at a local date (the golden clock by default), restoring it after. */
export function atClock<T>(f: () => T, y = 2026, m = 0, d = 1, h = 9, min = 41): T {
  const Real = globalThis.Date
  freezeWallClock(y, m, d, h, min)
  try { return f() } finally { globalThis.Date = Real }
}
