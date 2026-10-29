# F0: the shared foundation (noise, IR builtins, light hub, golden key, square cover, card fps, first-load cut)

> Status: **done** (2026-10-28; planned 2026-10-27). All of F0.1–F0.11 merged on `feat/foundation` with the full suite green; what landed and the measured numbers are in `docs/PROGRESS.md` › Foundation run, the first-load rows in `docs/LIVING-MATTER-PLAN.md` §6. Where the build differed from this plan, the text below says so (§0 bytecode, §2.4 and §4 the IR hook, §2.7 the gravity dead zone, F0.8 the probe card).
> This is phase F0 of `docs/LIVING-MATTER-PLAN.md` §2 and §6, steps **F0.1–F0.11**. It must land before L1, Q1 and M1, which then run in parallel. The one exception is F0.11 (the first-load cut): it may land after L1/Q1/M1 start, but it must merge before Q1.4.
> Phase names across the plan set: **F0**, **L1–L4**, **Q1–Q3**, **M1–M3**, and the advanced phases **XL**, **XQ**, **XM**, **X1** (pond depth) and **X2** (GPU).
> F0 owns the shared contracts that the track docs (`L-pond.md`, `Q-squares.md`, `M-materials.md`, `X-advanced.md`) depend on by name: the golden key channels (§2.5), the light/tilt keys (§2.7), the square cover rule (§2.6), per-card fps (§2.8), `dmath` and the determinism lint (§2.1, F0.9), and the first-load ledger (§4, F0.11).
> Every claim below was checked against the code on `docs/living-matter-plan` (ef4dcd8). Cites are `file:line`.
> Prototype numbers come from a throwaway benchmark run outside the repo (Node 22 / V8, plus Bun / JSC for the cross-engine check). They were normalised by the `loadFactor()` loop of `scripts/algorithms.ts:20-31`, which read 1.54 on the measuring box.

## 0. Goal, non-goals, assumptions

**Goal.** One small, deterministic, lazily loaded toolkit that the Pond, Squares and Materials tracks share. It covers:
- noise and Voronoi fields;
- deterministic scalar math (trig, `atan2`, `exp`, `pow`);
- the same noise as Field IR builtins, for the GPU path;
- the app's light and tilt input;
- a golden key that can see the new dot attributes, with every existing golden backfilled once;
- one correct cover rule for square dots;
- a per-card frame rate;
- a first-load cut that pays for the tracks' planned growth.

All of it lands with no card pixel change. First-load growth from F0 itself stays within its ledger rows (+0.05 and +0.02 kB gz), and F0.11 takes ≥ 1 kB gz back out.

**Non-goals.**
- No new card, board or token. `{grid.gap}` belongs to Q1, and height/AO to M1.
- No change to existing physics sims. They still call `Math.hypot`, `Math.atan2` and `Math.cos`, at `src/engine/physics/pbd.ts:152,235,262` and `particles.ts:86,93,188`. That is logged as debt (§7, R9), not fixed here.
- No join pass, `shapeOf`, rotation or motif semantics; those are Q's. F0 only reserves the optional `DotInstance` / `Layer` fields `join`, `joint`, `rot`, `aspect`, `motif` (doc-only declarations) and teaches the golden key to hash them.
- No device bytecode for noise. `targets/esp32/dotvm.c` doesn't get it; the compiler rejects noise programs cleanly instead.
- No migration of the light board's existing cards to the hub (golden risk; M1 decides).

**Assumptions, all verified.**
- **177 presets in `goldens/hashes.json`, all the same shape family.** Every one has `style.shape === 'squircle'` and `cornerRoundness` of 0 (36 presets) or 0.1 (141), so the squircle exponent n is 2 or 2.3 (`src/engine/renderer/shapePath.ts:8`). 144 presets use `sites` and 141 use a `lattice`. None of them has a site dot with n > 2.3. Counted with a probe over `uniquePresets()` + `withChrome`.
- **`scripts/golden.ts` rebuilds the whole file on every write.** The write path recomputes every preset (`:33-42`) and writes one fresh document (`:44-49`), so any later regeneration would rewrite every entry. That is why the `style` backfill happens once, inside F0.5 (§2.5).
- **First load is 148.14 of 150 kB gz** (`scripts/site/size.ts` on the current `dist/`, 20 files).
  - The **IR core is already in first load.** `src/engine/renderer/webgl/passes.ts:12` imports `emitGLSL, parse, irProgram`, so `ast.ts`, `parse.ts`, `compile.ts`, `runtime.ts` and `emit.ts` sit inside the `DotCanvas-*.js` chunk (95.6 kB gz). Strings like `sdRing`, `ir_sdBox` and the parser's "is a function; call it as" message are in that chunk.
  - **`src/engine/math.ts` is its own first-load chunk** (`math-*.js`, 0.32 kB). Anything added to it that a lazy chunk uses ships in first load.
  - `bytecode.ts` and `reference.ts` are **not** in first load (their strings are absent from the chunk). *As built:* `bytecode.ts`'s module-level tables (`OP`, the `FNS` snapshot of the core builtins, `BIN`, `OPERANDS`, filled by top-level loops that the bundler can't drop) ship in every chunk that carries the IR core, and would ride into first load with it (the comment at `bytecode.ts:29-31` assumes the core is there). On the 2026-10-28 build that is the lazy `ir-*` chunk and the sample worker: the opcode table is in those two files and in no first-load file. Either way, the pack check lives inside `compileBytecode` (a name test at call time, `bytecode.ts:78-80`), and nothing pack-specific runs at module level.
- **The sample worker carries the eager registry.** `src/workers/protocol.ts:10` imports `widgetPresets` from `../widgets` (the eager registry, `src/widgets/index.ts`), so every board module ships in `sampleWorker-*.js` (algo-stipple code is already in it). That chunk is 152.7 kB gz (gzip -9 of `dist/assets/sampleWorker-KW34ihYj.js`). It is not first load, but it is downloaded by every page that animates a card. Physics cards already refuse to run there (`src/widgets/boards/physics.ts:36-37`).
- **Animated cards run at a fixed rate today.** `DotCanvas` subscribes with `fps: fps ?? (motion ? 12 : 30)` (`src/components/DotCanvas.tsx:398`), and `DotWidget` only ever passes `fps={camera.status === 'live' ? 30 : undefined}` (`src/components/DotWidget.tsx:125,128`). `WidgetPreset` has no `fps` field (`src/widgets/types.ts:14-46`). `DESIGN.md:271` (`{interaction.focusSpeed}`) assumes 12 fps.
- **Card data is numbers only.** `pick()` keeps the keys a card declares in `defaults` (`src/data/useLiveData.ts:24-30`), and `Board.tsx:82` passes only that subset. There is no object-valued `data.light`.
- **`Math.sin` differs between engines; `+ × floor` arithmetic doesn't.** Hashing 20k `Math.sin` outputs gave `7cd3b1c1` under Node (V8) and `3e5f4cb1` under Bun (JSC). The prototype `noise2` and the existing `dsin` hash identically in both (`cd0a1a18` / `8dad4adf`). Bun is installed on this box (`~/.bun/bin/bun`), so a real cross-engine check is possible.

## 1. Deliverables (files)

| File | New / changed | What |
|---|---|---|
| `src/engine/noise/dmath.ts` | new | `dsin dcos tsin tcos` (moved verbatim from `algo/attractor.ts:18-42`), `datan2`, `dexp`, `dpow`, `ihash`, `rngFor`, `TAU` |
| `src/engine/noise/gradient.ts` | new | `noise2 noise3 noise3Grad fbm2 turb2 ridge2 curl2 valueNoise2` |
| `src/engine/noise/voronoi.ts` | new | `voronoi2`, `voronoiBorder2` |
| `src/engine/noise/ir.ts` | new | IR builtin pack: registers names, JS implementations and the GLSL prelude on import |
| `src/engine/noise/glsl.ts` | new | the GLSL ES 3.0 prelude string (bit-matched hash, f32 lattice) |
| `src/engine/noise/index.ts` | new | barrel. **Not** re-exported from `src/engine/index.ts` (same rule as `src/engine/algo/index.ts:5-6`) |
| `src/engine/algo/attractor.ts` | changed | `dsin…tcos` replaced by `export { dsin, dcos, tsin, tcos } from '../noise/dmath'`. `dla.ts:21` keeps importing from `./attractor` |
| `src/widgets/boards/cinema.ts` | changed | private `vnoise` (`:115-119`) → `valueNoise2` from `engine/noise`, same arithmetic |
| `src/engine/ir/ast.ts` | changed | `IR_EXTRA` registry, `isFn` / `isCoreFn` / `arity`, the `PackFn` type |
| `src/engine/ir/parse.ts` | changed | arity from `arity()` (`:166`); bindings checked with `isCoreFn` (`:82`) |
| `src/engine/ir/emit.ts` | changed | exported `GLSL_HELPERS`; pack calls emit `ir_<fn>` and pull in the prelude |
| `src/engine/ir/runtime.ts` | changed | `irMath` type allows the pack's optional entries |
| `src/engine/ir/bytecode.ts`, `reference.ts` | changed | clear `IRError` for pack builtins; the reference defers to the registered oracle |
| `src/engine/types.ts` | changed | reserved, doc-only optional fields `join? joint? rot? aspect? motif?` on `DotInstance` (`:28`) and `Layer` (`:36`) |
| `scripts/lib/goldenKey.ts` | new | `dotKey`, `styleSig`, the `CHANNELS` table (extracted so verify can unit-test them) |
| `scripts/golden.ts` | changed | uses `dotKey` (replaces `q`, `:28`); writes and compares `style`; `--backfill-style` one-shot guard |
| `goldens/hashes.json` | changed (once, F0.5) | `style` added to all 177 entries; every `hash` and `dots` value unchanged |
| `src/engine/sampler/cover.ts` | new | `hides()` and `coverExponent()`: the single cover rule (§2.6) |
| `src/engine/sampler/gridSampler.ts` | changed | site cover (`:219-226`) calls `hides()` |
| `src/engine/light/input.ts` | new | pure light selection and bucketing (not added to `light/index.ts`) |
| `src/site/light.ts` | new | the light/tilt hub: a `Source` (`src/data/source.ts:117-126`), the iOS permission flow, low-pass and buckets |
| `src/components/palette/CommandLayer.tsx` | changed | **TILT** button in `ToolsSheet` (`:53-73`) |
| `src/widgets/boards/physics.ts`, `src/widgets/manifest.ts`, `src/widgets/index.ts` | changed (F0.8) | the first hub consumer: `sources: [lightSource]` in the manifest (`:52`) **and** the eager registry (`:58`), plus `gx`/`gy` in defaults |
| `src/widgets/types.ts` | changed (F0.10) | `WidgetPreset.fps?: number` |
| `src/widgets/fps.ts` | new (F0.10) | `cardFps(base, tier)`, `fpsTier()`: the phone tier, pure and unit-testable |
| `src/components/DotWidget.tsx` | changed (F0.10) | passes the preset's fps to `DotCanvas` (`:125,128`) |
| `scripts/lib/detLint.ts` | new (F0.9) | `DET_PATHS` and `detLint(paths)`: the single determinism source scan |
| `scripts/site/size.ts` | changed (F0.11) | `--worker` row (gz of `sampleWorker-*.js`) |
| `scripts/noise.ts` | new | `noiseChecks(assert)`, standalone-runnable like `scripts/algorithms.ts:149-154` |
| `scripts/light.ts` | new | `lightChecks(assert)` over the hub's pure core with a fake env |
| `scripts/light-browser.ts` | new | CDP probe: orientation override, TILT sheet, scroll-first still holds |
| `goldens/noise.json`, `goldens/noise-glsl.json` | new | determinism hashes; GLSL prelude snapshot |
| `scripts/verify.ts` | changed | F0's three slots after `algorithmsChecks` (`:867`): noise, light, golden key (§3, "verify.ts slots") |
| `scripts/lib/webgl-page.ts`, `scripts/webgl.ts` | changed | import the pack; `--fields` already exists (`webgl.ts:90`) |
| `docs/ALGORITHMS.md`, `DESIGN.md` › Light and `:271`, `docs/DOT-MATRIX-ENGINE-PLAN.md` (module list, Field IR builtins), `docs/LIVING-MATTER-PLAN.md` §6 (size ledger), `docs/README.md`, `docs/PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` (`upcoming`, `:142`) | changed | doc sync, per step ("Docs to update") |

