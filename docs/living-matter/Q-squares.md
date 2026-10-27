# Track Q: squares (spaced and joined), implementation plan

> Status: **planned** (2026-10-27). This is part of [LIVING-MATTER-PLAN](../LIVING-MATTER-PLAN.md) §4 and turns its sketch into phases Q1–Q3.
> It depends on **F0** deliverables owned by the foundation track ([F0-foundation.md](F0-foundation.md)): the square cover rule `hides(n, rot)` (F0.6), the golden key and the reserved `DotInstance` fields (F0.5), the determinism lint (F0.9), `dmath` and `voronoi2` (F0.1, F0.3), and the first-load cut (F0.11). Q depends on them by name and never restates them. The contracts are in §1.4 and the shared-file rules in §1.5.
> Phase names across the set: F0, L1–L4, Q1–Q3, M1–M3, XL, XQ, XM, X1, X2.
> Rules that hold throughout (AGENTS.md):
> - every visual goes Field → Sampler → Renderer;
> - one accent per board;
> - UI dot sizes are quantized;
> - `src/engine` stays framework-free with no new dependencies;
> - the 177 existing goldens stay byte-identical;
> - first-load JS stays ≤ 150 kB gz. Each phase has a **delta** gate against the ledger in [LIVING-MATTER-PLAN §6](../LIVING-MATTER-PLAN.md): Q1 ≤ +0.6 kB gz (+0.4 on the array-path fallback), Q2 ≤ +0.3, Q3 ≤ +0.1 (§2.10). New code goes behind lazy paths.

## 0. What exists today (verified in code)

| Fact | Where |
|---|---|
| Shape and roundness are per **style**. `DotInstance` carries `shape` and `roundness` per dot, but the sampler stamps both from `style` | `src/engine/types.ts:21-28`, `src/engine/sampler/gridSampler.ts:45-47,57` |
| `DotBuffer` keeps shape and roundness **per frame**, in 5 SoA arrays inside one `ArrayBuffer` at 17 B/dot | `src/engine/buffer/dotBuffer.ts:9-20,24,51-53` |
| `composite()` returns `best` (max value) and `owner` (layer index + 1) per cell over a window, so a neighbour lookup is O(1) | `gridSampler.ts:121-132` |
| A lattice dot clears the card cells **whose centre lies inside the lattice cell**. That is already a square rule | `gridSampler.ts:205-207` |
| A site dot clears cells within a **circle**, `Math.hypot(c - x, r - y) <= k/2 + .25`, so a square site leaves card dots showing at its corners | `gridSampler.ts:222-225` |
| Emit order: lattice groups (largest first), then sites, then the base composite | `gridSampler.ts:193-233` |
| SVG: one `<path>` def per (shape, roundness, r), placed with `<use>`. Groups use `fill-opacity` | `src/engine/renderer/svgRenderer.ts:19-35,39` |
| Canvas: one `Path2D` and one `fill()` per (colour, opacity). `addDotShape` handles `square` as `rect` | `src/engine/renderer/canvasRenderer.ts:15-17,39-55`; buffer path `canvasBuffer.ts:15-33` |
| WebGL2: the instance is `aDot` vec4 (x, y, r, opacity) plus `aShape` vec2 (exponent, palette index), stride 24 B. The exponent is per instance; n < 1 gives the box SDF | `src/engine/renderer/webgl/dotgl.ts:70,234-235,257,309`; `shaders.ts:24-41,81-94` |
| A GPU pass refuses `sites`, `sizeCurve` and `jitter`, and those layers stay CPU instances | `src/engine/renderer/webgl/passes.ts:70-73` |
| Goldens hash only `x, y, r, opacity, colour` | `scripts/golden.ts:28,36` |
| Goldens go through `sampleCard` → `sampleLayers`, **with no skin anywhere** | `scripts/lib/cards.ts:30-31` |
| Skins are a browser-only post-raster stage | `src/components/skins/SkinOverlay.tsx:144`; DESIGN.md:362 ("Goldens are untouched") |
| Snap raster: `square` gives superellipse n = 40, and `Raster.dot` is a 4×4 supersampled superellipse | `scripts/lib/cards.ts:57-60`; `scripts/lib/raster.ts:27-37` |
| The renderer switch (svg ≤ 2000 visible static dots, otherwise canvas or webgl) lives in `DotCanvas`, which loads on first paint, as do the sampler, renderers and DotGL | `src/components/DotCanvas.tsx:3-10,76,278` |
| The worker transfers only `bytes`. Shape and roundness travel as scalars | `src/workers/protocol.ts:24,34-36`; `src/workers/client.ts:53-63` |
| Worker eligibility: every non-media preset | `src/widgets/registry.ts:19` |
| The worker imports the **eager** widget registry, so every board module (and whatever it imports) ships in the worker chunk. `size.ts` follows only the entry's static closure, so the worker chunk is not measured today (`sampleWorker-*.js` is 153.55 kB gz in the current `dist/`) | `src/workers/protocol.ts:10`; `src/workers/client.ts:26`; `scripts/site/size.ts:20-27` |
| No existing preset uses `shape: 'square'` (grep over `src/widgets`). Card styles are `tileStyle` (`cornerRoundness .1`, n = 2.3) or round, so every existing site stays in the legacy band of F0's `hides` | `src/widgets/types.ts:55-57` |
| Tile geometry: `TILE` = 144×144 at pitch 2.25 (half pitch h = 1.125 px); `tileStyle` has sizeMax .95 and cornerRoundness .1 | `src/widgets/types.ts:54-57` |
| Squircle corner radius for n > 8: `r·cornerFraction(n)` | `src/engine/renderer/shapePath.ts:8,12,17-24` |
| A test portrait field exists | `src/widgets/boards/mirror.ts:43` (`portrait(x, y, eyes)`) |
| Pattern for a new board: lazy manifest entry, eager registry, board blurb, card metadata, uids, goldens added for the new keys only, an area script wired into verify | commits `230b5a3` and `43f1bc0`: `src/widgets/manifest.ts:55`, `src/widgets/index.ts:27,61`, `src/widgets/blurbs.ts:33`, `src/widgets/meta.ts:307-310`, `src/widgets/ids.json` and `catalog.ts` via `scripts/widgets/ids.ts --assign`, `scripts/algorithms.ts`, `scripts/verify.ts:54,866-867` |

## 1. Cross-cutting design

### 1.1 Geometry vocabulary (one cell)

- **P** = cell pitch in card px, which is `k · pitch` on a lattice. **h** = P/2.
- **r** = the dot "radius" the sampler emits (`gridSampler.ts:55`). For a square it is the half side. Call the drawn half side **s**.
- **Gutter (`{grid.gap}`, `DotStyle.gap`, a fraction of P):** `s = min(r, (1 − gap)·h)`. Two full-level neighbours then leave a clear gutter of exactly `gap·P`. The default is `undefined`, which means no clamp, so today's output is unchanged.
- **Joined side:** the cell's outline reaches `hj = h − seam·P/2` on that side, instead of `s`.
- **Square-like:** a dot whose cover F0's `hides(n, rot)` takes on its Chebyshev branch (n ≥ 8, or `square`). Q uses that one predicate (exported next to `hides`) for the gap clamp and the join-style rule, and defines no roundness threshold of its own.
- **Outer radius ro:** the convex corner radius. It defaults to the renderer's own corner, `s·cornerFraction(n)` for squircles drawn as rounded squares (n > `BEZIER_MAX_N` = 8, `shapePath.ts:12-13,21`), and to 0 for `square`, so an isolated join cell looks exactly like a plain dot.
- **Inner radius ri:** the concave fillet at a notch. It defaults to 0.

### 1.2 Join mask: 12 bits, 3 bits per quadrant

The quadrant order is clockwise from top-left. Each quadrant reads one horizontal neighbour **H**, one vertical neighbour **V** and one diagonal **D** (screen y points down, N = row − 1):

| bits | quadrant | H | V | D |
|---|---|---|---|---|
| 0–2 | q0 NW | W | N | NW |
| 3–5 | q1 NE | E | N | NE |
| 6–8 | q2 SE | E | S | SE |
| 9–11 | q3 SW | W | S | SW |

There are 8 (H, V, D) states per quadrant. They reduce to **5 quadrant shapes**. Code values 5–7 are reserved, and code 5 = `DIAG` is the Q3 `conn: 8` bridge.

| code | name | condition | quadrant shape, in local coords `a = |p − c|` (quadrant spans [0, h]²) |
|---|---|---|---|
| 0 | `CONVEX` | ¬H ∧ ¬V | box [0, s]² with its outer corner rounded by ro |
| 1 | `EDGE_H` | H ∧ ¬V | [0, hj] × [0, s]: flat top edge, runs into the horizontal neighbour |
| 2 | `EDGE_V` | ¬H ∧ V | [0, s] × [0, hj] |
| 3 | `FULL` | H ∧ V ∧ D | [0, hj]² |
| 4 | `INNER` | H ∧ V ∧ ¬D | [0, hj]² minus the notch {a.x > s, a.y > s}. The notch's corner at (s, s) is rounded by ri (a concave fillet, which adds a web into the notch) |

Why INNER is a notch and not FULL: insetting an L-tromino by `d = h − s` moves its concave corner **into** the corner cell, so the corner cell's quadrant is full except for a d×d notch. When `gap = 0` and s = h, the notch has zero size and INNER = FULL.

D is read only when H ∧ V. That is the blob-tileset corner rule, so the 256 neighbourhoods give exactly **47** distinct masks (checked in `squares.ts`).

Special masks:
- `0` = all CONVEX, an isolated join cell;
- `0x6DB` (1755) = all FULL, an interior cell. Every renderer draws it as one rect.

**Packed per-dot value** (`DotBuffer.join`, Uint16):
- bits 0–11: the mask;
- bits 12–15: the joint slot (0–14), which indexes the frame's `joints` table;
- `0xFFFF`: not a join dot.

### 1.3 Merge rule (the key)

Two neighbouring cells merge only when **all** of these hold:
- both winning layers have `join`;
- they have the same **resolved group**: `JoinSpec.group` is a number (default 0) or a function `(u, v) => number` evaluated once per cell, so pieces and dominoes can carry ids;
- they have the same resolved tone index (`toneIndex`, `dotBuffer.ts:38-48`);
- they have the same **quantized step**;
- each cell's own `shown(value) ≥ at`;
- neither cell is covered by a lattice or site dot.

There are two further rules:
- **Accent:** `active` and `activeDim` cells never merge unless `join.accent === true`.
- **Quantization:** join needs `quantizeSteps ≥ 2`. On unquantized (photo) styles, join is ignored with one dev warning. That keeps "quantize UI dot sizes" intact and gives every merged blob a single r.

