# Track L: living scenes (the Pond board, `/pond/`)

> Status: **L1 built** (2026-10-28): `src/engine/life/`, the `pond` board with `pond-koi`, `scripts/life.ts`, [`docs/LIFE.md`](../LIFE.md). L1.0 ran as a scratch prototype; style **B** (lattice interiors) is the default pending the owner's ruling (switch: `DEFAULT_BODY_STYLE` in `pond.ts`). Deviations from the numbers below are listed in LIFE.md (slower burst/cruise, speed-dependent turn radius, joint limit .11, half-width .13, shorter koi, bigger pads, second feed at 28 s, C-start turn 90–105°, contain look-ahead 1.2 s). L2–L4: **plan**.
> Original status: **plan** (2026-10-27). Part of [`LIVING-MATTER-PLAN.md`](../LIVING-MATTER-PLAN.md) §3, expanded so an agent can build it without re-doing the research. Read that overview's §1 (the daoho.dev teardown) first. File:line citations are to `main` as of ef4dcd8.
> Phases: **L1** water + glyph tiles + creature core + `pond-koi` · **L2** ecosystems (5 cards) · **L3** polish and interaction depth · **L4** (optional) a full-bleed hero behind EXPLORE. Later pond work lives in the advanced doc's **XL** and **X1** (pond depth); the shared phase names are F0, L1–L4, Q1–Q3, M1–M3, XL, XQ, XM, X1, X2.
> Depends on **F0**:
> - `src/engine/noise`: `noise2`, `fbm2`, `curl2`, `voronoi2`, plus `dmath.ts` (`dsin dcos tsin tcos datan2 dexp dpow`, `ihash`, `rngFor`);
> - **F0.9**'s determinism lint, the only one (L1.1 registers `src/engine/life` with it);
> - **F0.10**: `WidgetPreset.fps` and the phone tier. F0.10 owns `widgets/types.ts` and `DotWidget.tsx`; L only sets `fps` per card;
> - the light hub (`sceneLight`, `lightSource`), used in L3.6 only.
>
> **Owns:**
> - `src/engine/life/glyphTiles.ts`, API frozen at L1.3. Q adds alphabets only; the Squares board may consume it later.
> - `src/engine/life/ripple.ts`, API frozen at L1.2. M2's caustic pool consumes it.

## 0. Decisions assumed (change them here, not in code)

