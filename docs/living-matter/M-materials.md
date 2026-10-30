# Track M: physical materials (M1 core, M2 glass and water, M3 extras)

> Status: **planned** (2026-10-27, branch `docs/living-matter-plan`). This is part M of the phase-wise build of `docs/LIVING-MATTER-PLAN.md` §5. Nothing in it is built yet.
>
> **M2 status (2026-10-29, round 3):** built, not merged. Engine: `matter/glass.ts` (`BEZEL`, `snellLUT`, `lensOffset`, `liquidGlass`, `frost`), `matter/caustics.ts` (`causticSplat`, `refractFloor`, `causticStats`), `stone.ts` `voronoiSites`. Six cards on `/materials/`: `mat-lens` (the board's one GPU layer), `mat-pool` (ripple + World, `fps: 30`), `mat-window`, `mat-patch`, `mat-rust` (World) and the candle clock `mat-candle` (§4.4, L1.4's `ropeStep` drips). The board shell moved to `boards/materials-shared.ts`; the cards are in `materials-glass.ts`, `materials-live.ts` (pool, rust: main thread, a worker stub keeps them out of `wk-materials`) and `materials-wear.ts`. **Deviations:**
> - Lens: the hero is `09:41` smooth on the 1.5 lattice (tier 2.5 would overrun the 116-cell dial), read through the glass bilinearly as its own layer; the screen behind (a floor dot every 2 cells, the ticks) is the GPU layer. Values: floor .5 `faint`, ticks .75 / 1. The pill's outline is drawn on the bezel's outer 1.5 cells (Fresnel alone reaches .15 only in the outermost cell at thickness 6 / bezel 12). The screen is memoized between frames (it only changes with the lens, the rim, the second or the minute).
> - Pool: drips at amp 2.4 (not .6) plus a small "breeze" splat every 3 steps, and caustic gain 12 (not 3): at the plan's numbers the slopes bent light by a fraction of a cell and no net formed. The pebble is the only red (sinking 1.2 s), grey once landed; none at rest.
> - Caustic splat: measured ~0.9 ms ÷ load for 72² × 4 photons, so the gate is 1 ms (the plan estimated 0.35).
> - Window: the lancet is redrawn so it fits (span 22–122, springing row 70, arcs of radius 54.2, apex ≈ row 16; the plan's radius-72 arcs put the apex at row −8); rose of radius 34 at (72, 52), petals on a ring of 24. Pressing a pane lifts it a step while held (no 0.8 s pulse: card data has no time). Lead is void with `mid` glints (phong ≥ .2).
> - Patch: the tap action is a TURN toggle that rotates the light a quarter about the patch (each stitch direction catches it anew); "sew 4× faster for 1 s" needs time state.
> - Rust: the front is the rust's edge cells within .008 of θ (≤ 250 dots), drawn as sites; hover adds a day of rust per second (120× real time was invisible); RESET sands in 1.2 s and time-lapses back at max(10, days / 6) days/s so it always finishes inside the 8 s idle; while the count is time-lapsing it is drawn in `idle` dots, not engraved. Bare steel is bright with a void brushing groove every third row; rust is darker, pitted.
> - Candle: a pillar on the 1.5 lattice, 96 cells at midnight, 4 per hour; hour notches; three frozen Verlet drips; the flame (curl-noise sway) is the accent. No interaction beyond the hover torch.
> It depends **by name** on two other tracks:
> - **F0:**
>   - `src/engine/noise` (`noise2`, `fbm2`, `turb2`, `curl2`, `voronoi2`) and `src/engine/noise/dmath.ts` (`dsin`, `dcos`, `tsin`, `tcos`, `datan2`, `dexp`, `dpow`);
>   - the light contract (F0-C, lane C = F0.7 → F0.8): the engine's `src/engine/light/input.ts` (`sceneLight`, `bucketLight`, `lightOfBucket`, `LIGHT_KEYS`) and the app `Source` `lightSource` in `src/site/light.ts`. It publishes the numeric data keys `lightSrc`, `lightAz`, `lightEl` (the light), `tx`, `ty` (the tilt offset: 0, 0 at rest, ±1 at max) and `gx`, `gy` (gravity, ≈ (0, 1) upright, **physics only**). There is no `data.light`;
>   - F0.9's determinism lint (the only one), F0.10's per-card fps (`WidgetPreset.fps` + the phone tier) and F0.11's ≥ 1 kB first-load cut;
> - **L1:** `src/engine/life/ripple.ts` (`createRipple`, `rippleStep`, `rippleSplat`, `rippleGrad`; API frozen at L1.2), and optionally `src/engine/life/chain.ts` (`ropeStep`, L1.4).
>
> Invariants (AGENTS.md):
> - Field → Sampler → Renderer;
> - one accent per board;
> - quantized sizes;
> - `src/engine` framework-free with no dependencies;
> - goldens are additive only;
> - first-load JS stays ≤ 150 kB gz. This track is gated on a **delta** against the ledger in `docs/LIVING-MATTER-PLAN.md` §6 (≈ +0.06 kB gz per board manifest row), not on an absolute number.
>
> Every code claim below cites `file:line` as of `ef4dcd8`.

---

## 0. What exists, and what it costs today

### 0.1 Code we build on

| Piece | Where | What it gives us |
|---|---|---|
| Height from an SDF | `src/engine/light/height.ts:60-79` (`heightRaster`) | A cached height raster per SDF identity, grid and profile (LRU of 8, `:42-52`). A negative `height` engraves (`:13-14`). |
| Stacking | `height.ts:82-88` (`stackHeights`) | An emblem embossed on a plate. |
| Normals | `height.ts:95-110` (`normalRaster`) | Central differences, cached per height raster. |
| Shading | `src/engine/light/shade.ts:55-84` (`pass`) | Lambert and Phong in one typed-array loop. It skips the power below 1e-3 (`:62`) and uses `powi` (`:36-41`). |
| Shading API | `lambert` `:87`, `phong` `:98`, `illuminate` `:105`, `torch` `:23`, `lightDir` `:18`, `bloom` `:117` | |
| Materials | `src/engine/light/material.ts` | `toneBands` `:49`, `matte` `:72`, `gloss` `:86`, `glass` `:129` (whole-cell offsets `:114-123`), `emissive` `:167`, `metal` with the `STUDIO` matcap `:189-208`, `fabric` with Bayer 4×4 `:223-245`, `sunAt` `:253`. |
| Materials board | `src/widgets/boards/light.ts` | Nine cards on a 2× lattice (`:17`), `boardLight` = pointer torch or the sun of the hour (`:164-167`). |
| Rasters | `src/engine/raster/raster.ts` | `rasterize` `:39`, `sample` nearest / bilinear `:63`. |
| Raster ops | `src/engine/raster/ops.ts` | `blur` mass-preserving `:39`, `outline` `:104`, `moat` `:119`, `cut` `:122`, `distanceRaster` (an exact EDT) `:164`. |
| Blue noise | `src/engine/halftone/mask.ts` | 64² void-and-cluster (`blueNoise` `:75`), `stbn(x, y, slice)` `:78`. |
| GPU values | `src/engine/renderer/webgl/passes.ts:40` (`gpuValues`) | A CPU field sampled into a value texture at `density`×. `toneOf` is allowed, and only IR + `toneOf` is refused (`:73`). Sites, `sizeCurve` and `jitter` stay on the CPU (`:72`). |
| Physics | `src/engine/physics/world.ts:52-113` (`WorldSpec` / `createWorld`), plus `pbd.ts` and `fluid.ts` | Pristine run, live fork, heal. PBD cloth with `createCloth` `:45` and `clothStep` `:105`. Fluid with `fluidSplat` `:65`, `fluidStep` `:171` and `fluidDensityAt` `:59`. |
| Algorithms | `src/engine/algo` | `dla` (`dla.ts:59`), `dsin` / `tsin`. `poissonDiscPoints` is in `src/engine/fields/scatterField.ts:4`. |
| Scripts | `scripts/verify.ts:54, 866-867` | Area scripts wired as `xChecks(assert)`. `scripts/algorithms.ts` is the template: `loadFactor` `:25`, board purity / t = 0 / one-accent / 4 ms checks `:129-146`, standalone runner `:149-154`. |
| Goldens | `scripts/golden.ts` | Hashes t = 0 and t = 1.3 for animated cards (`:19`). The key is x, y, r, opacity, colour (`:28`). The clock is frozen at **2026-01-01 09:41 local** (`scripts/lib/freeze.ts:6`). |

How the algorithms board was added (`git show --stat 230b5a3`):
- one lazy entry in `src/widgets/manifest.ts:55` and a group slot at `:83`;
- the eager registry row in `src/widgets/index.ts:27,61`;
- a board blurb in `src/widgets/blurbs.ts:33`;
- card blurbs in `src/widgets/meta.ts:307-310`;
- uids from `npx tsx scripts/widgets/ids.ts --assign`, which regenerates `src/widgets/catalog.ts:1`;
- `scripts/algorithms.ts` wired into verify;
- goldens with **added** keys only.

The engine barrel re-exports `light` (`src/engine/index.ts:29`). `src/engine/algo` is deliberately *not* re-exported (`algo/index.ts:1-6`), because first-load code imports the barrel.

### 0.2 Measured today (this machine, tsx, warm median of 13 frames, layers + sample)

| Thing | Cost |
|---|---|
| `light-torch` / `-matte` / `-gloss` / `-glass` (72² lattice) | 2.3–2.6 ms (pointer: 1.7–3.1) |
| `light-metal` / `-fabric` / `-orb` | 1.1–1.9 ms |
| `illuminate` on a **144²** disc (r 50) | 0.65 ms per call |
| `heightRaster` cold 144² | 9.3 ms; `normalRaster` 3.1 ms |
| `blur(r = 4)` 144² | 2.8 ms; `distanceRaster` 144² 6.9 ms |

**Consequences:**
- `shade.ts:7`'s "≈ 0.1 ms" holds at 72², not 144².
- Big lit surfaces go on a **1.5–2× lattice**. Card pitch is only for micro-structure (weave, stitches, engraving walls).
- A card's per-frame lighting budget is **≤ 2 shading passes**.
- Every EDT, blur or height bake is **out of the frame**: lazily on first frame, or once per minute.

---

## 1. Ground rules for the whole track

1. **Location.** New engine code lives in **`src/engine/matter/`**, which is *not* re-exported from `src/engine/index.ts`. This is the same reason `algo` isn't (`algo/index.ts:1-6`). Cards import `../../engine/matter` directly. `src/engine/light/*` is not edited, so the nine `light-*` goldens can't move.
2. **First load = 0 code bytes.** Cards live in lazy board chunks: `materials` for M1 and M2, `workshop` for M3. The only first-load bytes are one `boardManifest` row per board (about 60 B gz each, `sources: m.materialsSources` included: `lightSource` itself loads with the lazy board chunk).
   - **Gate: a delta, not an absolute.** `scripts/site/size.ts --check` before and after each wiring commit; first load may grow by **≤ +0.06 kB gz per board manifest row** (+0.06 for M1, 0 for M2, +0.06 for M3), booked against the ledger in `docs/LIVING-MATTER-PLAN.md` §6. F0.11 lands a ≥ 1 kB cut first, so the absolute ≤ 150 kB stays true with room for L, Q and M together.
   - **The worker chunk counts too.** `sampleWorker` imports the eager registry (`src/workers/protocol.ts:10` → `src/widgets/index.ts:32`), so `boards/materials.ts`, `boards/workshop.ts` and every `matter/` module they import ship in the worker chunk. `size.ts` follows the entry's static imports and `--board` closures (`scripts/site/size.ts:2-7`), not the worker. So each wiring step also records the gz size of `dist/assets/sampleWorker-*.js` before and after, and the delta goes in PROGRESS beside the first-load delta.
3. **Material comes from relief, never from hue.** The vocabulary is:
   - height → normal → tone band (`faint` → `mid` → `idle` → `value`);
   - one light;
   - AO;
   - a micro-pattern made of whole size steps.

   No new colour tokens.
4. **Pattern period ≥ 2 cells of the layer's own lattice**, and ≥ 3 for anything with a cross-profile (a thread, a groove). Each generator asserts this in `scripts/materials.ts`.
5. **Bake vs frame.** Geometry, AO, tangents, matcap LUTs, Snell LUTs and stone textures are baked once, lazily, on the card's first `layers()` call. They are never baked at module import, so opening the board doesn't stall. Per frame only the light, the sims and the cheap per-cell lookups run. **Budgets:**
   - ≤ 4 ms per card frame (layers + sample, warm median × load factor);
   - ≤ 30 ms cold first frame;
   - ≤ 10 ms for a once-a-minute rebake (clock digits).
6. **One accent per board, on the live part only.** The accent never marks a material. The cards: the shuttle, the value arc, the peak hole, today's chip, the current second, the sinking pebble, the hour pane, the needle, the rust front. Each card's red layer names its role (`live` / `primary`, STYLE-BIBLE §3).
   - **`activeDim` is not part of the one accent** until the owner rules (§10.6). `{colors.dotActiveDim}` is DESIGN.md's "was active" state (`DESIGN.md:24`), and counting it as "still one red" is the owner's call, not this track's. So no M card uses it. Wherever a card needs "was active" or "less active" (the Loom's trail, the window's night pane), it uses **size contrast** in the card's single `active` layer: the same red, whole size steps smaller.
7. **Determinism.**
   - Seeds come from `hash32(seed, id, step)`.
   - Inside sims, `src/engine/noise/dmath.ts` (`dsin`, `dcos`, `tsin`, `tcos`, `datan2`, `dexp`, `dpow`) replaces `Math.sin` / `cos` / `atan2` / `exp` / `pow`. Bakes may use `Math`, because they are deterministic per platform and are checked bit-for-bit against a second fresh bake.
   - **Lint.** F0.9's `det: no engine-specific Math in deterministic dirs` is the only determinism lint; M adds no second one. M registers its sim files with it **by file, not by directory**, because the bakes in `matter/` may use `Math`: `src/engine/matter/sand.ts`, `src/engine/matter/mercury.ts` and `src/engine/matter/thread.ts` (the M3 step code; §5). The registration is a one-line edit to F0.9's scan list in M3.1.
   - Fixed dt.
   - t = 0 is a finished, meaningful frame. It is also the reduced-motion frame and the thumbnail.
8. **Light source order.** F0's `sceneLight()` (`src/engine/light/input.ts`) is the only light resolver. The board's `matLight(ctx, o)` is a **thin wrapper** over it and adds nothing to the order. It only:
   - passes the pointer when it is hovering this card (`inside && !down`);
   - passes the card's torch height and falloff;
   - applies `rake` when the card asks for it.

   `sceneLight`'s order, first match wins:
   1. **Desktop:** this card's hovering pointer is a torch. On touch the card never sees an unclaimed finger (UX-PLAN §10), so hover lighting is desktop-only by construction.
   2. **Tilt:** `data.lightSrc === 1` → `lightOfBucket(data.lightAz, data.lightEl)`.
   3. **Sun:** `sunAt(hourOf(new Date()))` (`material.ts:253`).

   At golden time this is 09:41, so the sun is at azimuth ≈ −35° and elevation ≈ 44.8°. Cards that need raking light pass `rake: 18°`.
   - **Until F0-C lands,** `matLight` resolves pointer → `sunAt` itself (the same code path with `lightSrc` absent), so M1 cards are complete without the hub, and goldens are the same before and after (they see `lightSrc: 0` and the frozen clock).
   - **Tilt is (`tx`, `ty`), never `gx` / `gy`.** `tx` / `ty` are 0, 0 at rest and ±1 at max, so a phone held upright tips nothing. `gx` / `gy` are gravity (≈ (0, 1) upright) and feed physics steps only (mercury, sand, thread).
9. **Touch.** Every card works with taps only.
   - Drag controls (`knob`, `xy`, `gesture: 'surface'`) follow the horizontal-drag-or-hold rule (`{interaction.holdEngage}`).
   - Nothing needs a vertical drag before it is engaged.
   - The tilt permission is F0's single app-level button; cards never call `DeviceOrientationEvent.requestPermission()`.
   - The drag/hold cards (knob, lens, sand, mercury, thread) are proven in a real browser by `scripts/materials-browser.ts` (§2.4).

---

## 2. Shared plumbing (built once, in M1.1 and M1.6)

### 2.1 `src/engine/matter/index.ts`
```ts
/**
 * Physical materials (docs/living-matter/M-materials.md): relief, AO, anisotropic sheen, matcaps, weaves,
 * stitches, stone, glass v2 and caustics. Each is a pure function from rasters + one light to fields or
 * `Layer[]`; geometry is cached, light is per frame. Not re-exported from `src/engine/index.ts` (first load):
 * import `engine/matter` directly.
 */
export * from './relief'
export * from './aniso'
export * from './matcap'
export * from './weave'
export * from './stitch'
export * from './stone'
// M2
export * from './glass'
export * from './caustics'
```

### 2.2 `scripts/materials.ts` (template: `scripts/algorithms.ts`)
- Header lists every check group.
- It exports `materialsChecks(assert)`, called from `scripts/verify.ts` with a comment line `// MATERIALS) …`. The shared insertion order after `algorithmsChecks` (`verify.ts:867`) is **noise, light, golden key, life, squares, materials**, so `materialsChecks` is the last of the six blocks: after `squaresChecks` if Q has merged, else after whichever of the earlier blocks exist.
- It runs standalone with `npx tsx scripts/materials.ts [--only <group>] [--bench]`.

Helpers copied from algorithms:
- `loadFactor()` (a fixed float loop, about 12 ms on the reference box; budgets × max(1, measured / 12));
- `time`, `median`, `same` (bit-for-bit `Object.is`).

**How a card frame is measured.** This is the number every budget below refers to:
```ts
const frame = (p, t, pointers?) => sampleLayers(withChrome(p)({ t, data: { ...p.defaults }, pointers }), p.grid, p.style, dot480)
// warm: 4 frames, then median of 13 at t = 5.5 + i/60, once with no pointer and once with a hovering
// pointer sweeping 1 cell per frame (so torch-driven passes and caches are exercised, not hit)
```
- **Cold** is the first `frame(p, 0)` in a fresh module graph. The script dynamic-imports the board with a cache-busting query so bakes are measured.
- **Rebake** for clock cards is `frame(p, 0)` after `freezeWallClock(…, minute + 1)`.
- `--bench` prints a per-stage table: bake / light pass / aniso / matcap / layers / sample.

Each stage is timed by wrapping the exported functions (`timed(fn)`), not by adding timers to engine code.

**Board-level checks** (every phase re-runs them over its cards):
- `materials board: every card is a pure function of t (same t, same dots, any order)`: t ∈ {0, 1.3, 7.7, 3600}.
- `materials board: one accent per card, one red layer, on the live element`: for each card, at t ∈ {0, 1.3, 6}, the layers with tone `active` number ≤ 1. Every dot with `color === dot480.dotActive` comes from that layer. Cards marked `accentAtRest: false` have none at t = 0.
- `materials board: no activeDim`: no dot has `color === dot480.dotActiveDim` and no layer has tone `activeDim` (rule 6: "was active" is size contrast until the owner rules).
- `materials board: no material dot is dotActive`: red never appears in a band layer produced by `toneBands`, `matcap`, `anisoBands` and the like.
- `materials board: quantized`: every card style has `quantizeSteps ≥ 2`. No material card takes the photo exemption.
- `materials board: frame ≤ 4 ms (median, warm, × load)`, `cold ≤ 30 ms`, `rebake ≤ 10 ms`.
- `materials: engine/matter is not in the engine barrel`: the source of `src/engine/index.ts` contains no `'./matter'`.

### 2.3 Board files and wiring (M1.11, repeated for M2.8 and M3.11)
- `src/widgets/boards/materials.ts` exports:
  - `materialsBoard`;
  - `materialsSources = [lightSource]` (a `Source[]`, like `liveSources`, `boards/live.ts:32`, and F0.8's `physicsSources`);
  - `materialsHooks` (test hooks, like `algorithmsSources`, `boards/algorithms.ts:342`; renamed so it doesn't collide with the `sources` convention).
- **Light keys in `defaults` (explicit step).** Card data is numeric only, and `Board.tsx:82` passes a card only the keys it declares in `defaults` (`pick(live, preset.defaults)`). So every material card's `defaults` gains F0's fixture values `lightSrc: 0, lightAz: 0, lightEl: 7, tx: 0, ty: 0`. The physics cards (`mat-sand`, `mat-mercury`, `mat-thread`) also gain `gx: 0, gy: 1`. A card that leaves a key out never sees it, and silently falls back to the sun. The check `materials board: every card declares lightSrc/lightAz/lightEl/tx/ty in defaults` catches that.
- `manifest.ts`: `{ id: 'materials', title: 'MATERIALS — WOVEN, SPUN, CARVED, POURED', columns: 3, load: () => import('./boards/materials').then(m => ({ items: m.materialsBoard, sources: m.materialsSources })) }`. It goes in the `engine` group next to `light`. START HERE is an owner call.
- `index.ts` (the eager registry): one import and one `contents` row, `materials: { items: materialsBoard, sources: materialsSources }`, as `live` is at `index.ts:52`. `tsc` fails if the manifest and `index.ts` disagree (`manifest.ts:7`).
- `blurbs.ts`: `materials: 'Stone, glass, metal, cloth and thread made of dots: relief, one light and a moving part.'`
- `meta.ts` `cardBlurbs`: one line plus tags for **every** new widget (texts in §3–§5).
- `npx tsx scripts/widgets/ids.ts --assign` for every new widget (it rewrites `ids.json` and `catalog.ts`), then commit both.
- **Goldens, additive only:**
  1. `pnpm golden --check` on the base must report `all N presets match`.
  2. After adding the cards, `--check` must print **only `added mat-…` lines**, with 0 changed and 0 removed.
  3. Then `pnpm golden`.
  4. `git diff goldens/hashes.json` must show only `+` lines.

  A `changed` line for any existing preset is a bug in this track, not a re-baseline.
- **Docs at merge** (in the same integration commit):
  - DESIGN.md rows and tokens (§7);
  - `docs/README.md` (this doc's status);
  - `docs/PROGRESS.md` (the done list, the `--bench` table, and the first-load and worker deltas);
  - `CHANGELOG.md` (an Unreleased entry);
  - `src/changelog.ts`: the `upcoming` rows (`src/changelog.ts:142`), with M1 / M2 / M3 moved to `in progress` or out as they ship.

**Shared-file ownership.** Other tracks edit the same files, so:
- **Registry and shared files are touched only in integration-queue commits.** That covers `manifest.ts`, `widgets/index.ts`, `blurbs.ts`, `meta.ts`, `ids.json`, `catalog.ts`, `goldens/hashes.json`, `docs/PROGRESS.md` and `docs/README.md`. The queue order is **L1 → Q1 → M1**, then **L2 → M2 → Q2**, and M3 queues after Q2. So M1.11 and M2.8 rebase onto the previous queue entry and edit only those files there. Card and engine work happens before that, on the M branch.
- **DESIGN.md:** F0 owns the Light section (F0.9). M only appends rows under Light › Materials, and the Materials token table, after F0 merges.
- **`scripts/webgl.ts`:** F0.4 edits it first, then M2.2.
- **`scripts/verify.ts`:** the insertion order in §2.2.

### 2.4 `scripts/materials-browser.ts` (touch probe, M1.12, extended in M2.9 and M3.11)
This is a CDP probe modelled on L's `scripts/life-browser.ts` (L1.9), which is itself modelled on `scripts/site/mobile.ts:20-60`: headless Chrome, desktop 1280 and touch 375×812 with `isMobile` + `hasTouch`, against `vite preview`. It proves the scroll-first touch policy (`docs/UX-PLAN.md` §10) on the drag/hold cards: `mat-knob`, `mat-lens` (M2), `mat-sand`, `mat-mercury` and `mat-thread` (M3).
- **Per card, touch 375×812:**
  - `materials-browser: <card>: a vertical swipe starting on the card scrolls ≥ 150 px and the card's data is unchanged (world pristine)`;
  - `materials-browser: <card>: a tap acts`, where the action is: knob = the value jumps to the tapped arc angle, lens = moves there, sand = drops a stone, mercury = splits a bead, thread = a flick;
  - `materials-browser: <card>: a 300 ms hold engages (data-engaged, DONE shown) and a drag in any direction then moves it; the page never scrolls during the engaged drag`;
  - `materials-browser: <card>: a horizontal drag is claimed at once without a hold`.
- **Desktop 1280:** `hover moves the light (the card's lit dots change) without changing data`; `press-drag acts`.
- **Every material card, touch:** `a vertical swipe never changes data` (the tap-only cards included).
- It skips with a notice when no Chrome is found (as `mobile.ts` does), and exits non-zero on any ✗.

---

## 3. Phase M1: materials core (about 4–5 days)

**Goal:** the relief / sheen / matcap / weave vocabulary, and five cards that each read as one material at 1×, under the board light, in ≤ 4 ms.

### 3.1 Engine API (M1)

#### `src/engine/matter/relief.ts`
```ts
import type { Field, GridConfig } from '../types'
import type { Raster, SpaceId } from '../raster/raster'
import type { HeightRaster } from '../light/height'
import type { Light, Vec3 } from '../light/shade'

export interface FieldHeightOptions {
  /** Height in cells at field value 1 (default 2). */
  scale?: number
  /** Gaussian pre-blur radius in cells before differentiating (default 0). Kills 1-cell noise that would alias into normals. */
  smooth?: number
  /** Coverage: `field` = value > 0 (default), `all` = the whole grid, or an explicit 0..1 raster. */
  mask?: 'field' | 'all' | Raster
  space?: SpaceId
}
/**
 * Height without an SDF: `field` (0..1) evaluated per cell of `grid` and scaled to cells. Stone veins, weave
 * relief, rust and ripples become relief this way. Cached like `heightRaster` (per field identity → grid,
 * space and options; LRU of 8), so calling it from `layers()` costs a map lookup. Keep the field object stable.
 */
export function heightFromField(field: Field, grid: GridConfig, o?: FieldHeightOptions): HeightRaster

export interface AOOptions {
  /** Reach in cells (default 3). */
  radius?: number
  /** Darkening at full occlusion, 0..1 (default .75). */
  strength?: number
  /** `blur` (default): one separable blur; `horizon`: 8-direction horizon march (sharper creases, about 4× cost). */
  mode?: 'blur' | 'horizon'
}
/**
 * Ambient occlusion of a height raster: 1 on open surfaces, down to 1 − strength in pits, grooves and at the
 * foot of walls. Cached per height raster and options. Bake-time only (2–4 ms at 144²).
 */
export function ambientOcclusion(h: HeightRaster, o?: AOOptions): Raster

/** `f` darkened by an AO raster on the same grid: f · ao, keeping `f.bounds`. */
export function occluded(f: Field, ao: Raster): Field

/** The same light with its elevation clamped into [lo, hi] (raking light for engraving); azimuth kept. Point lights pass through. */
export function rake(light: Light, hi?: number, lo?: number): Light

/** A lattice field (a `T.big` / `T.text` result on lattice k) as a 0/1 mask raster on `grid`: every lit lattice dot fills its k×k cells. */
export function cardMask(lf: { field: Field; lattice?: number; origin?: [number, number] }, grid: GridConfig, at?: number): Raster
```

**Algorithms and parameters:**
- **`heightFromField`:**
  1. `rasterize(field, grid)` (`raster.ts:39`);
  2. an optional `blur(smooth)`;
  3. × `scale`;
  4. the mask, as specified;
  5. `bounds = tightBounds(mask)`.

  The cache key is `${cols}x${rows}|${space}|${scale}|${smooth}|${maskId}`, using the same WeakMap-of-Maps scheme as `height.ts:42-52`.
- **AO `blur` mode:**

  `occ = max(0, blur(h, R)[i] − h[i]) / (0.5·R)` and `ao = 1 − strength · min(1, occ)`.

  The blur is the mass-preserving one (`ops.ts:39`), so the plate edge doesn't fake occlusion. The window is the mask bounds + R.
- **AO `horizon` mode:**
  - 8 directions θₖ = kπ/4, each marched in 4 steps of R/4.
  - `sinHₖ = max_s (h(p + s·dₖ) − h(p)) / √(s² + Δh²)`.
  - `ao = 1 − strength · mean_k max(0, sinHₖ)`.
- **Defaults per use:** engraving R = 2, s = .7; perforations R = 1.5, s = .8; weave R = 1.5, s = .5 (the yarn crevices); terrazzo is not used (the slab is flat).
- **`rake`:** `lightDir(az, clamp(el, lo = 8°, hi = 18°))`, with az from `atan2(L.x, −L.y)`. This is bake-free; it runs per frame.

#### `src/engine/matter/aniso.ts` (Kajiya–Kay)
```ts
import type { CellBounds, Field, GridConfig, Layer } from '../types'
import type { NormalRaster } from '../light/height'
import type { Light, ShadeOptions, Vec3 } from '../light/shade'
import type { ToneBand, Placement } from '../light/material'

/** Unit surface-plane tangents per cell (the direction of the grooves, fibres or threads), struct of arrays. */
export interface TangentRaster { grid: GridConfig; x: Float32Array; y: Float32Array; bounds?: CellBounds }

/** Brushed: every tangent at `angle` (radians, 0 = along +x). */
export function tangentLinear(grid: GridConfig, angle: number, bounds?: CellBounds): TangentRaster
/** Spun: around (cx, cy) in cells; `circumferential` (lathe grooves, default) or `radial` (sunburst). */
export function tangentRadial(grid: GridConfig, cx: number, cy: number, mode?: 'circumferential' | 'radial'): TangentRaster
/**
 * Following a shape: from the gradient of a signed distance (a Field on `grid` or a raster from
 * `distanceRaster`). `along` = the iso-lines (contour stitching, wood rings); `across` = the gradient
 * (satin stitches run across a column). Cells where |∇d| < 1e-3 (medial axis) copy their left neighbour.
 */
export function tangentSDF(sdf: Field | import('../raster/raster').Raster, grid: GridConfig, mode?: 'along' | 'across'): TangentRaster
/** Any per-cell direction (weaves: warp vs weft per cell); normalised on the way in. */
export function tangentField(grid: GridConfig, fn: (c: number, r: number) => readonly [number, number], bounds?: CellBounds): TangentRaster

export interface AnisoOptions extends ShadeOptions {
  /** Kajiya–Kay exponent (default 48: brushed steel; 80 spun knob; 24 satin thread). */
  exponent?: number
  /** View direction (default straight on). */
  view?: Vec3
}
/**
 * Anisotropic highlight, 0..1: (√(1 − (T·H)²))^p · att, where T is the tangent projected into the surface
 * plane (T − (T·n)n, renormalised) and H the half vector of light and view. Zero where n·L ≤ 0. The highlight
 * stretches *across* the tangent: concentric grooves give the spun-metal bowtie, horizontal brushing a
 * vertical streak. One typed-array pass like `shade.ts` `pass` (an integer p/2 via repeated squaring).
 */
export function anisoSpec(n: NormalRaster, t: TangentRaster, light: Light, o?: AnisoOptions): Field

/** A body field plus an aniso highlight as whole size steps over it, in tone bands (gloss rule: +1 step at `rim`, +2 at `core`). */
export function anisoLayers(body: Field, spec: Field, o?: Placement & { steps?: number; rim?: number; core?: number; bands?: readonly ToneBand[]; highlightTone?: 'idle' | 'value' }): Layer[]
```

**Algorithm.** Per cell:
1. `Tp = T − (T·n)n`, normalised;
2. `H = normalize(L + V)`, where a point light gives a per-cell L as in `shade.ts:70-74`;
3. `d = Tp·H`;
4. `s = (1 − d²)^(p/2)` via `powi`;
5. skip if `n·L ≤ 0`;
6. the early-out floor is `1e-3^(2/p)`, as in `shade.ts:62`.

The diffuse term is the ordinary `lambert`. The Kajiya–Kay diffuse (sin T,L) is not used, because it flattens the dome.

**Costs:** about 0.7 ms per pass at 144² and about 0.18 ms at 72². Tangent rasters are constants (baked once).

#### `src/engine/matter/matcap.ts`
```ts
export type MatcapFn = (nx: number, ny: number, nz: number) => number
/** A matcap baked to a size×size LUT over the unit disc of (nx, ny); nz = √(1 − nx² − ny²). Nearest lookup keeps hard stops hard. */
export interface Matcap { size: number; data: Float32Array; fn: MatcapFn }
export function bakeMatcap(fn: MatcapFn, size?: number /* 64 */): Matcap
export interface MatcapOptions extends MaterialOptions {
  /** Rotate the environment about the view axis (radians): e.g. the light azimuth. */
  rotate?: number
  /** Tip the environment by the hub's tilt offset (tx, ty: 0, 0 at rest, each clamped to ±1 → ±25°); bucketed to 1/32. Never gx/gy (gravity is ≈ (0, 1) upright). */
  tilt?: readonly [number, number]
  /** Use the LUT (default true) or call `fn` per cell (exact, checks only). */
  lut?: boolean
  bands?: readonly ToneBand[]
}
/** Environment-mapped tone read off the normal: `{ env, layers }` (bands default to `METAL_BANDS`). */
export function matcap(n: NormalRaster, cap: Matcap | MatcapFn, o?: MatcapOptions): { env: Field; layers: Layer[] }
/** The studio of `metal()` (material.ts:189-208) as a matcap for light direction L: equal to `metal(n, L).env` cell for cell. */
export function studioMatcap(L: Vec3, studio?: Studio, sun?: number): MatcapFn
/** Presets: hard chrome stripes (CHROME), soft satin metal (two wide bands), liquid (mercury: CHROME with a wider sky and a bright floor). */
export const CHROME: MatcapFn, SATIN: MatcapFn, LIQUID: MatcapFn
```
- **Rotation and tilt:** `n' = Rz(rotate)·Rx(25°·ty)·Ry(−25°·tx)·n`, computed once per frame as a 3×3 matrix and applied per cell. At rest (tx, ty) = (0, 0), so the matrix is `Rz(rotate)` alone. Feeding gravity's `gy ≈ 1` here would tip the studio 25° on an upright phone and in every golden.
- **LUT index:** `(round((n'x + 1)/2·(size−1)), round((n'y + 1)/2·(size−1)))`.
- `metal()` itself is **not** rewritten in M1, because that would risk the `light-metal` golden. The equivalence is a check, so a later refactor is safe.

#### `src/engine/matter/weave.ts`
```ts
/** true = the warp (vertical thread) is over the weft at (end c, pick r). */
export type Drawdown = (c: number, r: number) => boolean
/** A loom draft: threading (shaft per warp end), tie-up [shaft][treadle], treadling (treadle per pick). */
export interface Draft { shafts: number; treadles: number; threading: readonly number[]; tieup: readonly (readonly boolean[])[]; treadling: readonly number[] }

export const plain: () => Drawdown                                   // (c + r) & 1 ... === 0
export const twill: (k: number, n: number, dir?: 1 | -1) => Drawdown   // mod(c − dir·r, n) < k  (2/2: k 2 n 4; denim 3/1)
export const satin: (n: number, s: number, face?: 'warp' | 'weft') => Drawdown // point = mod(r − s·c, n) === 0; warp-faced = !point
export const herringbone: (k: number, n: number, m: number) => Drawdown // twill on zig(c): mirrored every m ends (m a multiple of n)
export const basket: (k: number) => Drawdown                        // ((⌊c/k⌋ + ⌊r/k⌋) & 1) === 0
/** A draft's drawdown: tieup[threading[c mod T]][treadling[r mod R]]. */
export function fromDraft(d: Draft): Drawdown
/** The smallest draft (distinct columns → shafts, distinct rows → treadles) reproducing `dd` over a period. */
export function toDraft(dd: Drawdown, ends: number, picks: number): Draft
/** The named drafts shown on the Loom card, as real drafts (straight threading 1-2-3-4 …). */
export const DRAFTS: Readonly<Record<'plain' | 'twill22' | 'satin52' | 'herringbone' | 'basket2', Draft>>

export interface WeaveReliefOptions {
  /** Cells per thread crossing, ≥ 3 (default 4: a 3-cell thread and a 1-cell gap). */
  crossing?: number
  /** Thread height in cells (default 1.2). */
  lift?: number
  /** Woven picks so far (rows below are empty warp), and the box in cells. */
  picks?: number
  box: [number, number, number, number]
}
/** Relief of a woven cloth: `{ height, tangent, warp }` (warp = 1 where a warp thread shows), baked; cached per drawdown + options. */
export function weaveRelief(dd: Drawdown, grid: GridConfig, o: WeaveReliefOptions): { height: HeightRaster; tangent: TangentRaster; warp: Raster }
```
**Relief model.** For a cell at (x, y) in the box, with W = crossing:
- the crossing is `(i, j) = (⌊x/W⌋, ⌊y/W⌋)`, and the in-crossing position is `fx = (x mod W + .5)/W` (fy likewise);
- if the warp is up, the visible thread is vertical:
  - **cross-profile** `lift·√(1 − (2fx' − 1)²)`, where fx' rescales the first W−1 cells, so the last column is the 1-cell gap (height 0, which is void);
  - **along the float:** find the run [j₀, j₁] of consecutive "warp up" picks at end i, then add `.45·lift·sin(π·(y − j₀W)/((j₁ − j₀ + 1)W))`, so long satin floats bulge and dive at their ends;
  - the tangent is (0, 1);
- the weft is symmetric, with tangent (1, 0).

The smallest period is plain weave's 2W = 8 cells, and the gap period is W = 4. Both are ≥ 2 ✓.

#### `src/engine/matter/stitch.ts`
```ts
export interface StitchOptions { length?: number /* 3 cells */; gap?: number /* 2; 0 = back-stitch */; width?: number /* 1.2 */; phase?: number }
/** Stitches laid along a polyline (cells): segment endpoints, the arc length at each start, and a point/heading at any arc length. */
export interface Stitches { segs: Float32Array; s0: Float32Array; count: number; total: number; at(s: number): readonly [x: number, y: number, angle: number] }
export function stitch(polyline: readonly (readonly [number, number])[], o?: StitchOptions, closed?: boolean): Stitches
/** Hard field of the stitches sewn up to arc length `upTo` (default all): 1 within width/2 of a segment, else 0. */
export function stitchField(st: Stitches, grid: GridConfig, upTo?: number): Field
/** One site per stitch end (the needle holes), for a `sites` layer. */
export function stitchHoles(st: Stitches, from?: number, to?: number): [number, number][]
/** Iso-line of a distance raster at `level` (marching squares, linear interpolation), as closed polylines in cells. */
export function contour(sdf: Raster, level: number): [number, number][][]
```
`stitchField` is baked to a raster once per `upTo` bucket of 1 stitch. That is at most `count` distinct rasters, kept as an LRU of 4, because the sewn length grows monotonically.

#### `src/engine/matter/stone.ts`
```ts
export interface MarbleOptions {
  seed?: number
  /** Cells between main veins (default 30), vein direction (default .6 rad), turbulence gain in radians (default 5.5). */
  period?: number; angle?: number; warp?: number
  /** Turbulence base frequency per cell (default 1/26) and octaves (default 5). */
  scale?: number; octaves?: number
  /** Vein sharpness (default 2.5: a 2.5-cell vein at period 30) and the fine secondary veins' weight (default .35). */
  sharp?: number; fine?: number
}
/** Marble body 0..1 (1 = white stone, → 0 in the veins), baked on `grid`, cached per options. */
export function marble(grid: GridConfig, o?: MarbleOptions): Raster
/** Terrazzo aggregate: chip sites (Poisson, min distance `d`) in three size classes, avoiding `keepOut` (a 0/1 raster). */
export function terrazzo(box: [number, number, number, number], o: { d?: number /* 3.4 */; seed?: number; keepOut?: Raster }): { a: [number, number][]; b: [number, number][]; c: [number, number][] }
```
**Marble** (Perlin 1985 turbulence-sine):
- φ = 2π·(x cos α + y sin α)/period + warp · `turb2`(x·scale, y·scale, octaves, seed), with `turb2` = Σ|noise|·2⁻ᵒ from F0;
- the main vein is `(1 − |sin φ|)^sharp`;
- the fine veins repeat the same with period 11, warp 3, sharp 4 and seed + 1;
- body = `1 − max(main, fine · .35)`.

With sharp = 2.5, the vein (darker than half) is the band where |sin φ| < .24, which is about period · .15 / π ≈ 2.3 cells wide at period 30 ✓ (≥ 2). Shrinking `sharp` widens the vein; raising it thins it, and the check fails below 2 cells.

**Terrazzo:**
- `poissonDiscPoints(w, h, d, seed)` (`scatterField.ts:4`), dropping points where `keepOut` is lit;
- the class comes from `hash01(seed, i)`: < .15 → a (site size 1.6), < .5 → b (1.15), else c (.85).

### 3.2 Cards (M1), all `TILE` 144², `tileStyle`, `chrome: 'dots'`, animated

The common chrome:
- the label at top-left;
- a faint `cite` at top-right at the .72 tier, as on the algorithms board (`boards/algorithms.ts:24-27`);
- content rows 12–143.

"Bands" below means `toneBands` with the default `MATTE_BANDS` (`material.ts:36`) unless stated.

#### `mat-loom`: Loom, the hero
- **Thesis:** "Cloth appears one pick at a time; the shuttle is the only thing moving."
- **Composition:**
  - **Cloth:** box [8, 14, 103, 117] at card pitch, `weaveRelief(drawdown, TILE, { crossing: 4, lift: 1.2, picks })`. That is 24 ends × 26 picks.
    - Tone: warp threads take `lambert` bands faint/mid/idle. Weft threads take the same field × .8, so the weft sits one band lower and the two systems read by tone, not hue.
    - `anisoSpec(tangent, p = 32)` lifts the crest +1 step (`value` at `core` .55). Twill diagonals and satin floats show up as sheen, which is the point.
    - AO (R 1.5, s .5) darkens the crossings.
  - **Unwoven warp below the fell line:** vertical threads only (`mid`, no sheen). Rows above the fell are woven.
  - **Mini draft,** as dot sites at 3-cell spacing, size .9. Empty cells are `faint`, set cells `mid`:
    - threading: 4 shafts × 24 ends, rows 120–129, under the cloth;
    - tie-up: 4×4 at [110, 120];
    - treadling: 4 treadles × 26 picks, cols 110–119, rows 14–117, beside the cloth.

    The current pick's treadling row is `idle`.
  - **Shuttle:** one site, size 2.6, `active`, on the fell line, moving left → right and then right → left on alternating picks (linear, mechanical).
  - **Caption:** the draft name (`TWILL 2/2`) at tier 1, row 134, `idle`, with the pick counter `PICK 14/26` right-aligned in `faint`.
- **Motion:**
  - **Cards do not run at display rate.** An animated card renders at `fps ?? (motion ? 12 : 30)` (`DotCanvas.tsx:398`). Commit `0edd045` only changed how `scripts/algorithms.ts` times its frames. The STYLE-BIBLE speed limit is ≤ 2 cells per frame at the card's fps (`STYLE-BIBLE.md:208`).
  - 0.6 s per pick would move the shuttle 96 cells in 0.6 s: 13.3 cells per frame at 12 fps. Even 1.2 s per pick (80 cells/s) is 6.7 cells per frame at 12 fps. Both are **too fast**.
  - **So the Loom declares `fps: 40` through F0.10** (`WidgetPreset.fps`). The pick takes **1.2 s** with the shuttle at 80 cells/s, which is **2.0 cells per frame** at 40 fps ✓. Cost: 40 × ≈ 2.6 ms ≈ 10% of a core while the card is in view.
  - **F0.10's phone tier** may cap the Loom lower. The motion stays a pure function of t (goldens are fps-free), so there the shuttle is drawn with a 2-site trail at its previous two positions. The trail is in the shuttle's own `active` layer at 2 and 4 size steps smaller (size contrast, rule 6; not `activeDim`), so it reads as motion, not a smear.
  - **If F0.10 slips,** the Loom ships at ≤ 24 cells/s (4 s per pick, 2 cells per frame at 12 fps). Its golden is re-cut once when F0.10 lands, as an intended card change.
  - The woven pick is revealed behind the shuttle, cell by cell.
  - A panel is 26 picks (31.2 s), then the next draft in `DRAFTS` order.
- **t = 0** (goldens, reduced motion, thumbnail): the `twill22` panel complete, with the shuttle parked at the right selvedge (`active`). The accent is at rest but present: the loom is on. Goldens at t = 1.3 have panel 2's pick 2 under way, with the shuttle 8 cells in from the left selvedge (pick 1 runs right → left over [0, 1.2) s, and pick 2 left → right).
- **Interaction:**
  - Desktop: hover = torch (the sheen moves over the twill). Click on a tie-up cell toggles it: 16 `toggle` controls `tu0…tu15`, boxes of 3×3 cells padded by the hit pad. The drawdown redraws from that pick onward.
  - Touch: the same toggles by tap. There is no drag.
  - Keyboard: the toggles are focusable.
- **Bake vs frame:** the relief for the 26 picks of a panel is baked once per drawdown. A tie-up edit rebakes (≤ 12 ms, a one-off). Per frame: `lambert` + `anisoSpec` on the cloth bounds (≤ 96×104 ≈ 10k cells → 0.35 + 0.4 ms), plus sites for the draft (≈ 260) and sampling. **Estimated 2.6 ms.**

#### `mat-knob`: spun-aluminium knob
- **Thesis:** "A machined knob: the light slides round its grooves as a bowtie."
- **Composition:**
  - The knob is on a **1.5 lattice** (`LG15 = latticeGrid(TILE, 1.5)`, 96²). Centre (48, 50) lattice = card (72.75, 75.75); radius 25 lattice (37.5 cells).
  - **Height:** `stackHeights(heightRaster(sdfCircle(r 25), { shape: 'round', width: 3, height: 2.4 }), heightRaster(sdfCircle(r 25), { shape: 'smooth', width: 25, height: 1.2 }))`, a chamfered rim on a shallow dome.
  - **Tangent:** `tangentRadial(circumferential)`.
  - **Tone:**
    - body = `lambert(ambient .12)` × .62, which caps the body at `mid` (1 − 2 steps, the gloss rule);
    - plus `anisoSpec(p = 80)`: a rim at .25 gives +1 step (`idle`), a core at .55 gives +2 (`value`).
    - Lathe rings: the body alternates by one step on rings where `⌊ρ/2⌋` is odd (period 2 lattice = 3 cells ✓), *inside the faint/mid bands only*, so the highlight stays clean.
  - **Skirt:** knurl sites on a ring of radius 42 cells at 3-cell arc spacing, size .9, alternating `mid` / `faint`.
  - **Index dimple:** one `faint` site, size 2.2, at radius 29 cells along the value angle (a dark pit reads as a cut).
  - **Value arc:** 40 sites on a ring of radius 56 cells, from 225° clockwise through 270°. The track is `faint`, size 1.2. The filled part is **`active`**: it is the primary live value.
  - **Readout:** `VOL 72` at the 1.3 tier, row 132, centred, `idle`.
- **t = 0:** v = .72 under the 09:41 sun. The bowtie lies along azimuth −35°, two lobes through the centre.
- **Interaction:**
  - Desktop: hover = torch at height 40, falloff 150; the bowtie follows the pointer. Drag on the knob (kind `knob`, key `v`) turns it. While pressed, the torch freezes at its last hover position, so the highlight doesn't jump.
  - Touch: a horizontal drag or a 300 ms hold turns the knob. A tap on the value arc jumps v to that angle (the slider rule, UX-PLAN §10), so the card works with taps only. The light comes from `sceneLight` (tilt, else the sun), and the bowtie follows the tilt.
  - Data glides on `{interaction.springHalfLife.data}`.
- **Bake vs frame:** height, normals and tangents are baked (≈ 4 ms cold on 96²). Per frame: `lambert` + `aniso` on about 2k lattice cells (0.15 ms) and 40 + 88 sites. **Estimated 1.4 ms.**

#### `mat-grille`: speaker-grille VU
- **Thesis:** "A perforated metal grille, lit from behind by the music."
- **Composition:**
  - **Plate** (card pitch, box [4, 14, 139, 129]): flat plate, height 1, with 1.8-cell holes engraved through it. The holes sit on a hex lattice of pitch 6 cells, row step 5.196, odd rows offset by 3, which gives 23 × 22 holes. Height comes from `heightFromField(plate, TILE, { scale: 1.5 })`, using `distanceRaster` of the hole mask once.
  - **Plate tone:**
    - brushed horizontal: `tangentLinear(0)`, `anisoSpec(p = 40)`, a vertical streak that walks with the light azimuth;
    - body `lambert` × .4, so the plate tops out at `mid` with only the streak reaching `idle`;
    - AO (R 1.5, s .8) makes a dark ring round every hole;
    - a 1-cell `moat` (`ops.ts:119`) is cut round each hole so the perforation reads as negative space.
  - **Holes** are sites at the hole centres, size 2.2. **Unlit holes draw nothing** (void).
  - **Lit holes:** 22 columns = 11 bands × 2 columns. Band level `Lᵦ(t)` lights holes bottom-up:
    - lit holes are `idle`;
    - each column's top lit hole is `value`;
    - the column's peak-hold hole (held 0.8 s, then falling 6 holes/s) is `mid`;
    - **the single highest peak-hold hole on the plate is `active`**, the live peak. Ties go to the lower band index.
  - **Signal:** synthetic and deterministic, 120 bpm.
    - kick `exp(−7·φ)` on beats;
    - per-band shape `(1 − b/11)^1.3` for bass;
    - a hat on off-beats for bands 8–10;
    - `hash01(beat, b)` × .25 variation;
    - a critically damped follower with a 60 ms half-life.

    There is no microphone.
- **t = 0:** the frame 0.12 s after a downbeat (pre-computed from the signal at t = 0, so the plate is mid-bar). The accent is present.
- **Interaction:**
  - Desktop: hover = torch over the plate (the streak and AO read). Click = a kick (data key `k`, `button`): all bands jump to .95.
  - Touch: tap = kick. There is no drag.
- **Bake vs frame:** the plate height, normals, AO and hole moat are baked (≈ 14 ms cold, EDT included). Per frame: `lambert` + `aniso` on the plate (0.65 + 0.7 ms at card pitch, bounded box), a 506-hole site layer and the signal. **Estimated 3.2 ms**, the tightest M1 card.
  - Mitigation if it's over: evaluate the plate on a 1.5 lattice outside a 3-cell band round the holes (two layers), or cache the plate shading per 64-azimuth light bucket (F0 buckets the hub light already).

#### `mat-marble`: carved marble plaque
- **Thesis:** "The time, cut into marble, read by raking light."
- **Composition:**
  - **Plaque** on a **1.5 lattice** (96²): `sdfBox(center 48, 48; half 44, 36; radius 4)` with a `linear` chamfer (width 2, height 1.5).
  - **Marble:** `marble(LG15, { period: 20 /* lattice ≈ 30 cells */, sharp: 2.5 })`.
  - **Engraving:** `HH:MM` as hero, tier 2.5 smooth (`T.big(time, 72, 50, { lattice: 2.5, smooth: true, align: 'center' })`), then `cardMask` → down-sampled to the 1.5 lattice (a cell is lit when ≥ 50% of its card cells are) → `distanceRaster` → `heightRaster(…, { shape: 'linear', width: 1.6, height: −1.8 })`, a V-groove.
    - Smooth strokes at 2.5 are 5 card cells ≈ 3.3 lattice dots, which leaves room for one lit wall and one dark wall ✓.
    - A second line, `ANNO MMXXVI` (the year in Roman numerals), is engraved at tier 1.3 → `mid` only (shallower: height −1).
  - **Tone:**
    - body = `lambert(rake(L, 18°), ambient .1)` × (.55 + .45·marble) × AO (R 2, s .7);
    - bands faint/mid/idle;
    - veins drop the body one band (a vein under the light is `mid`, never `idle`);
    - the polish is `phong(shininess 40)` ≥ .35 → +1 step `value`.
    - The groove walls facing the light climb to `idle` / `value`, and the far walls fall to void.
  - **Accent:** the colon, whose two dots are separate `active` sites (size 2) blinking at 1 Hz. **This is the card's live element**, and the engraving stays neutral. Under reduced motion it stays steady on.
- **t = 0:** `09:41` under the 09:41 sun raked to 18°, light from the upper left, colon on.
- **Interaction:**
  - Desktop: hover = a low torch (height 14, falloff 120), so the engraving lights wall by wall as you move.
  - Touch: tilt via `sceneLight` (raked), else the sun. Tap = no-op.
- **Bake vs frame:**
  - marble: baked once (`turb2`, 5 octaves × 9.2k cells ≈ 6 ms cold);
  - engraving height, normals and AO: once per minute (EDT on 96² ≈ 3 ms + AO blur ≈ 1.5 ms + normals ≈ 1 ms = **≈ 6 ms rebake** ≤ 10 ✓), kept in an LRU of 2 keyed by `HH:MM`;
  - per frame: `illuminate` on 9.2k cells (0.3 ms) and sampling. **Estimated 1.8 ms.**

#### `mat-terrazzo`: terrazzo calendar
- **Thesis:** "The month, set in stone: each day a chip, today's chip red."
- **Composition:**
  - **Hero:** the date `01`, tier 2.5 smooth, top-right (cols 92–140, rows 12–40), `value`.
  - **Caption:** `JANUARY 2026` at tier .72, `mid`, top-left at row 14; weekday initials `M T W T F S S` at row 44, `faint`.
  - **Slab** on a **1.5 lattice:** box rows 50–137 (cells). A pillow height (`heightRaster(sdfBox, { shape: 'smooth', width: 10, height: 2 })`), so a broad sheen slides across the slab with the light.
  - **Day chips:** 7 columns at 18.5-cell pitch × 5 rows at 17.5-cell pitch. January 2026 starts on a Thursday, so the 31 days take 5 rows.
    - Each chip is an irregular polygon on the 1.5 lattice: a superellipse with exponent 2.5–4 (by hash), rotated by `hash01·π`, radius 5.6 cells, its edge warped by `noise2` (amplitude .7 cell: an organic, about 1-cell ramp).
    - Centres are jittered ±1.5 cells by hash; the grid keeps Poisson-like spacing.
  - **Tone:**
    - past days `idle`;
    - future days `mid`;
    - **today `active`** (primary);
    - where `phong(pillow, shininess 40)` > .3, past chips lift +1 step (`value`) and future chips stay `mid` (honed vs polished).
  - **Aggregate:** `terrazzo(box, { d: 3.4, keepOut: chips dilated by 1.5 })`, three site layers:
    - a: size 1.6, `mid`;
    - b: size 1.15, `faint`;
    - c: size .85, `faint`.

    The binder between them is void.
- **t = 0:** Jan 1 2026 (the frozen clock). Chip 1 is red, 0 past days, 30 future.
- **Interaction:**
  - Desktop: hover a chip and the hero shows that day's number (`mid` instead of `value`) and the weekday; leave and it returns.
  - Touch: tap a chip to preview it for 3 s. One `button`-intent control covers the slab box; the card maps the tap point to a chip.
- **Bake vs frame:** chips, aggregate and slab normals are baked per month (≈ 8 ms). Today changes once a day, which is a tone swap, not a rebake. Per frame: `phong` on 5.5k lattice cells (0.2 ms) and about 600 sites. **Estimated 1.6 ms.**

### 3.3 Ordered steps (M1)

Each step is ≤ about half a day. Check names are the exact `assert` strings in `scripts/materials.ts`.

| Step | Work | Checks (`materials: …`) |
|---|---|---|
| **M1.1** | `matter/index.ts` and `relief.ts` (`heightFromField`, `ambientOcclusion` blur + horizon, `occluded`, `rake`, `cardMask`); create `scripts/materials.ts` with its runner and wire it into `verify.ts` | `heightFromField: cached (same field → same raster object), scale exact, mask modes` · `ao: 1 on a flat plate, ≤ 1 − .5·strength at the foot of an engraved wall, in [1 − strength, 1] everywhere` · `ao: horizon and blur agree in sign on 3 test reliefs (pit, groove, step)` · `ao: deterministic (two fresh bakes bit for bit)` · `rake: azimuth kept, elevation clamped` · `engine/matter is not in the engine barrel` |
| **M1.2** | `aniso.ts`: the four tangent builders, `anisoSpec`, `anisoLayers` | `aniso: linear tangent ⟂ H gives the peak (1 at normal incidence), ∥ H gives 0` · `aniso: radial tangents on a dome give two lobes 180° ± 6° apart along the light azimuth (bowtie)` · `aniso: in [0, 1], zero where n·L ≤ 0` · `aniso: tangentSDF across = ∇d, along ⟂ ∇d (unit, finite at the medial axis)` · `aniso: one pass ≤ 0.8 ms at 144² (× load)` |
| **M1.3** | `matcap.ts`: `bakeMatcap`, `matcap`, `studioMatcap`, presets, rotate / tilt | `matcap: studioMatcap(L) ≡ metal(n, L).env on BALL_N for 8 lights (lut: false, bit for bit)` · `matcap: the 64² LUT agrees with the exact fn on ≥ 99% of cells` · `matcap: rotate 2π = identity; tilt (0, 0) = identity (no tip at rest); tilt clamped to ±25°, bucketed to 1/32` · `matcap: hard stops stay hard (no value outside the stops set)` |
| **M1.4** | `weave.ts`: drawdowns, `fromDraft` / `toDraft`, `DRAFTS`, `weaveRelief` | `weave: plain = checker; twill k/n: each row is the previous shifted by dir, warp fraction k/n` · `weave: satin n/s (5/2, 8/3): exactly one interlacement per row and column, none 4-adjacent` · `weave: herringbone mirrors every m ends; basket k: k×k blocks` · `weave: fromDraft(toDraft(dd)) ≡ dd over 2 periods, for every DRAFTS entry` · `weave: relief period ≥ 2 cells (every on/off run ≥ 2 along both axes), gap column void, tangent ∈ {(1,0), (0,1)}` · `weave: relief bake ≤ 15 ms for 24 × 26 crossings` |
| **M1.5** | `stitch.ts`: `stitch`, `stitchField`, `stitchHoles`, `contour` | `stitch: segment lengths = length (last one may be short), gaps = gap, total = polyline length` · `stitch: at(s) is continuous and monotone in arc length; closed loops wrap` · `stitch: contour of a disc SDF at level 3 is a closed loop at radius r + 3 ± .5` |
| **M1.6** | `boards/materials.ts` scaffold: `matLight` (the thin `sceneLight` wrapper of rule 8, with the pointer → `sunAt` fallback until F0-C lands), the light keys in every card's `defaults` and `materialsSources = [lightSource]` (§2.3), `cite`, caption helpers, a `once()` lazy bake helper; **Loom** card with `fps: 40` (needs F0.10) | Board checks (§2.2) over `[matLoom]` · `materials board: every card declares lightSrc/lightAz/lightEl/tx/ty in defaults` · `materials: matLight ≡ sceneLight for 3 synthetic contexts (hover, lightSrc 1, sun)` (before F0-C lands: hover → torch, else `sunAt`) · `loom: t = 0 is a complete twill 2/2 panel (26/26 picks), shuttle parked at the right selvedge` · `loom: the woven rows equal weaveRelief(DRAFTS.twill22) (drawdown truth)` · `loom: a tie-up toggle changes only picks ≥ the current one` · `loom: shuttle ≤ 2 cells per frame at the declared fps (STYLE-BIBLE.md:208)` · `loom: the trail is the shuttle's own active layer, smaller sizes, no activeDim` |
| **M1.7** | **Knob** card | `knob: the bowtie's two brightest lobes lie within ±1 light bucket of the light azimuth, for 8 torch positions` · `knob: the value arc's active sites = round(v · 40)` · `knob: a tap on the arc sets v to its angle` · `knob: frame ≤ 4 ms` |
| **M1.8** | **Grille** card | `grille: no plate dot inside a hole or its moat; unlit holes draw nothing` · `grille: exactly one active hole, at the highest peak-hold` · `grille: signal deterministic (two fresh runs equal at 200 t's)` · `grille: frame ≤ 4 ms` |
| **M1.9** | `stone.ts` `marble`; **Marble** card | `marble: deterministic; body in [0, 1]; mean vein width at period 30 ≥ 2 cells (measured by run length across veins)` · `marble: engraved grooves: lit wall ≥ idle and far wall void under a raked light from either side` · `marble: rebake on a minute change ≤ 10 ms; LRU keeps 2` |
| **M1.10** | `stone.ts` `terrazzo`; **Terrazzo** card | `terrazzo: aggregate sites ≥ d apart and never inside a dilated day chip` · `terrazzo: 31 day chips for Jan 2026, laid from Thursday; today = 1 is the only active layer` · `terrazzo: past/future split follows the date (frozen 2026-01-01 → 0 past)` |
| **M1.11** | Wiring (§2.3), as the M1 integration-queue commit (after Q1's): manifest row with `sources`, eager registry row with `sources`, blurbs, meta blurbs + tags for all 5 cards, `ids --assign`, goldens (added only), DESIGN.md Materials rows and tokens (§7, after F0 merges), docs (`docs/README.md`, `PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` `upcoming`), `pnpm snap` review of 5 cards beside level-03 / afterlight / thermal-monitor / ui-toggle, `vite build` + `size.ts --check` + the worker chunk size | `npx tsc -b`, `npx oxlint src/engine/matter src/widgets/boards/materials.ts scripts/materials.ts`, `pnpm golden --check` lists only `added mat-*`, verify (ux: blurbs and groups, share: uids) green, first load **≤ +0.06 kB gz** against the §6 ledger, the `sampleWorker` chunk delta recorded in PROGRESS |
| **M1.12** | `scripts/materials-browser.ts` (§2.4) for `mat-knob`, plus the all-cards vertical-swipe check | `materials-browser: mat-knob: vertical swipe scrolls ≥ 150 px, data unchanged` · `… tap on the arc sets v` · `… 300 ms hold engages, drag moves it, page never scrolls while engaged` · `… horizontal drag claimed at once` · `materials-browser: every card: vertical swipe never changes data`; the probe is green at 375×812 and 1280 |

**Card blurbs (meta.ts):**
- `mat-loom`: 'A loom weaving twill live, with its draft shown as dots.' (`material weave textile animated control`)
- `mat-knob`: 'A spun-aluminium knob whose highlight follows the light.' (`material metal knob control`)
- `mat-grille`: 'A perforated speaker grille lit from behind by the beat.' (`material metal audio animated`)
- `mat-marble`: 'The time engraved in marble, read by raking light.' (`material stone clock animated`)
- `mat-terrazzo`: 'A month of terrazzo chips; today is the red one.' (`material stone calendar`)

**Done when (M1):**
- the five cards pass the board checks;
- each card ≤ 4 ms warm and ≤ 30 ms cold (`--bench` table pasted into PROGRESS);
- goldens: 5 × 2 keys added and 0 changed;
- the taste pass: each card reads as its material at 1× in `pnpm snap`, on the STYLE-BIBLE checklist;
- the size delta (first load and worker chunk) passes;
- `materials-browser` is green for the knob;
- DESIGN.md, README, PROGRESS, CHANGELOG and `src/changelog.ts` are updated.

**Estimate:** 4.75 days serial (M1.12 adds ¼ d). **In parallel:**
- M1.2, M1.3, M1.4 + M1.5 and M1.9's `marble()` need only M1.1 (relief) and F0 noise. They can run as 3 agents.
- The five cards are independent after M1.6's scaffold. Two agents can split them: Loom + Knob + Terrazzo, and Grille + Marble.
- M1.11 and M1.12 are serial and come last. M1.11 waits for its slot in the integration queue (after Q1).
- **M1 is independent of track L.** Nothing in M1 imports `src/engine/life/`. Anything that needs L's modules goes to M2 or later, including the advanced doc's candle clock (§4.4).

---

## 4. Phase M2: glass and water (about 3.75–4.25 days)

**Goal:** refraction that moves the *sampled value* at sub-cell precision while every dot stays on the grid, caustics from a real heightfield, and five cards. Glass v2 is a **new** function; `glass()` (`material.ts:129`) and the `light-glass` golden stay untouched.

### 4.1 Engine API (M2)

#### `src/engine/matter/glass.ts`
```ts
/** A bezel height profile over x ∈ [0, 1] (0 = outer edge, 1 = where the flat top starts), y ∈ [0, 1]. */
export type BezelProfile = (x: number) => number
/** kube.io's profiles: convex circle √(1 − (1 − x)²), convex squircle ⁴√(1 − (1 − x)⁴), concave 1 − convex, lip. */
export const BEZEL: Readonly<{ circle: BezelProfile; squircle: BezelProfile; concave: BezelProfile; lip: BezelProfile }>

export interface SnellLUT {
  /** 127 normalised displacement magnitudes from the edge (i = 0) to the flat (i = 126); signed (+ = toward the inside). */
  mag: Float32Array
  /** Largest |displacement| in cells before normalising (the feDisplacementMap `scale`). */
  max: number
  /** Bezel normal z per sample (for Fresnel). */
  nz: Float32Array
}
/**
 * Refraction displacement along one bezel radius (kube.io, "Liquid Glass in the browser"): 127 vertical rays
 * hit the bezel, refract once by Snell (air n₁ = 1 → glass n₂ = `ior`, default 1.5), and travel down
 * through `height(x) + base` cells of glass to the background plane. Pure and cached per arguments.
 */
export function snellLUT(profile: BezelProfile, o: { bezel: number /* cells */; thickness: number /* cells at y = 1 */; base?: number /* 2 */; ior?: number /* 1.5 */ }): SnellLUT

export interface LiquidGlassOptions {
  /** The lens outline: a rounded box (cells, centre and half size) with corner radius; `bezel` cells wide. */
  cx: number; cy: number; hw: number; hh: number; radius: number; bezel: number
  lut: SnellLUT
  /** Displacement multiplier (default 1); 0 fades the lens out without rebuilding the LUT (kube's animated `scale`). */
  strength?: number
  /** Magnification of the flat top about the lens centre (default 1.06). */
  magnify?: number
  /** Frost: blue-noise jitter of the sample point in cells (default 0; 0.6 = satin, 1.6 = frosted). */
  frost?: number
  /** Specular rim light direction in the screen plane (radians, default −60° like kube.io) and its exponent (default 3). */
  rimAngle?: number; rimPower?: number
}
/**
 * Sub-cell behind-sampling through a lens: returns a Field on the same grid whose value at (u, v) is
 * `behind` read at the refracted point (continuous, so the scene slides under the glass while the dots stay
 * on the lattice). Also returns the Fresnel rim and the specular rim as fields. Per-frame cost: an analytic
 * rounded-box SDF, one LUT lookup and one `behind` read per cell inside the lens; outside it is `behind` as is.
 */
export function liquidGlass(behind: Field, grid: GridConfig, o: LiquidGlassOptions): { through: Field; fresnel: Field; rim: Field; inside: (u: number, v: number) => number }

/** Frost on its own: `f` read at a blue-noise jittered point (STBN slice 0, fixed: goldens stay put), averaged over 2 taps. */
export function frost(f: Field, grid: GridConfig, amount: number): Field
```
**Snell LUT algorithm** (after kube.io; rebuilt from the published method, no code copied). For i = 0…126:
1. x = i/126;
2. the slope is `y'(x) = (y(x + δ) − y(x − δ)) / 2δ` with δ = .001, scaled to cells: `k = thickness/bezel · y'`;
3. the 2-D normal is `n = normalize(−k, 1)`;
4. the incident ray is `I = (0, −1)`;
5. `η = 1/ior`, `cos i = −n·I`, `sin² t = η²(1 − cos² i)`, `T = ηI + (η cos i − √(1 − sin² t))n`;
6. the depth is `d = thickness·y(x) + base`;
7. the displacement is `Δᵢ = d · Tx / −Ty`, positive toward the inside of the shape;
8. `nzᵢ = n.y`.

Then `max = maxᵢ |Δᵢ|` and `mag = Δ / max`. 127 samples is kube.io's own choice (signed 8-bit resolution); we keep it so our numbers can be compared with theirs.

**Per cell** (cells, inside the lens):
- `s` = the rounded-box SDF (`sdf.ts:15-21` formula, inlined), and `inset = −s`;
- if `inset < bezel`:
  - `x = inset/bezel`;
  - `g` = the analytic gradient of the box SDF, pointing outward;
  - `off = −g · mag[round(x·126)] · max · strength`;
- else `off = (p − c)·(1/magnify − 1)` (the flat top magnifies);
- plus frost: `(stbn(c, r) − .5, stbn(c + 32, r + 17) − .5) · frost`;
- `through = behind(cellU(c + off.x), cellU(r + off.y))`.

**Fresnel** is Schlick: `R = R₀ + (1 − R₀)(1 − nz)⁵` with `R₀ = ((1 − 1.5)/2.5)² = .04`, where nz is the bezel normal's z; `fresnel = R · .9`.

**Specular rim:** `rim = max(0, ĝ·l)^rimPower · (1 − x)` on the bezel, with `l = (cos rimAngle, sin rimAngle)`, and also the mirror lobe at `−l` × .5 (kube's two-sided rim).

#### `src/engine/matter/caustics.ts`
```ts
export interface CausticOptions {
  /** Water depth over the floor in cells (default 6) and refractive index (default 1.33). */
  depth?: number; ior?: number
  /** Extra gain on the refracted offset (default 3: sim heights are small). */
  gain?: number
  /** Photons per cell per axis (default 2 → 4 per cell, blue-noise offsets). */
  photons?: number
}
/**
 * Forward-splat caustics: every photon at water cell p lands on the floor at q = p − K·∇h(p) with
 * K = gain · depth · (1 − 1/ior), and deposits 1/photons² into the floor raster with a bilinear (tent) splat,
 * then a [1 2 1]² / 16 binomial pass. Mean 1 on flat water; > 1 where the surface focuses light (the net).
 * `grad` is the heightfield gradient on the raster's grid (e.g. track L's `rippleGrad`). Writes into `into`.
 */
export function causticSplat(grad: (x: number, y: number, out: Float32Array) => void, into: Raster, o?: CausticOptions): Raster
/** The floor seen through the water: `floor` read at p − K'·∇h with K' = depth·(1 − 1/ior) (no extra gain). */
export function refractFloor(floor: Field, grad: (x: number, y: number, out: Float32Array) => void, grid: GridConfig, o?: Pick<CausticOptions, 'depth' | 'ior'>): Field
```
- **Kernel:** the tent followed by the binomial is a quadratic B-spline footprint with radius 1.5 cells. It is smooth enough that single focused photons never show as lone dots (aliasing), and narrow enough that the net stays crisp at lattice 2.
- **Energy:** photons leaving the raster are dropped, and the check measures the loss.

This is Evan Wallace's area-ratio caustic done as photon splatting on the CPU (his WebGL version rasterises refracted triangles and takes `oldArea / newArea`). At 72² with 4 photons per cell the two agree to within the blur.

### 4.2 Cards (M2)

#### `mat-lens`: Liquid Glass lens
- **Thesis:** "A drop of glass slides over a dense clock and bends it."
- **Behind (one scalar scene, tone by value):**
  - the hero `09:41` at tier 2.5 smooth, value 1;
  - 60 dial ticks round a ring of radius 58 (5-minute ticks .75, others .5);
  - a dense floor of `faint` dots at every second cell (value .25: the "screen" that shows the warp everywhere);
  - **the current second's tick = `active`** (live).

  It is pre-rasterized once per minute to a 288² (2×) raster and read bilinearly. The seconds tick is analytic, not baked.
- **Lens:** rounded box, hw 30, hh 20, radius 20 (a pill), bezel 12, `BEZEL.squircle`, thickness 6, base 2, ior 1.5, magnify 1.06, frost 0.
- **Layers:**
  1. `through` as one `toneOf` layer: value bands ≥ .875 → `value` inside the lens and `idle` outside; .45–.875 → `mid`; < .45 → `faint`. The red tick is a separate `active` layer, refracted by the same offset.
  2. Fresnel on the bezel, adding +1 step.
  3. The rim ≥ .5 → `value`.
  4. A faint contact shadow: the lens mask, blurred (r 3, baked per lens size), offset (0, +3) and cut out of the behind's `faint` floor.
- **WebGL:** the `through` layer is `gpuValues(through, { density: 2 })`: 288² ≈ 83k fine dots at 1.125 px. This is the board's one GPU card. **Fallback:** the same field at lattice 1 (20.7k dots) on Canvas. This is also what goldens, SVG export and `describe()` see (`passes.ts:7-9`). The chrome stays outside the GPU window (bounds rows 12–143), as DESIGN.md:298 requires.
- **t = 0:** the lens parked over `:41`, at (100, 70).
- **Interaction:**
  - Desktop: drag the lens (kind `xy`, keys `lx` / `ly`, box = the lens bbox padded 4). Hover moves the rim light angle toward the pointer.
  - Touch: `xy` is a drag control. A horizontal drag moves it at once; a 300 ms hold engages it for any direction (the hint reads `HOLD · DRAG`). A tap anywhere moves the lens there over 0.3 s (decelerating). Tilt nudges the rim angle by the hub's tilt offset: `rimAngle = −60° + 25°·tx`, with `ty` lifting `rimPower` toward 2. At rest (tx, ty) = (0, 0), so an upright phone and the goldens see kube's −60°. Never `gx` / `gy`.
- **Budget:**
  - CPU path: 20.7k reads; about 2.5k inside the lens take the SDF + LUT. **Estimated 1.9 ms.**
  - GPU path: CPU sampling of 83k values. Outside the lens it's a plain bilinear read (≈ 12 ns), and inside (10k) ≈ 40 ns, so **≈ 1.4 ms** + upload.
  - The once-a-minute behind rebake is 83k scene evaluations, ≈ 6 ms ≤ 10 ✓.

#### `mat-pool`: caustic pool
- **Thesis:** "Sunlight through a rippling pool draws a net on the tiles."
- **Depends on** track L's `src/engine/life/ripple.ts` (`createRipple({ w, h, damp, mask })`, `rippleStep`, `rippleSplat(x, y, amp, rad)`, `rippleGrad`), which **L1.2** creates. Its API is frozen at L1.2. M2.4 is scheduled after L1.2 merges (L1.1 is only L's scaffold).
- **Sim:** a ripple grid at **tile resolution, 4× lattice** (36 × 31, as L's pond does), damp .984 per step. The caustic splat still renders on the 2× lattice, reading the height and gradient bilinearly (`rippleGrad`) (L's ripple value at dt 1/30, `L-pond.md` ripple section), the mask = the pool basin. It is wrapped in a `World` (`world.ts:52`), so the pristine run is seeded and checkpointed:
  - **dt 1/30** (L's fixed dt, `L-pond.md` "Fixed dt per scene"; the ripple is tuned for it, not 60 Hz);
  - autopilot drips every 1.7–3.1 s at `hash32(seed, k)` positions, amp .6, rad 1.5. The schedule is in steps, so it is fps-free;
  - lead 4 s = 120 steps;
  - **period 30 s** = 900 steps, with a 2 s seam (60 steps);
  - **`maxSteps: 1080`** set explicitly: lead + period = 1,020 steps, plus 60 (L's rule under its "Memory and loop table (L2)"). The old 60 Hz plan (4 s + 60 s = 3,840 steps) overran the World default of 2,400 (`world.ts:120`), so a cold far jump would have lagged (`sim.ts:10-11`);
  - **`every: 150`, `maxCheckpoints: 6`;**
  - idle 3 s → heal.
- **Memory** is gated on the **total** (checkpoints plus working copies), the same rule as L (`L-pond.md` "Memory and loop table (L2)").
  - **State:** 2 × 36 × 31 floats = 8.9 KB (h and h_prev).
  - **Checkpoints:** steps 0 and the loop start are pinned (`sim.ts:97-104`); multiples of 150 up to 900 add 6 more, so 8 × 8.9 = 71 KB with nothing evicted (`maxCheckpoints: 8`).
  - **Working copies:** the sim's head, scratch and 3 views (`sim.ts:61-63`) plus the World's live state: 6 × 8.9 = 54 KB.
  - **Total ≈ 125 KB ≤ 256 KB.**
  - The worst scrub replay is 150 steps at about a quarter of the old grid cost, so it is negligible. The earlier 72 × 62 grid came to about 428 KB in total and was rejected.
- **Floor:** tiles of 6 lattice dots + 1-dot grout (period 7 lattice = 14 cells ✓). Tile value .55 (`mid`), grout .2 (`faint`), a 2-dot pool coping as `idle`.
- **Composite:**
  - `floor' = refractFloor(floor)` × (.45 + .55·caustic);
  - bands: caustic ≥ 1.6 → `value` (the net); tile body `mid`; caustic < .7 → `faint`; grout stays `faint`.
  - The surface glints: `phong(normalRaster(heightFromField(h)))` ≥ .6 → `value` sites. This is a per-frame normal raster on 4.5k lattice cells (≈ 0.25 ms; it is not cached by design).
- **Accent:** **the pebble.** A tap or click drops one `active` site (size 2.4). Over 1.2 s it sinks, its drawn position refracted by `∇h`, then lands and turns `mid` (a grey pebble). At most 5 pebbles stay. There is none in the pristine run, so t = 0 has no red (`accentAtRest: false`).
- **Interaction:**
  - Desktop: hover leaves a soft wake (`rippleSplat` amp .08 per step under a moving pointer); click = pebble.
  - Touch: tap = pebble. There is no drag.
- **Light:** `sceneLight`'s L (tilt, else the sun) tilts the caustic offset by `(L.x, L.y)/L.z · 2` cells (a low sun stretches the net).
- **Budget:**
  - ripple step ≈ 0.19 ms for 4,464 cells (scaled from L1.2's gate of ≤ .05 ms at 36×33). At dt 1/30 that is 1 step per frame at 30 fps, and 2–3 steps (≈ 0.5 ms) at the default 12 fps (`DotCanvas.tsx:398`);
  - caustic splat: 18k photons + blur ≈ 0.25 ms;
  - glint normals: 0.25 ms;
  - sampling: 4.5k lattice cells + sites.

  **Estimated 1.6 ms at 30 fps, 1.9 ms at 12 fps.**

#### `mat-window`: stained-glass window
- **Thesis:** "A rose window; the pane of this hour burns red."
- **Geometry** (baked, card pitch for the lead, 1.5 lattice for the panes):
  - a lancet SDF: a rectangle, cols 24–120, rows 60–136, ∪ a pointed arch (two circles of radius 72 centred at x = 24 + 72 and x = 120 − 72, on the springline at row 60), shrunk by a 4-cell stone frame;
  - **the rose:** 12 petal sites on a ring of radius 26 around (72, 52), plus 6 inner sites at radius 12 and a centre. They are tessellated by `voronoiSites` (a brute-force Voronoi over custom sites: 144² × 19 ≈ 0.4M distance evaluations, ≈ 3 ms bake), added to `stone.ts`;
  - **the lancet below:** F0 `voronoi2(x/13, y/13, seed, 'l2')` → {f1, f2, id}.
  - **Lead came:** where f2 − f1 < .15 (≈ 2 cells), plus the rose edges. The relief is `heightRaster(distanceRaster(came), { shape: 'round', width: 1, height: 1.2 })`.
- **Panes:**
  - the transmittance class comes from `hash01(id)` → .35 / .6 / .85 (`faint` / `mid` / `idle`);
  - per-frame sun gain from `sceneLight`'s L: `g = .35 + .65·√max(0, L.z)` by day, .25 at night (the moon);
  - a lateral bias `.15·L.x·(x − 72)/48`: the side toward the sun is brighter;
  - the antique-glass seed: `stbn` on 2×2 blocks at 6% coverage, one step down.

  The pane value is `class · g` → bands.
- **Lead:**
  - mostly void, with a 1-cell `moat` keeping panes apart;
  - the came top is `phong(torch or sun, shininess 30)` ≥ .4 → `mid` glints, never brighter, so the lead stays dark structure;
  - the stone frame is `matte` in faint/mid.
- **Accent:** **the petal pane of the current hour** (`hour % 12`, where 0 → 12 at the top) is `active` at its own transmittance size. At night it stays `active` at a size 2 steps smaller. This is size contrast (rule 6): `activeDim` is not used, because it is not counted as part of the one accent until the owner rules (§10.6). 09:41 → petal 9, at 9 o'clock.
- **Interaction:**
  - Desktop: hover = torch (it glints the lead, and the panes brighten within 20 cells of the pointer like a lamp held outside).
  - Touch: tap a pane = a 0.8 s pulse of that pane (one step up). There is no drag.
- **Budget:** pane shading is per-pane, not per-cell: 40 panes × 1 gain, then a lookup per cell (9.2k lattice) ≈ 0.2 ms. Came `phong` on about 3k cells ≈ 0.1 ms. **Estimated 1.5 ms.**

#### `mat-patch`: embroidered patch
- **Thesis:** "A satin-stitched patch; the needle is still sewing its border."
- **Ground:** a round patch of radius 58 at (72, 76), card pitch. `weaveRelief(twill(2, 3), { crossing: 3, lift: .8 })` in `faint` only (the gap cells are void), so the ground is quiet.
- **Motif:** a bolt, from `iconSDF` if one exists, else a 7-vertex polygon SDF, about 60 × 70 cells.
  - Satin fill: `tangentSDF(motif, 'across')`, so stitches run across each column and the medial-axis flip gives the satin's centre ridge ✓.
  - Micro-height: stitch grooves every 3 cells along the column axis (`fract((p·T⊥)/3) < .34` → −.3 height), giving a period of 3 ✓.
  - Body `lambert` bands mid/idle; `anisoSpec(p = 24)` rim .3 → +1 step, core .6 → `value`. Each stitch direction catches the light differently, which is the embroidery read.
- **Merrowed edge:** `tangentRadial('radial')` on the ring r 55–58, the same sheen, and AO (R 1.5) at the inner seam.
- **Running stitch:** `stitch(contour(patchSDF, −7), { length: 3, gap: 2 }, closed)`.
  - Sewn stitches are `idle`.
  - Unsewn ones are shown only as needle holes (`stitchHoles`, size .7, `faint`).
  - **The needle is one `active` site** (size 2) at `at(sewn)` with a 3-site thread tail in `mid` behind it.
  - It sews 1 lap per 24 s (≈ 1.4 cells/s: slow and mechanical), then the border is unpicked over 0.6 s and sewn again.
- **t = 0:** the border fully sewn and the needle at the start of the lap (the accent is present).
- **Interaction:**
  - Desktop: hover = torch (sheen); click = the needle sews 4× faster for 1 s (a `button`).
  - Touch: the same by tap.
- **Budget:** two shading passes (lambert + aniso) on about 10.5k cells ≈ 1.4 ms, + stitch raster (cached per stitch) + sampling. **Estimated 3.0 ms.** Mitigation: the motif on a 1.25 lattice (it is the hero; 1.25 is within the ladder's body tier).

#### `mat-rust`: rusting "days since" plate
- **Thesis:** "A steel sign counting days, slowly rusting over."
- **Plate:** card pitch, box [6, 18, 137, 127], radius 3, `tangentLinear(0)`, `anisoSpec(p = 48)` brushed. Four rivets as `heightRaster` domes (sites would be flat).
- **Etching:**
  - `DAYS SINCE` at tier 1.3;
  - the count at tier 2.5 smooth;
  - `RESET` at tier 1, a framed button outline at the bottom.

  All are engraved (height −1.2, linear width 1). AO is R 2, s .7.
- **Count:** the days since `EPOCH = 2025-10-27` (the plan's own day, one year before today). At the golden clock that is **66 days**; today it is 365.
- **Rust:**
  - `r(x, y) = fbm2(x/22, y/22, 5, seed) + .3·(1 − ao) + .2·(1 − clamp(edgeDist/10))`: crevices and edges rust first;
  - the coverage is `c(days) = 1 − exp(−days/180)` (66 → .31; 365 → .87);
  - the threshold θ(c) is exact from a 256-bin histogram of r, baked once;
  - rusted where `r > θ`.
  - Tone: rust kills the sheen. Light rust is `mid`; deep rust (r − θ > .15) is `faint`, with 2×2-block `stbn` pitting to `mid`.
- **Accent:** **the rust front:**
  - cells with `0 < r − θ(c(t)) < .012`, where the creep inside the day is `days + fract(dayOfYear)`, sped up 120× while hovered;
  - at most about 200 thin `active` dots: one element, live;
  - the digits are neutral.
- **Interaction:**
  - Click or tap `RESET` (a `button`): a live fork in which the plate sands clean over 1.2 s (the count goes to 0), then time-lapses back (one day per 0.1 s) to the real count, and heals after 8 s idle.
  - Desktop hover = torch, and the time-lapse runs 120× while hovered.
- **Budget:** bake ≈ 12 ms (fbm 5 octaves × 15k + EDT + AO). Per frame: aniso on the unrusted cells (masked; ≤ 0.7 ms) + a threshold compare (0.1 ms) + sampling. **Estimated 2.6 ms.**

### 4.3 Ordered steps (M2)

| Step | Work | Checks (`materials: …`) |
|---|---|---|
| **M2.1** | `glass.ts`: `BEZEL`, `snellLUT`, `liquidGlass`, `frost` | `glass: LUT has 127 samples, max |mag| = 1, max > 0 for ior 1.5` · `glass: ior 1 → zero displacement; flat top (inset ≥ bezel) → identity at magnify 1` · `glass: convex squircle displaces toward the inside on the whole bezel; concave toward the outside` · `glass: through at strength 0 ≡ behind (bit for bit)` · `glass: Fresnel R(nz = 1) = .04, increasing toward the rim` · `glass: frost bounded by amount/2 per axis, deterministic (STBN slice 0)` |
| **M2.2** | **Lens** card; GPU tag; a fallback entry in `scripts/webgl.ts` (a pixel-parity preset), added after F0.4's edit to that file has merged; the lens tilt from (`tx`, `ty`) | Board checks · `lens: the lattice-1 field is what goldens hash (no gpu tag consulted)` · `lens: layerPass(through) is a pass at density 2 with toneOf (passes.ts:70-93)` · `lens: the second tick is the only active dot, refracted by the same offset as the scene` · `lens: frame ≤ 4 ms CPU path; GPU value fill ≤ 2 ms` · `npx tsx scripts/webgl.ts` parity: mean Δ ≤ 2/255 for `mat-lens` at density 1 · `lens: tx = ty = 0 → rimAngle −60° exactly` |
| **M2.3** | `caustics.ts`: `causticSplat`, `refractFloor` | `caustics: flat water → every interior floor cell = 1 ± 1e-6` · `caustics: energy kept (Σ = photons in, minus the measured off-raster loss)` · `caustics: a converging bump focuses (peak ≥ 2 at depth·gain ≈ its focal length)` · `caustics: deterministic; ≤ 0.35 ms for 72² × 4 photons` |
| **M2.4** | **Pool** card (after L1.2's `ripple.ts`; dt 1/30, lead 4 s, period 30 s, seam 2 s, `maxSteps: 1080`, `every: 150`, `maxCheckpoints: 8`, ripple 36 × 31) | Board checks · `pool: t = 0 is the pristine run after its 4 s lead (no pebble, no red)` · `pool: a tap forks live, the pebble is the only active dot, heals to pristine after idle` · `pool: lead + period ≤ maxSteps (1,020 ≤ 1,080); a cold jump to t = 3600 has lag 0` · `pool: total memory (checkpoints + 6 working copies) ≤ 256 KB after 2 loops + 20 random scrubs (≈125 KB expected), 0 evictions once warm` · `pool: uses only createRipple / rippleStep / rippleSplat / rippleGrad (the L1.2 API)` |
| **M2.5** | `stone.ts` `voronoiSites`; **Window** card (F0 `voronoi2`) | `window: every pane cell is ≥ 1 cell from a came cell (moat); came never brighter than mid` · `window: hour h lights petal h % 12 only (24 frozen-clock hours)` · `window: day vs night gain monotone in sun elevation` |
| **M2.6** | **Patch** card | `patch: satin tangents ⟂ the motif's iso-lines (|T·∇d⊥| ≤ .05)` · `patch: stitches sewn = floor(lap phase · count); needle at at(sewn)` · `patch: frame ≤ 4 ms` |
| **M2.7** | **Rust** card | `rust: coverage(days) within ±1% of 1 − e^(−days/180) (histogram threshold)` · `rust: crevices rust before open plate (mean ao of rusted < unrusted)` · `rust: front ≤ 250 dots, the only active layer; RESET forks live and heals` |
| **M2.8** | Wiring as the M2 integration-queue commit (after L2's): meta blurbs + tags for all 5 cards, `ids --assign`, goldens (added only), DESIGN.md Materials rows (glass v2, caustics), docs (`docs/README.md`, `PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` `upcoming`), snap review, `vite build` + `size.ts --check` + the worker chunk | As M1.11, with first load **+0 kB** (no new manifest row) and the `sampleWorker` delta recorded (the M2 cards add `glass.ts` and `caustics.ts` to the worker chunk); plus `scripts/webgl.ts` green; the board renderer choice is documented (only `mat-lens` is GPU-tagged) |
| **M2.9** | Extend `scripts/materials-browser.ts` (§2.4) to `mat-lens` | `materials-browser: mat-lens: vertical swipe scrolls ≥ 150 px, data unchanged` · `… tap moves the lens there` · `… 300 ms hold engages, drag moves it in any direction, page never scrolls while engaged` · `… horizontal drag claimed at once` |

**Card blurbs:**
- `mat-lens`: 'A lens of liquid glass you drag over a clock to bend it.' (`material glass clock control`)
- `mat-pool`: 'A rippling pool casting a caustic net on its tiles; tap to drop a pebble.' (`material water physics animated`)
- `mat-window`: 'A stained-glass rose window lit by the sun; this hour's pane is red.' (`material glass clock animated`)
- `mat-patch`: 'An embroidered patch whose border is still being sewn.' (`material textile thread animated`)
- `mat-rust`: 'A steel "days since" sign that rusts as the days go by.' (`material metal counter animated`)

**Done when (M2):** M1's criteria for the five cards, plus:
- the lens on WebGL at density 2 with Canvas fallback parity;
- the pool depends only on `ripple.ts`'s published API (L1.2);
- `materials-browser` is green for the lens;
- the `light-glass` golden is unchanged.

**Estimate:** 3.75–4.25 days (M2.9 adds ¼ d). **In parallel:**
- M2.1 and M2.3 are independent.
- M2.5–M2.7 need only M1 + F0 and can start while M2.1–M2.2 run.
- M2.4 waits on L1.2 (`ripple.ts`).
- M2.9 (¼ d) comes after M2.8.

### 4.4 The candle clock (only if it lands on this board)
The advanced doc's #14 candle clock (`docs/living-matter/X-advanced.md`, "Subsurface wax") needs L's `src/engine/life/chain.ts`.
- If it lands on `/materials/`, it is an **M2** card, scheduled after **L1.4** merges, and **never M1**: M1 stays independent of track L (§3.3).
- It then follows M2's rules: one `active` element (the flame), a `meta.ts` blurb + tags, `ids --assign`, and one added golden in M2.8.
- If L1.4 slips, the card waits. It is not pulled forward onto a local chain.

---

## 5. Phase M3: extras and tilt polish (about 4.25–5.25 days, board `workshop`)

**Goal:** nine more materials on their own lazy board, `/workshop/`, titled `WORKSHOP — KNIT, DENIM, PAPER, WOOD, LEATHER, SAND, ICE, MERCURY, THREAD`, 3 columns, `play` group. Then one polish pass on tilt lighting across both boards.

All of them reuse M1 and M2 modules. New engine code is kept to small generators in `matter/`:
- `knit.ts`;
- `wood.ts`;
- `leather.ts`;
- `sand.ts` (a sim step);
- `mercury.ts` and `thread.ts`: thin step wrappers over the existing `fluid` / `pbd` (or L's `chain.ts`) that hold each card's per-step code, so it sits in a file F0.9's lint scans (rule 7);

and the existing `dla` / `fluid` / `pbd`. `sand.ts`, `mercury.ts` and `thread.ts` are registered with F0.9's determinism lint in M3.1, so their step code uses `dmath` (`dsin`, `dcos`, `datan2`, `dexp`, `dpow`), not `Math`.

| Card | Engine | Composition, accent, interaction | t = 0 | Budget (est.) |
|---|---|---|---|---|
| `mat-knit` | `knit.ts`: `knitRelief(rows, { stitch: 4×4, lean: .35 })`, two leaning loops per stitch (a V), as a height plus `tangentField` along each loop arm | A stockinette swatch with a cable panel. The cable crosses every 8 rows (stitches shifted ±1 by a rope pattern). Sheen comes from `anisoSpec(p 20)`. **Accent:** the working loop on the right needle, which knits across one stitch per 0.4 s. Tap = knit one row | Finished swatch, loop at the row end | 2.4 ms |
| `mat-denim` | `weave.twill(3, 1)` relief, crossing 3 | Warp `idle`, weft `faint` (denim's white weft). Whiskers and fade: an `fbm2` mask lowers the warp one band along 5 curved whisker strokes (baked). A pocket stitch line uses `stitch()` (double row, `value`). **Selvedge (default):** the 2-cell selvedge line is white `value`, not red. A static red line would mark a material, not a live element, which breaks this track's own one-accent rule (rule 6). **Accent:** none (`accentAtRest: false`). The red "redline" is only an owner-approved option (§10.2), and nothing ships it by default | Static | 1.8 ms |
| `mat-paper` | `heightFromField(fbm2 fibres, scale .4)` + debossed text (`heightRaster` −1.5, `smooth`) | Cotton paper with a deckle edge (noise-warped SDF). Letterpress: `DOT/480` set at tier 2.5 smooth, debossed, with ink in `value` on the floor of the impression, plus a raking light; the paper is `faint` / `mid`. **Accent:** none, because nothing on it is live (`accentAtRest: false` always). Tap = one more impression, re-inking the deboss over 0.4 s | Static under the sun | 1.5 ms |
| `mat-wood` | `wood.ts`: `woodRings(grid, { pith: line, k: 1/5.5, warp: fbm2·1.4, knots })`, rings = `fract(k·dist + warp)`, with ray flecks from `voronoi2` stretched 6:1 | A lacquered board. Rings are tone bands with a period ≥ 3 cells. The lacquer sheen is `anisoSpec` with `tangentSDF('along')` of the ring distance (chatoyance moves with the light). **Accent:** a live level bubble? Not a material, so instead a carved clock `HH:MM` whose colon is live red (as on marble) | 09:41 | 2.2 ms |
| `mat-leather` | `leather.ts`: pebble grain `h = smoothstep(0, .25, f2 − f1)` from `voronoi2(x/3.2)` (creases = cell borders) | A wallet corner: grain height + AO (R 1.2), saddle stitching via `stitch(contour, { length 3, gap 1 })` at an angle (stitch tangent, slanted 30°) with `idle` thread and AO pits. **Accent:** none by default (a purely material card). The candidate live action is a tap that sews the next saddle stitch, with the awl as the red site for 0.6 s (owner call, §10.3) | Static | 1.9 ms |
| `mat-sand` | `sand.ts`: a mutable height raster on the 2× lattice in a `World`. A carve = subtract a gaussian (r 2) and push the volume to its sides; relax by angle of repose (talus Δh > .8 → move 1/4 of the excess to the lowest neighbour, 2 passes per step); `normalRaster` per frame | A Zen-garden tray. The rake comb (5 tines, 3-lattice spacing) draws grooves along the pointer path. Light: `rake(L, 22°)` so grooves read. **Accent:** the rake head (5 sites) while carving; none at rest. Desktop: press-drag carves (a `surface` control). Touch: hold to engage, then drag (scroll-first); a tap drops a stone (a ring groove). It heals after 12 s idle | A pristine raked pattern (concentric rings round 2 stones) | 2.8 ms (relax 0.5 + normals 0.8 + shade 0.3) |
| `mat-ice` | `dla({ w: 96, h: 96, n: 2600 })` (`dla.ts:59`) as frost-fern sites + a hoar matte (`fbm2` speckle on 2-cell blocks) | A frosted window. Fern branches are sites in `idle`, with newest grains `value`. Anisotropic sparkle from the branch direction (the parent → child vector as the tangent per site). **Accent:** the grains sticking right now (as `algo-aggregate`). Desktop hover = breath: grains near the pointer melt (hidden) and re-freeze when it leaves. Touch: tap = breath for 2 s | The finished fern (the algorithms convention) | 1.6 ms |
| `mat-mercury` | `fluid.ts` density (`fluidDensityAt`) → `heightFromField(smooth 1.5, scale 4)` → normals per frame (on the 2× lattice) → `matcap(LIQUID, { tilt })` | A pool of mercury in a dish. Gravity (hub `gx` / `gy`, ≈ (0, 1) upright, physics only) pours it via the fluid's step (`fluidStep(…, gx, gy)`, `fluid.ts:171`). The matcap tips with the tilt **offset** (`tx`, `ty`), which is 0, 0 at rest, so an upright phone and the goldens show the untipped studio. **Accent:** none at rest; a red bead appears where a tap splits a droplet off (it rejoins in 1.5 s). Desktop: drag stirs (`fluidSplat`). Touch: hold, then drag | The pristine settled pool | 3.4 ms (fluid on a 48² grid ≈ 1.2 ms, normals + matcap 1 ms) |
| `mat-thread` | A rope as `createCloth({ cols: 1, rows: 40, spacing: 2.2, pin: (c, r) => r === 0 })` (`pbd.ts:14-45`), *or* L's `chain.ts` `ropeStep` if merged first (whichever lands; same card API) | A spool at the top, a 40-node thread hanging down, drawn as `stitchField`-style capsules along the rope with `anisoSpec` along the rope tangent (twist: tangent rotated ±20° per 2 cells). **Accent:** the thread's free end (the needle eye) while pulled. Desktop: drag pulls (a `surface` control); release unwinds back. Touch: hold, then drag; a tap = a flick | Hanging at rest | 1.9 ms |

**Tilt-lighting polish (M3.10):**
- One resolver, F0's `sceneLight`, on both boards, through the thin `matLight` wrapper (rule 8). No card decodes the hub keys itself.
- Matcap cards (`mat-mercury`, and `mat-knob` optionally) take `tilt: [data.tx, data.ty]` directly.
- **KK cards do not rotate by gravity.** Their light already arrives tilted, as `lightAz` / `lightEl` through `sceneLight`. The old `datan2(gx, −gy)` was wrong: upright gravity (0, 1) gives π, which turns the light 180° at rest. Where a card needs a tilt angle of its own, it uses the offset `datan2(tx, −ty)` (dmath), and only when `tx² + ty² > 1e-4`, else no rotation.
- The hub light is bucketed to 64 azimuths × 8 elevations (F0, `az + 64·el`), so per-card light-keyed caches (the grille plate, the window panes) hit across frames: an LRU of 8 per card.
- iOS: no card asks for permission. Material cards show the hub's one-time `TILT` affordance only through F0's TOOLS-sheet / first-tap decision (LIVING-MATTER-PLAN §7 item 4).
- **Checks:**
  - `materials: tilt bucket changes only on a ≥ 1/64-turn change`;
  - `materials: no card reads DeviceOrientation directly` (a source grep over `src/widgets/boards/{materials,workshop}.ts`);
  - `materials: no card reads data.light, and no light or matcap path reads gx/gy` (a source grep; only the sand, mercury and thread step inputs may read gx/gy);
  - `materials: tx = ty = 0 → every matcap and KK card equals its no-tilt frame (bit for bit)`;
  - `materials: each card's light, in order: pointer → lightSrc 1 → sun (3 synthetic contexts), equal to sceneLight`.

**Steps:**
- **M3.1** the `workshop` board scaffold: `workshopSources = [lightSource]`, the light keys in every card's `defaults` (plus `gx: 0, gy: 1` on sand, mercury and thread, §2.3), and the registration of `matter/sand.ts`, `matter/mercury.ts` and `matter/thread.ts` with F0.9's lint;
- **M3.2** knit;
- **M3.3** denim (white selvedge by default);
- **M3.4** paper;
- **M3.5** wood;
- **M3.6** leather;
- **M3.7** sand;
- **M3.8** ice + mercury;
- **M3.9** thread;
- **M3.10** tilt polish;
- **M3.11** wiring as the M3 integration-queue commit (after Q2's): manifest row with `sources: m.workshopSources`, eager registry row with `sources`, blurbs, meta blurbs + tags for all 9 cards, `ids --assign`, goldens (added only), DESIGN.md Materials rows, docs (`docs/README.md`, `PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` `upcoming`), snap, `vite build` + `size.ts --check` (first load ≤ +0.06 kB gz for the one new row) + the worker chunk delta;
- **M3.12** extend `scripts/materials-browser.ts` (§2.4) to `mat-sand`, `mat-mercury` and `mat-thread`: a vertical swipe scrolls ≥ 150 px with the world pristine; a tap acts (sand drops a stone, mercury splits a bead, thread flicks); a 300 ms hold engages and a drag carves, stirs or pulls without the page scrolling; a horizontal drag is claimed at once.

Each card step adds its card to the board checks and gets one named invariant:
- `knit: stitch V period 4 cells`;
- `denim: 3/1 twill warp fraction .75; the selvedge is value, with no active dot`;
- `paper: deboss lit wall/dark wall under raked light`;
- `wood: ring period ≥ 3 cells everywhere`;
- `leather: grain creases = voronoi borders`;
- `sand: talus relaxation conserves volume (±1e-4)`;
- `ice: same cluster as dla seed (bit for bit)`;
- `mercury: ink mass conserved within fluid tolerance`;
- `thread: max strain ≤ 2% at rest`.

**Estimate:** 4.25–5.25 days (M3.12 adds ¼ d). Three agents can each take three cards after M3.1.

---

## 6. WebGL and renderer rules for this track

- **Default is CPU (Canvas or SVG by dot count),** per DESIGN.md:298. Every M1 card is ≤ 21k dots, so none is GPU-tagged.
- **Only `mat-lens` is tagged** (`gpuValues`, density 2). The rule: a material layer is tagged only when its fine density > 1 is the point of the card. A fine glass layer at 1.125 px pitch is.
- **Fallback is always the same field at the layer's own lattice:**
  - no WebGL2, context lost or shader failure → Canvas at lattice 1;
  - goldens, `describe()` and SVG export never see the tag (`passes.ts:5-9`).
- **GPU passes refuse sites, `sizeCurve` and `jitter`** (`passes.ts:72`). So the lens's accent tick and rim are separate CPU layers drawn over the pass. Chrome stays outside the pass bounds, because a GPU layer does not suppress CPU cells (DESIGN.md:298).
- `mat-pool` and `mat-mercury` stay CPU. Their sim cost is on the CPU anyway, and GPU fluids are out of scope here.
- **Parity gate:** `scripts/webgl.ts` adds `mat-lens` at density 1 against the CPU sample (mean Δ ≤ 2/255, ≤ 2.5% of pixels > 16, PSNR ≥ 32 dB).

## 7. DESIGN.md updates (in the same PRs)

**Ownership.** F0 owns DESIGN.md's Light section (`DESIGN.md:114`), and F0.9 rewrites it: the hub keys, the `sceneLight` precedence, the TILT button. M edits nothing there until F0 has merged, and then only **appends**: the rows below under Light › Materials, and the Materials token table. M1.11, M2.8 and M3.11 each append their own rows, in their integration-queue commits.

**Light › Materials table** (`DESIGN.md:121-131`). Append rows:

| Material | Function | Dot rule |
|---|---|---|
| Brushed / spun | `anisoSpec` + `anisoLayers` | Body capped at 1 − 2 steps; the Kajiya–Kay streak +1 step at `rim`, +2 at `core` in `value`; tangent presets linear / radial / SDF |
| Matcap | `matcap` | Environment read off the normal through a 64² LUT, hard stops; rotates with the light azimuth, tips ≤ 25° with the tilt offset (`tx`, `ty`), none at rest |
| Woven | `weave` + `weaveRelief` | Threads ≥ 3 cells with a 1-cell void gap; warp one band above weft; sheen along the thread |
| Stitched | `stitch` / `stitchField` | Hard dashes on card pitch; unsewn stitches are needle holes; the needle may be the accent |
| Stone | `marble`, `terrazzo` | Veins ≥ 2 cells drop one band; engraving is a V-groove lit wall / dark wall under raking light (≤ 18°) |
| Liquid glass | `liquidGlass` | Dots stay on the grid, the sampled value moves (sub-cell); Snell LUT (127 samples, n 1.5) on a squircle bezel; Fresnel +1 step; rim `value` |
| Caustics | `causticSplat` | Forward photon splat, B-spline footprint 1.5 cells; net ≥ 1.6 → `value` |

**New tokens** (in a "Materials" token table under Light, so every number in §3–§5 lives in one place):

| Token | Value |
|---|---|
| `{material.minPeriod}` | 2 cells of the layer's lattice (3 with a cross-profile) |
| `{material.rakeElevation}` | 8°–18° |
| `{material.aniso.exponent}` | brushed 48 · spun 80 · satin thread 24 · knit 20 |
| `{material.ao}` | radius 1.5–3 cells, strength .5–.8 |
| `{material.glass.ior}` | 1.5 |
| `{material.glass.lutSamples}` | 127 |
| `{material.glass.bezel}` | `squircle` |
| `{material.water.ior}` | 1.33 |
| `{material.caustic.net}` | 1.6 |
| `{material.bake.cold}` | ≤ 30 ms |
| `{material.bake.rebake}` | ≤ 10 ms |
| `{material.frame}` | ≤ 4 ms |

None of these shadows an existing name. There are still no colour tokens.

The **Board-wide light** paragraph (`DESIGN.md:133`) is F0's: F0.9 writes the `sceneLight` priority (pointer torch → tilt → sun) there. M does not restate it. M only adds the `rake` rule, as the `{material.rakeElevation}` token above plus one Materials row note ("engraving reads under raked light, `rake(L, 18°)`").

**One-accent note** (a Materials row note, not a token): "'Was active' is size contrast in the one `active` layer. `{colors.dotActiveDim}` is not used on material boards until the owner rules (M §10.6)."

## 8. Risks and mitigations

| Risk | Where | Mitigation |
|---|---|---|
| **Aliasing below 2-cell periods** (moiré in twill, marble veins, knurl, lathe rings) | Loom, knob, marble, grille | Every generator states its period in cells and `scripts/materials.ts` asserts run lengths ≥ 2 (3 with a profile). Fine detail moves to card pitch, broad relief to 1.5–2 lattices. `heightFromField({ smooth })` pre-blurs before normals. No pattern at 1-cell period, ever |
| **Per-frame budget** at card pitch (illuminate is 0.65 ms at 144², measured) | Grille, patch, rust | ≤ 2 shading passes per card; shade only within mask bounds; cache per 64-azimuth light bucket (F0) in an LRU of 8; a lattice of 1.25–1.5 for the hero surface if `--bench` shows > 3.5 ms |
| **Cold bake stalls the board open** (EDT 7 ms, height 9 ms at 144², measured) | All | Bakes run lazily on the card's first frame, never at import. Cold ≤ 30 ms per card is checked. Cards on screen bake one per frame (the board mounts them in view order) |
| **One accent** (the temptation to use red on rust, warm wood, koi-like glass) | Rust, window, wood, denim | Red marks only the live element: needle, shuttle, front, hour pane, second. A board check counts red layers per card, and another forbids `activeDim` (size contrast instead, rule 6). Denim's selvedge is white `value` by default. A red redline ships only if the owner approves it (§10.2), as a logged `primary` exception on `/workshop/` |
| **Hue creep** ("amber glass", "copper rust") | Window, rust | No colour tokens; DESIGN.md row: "material from relief, never hue" |
| **iOS tilt permission** | Knob, mercury, all KK cards | Cards never request it. F0's hub owns the one permission tap. Without it, cards fall back to the sun, so every card is complete with no permission granted. Checked by the source-grep check |
| **Tilt vs gravity mix-up** (gravity's gy ≈ 1 at rest tips matcaps 25° and turns KK light 180°) | Knob, lens, mercury, KK cards | Light comes only from `sceneLight`. Tilt is (`tx`, `ty`), 0 at rest; `gx` / `gy` feed physics steps only. Source-grep and `tx = ty = 0 ≡ no-tilt` checks (M3.10) |
| **Light keys silently missing** (`Board.tsx:82` passes only declared keys) | All | Every card declares `lightSrc/lightAz/lightEl/tx/ty` in `defaults`, and both boards set `sources: [lightSource]` in the manifest and the eager registry. Checked per card (M1.6) |
| **The touch policy** (a drag-to-light would steal scroll) | Knob, lens, sand, mercury, thread | Hover lighting is desktop-only by construction (touch pointers are unseen until claimed). Drag cards use the declared `knob` / `xy` / `gesture: 'surface'` controls and inherit horizontal-or-hold. Every card has a tap action. Proven in a real browser by `scripts/materials-browser.ts` (M1.12, M2.9, M3.12) |
| **Too fast for the card's fps** (12 fps default, `DotCanvas.tsx:398`) | Loom | `fps: 40` via F0.10 (2 cells per frame); a size-contrast trail on the phone tier; ≤ 24 cells/s if F0.10 slips |
| **Existing goldens move** | light board | `src/engine/light/*` is not edited. `glass` and `metal` stay; equivalence is a check, not a refactor |
| **F0 / L1 slip** | Marble, window, rust, pool | M1.1–M1.8 need no noise (weave, aniso, matcap, knob, grille). Marble, terrazzo, window and rust start when F0 noise lands. The pool waits on L1.2's `ripple.ts`; it is the last M2 card, so the board can ship with 4 M2 cards and add the pool later (one more added golden). A candle clock (§4.4) waits on L1.4 and is never pulled into M1 |
| **GPU card mismatch** | Lens | The density-1 parity gate in `scripts/webgl.ts`; the CPU field is the truth |
| **First-load creep** | Wiring | `matter` is out of the barrel (checked); boards are lazy; only manifest rows are eager. `size.ts --check` runs after `vite build` in M1.11, M2.8 and M3.11, gated as a **delta** (≤ +0.06 kB gz per manifest row) against the `docs/LIVING-MATTER-PLAN.md` §6 ledger, after F0.11's ≥ 1 kB cut |
| **Worker chunk creep** (`sampleWorker` imports the eager registry, `src/workers/protocol.ts:10`) | Wiring | Board modules and the `matter/` modules they import ship in the worker chunk. `size.ts` doesn't follow the worker, so each wiring step records the `dist/assets/sampleWorker-*.js` gz delta in PROGRESS. Bakes stay lazy inside functions, so the worker pays bytes, not start-up time |

## 9. Schedule

| Phase | Days | Parallel lanes | Gate |
|---|---|---|---|
| M1 | 4.75 | after M1.1: {aniso, matcap} · {weave, stitch} · {marble}; after M1.6: {loom, knob, terrazzo} · {grille, marble card}; M1.11 in the queue after Q1, then M1.12 | 5 added goldens, 0 changed; ≤ 4 ms per card; one-accent and no-`activeDim` checks; first-load delta ≤ +0.06 kB + worker delta recorded; `materials-browser` (knob) |
| M2 | 3.75–4.25 | {glass + lens} · {caustics} · {window, patch, rust}; the pool after L1.2; a candle clock (if any) after L1.4; M2.8 in the queue after L2, then M2.9 | as M1 (first-load delta 0) + WebGL parity for `mat-lens`; pool total memory ≤ 256 KB; `materials-browser` (lens) |
| M3 | 4.25–5.25 | 3 lanes of 3 cards after M3.1; M3.11 in the queue after Q2, then M3.12 | as M1 on `/workshop/`; tilt checks; `materials-browser` (sand, mercury, thread) |

F0 must land first for noise, `dmath`, the light contract (F0-C), per-card fps (F0.10) and the first-load cut (F0.11). Until F0-C lands, `matLight` falls back to pointer → `sunAt`. M1 doesn't touch track L or Q files and imports nothing from `src/engine/life/`, so it runs alongside L1 and Q1, as LIVING-MATTER-PLAN §6 says. Only its wiring commit waits for its queue slot (L1 → Q1 → M1).

## 10. Open owner decisions (this track)

1. **Board placement:** `materials` in ENGINE (next to `light`) or PLAY? Should any material card join START HERE (the Loom is the candidate)?
2. **`mat-denim`'s red selvedge:** the default is now a white `value` selvedge, because a static red line contradicts rule 6. Should the red redline ship instead, as a logged `primary` exception on `/workshop/`? It ships only with the owner's yes.
3. **`mat-paper` and `mat-leather`:** no accent at all (purely material), or a live action each?
4. **Rust epoch:** "days since" what? The default is the plan's date (2025-10-27). It could be a real site event.
5. **Lens on START HERE devices without WebGL2:** the lattice-1 fallback is correct. Is it rich enough, or should the CPU path use lattice 1 + `frost` 0.4 to hide the coarser warp?
6. **Does `activeDim` count as part of the one accent?** `{colors.dotActiveDim}` is the "was active" red (`DESIGN.md:24`). Until the owner rules, it does **not** count, so no M card uses it, and "was active" (the Loom's trail, the window's night pane) is size contrast in the single `active` layer. If the owner says yes, the Loom's trail and the window's night pane may switch to `activeDim`. That would be an intended golden change for those two cards only.