The merge rule implies the paint rule. Merged cells share tone and level, so they share colour and opacity (`opacity = shown value`, `gridSampler.ts:55`). They therefore land in **the same Canvas `Path2D` group** (`canvasRenderer.ts:43`, `canvasBuffer.ts:21`), and one nonzero `fill()` of abutting clockwise sub-paths has no conflation seam. The Canvas renderer gets seamless joins for free; SVG and WebGL need the measures in §2.

### 1.4 Contracts with F0 (depend by name)

1. **F0 square cover (`hides`, F0.6, F0 §2.6).** F0's `hides(dx, dy, R, n, rot = 0)` is the **single** cover rule for sites: the legacy `Math.hypot` test for n ≤ 2.5, a superellipse for 2.5 < n < 8, Chebyshev from n ≥ 8 (and `square`). Q defines no cover thresholds of its own.
   - Q1.4 only **feeds** it: per-site n from `shapeOf` (the snapped roundness → `squircleExponent`) instead of the style's, and Q3.1 passes `rot` (a 45° square is `ax + ay ≤ √2`, the branch F0 leaves for it).
   - Lattice cover is already square (`gridSampler.ts:205-207`), and Q2's rect lattices keep that centre-inside rule per axis.
   - No existing preset leaves the legacy band (§0), so goldens stay 177/177.
   - Q1 needs this for `sq-quads` (square sites) and adds a check that a 4-cell square site clears all 16 card cells under it.
2. **F0 golden key (F0.5 owns it, F0 §2.5).** `dotKey(d, base)` in `scripts/lib/goldenKey.ts` replaces `q(d)` at `scripts/golden.ts:28`. Q does not define key suffixes; it only produces the fields F0's optional channels read:

   | channel (F0.5) | appended when | Q phase that first emits it |
   |---|---|---|
   | `,s<shape>:<r 3dp>` | a dot's shape or roundness differs from its preset's base style | Q1 (`shapeOf`, `squareMorph`) |
   | `,j<mask>:<hx>:<hy>:<ro>:<ri>:<seam>` | a join mask is set | Q1 |
   | `,θ<radians 3dp>` | `rot ≠ 0` | Q3.1 |
   | `,a<aspect 3dp>` | `aspect ≠ 1` | Q2.4 |
   | `,m<motif>` | a motif is set | Q3.6 |

   - **Reserved fields.** F0.5 reserves `join`, `joint`, `rot`, `aspect` and `motif` on `DotInstance` in `src/engine/types.ts`; Q implements their behaviour and fills in the doc comments. `rot` is **radians** everywhere: Q3 snaps it to multiples of π/4 but stores the snapped angle, never a flag.
   - **Style backfill.** F0.5 also does the one-time, hash-preserving `style` backfill of all 177 entries in `goldens/hashes.json`. That is what makes Q1.12's "`git diff goldens/` shows only `+` lines" gate hold: Q adds entries and touches no existing one.
   - The gate for every Q phase is `pnpm golden --check`: "0 changed, N added".
3. **F0 determinism lint (F0.9).** F0.9's `det:` check is the only one. Q registers its deterministic code with it, `src/engine/squares/**` (the Tetris sim, masks, morph) and the five new `src/engine/algo/` files of Q3.2–Q3.5, and adds no lint of its own. Sims that need trig use `dsin`/`dcos`/`tsin` from `src/engine/noise/dmath.ts` (F0.1 moves them there from `algo/attractor.ts:20,37`).
4. **F0 first-load cut (F0.11).** F0.11 lands a ≥ 1 kB gz cut before Q1.4 merges. Until it has, Q1 builds the array-path fallback (§2.10) by default.
5. **F0 noise.** `voronoi2(x, y, seed, metric: 'l2' | 'l1' | 'linf') → { f1, f2, id }`, deterministic. It is used by Q3.2 only.

What can start before F0 merges:
- Q1.2 and Q1.3 (pure modules under `src/engine/squares/`) and the card sims can start at once. Their checks use `sampleLayers` output and the mask and geometry modules directly, not goldens.
- Q1.1 and Q1.4 wait for F0 lane B (F0.5 → F0.6), because `types.ts` and `gridSampler.ts` are F0-B's first (§1.5). Q1.4 also builds on the fallback path until F0.11's cut lands.
- Goldens for the new cards (Q1.12) wait for F0.5's key and backfill.

### 1.5 Shared files and merge order

| file or area | who edits, in order | Q's rule |
|---|---|---|
| `src/engine/types.ts`, `src/engine/sampler/gridSampler.ts` | F0 lane B (F0.5, F0.6) first, then **Q only** | L and M don't touch them. Q rebases onto F0-B before Q1.1 and Q1.4 |
| `DESIGN.md` | F0 owns › Light; M appends under › Light › Materials; **Q owns › Shapes and › Display skins** | Q's rows in Do's and Known Gaps are one-line appends made in Q's integration-queue commit (§5) |
| `scripts/webgl.ts` | F0.4, then M2.2 | Q never edits it. Its renderer parity probe is its own `scripts/squares-browser.ts` (§2.8), which copies the harness pattern |
| `scripts/verify.ts` | insertion order of the area checks: noise, light, golden key, life, **squares**, materials | `squaresChecks(assert)` goes after `lifeChecks` and before `materialsChecks` |
| Registry files (`manifest.ts`, `widgets/index.ts`, `blurbs.ts`, `meta.ts`, `ids.json`, `catalog.ts`), `goldens/hashes.json`, `docs/PROGRESS.md`, `docs/README.md` (plus `CHANGELOG.md`, `src/changelog.ts`) | **integration-queue commits only**, in the order L1 → Q1 → M1, then L2 → M2 → Q2; Q3 queues after Q2 | Q1.12, Q2.7 and Q3.9 are Q's queue commits. No other Q step touches these files |

### 1.6 Lazy by construction: the extension hooks

The sampler, the renderers, `dotBuffer` and DotGL are all first-load (`DotCanvas.tsx:3-10`). Join, shape-per-cell, rotation and motif code therefore lives in a **lazy engine module, `src/engine/squares/`**. It is not re-exported from `src/engine/index.ts`, it is pure TypeScript, and it has no dependencies.

The board chunk installs it by calling `installSquares()`, which is idempotent. The core only gets small, inert hook points:

```ts
// src/engine/sampler/ext.ts (new, first-load, ~60 B gz)
/** Optional sampler extensions installed by lazy engine modules (`installSquares()`); all absent by default. */
export const samplerExt: {
  /** Emit one composite (base or a lattice group) that has join layers: keys → masks → emit. */
  joinEmit?: JoinEmit
  /** Per-dot form code (roundness step, rot45, motif) for layers with `shapeOf` / `rotation` / `motif`. */
  form?: (layer: Layer, value: number, u: number, v: number) => number
} = {}
// src/engine/renderer/ext.ts (new, first-load, ~50 B gz)
export const shapeExt: { canvas?: CanvasJoin; svg?: SvgJoin; gl?: GLJoin; /** Lazy GL hook loader (keeps GLSL out of the worker). */ glLoad?: () => Promise<unknown> } = {}
```

Missing-hook behaviour, which degrades gracefully and never throws:
- if a layer has `join` but `samplerExt.joinEmit` is absent, the sampler emits plain dots;
- if a frame carries join dots and `shapeExt.gl` is absent, `DotGL.render` returns `false`, which is the existing fallback to Canvas (`dotgl.ts` "False = not possible");
- if `shapeExt.canvas` or `shapeExt.svg` is absent, the dot is drawn as its plain shape.

Every context that can show a squares card runs `installSquares()` first:
- the golden, verify and snap scripts and the worker import `src/widgets/index.ts` eagerly, which imports the squares board, which calls `installSquares()`;
- the app opens the card only from its board chunk.

**The worker chunk carries the squares code.** `sampleWorker` reaches the eager registry through `protocol.ts:10`, so the squares board, its sims and everything `installSquares()` imports statically also ship in `sampleWorker-*.js` (153.55 kB gz today, §0), which `size.ts --check` does not measure. That copy is needed, because the worker samples squares cards. Two measures keep it small:
- `installSquares()` statically imports only what sampling and the worker's Canvas path need (`mask`, `geometry`, `sampler`, `canvas`, `svg`). The GL hook is a loader, `shapeExt.glLoad = () => import('./gl')`. `DotGL.render` returns `false` (Canvas) for join frames until it resolves, which is the missing-hook path above. So the GLSL is never in the worker and never in the board chunk's static closure;
- Q's size checks report the worker chunk's gz before and after (§2.10).

## 2. Phase Q1: squares core and the Squares board v1

**Goal:**
- per-layer `join`, per-cell `shapeOf` and the `{grid.gap}` token;
- square-correct cover (via F0);
- join-aware SVG, Canvas and WebGL renderers that pass a parity probe;
- a 4-card `/squares/` board: Tetris, quadtree portrait, metaball blob and Game Boy clock.

**Gate:**
- `scripts/squares.ts` passes;
- `scripts/squares-browser.ts` shows SVG ≈ Canvas ≈ WebGL with no crack;
- goldens are 177 unchanged plus 4 added;
- first-load delta against the LIVING-MATTER-PLAN §6 ledger is ≤ +0.6 kB gz, or ≤ +0.4 on the array-path fallback, which is the default until F0.11's cut lands (§2.10). The worker-chunk delta is reported;
- each card frame is ≤ 4 ms.

### 2.1 API: `src/engine/types.ts` additions

