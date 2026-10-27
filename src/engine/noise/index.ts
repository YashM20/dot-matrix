/**
 * The shared noise toolkit (docs/living-matter/F0-foundation.md §2): deterministic scalar math (`dmath`) and
 * gradient noise, fBm, turbulence, ridged noise and curl noise (`gradient`).
 * Not re-exported from `src/engine/index.ts`: first-load code imports that barrel and the bundler would pull
 * this into the first-load chunk (same rule as `src/engine/algo/index.ts`). Import `engine/noise` directly.
 */
export * from './dmath'
export * from './gradient'
