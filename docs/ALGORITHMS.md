# ALGORITHMS — niche algorithms as dot sources

> Current (2026-10-27). Code: `src/engine/algo/` (import from `src/engine/algo`: it is deliberately not re-exported by the `src/engine` barrel, which first-load code imports, so it stays out of the first-load budget), cards: `src/widgets/boards/algorithms.ts` (board `algorithms`, `/algorithms/`), checks: `scripts/algorithms.ts` (run by `pnpm verify`; alone: `npx tsx scripts/algorithms.ts`).

Four algorithms the engine did not have, chosen for what they give a dot matrix: each one produces either **dot sites** (positions, so `sites` layers) or a **field** sampled on the card grid, and each animates by scrubbing its own history, so a card stays a pure function of `t`.

What was already there, and so was not added: Bayer and Floyd–Steinberg dithering (`fields/haltoneField.ts`), void-and-cluster blue noise and STBN (`halftone/`), Bridson Poisson-disc (`fields/scatterField.ts`), Gray–Scott, falling sand and Life (`sim/`), stable fluids, Verlet and PBD (`physics/`), growing NCA (`nca/`), Hilbert ordering and SDF morphs (`migrate/`), ray casting (`scene/`).

All four are plain TypeScript, framework-free, with no dependencies, and deterministic: randomness is `mulberry32` from a seed, and trigonometry inside chaotic or long loops is `dsin`/`tsin` (range reduction + polynomial, or a table of it), which only uses `+`, `×`, `floor`/`round` and is bit-identical in every JS engine. `Math.sin` is not. Since F0.1 they live in `src/engine/noise/dmath.ts` (with `datan2`, `dexp`, `dpow`, `ihash`, `rngFor`; see [Deterministic math and noise](#deterministic-math-and-noise-srcenginenoise) below); `algo/attractor.ts` re-exports them, so `dla.ts` and the checks import them as before.

| Card | Algorithm | Output | Pipeline | Cost (idle laptop, Node) |
|---|---|---|---|---|
| `algo-stipple` | Weighted Voronoi stippling (Secord 2002) | 2,400 sites per Lloyd iteration | `sites` layers, one per tone/size | one-time ~60–150 ms, then a lerp per frame |
| `algo-attractor` | Clifford strange attractor (Pickover / Bourke) | 144 × 114 log-density histogram | one `toneOf` field on the card grid | ~1.5 ms per frame (32k orbit steps) + sampling |
| `algo-collapse` | Wave Function Collapse, simple tiled model (Gumin 2016) | tile per cell + full option history | dotted strand `sites` + one "superposition" site per open cell | ~5 ms per solve (one per 16 s loop) |
| `algo-aggregate` | Diffusion-limited aggregation (Witten & Sander 1981) | disc positions in arrival order | `sites` layers by age | one-time ~30 ms |

Budgets: every card's frame (layers + sample) is checked at ≤ 4 ms median, warm (the bench "hero" budget), scaled by a measured machine-load factor so a busy CI box doesn't fail it. Timings are printed by `scripts/algorithms.ts`.

---

## 1. Weighted Voronoi stippling — `stipple(spec)`

**Reference:** Adrian Secord, *Weighted Voronoi Stippling*, NPAR 2002; Lloyd, *Least squares quantization in PCM*, 1982.

**What it does:** scatter `n` stipples over a density raster by rejection sampling, then Lloyd-relax: each iteration assigns every pixel to its nearest stipple (a discrete Voronoi diagram) and moves each stipple to the density-weighted centroid of its cell. The stipples converge to a centroidal Voronoi tessellation of the density, which is blue noise whose local spacing follows the image. Tone comes from *where* dots are, not from how big they are, so the result maps directly onto `sites`.

**Implementation:**
- The density is evaluated once per pixel; zero-density pixels are skipped (they never move a centroid).
- **Nearest stipple, exact (first `exact` iterations, default 3):** a uniform bucket grid (CSR, rebuilt per iteration, ~1 stipple per bucket at average density) and an expanding ring search that stops once the best distance is below `r·cell + off` (the distance to the edge of the pixel's own bucket). The search starts from the pixel's last owner, so it usually stops after ring 1.
- **Nearest stipple, walk (later iterations):** greedy descent from the pixel's last owner over the last iteration's Voronoi adjacency (cells that share a lit pixel edge), the Delaunay walk: about 6 distance tests per pixel. The adjacency is one iteration old, so the walk can miss a new neighbour while stipples still move. The checks bound the difference against the exact search (max < 0.5 px, mean < 0.01 px).
- Iterations are lazy and cached: `frame(k)` runs the iterations not yet run. `at(k)` blends two iterations for fractional `k`, which gives smooth motion. `moved(k)` is the convergence curve (mean move per iteration).

**Parameters:** `w, h` (raster px), `density(x, y) → [0, 1]`, `n`, `seed`, `iterations`, `exact`.

**The card:** a moon (hand-placed maria, craters and Tycho's rays) lit from the right with the Lommel–Seeliger law, so the limb doesn't darken. The density is brightness^2.1 at 1.5× the card pitch. There are three tone/size bands by local density (`value` 1.1, `idle` .95, `mid` .8), and the unlit limb is a faint dotted arc at equal arc length. Timeline (14 s): hold the relaxed moon, fly back to the random start (0.9 s), relax over 12 iterations with ease-out. The rail knob is red while it relaxes (live). The footer shows `LLOYD k/12` and the dot count.

## 2. Strange-attractor density — `attractorDensity(params, options)`

**Reference:** Clifford Pickover's maps as catalogued by Paul Bourke (*Clifford attractors*, *Peter de Jong attractors*).

```
clifford  x' = sin(a·y) + c·cos(a·x)    y' = sin(b·x) + d·cos(b·y)    |x| ≤ 1 + |c|, |y| ≤ 1 + |d|
dejong    x' = sin(a·y) − cos(b·x)      y' = sin(c·x) − cos(d·y)      |x|, |y| ≤ 2
```

**What it does:** it iterates one point and histograms where the orbit lands. Tone is `log(1 + hits) / log(1 + max)`. Both maps are bounded analytically, so the histogram is framed by those bounds and never refits. When the parameters drift, the shape morphs in place.

**Implementation:**
- `tsin`/`tcos` are a 4096-entry table of `dsin` with linear interpolation (error < 3e-7), as deterministic as `dsin` and cheaper than `Math.sin`.
- **Collapse guard:** chaotic maps have periodic windows, where the orbit falls onto a few points and the picture vanishes. With `minCovered`, a frame that hits fewer pixels is retried with `a`, then `b`, nudged by ±1, ±2, ±3 × `nudge` (default .013). The result reports the `a`, `b` actually drawn. On the card's path this triggers on about 5% of frames, and none collapse (the check samples the full 37 s × 23 s beat).

**Parameters:** `kind`, `a b c d`, `w h`, `iterations`, `warmup` (64), `x0 y0`, `margin`, `minCovered`, `nudge`, `out` (a reused buffer).

**The card:** the ring family `c = −1.9, d = −0.4`, with `a = −1.93 + .11 sin(2πt/37)` and `b = 1.86 + .06 sin(2πt/23 + 1)` (incommensurate periods, so the shape never repeats). It is drawn as one multi-tone layer in a single scan: log density ≤ .2 is empty, then faint wisps, the mid body, and white folds. A white cell needs two bright neighbours, so lone specks stay mid. There is no red: an attractor has no "now". The footer shows the drawn `a`, `b`.

## 3. Wave Function Collapse — `wfc(spec)`

**References:** Maxim Gumin, *WaveFunctionCollapse* (2016); Isaac Karth & Adam M. Smith, *WaveFunctionCollapse is Constraint Solving in the Wild*, FDG 2017.

**What it does:** every cell starts as a superposition of all tiles. Each step *observes* the undecided cell of lowest Shannon entropy (weighted by tile frequency, ties broken by a seeded hash) and collapses it to one tile drawn by weight. It then *propagates*: neighbours lose every tile whose facing socket no longer matches (AC-3 with a stack), until nothing changes.

**Implementation:**
- Tiles are four edge sockets `[N, E, S, W]` plus a weight; compatibility is socket equality. The wave is one bitmask per cell (≤ 31 tiles). `border` forces a socket on the outer edges.
- **Backtracking:** local propagation can't see global constraints. Closed strands need an even number of crossings on every cut, so contradictions are common near the end. On a contradiction the solver restores the wave saved before the last observation, bans the chosen tile and propagates again, popping further while that fails. After `maxBacktracks` (default 16; chronological backtracking thrashes) it starts a fresh attempt from `hash32(seed, attempt)`, up to `restarts` (24) times. Independent attempt seeds keep different seeds giving different results.
- **History for scrubbing:** `history[s]` holds every cell's option count after `s` observations on the final path (bans fold into the row they constrain, so counts never grow). `observed[s − 1]` is the cell observed at step s, and `settledAt[i]` is the first step at which cell i had one tile left.

**Parameters:** `w h`, `tiles`, `seed`, `border`, `maxBacktracks`, `restarts`.

**The card:** knot tiles on 15 × 12 cells of 9 card cells: blank, two straights, four Truchet quarter arcs, a crossing (over/under alternates by parity, the under strand drops a dot) and two double arcs. Strands are dotted sites at about 2.3-cell spacing, and edge-midpoint sites are shared, so neighbours merge into one dot. An undecided cell is one faint site whose size is its option count (its superposition). The tile observed this step is red (live). Timeline (16 s): collapse over 10 s (a new seed every loop), hold for 5 s, dissolve in reverse for 1 s.

## 4. Diffusion-limited aggregation — `dla(spec)`

**Reference:** T. A. Witten & L. M. Sander, *Diffusion-Limited Aggregation, a Kinetic Critical Phenomenon*, PRL 47 (1981); off-lattice jumps after Meakin.

**What it does:** particles are released one at a time just outside the cluster and random-walk until they touch it, then stick. Tips screen the fjords, so the cluster grows a branching fractal (D ≈ 1.71 in the plane). It runs off-lattice: unit discs at continuous positions, with no lattice anisotropy, and they become `sites` directly.

**Implementation:** the walk is a sequence of jumps to the rim of the largest particle-free circle around the walker. A free walk exits a circle uniformly on its rim, so this keeps the statistics of the plain walk.
- **Far:** the radius comes from the cluster radius.
- **Near:** it comes from `near`, a per-cell lower bound of the distance to the closest particle (updated within 10 units on each stick).
- **Within 2.5 units:** it comes from an exact bucket-grid search. Steps never drop below `minStep`. A step that would overlap is bisected to the first contact, so discs touch and never overlap.
- Walkers past `kill` × the launch radius relaunch.
- The output is the arrival order with `parent`, `depth`, `radius` and `gyration` (radius of gyration) per particle.

**Parameters:** `w h` (in diameters), `n`, `seed`, `maxRadius`, `kill`, `minStep`.

**The card:** a 143 × 114 domain, one disc per card cell, about 1,300 particles. Growth is revealed by arrival order at N ∝ (t/13)^1.7, so the front advances at about constant speed. Tone follows age: the oldest quarter faint, then mid, idle, the young tips white, and the newest 16 red (live). The footer measures the fractal dimension live, as the least-squares slope of log N against log Rg.

---

## Deterministic math and noise (`src/engine/noise`)

> The shared toolkit of the living-matter tracks (`docs/living-matter/F0-foundation.md` §2). Import `src/engine/noise` (or a file in it) directly: like `algo/`, it is not re-exported by the `src/engine` barrel, so it never reaches first load. Checks: `scripts/noise.ts` (run by `pnpm verify` in the noise slot; alone: `npx tsx scripts/noise.ts`).

### Scalar math (`noise/dmath.ts`)
Only `+ − × /`, `Math.floor/round/trunc/abs/min/max/sqrt/imul/fround`, comparisons and table reads, which IEEE 754 makes bit-identical in every engine. Measured on 2026-10-27 (Node 22, `scripts/noise.ts`):

| Function | Method | Accuracy (gate → measured) | Cost vs `Math.*` (gate → measured) |
|---|---|---|---|
| `dsin` / `dcos` | round to [−π, π], fold to [−π/2, π/2], Taylor to x¹³ | < 1e-8 → 6.6e-10 | n/a |
| `tsin` / `tcos` | 4096-entry `dsin` table + linear interpolation | < 1e-6 → 2.9e-7 | ~4× cheaper than `dsin` |
| `datan2(y, x)` | octant reduction, (a − 1)/(a + 1) + π/4 above tan(π/8), odd series to x¹⁹ | ≤ 1e-9 rad → 3.8e-10 (2e6 samples) | ≤ 2× → 0.9× |
| `dexp(x)` | Cody–Waite k·ln2 split (fdlibm hi/lo), degree-13 Taylor, × 2^k as two exact table factors | rel ≤ 1e-13 on [−708, 709] → 2.2e-16 | ≤ 4× → 0.7–1.4× |
| `dpow(x, y)` | integer \|y\| ≤ 64: repeated multiplication (so `dpow(x, 2) === x * x`); else `dexp(y · dlog x)`, dlog splits m · 2^e from the IEEE bits (exact), m ∈ [√½, √2], and 2·atanh to s²¹ | rel ≤ 1e-12 where \|y ln x\| ≤ 50 → 1.2e-14; ≤ 1e-9 elsewhere → 2.1e-13 | ≤ 6× → 2.2–3.6× |
| `ihash(a, b, c)` | imul by three odd constants, xor, murmur3 finaliser; int32 inputs | a bijection in `a` alone: no aliasing at ±2²³, where `hash32` (×256 fixed point) aliases | n/a |
| `rngFor(seed, id, step)` | `mulberry32(ihash(seed, id, step))` | one independent stream per entity and step | n/a |

Edges: `datan2(0, 0) = 0`, signed zeros ignored, NaN → NaN; `dexp` overflows to Infinity above 709.78 and underflows to 0 below −745.1; `dpow(x, 0) = 1`, `dpow(0, y < 0) = Infinity`, a negative base with a non-integer exponent is NaN, with an integer one the sign follows parity. `goldens/noise.json` pins FNV-1a hashes of fixed input sweeps through every function, so a bit change anywhere fails `scripts/noise.ts`.

### Gradient noise (`noise/gradient.ts`)
2-D gradient (Perlin) noise on the integer lattice: quintic fade 6t⁵ − 15t⁴ + 10t³ and 8 gradients (±1,0) (0,±1) (±√½,±√½) picked by `ihash(ix, iy, seed) & 7`, scaled by √2 so the bound is exactly [−1, 1]. Value noise is cheaper but blobby and shows its grid at 144²; simplex needs skew constants and a corner sort for little gain at these sizes. fBm removes the axis alignment by rotating every octave by R = [[0.8, −0.6], [0.6, 0.8]] (4 multiplies, no trig), with octave seeds `seed ^ imul(o, 0x9e3779b9)`.

| Function | Range | Notes |
|---|---|---|
| `noise2(x, y, seed)` | [−1, 1] | one lattice cell = one feature; ~6 features across 144 cells is `noise2(c * 6 / 144, …)` |
| `noise3(x, y, z, seed)`, `noise3Grad(…, out)` | [−1, 1] | 12 edge gradients of improved Perlin noise; scale 1/1.0363 = 1 / the exact sup of the raw sum (1e6 samples reach ≈ 0.92); `noise3Grad` writes the analytic ∂/∂x, ∂/∂y |
| `fbm2(x, y, octaves, seed, o)` | [−1, 1] | Σ gainᵒ·noise2(Rᵒ·p·lacᵒ) / Σ gainᵒ; octaves floored and clamped to 1..8 (default 4), lacunarity 2, gain .5 |
| `turb2`, `ridge2` | [0, 1] | Σ gainᵒ·\|n\| (marble, rust, smoke) and Σ gainᵒ·(1 − \|n\|)² (veins, cracks), over Σ gainᵒ |
| `valueNoise2(x, y, seed)` | [0, 1] | bit-identical to `cinema.ts`'s former private `vnoise` (hash01 lattice, smoothstep fade); migration only |

Map a signed value to a tone with `.5 + .5 * n`. Budgets (`scripts/noise.ts`, normalised to load factor 1; measured 2026-10-27): `noise2` 144² ≤ 1.2 ms (0.41 ms); `fbm2` 4 octaves 144² ≤ 4.5 ms (1.6 ms: bake it, never per frame at full resolution); `fbm2` 4 octaves 48² ≤ 0.8 ms (0.22 ms: per frame on a lattice is fine).

### Curl noise (`curl2`, in `noise/gradient.ts`)
Divergence-free 2-D flow after Bridson et al. 2007 (*Curl-noise for procedural fluid flow*): ψ = Σ gainᵒ·noise3(x·2ᵒ, y·2ᵒ, t·speed, seedᵒ), v = (∂ψ/∂y, −∂ψ/∂x), taken from `noise3Grad`'s analytic gradient (one call per octave, no finite differences). Defaults: 2 octaves, speed .25, gain .5; writes into `out`, so nothing is allocated. It is meant for particles and agents (lily-pad drift, marine snow), not per-cell fields. Budget: 1000 points ≤ 0.3 ms.

### Worley / Voronoi (`noise/voronoi.ts`)
`voronoi2(x, y, seed, metric, out, jitter)` → `{ f1, f2, id, x, y }` in `'l2' | 'l1' | 'linf'`. There is one feature point per lattice cell, at cell + jitter·(h & 0xffff, h >>> 16)/65536 with h = `ihash(cx, cy, seed)`; 16-bit coordinates are exact in float32, so the GPU sees the same points. `id` is a salted `ihash` of the nearest cell (stable per cell, independent of where its point sits), and `x, y` is the nearest feature point (pane and chip centres).

**Exact search with an early out.** Scan the 3×3 cells around floor(p). If the wanted distance (F1, or F2 when it is read) is still > 1, scan the 16-cell ring at ±2, skipping each ring cell whose per-axis lower bound (lx, ly, combined per metric) can't beat the current distance (the same result as scanning it). The search has one copy per metric, so there is no per-cell metric switch. Ring points are always > 1 away along one axis, and points beyond the ring are > 2 away. So F1 is exact in all three metrics, and F2 is exact for L2 and L∞; L1's F2 can only be wrong past 2 (0 mismatches in 1e5 brute-force samples). Ties keep the first-scanned cell, so no float sort is needed. `voronoiBorder2` is the exact distance to the nearest cell border (iq 2012: an exact F1 pass, then the bisector distances over the 5×5 cells around the nearest cell), for lead moats and grout of even width. Budget: 144² ≤ 3.5 ms per metric, so bake panes and terrazzo, or sample on lattices ≥ 2 when animating.

## Checks (`scripts/algorithms.ts`)
- **Stipple:** deterministic; walk ≈ exact; every stipple ends on the density; Lloyd moves shrink; the moon builds cold within its budget.
- **Attractor:** `dsin` < 1e-8 and `tsin` < 1e-6 against `Math.sin`; deterministic; the density is in [0, 1]; the card path never collapses.
- **WFC:** 32 seeds solve; every touching socket matches and the border stays closed; the history is monotone and observed cells settle at their step; deterministic; 32/32 distinct; the solve time is within budget.
- **DLA:** deterministic; no overlaps; every disc touches its parent; everything stays inside the domain; the radius only grows; D is in 1.6–1.85; the cold build is within budget.
- **Board:** cards are pure in t; t = 0 is the finished picture (goldens, thumbnails, reduced motion); red appears only on the live fronts; each frame is ≤ 4 ms × the load factor.

## Not done (candidates for later)
- Void-and-cluster as a standalone ordered dither (the STBN mask already is one).
- Ostromoukhov variable-coefficient and Riemersma (Hilbert-path) error diffusion.
- Sand-pile automaton, turmites, boids / flow-field advection.
- A GPU port of the attractor histogram (atomic adds would need WebGL2 transform feedback; out of scope).