```ts
export interface DotStyle {
  // …existing…
  /**
   * Gutter between square cells, as a fraction of the cell pitch (`{grid.gap}`). A square-like dot's half side is
   * clamped to (1 − gap)·P/2, so two full-level neighbours leave exactly gap·P of grout. Unset = no clamp (today).
   */
  gap?: number
}

/** How a layer's cells fuse into polyomino blobs (quarter-tile composition, 5 shapes per quadrant). */
export interface JoinSpec {
  /** Minimum quantized value a cell needs to join; lower cells stay plain dots (default 0: every lit level). */
  at?: number
  /** 4 (default): join through shared edges. 8: diagonal-only neighbours bridge too (Q3, quadrant code 5). */
  conn?: 4 | 8
  /** Convex corner radius, fraction of the half side s (default: the style squircle's corner, 0 for 'square'). */
  outer?: number
  /** Concave fillet radius at inner notches, fraction of the half pitch (default 0). Visible only with a gutter. */
  inner?: number
  /** Seam left between joined cells, fraction of the pitch (default 0 = fused). */
  seam?: number
  /**
   * Cells join only within the same group (default 0), 0–255. A number, or a per-cell id `(u, v) => number`
   * evaluated once per cell in the same pass as `toneOf`. The function form lets pieces and dominoes carry ids
   * (e.g. a 4-colouring of domino ids, so no two touching dominoes share one), which separates touching same-tone pieces.
   */
  group?: number | ((u: number, v: number) => number)
  /** Let `active` / `activeDim` cells join (default false: the accent stays discrete unless asked). */
  accent?: boolean
}

export interface Layer {
  // …existing…
  /**
   * Fuse equal cells of this layer into joined squares. Merges only cells with the same tone, group and quantized
   * step (≥ `at`); never across tones; the accent opts in with `accent`. Base and lattice layers only (sites ignore it).
   * Needs `installSquares()` (src/engine/squares); without it the layer draws plain dots.
   */
  join?: JoinSpec | true
  /**
   * Per-cell roundness 0..1 (the `cornerRoundness` scale, n = 2 + 30r²), read in the same pass as `toneOf`;
   * snapped to `{grid.shapeSteps}` (1/8). `undefined` = the style's roundness. Dot ↔ square morphs, hybrid boards.
   */
  shapeOf?: (value: number, u: number, v: number) => number | undefined
}

/** Resolved join geometry shared by every joined dot of one layer in one frame (card px). */
export interface JointGeom { hx: number; hy: number; outer: number; inner: number; seam: number; ox: number; oy: number }

export interface DotInstance {
  // …existing (x, y, r, opacity, color, shape, roundness)…
  // Reserved by F0.5 (join, joint, rot, aspect, motif); Q1.1 only replaces the "reserved" doc comments:
  /** Join mask, set only on join layers: 12 bits, 3 per quadrant (NW, NE, SE, SW), codes CONVEX…INNER (squares/mask.ts). */
  join?: number
  /** Geometry of the joined cell (shared object per layer per frame). Present iff `join` is. */
  joint?: JointGeom
}
```

- `hx` and `hy` are separate from day one, so the Q2 rectangular cells need no type change. `ox` and `oy` are the lattice origin in card px, which the watertight WebGL edges use (§2.4.3).
- The function form of `group` covers explicit pairing. The advanced doc's separate `Layer.joinOf` channel ([X-advanced](X-advanced.md) #2, `squares-arctic`) is therefore unnecessary and is not added: the card passes `join: { group: (u, v) => dominoId(u, v) }`.
- `spec/validate.ts` accepts a numeric `group` only. A function `group` is not exported, like `toneOf` (§2.11).

### 2.2 `DotBuffer` channel layout

The classic layout stays byte-identical, at 17 B/dot (`dotBuffer.ts:24,51-53`). The optional channels are allocated on first use in a **second** `ArrayBuffer`, and they are absent on every classic frame:

```ts
export interface DotBuffer {
  // …existing x, y, r, opacity, tone, n, capacity, bytes, palette, shape, roundness…
  /** Optional per-dot channels (squares), all views into `ext` (7 B/dot); absent on classic frames. */
  ext?: ArrayBuffer
  /** ry / rx of a rect cell (Q2; 0 = 1). Float32 at byte 0. */
  aspect?: Float32Array
  /** Packed join: bits 0–11 mask, 12–15 joint slot; 0xFFFF = not joined. Uint16 at byte 4c. */
  join?: Uint16Array
  /**
   * Form: bits 0–3 roundness step (15 = frame style); bit 4 = rotated by π/4 (Q3), a lossless code for the snapped angle
   * mod π/2, decoded by `toDots` to `rot = Math.PI / 4` (radians); bits 5–7 motif (Q3). Uint8 at byte 6c.
   */
  form?: Uint8Array
  /** Joint geometry per slot (≤ 15 per frame). */
  joints?: JointGeom[]
}
```

- **Order:** Float32 first, then Uint16, then Uint8, so every view is aligned for any capacity c.
- **Writers:** `ensureExt(buf)` fills join with 0xFFFF and form with 15. `pushExt(buf, i, join, form)` is separate from `pushDot` (`dotBuffer.ts:67-72`), so the classic path pays nothing.
- **Growth:** `reserve` (`dotBuffer.ts:58-64`) also copies `ext` when it is present.
- **Readers:** `toDots` (`dotBuffer.ts:75-78`) sets `join` and `joint` only when `join[i] !== 0xFFFF`, and sets a per-dot roundness only when `form & 15 !== 15`. That keeps array and buffer output equal (checked).
- **Worker:** `SampleReply` and `SampleRequest` gain `ext?: ArrayBuffer` (transferred with `bytes`) and `joints`. That is `protocol.ts:17,24,34-36` and `client.ts:53-63`.

### 2.3 Algorithm: keys and then masks (`src/engine/squares/mask.ts`)

```text
const CONVEX = 0, EDGE_H = 1, EDGE_V = 2, FULL = 3, INNER = 4, DIAG = 5   // 3-bit codes
code(H, V, D, conn8) = H ? (V ? (D ? FULL : INNER) : EDGE_H)
                         : (V ? EDGE_V : (conn8 && D ? DIAG : CONVEX))
// neighbourhood byte: bit0 N, bit1 NE, bit2 E, bit3 SE, bit4 S, bit5 SW, bit6 W, bit7 NW
LUT4[b] = code(W,N,NW) | code(E,N,NE)<<3 | code(E,S,SE)<<6 | code(W,S,SW)<<9   // built once, Uint16Array(256)

joinKeys(layers, best, owner, win, covered, style, us, vs) -> { key: Uint16Array, tone: Uint8Array }
  steps = style.quantizeSteps; if !(steps >= 2) { warnOnce(); return null }
  for each cell i in win:
    key[i] = 0
    v = best[i]; o = owner[i]
    if o == 0 or covered[i] or v <= 0: continue
    L = layers[o-1]; t = toneIndex(L.toneOf ? L.toneOf(v, us[c], vs[r]) : L.tone, v); tone[i] = t   // one toneOf call per cell
    J = L.join === true ? {} : L.join; if !J: continue
    lv = quantize(v, steps); if lv <= 0 or lv < (J.at ?? 0): continue
    if (t == TONE.active or t == TONE.activeDim) and !J.accent: continue
    g = typeof J.group == 'function' ? J.group(us[c], vs[r]) : (J.group ?? 0)   // one group call per cell
    key[i] = ((g & 255) << 7 | t << 4 | round(lv*(steps-1))) + 1                 // 1 … 2^15, never 0

joinMasks(key, width, height) -> Uint16Array (0xFFFF = not joinable)
  K(x, y) = (x<0 or y<0 or x>=width or y>=height) ? 0 : key[y*width + x]
  for each cell (x, y) with k = key[i] != 0:
    b = (K(x,y-1)==k) | (K(x+1,y-1)==k)<<1 | (K(x+1,y)==k)<<2 | (K(x+1,y+1)==k)<<3
      | (K(x,y+1)==k)<<4 | (K(x-1,y+1)==k)<<5 | (K(x-1,y)==k)<<6 | (K(x-1,y-1)==k)<<7
    mask[i] = LUT4[b] | slot(L) << 12          // slot: index of the layer's JointGeom in the frame table
```

Notes:
- **Window edges.** Cells outside the window count as empty. The composite is zero outside it (`gridSampler.ts:117-119`), so this is exact.
- **The sampler hook.** `samplerExt.joinEmit` is called at the two composite sites:
  - base: after `gridSampler.ts:227`;
  - each lattice group: after `:199`.

  It runs only when `layers.some(l => l.join)`, so the cost is one `some()` per composite otherwise. It replaces the emit loop for that composite with an identical loop that:
  1. reuses `tone[i]`;
  2. passes `join = mask` (or leaves it undefined when the mask is 0xFFFF and the layer had no join);
  3. writes the joint slot.

  A cell of a join layer that fails `at` or the accent rule is emitted as a **plain** dot (`join` undefined). A joinable but isolated cell gets `join: 0`. Shape is drawn CONVEX with `outer`, which by default is identical to the plain dot.
