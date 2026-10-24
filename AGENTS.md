# AGENTS.md

## What this is
Dot/480 — a field-based dot-matrix UI engine. Full spec lives in two docs, always read them first, don't duplicate their content here:
- `docs/DOT-MATRIX-ENGINE-PLAN.md` — architecture, modules, algorithms
- `DESIGN.md` — tokens, colors, typography, components

This file only holds things that would break the project if an agent guessed wrong, and that don't change as models get smarter.

## Non-negotiables
- Every visual = `Field → Grid Sampler → Renderer`. Never hand-draw a widget outside this pipeline. Widgets are `Layer[]` (field + tone) placed in cell space via `src/engine/layout.ts`; text goes through `textAt`/`T.big` so glyph pixels stay dot-aligned. Bigger elements use a coarser `lattice` or dot `sites`, never clusters of small dots. Check new cards against their reference with `pnpm snap`.
- One accent color per board (`{colors.dotActive}`). If you're about to add a second, stop and ask.
- Quantize UI dot sizes (`{grid.quantizeSteps}`); only photos skip quantization.
- `src/engine/` stays framework-free — no React, no UI library, no new npm dependency, ever. It's plain TypeScript + browser Canvas/SVG/WebGL2 APIs only. New deps (if truly needed) only go in the app-level `package.json` for playground UI code (`src/components/playground/`), never for anything under `src/engine/`.
- Dot roundness = squircle exponent (`cornerRoundness` → `n = 2 + 30r²`), not a radius enum. Don't reintroduce shape presets.
- Renderer choice (`svg` / `canvas` / `webgl`) is decided by dot count, animation and GPU-tagged layers, not by convenience — check the rules in `DESIGN.md` before hardcoding one.

## The site
- Card pixels are pinned by `goldens/hashes.json`: UI/chrome work must keep `pnpm golden --check` matching. Regenerate goldens only for an intended card change.
- First-load JS stays ≤ 150 kB gz (`scripts/site/size.ts --check`, run in CI). New views and features load lazily.
- Board ids are URLs (`/<board>/`). Rename what visitors see with `boardLabel`; keep old ids working with `boardAliases` (`src/widgets/manifest.ts`).
- Which doc is current: `docs/README.md`. What's done and next: `docs/PROGRESS.md`.

## Before changing a generator or token
1. Check if it's already covered by an existing `Field` function — new generators should be rare.
2. Update `DESIGN.md` token tables in the same PR if you add/rename a token. Stale tokens are worse than missing docs.
3. Don't invent new token names that shadow existing ones (`{colors.dotActive}` not `{colors.accent}` / `{colors.primary}` / etc).

## Keeping this file from going stale
- This file describes *invariants*, not current model capabilities, current library versions, or current best practices — those change and don't belong here.
- If you (the agent) notice an instruction here contradicts what's actually in the code or in `DESIGN.md`/`PLAN.md`, the code and those two docs win — fix this file to match them, don't fix the code to match this file.
- Re-verify this file's claims against the actual repo state at the start of any nontrivial task; don't assume it's been kept in sync.
- Keep this file under ~60 lines. If it's growing, the content probably belongs in `DESIGN.md`/`PLAN.md` instead — link to it, don't inline it.