## 2. APIs and algorithms

### 2.1 `src/engine/noise/dmath.ts`: deterministic scalar math

Rule: only `+ − × /`, `Math.floor/round/trunc/abs/min/max/sqrt/imul/fround`, comparisons and table reads. ECMAScript implements those with correctly rounded IEEE-754 doubles (no FMA contraction in JS), so every engine gives the same bits. `Math.sqrt` is treated as correctly rounded, as the repo already does (`src/engine/math.ts:8-12`).

```ts
export const TAU = Math.PI * 2
/** sin(x) to ~2e-7 from +, ×, round only (bit-identical in every engine). Moved verbatim from algo/attractor.ts. */
export function dsin(x: number): number
export const dcos: (x: number) => number
/** Table sine: 4096 dsin samples per turn + linear interpolation (error < 3e-7). ~4× cheaper than dsin. */
export function tsin(x: number): number
export const tcos: (x: number) => number
/**
 * atan2(y, x) in (−π, π], max error ≤ 1e-9 rad, bit-identical across engines.
 * Octant reduction (a = min/max ∈ [0, 1]), then a > tan(π/8) → (a − 1)/(a + 1) + π/4, then the odd
 * Taylor series to x¹⁹ on |a| ≤ 0.4142 (truncation < 5e-9). datan2(0, 0) = 0; signed zeros are
 * ignored (datan2(−0, −1) = π, where Math.atan2 gives −π); NaN in → NaN out.
 */
export function datan2(y: number, x: number): number
/**
 * e^x, relative error ≤ 1e-13 on [−708, 709], bit-identical across engines.
 * Cody–Waite reduction x = k·ln2 + r (k = round(x / ln2), ln2 split hi/lo so k·ln2_hi is exact), |r| ≤ ln2/2,
 * then a degree-13 Taylor polynomial in Horner form (truncation < 1e-16), then × 2^k built by exact
 * multiplication (powers of two are exact). dexp(0) = 1 exactly; x > 709.78 → Infinity; x < −745.1 → 0; NaN → NaN.
 * Uses: damping exp(−dt/τ) in sims, Lenia growth kernels, falloffs inside deterministic steps.
 */
export function dexp(x: number): number
/**
 * x^y, bit-identical across engines.
 *  - Integer y with |y| ≤ 64: exact-path repeated squaring (same op order every call; 1/x^|y| for y < 0).
 *  - Otherwise x > 0: dexp(y · dlog(x)), with a private dlog: mantissa/exponent split by exact ×/÷ 2,
 *    m ∈ [√½, √2], ln m = 2·atanh(s), s = (m − 1)/(m + 1), odd series to s²¹ (|s| ≤ 0.1716, truncation < 1e-18).
 *  - Accuracy: relative error ≤ 1e-12 when |y·ln x| ≤ 50; ≤ 1e-9 over the whole normal range
 *    (both far inside X-advanced's < 1e-7 bar).
 *  - Edges: dpow(x, 0) = 1; dpow(0, y > 0) = 0; dpow(0, y < 0) = Infinity; x < 0 with non-integer y → NaN;
 *    x < 0 with integer y → sign by parity; NaN → NaN.
 * Uses: specular lobes pow(n·h, shininess) in deterministic steps, superellipse tests in sims, growth curves.
 */
export function dpow(x: number, y: number): number
/**
 * Integer lattice hash → uint32: h = imul(a, 0x8da6b343) ^ imul(b, 0xd8163841) ^ imul(c, 0xcb1ab31f),
 * then the murmur3 finaliser (as math.ts:17-21). Inputs are taken as int32 (`| 0`). Use it for lattice
 * cells, entity ids and step counters over the full 32-bit range. `hash32` (math.ts:25) is for
 * fractional inputs: it scales by 256, so integers alias past ±2²³.
 * Mirrored exactly by GLSL `uint` ops (noise/glsl.ts).
 */
export function ihash(a: number, b?: number, c?: number): number
/** A seeded stream per entity and step: mulberry32(ihash(seed, id, step)) (mulberry32: sampler/jitter.ts:1). */
export function rngFor(seed: number, id: number, step?: number): () => number
```

Prototype: `datan2` max error 3.8e-10 over 2e6 samples, and it costs 1.3× `Math.atan2`. `dexp`/`dpow` were not prototyped; their accuracy targets above are the F0.1 gates, and their cost is reported (gate in §4).

**Why move `dsin`/`tsin` out of `algo`, and not into `math.ts`.** L, Q and M need them outside `algo`. `math.ts` is a first-load chunk, so anything added there would ship in first load (§0). `attractor.ts` re-exports them, so `dla.ts:21`, `scripts/algorithms.ts:9` and the algorithms goldens don't move.

**Tracks never write their own determinism helpers.** If a sim needs another scalar function, it is added here, with an accuracy target and a test in `scripts/noise.ts`.

### 2.2 `src/engine/noise/gradient.ts`: gradient noise, fBm, curl

**Choice: 2-D gradient (Perlin) noise on a square lattice.** It uses the quintic fade 6t⁵ − 15t⁴ + 10t³ (C², Perlin 2002) and 8 gradients `(±1,0) (0,±1) (±√½,±√½)` picked by `ihash(ix, iy, seed) & 7`.

Why this one:
- **Value noise** is cheaper but blobby, and its grid shows at 144².
- **Simplex** needs skew constants and a corner sort. That is fine for determinism, but it adds GLSL/JS parity surface for little gain at these sizes.
- **Gradient noise** gets rid of axis alignment by **rotating every octave**, by R = [[0.8, −0.6], [0.6, 0.8]] (iq). That costs 4 multiplies and needs no trig.

Every op is +, ×, floor, imul, so it is bit-identical across engines (proven on the prototype under V8 and JSC).

```ts
/** Gradient noise in [−1, 1] (×√2 of the classic ±√½ bound, so the bound is exact). Lattice = integer x, y. */
export function noise2(x: number, y: number, seed?: number): number
/** 3-D gradient noise in [−1, 1] (12 edge gradients of improved Perlin noise, components in {−1,0,1}, quintic fade).
 * Scale constant fixed in F0.2 so max |n| over 1e6 samples ∈ [0.95, 1]. */
export function noise3(x: number, y: number, z: number, seed?: number): number
/** noise3 plus its analytic ∂/∂x, ∂/∂y (the z derivative is not needed). Writes [n, dx, dy] into `out`, returns it. No allocation. */
export function noise3Grad(x: number, y: number, z: number, seed: number, out: Float64Array): Float64Array
export interface FbmOptions { octaves?: number /* 4, clamped 1..8 */; lacunarity?: number /* 2 */; gain?: number /* .5 */ }
/**
 * Fractal Brownian motion in [−1, 1]: Σ gainᵒ·noise2(Rᵒ·p·lacᵒ, seedᵒ) / Σ gainᵒ, where R is the octave rotation
 * and seedᵒ = seed ^ imul(o, 0x9e3779b9). Lacunarity 2 keeps the scaling exact.
 */
export function fbm2(x: number, y: number, octaves?: number, seed?: number, o?: FbmOptions): number
/** Turbulence in [0, 1]: Σ gainᵒ·|noise2| / Σ gainᵒ (marble, rust, smoke). */
export function turb2(x: number, y: number, octaves?: number, seed?: number, o?: FbmOptions): number
/** Ridged multifractal in [0, 1]: Σ gainᵒ·(1 − |noise2|)² / Σ gainᵒ (veins, cracks, leather creases). */
export function ridge2(x: number, y: number, octaves?: number, seed?: number, o?: FbmOptions): number
/**
 * Divergence-free 2-D flow (Bridson et al. 2007, "Curl-noise for procedural fluid flow"):
 * ψ = Σ gainᵒ·noise3(x·2ᵒ, y·2ᵒ, t·speed, seedᵒ), v = (∂ψ/∂y, −∂ψ/∂x) from the analytic gradient (one noise3Grad
 * per octave; no finite differences). Default 2 octaves, speed .25. Writes [vx, vy] into `out` (no allocation).
 * Units: noise-space per unit of ψ; callers scale. For particles/agents (lily pads, marine snow), not per-cell fields.
 */
export function curl2(x: number, y: number, t: number, seed?: number, out?: [number, number], o?: { octaves?: number; speed?: number }): [number, number]
/** Value noise in [0, 1], bit-identical to cinema.ts's private vnoise (hash01 lattice, smoothstep fade). For migration only. */
export function valueNoise2(x: number, y: number, seed: number): number
```