- **Gap clamp** (core, `emit`, `gridSampler.ts:55`): `if (style.gap !== undefined && squareLike(n)) r = Math.min(r, (1 - style.gap) * scale * pitch / 2)`, where `squareLike` is F0's predicate for the Chebyshev branch of `hides` (§1.1). This needs `pitch` passed into `emit`. Its only effect is on styles with `gap`.
- **Cover per site** (core, the sites loop `gridSampler.ts:219-226`): the call to F0's `hides(dx, dy, R, n, rot)` passes the site's own n when `shapeOf` set one (and Q3.1's `rot`), instead of the style's n. Q changes the arguments only, never the rule.
- **`shapeOf`** (core branch, set through `samplerExt.form`): evaluated once per emitted dot, in the lattice, sites and base loops. `step = round(8·clamp(r))`, giving `roundness = step / 8`.
  - Array path: `roundness` is set per dot and `shape` becomes `'squircle'`. SVG (`svgRenderer.ts:22`), Canvas (`canvasRenderer.ts:8`) and WebGL (`dotgl.ts:70`) already honour per-dot roundness on `DotInstance`.
  - Buffer path: `form` bits 0–3 carry it, and `canvasBuffer.ts:17` takes the exponent per dot when `form` exists.
- **GPU passes:** `layerPass` returns `null` when `layer.join || layer.shapeOf` (`passes.ts:72`). Such layers stay CPU instances, as `sites` already do.

### 2.4 Renderers

All three share one geometry source, `src/engine/squares/geometry.ts`:
- `insideJoined(px, py, cx, cy, s, g: JointGeom, mask)`, the CPU reference (point-in-shape);
- `joinOutline(sink, cx, cy, s, g, mask, bleed = 0)`, which builds a single **clockwise** closed outline;
- `joinArea(s, g, mask)`, the analytic area (for the ink checks).

**The outline.** Start at `(cx, cy − top)`, with `top = V(q0) ? hj : s`. Walk the four corners clockwise. In each corner's local frame, with entry axis A and exit axis B (codes are swapped EDGE_H ↔ EDGE_V for q0 and q2, where the walk enters on the horizontal axis):

| code | corner walk (screen coords, shown for q1 NE) |
|---|---|
| CONVEX | `L(cx+s−ro, cy−s)`, `arc` centre `(cx+s−ro, cy−s+ro)` from −90° to 0°, `L(cx+s, cy)` |
| EDGE_H | `L(cx+hj, cy−s)`, `L(cx+hj, cy)` |
| EDGE_V | `L(cx+s, cy−hj)`, `L(cx+s, cy)` |
| FULL | `L(cx+hj, cy−hj)`, `L(cx+hj, cy)` |
| INNER | `L(cx+s, cy−hj)`, `L(cx+s, cy−s−ri)`, `arc` centre `(cx+s+ri, cy−s−ri)` from 180° to 90° ccw (the fillet web), `L(cx+hj, cy−s)`, `L(cx+hj, cy)` |

Arcs use explicit centres (`arc`, SVG `A`) rather than `arcTo`, so Canvas and SVG trace the same curve. Mask `0x6DB` short-circuits to one `rect`.

#### 2.4.1 Canvas (`src/engine/squares/canvas.ts` → `shapeExt.canvas`)

- `addDotShape` (`canvasRenderer.ts:15`) and the `renderCanvasBuffer` loop (`canvasBuffer.ts:18-25`) each get one branch: `if (d.join !== undefined && shapeExt.canvas) shapeExt.canvas(p, x, y, r, mask, joint)`.
- Joined neighbours share a `Path2D`, so the fill is seamless (§1.3). No bleed is used: abutting edges cancel in Skia's coverage accumulation.

#### 2.4.2 SVG (`src/engine/squares/svg.ts` → `shapeExt.svg`)

- **Defs:** keyed `j|mask|r|hx|hy|ro|ri|seam`, with each number rounded to 0.05 like `svgRenderer.ts:21`. There are ≤ 47 masks per (level, joint); the check is ≤ 300 defs per card.
- **Seams.** Each `<use>` is its own element, so abutting cells **conflate** (they show a hairline). Mitigations:
  1. Joined sides are extended by a **bleed** `δ = min(.12·P, .5)` px past the cell edge, and only on sides whose neighbour is joined.
  2. Groups that contain join dots use group `opacity` instead of `fill-opacity` (`svgRenderer.ts:39`), so the δ overlap does not double-blend at opacity < 1. Groups without join dots keep today's string, so existing SVG exports don't change.

#### 2.4.3 WebGL2 (`src/engine/squares/gl.ts` → `shapeExt.gl`)

- **Hook.** `DotGL.render` (`dotgl.ts:248-260`) diverts dots with `join !== undefined` into a second list. After the classic draw, it calls `shapeExt.gl.draw(api, joinDots)`. `api` exposes `gl`, `program(name, vs, fs)`, `loc`, `palette` and `common(prog, alpha)`, which are today private members of `DotGL`. The GLSL sources live in the lazy module, not in `shaders.ts`.
- **Instance layout:** 7 floats = 28 B: `aDot` vec4 (x, y, r, opacity), `aShape` vec2 (exponent, palette index), `aJoin` float (the packed 16-bit value, exact in f32). Joint geometry comes from `uniform vec4 uJoint[15]` (hx, hy, ro, ri) and `uniform vec4 uJointO[15]` (ox, oy, seam, 0).
- **Watertight edges.** Joined sides of the quad sit exactly on the cell boundary. Unjoined sides are padded by `s + 1 px`. Boundaries come from the **integer cell index**, never from centre ± h:

  ```glsl
  float ix = floor((x - ox) / (2.0*hx));  float left = ox + ix*2.0*hx, right = ox + (ix + 1.0)*2.0*hx;
  ```

  Two neighbours evaluate `(i+1)·P` and `i'·P` with i' = i + 1, which is the same expression on the same inputs and gives the same float. Edges are bit-identical, rasterization's fill rule gives each pixel to exactly one quad, and there is no crack and no overlap at any opacity.
- **Fragment shader** (an exact SDF per quadrant, in device px; `E` runs joined arms past the quad so the quad edge is the cut):

  ```glsl
  float sdBox(vec2 a, vec2 b) { vec2 d = a - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  void main() {
    vec2 a = abs(vP);
    uint q = vP.y < 0.0 ? (vP.x < 0.0 ? 0u : 1u) : (vP.x < 0.0 ? 3u : 2u);
    uint code = (vMask >> (3u * q)) & 7u;
    vec2 E = vSeam > 0.0 ? vH - vSeam : vH + 2.0;          // fused: no AA ramp at the cell boundary
    float d;
    if (code == 0u)      d = sdBox(a, vec2(vS - vRo)) - vRo;                    // CONVEX: rounded box
    else if (code == 1u) d = sdBox(a, vec2(E.x, vS));                           // EDGE_H
    else if (code == 2u) d = sdBox(a, vec2(vS, E.y));                           // EDGE_V
    else if (code == 3u) d = sdBox(a, E);                                       // FULL
    else {                                                                       // INNER: quadrant minus rounded notch
      vec2 v = vec2(vS + vRi) - a;
      float notch = length(max(v, 0.0)) + min(max(v.x, v.y), 0.0) - vRi;       // SDF of {a > s} rounded by ri
      d = max(sdBox(a, E), -notch);
    }
    float cov = clamp(0.5 - d, 0.0, 1.0);
    if (cov <= 0.0) discard;
    o = vColor * cov;
  }
  ```

  Ink: the Steiner correction in `EMIT` (`shaders.ts:27`) is off for join instances (k = 0, as for the box SDF), because the edges are straight.

### 2.5 Ink and tone budget

| shape at the same r | area | vs circle |
|---|---|---|
| circle (n = 2) | πr² | 1 |
| `tileStyle` squircle (r = .1, n = 2.3) | ≈ 3.27 r² | 1.04 |
| square / n = 32 | 4r² | **4/π ≈ 1.27** |
| joined interior cell (s = .95, h = 1.125) | P² = 4h² | 1.79 |

Guidelines:
- **Squares styles.** The default is `squareStyle = { shape: 'square', sizeMin: .25, sizeMax: 1.125, gap: .16, quantizeSteps: 5, opacityMode: 'fromValue' }`. A full step then gives s = .945, about the tile circle's r, which means ≈ 1.27× its ink.
- **Joined fills.** Large joined areas take **one grey band lower** than the same content as spaced dots: `idle`, not `value`. `value` is kept for type and small marks.
- **Equal-ink morphs.** `inkRadius(r, n) = r·sqrt(π / A(n))` with `A(n) = 4Γ(1+1/n)² / Γ(1+2/n)`, for dot ↔ square transitions (Q3.7).
- **Check `squares: ink`.** Per card, Σ(area × opacity × luma of colour) / card area, measured with the snap raster at px 2, must be ≤ 1.15 × the median of the liked reference cards (level-03, afterlight face, mosaic, components; see memory). The value is printed and asserted.

### 2.6 Squares board v1: `src/widgets/boards/squares.ts`

- **Placement:** board id `squares` (URL `/squares/`), title `SQUARES — SPACED AND JOINED`, 2 columns, group `engine` (`manifest.ts:83`).
- **Install:** the top of the module calls `installSquares()`.
- **Chrome:** as on the algorithms board. The label goes top-left, the reference goes top-right as a faint caption (`algorithms.ts:25-27`), with a footer rail, counter and stat (`algorithms.ts:28-41`).
- **t = 0** is a finished picture.
- **Accent:** one red element per card, and it is always the live thing.

| id | thesis | build | accent |
|---|---|---|---|
| `sq-tetris` | "Seven shapes, one rule: only equals fuse." | A 10×18 well on `lattice: 6`, origin [6, 14], 60×108 cells. A deterministic 7-bag (`hash32(seed, bag)`) plus a greedy placement AI (El-Tetris weights; argmax ties broken by (rotation, column) order) gives ≤ 400 placements, computed once and cached (`??=`, like `algorithms.ts:11`). The sim lives in `src/engine/squares/tetris.ts`, inside F0.9's determinism lint (§1.4). The settled well is one layer per tone with `join: { group: (u, v) => pieceColour(u, v) }`, where `pieceColour` is a greedy 4-colouring of the piece adjacency graph (by piece id, cached with the history), so no two touching pieces share a group and the layer count stays fixed. Tones go by piece kind over `mid` / `idle` / `value`, at one level. Line clears flash for 2 frames as `value` and then collapse. A side panel holds NEXT (joined preview), LINES and SCORE in `T.text`. | the falling piece, `tone: 'active'`, `join: { accent: true }` |
| `sq-quads` | "Split where it's wrong: 1,200 squares find the face." | After Fogleman's *Quads*. `portrait()` (`mirror.ts:43`) is rasterized once (`rasterize`, `raster.ts:39`) into integral images of v and v² (O(1) mean and RMS per quad). Max-heap by `rms × area^0.25` (ties broken by quad id); sizes are powers of two from 128 down to 2 cells. A split history is built once. A frame replays k(t) splits (O(k), k ≤ 1200) and emits one `sites` layer per (size, tone) with a constant field of 1 and `size` = the quad side. Mean luma quartile gives the tone. `gap: .16` gives the grout. **Needs F0.6's `hides` (square sites).** | the 4 children of the latest split |
| `sq-blob` | "Metaballs on a grid: cells fuse only with their equals." | `lattice: 3` (48×48). 4 balls on Lissajous paths, `f = Σ rᵢ²/dᵢ²` (with `dsin`/`tsin`), value = clamp(f/2), 5 steps, `join: { at: .5, inner: .35 }`. Levels .5, .75 and 1 fuse into terraces, with grout between the terraces. | the neck: cells where ≥ 2 balls each give > .35 of the threshold, `join: { accent: true }` (the red bridge forms as balls meet) |
| `sq-gameboy` | "Four shades, 160 × 144 in spirit." | A 72×64 "LCD" on `lattice: 2`, origin [0, 12], squares at `gap: .16`, no join. 4 shades: unlit = `faint` (the LCD grid texture), then `mid`, `idle`, `value`, all at value 1 (constant size), with tone set by `toneOf`. HH:MM in the 5×7 bitmap font scaled ×3 **in LCD pixels** (a field on the k = 2 lattice, so digits are made of LCD squares). A 16×16 walker sprite with a 2-frame cycle and a parallax ground strip. | the colon (1 Hz) |

Ids are prefixed `sq-` to avoid collisions; `ids --check` verifies.

### 2.7 Ordered steps (each ≤ ~½ day)

| step | what | files | verify (named checks) |
|---|---|---|---|
| **Q1.1** | After F0-B merges (§1.5): types and doc comments (§2.1: `gap`, `JoinSpec`, `Layer.join`/`shapeOf`, `JointGeom`; F0.5's reserved `DotInstance` fields get their real doc comments, no new fields), `samplerExt` and `shapeExt` stubs, DESIGN.md › Shapes token draft (§5) | `src/engine/types.ts`, `src/engine/sampler/ext.ts`, `src/engine/renderer/ext.ts`, `DESIGN.md` | `npx tsc -b`; `pnpm golden --check` 177/177 |
| **Q1.2** | Mask module: LUT, `joinKeys`, `joinMasks`, codes; `scripts/squares.ts` scaffold (header and `squaresChecks(assert)`, wired into `verify.ts` in the shared order, after `lifeChecks` and before `materialsChecks`, §1.5; today's area checks end at `verify.ts:866-867`); register `src/engine/squares/**` with F0.9's determinism lint | `src/engine/squares/mask.ts`, `scripts/squares.ts`, `scripts/verify.ts` (one import, one call, one lint path) | `squares: 47 masks` (256 neighbourhoods give 47 distinct); `squares: mask symmetry` (mirror x swaps q0↔q1 and q3↔q2; rotation by 90° permutes quadrants and swaps EDGE_H↔EDGE_V); `squares: merge rule` (a seeded fuzz of 10k grids: no join across tone, group or level, or below `at`; accent only with `accent`; numeric and function `group` give the same masks for the same ids); `det: no engine-specific Math in deterministic dirs` passes with `squares/` registered |
| **Q1.3** | Geometry: `insideJoined`, `joinOutline`, `joinArea`, `inkRadius` | `src/engine/squares/geometry.ts` | `squares: outline = reference` (a recording sink rasterized at 16×16 per cell matches `insideJoined` to ≤ 0.5% of pixels for all 47 masks × 3 joints); `squares: areas` (analytic area vs supersampled within 0.5%; INNER = FULL when s = h) |
| **Q1.4** | After F0-B merges: sampler gap clamp, `joinEmit` hook at both composite sites, `shapeOf` form, per-site n into F0's `hides`, `layerPass` refusal. DotBuffer ext channels, `toDots`, `reserve` and the worker `ext` transfer only once F0.11's cut has landed; until then the array-path fallback (§2.10) | `gridSampler.ts`, `dotBuffer.ts`, `passes.ts`, `src/engine/squares/sampler.ts`, `src/workers/protocol.ts`, `src/workers/client.ts` | `squares: no-op defaults` (every existing preset's `sampleLayers` output has no `join` key; covered by `pnpm golden --check` 177/177); `squares: buffer = array` (`toDots(sampleLayersInto(x))` equals `sampleLayers(x)` including join and joint for the 4 new cards); `squares: worker round trip` (`ext` survives `dotBufferOver` with ext); `squares: hooks absent` (without `installSquares()`, a join layer gives plain dots and no throw); `squares: site cover per dot` (a `shapeOf` square site on a round card clears all card cells under it through `hides`, with no Q-side threshold) |
| **Q1.5** | Canvas: `addDotShape` and `renderCanvasBuffer` branches; `canvas.ts` | `canvasRenderer.ts`, `canvasBuffer.ts`, `src/engine/squares/canvas.ts` | `squares: canvas path` (headless `PathSink` recorder: command count per mask; fills per card ≤ tones × steps, unchanged by joins) |
| **Q1.6** | SVG: defs by mask, bleed, group opacity | `svgRenderer.ts`, `src/engine/squares/svg.ts` | `squares: svg defs` (≤ 300 per card; byte-identical SVG for every existing preset: hash `renderSVG(sampleCard(p, 0))` before and after for all 177) |
| **Q1.7** | WebGL: join program, `DotGL` hook API, watertight edges; `shapeExt.glLoad` lazy loader (§1.6) | `dotgl.ts`, `src/engine/squares/gl.ts` | `squares-browser: webgl` (see probe; the first join frame falls back to Canvas, the next uses GL); `grep -c uJointO dist/assets/sampleWorker-*.js` = 0 |
| **Q1.8** | Snap and parity: `Raster.joined()` from `insideJoined`; `renderCardFull` branch; `scripts/squares-browser.ts` | `scripts/lib/raster.ts`, `scripts/lib/cards.ts`, `scripts/squares-browser.ts` | `pnpm snap --board squares`; probe below |
| **Q1.9** | Board scaffold, `sq-gameboy`, `sq-quads` | `src/widgets/boards/squares.ts` | `squares: t=0 picture`, `squares: pure in t`, `squares: frame ≤ 4 ms` (median warm, load-scaled as in `scripts/algorithms.ts:25-30`) |
| **Q1.10** | `sq-tetris`, plus its sim in `src/engine/squares/tetris.ts` (inside the lint) | same, and `src/engine/squares/tetris.ts` | `squares: tetris determinism` (two fresh sims are bit-equal); `squares: tetris legality` (no overlap, every piece rests, a cleared line has 10 cells); `squares: tetris colouring` (no two touching pieces share a group) |
| **Q1.11** | `sq-blob` | same | `squares: blob accent` (accent is ≤ 1 joined component per frame over t ∈ 0:20:0.5) |
| **Q1.12** | **Integration-queue commit** (slot L1 → **Q1** → M1, §1.5): manifest entry, `index.ts`, board blurb, `ids --assign` for the 4 new widgets, `meta.ts` `cardBlurbs` rows (one line plus tags, `meta.ts:1-11`) for each, goldens (new keys only), size, and the doc updates at merge: DESIGN.md tables (§5), `docs/README.md` (squares row), `docs/PROGRESS.md` (done and next), `CHANGELOG.md` (an `[Unreleased]` entry) and `src/changelog.ts` (`upcoming` rows for Q2 and Q3, `changelog.ts:142`) | `src/widgets/manifest.ts`, `src/widgets/index.ts`, `src/widgets/blurbs.ts`, `src/widgets/meta.ts`, `src/widgets/ids.json`, `src/widgets/catalog.ts`, `goldens/hashes.json`, `DESIGN.md`, `docs/README.md`, `docs/PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` | `pnpm golden --check` shows "4 added, 0 changed, 0 removed", then `pnpm golden` and `git diff goldens/` shows only `+` lines (holds because F0.5 backfilled `style` on all 177, §1.4); `npx tsx scripts/widgets/ids.ts --check`; verify's every-widget-has-a-blurb check; `vite build`, then `scripts/site/size.ts --check`, the first-load delta against the §6 ledger (≤ +0.6, or ≤ +0.4 on the fallback), `--board squares`, and the `sampleWorker-*.js` gz delta recorded in the PR; `squares: ink`; the board-group check in verify |

**Can run in parallel:**
- Q1.2 ∥ Q1.3 ∥ Q1.4: the sampler work needs only the mask signature. Q1.2 and Q1.3 can start before F0; Q1.1 and Q1.4 wait for F0-B (§1.4);
- Q1.5 ∥ Q1.6 ∥ Q1.7, once Q1.3 is done;
- Q1.9 ∥ Q1.10 ∥ Q1.11, once Q1.4 is done. Cards can be built against Canvas and the snap CPU reference before WebGL lands.

Q1.12 is last. It waits for F0.5 (key and `style` backfill) and for its slot in the integration queue, after L1.

**Estimate:** 4.75–5.25 days. The overview §6 says 4–5; the extra ¼ day is the function `group` with the Tetris colouring, the lazy GL loader with the worker-chunk measurement, and the merge-time doc rows.

### 2.8 Renderer parity probe: `scripts/squares-browser.ts`

This is headless Chrome over CDP with no npm dependency. It copies the `scripts/webgl.ts` harness pattern into its own file and does not edit `webgl.ts`, which F0.4 and M2.2 own (§1.5).

**Setup.** For each Squares card at t ∈ {0, 1.3}, px 2, it renders:
1. Canvas from `DotInstance[]`;
2. Canvas from `DotBuffer`;
3. WebGL;
4. SVG via `<img src="data:image/svg+xml…">` drawn into a canvas;
5. the CPU reference (`insideJoined`, 4×4 supersampled).

**Gates:**
- **Pixel parity** for every pair against Canvas(array), with the WebGL tolerances `TOL = { pixelMean: 2, pixelOver16: 2.5, psnr: 32 }` (`scripts/webgl.ts:27`).
- **No crack.** For every boundary between two FULL-mask joined cells, the minimum luma along the boundary must be ≥ the interior luma minus 3/255 on Canvas and WebGL, and minus 6/255 on SVG (the bleed). It is reported as the worst crack in /255.
- **No double blend.** Same test at opacity .5: the boundary maximum must be ≤ interior + 3/255.

**Outputs:** PNGs (each renderer plus diff ×4) in `.snapshots/squares/`, and `report-<backend>.json`. `--swiftshader` is supported.

### 2.9 Performance budget

| part | budget | how |
|---|---|---|
| `joinKeys` + `joinMasks`, 144² base | ≤ 0.25 ms | one pass with 8 Uint16 reads per lit cell and a LUT; scratch arrays reused, as `gridSampler.ts:105-113` does |
| same, 48² lattice | ≤ 0.04 ms | |
| Canvas path build, 5k join dots | ≤ 1.2 ms | `0x6DB` → `rect`; others use 6–14 commands |
| WebGL join draw | 1 draw call | 28 B instances |
| Tetris / quads precompute | ≤ 30 ms once, cached | prefix replay per frame ≤ 0.1 ms |
| **card frame** (sample + draw) | **≤ 4 ms** median warm | `squares: frame ≤ 4 ms`, load-scaled |

A card with **no** join layers pays one `layers.some(l => l.join)` per composite. `scripts/bench.ts` (existing) must stay within noise on three existing boards.

### 2.10 First-load impact (delta gates against the LIVING-MATTER-PLAN §6 ledger)

Absolute numbers are not gated per phase. Each phase records its first-load delta in the ledger in [LIVING-MATTER-PLAN §6](../LIVING-MATTER-PLAN.md), and the gate is that delta, with `size.ts --check` (≤ 150 kB) still green. **Q's deltas: Q1 ≤ +0.6 kB gz (+0.4 on the fallback), Q2 ≤ +0.3, Q3 ≤ +0.1.**

| file (first-load) | change | est. gz | in the fallback |
|---|---|---|---|
| `sampler/ext.ts`, `renderer/ext.ts` | registries | 0.1 kB | yes |
| `gridSampler.ts` | gap clamp, two hook calls, form branch, per-site n into `hides` | 0.2 kB | yes |
| `dotBuffer.ts` | ext in `reserve` and `toDots` | 0.15 kB | no |
| `canvasRenderer.ts`, `canvasBuffer.ts`, `svgRenderer.ts`, `dotgl.ts` | one hook branch each, plus the `glLoad` call | 0.15 kB | yes (the `canvasBuffer` branch can stay: it is inert without `form`) |
| `workers/client.ts` | `ext` transfer | 0.05 kB | no |
| total | | **≈ +0.6 kB** | **≈ +0.4 kB** |

Everything else (masks, geometry, the board) goes into the lazy squares chunk, and the GLSL goes into its own `gl` chunk (§1.6).

- **Order with F0.11.** F0.11 lands a ≥ 1 kB gz cut before Q1.4 merges. **Until it has, Q1 builds the array-path fallback by default:** join frames go through the array path only (no `dotBuffer` ext, no worker `ext`, −0.2 kB), and squares cards sample on the main thread, by marking them non-worker at `registry.ts:19`. Once the cut is in, the buffer path is a follow-up commit inside Q1's +0.6.
- **Gate:** `vite build`, then `npx tsx scripts/site/size.ts --check`, and the before/after first-load numbers written into the ledger row for Q1.
- **Worker chunk.** `size.ts` doesn't follow the worker (§0), so Q's size checks add it by hand: gzip `dist/assets/sampleWorker-*.js` before and after (level 9, as `size.ts:19` does) and record the delta in the PR. Estimate for Q1: about +6 kB gz (mask, geometry, sampler and Canvas/SVG hooks, 4 cards with the Tetris sim). On the fallback the squares cards don't run in the worker, but the code still ships there through the eager registry, so the delta is the same. Soft budget: ≤ +8 kB for Q1, ≤ +3 kB each for Q2 and Q3.
- `size.ts --board squares` is reported as well (a deep link's first load).

### 2.11 Risks and mitigations (Q1)

| risk | mitigation |
|---|---|
| AA cracks between joined cells (conflation) | Canvas: same-group single path (§1.3). WebGL: edges from the integer cell index. SVG: bleed plus group opacity. The crack probe gates all three. |
| An existing golden moves | All new behaviour is behind new optional fields. F0.5's key appends only on difference from the base style, and F0.5's backfill already wrote `style` on all 177 (§1.4). Gate: `pnpm golden --check` 177/177 before adding. |
| Join on low-n squircles looks wrong (bezier corners, n ≤ 8, `canvasRenderer.ts:24-30`) | `squares: join styles` asserts that every join layer's style is square-like by F0's predicate (the Chebyshev branch of `hides`, §1.1), so cover and join agree on what a square is. DESIGN documents it. |
| Brighter cards (4/π, joined fill 1.79×) | `squares: ink` gate; "one band lower" rule (§2.5) |
| The accent spreads into a big blob | Accent joins only with opt-in. `squares: one accent` asserts ≤ 1 accent component per card frame. |
| Hooks are not installed in some path (an embed or share page) | Plain dots as the fallback, never a throw. Every path that shows a squares card loads its board chunk (`loadBoard`, `manifest.ts:96-106`). |
| Non-determinism in the sims | `hash32` seeds, `dsin`/`tsin` from `noise/dmath.ts`, explicit tie-breaks (heap key, AI argmax), fixed dt; `squares/` is inside F0.9's lint (§1.4) |
| The worker chunk grows unseen | It is measured by hand at every Q integration step (§2.10), and the GLSL is kept out of it by the `glLoad` loader (§1.6) |
| SVG defs explode | Masks are ≤ 47 per (level, joint), with a ≤ 300 assert |
| `spec/validate.ts` rejects `join` | Add `join` (JSON) to the placed-layer keys (`src/spec/validate.ts:90-93`). `shapeOf` and a function `group` are functions, so like `toneOf` they aren't exported. |

## 3. Phase Q2: LCD skins, rect cells, teletext, line screens

**Goal:**
- two new **display skins**: `lcd` (square pixel gutter, backplane shadow, ghosting τ ≈ 150 ms) and `grout` (mosaic tiles with grout and bevel);
- **rect cells**, `lattice: [kx, ky]`, with a per-dot `aspect`;
- **teletext** sextant pages, contiguous and separated;
- **line screens** and solid bars.

**Gate:**
- skin fidelity snapshots, extending `scripts/skins-browser.ts`;
- rect parity in `squares-browser`;
- goldens: 0 changed, 2 added;
- first-load delta ≤ +0.3 kB gz against the §6 ledger (§2.10); worker-chunk delta recorded.

This splits the overview's Q2 (§6) in two. The square field pack moves to Q3, as this brief asks.

### 3.1 Skins: `lcd` and `grout`

These are post-raster stages like the rest (`src/engine/display/stage.ts:129-…`). They are **reflective**, like `eink` (blend `normal`): neutrals become dark pixel "ink" on a pale backplane, and the accent keeps its hue as pigment. Under the skin rule (DESIGN.md:362) neutrals may take the display's colour while palette roles stay fixed.

```ts
// src/engine/display/skins.ts (SKIN_PHYSICS, lazy)
lcd:   { tau: .15, gutter: .12, shadow: { dx: .35, dy: .5, alpha: .22, blur: .5 }, paper: [.77, .81, .63], ink: [.12, .16, .1], onS: .4 },
grout: { gap: .14, bevel: { hi: .12, lo: .18 }, jitter: .03, onS: .3 },
// src/engine/display/names.ts (first-load): SKIN_NAMES += 'lcd', 'grout'
lcd:   { name: 'lcd',   label: 'LCD',   title: 'LCD: square pixels, backplane shadow, slow liquid-crystal response', blend: 'normal' },
grout: { name: 'grout', label: 'GROUT', title: 'Mosaic: one tile per cell, grout lines, bevelled edges', blend: 'normal' },
```

**`lcd` algorithm** (only GPU-friendly 2D ops; no readback):
1. Take the card frame and `drawImage` it down to cols × rows (the cell average, as `led` does) into `cells`.
2. **Ghosting** (symmetric, unlike the CRT `max` decay, `skins.ts:14`): `ghost ← lerp(ghost, cells, 1 − e^(−Δt/τ))`, done by `globalAlpha = 1 − exp(−Δt/.15)` drawing `cells` over `ghost`. The stage keeps requesting frames until the change is < 1/255 (`settleSeconds`, `afterglow.ts`).
3. **Pixels:** upscale `ghost` with `imageSmoothingEnabled = false` to w × h, then `destination-in` a cached **gutter pattern**: one cell tile with a clear (1 − gutter) square.
4. **Backplane shadow:** the same pixel layer offset by (dx, dy) cells, blurred, at alpha .22, composited `multiply` **under** the pixels onto `paper`.
5. **Ink mapping:** neutral luma goes to `ink`, the empty cell to `paper` (one colour matrix, as `phosphorMatrix` does at `skins.ts:31-39`; the red column is kept). The paper and ink colours are skin physics, not tokens, exactly as `STAGE_COLORS.paper` is (`stage.ts:30-34`).

**`grout` algorithm:**
1. Take the cell average (as in `lcd` step 1) and draw each cell as a flat tile of side (1 − gap) on a `bg` grout.
2. Bevel: a top-left highlight edge at +12% luma and a bottom-right shadow at −18% luma, each one device pixel wide, from two cached edge patterns composited `lighter` / `multiply`.
3. Per-tile luma jitter of ±3% from a cached `hash01(c, r)` texture (multiply). It is static, so a static card is re-skinned once (DESIGN.md:374).
4. Reduced motion: no power-on wipe.

### 3.2 Rect cells: `lattice: [kx, ky]`

```ts
export interface Layer {
  /** Sample on a coarser lattice: `k`× the card pitch (square cells) or `[kx, ky]` (rect cells, fractional allowed). */
  lattice?: number | [number, number]
  /** Which axis the size ramp drives on rect cells: 'both' (default, keeps aspect), 'x' or 'y' (line screens, bars). */
  sizeAxis?: 'both' | 'x' | 'y'
}
export interface DotInstance { /** ry / rx (rect cells); absent = 1. */ aspect?: number }
```

**Sampler** (`gridSampler.ts:61-63,188-207`):
- `latticeGrid(grid, [kx, ky], origin)` floors each axis on its own;
- the group key becomes `${kx}x${ky}|${origin}`;
- groups are sorted by `kx·ky`, descending;
- the centre is `(ox + (c + .5)·kx, oy + (r + .5)·ky)·pitch`;
- `r` is the ramp × kx and `aspect = ky/kx`. With `sizeAxis: 'y'`, rx is fixed at the full (1 − gap)·hx and ry comes from the ramp, so aspect varies per dot;
- cover uses kx and ky separately, keeping the same centre-inside rule;
- join uses `JointGeom.hx/hy`, which have been there since Q1.

**Renderers** (`aspect !== undefined` goes through the hooks):
- Canvas: `rect`, or rounded rect for squircles with n > 8;
- SVG: defs keyed by aspect (to .001);
- WebGL: `sdBox(a, vec2(rx, ry))` for square-like shapes, plus a scaled-space squircle SDF for n ≤ 8, with d scaled by min(rx, ry)/r for AA;
- snap raster: anisotropic `dot`.

Rect layers are refused by `layerPass` (CPU only, like sites). `spec/validate.ts:90` must accept a tuple lattice.

### 3.3 Teletext: `src/engine/squares/teletext.ts`

```ts
/** One teletext cell: a text char, or a 6-bit sextant mosaic (bit i = sub-cell i, row-major 2×3). */
export type TtCell = { ch: string; fg: Tone; bg?: Tone } | { sextant: number; fg: Tone; bg?: Tone }
export interface TeletextOptions { cols: number; rows: number; origin: [number, number]; cell: [number, number]; mode: 'contiguous' | 'separated' }
/** Layers for a page: one mosaic lattice layer per fg tone, one bg layer per bg tone, text through `textAt`. */
export function teletextLayers(page: TtCell[][], o: TeletextOptions): Layer[]
/** U+1FB00…1FB3B (Symbols for Legacy Computing) ↔ 6-bit sextant, for describe() / text export. */
export function sextantChar(bits: number): string
```

- **Sextant layers** use `lattice: [cell[0]/2, cell[1]/3]`.
- **Contiguous** = full-size sub-cells with `join: { group: tone }`. Mosaic blocks fuse across cell boundaries, as on a real SAA5050.
- **Separated** = `gap: .33` and no join.
- **Background:** each bg tone is a layer with a constant field of .5 under the fg's 1. The composite max lets fg win, giving 2 tones per cell (`gridSampler.ts:128`). bg uses its own join group, so bg panels fuse.

**Card `sq-teletext`:**
- a 24×16 page in 6×9-cell characters. Sextants are therefore [3, 3]; the 5×7 font fits a 6×9 cell, dot-aligned via `textAt`;
- the header is `P100 SQUARES 100 Tue 27 Oct 12:47/31`, with the clock frozen in goldens (`golden.ts:18`);
- a big mosaic banner, a mini weather map in separated graphics, and a subtitle bar;
- accent: the header's seconds.

### 3.4 Line screens and bars

- Line-screen fields need no new generator. The value is the field (portrait luma), the lattice is `[1, 4]` with `sizeAxis: 'y'`, constant opacity and `gap: 0`. Cells abut into continuous lines whose thickness steps with the quantized level. One tone means one `Path2D`, which is seamless.
- The optional `halftone(r, { levels: 6, mode: 'area' })` (`halftone.ts:20-33`) gives screen-angle-free structure-aware levels before the screen.

**Card `sq-lines`:**
- the mirror portrait as a 1-bit-feel line screen (36 lines);
- a solid-bar spectrum (`lattice: [3, 1]`, `sizeAxis: 'x'`) in the footer;
- accent: the bar at the current peak.

### 3.5 Steps

| step | what | files | verify |
|---|---|---|---|
| **Q2.1** | `lcd` physics and stage branch | `src/engine/display/skins.ts`, `stage.ts`, `names.ts` | `display: lcd ghost` (a step response reaches 63% at τ ± 10 ms; `scripts/display.ts`); `skins-browser: lcd` snapshot |
| **Q2.2** | `grout` skin | same | `skins-browser: grout` (grout luma = bg ± 2/255, accent hue kept) |
| **Q2.3** | Switcher labels; DESIGN › Display skins rows (Q-owned, §5); `?skin=lcd` route | `names.ts`, `DESIGN.md` | size `--check`; names.ts is first-load, about +0.1 kB of Q2's +0.3 delta |
| **Q2.4** | Rect lattice: sampler, `aspect` channel, the 3 renderers, snap, `layerPass` refusal, spec validate | `gridSampler.ts`, `dotBuffer.ts` (aspect view), `src/engine/squares/{canvas,svg,gl}.ts`, `scripts/lib/raster.ts`, `src/spec/validate.ts` | `squares: rect cover` (a [2, 3] cell clears exactly the 6 card cells under it); `squares-browser: rect parity` |
| **Q2.5** | Teletext module and card | `src/engine/squares/teletext.ts`, `boards/squares.ts` | `squares: sextant map` (64 ↔ 64, round trip); `squares: teletext contiguous fuses` (2 adjacent full-mosaic cells give one joined component) |
| **Q2.6** | Line screen and bars card | `boards/squares.ts` | `squares: line continuity` (an equal-level run gives no gap on Canvas, measured in the probe) |
| **Q2.7** | **Integration-queue commit** (slot L2 → M2 → **Q2**, §1.5): `ids --assign` and `meta.ts` blurb and tags for `sq-teletext` and `sq-lines`, goldens (2 added), size (first-load delta ≤ +0.3 against the ledger, worker-chunk delta recorded), and the doc updates at merge: DESIGN.md (§5), `docs/README.md`, `docs/PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` (`upcoming`: drop the Q2 row) | as Q1.12 | as Q1.12, with "2 added" |

- **Can run in parallel:** Q2.1–Q2.3 (skins, display files only) ∥ Q2.4–Q2.6 (sampler and cards).
- **Estimate:** 3 days.
- **Risks:**
  - LCD gutter moiré at non-integer device px per cell. Mitigation: build the gutter pattern at the backing scale and snap the pattern offset to device pixels.
  - Ghosting holds the RAF loop open. Mitigation: settle threshold, and the stage returns `false` once settled (`stage.ts:57`).
  - Fractional lattice factors break cover. Mitigation: the `squares: rect cover` fuzz over kx, ky ∈ {1.5, 1.8, 2, 3}.

## 4. Phase Q3: square field pack, nested shapes, morphs, squares skin

**Goal:**
- the square field pack: Chebyshev and Manhattan Voronoi, Schotter and Molnár, pixel sort, block glitch, multi-scale Truchet;
- a **rotation** channel snapped to π/4;
- **nested motifs** (cross-stitch, Perler, LEGO stud);
- **dot ↔ square morphs**;
- optional: a **DISPLAY "squares" skin** for existing boards (an owner decision).

**Gate:**
- goldens: 0 changed, ≤ 7 added (≤ 8 with the optional `sq-ascii`, Q3.10);
- every new field is deterministic, and its files are inside F0.9's lint (§1.4);
- frames ≤ 4 ms;
- first-load delta ≤ +0.1 kB gz against the §6 ledger (rotation and motif go only through hooks); worker-chunk delta recorded.

Downstream: phase **XQ** (aperiodic floors, [X-advanced](X-advanced.md) #7) depends on Q3.1's rotation and Q1's `{grid.gap}`. Its Ammann–Beenker rhombi are drawn as `sites`, not as squares, so Q3.1 needs no rhombus shape.

### 4.1 API additions

```ts
export interface Layer {
  /** Per-layer or per-cell rotation (radians). Square-like dots snap to multiples of π/4 and keep the snapped angle in radians — with 90° symmetry that is two states, 0 and π/4. */
  rotation?: number | ((value: number, u: number, v: number) => number)
  /**
   * A nested cut inside each square cell (roundness still comes from the exponent — this is not a shape preset):
   * 'bead' = centred round hole (Perler), 'stud' = thin annular cut (LEGO top), 'stitch' = the cell drawn as an X (cross-stitch).
   */
  motif?: 'bead' | 'stud' | 'stitch'
}
// F0.5 reserved both fields; Q3 gives them behaviour.
export interface DotInstance { /** Rotation in radians, snapped to a multiple of π/4 (square-like only; 0 or π/4 mod π/2). */ rot?: number; /** 1 bead · 2 stud · 3 stitch. */ motif?: number }
```

- **Buffer:** `form` bit 4 encodes the snapped angle (0 or π/4 mod π/2) and bits 5–7 the motif (§2.2). `toDots` decodes bit 4 back to `rot = Math.PI / 4` in radians, so array and buffer dots key the same.
- **Join:** rotated or motif dots never join (key 0).
- **Cover:** rotated sites pass `rot` to F0's `hides` (§1.4); Q adds no cover rule.
- **Golden key:** F0.5's `,θ<radians 3dp>` and `,m<motif>` channels (§1.4). Q3 adds no suffix.

**Renderers:**
- rot45 is a 45° diamond: Canvas uses 4 `lineTo`s, or rounded corners at n > 8; SVG uses one extra def per r; WebGL rotates `vP` by 45° before the SDF, using the `aJoin` slot's bit 12 when `join == 0xFFFF`.
- Motifs are cut **in the same colour, as a hole**:
  - Canvas and SVG: a reversed (counter-clockwise) inner sub-path, so the nonzero fill cancels it;
  - WebGL: `max(dBox, −dHole)`; for `stud`, the hole is the ring `abs(length(a) − .55s) − .06P`; for `stitch`, `min` of two rotated bars.

### 4.2 Field pack: `src/engine/algo/` (lazy; `algo` is not in the engine barrel)

| module | API | algorithm |
|---|---|---|
| `algo/linfVoronoi.ts` | `blockVoronoi({ seed, n, metric: 'linf' \| 'l1', w, h }) → { id: Int16Array, edge: Float32Array }` | Rasterize F0 `voronoi2` per cell. Edge = `f2 − f1 < ε`. Boundaries are axis-aligned and diagonal under L∞ (Chebyshev) and diamond-shaped under L1. The card joins regions by `group = id`. |
| `algo/schotter.ts` | `schotter({ cols: 12, rows: 22, seed }) → { x, y, rot }[]` | Nees 1968: row i adds disorder `i/rows`; offset `±.5·d` cells is quantized to ¼ cell; rotation is drawn from `±d·π/4` and **snapped** to 0 or π/4 with P(45°) = d. Molnár variant: nested square rings as `sites` along square perimeters, with a jittered side per ring. |
| `algo/pixelSort.ts` | `pixelSort(r: Raster, { lo, hi, axis, key }) → Raster` | Per row (or column), find maximal runs with `lo ≤ v ≤ hi` and stable-sort each run by key (ties broken by index). Pure, O(n log n) per run. |
| `algo/glitch.ts` | `blockGlitch(field, { seed, step, blocks, maxShift }) → Field` | Per time bucket `step`, `hash32(seed, step, b)` picks rectangles in cell units with a horizontal shift (whole cells) and an optional tone shift. Only tones change, never hue. |
| `algo/truchet.ts` | `multiTruchet({ seed, levels: 3, w, h }) → Field` | Carlson 2018: a quadtree of winged tiles at scales 1, ½ and ¼. Each tile is chosen from {arc pair, cross, line…} by hash. The colour inverts per level, and the SDF of the arcs is sampled on a `lattice: 2`. |

### 4.3 Morphs: `src/engine/squares/morph.ts`

```ts
/** Wrap layers so cells turn from dots to squares along a wavefront: roundness(t) per cell, equal ink, joins engage last. */
export function squareMorph(layers: Layer[], k: number, opts?: { from?: [number, number]; width?: number; join?: JoinSpec }): Layer[]
```

- The wavefront is `w = smoothstep(k·(1 + width) − width, k·(1 + width), 1 − dist(u, v, from))`. `shapeOf = w` (roundness 0 → 1).
- The ramp is multiplied by `inkRadius(r, n(w)) / r`, so tone stays constant (§2.5).
- `join` applies only to cells with w = 1. When a quarter-tile mask appears, it reads as "fusing".
- `migrate.ts:132` (which copies shape and roundness) also copies `join` only at the endpoints. Join is dropped mid-flight, so a moving dot never draws a stale mask.

### 4.4 Cards (Q3; the board goes to 3 columns)

| id | content | accent |
|---|---|---|
| `sq-schotter` | Nees *Schotter* on `lattice: 6` (12×22 rendered as 2 lattice groups, 0° and 45°), with disorder sweeping 0 → 1 over the loop | the most disordered square |
| `sq-blocks` | L∞ Voronoi as a Mondrian of joined regions (`group = id`), with seeds drifting over a t-scrub | the region under the pointer, or the newest region |
| `sq-sort` | Pixel-sorted portrait plus block glitch bursts every 4 s | the current sort run |
| `sq-truchet` | Multi-scale Truchet, levels revealed per t | the tile being placed |
| `sq-stitch` | Cross-stitch sampler: an alphabet and border, with `motif: 'stitch'` in 3 tones. The border motif comes from WFC (`wfc`, `algo/wfc.ts:67`) with edge sockets, so it runs continuously | the stitch being sewn |
| `sq-beads` (optional) | A Perler / LEGO split card: the same 24×24 sprite drawn as beads and as studs | none, or the sprite's eye |
| `sq-morph` | The `sq-gameboy` clock face morphing dots → squares → joined and back | the wavefront row |

### 4.5 DISPLAY "squares" skin (owner decision, LIVING-MATTER-PLAN §7.5)

**Goldens are taken without skins (verified):** `scripts/golden.ts:36` calls `sampleCard` (`scripts/lib/cards.ts:30-31`), which is `sampleLayers` on the preset's own style. No skin or display code is imported, and skins run only in the browser via `SkinOverlay` (`src/components/skins/SkinOverlay.tsx:144`). So no skin of either kind touches the 177 goldens. A verify check pins this: `squares: goldens skin-free` greps `scripts/lib/cards.ts` and `scripts/golden.ts` for `display` imports.

Two ways to build it:

| option | how | pros | cons |
|---|---|---|---|
| **A: post-raster skin `squares`** (recommended) | A stage branch that:<br>1. reads back the cols × rows cell image at ≤ 12 Hz, as `eink` and `flipdisc` do (`stage.ts:260-…`);<br>2. snaps each cell's colour to the nearest of the 6 palette colours (exact, because the palette is known) and its alpha to the nearest quantized step;<br>3. runs `joinMasks` from the lazy squares chunk on (tone, step) keys;<br>4. draws joined squares on Canvas. | A pure skin, consistent with C7; no change on the sampler path; lazy; zero first-load beyond the name (+40 B). | Readback costs about 0.2 ms per card frame; photo cards (unquantized) are passed through unchanged; recovering tone from colour is ambiguous where tones share a colour (themes with fallbacks), handled by treating them as one tone. |
| B: sample-time "look" | DotCanvas passes `{ ...style, shape: 'square', gap: .16 }` and treats every layer as `join: true` | Exact tones and levels; uses the real join pass. | Touches DotCanvas (first-load, about +0.3 kB). Changes what the card *is* rather than how it is displayed, which breaks the skin contract. Needs the squares chunk loaded before the first frame. |

Recommendation and default: **A, built only if the owner approves** (§6.2). Steps: Q3.8 (stage branch, about ½ day) and a `skins-browser: squares` snapshot.

### 4.6 Steps

| step | what | verify |
|---|---|---|
| **Q3.1** | Rotation channel: snap to π/4 multiples (stored in radians), sampler form bit, `rot` into `hides`, the 3 renderers, snap | `squares: rot snap` (any θ goes to 0 or π/4 in radians, never a flag value); `squares: rot key` (a rotated dot keys `,θ0.785`; an unrotated one adds no suffix); `squares-browser: diamond parity` |
| **Q3.2** | `linfVoronoi` and `sq-blocks` (needs F0 `voronoi2`) | `squares: linf edges` (every edge segment is axis-aligned or at 45°) |
| **Q3.3** | `schotter` and `sq-schotter` | `squares: schotter determinism`; disorder is monotone by row |
| **Q3.4** | `pixelSort`, `blockGlitch` and `sq-sort` | `squares: sort stable` (runs sorted, the multiset of values kept, ties in index order) |
| **Q3.5** | `multiTruchet` and `sq-truchet` | `squares: truchet levels` (the parity of the inversion per level) |
| **Q3.6** | Motif channel, `sq-stitch`, optional `sq-beads` | `squares-browser: motif parity`; `squares: motif ink` (bead and stud ink = analytic within 1%) |
| **Q3.7** | `squareMorph`, migrate endpoints, `sq-morph` | `squares: morph ink` (card ink stays within ±3% across k ∈ [0, 1]); `squares: morph ends` (k = 0 equals the dot card, k = 1 equals the joined card) |
| **Q3.8** | Squares skin, option A (if the owner approves) | `skins-browser: squares`; `squares: goldens skin-free` |
| **Q3.9** | **Integration-queue commit** (after Q2's slot, §1.5): `ids --assign` and `meta.ts` blurb and tags for every new widget, goldens (new keys only), board columns 3, size with the worker chunk, and the doc updates at merge: DESIGN.md (§5), `docs/README.md`, `docs/PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` (`upcoming`: drop the Q3 row) | as Q1.12, with "N added" for the cards that shipped |
| **Q3.10** (optional, after L1.3) | `sq-ascii`: glyph tiles in square dots. It consumes `src/engine/life/glyphTiles.ts` (owned by track L, API frozen at L1.3) and never edits it. Q defines two square alphabets with `defineAlphabet` in `src/engine/squares/alphabets.ts`: `STITCH3` (cross-stitch: `X`, half stitches `/` `\`, backstitch `-` `\|`, full block) and `ASCII5` (a 5×5 density ramp ` .:-=+*#%@`). The card samples the mirror portrait (`mirror.ts:43`) into `TileSample`s, picks glyphs with `matchTile` / `rampGlyph`, and draws `tileLayers` on a card style with `shape: 'square'` and `gap: .16`. Accent: the tile that changed last | `squares: glyph alphabets` (every glyph matches itself under `matchTile`; alphabet bitmaps pinned by FNV); `git diff --exit-code src/engine/life/glyphTiles.ts`; `squares: t=0 picture`; `squares: frame ≤ 4 ms` |

- **Can run in parallel:**
  - Q3.2, Q3.3, Q3.4 and Q3.5 are independent algorithm and card pairs, and each touches only its own algo file and its own section of the board file;
  - Q3.1 ∥ Q3.6, which touch renderer hooks in different branches;
  - Q3.8 is independent of everything else;
  - Q3.10 is independent too, but only after L1.3 has merged.
- **Cross-stitch twice, on purpose:** `sq-stitch` (Q3.6) draws one X *inside* each cell with the `stitch` motif; `sq-ascii` (Q3.10) builds glyphs *out of* square dots on a tile lattice. If the owner wants only one, Q3.10 is the one to drop.
- **Estimate:** 4–5 days, or 3.5 without `sq-beads` and the skin; +½ day for the optional Q3.10.
- **Risks:**
  - **Motif turns into a back door for shape presets.** AGENTS.md says "don't reintroduce shape presets". Mitigation: motif is only an inner cut; roundness stays on the exponent. An owner check is listed in §6.
  - **Rotated squares overlap their neighbours.** A diamond has a 1.41 s reach. Mitigation: Schotter uses s ≤ .7h, and rotated sites cover through F0's `hides` with `rot` (the `ax + ay ≤ √2` diamond branch).
  - **Pixel-sort cost on 144².** About 0.5 ms; mitigate by caching per glitch bucket.

## 5. DESIGN.md updates (same PR as each step, per the AGENTS.md rule)

Ownership (§1.5): **Q owns DESIGN.md › Shapes (`DESIGN.md:135`) and › Display skins (`DESIGN.md:360`)**. F0 owns › Light, and M appends under › Light › Materials, so Q never edits those. Q's lines in Do's and Known Gaps are one-line appends made in Q's integration-queue commits (Q1.12, Q2.7, Q3.9), so they can't collide with L or M.

1. **Shapes, new "### Square cells" table** (Q1.1, finalized in Q1.12):

   | Token | Default | Use |
   |---|---|---|
   | `{grid.gap}` (`DotStyle.gap`) | unset (no clamp); squares cards .16 | Gutter between square cells as a fraction of pitch: s = min(r, (1 − gap)·P/2) |
   | `{grid.shapeSteps}` | 8 | `shapeOf` roundness snaps to 1/8 (quantized, like sizes) |
   | `{join.at}` | 0 | Minimum quantized value that joins |
   | `{join.group}` | 0 | Join id, a number or `(u, v) => id`; cells join only within one id (pieces, dominoes) |
   | `{join.outer}` | from the squircle (`cornerFraction(n)`), 0 for `square` | Convex corner radius of joined blobs |
   | `{join.inner}` | 0 | Concave fillet at notches (visible with a gutter) |
   | `{join.seam}` | 0 | Seam left inside joined blobs |

   Add an ink note: "a square holds 4/π the ink of a circle of the same r. A joined interior is P², so joined fills go one grey band lower."
2. **Dot Roundness Scale** (DESIGN.md:141-146): add a note on the `{rounded.sharp}` row: "join-capable when square-like, i.e. when the site cover `hides` treats it as a square (n ≥ 8, or `square`)". Q states no roundness threshold of its own; the cover rule itself is documented once, with F0.6.
3. **Do's** (DESIGN.md:290-298):
   - "Fuse cells with `Layer.join`, never with rects drawn outside the pipeline."
   - "The accent joins only with `join.accent`."
   - In the renderer rule: "join, shapeOf and rect layers stay CPU instances (never GPU passes). All three renderers draw joins with no cracks (`scripts/squares-browser.ts` gates)."
4. **Display skins table** (DESIGN.md:364-372): add rows `lcd` (Q2), `grout` (Q2) and `squares` (Q3, if approved), with physics and refresh columns.
5. **Known Gaps** (DESIGN.md:378-…): add `conn: 8` diagonal bridges (code 5, Q3), rotation limited to π/4, and SVG joins relying on bleed.
6. **Do not** add `{colors.*}` tokens. The LCD paper and ink are skin physics (as the e-ink paper is, `stage.ts:30-34`), and no second accent is introduced.

**The other docs at merge** (each integration-queue commit, Q1.12 / Q2.7 / Q3.9):
- `npx tsx scripts/widgets/ids.ts --assign` for every new widget (`ids.json`, `catalog.ts`), and a `meta.ts` `cardBlurbs` row (one line plus lowercase tags) for each;
- `docs/README.md`: the squares row, and the status of this file;
- `docs/PROGRESS.md`: what is done and what's next, plus the first-load ledger numbers;
- `CHANGELOG.md`: an `[Unreleased]` entry for the phase;
- `src/changelog.ts`: the `upcoming` rows (`changelog.ts:142`). Q1 adds Q2 and Q3 as `planned`, and each later phase removes its own row.

## 6. Open items for the owner

These match the consolidated list in LIVING-MATTER-PLAN §7. Each has a default, so work can proceed.

1. **First-load spend.** Q1 costs ≤ +0.6 kB gz on the buffer path, or ≤ +0.4 on the array-path fallback (§2.10). **Default: the array-path fallback until F0.11's ≥ 1 kB cut lands**, then the buffer path within +0.6.
2. **Squares skin:** option A, B or none (§4.5). **Default: A, built only if approved** (Q3.8). Without approval, no skin ships.
3. **Bead, stud and stitch as inner cuts.** **Default: allowed**, as nested cuts with roundness still on the exponent (§4.1). The owner should confirm that this does not break AGENTS.md's ban on shape presets. If it does, Q3.6 and `sq-beads` drop out, and `sq-stitch` falls back to Q3.10's glyph-tile cross-stitch.
4. **Board group.** **Default: ENGINE** (`engine` in `manifest.ts:78-84`). The alternative is `play`, because of Tetris.

## 7. Summary of estimates

| phase | days | parallel lanes | depends on |
|---|---|---|---|
| Q1 core + board v1 | 4.75–5.25 | mask/geometry ∥ sampler; 3 renderers; 3 cards | F0-B (F0.5 key, reserved fields and backfill; F0.6 `hides`) before Q1.1 and Q1.4; F0.9 lint; F0.11 cut for the buffer path (else the fallback); integration slot after L1 |
| Q2 skins, rect cells, teletext, lines | 3 | skins ∥ sampler/cards | Q1; integration slot after M2 |
| Q3 field pack, motifs, morph, skin | 4–5 (+½ for the optional Q3.10) | 4 algorithm/card pairs ∥ rotation/motif ∥ skin ∥ glyph tiles | Q1; F0 `voronoi2` (Q3.2); L1.3 `glyphTiles` (Q3.10 only). XQ depends on Q3.1 |
