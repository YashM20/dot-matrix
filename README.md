# Dot/480 — Field-based Dot-Matrix UI Engine

Every visual is `Layer[]` (a `Field(u,v) → [0,1]` plus a colour tone) → grid sampler → SVG or Canvas. Nothing is hand-drawn.

- **Engine:** `src/engine/` — plain TypeScript + Canvas/SVG APIs, no dependencies. Fields (bitmap font, polar, stroked-icon SDF, halftone, waveform, spline, heatmap, Poisson scatter, 3D corridor, warps), cell-space layout (`layout.ts`), squircle renderers, theme tokens.
- **Widgets:** `src/widgets/boards/*.ts` — 66 cards recreated from the seven reference boards in `public/images/`, one file per board, plus `components.ts` (toggle, pill, slider, icon button, status dot primitives from the DOT/480 sheet). `src/widgets/sprites.ts` holds the pixel art.
- **App:** `src/components/` — `DotCanvas` (renderer choice, DPR, 12 fps animation), `DotWidget` (card chrome), `Board`, the Workspace playground (gallery, controls, data sliders, export, photo halftone) and the Draw tab.
- **Docs:** `DESIGN.md` (tokens, typography scales, shapes, components), `docs/DOT-MATRIX-ENGINE-PLAN.md` (module map, algorithms), `AGENTS.md` (invariants). Original specs in `public/docs/`.

## Scripts
```bash
pnpm dev        # Vite dev server — Boards / Gallery / Workspace / Draw tabs
pnpm build      # tsc -b && vite build
pnpm verify     # headless acceptance tests (sampler, lattices, squircle, text, halftone, every preset)
pnpm snap --board henry3   # headless PNG of a board (or card ids, or --all) into .snapshots/
pnpm check      # typecheck + lint + verify
```
Deep links: `/?board=mosaic` opens a board, `/?card=timer` renders a single card.

## Writing a card
```ts
import { CARD, L, baseStyle, layer, type WidgetPreset } from '../types'
export const timer: WidgetPreset = {
  id: 'timer', name: '03 Timer', group: 'polar', live: true, grid: CARD, style: baseStyle,
  defaults: { progress: 0.62 },                       // → sliders in the Workspace DATA panel
  layers: ({ data }) => [
    layer(L.ring(40, 34, 32, { every: 2 }), 'faint'),  // track
    layer(L.ring(40, 34, 32, { sweep: Math.PI * 2 * data.progress, every: 2 }), 'active'),
    layer(L.text('12:48', 40, 24, { scale: [2, 2], align: 'center' })),
  ],
}
```
Text is placed by integer cell with `L.text(str, col, row, { scale })`, so every glyph pixel lands on whole dots. `tone: 'active'` is the single accent — one element per card.