**Range and scale conventions.**
- `noise*` / `fbm2` are signed. Map with `.5 + .5 * n` for a tone.
- One lattice cell is one noise feature, so a card that wants ~6 features across 144 cells samples `noise2(c * 6 / 144, …)`.

### 2.3 `src/engine/noise/voronoi.ts`: Worley F1/F2 with three metrics

```ts
export type Metric = 'l2' | 'l1' | 'linf'
export interface VoronoiOut {
  /** Nearest and second-nearest feature distance in `metric` (lattice units). */
  f1: number; f2: number
  /** uint32 id of the nearest cell (ihash of its lattice cell): stable per cell, use for per-pane tone/colour role. */
  id: number
  /** Nearest feature point (lattice units): stained-glass pane centres, terrazzo chip centres. */
  x: number; y: number
}
/**
 * One feature point per lattice cell at cell + jitter·(h & 0xffff, h >>> 16)/65536 with h = ihash(cx, cy, seed)
 * (16-bit coordinates: exact in float32, so the GPU sees the same points). Writes into `out` (default: a module scratch
 * object, valid until the next call). Default jitter 1.
 */
export function voronoi2(x: number, y: number, seed?: number, metric?: Metric, out?: VoronoiOut, jitter?: number): VoronoiOut
/** Exact distance to the nearest cell border (iq 2012, two passes, L2 only): lead moats and grout of even width. */
export function voronoiBorder2(x: number, y: number, seed?: number, jitter?: number): number
```

**Neighbourhood search (exact, with an early out).**
1. Scan the 3×3 cells around `floor(p)`.
2. If the wanted distance (`f1`, or `f2` when the caller reads it; take a `want: 1 | 2` flag internally, default 2) is still > 1, also scan the 16-cell ring at offset ±2.

**Why it is exact.**
- **Ring cells are always more than 1 away.** A ring point is more than 1 away along one axis, and L1, L2 and L∞ are all ≥ the per-axis distance.
- **Cells beyond the ring are always more than 2 away.**
- **F1 is exact for all three metrics.** The own cell's point is within 1 (L∞), √2 (L2) or 2 (L1), so F1 never needs the cells beyond the ring.
- **F2 is exact for L2 and L∞.** The closer horizontal neighbour gives a second point within 1.80 (L2) or 2 (L∞).
- **L1 F2 can be wrong**, only when F2 > 2. This is documented and measured in the brute-force check.

Ties keep the first-scanned cell (fixed scan order), so no float sort is needed.

Prototype cost at 144² (normalised): l2 2.4 ms, l1 1.55 ms, linf 2.3 ms.

### 2.4 IR builtins (lazy pack)

**Builtins.** All are scalar, matching the IR's one-number model (`src/engine/ir/ast.ts:1-5`):

| IR name | Arity | Meaning |
|---|---|---|
| `noise(x, y, seed)` | 3 | `noise2` |
| `fbm(x, y, oct, seed)` | 4 | `fbm2`; `oct` is floored and clamped to 1..8, and GLSL loops to a constant 8 with an early break |
| `turb(x, y, oct, seed)` | 4 | `turb2` |
| `voronoi(x, y, seed, mode)` | 4 | `mode = metric·4 + out`; metric 0 l2, 1 l1, 2 linf; out 0 f1, 1 f2, 2 f2−f1, 3 id/2³² |

`curl`/`datan2`/`dexp`/`dpow` are not IR builtins: curl drives CPU agents, and the IR already has `atan`, `exp` and `pow`.

**As built: the zero-byte fallback (§4).** The core gained no registry: `src/engine/noise/ir.ts` fills the core's existing tables at import (`IR_FUNCTIONS` for name and arity, `irMath`, the reference's `IR_REF` oracle table, `GLSL_HELPERS.noise`); `IR_RESERVED` snapshots the core names at load, so pack names stay unreserved; `emit.ts` gained the one-line helper branch. Measured +0.03 kB gz first load. The registry design below was the plan's first choice and is kept for the record.

**Why a pack, and the exact hook (all first-load bytes).** The IR core is in first load (§0), so the implementations and the GLSL prelude live in `src/engine/noise/ir.ts` + `glsl.ts`, and register themselves on import. The core only grows by a registry:
- **`ast.ts`:**
  - `export const IR_EXTRA: Record<string, number> = {}`;
  - `isFn(n) = own(IR_FUNCTIONS, n) || own(IR_EXTRA, n)`;
  - `isCoreFn(n)` (the old `isFn`, `:33`);
  - `arity(fn)`;
  - `type PackFn = 'noise' | 'fbm' | 'turb' | 'voronoi'` (type only, 0 bytes);
  - `FnName = keyof typeof IR_FUNCTIONS | PackFn`.
  - `validate`'s `name()` (`:88`) and `IR_FUNCTIONS[fn]` arity reads switch to `isCoreFn` / `arity`.
- **`parse.ts`:**
  - `:82` bindings → `isCoreFn`;
  - `:161`/`:166` calls → `isFn` / `arity`.
  - Refs already resolve scope before functions (`:172-173`), so `let noise = 3; noise + noise(u, v, 1)` stays legal. **Pack names never become reserved words**, and saved programs that bind `noise` keep parsing.
- **`emit.ts`:**
  - `export const GLSL_HELPERS` (today private, `:122`);
  - in GLSL `call`'s default branch: `if (own(IR_EXTRA, fn)) { helpers.add('noise'); return \`ir_${fn}(${a.join(', ')})\` }`.
  - The JS dialect already emits `M.${fn}` (`:58`), and the closure backend reads `M[n.fn]` (`compile.ts:37`, arity ≤ 4 covered).
- **`runtime.ts`:** the `irMath` type becomes `Record<CoreFn | 'mod' | 'pow', …> & Partial<Record<PackFn, …>>`. The pack assigns `irMath.noise = (x, y, s) => noise2(x, y, s)` and so on.
- **`bytecode.ts`** (its module-level tables ship wherever the IR core does, §0; the check below runs only inside `compileBytecode`): in `compileBytecode`'s `call` (`:72`), when `FNS.indexOf(fn) < 0`, throw `IRError(\`${fn}() is not in device bytecode v${BC_VERSION}\`)`. `FNS` is fixed at load (`:28`), so the opcodes 0x20–0x33 don't shift, and 0x34–0x37 stay free below `JZ` 0x38 (`:19-26`).
- **`reference.ts`** (not first load): the `fn` switch's fall-through calls `IR_REF[name]` (registered by the pack: the plain JS library function). The library is the oracle; the backends are just wrappers.

**Who imports the pack.** Every lazy chunk that compiles user or spec IR:
- `spec/build.ts`, `components/studio/doc.ts`, `components/dwitter/program.ts`;
- `widgets/boards/ir.ts`, `widgets/boards/gpu.ts`;
- any L/Q/M board.

Each one does `import '../engine/noise/ir'` (a side-effect import, idempotent). F0.4 must confirm with `size.ts` that none of them is in the first-load closure. If one is, it uses `if (/\b(noise|fbm|turb|voronoi)\s*\(/.test(src)) await import(…)` before parsing.

**GLSL prelude (`glsl.ts`).**
- **Hash:** `uint ir_ih(int a, int b, uint s)` mirrors `ihash` with `uint` multiplies (GLSL `uint(int)` keeps the bits; `int()` truncates toward zero like JS `|0`).
- **Lattice:** `ivec2 i = ivec2(floor(p))`.
- **Gradients:** a constant `vec2[8]` table.
- **Fade:** the same polynomial.
- **Rotation:** `mat2(.8, .6, −.6, .8)`.
- **Voronoi:** 16-bit point coordinates.

The GPU runs in float32, so parity is a tolerance, not bits. A floor at a lattice line can land on the other side in f32: `scripts/webgl.ts` already counts these as `flips` (`:91-94`). Document that IR noise inputs should stay within |x|, |y| < 4096; past that, f32 spacing (≥ 2⁻¹¹) visibly quantises the fade.

### 2.5 Golden key extension (`scripts/lib/goldenKey.ts`)

**The overview's claim, checked: "append shape/join/rotation only when defined, so 177 hashes stay valid".**
- **Join, rotation, aspect and motif:** the rule holds, because those fields don't exist yet.
- **Shape and roundness: false as stated.** The sampler stamps `shape` (and `roundness`, from `cornerRoundness`) on *every* dot (`gridSampler.ts:45-47,57`), and `DotStyle.shape` is required (`types.ts:22`). Keying on "defined" would change all 177 hashes.

The corrected rule is one table of **optional channels** appended to the per-dot key. A channel appears only when it carries information, so every pre-F0 dot keys exactly as before. This table is the single owner of the key format: Q1–Q3 fill the fields, they never edit `golden.ts`.

| Channel | Appended when | Format | Filled by |
|---|---|---|---|
| shape | `d.shape !== base.shape` or `(d.roundness ?? 0) !== (base.cornerRoundness ?? 0)` | `,s<shape>:<roundness toFixed(3)>` | Q1 `shapeOf` |
| join | `d.join !== undefined` | `,j<mask>:<hx>:<hy>:<ro>:<ri>:<seam>`; mask as an integer, the five `joint` params `toFixed(3)` | Q1 join pass |
| rotation | `d.rot !== undefined && d.rot !== 0` | `,θ<rot toFixed(3)>`, **radians** | Q1 rotation; Q3 snaps to multiples of π/4 but still stores radians |
| aspect | `d.aspect !== undefined && d.aspect !== 1` | `,a<aspect toFixed(3)>` | Q2 rect cells |
| motif | `d.motif !== undefined` | `,m<motif>` | Q3 |

