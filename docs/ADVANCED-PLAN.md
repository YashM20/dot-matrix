# ADVANCED-PLAN — research, findings, roadmap

> **Reference (snapshot 2026-10-14).** Its findings became MASTER-PLAN phases P0–P6, which are all built. Its numbers (71 presets, 8 boards) are historical. Current state: `docs/PROGRESS.md`.


> Snapshot 2026-10-14, branch `feat/tile-boards` (d2bbb22). Sources: code audit, benchmark (`.snapshots/bench/`), web research on techniques and on the product landscape. Architecture lives in `DOT-MATRIX-ENGINE-PLAN.md`, tokens in `DESIGN.md`; this file only plans.

## 1. Baseline
- 71 presets, 8 boards, all on TILE 144×144. `tsc --strict`, lint, `pnpm verify` and the build are green.
- Bundle: one 350 kB JS chunk (116 kB gzip), no code splitting.
- Per-frame cost is fine: the worst board spends 9.4 ms per frame sampling its animated cards, against a 12 fps budget of 83 ms.
- Mount cost is not fine:
  - mosaic samples for 103 ms on mount, audio for 68 ms.
  - Board SVG markup is 1.3–2.9 MB; single photo cards reach about 10 MB as SVG.
  - `renderSVG` takes longer than sampling.

## 2. Findings (severity → fix)

### High
| # | Finding | Fix |
|---|---|---|
| H1 | `cells(f, box)` in `mosaic.ts` returns non-zero values outside its box and relies on `bounds` to clip. Removing bounds changes 3 cards; vision-camera alone gains +4,464 dots. Bounds are documented as a hint, not a clip. | Make the helper return 0 outside its box. `verify`: every preset renders identically with and without bounds. |
| H2 | Presets are hardwired to TILE (`layoutFor(TILE)` at module scope, `u*143`), so the `DotWidget size` prop misaligns cards. | Pass `grid` in `WidgetContext` and build `T` per call, or remove `size`. |
| H3 | The engine can't be packaged: `verify-acceptance.ts` imports `widgets`, `WidgetContext` lives in widgets, the barrel `export *` leaks internals, and `superformulaPath` throws. | Move tests out of `src/engine`, add `LayerSource<Ctx>` to the engine, curate `index.ts`, build a library with `.d.ts`. |
| H4 | Draw: the W/H inputs resize on every keystroke (typing 640 passes through 6, then 4 columns) and destroy the drawing. Undo after a resize decodes cells with the wrong column count. | Apply the size on blur/Enter, make resize an undoable snapshot, clear history on resize. |

### Medium
- **Duplicated board helpers (M1):**
  - polyline dots ×4, ring slots ×3, local fonts ×3, sprites ×3, cell-space fields ×3, pill/rounded-rect outlines ×5, corner brackets ×3;
  - `hash` ×5, `segDist` ×3, `smoothstep` ×7.
  - Fix: promote them to `T.dotPath`, `T.dotRing({n, phase})`, `T.textSites` with a font registry, `cellsField`, `T.outline`, `T.brackets`, and a new `engine/math.ts`.
- **Generators unused (M2):** no card calls `T.icon` or any polar, spline, warp, waveform or halftone field. `corridor` and `rays` reimplement engine fields. Fix: use the engine fields, or mark them experimental.
- **Accent rule undefined (M3):** AGENTS says one accent *colour* per board, DESIGN says one accent per card, PLAN says one element per card. 26 cards have more than one `active` layer, and nothing asserts the rule. Fix: decide the definition (§6) and assert it in `verify`.
- **Quantization off on non-photo cards (M4):** `ev-charge`, `vision-camera` and `level-03` turn quantization off through `photoStyle`. Fix: mark them `photo`-like and assert it.
- **Token drift (M5):**
  - DESIGN colours (`label`, `mute`, `success`, `warning`…) are missing from `tokens.ts`;
  - typography tokens are referenced but not defined;
  - spacing tokens differ from the CSS;
  - shadcn `--primary`/`--accent` names remain in `index.css`.
