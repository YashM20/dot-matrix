/**
 * DOTS tab helpers without React (verify imports these): compile a source once, and turn a program
 * plus its frame inputs into the card's layers — one Field IR layer on the chosen lattice, through
 * the normal Field → Grid Sampler → Renderer pipeline.
 */
import { compileUntrusted, IRError, irGuard, type IREnv, type IRGuard, type IRProgram } from '../../engine/ir'
import { irRemote, type IRRemote } from '../../engine/ir/sandbox/remote'
import '../../engine/noise/ir' // IR noise pack: noise() fbm() turb() voronoi() in DOTS programs
import { TEST_HOOKS } from '../../lib/testHooks'
import { flag } from '../../site/flags'
import type { Layer } from '../../engine/types'
import { SHARE_GRIDS, type SharedProgram } from '../../lib/share'
import { tileStyle } from '../../widgets/types'

export const DOTS_STYLE = tileStyle
/** A `data.<key>` slider starts here (a missing key would read 0, which hides most `data`-driven programs). */
export const DATA_DEFAULT = .5

/**
 * The guard every user program on the main thread runs under (MAKE frames, their thumbnails, programs from links):
 * a time budget per frame, and a program that runs past it is paused (`src/engine/ir/guard.ts`).
 */
export const userPrograms = irGuard()
/**
 * The IR sandbox worker the editor samples user programs in (`src/engine/ir/sandbox`): a frame that doesn't come back
 * in time gets the worker terminated. Off with the `worker` flag (`?worker=0`) or without module workers: then they
 * run on the main thread under `userPrograms` alone.
 */
export const userRemote = irRemote({ enabled: () => flag('worker'), watchdogMs: probeWatchdog() })
/** A probe may shorten the watchdog (`__dotIrWatchdogMs`, test builds only) to see a real worker terminated under a slow program. */
function probeWatchdog(): number | undefined {
  const ms = TEST_HOOKS ? (globalThis as { __dotIrWatchdogMs?: unknown }).__dotIrWatchdogMs : undefined
  return typeof ms === 'number' && ms >= 1 && ms <= 1000 ? ms : undefined
}
if (TEST_HOOKS && typeof window !== 'undefined') (window as unknown as { __irSandbox?: unknown }).__irSandbox = userRemote.stats

/**
 * The remix graph's thumbnail guard with the programs in the sandbox worker. `graphLayers` (gallery.ts) hands each
 * thumbnail's field to `guard.field`; this sends that program instead (its source is the field's `from` tag) with the
 * inputs `graphLayers` gives it: `t`, every data key at `DATA_DEFAULT`. scripts/ir-worker.ts holds it to the direct thumbnails.
 */
export function sandboxedThumbs(guard: IRGuard, remote: IRRemote, t = 1.5): IRGuard {
  return {
    ...guard,
    field(key, cost, f) {
      const src = f.from && 'ir' in f.from ? f.from.ir : undefined, c = remote.active && typeof src === 'string' ? compileSource(src) : undefined
      return c?.program ? remote.field(c.program, src!, key, { t, data: dataFor(c.program.info.data, {}) }, guard) : guard.field(key, cost, f)
    },
  }
}

export type Compiled = { program: IRProgram; error?: undefined } | { program?: undefined; error: IRError }
/** Parse + compile to the closure tree (`compileUntrusted`, memoised). Shared links go through here too: a bad program is an error, never run. */
export function compileSource(src: string): Compiled {
  try { return { program: compileUntrusted(src) } }
  catch (e) { return { error: e instanceof IRError ? e : new IRError(String((e as Error)?.message ?? e)) } }
}

export const gridOf = (p: Pick<SharedProgram, 'grid'>) => SHARE_GRIDS[p.grid]

export function programLayers(program: IRProgram, env: IREnv, p: Pick<SharedProgram, 'lattice' | 'tone'>): Layer[] {
  return [{ field: program(env), tone: p.tone, ...(p.lattice > 1 && { lattice: p.lattice }) }]
}

/** Every referenced `data.<key>` at its slider value (default `DATA_DEFAULT`). */
export function dataFor(keys: readonly string[], values: Readonly<Record<string, number>>): Record<string, number> {
  const d: Record<string, number> = {}
  for (const k of keys) d[k] = Object.prototype.hasOwnProperty.call(values, k) ? values[k] : DATA_DEFAULT
  return d
}

/** A program's display name: the first word of its leading `// name: …` comment, else "untitled". */
export function programName(src: string): string {
  const m = /^\s*\/\/\s*([A-Za-z0-9][\w -]{0,23})/.exec(src)
  return (m?.[1].split(/[:—-]/)[0].trim() || 'untitled').toLowerCase()
}
