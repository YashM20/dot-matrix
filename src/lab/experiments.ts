/**
 * The lab (`/lab/`, GitHub #86): interactive pieces that aren't board cards. A card is one layer stack on a board
 * grid, pinned by the goldens; a lab piece can have several panels, its own controls and its own rules (the pipeline
 * turns quantization off on purpose to show the smooth field). Later pieces may draw with something other than dots.
 *
 * Pure data, so postbuild and the app's links can name pieces without loading them. The figures are in `./Lab.tsx`.
 */
export interface Experiment { slug: string; title: string; dek: string; date: string }

export const EXPERIMENTS: readonly Experiment[] = [
  { slug: 'pipeline', title: 'Field to dots', dek: 'One field drawn twice: so fine it looks smooth, and as the dots a card uses. Drag the blob and change the pitch.', date: '2026-11-01' },
]
/** The index page's own meta. */
export const LAB = { title: 'Lab · MATRIX', dek: 'Interactive pieces that sit outside the boards: take a part of the engine and play with it.', path: '/lab/' }
export const experimentPath = (slug: string): string => `/lab/#${slug}`