- **Stale docs (M6):** `HARNESS.md`, `BLOCK-INVENTORY.md`, `ADVERSARIAL-REVIEW.md`, `VERIFICATION-16POINT.md`, the README "Writing a card" example (legacy `CARD`/`L` API), and the `snap.ts` comment.
- **Sampler edge cases (M7):**
  - `lattice: 0` or `NaN` throws, and a negative lattice gives a negative radius;
  - `NaN` sites end up in the SVG;
  - `catmullRomField([])` throws.
  - Fix: clamp, filter, guard, and test each case.
- **SVG size (M8):** about 400 bytes per dot from unrounded floats and per-dot attributes. Rounding to 2 decimals halves it; `<defs>`/`<use>` or merging dots of the same colour and opacity into one `<path>` cuts it about 10×.
- **Playground (M9):**
  - `withChrome()` returns a new closure on every render, so every store change re-samples;
  - whole-store subscriptions add more re-renders;
  - the React snippet drops style fields;
  - `opacityMode` is forced, so `constant`-mode cards look wrong;
  - the photo persists across presets;
  - quantize = 1 does nothing.
- **Photo path (M10):** images are stretched to the grid's aspect, decode errors are uncaught, and Draw's auto-trace lights almost every cell.

### Low
- DPR handling is good; animation hooks don't leak.
- `DrawCanvas` isn't DPR-aware, and Draw leaks object URLs.
- The advertised Draw shortcuts have no handler.
- Tabs aren't a `tablist` and the active tab isn't in the URL.
- `--mute` contrast is 3.85:1.
- Cards only announce their name, not their values; add `describe(ctx)`.

## 3. Performance plan (measured gains)
1. Skip `applyJitter` when the amount is 0 (it allocates a closure and arrays per dot). Emitting 20k dots goes from 8.4 to 1.1 ms. Trivial change.
2. SVG output:
   - round to 2 decimals and drop `fill-opacity="1"`;
   - group dots in `<g fill>` and reuse shapes with `<defs>`/`<use>`.
   - Board markup goes from 2–3 MB to about 0.3 MB.
3. Preset hot spots:
   - `thermal-monitor`: compute heat once per cell, 37 → about 13 ms;
   - `apps`: add bounds to `cellField`, 18.9 → about 2 ms;
   - bake static photo fields into a lookup Field.
   - Together: mosaic mount 103 → about 25 ms.
4. Canvas: batch dots by (colour, opacity) into one `Path2D` and one `fill()` per group. That is 2–13 fills per UI card instead of 300–3000. A sprite atlas plus `drawImage` is the alternative.
5. A module-level cache of sample and SVG output for static cards, keyed by id, grid, style and data. Revisiting a board then costs about 0.
6. Split static and animated layers: cache the static composite and re-sample only what changes. deerflow12 goes from 9.4 to about 4 ms per frame. `vision-ai` becomes a static card with a tone toggle.
7. Lower the sampler floor (a `Uint8Array` for tone indices, reused buffers, scanning only the union of layer bounds). Saves about 0.4 ms per call.
8. Later:
   - a struct-of-arrays `DotInstance`;
   - sampling in a worker with `OffscreenCanvas`;
   - a WebGL2 instanced-quad renderer (anti-aliased superellipse via f/|∇f|, the same n = 2 + 30r²; one canvas per board using scissor rects).
   - WebGPU stays optional: support is about 86% and Firefox and Linux are patchy.

## 4. Technique upgrades (research)
- **Halftone:**
  - linear-light luminance;
  - area-correct dots: r ∝ √v at constant opacity. Today radius and opacity both scale with value, so perceived tone ≈ v³, which is likely why the gamma-1.4 hack exists;
  - a 64×64 blue-noise mask instead of Bayer-8;
  - serpentine Floyd–Steinberg; Ostromoukhov / Zhou–Fang variable coefficients; structure-aware error diffusion for faces;
  - spatiotemporal blue noise for video and webcam, fed by `requestVideoFrameCallback`.