- **Join geometry is in the key** because the bridge and seam params change pixels, not just the mask. `dotKey` throws when `join` is set without `joint`: the sampler must stamp the resolved params on every joined dot, so a change of Q's defaults shows up as a hash change.
- Channel order is the table order, fixed.
- `θ` is one UTF-16 code unit; FNV-1a runs over code units (`golden.ts:23-26`), so it hashes deterministically.

```ts
/** The pre-F0 key (golden.ts:28), kept verbatim. */
export const legacyKey = (d: DotInstance) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`
/** The optional channels, in key order (the table above). Each returns '' when it carries nothing. */
export const CHANNELS: readonly ((d: DotInstance, base: DotStyle) => string)[]
/** Golden key of one dot: legacyKey(d) + every channel's suffix. */
export function dotKey(d: DotInstance, base: DotStyle): string
/** Whole-card dot style: `<shape>:<n 2dp>` with n = squircleExponent(cornerRoundness). Stored per entry, not hashed. */
export function styleSig(s: DotStyle): string
```

**`golden.ts` changes.**
- `Entry` becomes `{ hash; dots; style }`, and the write path always fills `style`.
- `--check` reports `changed` when the hash, the dot count **or** the `style` differs. A whole-card dot→square flip is caught even if it moved no dot centre.
- **The backfill (Option A) happens inside F0.5, once.** `golden.ts` rebuilds the whole file on every write (`:33-49`), so without it the first later track to regenerate would rewrite all 177 entries, and its diff would mix 177 `style` additions with its own changes. After F0.5, later tracks' golden diffs show only added keys.
  - `pnpm golden --backfill-style` computes every entry with the new key, then refuses to write (exit 1, listing offenders) unless every existing preset's `hash` and `dots` equal the file's, and no preset was added or removed. Only then does it write, with `style` added.
  - The check `golden key: backfill kept all 177 hashes` re-reads the old file from `git show HEAD:goldens/hashes.json` and compares every `hash`/`dots` pair.

`types.ts` gains doc-only optional fields on `DotInstance` (`:28`) and `Layer` (`:36`), so Q doesn't have to touch the key again. F0 only declares them; renderers and the sampler ignore them until Q implements their behaviour. The `Layer` copies are per-layer defaults that the Q sampler stamps onto that layer's dots.

```ts
/** Reserved for Q1 (join pass): 12-bit quadrant mask. Renderers ignore it until Q1. */ join?: number
/** Reserved for Q1: resolved join geometry; required whenever `join` is set (the golden key reads it). */ joint?: { hx: number; hy: number; ro: number; ri: number; seam: number }
/** Reserved for Q1/Q3: rotation in radians (Q3 snaps squares to multiples of π/4, stored in radians). */ rot?: number
/** Reserved for Q2: width/height of a rect cell (1 = square). */ aspect?: number
/** Reserved for Q3: motif id inside the cell. */ motif?: string
```

### 2.6 Square cover for `sites` (`src/engine/sampler/cover.ts`, used at `gridSampler.ts:219-226`)

**Today.**
- A site dot hides the card cells whose centre passes `Math.hypot(c − x, r − y) <= reach`, with `reach = k/2 + .25` (`:222-225`).
- **That circle test is wrong for squares:** card dots at a square site's four corners show through.
- **Lattices are already square:** they hide every card cell whose centre falls inside the lattice cell (`:205-207`), so they need no fix. The overview's "sites/lattices" is only half right.

**`hides()` is the single cover rule.** F0 implements all of it, including rotation; Q1–Q3 only pass per-site `n` and `rot` and never edit the predicate. (`Q-squares.md` §1.4 item 1 defers to this.)

```ts
/** The exponent the cover test uses for a style or a per-dot form: 'square' → Infinity, 'superformula' → 2 (it renders as a circle, shapePath.ts:27-28), otherwise squircleExponent(roundness). */
export function coverExponent(shape: DotStyle['shape'], roundness?: number): number
/**
 * Does a site dot of reach R (cells) hide the card cell at offset (dx, dy)? Shaped like the drawn dot.
 * n: from coverExponent. rot: radians (default 0).
 * Bands (with r = cornerRoundness, n = 2 + 30r²):
 *   n ≤ 2.5  (r ≤ 0.129)  circle: Math.hypot(dx, dy) <= R, the legacy expression byte-for-byte; rot ignored.
 *   n ≥ 8    (r ≥ 0.447)  square (Chebyshev): max(ax, ay) <= 1 with a = |offset| / R after un-rotating by rot.
 *   between              superellipse: ax ** n + ay ** n <= 1 after un-rotating by rot.
 * Rotation: rot ≡ 0 (mod π/2) → no rotation (exact); rot ≡ π/4 (mod π/2) → the exact diamond form
 * (square band: ax + ay <= √2); any other rot → offsets rotated by −rot with Math.cos/sin, then the band test.
 */
export function hides(dx: number, dy: number, R: number, n: number, rot?: number): boolean
```

- The n ≤ 2.5 band keeps the existing expression, including `Math.hypot`, so boundary ties can't flip a single golden dot. Every existing preset is in it (n ∈ {2, 2.3}).
- The n ≥ 8 threshold matches the renderer: above `BEZIER_MAX_N = 8` a squircle is drawn as a rounded square (`shapePath.ts:13,23`). The Chebyshev test may hide a card cell under a rounded corner, never leave one showing through.
- The sampler and renderers are not deterministic-sim code, so `**`, `Math.cos` and `Math.sin` are allowed here (outside the lint's paths, F0.9).
- `gridSampler` computes `n = coverExponent(style.shape, style.cornerRoundness)` once per `sampleLayersOnce` call; Q1 passes a per-site `n` and `rot` instead.

### 2.7 Light and tilt input

There are two layers. The engine stays pure; the app owns the sensors.

**There is no `data.light`.** Card data is numbers only (`Record<string, number>`), and `Board.tsx:82` passes a card only the keys it declares in `defaults` (`pick`, `useLiveData.ts:24-30`). The hub publishes plain numeric keys; `sceneLight()` decodes them. Track docs that say `data.light` mean these keys.

**Published keys (the contract).**

| Key | Range | Meaning | Who reads it |
|---|---|---|---|
| `lightSrc` | 0, 1 | 0 = the clock's sun, 1 = tilt (az/el valid) | material and pond cards, via `sceneLight()` |
| `lightAz` | 0..63 | azimuth bucket | via `sceneLight()` / `lightOfBucket` |
| `lightEl` | 0..7 | elevation band over 10°..80° | via `sceneLight()` / `lightOfBucket` |
| `gx`, `gy` | unit vector, 1/32 steps | gravity direction in screen space, ≈ (0, 1) when the phone is held upright; exactly (0, 1) inside the 8° roll dead zone (below) | physics (`world.ts:154-158`), mercury, sand |
| `tx`, `ty` | −1..1, 1/16 steps | tilt offset from the rest pose: (0, 0) at rest, ±1 at the clamped maximum | material and pond cards (parallax, sloshing, highlights). **They never derive tilt from `gx`/`gy`.** |
| `tilt` | 0..4 | `TiltState` code | UI hints only |

**How a consumer opts in.**
1. The card declares every key it reads in `defaults`, with the fixture values (e.g. `{ lightSrc: 0, lightAz: 0, lightEl: 7, tx: 0, ty: 0 }`). Undeclared keys never arrive.
2. The board adds `sources: [lightSource]` **in both places**: the manifest entry's `load()` (`src/widgets/manifest.ts:13-24`, as `live` and `surfaces` do at `:46,49`) and the eager registry (`src/widgets/index.ts`, as at `:52,55`). `tsc` catches a missing board, not a missing `sources`, so F0.8's probe checks the physics board both ways.

**Engine, `src/engine/light/input.ts`.** Imported by path. It is not added to `light/index.ts`, which the engine barrel re-exports (`src/engine/index.ts`, `export * from './light'`).

```ts
export const LIGHT_AZ_BUCKETS = 64, LIGHT_EL_BANDS = 8
/** Data keys a card declares in `defaults` to receive hub light and tilt (Board.tsx:82 passes only declared keys). */
export const LIGHT_KEYS = { src: 'lightSrc', az: 'lightAz', el: 'lightEl', tx: 'tx', ty: 'ty' } as const
/** 0 = the clock's sun (card computes sunAt), 1 = tilt (az/el buckets valid). */
export type LightSrc = 0 | 1
/** Direction → (azimuth bucket 0..63, elevation band 0..7 over 10°..80°). Uses datan2: same bucket in every engine. */
export function bucketLight(dir: Vec3): { az: number; el: number }
/** The bucket centre as a unit direction (lightDir, shade.ts:18). Bake caches key on `az + 64·el` (512 lights max). */
export function lightOfBucket(az: number, el: number): Vec3
/**
 * The light a material card uses this frame, first match wins:
 *  1. a pointer inside the card → torch at it (shade.ts:23; the pattern of widgets/boards/light.ts:164-166);
 *  2. data.lightSrc === 1 → lightOfBucket(data.lightAz, data.lightEl);
 *  3. sunAt(hour) (material.ts:253).
 * Pure in its inputs; goldens see defaults (lightSrc 0) and the frozen clock, so nothing moves.
 */
export function sceneLight(o: { pointer?: { x: number; y: number } | null; data: Record<string, number>; hour: number; torch?: { height: number; falloff?: number } }): Light
```

**App, `src/site/light.ts`.** It is a `Source`, so boards opt in with `sources: [lightSource]` (above). It never enters first load. Nothing runs until a board subscribes: the first subscriber attaches the listeners and the last one detaches them (`source.ts:122-123`). `Board.tsx:78-82` merges it and `pick()` keeps only the keys a card declares (`useLiveData.ts:24-30`). Because board modules also load in the sample worker (§0), the module must not touch `window`/`document` at top level; listeners attach only in `subscribe`.

```ts
export type TiltState = 'unsupported' | 'prompt' | 'granted' | 'denied' | 'insecure'
/** Published keys: lightSrc, lightAz, lightEl, gx, gy, tx, ty, tilt (TiltState code 0..4).
 * Fixture: { lightSrc: 0, lightAz: 0, lightEl: 7, gx: 0, gy: 1, tx: 0, ty: 0, tilt: 0 }. */