| # | Decision | Why / where the code agrees |
|---|---|---|
| D1 | **Glyphs are dot micro-patterns by default**: a glyph is a k×k block of card dots (k = 3, tile pitch 4 = glyph + 1-cell gutter). A **font-glyph** tile variant (5×7 `bitmapFont` glyphs in 6×8 tiles) ships as a per-card toggle in L3. **Koi body interiors wait on an owner ruling (L1.0):** style A draws them as micro-glyphs too; style B (the fallback) draws them as single lattice-4 dots, with glyphs only on edges, fins and water (§L1, "Body style B"). | Card pixels stay on the 144² card grid (`TILE`, `src/widgets/types.ts:53`), so goldens, X-ray and quantization all keep working. 5×7 glyphs already exist (`src/engine/fields/bitmapFont.ts:5-43`). A koi body is about 12 cells wide, and AGENTS.md (also `src/widgets/types.ts:50-52`) says bigger elements use "a coarser lattice or dot sites, never clusters of small dots", hence the gate. |
| D2 | **Koi are kohaku-family in `{colors.dotActive}` plus greys.** Red is `active` only. The darker glyph on a red tile comes from **size contrast**: the same red at a smaller dot size (value .6), or no dot at all. It is never a second red. White is `value`/`idle`, sumi is `faint` or no dot. **Owner decision:** whether `activeDim` may join the one accent. Until the owner rules, no pond frame uses it. | One accent per board. DESIGN.md:24 defines `{colors.dotActiveDim}` as a state ("was active rather than is active"), not as a shading step, so using it for shading needs a ruling. The same rule applies to koi shading, depth, firefly flashes and every other red. |
| D3 | **Algorithms come from the published sources** (argonaut spine chain, Reynolds steering, Videler/Lighthill swim kinematics, Strouhal tail beat, Elias wave equation, Jones physarum, Mirollo–Strogatz, Kuramoto, Runions space colonisation, ABOP L-systems, Ballerini topological flocking). **No daoho source or constants are copied.** Where daoho used a number, we use a published one instead (for example wave number 2π/1.1 L per Videler, not daoho's 4.6). | daoho's code has no license (overview §1). |
| D4 | Every scene is a `World` (`src/engine/physics/world.ts:113`): a **pristine** seeded, looped, checkpointed run, plus a **live** fork on input that heals back. Goldens and reduced motion read the pristine run only. | Same contract as the physics board (`src/widgets/boards/physics.ts:1-15`). |
| D5 | `src/engine/life/` is lazy. It is **not** re-exported from `src/engine/index.ts`. Boards import `../../engine/life` directly. | Same reason as `src/engine/algo/index.ts:1-6`: the barrel is first-load (148.1 / 150 kB gz). |
| D6 | Sound is **out of scope for L1–L3** (L3.7 records why). The advanced doc's bubble-sound idea (#6, Minnaert bubbles on pellet landings, taps and gulps) is an **owner decision for later (XL)**, not part of this plan. | `src/audio` is the Instrument's engine, started only by its SOUND toggle (`src/audio/engine.ts:11-13`). Cards are pure in ctx and have no side-effect channel. `src/game/sound.ts:8-22` looks for `sfx`/`play`/`trigger`, which `src/audio/index.ts:2-6` doesn't export. |
| D7 | Pond cards draw at **their own frame rate**: each card sets `fps` (koi 30, murmur 24, jelly and fireflies 20, slime 15, terrarium 12). The field `WidgetPreset.fps` and the phone tier come from **F0.10**, which owns `widgets/types.ts` and `DotWidget.tsx`. Today every animated card runs at 12 fps (`src/components/DotCanvas.tsx:398`), and DotWidget passes `fps` only for a live camera (`src/components/DotWidget.tsx:125,128`). | L sets a number per card and edits no core file for it. Goldens sample t = 0 and 1.3 only (`scripts/golden.ts:19`), so `fps` can't move a golden. |

## 1. What exists and is reused (verified)

- **World** (`src/engine/physics/world.ts`):
  - one flat `Float32Array` state, `init`, `step(state, n, input)` and an optional `blend` (`:52-81`);
  - the seam pulls the loop end onto its start (`:125-133`);
  - a live fork on the first engaged frame, at most `maxLiveSteps` per frame and never a bigger dt (`:177-189`);
  - pointers interpolated per step with `pressed`/`released` edges (`:195-205`);
  - heal after `idle` (`:221-223`), and a NaN fallback (`:220`);
  - `framePointers` (`:233-238`).
- **Sim** (`src/engine/sim/sim.ts`):
  - checkpoints are an LRU with step 0 and the loop start pinned (`:97-104`);
  - 3 reused view buffers (`:54`, `:130-138`);
  - "keep lead + period ≤ maxSteps" (`:11`).
  - `createWorld` defaults to `every 30`, `maxCheckpoints 48`, `maxSteps 2400` (`world.ts:119-120`). **Memory per card = checkpoints × size × 4 B, plus 6 more copies** (head, scratch, 3 views, live).
- **Spatial hash** (`src/engine/physics/particles.ts:15-41`): a counting-sort hash over state planes X, Y, K. Its order is deterministic, so flocking and fireflies reuse it.
- **Card patterns** (`src/widgets/boards/physics.ts`):
  - `mainThread()` refuses the sampling worker (`:36-37`);
  - the `touch()` surface control (`:42`);
  - `frameOf()`, where Enter is a kick (`:44-47`);
  - `siteLayers()` (`:51-60`), `blendHead()` (`:62`);
  - a raster plus `toneOf` multi-tone layer (`:363-377`).
- **Board and checks pattern** (`src/widgets/boards/algorithms.ts`, `scripts/algorithms.ts`):
  - `cite`/`cap` captions (`algorithms.ts:25-27`), the `cells()` bounded field (`:49-54`), a toneOf layer in one scan (`:199-212`);
  - the checks module with `loadFactor()` (`scripts/algorithms.ts:25-30`), board purity, the t = 0, one-accent and ≤ 4 ms checks (`:129-146`), and the self-run block (`:149-154`);
  - wired at `scripts/verify.ts:54,866-867`.
- **Determinism helpers:**
  - `len` (`src/engine/math.ts:11`, not `Math.hypot`);
  - from F0's `src/engine/noise/dmath.ts`, imported from `../noise` (never `../algo/attractor`): `dsin dcos tsin tcos` (they move there verbatim from `algo/attractor.ts:20-42`), `datan2`, `dexp`, `dpow`, `ihash` and `rngFor`;
  - `hash01` (`math.ts:31`) is **not** used in `life/`. `hash32` scales by 256, so it aliases integers past ±2²³ (`math.ts:23-29`). Entity ids and step counters go through `ihash`/`rngFor`.
  - STBN: `stbn(x, y, slice)` over the 64² void-and-cluster table (`src/engine/halftone/mask.ts:75-81`). The table is built with `Math.exp` (`mask.ts:17`), so it is render-only input and never enters a `step`.
- **Input:**
  - the context `Pointer` has `inside`, `down` and `up` (`src/engine/context.ts:5-16`);
  - `Control.gesture: 'surface'` (`:47-51`), `ctx.reducedMotion` (`:70`);
  - touch thresholds: slop 10 px, hold 300 ms, tap replayed as a 90 ms press (`src/engine/interaction/gesture.ts:10-25`);
  - a surface is a drag intent (`:34-37`) and needs a hold for vertical motion (`:40-43`);
  - engage plus haptic (`src/hooks/useControlInput.ts:37,199-201`).
- **Board plumbing:**
  - `boardManifest` (`src/widgets/manifest.ts:29-56`), `boardGroups` (`:78-84`), the eager registry (`src/widgets/index.ts:58-61`), board blurbs (`src/widgets/blurbs.ts:30-33`);
  - card blurbs as `'<slug>': ['<line>', '<tags>']` (`src/widgets/meta.ts:10,293-310`), the hint verb (`:61-65`);
  - uids via `npx tsx scripts/widgets/ids.ts --assign` (`scripts/widgets/ids.ts:1-13,52-62`).
- **Light:**
  - `sunAt(hour)` and `hourOf(date)` (`src/engine/light/material.ts:253-259`), read per frame as on the light board (`src/widgets/boards/light.ts:88`). Goldens freeze the clock at 09:41 (`scripts/lib/freeze.ts`).
  - From F0: `sceneLight({ pointer, data, hour })` reads the keys `lightSrc`, `lightAz` and `lightEl`. There is **no `data.light`**.
  - The tilt offset is `tx`, `ty` (0 at rest). `gx`, `gy` are gravity (about (0, 1) upright) and are for physics only.
  - A card declares the keys it reads in `defaults` (`Board.tsx:82` passes only declared keys), and its board adds `sources: [lightSource]` in the manifest and the eager registry (`manifest.ts:46,49` pattern).
- **Sampling worker:** the worker imports the eager registry (`src/workers/protocol.ts:10` → `widgetPresets`, `src/widgets/index.ts:67`), so every board module listed there lands in `sampleWorker-*.js`. A card that refuses the worker gets an error reply and from then on samples on the main thread (`src/workers/client.ts:41,60`).

## 2. Shared conventions for every L module

**Determinism (hard rules, enforced by F0.9's lint `det: no engine-specific Math in deterministic dirs`, the only one; L1.1 registers `src/engine/life/**` with it and adds no second source scan):**
- Inside any `step`, use:
  - `dsin`, `dcos`, `tsin`, `tcos` for trig;
  - `datan2` for angles, and `dexp`/`dpow` for exponentials and powers (all from `../noise`);
  - `Math.sqrt`, `+ − × /`, `Math.floor`, `Math.round`, `Math.min`, `Math.max` and `Math.abs`.
- **Never** use anything on F0.9's ban list in `src/engine/life/**`: `Math.random`, the `Math` trig/hyperbolic functions, `Math.hypot`, `Math.exp`/`expm1`, `Math.log*`, `Math.pow`, `Math.cbrt`, or `**` with a non-integer literal exponent.
  - These aren't bit-identical across engines.
  - A constant built with them at module load is engine-dependent too. Write constants as literals, with exact ops (decay `1 − dt/τ`), or with `dexp`/`dpow`. Lookup tables are built with `dpow`.
  - The escape hatch is F0.9's same-line `// det-ok: <reason>`. `life/` should need none.
- **Randomness:** `rngFor(seed, id, n)` gives a stream per entity per step; `ihash(seed, id, salt) / 2³²` gives a single draw. Per-entity constants use `ihash(seed, id, salt)` at init.
- **Fixed dt per scene:** 1/30 s for koi, jelly, fireflies and murmuration; 1/15 s for slime and the terrarium.
- **No sorting without an index tie-break.** k-nearest uses insertion sort on `(d², index)`.
- Only `Float32Array` state is persistent. Solvers keep scratch outside it (the World contract, `world.ts:4-5`).
- **Directions are unit vectors `(hx, hy)` in state, never angles**, so seams and heals can lerp them (renormalise after blending). Angle-dependent rotations use the precomputed `c = dcos(ω·dt)`, `s = dsin(ω·dt)`.
- Glyph orientation is snapped **without trig**: tangent `(tx, ty)`, then compare `|ty|` with `0.41421356·|tx|` (tan 22.5°) and the sign of `tx·ty` (§L1.3).

**Loop phase.** `phaseSteps(n) = ((n − start) % len + len) % len`, where `start = lead/dt` and `len = period/dt`.
- Every autopilot schedule reads this function, so the pre-roll before `lead` lines up with the loop end.
- Example: an event at phase `len − 45` also fires at run step `start − 45`. A ripple ring born 1.5 s before the loop end is therefore already on screen at t = 0, and the seam has nothing to fake.

**Rendering.** All scenes draw into a **tile raster** (§L1.3): per card cell, a tone index plus a value.
- It is emitted as **one multi-tone `toneOf` layer** bounded to the scene box. That is one sampler scan, equivalent to one layer per tone (`src/engine/types.ts:39-46`).
- `split: true` emits one layer per tone instead, for X-ray readability.
- **Values sit on quantize steps** (tileStyle inherits `quantizeSteps: 5`, `src/widgets/types.ts:54-56`): 0.6, 0.8 and 1.0 only. Size contrast inside the accent uses these steps: red at 1.0 next to red at .6 or no dot.

**The tone palette index**, used by every L raster:
```ts
export const LIFE_TONES = ['faint', 'mid', 'idle', 'value', 'activeDim', 'active'] as const // 0..5; -1 = empty
// index 4 is reserved for the owner's activeDim ruling (D2). Until then no raster writes it, and the one-accent check fails if one does.
```

**Card shell (every pond card):**
```ts
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
controls: [{ key, kind: 'button', gesture: 'surface', box: [0, 10, 144, 134], label }]   // physics.ts:42 pattern
```
- The card starts with `mainThread()`.
- `frameOf(ctx, key, map)` maps pointers into scene units. Enter or Space is a kick.
- Under `ctx.reducedMotion` the card passes **no** `FrameInput`, so it always shows pristine t.
- Label and caption chrome:
  - `label: '01  KOI'` and so on, drawn by `chrome: 'dots'`;
  - a faint top-right caption via `cap(..., 143, 1, 'right')`, as in `algorithms.ts:25-27`.

---

## Phase L1: water, glyph tiles, creature core, `pond-koi` on `/pond/`

**Goal:** a koi pond card that holds its own against daoho.dev as a dot-matrix piece. It uses wave-equation water, dot micro-glyph tiles, 6 koi with argonaut spines and Reynolds behaviour, and food and touch that follow the scroll-first policy. It ships with the engine modules every later card reuses. The pond board is main-thread only: every card calls `mainThread()`, and `life/` stays out of the sampling worker's bundle (§L1 "Worker bundle").

**Deliverables**

| Path | What |
|---|---|
| `src/engine/life/index.ts` | Lazy barrel: `ripple`, `glyphTiles`, `chain`, `body`, `steer`, `pond` (L2 adds `agents`, `oscillators`, `grow`) |
| `src/engine/life/ripple.ts` | Elias two-buffer wave equation with mask walls |
| `src/engine/life/glyphTiles.ts` | Alphabets, descriptors, `matchTile`, edge snapping, tile raster → `Layer[]` (**shared owner**, Q consumes) |
| `src/engine/life/chain.ts` | Follow-the-leader spine with a bend clamp; verlet rope; FABRIK |
| `src/engine/life/body.ts` | Width profile, swim wave, spine-space raster, koi patterns |
| `src/engine/life/steer.ts` | Reynolds seek/flee/arrive/wander/contain/separate/align, turn cap, C-start |
| `src/engine/life/pond.ts` | `createKoiPond(spec)`: the koi scene (world + render into a tile raster), shared by the card and the L4 hero |
| `src/widgets/boards/pond/index.ts`, `pond/koi.ts`, `pond/shared.ts` | Board module: `pondBoard`, `pondWorlds`, `pondProbe` (`pondSources` added in L3.6); card shell helpers. Each card sets `fps` (F0.10) |
| `src/widgets/boards/pond/worker-stub.ts`, `vite.config.ts` (`worker.plugins`) | Keeps `life/` out of the worker bundle: the worker build resolves `boards/pond/index` to a stub exporting `pondBoard = []` (§ "Worker bundle") |
| `src/widgets/manifest.ts` ‡ | `{ id: 'pond', title: 'POND — LIVING SCENES IN GLYPH TILES', columns: 3, load: () => import('./boards/pond/index').then(m => ({ items: m.pondBoard })) }`; `'pond'` added to the `play` group (`:82`) |
| `src/widgets/index.ts`, `src/widgets/blurbs.ts` ‡ | Eager registry entry; board blurb "A koi pond and other small ecosystems, drawn in glyph tiles. Tap to feed, hold to lure." |
| `src/widgets/meta.ts`, `src/widgets/ids.json`, `src/widgets/catalog.ts` ‡ | Blurb and tags, then `ids --assign` |
| `scripts/life.ts` (+ `scripts/verify.ts` ‡) | `lifeChecks(assert)`; self-run like `scripts/algorithms.ts:149-154`. In verify it goes after `algorithmsChecks` (verify.ts:866-867) and F0's blocks, in the order noise, light, golden key, **life**, squares, materials (§6) |
| `scripts/life-browser.ts` | CDP probe (desktop 1280 + touch 375×812), modelled on `scripts/site/mobile.ts:20-60` |
| `goldens/hashes.json` ‡ | New keys `pond-koi` t=0 and t=1.3 only |
| `docs/LIFE.md`, `docs/README.md` ‡, `docs/PROGRESS.md` ‡ | Module doc in the style of `docs/ALGORITHMS.md`, index row, progress entry |
| `DESIGN.md`, `CHANGELOG.md`, `src/changelog.ts` | Per-card fps rows under F0.10's section of DESIGN.md (and pond tokens, if any are added); a CHANGELOG entry; `upcoming` rows in `src/changelog.ts:142` |

‡ Shared registry and doc files. They are edited **only in integration-queue commits** (§6), never on the L branch's feature commits. `WidgetPreset.fps` and DotWidget's wiring are F0.10's, not L's.

### L1 API

`ripple.ts`'s API (`createRipple`, `rippleStep`, `rippleSplat`, `rippleGrad`, `rippleEnergy`) is **frozen at L1.2**. M2's caustic pool (`mat-pool`, M2.4) consumes it on its own 72 × 62 grid. Later additions are new functions, such as L3.6's `rippleTilt`; existing signatures never change.

```ts
// ── ripple.ts ── Hugo Elias 2D water: h' = (Σ N4(h) / 2 − hPrev) · damp; walls = mask 0 (fixed-end, reflect inverted). API frozen at L1.2 (M2 consumes it)
export interface RippleSpec { w: number; h: number; damp?: number /* per step, default .984 */; mask?: Uint8Array /* 1 = water */ }
export interface Ripple extends Required<RippleSpec> { /** offset of plane H (current) and P (previous) inside the world state */ H: number; P: number; size: number }
/** Lay out a ripple at `offset` in a world state (2·w·h floats). */
export function createRipple(spec: RippleSpec, offset?: number): Ripple
/** One step in place: new → P's slot, then swap the contents of H and P (no parity flag, so states stay blendable). */
export function rippleStep(r: Ripple, s: Float32Array): void
/** Add a raised-cosine dip of `amp` (negative = pushed down) and radius `rad` (cells) at (x, y), current plane only. */
export function rippleSplat(r: Ripple, s: Float32Array, x: number, y: number, amp: number, rad: number): void
/** Bilinear height and central-difference gradient at (x, y) into `out` [h, gx, gy]. */
export function rippleGrad(r: Ripple, s: Float32Array, x: number, y: number, out: Float32Array): void
/** Σ h² over water cells (checks: energy decays). */
export function rippleEnergy(r: Ripple, s: Float32Array): number

// ── glyphTiles.ts ── dot micro-pattern glyphs on a tile lattice. L owns it; API frozen at L1.3. Q adds alphabets only (via defineAlphabet); the Squares board may consume it later
export interface Glyph { ch: string; w: number; h: number; bits: Uint8Array /* w·h, row-major, 1 = dot */; ink: number /* lit / (w·h) */ }
export interface Alphabet { name: string; w: number; h: number; glyphs: Glyph[]; /** 16 floats per glyph: coverage at 4×4 sample points */ desc: Float32Array }
/** Build an alphabet from '#'/'.' rows (one string per row, rows joined by '/'). Frozen once built; Q adds alphabets, never edits. */
export function defineAlphabet(name: string, w: number, h: number, glyphs: Record<string, string>): Alphabet
export const EDGE3: Alphabet, RAMP3: Alphabet, SHAPE3: Alphabet, QUAD4: Alphabet, RAMP4: Alphabet, FONT57: Alphabet
export interface TileGrid { cols: number; rows: number; pitch: number /* card cells per tile */; ox: number; oy: number /* card cell of tile (0,0) */ }
export interface TileRaster {
  grid: TileGrid; cardW: number; cardH: number; tone: Int8Array /* per card cell, -1 empty */; value: Float32Array
  /** Per tile: one big dot on the tile lattice (style B interiors, §L1 "Body style B"); -1 = none. */
  bigTone: Int8Array; bigValue: Float32Array
}
export function createTileRaster(card: { cols: number; rows: number }, tiles: TileGrid): TileRaster
export function clearTiles(r: TileRaster): void
/** Stamp glyph g at tile (tx, ty): lit pixels get (fg, fgValue); unlit pixels get (bg, bgValue) when bg ≥ 0; the gutter stays empty. Clears that tile's big dot. */
export function putGlyph(r: TileRaster, tx: number, ty: number, g: Glyph, fg: number, fgValue: number, bg?: number, bgValue?: number): void
/** One big dot for the whole tile (pitch × card dot), and the tile's card cells are cleared. Square-pitch grids only (not FONT57's 6×8). */
export function putBig(r: TileRaster, tx: number, ty: number, tone: number, value: number): void
/**
 * Stateless flicker (advanced doc #12, the stateless half): a tile is "on" while frac(stbn(tx, ty) + rate·t + phase) < share.
 * The STBN table (halftone/mask.ts:78) spreads the on-tiles as blue noise in space; the threshold scrolls continuously in t,
 * so only 2·rate/fps of the tiles change per frame (rate .25/s at 30 fps → 1.7 %). Pure in t. No hysteresis, no state.
 */
export function flickerOn(tx: number, ty: number, t: number, share: number, rate: number, phase?: number): boolean
/** Line glyph across a gradient (gx, gy), i.e. along the iso-line: '-' '|' '\' '/' (y down). No trig. */
export function edgeOfGradient(a: Alphabet, gx: number, gy: number): Glyph
/** Same, for a direction vector (tangent) instead of a gradient. */
export function edgeOfTangent(a: Alphabet, tx: number, ty: number): Glyph
/** Density glyph for level 0..1 (ordered-dither fill order). */
export function rampGlyph(a: Alphabet, level: number): Glyph
/**
 * Nearest glyph to 16 coverage subsamples (4×4 over the glyph box, row-major), after Alex Harri's contrast
 * step: v ← (v / max)^γ · max when max > .1 (γ = 2). L2 over the 16-vector; ties → lower index.
 * Memoised on a 32-bit key (each sample quantised to 2 bits).
 */
export function matchTile(a: Alphabet, sub16: Float32Array): Glyph
/** The raster as layers: one multi-tone `toneOf` layer bounded to the tile box (`split` → one per tone), plus, when any big dot is set, one multi-tone layer with `lattice: pitch, origin: [ox, oy]` (types.ts:53-54; the sampler hides card dots under a lit lattice dot, :51). */
export function tileLayers(r: TileRaster, opts?: { split?: boolean; tones?: readonly Tone[] }): Layer[]
/** Convenience (overview §3 signature): sample(tx, ty) → tile, then glyph by cover/angle/level, then layers. */
export function glyphTileLayers(card: GridConfig, tiles: TileGrid, sample: (tx: number, ty: number) => TileSample | undefined, alphabet: Alphabet): Layer[]
export interface TileSample { cover: number; sub16?: Float32Array; gx?: number; gy?: number; level?: number; fg: number; value?: number; bg?: number }

// ── chain.ts ── argonaut follow-the-leader spine, verlet rope, FABRIK
export interface Chain { n: number; seg: number; maxBend: number; X: number /* offset of x plane */; Y: number; cb: number; sb: number /* dcos/dsin(maxBend) */ }
export function createChain(n: number, seg: number, maxBend: number, offset?: number): Chain // state: 2n floats
export function chainInit(c: Chain, s: Float32Array, x: number, y: number, hx: number, hy: number): void // straight, behind the head
/** Put node 0 at (hx, hy); each next node sits `seg` behind its predecessor, with the joint angle clamped to ±maxBend (vector rotation, no trig). */
export function chainFollow(c: Chain, s: Float32Array, hx: number, hy: number): void
export interface Rope { n: number; seg: number; drag: number; iters: number; X: number; Y: number; PX: number; PY: number }
export function createRope(n: number, seg: number, opts?: { drag?: number; iters?: number }, offset?: number): Rope // 4n floats
/** Verlet step with linear drag and acceleration (ax, ay) + optional per-node flow(x, y) → velocity; node 0 pinned at (rx, ry). */
export function ropeStep(r: Rope, s: Float32Array, dt: number, rx: number, ry: number, ax: number, ay: number, flow?: (x: number, y: number, out: Float32Array) => void): void
/** FABRIK (Aristidou & Lasenby 2011): reach (tx, ty) from a fixed root in ≤ iters passes; tolerance .05 cells. */
export function fabrik(xs: Float32Array, ys: Float32Array, lens: Float32Array, tx: number, ty: number, iters?: number): boolean

// ── body.ts ── fish body in spine space (s along 0 = snout → 1 = tail tip, v signed lateral)
export interface BodySpec { length: number; halfWidth: number /* × length, default .11 */; fins: boolean; tail: boolean }
/** Half-width B(s) in cells: halfWidth·L · √s·dpow(1−s, 1.15) / .3634 (peak 1 at s = .303). Read from a 257-entry LUT over s ∈ [0, 1], built at module load with Math.sqrt and dpow and interpolated linearly. */
export function widthAt(b: BodySpec, s: number): number
/** Lateral swim offset at s: A(s)·dsin(phase − k·s), A(s) = L·(.02 − .0825 s + .1625 s²)·beat, k = 2π/1.1. */
export function waveAt(b: BodySpec, s: number, phase: number, beat: number): number
export interface BodyRaster { x0: number; y0: number; w: number; h: number; cover: Float32Array; s: Float32Array; v: Float32Array /* per card cell in the box */ }
/** Forward-splat the posed body (chain + render-time wave) at card-cell centres: per cell min |v|, inside B(s) or a fin or the tail. */
export function bodyRaster(b: BodySpec, c: Chain, st: Float32Array, phase: number, beat: number, out: BodyRaster): void
export type KoiKind = 'kohaku' | 'sanke' | 'showa' | 'tancho'
/**
 * The koi's marking LUT, baked once at spawn (createKoiPond): 64 (s ∈ [0, 1)) × 16 (vn ∈ [-1, 1]) bytes, row-major in s,
 * 0 white, 1 red, 2 sumi (black). Pure in (kind, seed); memoised on that key. Render-only, so it is not world state.
 */
export function koiPattern(kind: KoiKind, seed: number): Uint8Array
/** Nearest-cell read of the LUT (no interpolation, so marking edges stay crisp at tile resolution). */
export function markingAt(lut: Uint8Array, s: number, vn: number): 0 | 1 | 2
/** Tail-beat frequency (Hz) from Strouhal St = f·A_pp/U: f = St·U / (2·A_tail), St = .3. */
export const tailBeatHz = (speed: number, length: number, st?: number) => number

// ── steer.ts ── Reynolds (GDC 1999) on head agents; every function adds into `out` [fx, fy] scaled by w
export interface Agent { x: number; y: number; hx: number; hy: number; u: number }
export function seek(a: Agent, tx: number, ty: number, maxU: number, w: number, out: Float32Array): void
export function flee(a: Agent, tx: number, ty: number, maxU: number, w: number, out: Float32Array): void
/** Seek that slows inside `slow` cells (arrive). */
export function arrive(a: Agent, tx: number, ty: number, maxU: number, slow: number, w: number, out: Float32Array): void
/** Wander on a circle `dist` ahead of radius `rad`; the circle angle comes from noise2(n·dt·rate, id, seed) (F0), smooth in time. */
export function wander(a: Agent, id: number, n: number, dt: number, o: { dist: number; rad: number; rate: number; seed: number }, w: number, out: Float32Array): void
/** Look `ahead` seconds ahead; when sdf(p') > −margin, push along −∇sdf with weight w·(1 + (sdf + margin)/margin). */
export function contain(a: Agent, sdf: (x: number, y: number) => number, ahead: number, margin: number, w: number, out: Float32Array): void
export function separate(a: Agent, others: ArrayLike<number> /* xy pairs */, count: number, radius: number, w: number, out: Float32Array): void
export function align(a: Agent, others: ArrayLike<number> /* hx hy u triples */, count: number, w: number, out: Float32Array): void
/** Integrate: v += clamp(F, maxF)·dt, then turn the heading toward v by at most ω·dt (precomputed c, s), speed clamped [minU, maxU]. */
export function integrate(a: Agent, f: Float32Array, dt: number, maxF: number, turn: { c: number; s: number }, minU: number, maxU: number): void
/** C-start (Mauthner escape): 150 ms bend away from (sx, sy), then a 400 ms burst. Returns the target heading and sets timers. */
export function startle(a: Agent, sx: number, sy: number, salt: number, out: Float32Array): void
// L2 adds: flock(...) topological / metric neighbours over a SpatialHash (particles.ts:15-41)

// ── pond.ts ── the koi scene (engine side; no chrome, no React)
export interface KoiPondSpec {
  seed: number; tiles: TileGrid; card: { cols: number; rows: number }
  /** Pond SDF in card cells (< 0 = water); obstacle boxes for the L4 hero (`[data-pond-avoid]`). */
  sdf: (x: number, y: number) => number; avoid?: () => readonly [number, number, number, number][]
  koi: { kind: KoiKind; length: number }[]
  /** Autopilot drops (phase seconds, x, y, count); none in the hero. */
  feeds?: [number, number, number, number][]
  lead: number; period: number; seam: number
}
export interface KoiPond { world: World; spec: KoiPondSpec; ripple: Ripple; chains: Chain[]; markings: Uint8Array[] /* koiPattern LUT per koi */; bodyStyle: 'glyph' | 'lattice' /* L1.0 ruling */ }
export function createKoiPond(spec: KoiPondSpec): KoiPond
/** Draw the scene state at t into `r` (water, foam, shadows, koi, pellets, bursts, pads), day/night from `hour`. */
export function drawKoiPond(p: KoiPond, s: Float32Array, t: number, hour: number, r: TileRaster): void
```

### L1 algorithms and parameters

**Composition (pond-koi, 144² TILE grid).**
- Label row 0–9. Tile grid `{ cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }`, so tiles cover rows 11–142, and a glyph is k = 3 dots plus a 1-cell gutter.
- The ripple grid **is** the tile grid: 36 × 33 = 1,188 cells.
- **Pond SDF** (card cells):
  - a superellipse `(|x−72|/66)^4 + (|y−77|/62)^4 − 1`, scaled to cells by `× 30`;
  - minus two rock discs, (28, 118) r 9 and (121, 30) r 7.
  - Water mask = SDF < 0, evaluated at tile centres. Outside the pond is the **bank**.

**Water (`ripple.ts`).**
- `damp = .984` per step at dt 1/30, so a ring keeps about 30 % amplitude after 2.5 s.
- The scheme is stable at Courant number 1/√2 cells/step, so a ring crosses the pond in about 1.7 s. That reads as water at this scale.
- **Splat amplitudes:**

| Source | Amplitude | Radius |
|---|---|---|
| tap press | −1.2 | 1.6 tiles |
| tap release (food) | −0.5 | 1.0 |
| pellet landing | −0.35 | 0.8 |
| koi surface kiss | −0.6 | 1.0 |
| hover wake (pointer > 10 cells/s, over water) | −0.04 per step | 0.7 |

- **Koi wake:** each step, tail nodes 12–19 add `−0.004 · (U/L) · beat · (1 − z)` bilinearly. Moving point sources give the wave equation's own V-wake.
- **Foam** (`18 × 17`, 2 tiles per cell, in state):
  - `+= 0.05 · U/L` per tail node; `×= .95` per step;
  - every 2nd step, 1/8 to each 4-neighbour;
  - draws `.` (> .08) and `:` (> .2) in `faint`.
- **Water glyphs**, per water tile, from `rippleGrad` at the tile centre:

| Condition | Glyph | Tone, value |
|---|---|---|
| `\|∇h\| < .025` | calm tile: a `·` twinkle when `flickerOn(tx, ty, t, .035, .2)` (STBN, pure in t; 1.3 % of tiles change per frame at 30 fps) | `faint` .6 |
| `\|∇h\| < .08` | `edgeOfGradient(EDGE3, gx, gy)` | `faint` .6 |
| `\|∇h\| < .18` | the same glyph | `mid` .8 |
| `\|∇h\| ≥ .18` | the same glyph | `idle` .8 |

  Any tile where `∇h · L > .12` (light `L = (−.6, −.8)`) is a crest: `=` in `value` 1.0.
- **Bank:**
  - baked once: `voronoi2(x/7, y/7, seed, 'l2')` stones;
  - `f2 − f1 < .08` → empty (grout); else `rampGlyph(RAMP3, .15 + .25·fbm2(x/9, y/9, 3, seed))` in `faint` .6.
- **Lily pads:**
  - 3 pads, r = 7, 6 and 5 cells, centred at `base_i + 6·[noise2(.03t, i, seed), noise2(.03t, i + 9, seed)]` (render-time, pure in t);
  - interior `RAMP3` level .7 in `mid`; rim tiles `edgeOfTangent` in `idle`;
  - a 40° notch wedge.
  - Pads are drawn over koi: the fish pass under.

**Glyph alphabets (3×3 dot bitmaps, rows top→bottom, `#` = dot).** EDGE3:

```
-  .../###/...     |  .#./.#./.#.     \  #../.#./..#     /  ..#/.#./#..     ·  .../.#./...
+  .#./###/.#.     x  #.#/.#./#.#     o  ###/#.#/###     :  .#./.../.#.     =  ###/.../###
*  #.#/###/#.#
```
- **RAMP3:** level n ∈ 0..9 lights every pixel whose rank < n under the 3×3 ordered-dither matrix `6 8 4 / 1 0 3 / 5 2 7`. `rampGlyph(a, x)` = level `round(9x)`.
- **SHAPE3** (body edges), all of EDGE3 and RAMP3 plus:
  - half fills: top `###/###/...`, bottom `.../###/###`, left `##./##./##.`, right `.##/.##/.##`;
  - corner triangles: `##./#../...` and its 3 rotations;
  - inverse corners: `###/###/##.`, `###/##./#..` and their rotations.
- **QUAD4 / RAMP4** (k = 4): 16 quadrant blocks (bit order TL, TR, BL, BR, as 2×2 dot blocks) and the 4×4 Bayer matrix `0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5`. Used by the L3 k = 4 variant and by Q.
- **FONT57:** ` . : - = + * # % / \ ○ ●` taken from `bitmapFont` (`bitmapFont.ts:30-43`), plus three glyphs defined locally in `glyphTiles.ts` so `bitmapFont` (and every golden that uses it) is untouched:
  - `|` = `00100` × 7;
  - `~` = `00000/00000/01000/10101/00010/00000/00000`;
  - lower-case `o` = `00000/00000/01110/10001/10001/01110/00000`.
- **Descriptors:** sample point (i, j) of 4×4 sits at glyph coordinate `((i + .5)·w/4, (j + .5)·h/4)`, and its coverage is the lit state of the pixel it falls in. `edgeOfTangent(tx, ty)`:
  - `|ty| < .41421356·|tx|` → `-`;
  - `|tx| < .41421356·|ty|` → `|`;
  - `tx·ty > 0` → `\`;
  - else `/`.

**Spine (`chain.ts`, argonaut).**
- n = 20 nodes, seg = L/19, maxBend = 0.16 rad per joint.
- Follow rule: `d = normalise(p[i] − p[i−1])`, with `d_prev` the previous segment's direction.
  - If `dot(d, d_prev) < cb`, set `d = rotate(d_prev, sign(cross(d_prev, d)) · maxBend)` using `cb = dcos(.16)` and `sb = dsin(.16)`.
  - Then `p[i] = p[i−1] + seg·d`.
- Only the head integrates motion.

**Body (`body.ts`).**
- **Koi:**

| Koi | Kind | L (cells) |
|---|---|---|
| 0 | kohaku | 56 |
| 1 | kohaku | 52 |
| 2 | sanke | 50 |
| 3 | kohaku | 48 |
| 4 | showa | 54 |
| 5 | tancho | 44 |

  halfWidth .11 L, so the widest point is 2 × 6.2 = 12.3 cells, about 3 tiles.
- **Fins:**
  - pectoral ellipses at s = .19, centre `v = ±(B + .45·b)`, semi-axes `a = .07L` (along), `b = .05L`, swept back 35°, flapping `±12°·beat`;
  - pelvic at s = .47, `a = .045L`, `b = .03L`.
- **Tail fan** for s ∈ [.86, 1.06]: half-width `1.6 + 4.4·((s − .86)/.2)` cells, minus a V notch `|v| < 3·((s − .96)/.1)` for s > .96.
- **Swim wave** (render-time, displaces nodes along their normals): the Videler carangiform envelope `A(s) = L(.02 − .0825 s + .1625 s²)`, 0.1 L at the tail, with `k = 2π/1.1` per body length.
- **Beat** (Strouhal):
  - `f = .3·U/(2·.1L) = 1.5·U/L` Hz: cruise 0.35 L/s → 0.53 Hz; burst 1.4 L/s → 2.1 Hz; startle 2.6 L/s → 3.9 Hz.
  - `phase += 2π f dt`, wrapped by subtracting 2π.
- **Burst and glide:**
  - burst 0.6–1.2 s (`beat → 1`, accel 0.9 L/s² toward 1.4 L/s);
  - glide 1.5–3.5 s (`beat ×= 1 − dt/0.6`, `U ×= 1 − dt/2.2`);
  - durations from `rngFor(seed, i, n)` at each transition.
- **Cover per card cell:**
  - forward-splat each of the 19 segments over its bbox (segment ± (B_max + fin));
  - project → `(s, v)`, keep the min `|v|`;
  - cover = 1 inside B(s), a fin or the tail, else 0. The tile's `sub16` = the cover of its 4×4 card cells.
- **Tile rule:**
  - cover ≥ .85 → interior (style A or B below, per the L1.0 ruling);
  - .2 ≤ cover < .85 → `matchTile(SHAPE3, sub16)`, lit pixels in the bright tone at .8;
  - cover < .2 → water shows.
- **Marking per tile:** `markingAt(markings[i], s, vn)` at the tile centre's `(s, vn)`. That is a LUT read; `fbm2` never runs per frame.
- **Interior shade** (both styles):
  - `vn = v/B(s)`, cylinder normal `n = (vn·side, √(1 − vn²))` in the body frame;
  - `shade = .35 + .65·max(0, n·L)`, with the fixed light `KOI_LIGHT = (−.45, −.55, .70)` normalised (a literal). L3.6 swaps in `sceneLight` only when `lightSrc = 1`.
- **Body style A (micro-glyph interiors).** The tile is stamped full: bg pixels in the bright tone, glyph pixels = `rampGlyph(RAMP3, .2 + .6(1 − shade))` in the dark tone. This is the "glyph darker on its own tile" look, in dots.
  - The red row uses **size contrast only** (D2): bg pixels `active` 1.0, glyph pixels `active` .6 (smaller dots), and where `shade < .5` the glyph pixels are empty (no dot).
  - If the owner admits `activeDim` (D2), the red glyph pixels become `activeDim` 1.0. Nothing else changes.

| Marking | Bright tone (bg pixels) | Dark (glyph pixels) |
|---|---|---|
| red | `active` 1.0 | `active` .6; empty where shade < .5 |
| white | `value` .8 | `idle` 1.0 |
| sumi | `mid` .8 | `faint` 1.0 |

- **Body style B (the fallback: lattice-4 interiors, glyphs on edges and water).** Fully specified, so that if the owner picks it at L1.0 it is a switch (`bodyStyle: 'lattice'`), not a redesign:
  - **Interior tiles** (cover ≥ .85, outside fins and tail): `putBig(r, tx, ty, tone, value)`. That is one dot per tile, emitted by `tileLayers` as a multi-tone `toneOf` layer with `lattice: 4, origin: [0, 11]`, exactly the tile grid `{ pitch 4, ox 0, oy 11 }`. The dot is 4× a card dot, and the sampler suppresses card dots under it (`src/engine/types.ts:51`).
  - **Tone** = the marking's bright tone (red `active`, white `value`, sumi `mid`). **Shading is dot size:** `value = 1.0` for shade ≥ .75, `.8` for ≥ .5, `.6` below. Red stays one colour; its darkest band is a smaller red dot.
  - **Edges** (.2 ≤ cover < .85): `matchTile(SHAPE3, sub16)` at card pitch, as in style A, so the silhouette keeps glyph detail.
  - **Fins and tail fan:** always card-pitch glyphs, even at cover ≥ .85: `rampGlyph(RAMP3, .5)` in the marking's bright tone at .8, so they read thinner than the body.
  - **Eyes:** the big dot is omitted at the eye tile, which shows `·` in `faint` at card pitch.
  - **Barbels, water, foam, shadows, pellets, pads:** unchanged glyphs. A pad tile over a koi clears that tile's big dot (`putGlyph` clears it).
  - **Flicker and depth** act on the big dot's value: one step down (1.0 → .8 → .6 → no dot).
  - **Cost:** the lattice layer is one 36 × 33 scan (≈ .05 ms), and interior tiles skip `matchTile`, so the frame is no slower than style A.
  - `FONT57` tiles (L3.4, 6×8 pitch) have no big dots. TYPE mode draws interiors as font glyphs.
- **Flicker:** about 3 % of interior tiles, `flickerOn(tx, ty, t, .03, .25, i·.37)` (STBN, the stateless half of advanced #12), go one ramp level darker (style A) or one value step down (style B). At 30 fps that is 1.7 % of interior tiles changing per frame. There is **no glyph hysteresis**: history-dependent glyph state would have to live in the `World` and be checkpointed, which breaks the memory gate (advanced #12 defers it to X1).
- **Eyes** at s = .06, vn = ±.55: the tile glyph becomes `·` in `faint`.
- **Barbels:** two 2-tile `edgeOfTangent` strokes off the snout in `mid`.
- **Depth z ∈ [0, 1]:**
  - values × (1 − .3z), snapped down to .6 or .8;
  - when z > .6: white → `idle`, and red stays `active` with its bg at .8 and its glyph pixels empty (size contrast, D2);
  - a `:` shadow tile in `faint` at a tile offset of `round((1 + 3z)/4, (1.5 + 3z)/4)`, drawn before the body.
- **Patterns (`koiPattern`), baked into each koi's 64 × 16 LUT at spawn.** Each LUT cell is evaluated once at `(s, vn)` = its centre:
  - **kohaku:** red where `fbm2(3.2s, 1.4vn + 11, 4, seed) > .12` and s ∈ [.06, .84]; fins always white;
  - **sanke:** kohaku plus sumi where `fbm2(7s, 3vn, 3, seed + 9) > .45` and s > .25;
  - **showa:** sumi where `fbm2(...) > .1`, red where the kohaku test passes, white the rest;
  - **tancho:** red only inside `((s − .08)/.05)² + (vn/.55)² < 1`.
  - **Cost:** 6 × 1,024 `fbm2` calls once at mount (≈ 1.4 ms at F0's 0.52 ms per 2,304 calls, memoised on `(kind, seed)`). The per-frame alternative, `fbm2` per interior cell, would cost ≈ .37 ms of the .4 ms body budget.
  - Memory: 6 KB, outside the world state.

**Behaviour (`steer.ts`).** Forces are in L/s², and `F = Σ wᵢ fᵢ`, clamped to `maxF = .9 L/s²`.

| Term | Weight | Parameters |
|---|---|---|
| wander | .6 | circle 0.8 L ahead, radius 0.35 L, `rate` .12 |
| contain | 2.5 | look-ahead 0.5 s, margin 0.35 L; L4 also feeds avoid boxes into the SDF |
| separate | 1.4 | radius 0.6 L, against other heads and their nearest spine node |
| align | .15 | within 1.2 L |
| seek food (arrive) | 1.2 | nearest floating pellet within 2.5 L, in front (`cos > −.2`); slow radius 0.3 L; eaten when the head is within 2.2 cells and z < .35 |
| curiosity | .8 | pointer inside the pond, not down, < 6 cells/s for ≥ 0.6 s: the 2 nearest koi within 2 L orbit at radius 0.5 L, 0.3 L/s |
| lure | 1.6 | pointer down ≥ 0.3 s: koi within 3 L arrive at radius 0.25 L |
| flee | — | via `startle` |

- **Turn caps:** cruise 1.4 rad/s, burst 2.5 rad/s, C-start 14 rad/s.
- **C-start** (startle):
  - triggers: pointer speed > 90 cells/s within 0.9 L of the head, or a tap within 0.7 L;
  - bend for 0.15 s to a heading `away ± (20° + 20°·hash)`, turned 90–130°;
  - then burst for 0.4 s at 2.6 L/s with beat 1, then glide;
  - refractory 1.5 s.
- **Dives:** every 8–20 s (hash), `zT ∈ [.15, .85]`, `z += (zT − z)·dt/2`. Surface kisses come from the schedule.

**Food.**
- Pellet states: off, falling, floating, eaten, sinking.
- A tap release drops `5 + ⌊3·hash⌋` pellets within 5 cells of the pointer, from height 1:
  - `vh −= 9.8·dt`, so a pellet lands in about 0.35 s and splats its ripple;
  - it floats with `curl2(x/40, y/40, .05t, seed)·1.5` cells/s for ≤ 14 s, then sinks over 1.5 s.
- Pellets are a ring buffer of 18.
- Glyphs:
  - floating: `o` in `value` 1.0;
  - falling: `·` drawn 1 tile above;
  - eaten: a burst of `*` → `+` → `.` over 0.4 s (render-time from age), in `value` then `mid`.

**State layout (`pond-koi`, one `Float32Array`, 3,178 floats = 12.7 KB).**

| Offset | Size | Content (D = discrete, never blended) |
|---|---|---|
| 0 | 16 | globals: 0 ptrStill s · 1 pressN (D, −1) · 2–3 press x/y · 4 lure (D) · 5–6 lure x/y · 7 pelletNext (D) · 8–15 spare |
| 16 + 16i | 16 × 6 | koi: 0–1 hx hy · 2 U · 3 z · 4 zT · 5 phase · 6 beat · 7 mode (D: cruise/burst/glide/bend/escape) · 8 modeLeft · 9 turnSign (D) · 10 refractory · 11 food (D) · 12 hunger · 13 gulp · 14 curious · 15 spare |
| 112 + 40i | 40 × 6 | spines: x[20], y[20] |
| 352 + 8p | 8 × 18 | pellets: x y h vh · state (D) · age · vx vy |
| 496 | 1,188 | ripple H (current) |
| 1,684 | 1,188 | ripple P (previous) |
| 2,872 | 306 | foam 18 × 17 |

**World settings.**
- `dt 1/30`, `lead 12`, `period 48`, `seam 3`, so lead + period = 1,800 steps, within `maxSteps 2400`.
- `every 120`, `maxCheckpoints 16`: one checkpoint per 4 s of loop.
  - The sim keeps a checkpoint at every multiple of `every` and at the loop start (`sim.ts:126`), and steps stay below lead + period = 1,800. That gives 0, 120, …, 1,680: 15 checkpoints, with the loop start (360) among them. That is within the 16 budgeted, so **nothing is evicted** once warm.
  - (`every 90` would keep 20 and evict through the LRU (`sim.ts:97-104`), costing replays on scrubs.)
- `idle 4`, `heal 2`, `maxLiveSteps 4`.
- `blend`: lerp the non-D floats, then renormalise `(hx, hy)` and rewrap `phase`.
- **Memory (total, the gated number):** checkpoints 16 × 12.7 KB ≈ **203 KB** budgeted (191 KB used), plus **6 working copies** (head, scratch, 3 views, live) × 12.7 KB ≈ 76 KB. **Total ≈ 280 KB.**
  - **Gate for `pond-koi`: ≤ 288 KB total**, the one card above the 256 KB default, and justified. The ripple planes are 75 % of the state (2 × 1,188 floats), and the koi is the board's lead card at 30 fps, where a scrub that replays from an evicted checkpoint is most visible.
  - The fallback is `every 150` (12 checkpoints, 18 × 12.7 ≈ 229 KB total), if the owner wants a flat 256 KB gate.
  - The marking LUTs (6 KB) and the tile raster (≈ 100 KB, one per card mount, not per checkpoint) are render scratch outside the world. The memory check reports them on their own line and does not gate them.
- **Pristine autopilot** (loop phase, §2):
  - food at 6 s (52, 70, ×6) and 30 s (96, 96, ×5);
  - surface kisses at 21 s and 46.5 s (koi 1 and 4), so a ring is on screen at t = 0;
  - no startles;
  - no pellets alive in [44 s, 48 s), so the seam only blends continuous creatures and water.

**Card `pond-koi`.**
- `label: '01  KOI'`, `fps: 30`, control label `'Feed the koi'`. The hint verb resolves to TAP (`meta.ts:61-65`); touch shows HOLD · DRAG for surfaces (UX-PLAN §10).
- Caption, top-right, faint: `MORNING`, `AFTERNOON`, `EVENING` or `NIGHT` from `hourOf(new Date())`. Golden time 09:41 gives `MORNING`.
- **Accent:** the red marking tiles only, in `active` only (no `activeDim`, D2). Pellets, water and pads are grey.
- **t = 0** (goldens, thumbnail, reduced motion): 6 koi spread over the pond, two crossing near the centre, one ring from the 46.5 s kiss, three pads, bank stones. No pellets.

| Input | Desktop (mouse/pen) | Touch (UX-PLAN §10) |
|---|---|---|
| Move over the pond | wake ripples behind the pointer; still for 0.6 s → curiosity | (a scroll; the card never sees it) |
| Fast flick (> 90 cells/s) | startles the koi it passes | horizontal flick after a claim: same |
| Press | ripple −1.2 at the point | tap, replayed as a 90 ms press: same |
| Release < 0.3 s after press | pellets + startle within 0.7 L | tap lift: pellets + nearby startle |
| Hold ≥ 0.3 s | lure (no pellets on release) | 300 ms hold engages the card (haptic, DONE): lure; dragging moves the lure |
| Enter / Space | pellets at the centre (kick) | — |

- **Blurb (meta.ts):** `'pond-koi': ['Six koi in a pond of glyph tiles: tap to feed them, hold still to lure them.', 'life koi water creature control animated']`.

**Worker bundle.** Pond cards are main-thread only: each card's layers function starts with `mainThread()` (the `physics.ts:36-37` pattern). The worker's registry path (`protocol.ts:10` → `src/widgets/index.ts`) would still bundle `boards/pond` and all of `life/` into `sampleWorker-*.js` (F0 notes this risk). So:
- `vite.config.ts` gets `worker: { plugins: () => [mainThreadOnly(['/boards/pond/index'])] }`. This is a 10-line `resolveId` plugin that, **in the worker build only**, maps the pond board module to `boards/pond/worker-stub.ts` (`export const pondBoard: WidgetPreset[] = []`, plus `pondSources = []` from L3.6).
- In the worker a pond id is then an unknown preset. The reply is an error, so the card samples on the main thread (`client.ts:60`), which is exactly what `mainThread()` gives physics cards today.
- Node scripts and the main app don't use the plugin and see the real module.
- **Check (in the size step):** after `vite build`, `grep -c "EDGE3" dist/assets/sampleWorker-*.js` = 0. `EDGE3` is the alphabet's name literal, which survives minification. The worker chunk's gz size before and after is recorded in the PR, with a gate of Δ ≤ 0.5 kB.

### L1 steps

| Step | Work (≤ ½ day each) | Checks (named in `scripts/life.ts` unless marked) | Done when |
|---|---|---|---|
| **L1.0** (½ d) | **Body-style prototype** (blocker B3). On a throwaway branch that is never merged, register two scratch presets: `proto-koi-glyph` (style A, micro-glyph interiors) and `proto-koi-lattice` (style B, lattice-4 interior dots, glyphs only on edges, fins and water). Each shows one koi at L = 56 on a still ripple-free pond. Use a hand-posed spine (a straight chain plus a static `waveAt` bend), the real `widthAt` profile and a hard-coded kohaku mask. No world, no `ripple`, no `glyphTiles` freeze. Render `pnpm snap proto-koi-glyph proto-koi-lattice --px 3 --out .snapshots/l1` and `pnpm snap --film proto-koi-lattice --t 0:2:0.25 --out .snapshots/l1` next to the quality-bar cards (level-03, afterlight, mosaic, components) | X-ray of both: no body interior drawn as a cluster of card dots in style B; style A's interior is a tile mosaic. Write a one-page note comparing them on readability at 1× and 2× and on how each reads against AGENTS.md's "never clusters of small dots" | **OWNER RULING** recorded in `docs/PROGRESS.md`: A or B. **Gate:** L1.3 does not start until the ruling exists. `putBig` and the lattice layer ship in L1.3 either way, so the API freeze doesn't depend on the outcome. Default if the owner defers: B (it satisfies the rule as written) |
| **L1.1** | Scaffold `src/engine/life/index.ts`, `scripts/life.ts` (`loadFactor` copied from `scripts/algorithms.ts:25-30`, self-run block). Register `src/engine/life/**` with **F0.9's determinism lint** (add the dir to its list if F0 keeps one; no second scan). `lifeChecks(assert)` goes into verify in the L1 integration commit (§6) | F0.9's `det: no engine-specific Math in deterministic dirs` covers `src/engine/life` (a scratch `Math.sin` under `life/` makes it fail; then remove it); `life: engine barrel does not re-export life` (grep `src/engine/index.ts`); `life: imports dmath from ../noise, never ../algo` (grep `src/engine/life`) | `npx tsx scripts/life.ts` passes; `npx tsc -b` clean |
| **L1.2** | `ripple.ts` | `life/ripple: a centred drop stays mirror-symmetric bit for bit (x, y, and diagonal)`; `life/ripple: wavefront speed ≤ 1/√2 cells/step + 1`; `life/ripple: energy decays monotonically after the drop leaves (window of 8 steps)`; `life/ripple: walls reflect (energy outside the mask = 0) and 10k steps of random splats stay finite`; `life/ripple: step of 36×33 ≤ .05 ms (median × load)`; `life/ripple: works on a non-pond grid (72×62, damp .985, an arbitrary mask: M2's pool shape)` | all pass; **API frozen** (doc comment "frozen at L1.2: M2's caustic pool consumes createRipple/rippleStep/rippleSplat/rippleGrad") |
| **L1.3** | *Starts after the L1.0 ruling.* `glyphTiles.ts`: `defineAlphabet`, the six alphabets, descriptors, `matchTile` + memo, edge snapping, `TileRaster` (with the big-dot plane), `putGlyph`, `putBig`, `flickerOn`, `tileLayers` (glyph layer + lattice layer), `glyphTileLayers` | `life/glyph: every glyph matches itself (matchTile(desc g) = g) in every alphabet`; `life/glyph: edgeOfTangent at 16 angles (k·22.5° + 3°) gives the expected - \ \| /`; `life/glyph: alphabet bitmaps pinned (FNV of every alphabet = constant)`; `life/glyph: a raster's layers sample to exactly its lit cells (count + tones), and a big dot hides its tile's card cells`; `life/glyph: matchTile memo ≥ 90 % hits on the koi card (after 60 frames)`; `life/glyph: flickerOn is pure in t and its on-share is within ±.5 % of share over 64² tiles`; `life/glyph: flicker budget: on a held field (frozen world state, t advancing at the card's fps), ≤ 2 % of tiles change per card frame over 120 frames`; `life/glyph: STBN table FNV pinned (Node)` | Q can import it; API frozen (doc comment "frozen at L1.3; L owns it; Q adds alphabets via defineAlphabet only") |
| **L1.4** | `chain.ts`: `createChain`, `chainFollow`, `createRope`, `ropeStep`, `fabrik` | `life/chain: lengths = seg ± 1e-4 and every joint ≤ maxBend + 1e-6 after 2,000 random head moves`; `life/chain: a straight pull leaves a straight chain`; `life/rope: pinned root fixed, lengths within 2 % after 600 steps with gravity + flow`; `life/fabrik: reaches a target within reach to .05 cells in ≤ 10 iterations, reports false outside reach` | all pass |
| **L1.5** | `body.ts`: `widthAt` (the `dpow` LUT), `waveAt`, `bodyRaster`, `koiPattern` (the 64×16 LUT bake), `markingAt`, `tailBeatHz` | `life/body: B(s) peaks at s ≈ .303 with half-width .11 L`; `life/body: the widthAt LUT is within 1e-4 of the analytic profile (Math.pow in the check only)`; `life/body: a straight unwaved body is symmetric in v and its area is within 3 % of ∫2B ds + fins + tail`; `life/body: tail amplitude = .1 L at beat 1, head ≤ .02 L`; `life/koi: LUTs deterministic per seed (FNV); kohaku red share 25–55 %, tancho one red component, fins white`; `life/koi: 6 LUT bakes ≤ 2 ms × load; markingAt never calls fbm2 (call counter)` | all pass |
| **L1.6** | `steer.ts`: Reynolds terms, `integrate` with turn cap, `startle` | `life/steer: 6 koi in the pond SDF for 10 simulated minutes (max sdf at the head < 0)`; `life/steer: turn rate ≤ cap + 1e-3 outside C-starts`; `life/steer: a C-start turns 90–130° in ≤ .16 s and peaks ≥ 2.4 L/s by .55 s`; `life/steer: cruise Strouhal f·2A/U ∈ [.27, .33]` | all pass |
| **L1.7** | `pond.ts` world (layout above, step order: input → autopilot → steer + integrate → chains → pellets → wake → `rippleStep` → foam); board module with `fps: 30` on `pond-koi` (needs F0.10 merged); the worker stub and `vite.config.ts` plugin. The manifest, registry, blurbs and group edits are **prepared as the L1 integration-queue commit** (§6), not committed on the feature branch | `pond: pristine is pure in t (0, 1.3, 7.7, 3600.2, any order, after a cold replay)`; `pond: seam: koi heads within .5 L of the loop start 1 step before the wrap; a dot diff at the wrap ≤ 15 % of dots`; `pond: total memory (checkpoints + 6 working copies) ≤ 288 KB after 2 loops + 20 random scrubs, and 0 evictions once warm`; `pond: 600 steps of violent random input stay finite (resets = 0)`; `pond: step ≤ .25 ms (median × load)`; size step: `vite build` + `scripts/site/size.ts --check` (first load unchanged), `grep -c "EDGE3" dist/assets/sampleWorker-*.js` = 0, and the `sampleWorker-*.js` gz delta ≤ 0.5 kB (recorded in the PR) | `tsc -b` clean; manifest/group verify checks pass; the manifest is a core file (AGENTS.md), so the **full suite runs once on the L1 integration commit** |
| **L1.8** | `drawKoiPond` + `pond/koi.ts` card: bank bake, water glyphs, foam, shadows, bodies in the ruled style (A or B), pellets, pads, caption; tune t = 0 | `pond-koi: t = 0 shows 6 koi, ≥ 1 ring, 3 pads, no pellets`; `pond: one accent: the only chromatic colour is dotActive (no dotActiveDim until the owner rules, D2), and red only inside koi cover`; `pond-koi: frame (layers + sample) ≤ 4 ms median warm × load` (pattern `scripts/algorithms.ts:139-145`); `pond-koi: glyph matching ≤ .3 ms per frame`; style B only: `pond-koi: no interior tile emits card-pitch dots (lattice layer only)` | `pnpm golden --check` lists **only** `added pond-koi`, then `pnpm golden` (in the integration commit); `pnpm snap` matches the visual intent and the L1.0 prototype |
| **L1.9** | Interaction (table above), `pondProbe` read-outs, `scripts/life-browser.ts`, meta blurb and tags, `npx tsx scripts/widgets/ids.ts --assign`, `docs/LIFE.md` | `pond-koi: a tap drops 5–7 pellets that land with ripples, startles koi within .7 L, and heals to pristine 6 s later (frame = pristine frame)`; `pond-koi: hold 1.2 s → ≥ 3 koi within 1 L of the lure, no pellets`; `pond-koi: a 120 cells/s flick startles the koi it passes`; `pond-koi: live frame with a moving pointer ≤ 4 ms × load`. Browser probe (`life-browser`): desktop hover → `mode = live`, click → pellets, 7 s idle → `pristine`; touch 375×812: vertical swipe starting on the card scrolls ≥ 150 px and the world stays pristine, tap → pellets, 300 ms hold → `data-engaged` + lure, page never scrolls during an engaged drag; `Chrome state hash at step 1440 = Node hash` | ids check passes; probe green |
| **L1.10** | Taste pass against daoho (side-by-side snapshots in `.snapshots/l1/`); phone perf pass at 4× CPU throttle | `life-browser: pond-koi median card draw ≤ 16 ms at 4× throttle` | owner sign-off on the look |
| **L1.11** (¼ d) | **Docs and registry at merge**, as the L1 integration-queue commit (§6): manifest/registry/board blurb; `ids --assign` + `meta.ts` blurb and tags for `pond-koi`; `goldens/hashes.json` (added keys only); `DESIGN.md` (a `pond-koi` 30 fps row under F0.10's per-card fps section, plus pond tokens if any were added; none are planned); `docs/README.md` (the LIFE.md row); `docs/PROGRESS.md`; `CHANGELOG.md`; an `upcoming` row in `src/changelog.ts:142` for L2; `scripts/life-browser.ts` wired into the browser-probe list | `idsChecks` green; `pnpm golden --check` = `added pond-koi` only; full suite (manifest is core) | merged in queue order L1 → Q1 → M1 |

**Order and parallelism:**
- L1.0 first. L1.2, L1.4 and L1.6 don't depend on the ruling and can run while the owner decides.
- L1.3 waits for the L1.0 ruling. After that, L1.2, L1.3, L1.4 and L1.6 are independent and can run as parallel agents.
- L1.5 needs L1.4. L1.7 needs L1.2, L1.4–L1.6 and F0.10. L1.8 needs L1.3 and L1.7. L1.9 needs L1.8. L1.11 comes last.

**Estimate:** 5–5.5 days serial (L1.0 adds ½ d, L1.11 ¼ d, the STBN flicker and big-dot plane ¼ d; the fps work moved to F0.10, −¼ d). About 3.5 days with two agents, plus the owner's turnaround on the L1.0 ruling.

**Perf budget (L1).**

| Part | Budget |
|---|---|
| step | koi ≤ .05 ms, ripple ≤ .05 ms, foam and pellets ≤ .02 ms |
| render | body raster (6 koi, marking LUT reads) ≤ .4 ms, water tiles ≤ .2 ms, glyph matching ≤ .3 ms, style B lattice layer ≤ .05 ms; marking LUT bake ≈ 1.4 ms **once per mount** |
| sampler | one 144 × 132 multi-tone scan ≈ 1–1.5 ms |
| **total** | **≤ 4 ms** median warm in Node × load |

Measured three ways:
- by `scripts/life.ts`, which prints a per-part split using `performance.now()` around each stage of one frame;
- by the browser probe, at 4× CPU throttle (`Emulation.setCPUThrottlingRate`) with ≤ 16 ms per card draw;
- through an in-page `__pond.bench()` hook. It is exposed only with `?probe=1`.

---

## Phase L2: ecosystems

**Goal:** five more scenes on the same machinery, each a different published algorithm drawn in glyph tiles, each with one accent role:
- `pond-jelly`
- `pond-slime`
- `pond-fireflies`
- `pond-murmur`
- `pond-terrarium`

**Deliverables:**
- engine: `src/engine/life/agents.ts`, `oscillators.ts`, `grow.ts`, and `flock` added to `steer.ts`;
- cards: `src/widgets/boards/pond/{jelly,slime,fireflies,murmur,terrarium}.ts`;
- the matching checks in `scripts/life.ts`;
- 10 new golden keys, 5 uids, 5 blurbs with tags. These and the other registry and doc edits land in the L2 integration-queue commit (L2.9, §6).

### L2 API

```ts
// ── agents.ts ── Jones (2010) physarum and a two-pheromone ant colony
export interface PhysarumSpec {
  w: number; h: number; agents: number; seed: number
  /** Sensor angle and rotation angle in 1/256 turns (22.5° = 16, 45° = 32); sensor offset and step in lattice cells. */
  sa?: number; ra?: number; so?: number; ss?: number
  deposit?: number; decay?: number /* fraction per step */; mask?: Uint8Array
}
export interface Physarum extends Required<Omit<PhysarumSpec, 'mask'>> { T: number /* trail plane */; AX: number; AY: number; AH: number /* agent planes; heading = 0..255 */; size: number; cos: Float64Array; sin: Float64Array /* 256-entry dsin tables */ }
export function createPhysarum(spec: PhysarumSpec, offset?: number): Physarum
export function physarumInit(p: Physarum, s: Float32Array): void
/** Sense (3 sensors) → rotate → move → deposit, agents in index order from a rotating start (n·7919 mod N); then 3×3 mean diffuse + decay. `food` cells add `foodDeposit`. */
export function physarumStep(p: Physarum, s: Float32Array, n: number, food?: ArrayLike<number> /* x y r triples */, foodDeposit?: number, repel?: [number, number, number]): void
export interface AntsSpec { w: number; h: number; ants: number; nest: [number, number]; seed: number; evaporate?: number; diffuseEvery?: number }
export interface Ants { HOME: number; FOOD: number; A: number /* x y heading carrying since */; size: number }
export function createAnts(spec: AntsSpec, offset?: number): Ants
/** Searching ants follow FOOD and lay HOME; carrying ants follow HOME and lay FOOD; deposit = 1 − since/600 (≥ 0); crumbs in state lose 1 per pickup. */
export function antsStep(a: Ants, s: Float32Array, n: number, crumbs: Float32Array /* x y amount per crumb, in state */): void

// ── oscillators.ts ── Kuramoto and Mirollo–Strogatz pulse coupling
/** dθᵢ = ωᵢ + (K/|Nᵢ|)·Σ dsin(θⱼ − θᵢ), explicit Euler, θ wrapped to [0, 2π). */
export function kuramotoStep(theta: Float32Array, omega: Float32Array, k: number, neighbours: (i: number, visit: (j: number) => void) => void, dt: number): void
/** Order parameter r = |Σ e^{iθ}|/N (checks). */
export function kuramotoOrder(theta: ArrayLike<number>): number
export interface PulseSpec { n: number; period: number | Float32Array; eps: number; refractory: number; radius: number }
/**
 * Mirollo–Strogatz with local coupling: φ += dt/Tᵢ; φ ≥ 1 fires (φ ← 0); each firing kicks neighbours within
 * `radius` by x = f(φ) + ε with f(φ) = 1 − (1 − φ)² (concave, exact inverse 1 − √(1 − x)); x ≥ 1 fires in the
 * same step (absorption). Synchronous rounds (≤ 4) so the result is independent of index order. Returns the fire count.
 */
export function pulseStep(phase: Float32Array, fired: Float32Array /* step of last fire */, pos: Float32Array, hash: SpatialHash, spec: PulseSpec, n: number, dt: number): number

// ── grow.ts ── Runions space colonisation and L-systems that emit dot sites
export interface ColonySpec {
  seed: number; root: [number, number][]; attractors: [number, number][]
  influence: number /* di */; kill: number /* dk */; step: number /* D */; tropism?: [number, number, number] /* x y weight */
  maxNodes: number; maxIterations: number
}
export interface Colony { x: Float32Array; y: Float32Array; parent: Int32Array; born: Uint16Array /* iteration */; thickness: Float32Array /* pipe model */; count: number; iterations: number }
/** Grow to completion once, keeping the birth iteration of every node (the history scrubs by iteration). Cached by spec key. */
export function colonise(spec: ColonySpec): Colony
export interface LSystem { axiom: string; rules: Record<string, string | [string, number][] /* stochastic: [successor, weight] */>; generations: number; seed: number }
export function lsystem(l: LSystem): string
/** Turtle: F draw, f move, + − turn, [ ] push/pop, ! thinner; emits sites spaced `spacing` along strokes with depth. */
export function turtleSites(str: string, o: { x: number; y: number; heading: number; angle: number; step: number; spacing: number; shrink?: number }): { x: Float32Array; y: Float32Array; depth: Uint8Array; count: number }

// ── steer.ts additions ──
/** Boids (Reynolds 1987) over a SpatialHash: separation within `sep`, alignment and cohesion over the k nearest (topological, Ballerini 2008) or within `radius` (metric). k-nearest by insertion sort on (d², index). */
export function flock(s: Float32Array, n: number, planes: { X: number; Y: number; VX: number; VY: number }, hash: SpatialHash, o: { k?: number; radius?: number; sep: number; wSep: number; wAli: number; wCoh: number }, out: Float32Array /* 2n */): void
/** Nearest-k neighbour indices per agent (reused by the agitation wave). */
export function kNearest(s: Float32Array, n: number, X: number, Y: number, hash: SpatialHash, k: number, out: Int32Array /* n·k */): void
```

### L2 cards

**Shared:** every card uses the tile grid `{36, 33, 4, 0, 11}` unless noted, the `tile` shell and a surface control. Each is a `World` with a `seam`, listed in the memory table at the end of L2.

#### `pond-jelly` (`02  JELLY`, fps 20)
- **Model:** three Aurelia-style moon jellies in side view.
- **Bell:** analytic superellipse `|b/R|^2.4 + |a/H|^2.4 ≤ 1` for `a ≥ −.15H`, in the bell frame (`a` along the swim axis), with `R0` 13/11/9 cells and `H0 = .8R0`.
- **Contraction cycle** φ ∈ [0, 1), period 1.8/2.1/2.4 s:
  - contraction for φ < .3: `c = s²(3 − 2s)`, s = φ/.3;
  - refill otherwise: `c = 1 − σ((φ − .3)/.7)` with σ the same smoothstep.
  - Shape: `R = R0(1 − .3c)`, `H = H0(1 + .15c)`.
- **Thrust and drag:** thrust `= 26·max(0, ċ)` cells/s² along the axis; drag `−.9v`; sink 0.6 cells/s.
- **Turning:** the axis turns toward the wander heading at ≤ .4 rad/s.
- **Phase coupling:** Kuramoto across the three jellies with K = .25, so they drift into loose sync.
- **Tentacles:** 8 ropes × 10 nodes (seg 2.2) pinned on the rim, drag .1, current flow.
- **Oral arms:** 4 ropes × 8 nodes (seg 1.8), frilled at render with a `±1` cell offset from `dsin(3i + 2t)`.
- **Marine snow:** 70 render-time motes, `y = (y₀ + 4t) mod 132`, `x = x₀ + 3·noise2(.2t, i)`, drawn as `·` in `faint`.
- **Current:** `curl2(x/50, y/50, .03t, seed)·2` cells/s plus a 12×12 push grid in state (`+= .3·v_ptr·falloff`, `×= .96`).
- **Drawing:**
  - bell interior `rampGlyph(RAMP3, .15 + .35·rim)` in `mid`, where `rim = 1 − edge distance/3` (Fresnel-like);
  - rim tiles from `matchTile(SHAPE3)` in `value`;
  - tentacles `edgeOfTangent` in `faint`/`mid`.
- **Accent:** two gonad horseshoe arcs per bell (centre `a = .1H`, `b = ±.35R`, r = .22R), drawn with `edgeOfTangent` in `active`.
- **t = 0:** one bell mid-contraction, the others refilling, with trailing tentacles curved.
- **Input:**
  - desktop: the cursor's motion pushes the current; a click makes all three pulse now (`φ ← 0`);
  - touch: tap = pulse; hold-drag (engaged) pushes the current.
- **Memory:** state ≈ 1,580 floats (6.3 KB).
- **Blurb:** `['Three moon jellies pulse, coast and trail their tentacles; tap and they all pulse.', 'life jellyfish rope creature control animated']`.

#### `pond-slime` (`03  SLIME`, fps 15)
- **Model:** physarum on a **lattice-3** trail grid of 48 × 44 (48 × 3 = 144 columns, 44 × 3 = 132 rows = card rows 11–142). It is shown through the standard 36 × 33 tile grid. Each tile samples the trail bilinearly at its 4 × 4 card-cell centres (`sub16`).
  - *Changed from lattice 2 / 2,400 agents:* that state (48 KB) plus its 6 working copies alone came to 288 KB, over the total-memory gate.
- **Parameters** (Jones' network regime, scaled to this grid; agent density 57 % of lattice cells, as before):

| Parameter | Value |
|---|---|
| agents | 1,200 |
| SA | 22.5° (16) |
| RA | 45° (32) |
| SO | 4 lattice cells (12 card cells, the same physical reach as before) |
| SS | 1 lattice cell/step |
| deposit | 5 |
| decay | .1 per step, after the 3×3 mean diffuse |
| dt | 1/15 |
| food deposit | 10 per step per food cell (r 1 lattice cell) |

- **Rules:**
  - a random turn when both side sensors beat the front (`ihash(seed, i, n) & 1` picks the side);
  - out of bounds or off the mask → a new heading `ihash(seed, i, n + 7919) & 255`.
- **Drawing:**
  - display value = `log(1 + T)/log(1 + 40)`, clamped (render-only, in the card, outside the lint's dirs);
  - each tile builds a structure tensor over the 3 × 3 trail cells around its centre;
  - coherence > .4 → `edgeOfGradient` (veins drawn along their direction), else `rampGlyph(RAMP3, v)`;
  - tones by v: faint < .35 ≤ mid < .6 ≤ idle < .85 ≤ value.
- **Food:** up to 8 food dots in state (x, y, on), drawn as `T.dotDisc` sites at size 1.6 in `active`. This is the accent.
- **Pristine schedule** (period 40 s, lead 20 s): 5 foods; a 6th added at phase 14 s and removed at 30 s, so the network re-routes and heals.
- **t = 0:** a formed network joining 5 red food dots.
- **Input:**
  - click or tap: toggle a food at the pointer (remove if one is within 4 cells, else add; at most 8);
  - L3 adds hold = salt (repel), via `repel = [x, y, 10]`.
- **Memory:** state 2,112 + 3,600 + 24 floats = 5,736 floats = **22.9 KB**.
  - `every 300`, `maxCheckpoints 4`. The steps run over [300, 900), so the checkpoints are 0, 300 (the loop start) and 600: 3 used, nothing evicted.
  - Total: 4 × 22.9 (budgeted) + 6 working copies × 22.9 ≈ **229 KB** (≤ 256 KB gate).
  - A cold scrub replays ≤ 299 steps × ≤ .45 ms, about 0.13 s once, spread over frames by `maxSteps` (sim.ts:36).
- **Blurb:** `['Slime mould agents find the shortest network between food; tap to move the food.', 'life physarum agents network control animated']`.

#### `pond-fireflies` (`04  FIREFLIES`, fps 20)
- **Model:** a meadow at night, always night inside the card. Sky brightness follows the hour: faint stars at night, none by day.
- **Grass silhouette:** baked once from `lsystem({ axiom: 'X', rules: { X: [['F[+X]F[-X]+X', .5], ['F[-X]F[+X]-X', .5]], F: 'FF' }, generations: 4 })`, with `turtleSites` at angle 22°, step 1.2, spacing 1. The sites are rasterised as `edgeOfTangent` tiles in `faint` along the bottom 26 rows.
- **Flies:** 160, in a meadow SDF rows 16–112, drifting at `curl2·3` cells/s.
- **Pulse coupling** (`pulseStep`):
  - `period 1.0·(1 ± .08 hash)` s, `eps .07`, `refractory .12`, `radius 22`;
  - spatial hash with cell 22 (`createHash`, particles.ts:20).
- **Pristine schedule** (period 40 s, lead 25 s, so the flies are synced at t = 0): every 20 s a "gust" scrambles phases in a 30-cell patch at phase −2 s, so a re-sync wave crosses the card at t = 0.
- **Flash:**

| Age | Glyph | Tone |
|---|---|---|
| < .07 s | `●`-like `o` + centre | `active` 1.0 |
| < .2 s | `·` | `active` .6 (a smaller red dot: size contrast, D2; `activeDim` only if the owner rules it in) |
| after that | `·` | `faint` (or nothing) |

- **Accent:** the flash (overview decision; the L3 taste pass may swap to a white flash with red only on the wave front).
- **Seam blend:** wrapped phase difference, `φ += wrap(φ_b − φ_a)·k`.
- **Input:**
  - desktop hover: a moving pointer scrambles phases within 20 cells every 0.25 s (desync);
  - click or tap: a burst, so every fly within 30 cells fires now and seeds a re-sync wave;
  - L3 adds hold = a lantern: the finger flashes at 1 Hz and entrains nearby flies.
- **Memory:** 160 × 5 floats = 3.2 KB.
- **Blurb:** `['Fireflies fall into step flash by flash; tap to set off a new wave.', 'life fireflies sync oscillators control animated']`.

#### `pond-murmur` (`05  MURMUR`, fps 24)
- **Model:** 400 starlings.
- **Flocking:**
  - topological k = 7 for alignment (w 1.0) and cohesion (w .6);
  - separation within 3 cells (w 2.0);
  - contain with a soft ellipse SDF inset 14 (look-ahead .4 s, w 1.5);
  - speed 22–38 cells/s, turn cap 4 rad/s, wander w .2.
- **Falcon:**
  - pristine: a pure-in-t Lissajous, `x = 72 + 60·dsin(2πt/20)`, `y = 72 + 40·dsin(4πt/20 + 1)`;
  - birds within 22 cells flee (w 3.5).
- **Agitation wave** (after Procaccini et al. 2019): `aᵢ ← max(.9aᵢ, .88·max_{j∈7NN} aⱼ, flee ? 1 : 0)`, so the wave crosses about one neighbour per step.
- **Drawing:**
  - a tile with ≥ 1 bird shows `edgeOfTangent` of the mean velocity: a sheet of dashes that rotates with the flock;
  - tone by count (1 mid, 2 idle, ≥ 3 value);
  - a > .5 → `x`, so a dark band runs through the flock.
- **Accent:** the falcon, a 3-tile chevron (`\` `·` `/`) in `active`.
- **t = 0:** a folded sheet mid-turn with the falcon at the edge.
- **Input:**
  - desktop: the cursor is the falcon while it moves; a click is a swoop (a 0.8 s dive through the flock centroid);
  - touch: tap = swoop at the tap point; hold-drag (engaged) = the falcon follows the finger.
- **Memory:** 400 × 5 + 8 floats = 8 KB.
- **Blurb:** `['A murmuration of 400 starlings, each watching its seven nearest; the falcon is you.', 'life boids flocking murmuration control animated']`.

#### `pond-terrarium` (`06  TERRARIUM`, fps 12)
- **Model:** a top-down floor with three parts:
  - stones: a baked `voronoi2` RAMP in `faint`;
  - a nest hole at (34, 116);
  - a creeper grown by `colonise`.
- **Creeper parameters:**
  - root (12, 20);
  - 500 attractors, rejection-sampled with density ∝ light on the floor (the lit side comes from `sunAt(hour)` azimuth, material.ts:253);
  - `di 16`, `dk 2.5`, `D 1.5`, tropism toward the sun `w .2`, ≤ 700 nodes.
  - It is cached per hour bucket (24 keys, LRU 2), with a cold build ≤ 60 ms.
- **Display:**
  - a 90 s cycle: nodes with `born ≤ 35 % → 100 %` of iterations over 80 s, then pruned back newest-first over 10 s;
  - offset so t = 0 shows 95 %;
  - pipe-model thickness `dpow(descendants, 1/2.5)`, computed once per node inside the cached `colonise` history (a LUT over descendant counts would work as well);
  - tips `edgeOfTangent`, older branches `rampGlyph` by thickness.
- **Accent:** nodes born within the last 1 s of display, in `active`.
- **Ants** (World):
  - 90 ants on a 48 × 44 lattice-3 pheromone pair;
  - evaporate .006/step, diffuse every 4 steps;
  - 3 crumbs of 40 bites in state.
  - Ants are sites at size 1 (carrying: plus a `value` crumb dot); trails `rampGlyph` in `faint`.
- **t = 0:** a lush creeper with red tips, and two ant trails to 2 crumbs.
- **Input:**
  - click or tap: drop a crumb (amount 40, ≤ 5);
  - hold: a lamp, so tones brighten within 24 cells (render) and ants avoid it (steer).
- **Memory:** 4,224 + 450 + 15 floats = 4,689 floats = 18.8 KB.
  - `every 150`, `maxCheckpoints 7`. The steps run over [150, 1,050), so the checkpoints are 0, 150 (the loop start), …, 900: 7, nothing evicted.
  - Total: 7 × 18.8 + 6 × 18.8 ≈ **244 KB** (≤ 256 KB gate). The old `75 / 12` came to 338 KB with the working copies.
  - The plant is a cached history, not state, so it costs no checkpoint memory.
- **Blurb:** `['A creeper grows toward the sun as ants lay trails to crumbs; tap to drop a crumb.', 'life ants growth colonisation control animated']`.

**Memory and loop table (L1 + L2).**
- **Gate: total memory per card** = (maxCheckpoints + 6 working copies) × state ≤ **256 KB**. The one exception is `pond-koi` at ≤ 288 KB (justified in L1 "World settings").
- `maxCheckpoints` is set to the number of checkpoints the loop actually keeps: the multiples of `every` below lead + period, plus the loop start (`sim.ts:126`). So nothing is evicted once warm.

| Card | dt | lead / period / seam | state | every / max checkpoints | checkpoints | working copies (6×) | **total** | gate |
|---|---|---|---|---|---|---|---|---|
| koi | 1/30 | 12 / 48 / 3 | 12.7 KB | 120 / 16 (15 used) | 203 KB | 76 KB | **280 KB** | 288 KB |
| jelly | 1/30 | 6 / 40 / 3 | 6.3 KB | 60 / 23 | 145 KB | 38 KB | **183 KB** | 256 KB |
| slime | 1/15 | 20 / 40 / 3 | 22.9 KB | 300 / 4 (3 used) | 92 KB | 138 KB | **229 KB** | 256 KB |
| fireflies | 1/30 | 25 / 40 / 3 | 3.2 KB | 75 / 26 (the loop start 750 = 10 × 75) | 83 KB | 19 KB | **102 KB** | 256 KB |
| murmur | 1/30 | 8 / 40 / 3 | 8.0 KB | 60 / 24 | 193 KB | 48 KB | **241 KB** | 256 KB |
| terrarium | 1/15 | 10 / 60 / 3 | 18.8 KB | 150 / 7 | 131 KB | 113 KB | **244 KB** | 256 KB |

- Board total ≈ 1.28 MB if all six cards are mounted and warm. Gate: `pond board: Σ total ≤ 1.4 MB`.
- All rows keep lead + period ≤ `maxSteps` (sim.ts:11): every card passes `maxSteps: (lead + period)/dt + 60`.

### L2 steps

| Step | Work | Checks | Done when |
|---|---|---|---|
| **L2.1** | `agents.ts` physarum | `life/physarum: deterministic (fresh runs bit-equal after 300 steps)`; `life/physarum: agents stay in bounds / mask`; `life/physarum: two food dots end connected (a trail path ≥ .2 between them, BFS on the lattice)`; `life/physarum: step ≤ .45 ms × load (1,200 agents, 48 × 44)` | pass |
| **L2.2** | `pond-slime` card | `pond-slime: t = 0 network joins the 5 foods`; `pond-slime: red only on food`; `pond-slime: tap toggles food, heals`; frame ≤ 4 ms; `total memory (checkpoints + 6 working copies) ≤ 256 KB, 0 evictions once warm` | golden added (in the integration commit) |
| **L2.3** | `oscillators.ts` | `life/kuramoto: r → > .95 for K = 2 on all-to-all, stays < .3 for K = 0`; `life/pulse: 50 globally coupled MS oscillators synchronise within 30 periods (Mirollo–Strogatz theorem)`; `life/pulse: result independent of index order (shuffle → same fires)` | pass |
| **L2.4** | `grow.ts` (colonise, lsystem, turtleSites) | `life/colonise: deterministic; no node within dk of a live attractor at the end; every node's parent is D away ± 1e-4`; `life/lsystem: known string for the fractal-plant rules at gen 3 (ABOP fig 1.24)`; `life/colonise: cold build ≤ 60 ms × load` | pass |
| **L2.5** | `pond-fireflies` | `pond-fireflies: t = 0 shows a flash wave (5–40 % flies in active)`; `red only on flashing flies`; `tap → ≥ 80 % of flies within 30 cells fire within 2 steps`; frame ≤ 4 ms | golden added |
| **L2.6** | `flock` + `kNearest` + `pond-murmur` | `life/flock: k-nearest equals brute force on 400 birds`; `pond-murmur: no bird leaves the card in 10 min`; `agitation front travels ≥ 3 neighbours in 3 steps`; `red only on the falcon`; frame ≤ 4 ms | golden added |
| **L2.7** | `agents.ts` ants + `pond-terrarium` | `life/ants: ≥ 1 trail forms to a crumb within 30 s; crumb amount only decreases`; `pond-terrarium: red only on newest growth`; frame ≤ 4 ms; total memory ≤ 256 KB | golden added |
| **L2.8** | `pond-jelly` (rope, Kuramoto); board assembly; `fps` set per card (jelly 20, slime 15, fireflies 20, murmur 24, terrarium 12; F0.10) | `pond-jelly: bells stay on the card; thrust only during contraction (ċ > 0)`; `red only on gonads`; `pond board: every card pure in t, t = 0 deterministic, one accent (dotActive only, no dotActiveDim), ≤ 4 ms, total memory per the table (koi ≤ 288 KB, the rest ≤ 256 KB), Σ ≤ 1.4 MB`; size step: `vite build` + `size.ts --check` unchanged (board is lazy), `grep -c "EDGE3" dist/assets/sampleWorker-*.js` = 0, worker chunk gz Δ ≤ 0.5 kB vs L1 | all pass on the branch |
| **L2.9** (¼ d) | **Docs and registry at merge**, as the L2 integration-queue commit (§6, order L2 → M2 → Q2): `ids --assign` + `meta.ts` blurbs and tags for the 5 cards; `goldens/hashes.json` (10 added keys); `DESIGN.md` per-card fps rows under F0.10's section (and pond tokens if any); `docs/README.md`; `docs/PROGRESS.md`; `CHANGELOG.md`; `src/changelog.ts` `upcoming` rows (L2 done, L3 next); `scripts/life-browser.ts` extended to the new cards' smoke checks; full-suite run | `pnpm check`, `pnpm golden --check` (only `added pond-*`), `idsChecks`, the browser probes | merged |

**Parallelism:**
- L2.1–L2.2, L2.3 → L2.5, L2.4 and L2.6 are independent tracks.
- L2.7 needs L2.4. L2.5 uses the L-system grass from L2.4 (stub with a static field until it lands).

**Estimate:** 4.25–5.25 days serial (L2.9 adds ¼ d; the slime change to lattice 3 is neutral), about 2.75 with three agents.

---

## Phase L3: polish and interaction depth

**Goal:** the pond feels alive past the first tap, survives a phone, and degrades well.

| Step | Work | Checks | Done when |
|---|---|---|---|
| **L3.1** | **Feeding depth:** koi `hunger` rises .02/s and drops .35 per pellet; sated koi (< .2) ignore food. A gulp is a head size pulse `+1` cell for .3 s. A burst also adds a tiny ripple. A koi that misses a pellet circles back once (arrive with a slow radius) | `pond-koi: 18 pellets in 10 s are all eaten or sink, none stuck`; `sated koi ignore food` | taste |
| **L3.2** | **Startle depth:** contagion (a startled koi startles neighbours within .5 L after 80 ms, once per refractory); flick threshold tuned on real mouse traces; the hover wake fades with speed | `pond-koi: a single tap's startle cascade reaches ≤ 3 koi` | taste |
| **L3.3** | **Day/night by hour** (render-only, so the World is untouched): <ul><li>`pond-koi` at night (20–06): water twinkle ×2, a moon reflection (a wobbling vertical column of `value` `-` tiles, displaced by `∇h`), koi whites down to `idle`/`mid`, red unchanged;</li><li>dusk and dawn ramps;</li><li>the terrarium sun arc via `sunAt`;</li><li>the fireflies' sky stars.</li></ul> | `pond: frames at frozen 03:00 and 21:00 render, keep one accent, and differ from 09:41`; goldens stay at 09:41 (`freezeWallClock`, scripts/lib/freeze.ts) | — |
| **L3.4** | **Glyph style toggle:** a `segmented` control in the label row (box `[104, 0, 40, 9]`, options DOTS / TYPE) switches pond-koi to `FONT57` tiles (`{24, 16, pitch 6×8}`; the font grid is rectangular, so `TileGrid` gains an optional `pitchY`), same scene. Default DOTS | `pond-koi: TYPE frame ≤ 4 ms; red only on koi`; golden unchanged (defaults) | owner picks the default |
| **L3.5** | **Reduced motion and touch polish:**<ul><li>under `ctx.reducedMotion` no input reaches a world (still t = 0, which DotCanvas already holds still, `DotCanvas.tsx:157,169`);</li><li>the phone fps tier is **F0.10's** (L only checks that pond cards obey it; no DotWidget edit here);</li><li>the probe extends to all six cards.</li></ul> | `life-browser: on all 6 cards, a vertical swipe scrolls ≥ 150 px with the world pristine; tap acts; hold engages`; `reduced motion: no frame change after 2 s and after a tap`; `life-browser: on (pointer: coarse) each pond card draws at F0.10's phone tier` | probe green at 375 and 390 px |
| **L3.6** | **Tilt and light** (F0 hub). There is no `data.light`.<ul><li>**Keys:** `pond-koi`'s `defaults` gain `lightSrc: 0, lightAz: 0, lightEl: 7, tx: 0, ty: 0`. The board exports `pondSources = [lightSource]`, and both the manifest entry (`({ items: m.pondBoard, sources: m.pondSources })`) and the eager registry (`pond: { items: pondBoard, sources: pondSources }`) add it in the L3 integration commit (§6). `gx`/`gy` (gravity) are not read: they are for physics only.</li><li>**Water tilt:** a new helper `rippleTilt(r, s, tx, ty, k)` in `ripple.ts`. `rippleStep` is untouched, because M2's caustic pool depends on its API. The helper adds the forcing `−k·(tx·(x − cx) + ty·(y − cy))` to plane P over water cells, so the surface settles toward a tilted plane and sloshes off the walls. It returns at once when `tx = ty = 0`. The pond step calls it right after `rippleStep`. Tilt reaches the step through the World's generic tilt channel: the pond world sets `gravity: [0, 0]` and the card passes `(data.tx, data.ty)` as `FrameInput.gx/gy` (`world.ts:45-50`; not to be confused with the hub's gravity keys). A non-zero tilt forks a live world (`world.ts:154-158`), so the pristine run never sees it, and the hub publishes exactly 0 at rest. Pellets drift downhill in the live world; pads drift render-time by `+3·(tx, ty)` cells.</li><li>**Koi light:** `lightSrc === 1` → `sceneLight({ pointer: null, data, hour })`, i.e. tilt light by bucket. Otherwise the L1 literal `KOI_LIGHT`, **not** the clock's sun, so default frames don't move.</li></ul> | `life/ripple: rippleTilt(…, 0, 0, k) leaves the state bit-identical; rippleStep's signature and output unchanged (FNV of a 600-step run = the L1.2 value)`; `pond-koi: with tx = ty = 0 and lightSrc 0 (the defaults), frames equal the L2 frames bit for bit (golden-safe) and the world stays pristine`; `pond-koi: tx = .3 forks live and heals after the tilt returns to 0`; `pond-koi: lightSrc 1 moves the koi shading, keeps one accent` | goldens unchanged |
| **L3.7** | **Slime hold = salt, fireflies hold = lantern, terrarium hold = lamp** (as specified in L2). Write the sound decision (D6) into `docs/LIFE.md`: out for L1–L3, with bubble acoustics (advanced #6) listed as an owner decision for XL | interaction checks per card | — |
| **L3.8** (¼ d) | **Docs and registry at merge** (L3 integration commit, §6): the manifest and registry `sources` edits; `DESIGN.md` (the pond's light keys and the TYPE glyph toggle, under F0's Light section); `docs/README.md`, `docs/PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` `upcoming` rows; `scripts/life-browser.ts` final form (six cards, coarse-pointer tier) | full suite (manifest is core); goldens unchanged | merged |

**Estimate:** 2.5–3 days (the phone fps tier moved to F0.10, −¼ d; L3.8 adds ¼ d). L3.1–L3.3 and L3.4 can run in parallel; L3.5 comes last.

---

## Phase L4 (optional, owner decision): a full-bleed pond hero behind EXPLORE

**Goal:** daoho's own placement. The koi swim behind the home intro (`IntroLine`, `src/App.tsx:87-93`), with zero first-load cost.

**Deliverables:**
- `src/components/pond/PondHero.tsx` (app level). It reuses `createKoiPond` and `drawKoiPond` with:
  - a viewport tile grid: pitch 4 × 3 px dots, i.e. ~12 px tiles, so 1440 × 900 gives 120 × 75 tiles;
  - `feeds: []` and 4 koi (3 on phones).
- `src/components/pond/pondHero.css`.
- A lazy mount in `src/App.tsx`.
- Probe additions in `scripts/site/mobile.ts`.

**Design:**
- **Loading:** `import('./components/pond/PondHero')` only on EXPLORE, after `requestIdleCallback` (`timeout 2000`, `setTimeout 800` fallback, the same pattern as `App.tsx:55-57`). Never under reduced motion, which draws one still instead (the t = 0 frame).
- **Rendering:**
  - **Sites only:** lit glyph pixels go out as `sites` layers grouped by tone and size (the pattern of `physics.ts:51-60`), so the sampler visits about 5k sites, not 108k cells;
  - Canvas renderer;
  - one `<canvas>` behind the board header, `pointer-events: none`.
- **Pausing:** pause off-screen (IntersectionObserver, `rootMargin 64px`, as `DotCanvas.tsx:99-100`) and on `visibilitychange`.
- **Text avoidance:**
  - elements with `[data-pond-avoid]` (intro text, tabs, the first card row's top) are read with `getBoundingClientRect` on resize/scroll (rAF-throttled);
  - they become world-space boxes in `contain`'s SDF (koi steer around them);
  - they also mask glyphs (no water glyph under text), keeping text contrast.
- **Input:**
  - passive `pointermove`/`pointerdown` listeners on `window`; never `preventDefault`;
  - a press acts only when `event.target` is the page background;
  - touch: a tap on empty background drops food; no holds, since the page is a scroll surface.
- **Budget:** ≤ 3 ms per frame at 30 fps on desktop, 20 fps on phones; it stops after 60 s without input until the next pointer move.

| Step | Work | Checks |
|---|---|---|
| **L4.1** | `createKoiPond` grid-size independence (the pond SDF from the viewport rect, avoid boxes) | `life: KoiPond at 120×75 tiles is pure in t and ≤ 2 ms per step + draw × load` |
| **L4.2** | `PondHero.tsx`: canvas, sites, pause, reduced motion, avoid boxes, pointer wiring | browser: koi never enter an avoid box in 2 min; 0 console errors |
| **L4.3** | Lazy mount + budgets | `scripts/site/size.ts --check` unchanged (148.1 kB ≤ 150, `BUDGET_KB` at `size.ts:14`); mobile probe: the first-load chunk list excludes `PondHero-*` and it arrives after idle (`mobile.ts:93-108` pattern); vertical swipes on the home page still scroll 100 % |

**Estimate:** 1.5–2 days. Gate: an explicit owner yes on open decision 1 (overview §7).

---

## 3. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **"Never clusters of small dots"** (AGENTS.md; `src/widgets/types.ts:50-52`): koi bodies about 12 cells wide, made of 3×3 card-pitch micro-glyphs, may break the rule (review blocker B3) | <ul><li>**L1.0** prototypes both styles with `pnpm snap` before any glyph code is frozen.</li><li>An **owner ruling gates L1.3**.</li><li>The fallback, style B, is fully specified (§L1 "Body style B"): lattice-4 single dots for interiors, glyphs only on edges, fins and water. It satisfies the rule as written, and it is the default if the ruling is deferred.</li><li>`putBig` and the lattice layer are in the frozen L1.3 API either way.</li></ul> |
| **Phone perf:** pond cards are main-thread only (worker refused, `physics.ts:36-37`), and six of them at 12–30 fps cost about 25 % of a desktop main thread | <ul><li>Per-card fps (12–30, §L2) and the coarse-pointer tier, both from F0.10.</li><li>Off-screen pause (`DotCanvas.tsx:99-100`).</li><li>`maxLiveSteps 4` drops time rather than spiralling (`world.ts:186-188`).</li><li>Matching is memoised.</li><li>Slime runs on lattice 2.</li><li>Gate: ≤ 16 ms per draw at 4× throttle.</li></ul> |
| **Memory:** the ripple field, not the koi, dominates (koi alone are 3 KB; the overview's "< 5 KB" left out water). The 6 working copies per world (head, scratch, 3 views, live) are as large as several checkpoints, and checkpoint-only accounting hid them: the old slime row was 480 KB real | <ul><li>Gates are on **total** memory (checkpoints + working copies), per card (L2 table).</li><li>Ripple at tile resolution (1,188 cells), no parity plane.</li><li>`maxCheckpoints` set to the count the loop really keeps, so nothing evicts.</li><li>Slime moved to lattice 3 with 1,200 agents (229 KB); terrarium to `150 / 7` (244 KB).</li><li>`pond-koi`'s 288 KB exception is justified, with a 229 KB fallback (`every 150`).</li><li>A memory check in `scripts/life.ts`.</li></ul> |
| **Worker bundle:** the sampling worker imports the eager registry (`protocol.ts:10`), so `life/` would ship in `sampleWorker-*.js` although pond cards never sample there | <ul><li>A worker-build-only stub for `boards/pond/index` (§L1 "Worker bundle").</li><li>Size step: an `EDGE3` grep = 0 in the worker chunk, and worker gz Δ ≤ 0.5 kB (L1.7, L2.8).</li></ul> |
| **Determinism across engines:** goldens hash Node output; browsers must reach the same pristine state | <ul><li>The trig, exp and pow ban, enforced by F0.9's lint (one scan; `life/` registered in L1.1); `dpow`/`dexp`/`datan2` from dmath.</li><li>`rngFor`/`ihash`, never `hash01` (it aliases integers past ±2²³).</li><li>Literal constants; LUTs built with `dpow`.</li><li>`Float32Array` state.</li><li>Index tie-breaks and synchronous pulse rounds.</li><li>Probe: Chrome state hash = Node hash at step 1440. Add Firefox when the probe finds one.</li></ul> |
| **Chaotic loops pop at the wrap** | <ul><li>A 3 s seam with unit-vector headings.</li><li>Autopilot schedules on `phaseSteps`, so pre-roll = loop end.</li><li>No pellets or startles in the last 4 s.</li><li>Seam checks: heads within .5 L, ≤ 15 % dots changed at the wrap.</li></ul> |
| **Taste vs daoho:** reading as a clone, or as worse | <ul><li>Our own signature: wave-equation water (interference and reflection), dot micro-glyphs, one accent, published kinematics (Videler envelope, Strouhal beat), not its numbers.</li><li>The font-tile look, which is closest to daoho, is a toggle and not the default.</li><li>L1.10 side-by-side taste pass against the owner's quality bar (level-03, afterlight, mosaic, components).</li></ul> |
| **One accent** (review M4): DESIGN.md:24 defines `activeDim` as a "was active" state, so shading red with it may count as a second red | <ul><li>Default: **size contrast only**. Red is `active` at 1.0, and darker red reads as smaller `active` dots (.6) or no dot. Applies to koi shading, depth, flicker and firefly flashes (D2).</li><li>`activeDim` is an **owner decision**. Until the owner rules, the check fails on any `dotActiveDim` dot: the only chromatic colour per pond frame is `dotActive`, and red stays inside the role's mask.</li><li>If the owner admits it, only the red glyph pixels change (style A table).</li></ul> |
| **The 12 fps default** makes koi stutter | Per-card `fps` (D7) from **F0.10**, which owns `widgets/types.ts` and `DotWidget.tsx`. L sets numbers only. L's own full-suite runs come from its manifest edits (integration commits L1.11, L2.9, L3.8). |
| **Hover forks live on desktop** (a moving mouse engages, `world.ts:160-164`) while the wheel scrolls past | Heal after 4 s idle; pristine resumes exactly. Physics cards already behave this way. |
| **F0 slips** | <ul><li>L1.2–L1.4 and L1.6 (bar `wander`) don't need noise.</li><li>`koiPattern`, the bank and pads need `fbm2`/`voronoi2`/`noise2`.</li><li>Never commit pond goldens before F0's noise is on `main`: the pattern would change under them.</li></ul> |
| **Q edits glyph alphabets** and moves pond pixels | <ul><li>Alphabets are frozen after `defineAlphabet`.</li><li>A pinned-bitmap check (L1.3).</li><li>Q adds alphabets (cross-stitch, ASCII ramps) through `defineAlphabet` only. Q has no glyph-tiles step; the Squares board may consume `glyphTiles` later.</li></ul> |
| **Glyph crawl and sparkle** (advanced #12): boundary values flip glyphs every frame | <ul><li>Stateless only, in L1.3: STBN flicker (`flickerOn`) and a flicker-budget check (≤ 2 % of tiles per frame on a held field).</li><li>**No hysteresis state in the World**: it would be checkpointed per tile, past the memory gate. The stateful half is the advanced doc's X1.</li></ul> |
| **M2 depends on `ripple.ts`** | API frozen at L1.2. Additions are new functions (`rippleTilt`, L3.6); a check pins `rippleStep`'s output. |

## 4. What L needs from F0 and Q, and what it gives back

- **From F0 (hard dependency, by name):**
  - `noise2(x, y, seed)` in [−1, 1];
  - `fbm2(x, y, octaves, seed)`, normalised to [−1, 1];
  - `curl2(x, y, t, seed) → [vx, vy]`, divergence-free;
  - `voronoi2(x, y, seed, 'l2') → { f1, f2, id }`;
  - `src/engine/noise/dmath.ts`, imported from `../noise`: `dsin dcos tsin tcos datan2 dexp dpow`, `ihash`, `rngFor`.
  - All of them must be bit-identical across engines (no `Math.sin`).
  - **F0.9** determinism lint. L1.1 registers `src/engine/life` with it; there is no second scan.
  - **F0.10** `WidgetPreset.fps` + phone tier (F0.10 owns `widgets/types.ts` and `DotWidget.tsx`). L1.7 needs it merged; L sets `fps` per card.
  - **Light hub** (L3.6 only; every pond card works without it). `sceneLight` with keys `lightSrc`, `lightAz`, `lightEl`; tilt offset `tx`, `ty` (0 at rest); `lightSource` added as `sources` in the manifest and the eager registry. There is no `data.light`. `gx`/`gy` are gravity, for physics only, and the pond does not read them.
  - The golden key extension isn't needed: pond cards set no shape, join or rotation, so their keys stay the old format.
- **To Q:**
  - L owns `glyphTiles.ts` (alphabets, `matchTile`, `TileRaster`, `putBig`, `flickerOn`, `tileLayers`), with its API frozen at L1.3.
  - Q **adds alphabets only**, through `defineAlphabet`. Q has no glyph-tiles step of its own; the Squares board may consume `glyphTiles` later (overview §4, #5). It may render tiles with square dots once Q's square cover fix lands (a card style `shape: 'square'`, no change to glyphTiles).
  - L needs nothing from Q.
- **To M:** M2's caustic pool (`mat-pool`, M2.4) consumes `ripple.ts` from L1.2: `createRipple`, `rippleStep`, `rippleSplat`, `rippleGrad`. That API is **frozen at L1.2**. L's later water features are separate functions (`rippleTilt`, L3.6), and `rippleStep`'s output is pinned by a check.

## 5. Estimates and gates

| Phase | Serial | With parallel agents | Gate |
|---|---|---|---|
| L1 | 5–5.5 d | ~3.5 d (2 agents) + owner turnaround on L1.0 | **owner body-style ruling (L1.0) before L1.3**; ≤ 4 ms per frame; t = 0 golden added (no other golden changed); touch-policy probe green; total memory ≤ 288 KB (koi); flicker ≤ 2 % of tiles per frame; worker chunk has no `life/` (Δ ≤ 0.5 kB); one accent with no `activeDim`; owner taste pass |
| L2 | 4.25–5.25 d | ~2.75 d (3 agents) | each card ≤ 4 ms and total memory ≤ 256 KB (table); board Σ ≤ 1.4 MB; one accent per card role; 10 new golden keys only |
| L3 | 2.5–3 d | ~2 d | probe on all 6 cards at 375 and 390 px; reduced motion still; night frames correct; frames at rest (tx = ty = 0, lightSrc 0) equal L2 |
| L4 | 1.5–2 d | — | first load unchanged (≤ 150 kB gz); hero ≤ 3 ms per frame; owner yes |

**Owner decisions this plan waits on or records:**
1. Body style A or B (L1.0, gates L1.3; default B).
2. Whether `activeDim` may join the one accent (D2; default no, size contrast only).
3. Bubble sound (D6; out for L1–L3, later XL).
4. `pond-koi`'s 288 KB memory exception (or `every 150` for a flat 256 KB).
5. The DOTS/TYPE default (L3.4) and the L4 hero.

**Commands per step:**
- **While iterating** (AGENTS.md "test the module"):
  - `npx tsc -b`;
  - `npx oxlint <changed>`;
  - `npx tsx scripts/life.ts`;
  - `pnpm golden --check`, which must say only `added pond-…`;
  - `npx tsx scripts/widgets/ids.ts --assign` after adding a card.
- **Size step** (L1.7, L2.8, and after any change to what the board imports): `vite build`, then `scripts/site/size.ts --check` (first load unchanged); `grep -c "EDGE3" dist/assets/sampleWorker-*.js` = 0; the `sampleWorker-*.js` gz size before and after (Δ ≤ 0.5 kB), written into the PR.
- **Full suite** (`pnpm check`, `pnpm golden --check`, the size step, `scripts/life-browser.ts`, `scripts/site/mobile.ts`): only where L itself touches core, i.e. on each integration commit that edits the manifest (L1.11, L2.9, L3.8), and before a push. `widgets/types.ts` is F0.10's edit, not L's.

## 6. Integration

- **Shared files** are edited **only in integration-queue commits**, never in feature commits on the L branch:
  - registry: `src/widgets/manifest.ts`, `src/widgets/index.ts`, `src/widgets/blurbs.ts`, `src/widgets/meta.ts`, `src/widgets/ids.json`, `src/widgets/catalog.ts`;
  - `goldens/hashes.json`;
  - `docs/PROGRESS.md`, `docs/README.md`.
  - Each phase prepares its edits as one patch and lands it as that phase's merge step (L1.11, L2.9, L3.8).
- **Queue order across tracks:** **L1 → Q1 → M1**, then **L2 → M2 → Q2**. Each integration commit rebases on the previous one, re-runs `ids --assign` (uids are assigned in queue order, so they never collide) and `pnpm golden --check`, which must show only that commit's `added …` keys.
- **`scripts/verify.ts` insertion order**, after `algorithmsChecks` (`verify.ts:866-867`): noise, light, golden key (F0), then **life** (L), squares (Q), materials (M). `lifeChecks(assert)` goes directly after F0's golden-key block and before `squaresChecks`. The import goes next to `algorithmsChecks`' import (`verify.ts:54`) in the same order.
- **Other files L touches outside `src/engine/life` and `boards/pond`:**
  - `vite.config.ts`'s `worker.plugins` (the pond stub), in the L1 integration commit. Q and M add their own entries to the same list if their boards are main-thread only.
  - `DESIGN.md`, `CHANGELOG.md` and `src/changelog.ts`, in each phase's merge step.

## Sources
- argonaut, *A simple procedural animation technique* (github.com/argonautcode/animal-proc-anim): the follow-the-leader spine with angle constraints.
- C. Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999); *Flocks, Herds and Schools* (SIGGRAPH 1987).
- M. Ballerini et al., *Interaction ruling animal collective behavior depends on topological rather than metric distance*, PNAS 105 (2008).
- A. Procaccini et al., *Propagating waves in starling murmurations*, Animal Behaviour (2011/2019): agitation waves.
- J. J. Videler, *Fish Swimming* (1993): the carangiform amplitude envelope. Strouhal tail beat: Taylor, Nudds & Thomas, Nature 425 (2003).
- Mauthner cell / C-start escape (Eaton et al. 1977; Domenici & Blake 1997): bend and burst timings.
- H. Elias, *2D water* (archived explainer, linked in the overview).
- A. Harri, *ASCII characters are not pixels* (alexharri.com/blog/ascii-rendering): shape vectors and the contrast step.
- J. Jones, *Characteristics of pattern formation and evolution in approximations of Physarum transport networks*, Artificial Life 16 (2010).
- R. Mirollo & S. Strogatz, *Synchronization of pulse-coupled biological oscillators*, SIAM J. Appl. Math. 50 (1990); Y. Kuramoto (1975/1984).
- A. Runions et al., *Modeling and visualization of leaf venation patterns* (SIGGRAPH 2005); *Modeling trees with a space colonization algorithm* (2007).
- P. Prusinkiewicz & A. Lindenmayer, *The Algorithmic Beauty of Plants* (1990).
- A. Aristidou & J. Lasenby, *FABRIK* (2011).