- **Type:**
  - a BDF/HEX importer;
  - Misaki 8×8 and GNU Unifont as deterministic CJK. This replaces the system-font fallback, so `pnpm snap` renders CJK;
  - proportional advances (`DWIDTH`) and integer kerning pairs;
  - weight as a distance-transform threshold, a continuous axis that still snaps to dots.
  - Avoid Zpix (paid licence) and NDot (Nothing's brand font).
- **Motion:**
  - `transition(a, b, p, mask)`, which covers dissolve, wipe and radial reveal;
  - SDF morphs between icons;
  - split-flap and flip-disc state machines;
  - phosphor afterglow, v′ = max(v, old·e^(−Δt/τ));
  - closed-form springs sampled at frame times;
  - bloom on the accent only.
- **Testing:**
  - a hash of each preset's quantized dot list as the CI gate;
  - pixelmatch/SSIM diffs on `pnpm snap` PNGs for review;
  - fast-check properties: fields stay in [0,1], bounds are sound, glyphs land on whole dots, determinism;
  - lint-ban `Math.random` under `src/engine`.

## 5. Product direction
- **Landscape:** every device is its own silo:
  - Nothing Glyph Matrix (25×25 Android toys, SDK barely used);
  - TRMNL (800×480 1-bit, Liquid plugins, 80/20 marketplace, MCP server);
  - Tidbyt/Tronbyt (64×32, Pixlet, orphaned community);
  - AWTRIX (32×8, JSON over MQTT);
  - Pixoo (64×64 HTTP).
- **Gaps:**
  - web kits stop at 5×5 loaders and 5×7 text;
  - Figma has only icon plugins;
  - dither tools stop at static images.
- **Positioning:** *design once, render to any dot display.* `Field → Sampler` doesn't depend on resolution, so the same card can be resampled to any device grid.

## 6. Roadmap
| Phase | Scope | Exit criteria |
|---|---|---|
| **0 · Harden** (≈1 wk) | H1–H4, M7, perf items 1–3 and 5; accent and quantization asserts; archive stale docs; remove Tailwind and shadcn leftovers; lazy-load tabs; GitHub Action (`tsc`, lint, verify, golden hashes) | CI green; mosaic mount < 30 ms; board SVG < 0.5 MB |
| **1 · Engine 2.0** (2–4 wk) | M1 helper consolidation; grid-aware presets (H2); `@dot480/core` + `@dot480/react` + a `<dot-card>` custom element; batched canvas; static/animated split; linear-light halftone, blue noise, serpentine scan; BDF fonts + Misaki/Unifont; motion combinators; playground fixes (M9, M10) | `npm i @dot480/core` works; zero duplicated helpers; CJK in snap |
| **2 · Platform** (1–3 mo) | WebGL2 renderer + worker sampling; `toDevice(preset, {cols, rows, levels})` with AWTRIX, Glyph Matrix, TRMNL and Tronbyt adapters; GIF/MP4 export; shadcn registry; card URLs and OG-image endpoint; live data binding (poll, webhook, JSONPath) with 10 sources; `describe(ctx)` for a11y | Card on 3 physical targets; 30% of new cards bound to live data |
| **3 · Ecosystem** (3–12 mo) | Prompt/image → `Layer[]` through MCP, with snap-diff self-check; Figma plugin (one SVG per card); community gallery with forks; hosted render-and-push runtime | ≥60% of AI-generated cards pass the snap diff; 100 community cards |

## 7. Decisions needed
1. **Accent rule:** one accent *colour* per board (the current code, the reading I'd keep), or one accent *element* per card (26 cards would change)?
2. **Product track:** an open-source kit only, or the device platform from §5–6 as well?
3. **Tailwind:** remove it? It's effectively unused.
4. **Package names:** are `@dot480/core`, `@dot480/react` and `@dot480/widgets` available and wanted?