export const lightSource: Source
export function tiltState(): TiltState
/** iOS 13+: must run synchronously inside a click handler (no await before it). Android/desktop: resolves at once. */
export function requestTilt(): Promise<TiltState>
/** Pure core for tests: feed orientation samples and a clock, read what would be published. */
export function createLightHub(env: LightEnv): { sample(beta: number, gamma: number, screenAngle: number, now: number): void; data(): Record<string, number>; onEmit(cb: () => void): () => void }
```

**Algorithm.**
1. **Raw gravity in the screen plane, from `deviceorientation`.**
   - g_device = R(α,β,γ)ᵀ·(0,0,−1) = (sin γ·cos β, −sin β, −cos γ·cos β). With screen y down, that gives **gx = sin γ·cos β, gy = sin β**.
   - Upright portrait is (0, 1); landscape-left is (1, 0). There is no gimbal problem for the gravity vector.
   - Rotate by `screen.orientation.angle`.
   - Use `deviceorientation`, not `devicemotion.accelerationIncludingGravity`, because the latter's sign convention has historically differed between iOS and Android.
2. **Low-pass** the vector with a one-pole filter, α = 1 − exp(−dt/τ), τ = 150 ms. Filtering the vector, not the Euler angles, avoids the ±180° wrap of β.
3. **Physics gravity (`gx`, `gy`): publish direction only.**
   - If |g| < 0.3 (the phone is flat), publish (0, 1).
   - Otherwise, with n the 3-D unit gravity (before it is projected onto the screen): if n_y > 0 and |n_x| < sin 8° (gravity within 8° of the screen's vertical plane, i.e. a roll under 8°), publish exactly (0, 1). Else publish the screen direction ĝ = (n_x, n_y)/|(n_x, n_y)|.
   - *As built, roll, not on-screen angle.* The plan first said ĝ·(0,1) > cos 8° (the angle from vertical on screen), but its own F0.7 test, a held phone at β 25°, γ 5°, puts gravity at atan(sin 5°·cos 25° / sin 25°) ≈ 10.6° off vertical on screen, outside that cone. At a shallow β a small γ becomes a large on-screen angle, so the dead zone is measured on the roll instead (`ROLL_DEAD = sin 8°` against n_x, `src/site/light.ts:32-33, 128`): that case has n_x = sin 5°·cos 25° ≈ 0.079 < sin 8° ≈ 0.139.
   - Otherwise quantise to 1/32.
   - Why: `world.ts:154-158` forks a live world whenever |gx − 0| or |gy − 1| > .02, and a live world only heals after it has been quiet. A phone held normally at β ≈ 30–60° must read as "no input", or physics cards would never return to their pristine loop.
4. **Tilt offset (`tx`, `ty`).**
   - The rest pose is the first filtered sample. It re-centres with τ = 20 s while the phone is still.
   - d = ĝ − ĝ_rest (screen plane). Dead zone: |d| < 0.035 (≈ 2°) → (0, 0). Clamp: |d| = 0.4 (≈ 24°) maps to magnitude 1.
   - (tx, ty) = d̂ · clamp((|d| − 0.035) / (0.4 − 0.035), 0, 1), quantised to 1/16 with ¼-step hysteresis. tx > 0 when the right edge tips down.
   - Unlike `gx`/`gy`, these are relative to how the owner holds the phone, so a card never needs to guess "upright".
5. **Light from tilt.**
   - Azimuth is the angle of −d, so a fixed overhead lamp appears to slide the opposite way.
   - Elevation = 80° − 60°·min(1, |d| / 0.4) (the same clamp as `tx`/`ty`).
   - → `bucketLight` with **hysteresis**: a bucket changes only once the filtered azimuth is ¼ bucket past the boundary.
   - `lightSrc` becomes 1 once tilt is granted and the first sample arrives; it falls back to 0 when tilt stops.
6. **Emit** only when a published value changes, and at most 15 Hz. Every emit re-renders the board (`useLiveData.ts:18`). Bucketing and quantising mean a still phone emits nothing.
7. **Stop** on `visibilitychange` → hidden, and on the last unsubscribe.
8. **Reduced motion.** Tilt never auto-starts. An explicit TILT grant still works, but the hub emits at most 4 Hz.

**Permission and UI.**
- **Detection:**
  - `'DeviceOrientationEvent' in window` and a coarse pointer, else `unsupported`;
  - no secure context → `insecure`;
  - a `DeviceOrientationEvent.requestPermission` function exists → `prompt` (iOS);
  - else `granted` (Android fires without a prompt).
  - A desktop that sends one all-null event is `unsupported`.
- **TOOLS sheet button** (`CommandLayer.tsx:62-70`, a lazy chunk): `<b>TILT</b><span>Light and gravity follow your phone</span>`, with `aria-pressed` reflecting `granted`. It is shown only when `tiltState() !== 'unsupported'`, and its `onClick` calls `requestTilt()` first thing. This is the default for owner decision #4. `requestTilt` is also exported so M1 can offer "first tap on a material card" instead. Cards never call `DeviceOrientationEvent.requestPermission()` themselves.
- **Remembering a grant.** `sessionStorage['dot480:tilt'] = 'granted'`. After a reload on iOS, the next `click` anywhere re-calls `requestTilt()` once; it resolves without a prompt. The listener is passive, on `click` (never `pointerdown`/`touchmove`), so it can't claim a touch.
- **Scroll-first** (UX-PLAN §10): tilt is not a touch. It must never engage a card, set `pointers` or block scroll. The browser probe asserts this.
- **Existing listeners.**
  - `FigSim.tsx:15-19` listened without permission (it got nothing on iOS). *Done in the round-2 cleanup:* it subscribes to `lightSource` and leans the hourglass by `tx`; the essay is lazy.
  - `media/useCamera.ts:70-82` stays as it is: it is statically imported by `DotWidget` (first load), and importing the hub there would pull the hub into first load.

### 2.8 Per-card frame rate (`WidgetPreset.fps`)

Today every animated card runs at 12 fps and an engaged or reduced-motion card at 30 (`DotCanvas.tsx:398`); only the live camera overrides it (`DotWidget.tsx:125,128`). Pond creatures and liquid materials need more, and phones need less.

```ts
// src/widgets/types.ts, on WidgetPreset
/** Animation rate on the shared clock while the card is live (default: DotCanvas's 12, or 30 when engaged / reduced motion). Goldens don't see it: they sample fixed t. */
fps?: number

