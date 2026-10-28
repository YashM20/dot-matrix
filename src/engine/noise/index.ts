/**
 * The shared noise toolkit (docs/living-matter/F0-foundation.md §2): deterministic scalar math (`dmath`, built on
 * `trig` and `hash`), gradient noise, fBm, turbulence, ridged noise and curl noise (`gradient`), legacy value noise
 * (`value`), and Worley / Voronoi noise (`voronoi`). The IR noise pack (`./ir`) is a separate side-effect import.
 * Not re-exported from `src/engine/index.ts`: first-load code imports that barrel and the bundler would pull
 * this into the first-load chunk (same rule as `src/engine/algo/index.ts`). Import `engine/noise` directly.
 *
 * Determinism (for sims whose pristine run is a golden or must replay bit for bit; docs/ALGORITHMS.md):
 *  - seed every stream with `rngFor(seed, id, step)`, never `Math.random`;
 *  - step with a fixed `dt`;
 *  - sort with an id tie-break;
 *  - no `Math.sin/cos/tan/atan2/hypot/exp/log/pow/…` (the ban list in scripts/lib/detLint.ts) and no `**` with a
 *    non-integer exponent in a step: use `dsin`/`tsin`/`datan2`/`dexp`/`dpow`. A new deterministic scalar goes into
 *    `dmath.ts` with an accuracy test in scripts/noise.ts; a new sim path gets one line in `DET_PATHS`.
 */
export * from './dmath'
export * from './gradient'
export * from './value'
export * from './voronoi'
