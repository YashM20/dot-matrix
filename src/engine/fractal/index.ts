/**
 * Fractals (#68, docs/IQ-PLAN.md IQ7): escape-time sets with the smooth iteration count, orbit traps, and the
 * density-accumulation fractals (popcorn, IFS, icons), plus Lyapunov fractals. Ported from Inigo Quilez's articles
 * (MIT, THIRD-PARTY-NOTICES.md); each function names its source.
 *
 * Not re-exported from `src/engine/index.ts`: import it by path (`src/engine/fractal`) so it stays out of first load.
 * Everything here is deterministic (`dmath`, seeded streams, fixed counts): the determinism lint scans this folder.
 */
export * from './escape'
export * from './traps'
export * from './density'
export * from './popcorn'
export * from './ifs'
export * from './icon'
export * from './lyapunov'
