# Changelog

All notable changes to Dot/480 are recorded here, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no tagged releases yet, so entries are grouped by date and commit.

## [Unreleased] — 2026-10-14 · research and planning
### Added
- `docs/ADVANCED-PLAN.md`: full audit and roadmap. It covers:
  - a baseline benchmark (per-frame vs mount cost, SVG size);
  - findings H1–H4, M1–M10 and Low;
  - a measured performance plan, technique upgrades (halftone, type, motion, testing) and product direction;
  - a phased roadmap and the open decisions.
- `docs/MOTION-INTERACTION-DEPTH.md`: research on animation (load-in, transitions, springs, afterglow), interaction (pointer, press, focus, ripple, fisheye) and depth (blend modes, occlusion moat, lighting, parallax, bloom). Includes an analysis of why level-03, afterlight, mosaic and components work, and a market scan, with sources.
- `docs/MASTER-PLAN.md` (draft v1): phased plan from widget kit to dot-native interface engine:
  - a fidelity rubric and refinement protocol;
  - an Engine 2.0 architecture (`FrameContext`, Layer 2.0, field algebra, motion, SimField, card spec);
  - phases P0–P7, cross-cutting budgets, risks and decisions.
- `public/lab/motion-lab.html` (served at `/lab/motion-lab.html`): standalone live prototype with four tiles:
  - mask transitions;
  - decode scramble plus a closed-form spring;
  - pointer interaction (fisheye, hover glow, press spring, ripple, keyboard focus);
  - Lambert-lit depth with a pointer torch, shadows, moat and bloom.
- `CHANGELOG.md` (this file).
- **Public changelog in the app:** a LOG tab (deep link `?tab=log`) listing releases v0.1–v0.4 and the upcoming phases, written for visitors (`src/changelog.ts`, `src/components/Changelog.tsx`).
- `docs/PROGRESS.md`: handoff checklist of what's done, pending and skipped, per phase.
### Changed
- `docs/MASTER-PLAN.md` → **v2**, after adversarial review by three critics (engine architecture, design/fidelity, vision/research). Main changes:
  - **Fidelity:** split into gates + visual score + life score, with rank-validity calibration; a style bible; a type-scale ladder; a v0–v5 refinement protocol with variants, bar sheets and a human like on heroes.
  - **Architecture:** a `Raster` kind for neighbourhood ops; a `layers()`/`live()` static split; buffer-level keyed transitions with data springs; a 60 Hz master clock; hit-testing as data; a fixed-rate SimField; an integer hash.
  - **Field IR:** promoted to a core deliverable.
  - **Perception Lab:** a new track (DeviceProfile, HVS-SSIM, halftone ladder, display simulators).
  - **Showcases:** sharper flagships (Departures, Instrument, Cinema, Levels, Glyph, Agent Heartbeat, Five Surfaces).
  - **Backlog and scope:** a lift backlog for the weakest cards; an explicit cut list.

## 2026-10-13 · `d2bbb22` — rebuild all boards on the 144×144 TILE standard
### Added
- **Engine:**
  - per-layer coarser `lattice` and `origin`, and explicit dot `sites`, so bigger elements use bigger dots instead of clusters;
  - `Field.bounds` (`CellBounds`), so the sampler visits only the cells a layer can light;
  - cell-space layout helpers in `src/engine/layout.ts` (`textAt`, `placeCells`, `ringCells`, `barsAt`, `polylineCells`, `spriteAt`, …);
  - the Scale2x `smooth` display weight for big type;
  - a pure-TS SVG path rasterizer (`fields/svgPath.ts`), so icons render headlessly.
- **Widgets:**
  - all seven reference boards rebuilt as `src/widgets/boards/*` (henry, deerflow12, mosaic, henry3, metro, ride, audio) on `TILE` with dot-drawn chrome (`chrome: 'dots'`);
  - the new **components** board (toggle, pill, slider, icon button, status dot);
  - shared sprites in `src/widgets/sprites.ts`.
- **Tooling:** `pnpm snap`, headless PNG snapshots of cards and boards in `.snapshots/` for reference checks.
- **App:**
  - animations pause off-screen and when the tab is hidden;
  - `prefers-reduced-motion` support;
  - DPR-aware canvas;
  - a responsive 3 → 2 → 1 column grid;
  - card accessibility labels (`role="img"`).
### Changed
- The `gridSampler` composites layers by maximum value, with lattices first and card cells under lit lattice dots and sites covered.
- `DESIGN.md`, `README.md` and `docs/DOT-MATRIX-ENGINE-PLAN.md` document the TILE typography tiers and lattice/sites/bounds.
### Removed
- The 40+ legacy single-file widgets in `src/widgets/*.ts` (replaced by the board files).
- Unused shadcn UI components (`src/components/ui/*`), `ThemeProvider`, `components.json`, and template assets.

## 2026-08-24 · `6c526fe` — verification script, Draw and Gallery tabs
### Added
- `pnpm verify` (`src/engine/verify-acceptance.ts`): engine acceptance tests.
- A **Draw** tab: a grid drawing canvas, toolbar, reference image panel, Bresenham lines and field export (`src/components/draw/*`, `src/hooks/useDrawBoard.ts`, `src/lib/*`).
- A **Gallery** tab and a playground data editor (per-preset sliders).
- A recorder widget.
### Changed
- Corrected the 3D projection maths in `projection3D.ts` and the engine plan.
- Refined the icon SDF, the halftone, polar, scatter and warped fields, and the sampler.
- Updated `ADVERSARIAL-REVIEW.md` (final pass verdict) and `BLOCK-INVENTORY.md` (widget coverage).

## 2026-08-22 · `278cf24` — Dot/480 engine, widgets and docs
### Added
- **Engine** (`src/engine`, framework-free):
  - the `Field → Grid Sampler → Renderer` pipeline;
  - generators: bitmap font, CJK fallback, halftone, heatmap, icon SDF, polar, 3D projection, scatter, spline, warped, waveform;
  - quantize and jitter;
  - squircle dot shapes;
  - SVG and canvas renderers;
  - theme tokens.
- **App:**
  - board view with `DotCanvas` and `DotWidget`;
  - playground (controls, photo upload, export, gallery, preview);
  - `useDotField` hook.
- About 40 widget presets (clock, timer, weather, fitness rings, music, messages, thermal monitor, metro line and more).
- Reference images in `public/images/`.
- Docs: `DOT-MATRIX-ENGINE-PLAN.md`, `ADVERSARIAL-REVIEW.md`, `BLOCK-INVENTORY.md`, the PRD and step handoffs.
- shadcn UI components and Tailwind wiring.
### Changed
- `AGENTS.md` clarifies the engine dependency rule.
- `README.md` describes the architecture and usage.

## 2026-08-22 · `0e5e97a` — Tailwind and import aliases
### Added
- Tailwind CSS v4 via `@tailwindcss/vite`.
- `@/` path aliases in Vite and TypeScript.

## 2026-08-22 · `8002c2d` — first commit
### Added
- Vite + React + TypeScript scaffold, oxlint config.
- `AGENTS.md` (invariants) and `DESIGN.md` (tokens, colours, typography, components).