// src/widgets/fps.ts (pure; first-load, a few bytes)
export type FpsTier = 'full' | 'phone'
/** 'phone' on a coarse pointer, or a low-power hint (navigator.connection?.saveData, or navigator.hardwareConcurrency ≤ 4). Read once per page. */
export function fpsTier(): FpsTier
/** full → base; phone → max(12, round(base / 2)), but never above base (so base ≤ 12 is unchanged). */
export function cardFps(base: number, tier: FpsTier): number
```

- `DotWidget` passes `fps={camera.status === 'live' ? 30 : preset.fps !== undefined ? cardFps(preset.fps, fpsTier()) : undefined}`. Cards without `fps` pass `undefined` exactly as today, so no existing card changes rate.
- `DotCanvas` already quantises time per subscriber (`quantizeTime(…, sub.fps)`, `DotCanvas.tsx:414`; `clock.ts:60`), so it needs no change.
- `{interaction.focusSpeed}` (`DESIGN.md:271`) says "at most 1 cell per frame at 12 fps". It becomes "at most 1 cell per frame at the card's fps (12 by default)", and the marching dash must step by time, not by frame.

## 3. Steps

The steps are ordered, each ≤ ~½ day unless noted. "verify" means a named `assert(...)` in the given script.

**verify.ts slots.** Every track inserts its blocks near `scripts/verify.ts:867` (after `algorithmsChecks`), in this order: **noise, light, golden key**, life, squares, materials. F0 owns the first three:
1. `noiseChecks(assert)` (F0.1–F0.4) and the determinism lint (F0.9);
2. `lightChecks(assert)` (F0.7);
3. the golden-key block: key and backfill (F0.5), cover (F0.6), card fps (F0.10).

L, Q and M append their `life`, `squares` and `materials` blocks after F0's, in that order.

### F0.1 Deterministic math module (1 d)
- **Change:**
  - create `noise/dmath.ts`: move `dsin dcos tsin tcos` byte-for-byte;
  - add `datan2`, `dexp`, `dpow`, `ihash`, `rngFor`;
  - re-export from `attractor.ts`;
  - create `noise/index.ts`;
  - create `scripts/noise.ts` with the `loadFactor` and self-run pattern copied from `scripts/algorithms.ts:20-31,149-154`;
  - wire `noiseChecks(assert)` into the noise slot after `verify.ts:867`.
- **Verify** (`scripts/noise.ts`):
  - `noise: dsin/tsin moved unchanged (FNV of 1e5 outputs = goldens/noise.json)`;
  - `noise: datan2 ≤ 1e-9 vs Math.atan2 on 2e6 samples; axes, (0,0)=0, NaN→NaN`;
  - `noise: dexp rel err ≤ 1e-13 vs Math.exp on 1e6 samples over [−708, 709]; dexp(0) === 1; overflow → Infinity, underflow → 0, NaN → NaN`;
  - `noise: dpow rel err ≤ 1e-12 vs Math.pow where |y·ln x| ≤ 50, ≤ 1e-9 elsewhere in the normal range (1e6 samples)`;
  - `noise: dpow integer path (|y| ≤ 64) matches repeated multiplication bit-for-bit; edges 0^0, 0^−1, (−2)^3, (−2)^0.5`;
  - `noise: ihash full-range ints, no aliasing at ±2²³ (hash32 does)`;
  - `noise: rngFor streams differ per id and step`.
  - The FNV hashes of `dexp`/`dpow` over fixed inputs go into `goldens/noise.json`, so the Bun snapshot (F0.9) covers them.
  - Existing `algorithmsChecks` stay green.
- **Done when:** `npx tsx scripts/noise.ts` passes; `npx tsx scripts/algorithms.ts` passes; `npx tsc -b`; `npx oxlint` on the changed files.
- **Docs to update:** `docs/ALGORITHMS.md` (dsin's new home; `dexp`/`dpow` and their accuracy).

### F0.2 Gradient noise and fBm (½ d)
- **Change:** `noise/gradient.ts`: `noise2`, `noise3`, `noise3Grad`, `fbm2`, `turb2`, `ridge2`, `valueNoise2`. Fix the `noise3` scale constant from a 1e6-sample run, and write it down in a comment with the run.
- **Verify:**
  - `noise: noise2/noise3 ∈ [−1,1], max |n| ≥ .9 over 1e6`;
  - `noise: fbm2 ∈ [−1,1], turb2/ridge2 ∈ [0,1], |mean(noise2)| < .02`;
  - `noise: Lipschitz across lattice lines (|Δn| ≤ 4·ε at ε = 1e-4, 1e5 pairs straddling integers)`;
  - `noise: seeds decorrelated (|ρ(seed 1, seed 2)| < .05) and octave seeds distinct`;
  - `noise: fbm2 isotropic (derivative variance along 0° vs 45° within ±15%)`;
  - `noise: noise3Grad matches central differences (h = 1e-5) to 1e-6`;
  - `noise: valueNoise2 ≡ cinema vnoise on 1e5 samples (===)`. Keep a frozen copy of the old function in the test.
- **Done when:** all pass. Budgets (×load, §4) pass.

### F0.3 Voronoi and curl (½ d)
- **Change:** `noise/voronoi.ts` (`voronoi2`, `voronoiBorder2`); `curl2` in `gradient.ts`. Migrate `cinema.ts:115-119` to `valueNoise2`.
- **Verify:**
  - `noise: voronoi2 F1 exact vs 7×7 brute force, all 3 metrics, 1e5 samples (===)`;
  - `noise: F2 exact for l2/linf; l1 F2 mismatch rate ≤ 1e-4 (reported)`;
  - `noise: f1 ≤ f2, id stable per cell, out object reused (no new object per call)`;
  - `noise: voronoiBorder2 ≥ 0, ≈ 0 on bisectors (±1e-9), ≥ (f2 − f1)/2 (lower bound)`;
  - `noise: curl2 = (∂ψ/∂y, −∂ψ/∂x) of ψ by central differences (≤ 1e-5·max|v|)`;
  - `noise: curl2 divergence ≤ 1e-4·max|v| (FD over a 64² patch)`.
  - `pnpm golden --check` after the cinema migration (expect 177/177).
- **Done when:** checks pass; goldens match.

### F0.4 IR builtin pack + GPU parity (½ d + ¼ d browser)
- **Change:**
  - `ast.ts` / `parse.ts` / `emit.ts` / `runtime.ts` / `bytecode.ts` / `reference.ts` exactly as §2.4;
  - create `noise/ir.ts` + `glsl.ts`;
  - add the side-effect imports listed in §2.4;
  - `scripts/lib/webgl-page.ts` imports the pack.
- **Verify** (`scripts/noise.ts`, with `IR_NOISE_FIELDS` exported, 8 fields: plain noise, fbm 1/4/8 oct, turb, the 4 voronoi modes, a let-shadowed `noise` binding):
  - `ir+noise: closure ≡ function ≡ library call on 8 fields, 48×48 × 3 envs (===)`;
  - `ir+noise: "let noise = 3; noise + noise(u, v, 1)" parses (pack names are not reserved)`;
  - `ir+noise: compileBytecode rejects noise() with "not in device bytecode v1"`;
  - `ir+noise: GLSL snapshot = goldens/noise-glsl.json; prelude emitted once per program`.
  - `irChecks` (unchanged 20 fields + `goldens/ir-glsl.json`) and `bytecodeChecks` stay green; that proves the core didn't drift.
  - Browser: write the fields to a temp JSON and run `npx tsx scripts/webgl.ts --fields <it> --no-perf`. Gate: max |Δ| ≤ 1e-3 off lattice lines; flips ≤ 0.5% of cells. Add the same gate to `webgl.ts` as a named noise row.
  - `vite build && npx tsx scripts/site/size.ts --check`: **delta gate**, first load Δ ≤ +0.05 kB gz against the ledger's previous row (`docs/LIVING-MATTER-PLAN.md` §6). Record the before/after numbers in the PR and in the ledger's F0 row.
- **Done when:** all of the above. `grep -c "ir_noise\|0x8da6b343" dist/assets/DotCanvas-*.js` must give 0 (the pack stays out of first load).
- **Docs to update:** `docs/DOT-MATRIX-ENGINE-PLAN.md` (Field IR pack builtins).

### F0.5 Golden key and the one-time `style` backfill (½ d)
- **Change:** `scripts/lib/goldenKey.ts` (the channel table, §2.5); `golden.ts` uses `dotKey(d, p.style)`, writes `style` and compares it; `--backfill-style`; add the reserved fields to `types.ts:28` (`DotInstance`) and `:36` (`Layer`). Then run `pnpm golden --backfill-style` once and commit the rewritten `goldens/hashes.json`.
- **Verify** (golden-key slot in `verify.ts`):
  - `golden key: dotKey ≡ legacyKey on every dot of all 177 presets at t=0 and t=1.3`. This is the direct proof that hashes can't move.
  - `golden key: each channel appears only on its trigger (synthetic dots: shape≠base, join+joint, rot≠0 in radians, aspect≠1, motif); channel order fixed`;
  - `golden key: join without joint throws`;
  - `golden key: backfill kept all 177 hashes` (every `hash` and `dots` in the new file equals `git show HEAD:goldens/hashes.json`; no preset added or removed; every entry has `style`);
  - `golden key: --check reports a style-only change` (synthetic square restyle of one preset in memory).
  - `pnpm golden --check` → `all 177 presets match`.
- **Done when:** the above; `git diff goldens/hashes.json` adds only `"style"` lines (no `hash`/`dots` line changes).
- **Docs to update:** `docs/PROGRESS.md` (the key format and that the backfill is done, so later tracks expect "0 changed, N added").

### F0.6 Square cover for sites (¼ d)
- **Change:** `src/engine/sampler/cover.ts` with `hides()` and `coverExponent()` (§2.6); `gridSampler.ts:219-226` calls it, with n computed once per `sampleLayersOnce` call from `style`.
- **Verify** (golden-key slot in `verify.ts`):
  - `sampler: square site dots hide every card cell under them (shape square and cornerRoundness 1; no card dot centre inside any site's Chebyshev reach)`;
  - `sampler: hides bands: n ≤ 2.5 (r ≤ .129) circle, n ≥ 8 (r ≥ .447) Chebyshev, superellipse between; 'superformula' → n 2`;
  - `sampler: hides rot = π/4 is the diamond ax + ay ≤ √2; rot = π/2 ≡ rot 0; general rot ≡ an explicitly rotated offset`;
  - `sampler: circle/squircle ≤ 2.5 cover ≡ legacy (frozen copy of :222-225) on 1e4 random sites, k ∈ [1, 4]`;
  - `sampler: DotBuffer path emits the same set (sampleLayersInto vs sampleLayers)`.
  - `pnpm golden --check` 177/177. Core change, so the full suite runs in F0.9.
- **Done when:** the above.

### F0.7 Light hub core (½ d)
- **Change:** `src/engine/light/input.ts`; `src/site/light.ts` with a `createLightHub(env)` pure core and a thin browser binding (no top-level `window` access); `scripts/light.ts` + `lightChecks(assert)` in the light slot of `verify.ts`.
- **Verify** (`scripts/light.ts`, fake env and clock):
  - `light: gravity (β90,γ0)→(0,1); (β0,γ90)→(1,0); screen angle 90° rotates`;
  - `light: held phone β∈[25°,70°], |γ|<5° publishes exactly gx 0, gy 1 (world stays pristine)`. Cross-check with `worldAt` from `world.ts` that `engaged` is false.
  - `light: tx, ty = 0 at rest and inside the 2° dead zone; ±1 at ≥ 24° offset; 1/16 steps; independent of the rest pose's β`;
  - `light: low-pass reaches 63% ± 3% at τ = 150 ms`;
  - `light: az bucket hysteresis, ±0.2 bucket jitter around a boundary → ≤ 1 change`;
  - `light: emits ≤ 15 Hz; still phone emits 0 after settling`;
  - `light: hidden tab detaches listeners; last unsubscribe detaches`;
  - `light: reduced motion, no auto-start; granted → ≤ 4 Hz`;
  - `light: iOS fake requestPermission 'granted' attaches, 'denied' → state denied, no listener`;
  - `light: sceneLight precedence pointer > tilt > sun; lightOfBucket∘bucketLight round-trips the bucket`;
  - `light: importing src/site/light.ts with no window defined doesn't throw (worker safety)`.
- **Done when:** checks pass; tsc and oxlint clean.
- **Docs to update:** `DESIGN.md` › Light. **F0 owns that section**: the published keys table (§2.7), the precedence, the opt-in rule (declare in `defaults`, `sources` in manifest and registry), the TILT button. L and M add rows to it, they don't restructure it.

### F0.8 Hub UI, first consumer, browser probe (½ d)
- **Change:**
  - **TILT** in `ToolsSheet` (§2.7);
  - physics board: `export const physicsSources = [lightSource]`; the manifest entry at `manifest.ts:52` adds `sources: m.physicsSources`, and the eager registry at `index.ts:58` adds `sources: physicsSources` (both places, §2.7); the five cards' `defaults` gain `gx: 0, gy: 1`;
  - optional: FigSim on the hub.
  - `scripts/light-browser.ts`, modelled on `scripts/site/mobile.ts`: 390×844, `hasTouch`, an injected `DeviceOrientationEvent.requestPermission` stub via `Page.addScriptToEvaluateOnNewDocument`, and orientation via CDP `DeviceOrientation.setDeviceOrientationOverride`.
- **Verify:**
  - Goldens 177/177. The physics worlds default to `[0, 1]` (`world.ts:192`, with no `gravity` in `boards/physics.ts`), so the new defaults equal today's input.
  - `light: physics board lists lightSource in both the manifest load() and the eager registry` (verify, light slot).
  - The probe:
    - `TILT shown only with the stub; tap → granted`;
    - `γ = 40° → the PIT card's world goes live (snapshot gx ≠ 0)`. *As built:* the physics board has no sand card; the probe uses `phys-pit` (`scripts/light-browser.ts`);
    - `γ back to 0 → gx 0, gy 1 within 300 ms`;
    - `vertical swipe on a physics card still scrolls the page with tilt live (UX §10)`;
    - `no React re-render storm: ≤ 15 board renders/s while sweeping γ` (count via a dev-only render counter or the emit counter).
  - Size: `physics` chunk delta reported (`size.ts --board physics`); first load Δ = 0; worker chunk delta reported (`size.ts --worker` once F0.11 adds it, else gzip of `sampleWorker-*.js`).
- **Done when:** the probe passes; a **real-iPhone checklist** (permission prompt appears once, light follows, gravity follows, Safari restart re-asks) is written into PROGRESS for the owner.
- **Docs to update:** `docs/PROGRESS.md` (the iPhone checklist); `CHANGELOG.md` + an `upcoming` row in `src/changelog.ts` (`:142`) at merge (TILT is the first visitor-visible F0 change).

### F0.9 Determinism lint, docs, full suite (¼ d)
- **Change:** add `scripts/lib/detLint.ts` and the check `det: no engine-specific Math in deterministic paths`. **This is the single determinism lint; tracks must not write their own scans.** They are pre-registered here.
  - `detLint(paths)` takes a list of path prefixes (directories or file stems). F0 registers `DET_PATHS`:
    - `src/engine/noise/`;
    - `src/engine/life/` (L);
    - `src/engine/matter/sand`, `src/engine/matter/mercury` (the M sim files; M's bakes are not scanned);
    - `src/engine/squares/tetris` (the Q sim).
  - A path that doesn't exist yet is skipped with a notice, so the tracks never edit the lint, only create the files. A track that adds a new sim file adds one line to `DET_PATHS`, nothing else.
  - The scan strips comments. It fails on `Math.(random|sin|cos|tan|asin|acos|atan|atan2|hypot|exp|expm1|log|log1p|log2|log10|pow|cbrt|sinh|cosh|tanh)`, and on the `**` operator with a non-integer literal exponent. The replacements are `dsin`/`tsin`/`datan2`/`dexp`/`dpow` and `rngFor`.
  - Escape hatch: a same-line `// det-ok: <reason>`. `voronoi.ts` should need none. `hides()` uses `**` and `Math.cos`, but it lives in the sampler, outside the scanned paths.
  - Existing physics (`pbd.ts`, `particles.ts`) is not registered; its `Math.hypot`/`Math.atan2` use stays logged as debt (R9).
  - It runs inside `noiseChecks` (noise slot).
  - The determinism guidance goes into `src/engine/noise/index.ts`'s header:
    - seed with `rngFor(seed, id, step)`;
    - fixed `dt`;
    - sort with an id tie-break;
    - no `Math.*` from the ban list in a step.
- **Verify:**
  - `det: a planted Math.sin in a temp file under a registered path fails; det-ok passes; unregistered paths ignored`.
  - Optional cross-engine run: `bun scripts/noise.ts --snapshot` must print the same hashes as Node (`noise: Bun/JSC snapshot ≡ Node/V8`, including `dexp`/`dpow`). The check is skipped with a notice when `bun` isn't on PATH. In this repo it is available, and the prototype already matched.
  - The full suite, since F0 touched the sampler, `types` and the IR: `pnpm check`, `pnpm golden --check`, `vite build` + `size.ts --check`, `scripts/webgl.ts`, `scripts/site/mobile.ts`, `scripts/light-browser.ts`.
- **Done when:** everything is green; goldens 177/177; first load within the ledger's F0 row (Δ ≤ +0.05 kB gz in total for F0.1–F0.9).
- **Docs to update:** `docs/ALGORITHMS.md` (determinism rules, the lint), `docs/DOT-MATRIX-ENGINE-PLAN.md` (the `noise/` module), `docs/README.md` (this folder), `docs/PROGRESS.md`; `CHANGELOG.md` + `src/changelog.ts` `upcoming` rows at merge.

### F0.10 Per-card fps and the phone tier (½ d, includes one full-suite run)
- **Change:** `WidgetPreset.fps?: number` in `src/widgets/types.ts`; `src/widgets/fps.ts` (`fpsTier`, `cardFps`); `DotWidget.tsx:125,128` passes the preset's fps (§2.8). No existing preset sets `fps`.
- **Verify** (golden-key slot in `verify.ts`):
  - `fps: cardFps full → base; phone → max(12, round(base/2)), never above base (12 → 12, 30 → 15, 60 → 30, 20 → 12)`;
  - `fps: no existing preset declares fps (so DotWidget passes undefined, as today)`;
  - `fps: a card with fps 30 subscribes at 30 on desktop and 15 on a coarse-pointer page` (browser: `scripts/site/mobile.ts` gets one row reading the X-ray probe's `fps`, `Inspector.tsx:131`).
  - `pnpm golden --check` 177/177 (goldens sample fixed t, `golden.ts:19`).
  - **Core change** (`widgets/types`, `DotWidget`): run the full suite once (`pnpm check`, `pnpm golden --check`, `vite build` + `size.ts --check`, the browser probes).
  - Size: first load Δ ≤ +0.02 kB gz (its ledger row).
- **Done when:** the above. L and M can set `fps` on their cards.
- **Docs to update:** `DESIGN.md:271` (`{interaction.focusSpeed}`: "at the card's fps, 12 by default", stepped by time); `DESIGN.md`'s renderer/animation rules gain one line on `fps` and the phone tier; `docs/PROGRESS.md`.

### F0.11 First-load cut (½ d; must merge before Q1.4)
First load is 148.14 of 150 kB gz. The planned growth across the tracks (ledger in `docs/LIVING-MATTER-PLAN.md` §6):

| Row | Δ kB gz | Running total |
|---|---|---|
| baseline (ef4dcd8) | — | 148.14 |
| F0 (IR hook + cover) | +0.05 | 148.19 |
| F0.10 fps plumbing | +0.02 | 148.21 |
| Q1 | +0.6 | 148.81 |
| Q2 | +0.3 | 149.11 |
| Q3 | +0.1 | 149.21 |
| four new manifest rows | ≈ +0.25 | ≈ 149.46 |
| X1 | up to +0.5 | ≈ 149.96 |

That leaves no headroom, so F0.11 lands a cut of **≥ 1 kB gz** first.

- **Change:**
  - Investigate with `scripts/site/size.ts` (it lists every first-load chunk, `size.ts:34-36`) and the chunk contents in `dist/assets/`. Candidates to measure, not conclusions:
    - the IR core inside `DotCanvas-*.js` (95.6 kB gz), pulled in by `passes.ts:12` only for GPU-tagged layers: load `parse`/`emitGLSL`/`irProgram` lazily when the first GPU layer appears;
    - `migrate-*.js` (2.04 kB) and `flipdisc-*.js` (1.25 kB): check whether anything before first paint needs them;
    - the `henry-*.js` home board (5.12 kB) and `types-*.js` (8.17 kB): rarely-used code that rides along.
  - Land the cut that measures ≥ 1 kB gz with no pixel change.
  - Add `--worker` to `size.ts`: prints the gz size of `sampleWorker-*.js` (152.7 kB today) and, with `--check`, fails when it grows more than its ledger row.
  - Replace absolute size gates across F0 with delta gates: each PR's Δ must be ≤ its ledger row, `size.ts --check`'s 150 cap stays as the backstop, and the PR updates the row with the measured number.
- **Verify:**
  - `vite build && npx tsx scripts/site/size.ts --check`: first load ≤ (previous row − 1.0) kB gz;
  - `pnpm golden --check` 177/177; the browser probe for whatever area the cut touched (`scripts/webgl.ts` if it is the IR core).
- **Done when:** the cut is merged and the ledger shows the new baseline, before Q1.4 merges.
- **Docs to update:** `docs/LIVING-MATTER-PLAN.md` §6 (the ledger); `docs/PROGRESS.md`.

## 4. Budgets

Per-call costs come from the prototype at 144² unless noted, normalised to load factor 1. Each gate is about 1.5× the measured cost, × the measured load factor at run time (`scripts/algorithms.ts` pattern):

| Call | Measured | Gate (`scripts/noise.ts`) | Rule for cards |
|---|---|---|---|
| `noise2`, 144² | 0.75 ms | ≤ 1.2 ms | OK per frame, but only for a single octave |
| `fbm2` 4 oct, 144² | 3.2 ms | ≤ 4.5 ms (bake path) | **Never per frame at full res.** Bake once (materials: static relief), or sample on a lattice |
| `fbm2` 4 oct, 48² (lattice 3) | 0.52 ms | ≤ 0.8 ms | per-frame OK (koi markings in body UV are far fewer cells) |
| `voronoi2` l2 / l1 / linf, 144² | 2.4 / 1.55 / 2.3 ms | ≤ 3.5 ms each | bake (panes, terrazzo); per frame only on lattices ≥ 2 |
| `curl2` 2 oct, 1000 points | ≈ 0.1 ms (est. 4× `noise2` per point) | ≤ 0.3 ms | per frame for agents and particles |
| `datan2`, 1e6 calls | 1.3× `Math.atan2` | ≤ 2× | free at agent counts |
| `dexp` / `dpow`, 1e6 calls | measured in F0.1 | ≤ 4× `Math.exp` / ≤ 6× `Math.pow` | per agent per step is fine; not per cell per frame at 144² |
| light hub | ≤ 15 emits/s; 0 when still | probe | n/a |

- **First load: delta gates against the ledger** (`docs/LIVING-MATTER-PLAN.md` §6, table in F0.11), never absolute numbers.
  - `noise/*` is never imported by first-load code: it is outside the engine barrel, and `light/input.ts` is imported by path.
  - The F0 row (+0.05 kB gz) covers the IR registry hook (§2.4) and `cover.ts` (§2.6), measured before and after with `size.ts --check`.
  - If the hook measures more, fall back to the zero-byte variant: the pack mutates the existing `IR_FUNCTIONS`/`irMath` objects at run time, and only `emit.ts` gains the 1-line helper branch. *As built:* F0 shipped the zero-byte variant, measured +0.03 kB gz.
  - F0.10's row is +0.02 kB gz. F0.11's row is ≤ −1.0 kB gz.
- **Worker chunk:** reported per PR by `size.ts --worker` (F0.11), with its own ledger row. F0 adds only `src/site/light.ts` to it (through the physics board).
- **Goldens:** none move. F0.5 adds `style` to every entry once, with all hashes unchanged. Each step that can touch pixels re-runs `pnpm golden --check`: F0.3 (cinema), F0.5 (key), F0.6 (sampler), F0.8 (physics defaults), F0.10 (fps) and F0.11 (the cut).
- **GPU:** the noise prelude compiles once per program (`gpuIR`'s `glslCache`, `passes.ts:32-33`). 8-octave `fbm` on 500k GPU dots should be measured in `webgl.ts` perf, report only.

## 5. What the other phases consume

| Phase | From F0 |
|---|---|
| **L1 pond hero** | `noise2`/`fbm2` (`koiPattern` thresholds and noise-warped marking edges in body UV); `curl2` (lily-pad drift); `datan2` (heading, chain joint angles in `chainFollow`, Sobel angle → `EDGE4` snapping in `glyphTiles`); `tsin`/`tcos` (swim wave `A(s)·sin(phase − 4.6 s)`, burst-and-glide beat); `dexp` (damping); `rngFor` (per-koi seeds, 3% tile flicker, pellet scatter); `ihash` (per-cell jitter); `WidgetPreset.fps` (F0.10) for the koi card; the determinism lint (`src/engine/life/` is pre-registered); the golden key (unchanged; glyph tiles are ordinary dots, so "0 changed, N added") |
| **L2 ecosystems** | `tsin`/`tcos` + `rngFor` (physarum sensors, ant wander); `curl2` (marine snow); `datan2` (boids heading); `dexp` (Particle Lenia kernels, XL); fps; lint |
| **L3 pond senses / L4 hero** | `tx`/`ty` and the `lightSrc`/`lightAz`/`lightEl` keys via `sceneLight()` (declared in `defaults`; `/pond/` adds `sources: [lightSource]` in manifest and registry); never `gx`/`gy` for tilt; fps phone tier for the full-bleed hero |
| **Q1 squares core** | `hides()` (§2.6) as the single cover rule, with per-site `n` and `rot`; the golden key's `,s` and `,j` channels and `style` sig; the reserved `join`/`joint`/`rot` fields; `voronoi2(…, 'linf' / 'l1')`; `ihash` (Schotter/Molnár rotations, block glitch); Q1.4 waits on F0.11 |
| **Q2** | the `,a` channel and the reserved `aspect`; `voronoi2` for the square field pack |
| **Q3** | the `,θ` channel (radians; π/4 snaps stored as radians) and `,m` channel with the reserved `motif`; `hides()` with `rot` = k·π/4 (exact diamond branch); `src/engine/squares/tetris` pre-registered in the lint |
| **M1 materials core** | `fbm2`/`turb2`/`ridge2` (marble turbulence-sine, rust patina, stone, leather, sand); `voronoi2` l2 + `id`/`x,y` (terrazzo chips, grille plates); `sceneLight`, `bucketLight`/`lightOfBucket` (cache key `az + 64·el` for baked shading); `tx`/`ty` for tilt parallax; `lightSource` and the TILT flow (owner decision #4); `datan2` (radial tangent for the spun-knob `anisoSpec`); `dpow` (specular in deterministic steps); fps |
| **M2 glass and water** | `voronoiBorder2` (stained-glass lead moats); IR `noise`/`fbm`/`voronoi` on the GPU path (density > 1 fallback); `gx`/`gy` (mercury, as gravity) and `tx`/`ty` (sloshing highlights); `curl2` (caustic-pool drift); `src/engine/matter/mercury` pre-registered in the lint |
| **M3 growth and wear** | `dexp`/`dpow` (erosion, Lichtenberg, frost growth: bit-identical pristine runs across Node and Chrome); `src/engine/matter/sand` pre-registered in the lint; `sceneLight` |
| **XL / XQ / XM** (advanced additions inside the tracks) | the same toolkit; any new deterministic scalar goes into `dmath.ts` with a test (§2.1), any new sim path into `DET_PATHS` (F0.9) |
| **X1 pond depth** | its first-load row (≤ +0.5 kB gz) in the ledger F0.11 opens; `tx`/`ty`; fps |
| **X2 GPU** | the IR noise pack and its GLSL prelude (§2.4); the f32 tolerance and flip budget in `webgl.ts` |

## 6. Parallelism and estimate

```
lane F0-A (noise):        F0.1 → F0.2 → F0.3 → F0.4       2.75 d   (dmath incl. dexp/dpow, gradient, voronoi, IR pack)
lane F0-B (pixels):       F0.5 → F0.6                      0.75 d   (key + backfill, cover, reserved types; independent of A)
lane F0-C (light):        F0.7 → F0.8                      1.0 d    (needs datan2 from F0.1 for bucketLight; stub with Math.atan2 until merge)
lane F0-D (fps + budget): F0.10 → F0.11                    1.0 d    (independent; F0.11 must merge before Q1.4)
join:                     F0.9                             0.25 d
```

- **Serial:** ≈ 5 agent-days (5.75 if every step takes its top estimate).
- **With four lanes:** ≈ 3 days wall-clock; lane F0-A plus the join is the critical path.

File overlap between lanes:
- `scripts/verify.ts`: separate blocks in F0's three slots (noise: A and the join; light: C; golden key: B and D);
- `docs/PROGRESS.md` and `DESIGN.md` (different sections: Light is C, `:271` and the animation rules are D);
- B and C touch nothing in `src/engine/noise/`;
- only B touches `src/engine/types.ts` and `goldens/hashes.json`; only D touches `src/widgets/types.ts`, `DotWidget.tsx` and `size.ts`.

Merge order: B first (it pins goldens and does the backfill, so every later golden diff is additions only), then A, then C, then D's F0.10. F0.11 merges when ready, before Q1.4.

## 7. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | First-load creep: the IR core is in `DotCanvas-*.js`, `math.ts` is a first-load chunk, and the tracks' planned growth reaches ≈ 150 kB gz | Implementations live in the lazy pack; nothing goes into `math.ts`; the hook is gated at +0.05 kB with a zero-byte fallback (§4); grep `dist` for the pack's constants (F0.4); delta gates against the ledger; F0.11's ≥ 1 kB cut before Q1.4 |
| R2 | "Append when defined" would silently re-hash all 177 presets (shape is always defined) | Base-style-relative channel table; `dotKey ≡ legacyKey` on every dot of every preset is a verify check (F0.5) |
| R3 | The cover change flips a boundary dot on existing cards | Legacy `Math.hypot` path kept byte-for-byte for n ≤ 2.5 (all 177 presets); frozen-copy equivalence check (F0.6) |
| R4 | GPU f32 lattice flips make IR noise differ at cell lines | Tolerance + flip budget (≤ 0.5%) in `webgl.ts`; 16-bit feature coordinates; document |x|,|y| < 4096 |
| R5 | Full-res fbm/voronoi per frame blows the 4 ms card budget | Table in §4 is normative: bake or lattice; L/M card budgets are checked in their own phases |
| R6 | Pack names collide with saved programs that bind `noise` | Pack names are not reserved (`isCoreFn` for bindings); a check parses a shadowing program (F0.4) |
| R7 | Tilt semantics: signs, landscape, iOS gesture rule, insecure LAN dev | Orientation-based formula with screen-angle rotation; CDP override probe; real-device checklist; `insecure` state hides the button |
| R8 | Tilt keeps physics worlds live forever, or re-renders boards at sensor rate | Direction-only gravity with an 8° dead zone → exact (0,1) at rest; `tx`/`ty` dead zone and 1/16 steps; emit on change ≤ 15 Hz; probe counts renders |
| R9 | Existing physics steps already use `Math.hypot/atan2/cos` (`pbd.ts:152,235,262`, `particles.ts:86,93,188`), so pristine runs are V8-specific | Out of F0 scope; the lint covers registered paths only. Logged in PROGRESS as debt (only matters if goldens ever run outside Node) |
| R10 | Cross-engine determinism isn't proven by Node-only CI | One op ban-list lint over registered paths; a recorded `goldens/noise.json` (incl. `dexp`/`dpow`); a Bun/JSC snapshot check (available here; already matched on the prototype) |
| R11 | `hash32` aliases large integers (fixed-point ×256) | `ihash` for ints and steps; documented in both doc comments |
| R12 | IR's own `sin`/`cos`/`atan` use `Math.*` (`runtime.ts:14,19`), so IR cards aren't cross-engine-identical | Unchanged on purpose: GLSL parity matters more there. The noise builtins are deterministic on the CPU regardless |
| R13 | The sample worker imports the eager registry (`workers/protocol.ts:10` → `src/widgets/index.ts`), so every engine module a board imports ships in `sampleWorker-*.js` (152.7 kB gz; algo-stipple is already in it), and a board module that touches `window` at load breaks the worker | `src/site/light.ts` has no top-level DOM access (F0.7 check). Recommend that pond and material boards stay main-thread cards, like `physics.ts:36-37`, and that their heavy modules are kept out of the worker's registry path (e.g. a worker-side preset list that omits those boards). `size.ts --worker` (F0.11) reports the worker chunk per PR against its ledger row. **Done (worker split, 2026-10-29):** the worker loads one board chunk per card through the manifest, pond and physics are worker-build stubs; initial worker load 178.31 → 17.14 kB gz (LIVING-MATTER-PLAN §6) |
| R14 | A higher per-card fps doubles phone CPU and battery | The phone tier halves it (min 12); no existing card changes rate; L/M budgets are per frame at the declared fps |

## 8. Open points for the owner
1. **TILT placement** (overview decision #4). F0 ships the TOOLS-sheet button; M1 may add "first tap on a material card".
2. **Physics as first hub consumer** (F0.8). It's the cheapest real test of tilt. If the owner would rather keep physics as it is, the probe can use a scratch board instead.
3. **Which first-load cut** (F0.11). F0.11 measures the candidates and proposes one; if it changes when something visible loads (e.g. a lazy IR core delays the first GPU card by one chunk fetch), the owner picks.

(The golden `style` backfill is no longer open: it is done once inside F0.5, per the shared contract.)
