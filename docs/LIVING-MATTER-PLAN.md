# LIVING-MATTER-PLAN: pond, squares, materials

> Status: **planned, reviewed** (2026-10-27). Research came from four agents: a teardown of daoho.dev's koi pond, plus surveys of creature and pond algorithms, square-cell design, and physical materials. Nothing here is built yet.
> It covers three new directions that share one foundation:
> 1. **Living scenes:** a koi pond and other ecosystems drawn in glyph tiles.
> 2. **Squares:** cells that are spaced or joined squares, not only dots.
> 3. **Materials:** cards that read as stone, glass, metal, fabric and thread.
>
> Invariants hold throughout (AGENTS.md):
> - Field → Sampler → Renderer;
> - one accent per board;
> - quantized sizes;
> - `src/engine` framework-free with no deps;
> - goldens;
> - first-load JS ≤ 150 kB gz, with every new board lazy.

## Detailed phase plans

This page is the overview. Each track has a step-by-step plan: steps of about half a day, APIs, parameters, checks, budgets, risks and estimates.

| Doc | Phases |
|---|---|
| [`living-matter/F0-foundation.md`](living-matter/F0-foundation.md) | F0.1–F0.11: deterministic math (`dmath`), noise and Voronoi, IR builtins, the golden-key channels and style backfill, the square cover rule, the light and tilt hub, per-card fps, the first-load cut, the determinism lint |
| [`living-matter/L-pond.md`](living-matter/L-pond.md) | L1 koi pond and water, L2 ecosystems, L3 polish and interaction, L4 full-bleed hero (optional) |
| [`living-matter/Q-squares.md`](living-matter/Q-squares.md) | Q1 joined squares and `shapeOf`, Q2 the `lcd` and grout skins and rect cells / teletext, Q3 the field pack, rotation, nested shapes and morphs |
| [`living-matter/M-materials.md`](living-matter/M-materials.md) | M1 relief, anisotropic shine, matcap and weave, M2 glass and caustics, M3 the workshop extras |
| [`living-matter/X-advanced.md`](living-matter/X-advanced.md) | Advanced additions: XL, XQ, XM, X1 (pond depth), X2 (GPU tier, gated) |

**The plan set was reviewed by an independent agent.** All three blockers and all eleven major findings are fixed in the track docs:
- **Golden key:** one channel table, with a hash-preserving style backfill done once in F0.5.
- **Light and tilt:** one data contract, `lightSrc / lightAz / lightEl` plus `tx / ty`.
- **The "clusters of small dots" rule:** an owner ruling now comes before L1.3, after a half-day prototype.
- **Frame rate:** per-card fps moves into F0.10. Cards render at 12 fps by default, not at display rate.
- **Determinism:** one lint, and `dexp` / `dpow` are added to `dmath`.
- **Caustic pool:** a feasible step and memory budget.
- **`activeDim`:** not counted as part of the accent until the owner rules on it.
- **Phase names:** they no longer collide.
- **First load:** a ledger with delta gates.
- **Ownership and probes:** file ownership rules, and a touch probe for materials.

## 1. The reference: how daoho.dev's pond works

These findings were verified by reading its page chunk (`/_next/static/chunks/app/page-*.js`). The code has no license, so **we implement from the published algorithms** (argonaut, Reynolds, Elias) and copy none of its source.

### Rendering and grid
- Canvas 2D on a grid of square tiles: cells are 8–12 px wide and 2 px taller than wide.
- Each cell is a `fillRect` with a 1 px gutter plus one monospace glyph. The gutter is what gives the tiled look.
- Per-cell typed arrays (glyph, colour, alpha, tile, shadow, dim) are cleared every frame. Draw order: shadows → wake → ripples → pellets → fish cells → bite bursts.

### Fish
- **Body:** a 20-node follow-the-leader spine, where each joint's bend is clamped to ±0.16 rad (argonaut's technique). Only the head integrates motion.
- **Swim wave:** applied at render time, `A(s)·sin(phase − 4.6 s)`, with an amplitude that grows toward the tail. It is driven by a burst-and-glide `beat`.
- **Shape:** an analytic test in spine space (arc length `s`, signed offset `v`) with a width profile `B(s)`. It adds fin ellipses at s ≈ 0.19 and 0.47, a tail fan, eyes (`o`) and barbels (`- | / \` by tangent).
- **Coverage per cell:** the cell centre, plus 4 quarter samples near edges.
- **Tile glyph and shade:**
  - shading follows a cylinder normal across the body;
  - interior glyphs come from the ramp `t%SX8@#`, plus hash jitter;
  - the glyph is drawn darker on its own tile.
- **Koi markings:** hashed ellipses in (s, v) space with edges warped by noise. The varieties are kohaku, sanke and tancho.
- **Flicker:** about 3% of tiles are darkened at random.
- **Depth:** a `:` drop shadow offset by depth, and alpha that fades with depth.

### Behaviour
- Steering terms: wander, seek food, startle/flee from a fast pointer, curiosity (orbit a still cursor), separation, weak alignment, avoiding the page's text boxes, and edge return.
- Turn rate is capped.
- Depth dives every 8–20 s.

### Water and food
- Ripples are **analytic expanding rings**, not a wave equation. The glyph follows the ring tangent.
- The wake is a diffused, decaying energy grid behind the tail nodes, drawn as `.` and `-`.
- The orange `o`s are **food pellets**: a click drops 5–7. Each one falls, lands with a ripple, drifts, gets eaten with a `* + .` burst, and fades out.

### Performance
- Fixed 60 Hz steps, typed arrays, and a cached colour string per colour.
- The loop pauses while off-screen.
- Under reduced motion it pre-runs 240 steps and draws one still frame.

### Where we diverge
**Colour.** daoho uses orange plus white and black on a 6-stop gradient. Our rule is one accent per board, so:
- koi red is `{colors.dotActive}`;
- white, black and sanke spots are tones (`value`, `faint`, or no dot at all).

**Glyphs.** Glyphs are not `fillText`. Two options:
- **Micro-pattern glyphs:** a glyph tile is a k×k block of dots whose pattern *is* the glyph (`/ \ | - ~ ·`, quadrant blocks, density ramps). This stays dot-aligned and quantized.
- **Font glyphs:** use the type module's glyph fonts inside a tile (5×7 glyphs in tiles of at least 6×8 cells).

**Water.** We use a real two-buffer wave equation, so ripples interfere and reflect off the pond edge. This is better than analytic rings and costs about 0.2 ms per step.

The second reference ("Good evening, Marcelo", jellyfish in glyph grids) wasn't found. Its look is the standard brightness → glyph ramp over a soft-body or SDF scene.

## 2. Shared foundation (build first)

| Module | API sketch | Unlocks |
|---|---|---|
| `src/engine/noise/` (lazy, not in the barrel) | `dmath.ts`: `dsin dcos tsin tcos datan2 dexp dpow` (bit-identical across engines); `noise2/3`, `fbm2`, `turb2`, `curl2→[vx,vy]`, `voronoi2(x,y,seed,metric)→{f1,f2,id}` (metric: `l2` \| `l1` \| `linf`). Full-res 4-octave fBm costs ≈3.2 ms per 144² frame, so **bake it or use a coarser lattice** | koi patterns, curl flow, stone, wood, rust, sand, leather, Chebyshev Voronoi |
| IR builtins for the same functions | same names in `src/engine/ir` | the same noise on the GPU path |
| Light input hub (a `Source`, opted into by boards) | pointer torch → tilt → `sunAt` through `sceneLight()`. Publishes `lightSrc lightAz lightEl` (64 azimuth buckets, ≤ 15 Hz), `tx ty` (tilt offset, 0 at rest) and `gx gy` (gravity, ≈(0,1) upright, physics only). Cards must declare the keys they use in `defaults`, and boards add `sources: [lightSource]`. The iOS permission button lives in the TOOLS sheet | every material card, pond tilt, physics |
| Golden key channels (F0.5) | optional suffixes `,s<shape>:<r>` (only when a dot differs from its preset's base style), `,j<mask>:<hx>:<hy>:<ro>:<ri>:<seam>`, `,θ<radians>`, `,a<aspect>`, `,m<motif>`. A one-time, hash-preserving `style` backfill of all 177 entries means later diffs only add keys | squares can't regress silently. Today `scripts/golden.ts:28` hashes only x, y, r, opacity, colour |
| Per-card fps (F0.10) | `WidgetPreset.fps` plus a phone tier. Today animated cards render at `fps ?? (motion ? 12 : 30)` (`DotCanvas.tsx:398`) | smooth koi, Loom shuttle, startles |

Determinism rules (enforced by one F0.9 source-scan lint over `life/`, `matter/` sims and `squares/` sims):
- seed each entity with `rngFor` / `ihash(seed, id, step)`;
- use `dmath` and never `Math.sin`, `Math.atan2`, `Math.hypot`, `Math.exp`, `Math.pow` or `Math.random` inside a sim step;
- fixed dt;
- no float sort without a tie-break.

## 3. Track L: living scenes (Pond board, `/pond/`)

Every scene is a `World` (`src/engine/physics/world.ts`):
- the **pristine** run is seeded and checkpointed, so t = 0 and goldens are stable;
- the first input forks a **live** copy, which heals back after it has been idle.

Taps, food and startles therefore never move goldens. Touch follows the scroll-first policy (UX-PLAN §10):
- **tap** acts;
- **press-and-hold** lures;
- no drag is required.

### Modules (`src/engine/life/`, lazy, not re-exported from the engine barrel, checks in `scripts/life.ts`)

In build order:
1. **`ripple.ts`:** `createRipple({w,h,damp,mask})`, `rippleStep`, `rippleSplat(x,y,amp,rad)`, `rippleGrad`. Uses the Elias update `h₂ = (ΣN4(h₁)/2 − h₀)·damp`, with walls from the pond mask.
2. **`glyphTiles.ts`:** `glyphTileLayers(grid, k, sample→{cover,angle,tone}, alphabet) → Layer[]`. Alphabets are `EDGE4` (`- / | \` snapped from the Sobel angle), `RAMP` (density) and `QUAD` (2×2 sub-cell). `matchTile(sub16)` picks the nearest micro-pattern by L2 over 16 subsamples, after Alex Harri's contrast step. One layer per tone.
3. **`chain.ts`:** `createChain(n, seg, maxBend)`, `chainFollow`, `ropeStep` (verlet with drag), `fabrik(target)`.
4. **`body.ts`:** `bodyField(chain, profile, wave) → {cover,u,v}`; `koiPattern(kind, seed)(u,v) → tone` (kohaku, sanke, showa, tancho via fbm thresholds in body UV). Tail-beat frequency comes from the Strouhal number, St ≈ 0.3.
5. **`steer.ts`:** seek, flee, arrive, wander; `contain(sdf)` with a 0.5 s look-ahead; `flock(agents, hash, w, {topological})`; `startle` (a C-start stretched to 150 ms bend + 400 ms burst).
6. **`agents.ts`:** physarum (Jones 2010: 3 sensors, SA 22.5–45°, RA 45°, SO 9, deposit, 3×3 diffuse, decay) and ants with two pheromone grids.
7. **`oscillators.ts`:** Kuramoto and pulse-coupled (Mirollo–Strogatz) fireflies.
8. **`grow.ts`:** space colonisation (Runions 2005/2007) with cached history, and L-systems that output dot sites.

### Cards

| Card | Algorithms | Desktop | Touch | Accent |
|---|---|---|---|---|
| `pond-koi` (hero) | 5–6 koi (spine chain, burst-and-glide wave, steering, containment SDF), wave-equation ripples with wakes, Sobel-angle water glyphs, curl-flow lily pads, food pellets, day/night from the hour | hover: wake + curiosity; click: ripple + pellets; fast flick: startle | tap: ripple + food + nearby startle; hold: lure | koi red |
| `pond-jelly` | 3 jellyfish: asymmetric pulse (fast 30% contraction, slow refill, thrust ∝ ċ), verlet tentacles, marine snow, slow current | cursor pushes the current; click: all pulse | tap: pulse | gonad ring |
| `pond-slime` | Physarum, 1,200 agents on a 3-cell lattice; networks form between food dots | click: add/remove food | tap: food | food dots |
| `pond-fireflies` | pulse-coupled oscillators with local coupling, sync waves, grass silhouette, night only | hover desyncs a patch | tap: burst that re-syncs | the flash |
| `pond-murmur` | topological boids (7 nearest, Ballerini 2008), 400 birds, a falcon that sets off agitation waves | the cursor is the falcon | tap: swoop | the falcon |
| `pond-terrarium` | space-colonisation plant, ant colony, sun arc by hour | click: food / sun | tap: food | the newest growth |

Budget, measured per frame on a 144² card:

| Part | Cost |
|---|---|
| ripple (36×33 tiles) | 0.05 ms |
| 6 koi, with each koi's markings baked into a lookup table | 0.4 ms |
| glyph matching | 0.3 ms |
| 400 boids | 0.3 ms |
| physarum, 1,200 agents on a 3-cell lattice | ≈0.6 ms |

All fit the 4 ms budget. **Memory rule for every track:** the gate is on total memory per card, meaning checkpoints plus the 6 working copies (head, scratch, 3 views, live), at ≤ 256 KB. There is one justified exception:
- **`pond-koi`:** ≤ 288 KB (≈280 KB). Falling back to `every 150` gives 229 KB.
- **Pond board total:** ≤ 1.4 MB.
- **The caustic pool (M2):** runs its ripple at tile resolution, so it comes to ≈125 KB.

### Optional: a full-bleed pond hero
This would be daoho's own placement: a pond behind the EXPLORE intro.
- It must load lazily after idle, pause off-screen, draw one still under reduced motion, and avoid the text boxes (its `[data-koi-avoid]` idea).
- First-load cost would be zero; it is a chunk of its own.
- **Owner decision:** whether the home page should have it, or the pond stays a board.

## 4. Track Q: squares (spaced and joined)

What already exists:
- `shape: 'square'` and the squircle exponent (n = 32 at r = 1) work for a whole card only;
- the WebGL shader already reads an exponent per instance;
- `composite()` already exposes `best` / `owner` per cell, so neighbour tests are O(1).

Gaps:
- the sampler's cover test for `sites` is circular, so square sites let card dots show through at their corners;
- goldens don't see shape.

### Engine extension (additive; defaults keep today's output)
```ts
interface JoinSpec { at?: number; conn?: 4 | 8; outer?: number; inner?: number; seam?: number }
interface DotStyle { gap?: number }                     // gutter as a fraction of pitch (squares)
interface Layer {
  join?: JoinSpec | true                                 // never across tones; the accent opts in
  shapeOf?: (value, u, v) => number | undefined          // roundness 0..1 per cell (dot ↔ square)
  rotation?: number                                      // squares snap to multiples of π/4
  lattice?: number | [kx, ky]                            // rect cells, teletext sextants
}
interface DotInstance { join?: number /* 12-bit quadrant mask */; rot?: number; aspect?: number }
```

**Join pass:**
- It runs after `composite()`, using **quarter-tile composition**. Each quadrant reads its two edge neighbours and one diagonal, so there are 8 states that reduce to 5 shapes: convex corner, horizontal edge, vertical edge, full, and inner fillet. That covers the 47 blob cases while keeping one instance per cell.
- Cells merge only when they share a tone **and** a quantized level ≥ `at`, so quantization and the one-accent rule both hold.

**Renderers:**
- SVG: `<use>` defs keyed by mask (≤ 47 per radius).
- Canvas: one `addJoinedShape` branch.
- WebGL: a per-quadrant rounded-box SDF minus a fillet disc.

### Features, ranked
1. **Joined squares:** the join pass and join-aware renderers. Polyomino, metaball-on-grid and Fluent-logo looks all come from this one pass.
2. **Per-cell shape channel** (`shapeOf`): dot ↔ square morphs, and hybrid boards where circles carry values and squares carry structure.
3. **Correct spaced squares:** a square cover rule for sites and lattices, a `{grid.gap}` (grout) token, and 1-bit / 4-shade presets (Game Boy, Playdate, cross-stitch, Perler). A square has 4/π more ink than a circle of the same `r`, so tone budgets need re-checking.
4. **Quadtree adaptive squares** (Fogleman's *Quads*: split where error × area is highest). This is one `sites` layer per level with power-of-two sizes; it needs only #3.
5. **Glyph tiles:** the same `glyphTiles.ts` as the pond, plus cross-stitch and ASCII ramps.
6. **`lcd` display skin:** a square pixel gutter, a backplane drop shadow and slow ghosting (τ ≈ 150 ms). A mosaic variant adds grout and bevels.
7. **Rect cells and sub-cell mosaics:** teletext sextants (2×3, contiguous or separated) with 2 tones per cell, line screens and solid bars.
8. **Square field pack** (`engine/algo`, lazy):
   - Chebyshev / Manhattan Voronoi;
   - Nees *Schotter* / Molnár rotations;
   - pixel sorting;
   - block glitch;
   - multi-scale Truchet (Carlson 2018).

A **Squares** board could show:
- a joined-polyomino Tetris;
- a quadtree portrait;
- a teletext page;
- an LCD Game Boy clock;
- Schotter;
- a metaball blob that joins;
- a cross-stitch sampler.

## 5. Track M: materials

What already exists:
- **Light:** `src/engine/light/` has a height raster from SDFs, normals, Lambert / Phong, torch, `sunAt` and bloom.
- **Materials:** `matte`, `gloss`, `glass` (whole-cell offsets + Fresnel), `emissive`, `metal` (a studio matcap) and `fabric` (Bayer dither).
- **Physics:** PBD cloth and soft bodies, and fluid.

Rules:
- material comes from relief (height → normal → tone band), a micro-pattern made of size steps, one light, and AO. **Never from hue**;
- keep pattern periods at 2 cells or more;
- bake static parts once, so per frame only the light and the sims move;
- materials stay neutral, and the accent marks only the live part.

### Engine additions
1. **Noise** (§2).
2. **Height and AO:** `heightFromField(field, grid)` (height without an SDF) and `ambientOcclusion(h, radius)`, both cached.
3. **`anisoSpec(n, tangent, light)`:** Kajiya-Kay style, with linear, radial and SDF-tangent presets. Covers brushed metal, spun knobs, satin and embroidery.
4. **`matcap(n, fn)`:** generalises the studio matcap and can be rotated by tilt.
5. **Light hub** (§2).
6. **Glass v2:**
   - sub-cell behind-sampling: dots stay on the grid while the sampled value moves;
   - a Snell lookup table from a squircle bezel, after kube.io's Liquid Glass build;
   - `frost()`;
   - a `caustics()` forward-splat raster.
7. **`weave(draft)`:** generators for plain `(c+r)&1`, twill `(c−r) mod n < k`, satin and herringbone, plus **`stitch(polyline)`**.

Items 1, 2 and 5 alone unlock 7 of the 10 cards below.

### Materials board, ranked
1. **Loom:** a weave draft woven live while the accent shuttle crosses, with a mini draft (threading, tie-up, treadling) shown as dots.
2. **Spun-aluminium knob:** an anisotropic bowtie highlight that follows the pointer or tilt; the value arc in the accent.
3. **Speaker-grille VU:** a perforated hex plate with backlit holes; the peak hole is the accent.
4. **Liquid Glass lens:** a squircle-bezel Snell lens dragged over a dense clock, with rim and specular highlight.
5. **Caustic pool:** tiles and grout under a ripple heightfield (the `ripple.ts` from track L) and a live caustic net; a tap drops a pebble.
6. **Carved marble plaque:** the time engraved into turbulence-sine marble, with AO, under a raking torch or the sun.
7. **Stained-glass window:** Voronoi panes with lead moats, lit by the sun; the current hour's pane is the accent.
8. **Embroidered patch:** satin-stitch sheen by thread direction, with a running-stitch border sewn by the accent needle.
9. **Terrazzo calendar:** Poisson-disk chips; today's chip is the accent.
10. **Rusting "days since" plate:** etched digits over fBm patina that spreads over time.

Also possible: knit, denim, paper with letterpress, wood grain, leather with stitching, sand you carve, ice frost (`dla`), and mercury (`fluid` + matcap).

## 6. Phases, dependencies and schedule

| Phase | What | Agent-days | Detail |
|---|---|---|---|
| **F0** | dmath + noise + Voronoi + IR pack; golden channels + style backfill + cover rule + reserved types; light hub; per-card fps; ≥ 1 kB first-load cut; determinism lint | ≈5 | F0 doc |
| **L1** | ripple, glyph tiles, chain, body, steer; `pond-koi` on `/pond/` (after the L1.0 clusters ruling) | 5–5.5 | L doc |
| **L2** | physarum / ants, fireflies, space colonisation; jelly, slime, fireflies, murmuration, terrarium | 4–5 | L doc |
| **L3** | feeding, startle, day/night, glyph-style toggle, reduced-motion stills, phone fps tier, tilt | 2.5–3 | L doc |
| **L4** | full-bleed pond hero behind EXPLORE (owner yes) | 1.5–2 | L doc |
| **Q1** | `join` + `shapeOf` + `{grid.gap}` + join-aware SVG / Canvas / WebGL with a parity probe; Squares board v1 | 4.5–5 | Q doc |
| **Q2** | `lcd` + grout skins, rect cells, teletext sextants, line screens | 3 | Q doc |
| **Q3** | field pack, rotation, nested shapes, equal-ink dot ↔ square morphs, optional squares skin | 4–5 | Q doc |
| **M1** | height + AO, anisoSpec, matcap, weave / stitch; Loom, Knob, Grille, Marble, Terrazzo | 4.5 | M doc |
| **M2** | glass v2, caustics; Lens, Pool (needs L1.2), Window, Patch, Rust (+ candle clock, needs L1.4) | 3.5–4 | M doc |
| **M3** | workshop board extras, tilt polish | 4–5 | M doc |
| **XL / XQ / XM / X1 / X2** | advanced additions (marbling, domino arctic circle, kintsugi, Particle Lenia, ageing pond, aperiodic floors, …); X2 GPU tier gated on an AGENTS.md change | ≈38 | X doc |

Serial effort is about 46 agent-days for F0, L, Q and M, plus about 38 for X.

### Dependency graph
```
F0-B key+backfill, cover, types ─→ Q1.1, Q1.4 ─→ Q1.5–1.11 ─→ Q1.12 ─→ Q2 ─→ Q3 (Q3.1 rotation ─→ XQ)
F0-A dmath, noise, voronoi, IR ─→ L1.5, L1.8, M1.9–1.10, M2.5, M2.7, Q3.2
F0-C light hub / TILT ─→ L3.6, M light keys (sunAt fallback until then), M3.10
F0-D fps + phone tier, first-load cut ─→ L1.7, M1 Loom, M2.4, M3; the cut lands before Q1.4 merges
No F0 needed: L1.2–1.4, L1.6; Q1.2–1.3; M1.1–1.5
L1.2 ripple ─→ M2.4 pool;  L1.4 chain ─→ M3 thread, M2 candle
L1 ─→ L2 ─→ L3 ─→ L4 (owner yes);  L3 ─→ X1;  M1 ─→ M2 ─→ M3 ─→ XM
Owner gates: clusters ruling before L1.3; activeDim before L1.8 / M1.6; WebGPU before X2
```

### Schedule (4–5 parallel agents, wall-clock days)
| Days | Lanes |
|---|---|
| 1–3 | F0-B (½ d) then F0-D; F0-A (2.5 d); F0-C (1 d). Early starts on new files only: `life/` (L1.0, L1.2–1.4), `squares/` (Q1.2–1.3), `matter/` (M1.1–1.5) |
| 4–7 | L1.5–1.9 (2 agents); Q1.1, Q1.4–1.11 (2 agents: sampler and renderers, then cards); M1.6–1.10 (2 agents) |
| 7–8 | Integration queue, one at a time: L1 → Q1 → M1. Each rebases, runs `ids --assign`, `pnpm golden` and the size check, then one full suite; L1 taste pass |
| 9–13 | L2 (3 agents); M2 (2 agents); Q2 (skins lane owns `display/*`, rect lane owns the sampler). Queue: L2 → M2 → Q2 |
| 14–20 | L3, Q3, M3 in parallel; L4 if approved; X1 after L3; then XL, XQ, XM; X2 last |

### Shared files: who edits them
| File | Rule |
|---|---|
| `src/engine/types.ts`, `sampler/gridSampler.ts` | F0-B first, then Q only |
| `src/widgets/types.ts`, `DotWidget.tsx`, `DotCanvas.tsx` | F0-D only |
| `DESIGN.md` | F0 owns Light (and per-card fps); M appends under Light › Materials after F0 merges; Q owns Shapes and Skins |
| `scripts/verify.ts` | one insertion point; order: noise, light, golden key, life, squares, materials |
| `scripts/webgl.ts` | F0.4, then M2.2 (Q has its own `scripts/squares-browser.ts`) |
| `src/App.tsx` | L4 only |
| Registry files (`manifest.ts`, `widgets/index.ts`, `blurbs.ts`, `meta.ts`, `ids.json`, `catalog.ts`), `goldens/hashes.json`, PROGRESS, README, CHANGELOG, `src/changelog.ts` | integration-queue commits only |

### First-load ledger (budget 150 kB gz; 148.14 used on 2026-10-27, **120.07** on 2026-10-28)
Measured rows carry the number `scripts/site/size.ts` printed (gzip -9, kB = 1024 B); the others are still estimates. **The tracks budget against the measured 120.07 kB gz** (the foundation round merged, full suite green, 2026-10-28): the planned rows below start from it.

| Change | Delta (kB gz) | Running |
|---|---|---|
| baseline (c619dae) | — | 148.14 (measured) |
| F0.5 / F0.6 square cover (`cover.ts`: `hides` incl. rotation, `coverExponent`) | +0.20 (measured) | 148.34 |
| F0.10 fps plumbing (`src/widgets/fps.ts`, `DotWidget`) | +0.02 (measured) | 148.37 (measured) |
| F0.11 cut: first-load modules import engine modules directly, not the `src/engine` barrel; `gpuIR` split out of `passes.ts` | −24.38 (measured; row was ≤ −1.0) | 123.99 (measured) |
| F0 IR registry hook (F1-A): the zero-byte fallback (the pack fills the core's existing tables at run time; only `emit.ts` gained a one-line branch) | +0.03 (measured; row was +0.05) | 124.02 |
| T4b themes wired: the unused playground store went; the widget registry and the home board left first load | −4.4 (measured) | 119.62 |
| T2 frame and rhythm | +0.29 (measured) | 119.91 |
| the rest of the round (T0, T1, T4a, F0.7–F0.8, E2, the home fix) and the rounding of the rows above, net | +0.16 (the measured remainder) | **120.07 (measured, the new baseline)** |
| Q1 hook points (+0.4 with the array-path fallback) | +0.6 | ≈120.7 |
| Q2 / Q3 | +0.3 / +0.1 | ≈121.1 |
| 4 new board manifest rows (pond, squares, materials, workshop) | ≈ +0.25 | ≈121.3 |
| M1 materials, measured against its merge-base build (dbe4716) | +0.18: the row and its group slot +0.10, the preload-map entry +0.04, `Control.map` +0.03; each board row costs ≈ +0.14, not 0.06 | ≈120.4 with T3 and the essay theming (120.18) |
| X1 | ≤ +0.5 | ≈121.8 |

**Sample worker** (`size.ts --worker`; not first load, but fetched by every page that animates a card). Since the worker split it has two numbers: the **initial load** (`sampleWorker-*.js` and its static imports: sampler, Canvas buffer renderer, manifest, card catalog) and, **per board**, what the first request of one of its cards adds (that board's `wk-*` chunk and the shared chunks it imports, fetched once per page).

| Change | Initial (kB gz) | Per board |
|---|---|---|
| c619dae | 153.55 (measured) | all boards in the one chunk |
| F0.5–F0.11 (the cover code; the cut does not touch the worker) | 153.65 (+0.10, measured) | all in |
| round 2 (materials +12, squares +9.6, the rest of the round) | 178.31 (measured, de40e71) | all in |
| **worker split** (F0 §7 R13): the worker imports the manifest instead of the eager registry and loads one board chunk per card (`loadBoard`, board from `catalog.ts`); ES worker chunks named `wk-*`; physics joins pond as a worker-build stub (all its cards are main-thread) | **17.14 (measured; −161.17)**. First load unchanged: 121.65 → 121.65 | measured: materials 20.79, squares 17.58, surfaces 16.13, type 14.78, lock 14.35, live 13.44, heartbeat 9.27, light 8.56, departures 8.42, mirror 8.21, gpu 7.65, ir 7.44, heal 7.42, algorithms 7.40, mosaic 7.19, cinema 6.94, components 6.33, levels 6.08, henry 5.68, audio 4.96, instrument 4.74, deerflow12 4.45, sim 3.88, metro 3.56, ride 2.82, scope 2.66, henry3 2.47; physics 0.07 and pond 0.05 (stubs). All 45 worker chunks: 175.64 |

A new board's row is its per-board number; it no longer grows the initial load unless the worker itself changes (`src/workers/`, the sampler, the buffer renderer, the manifest or the catalog). `size.ts --worker --check` also fails when `uJointO` (squares GL, Q1.7) or `EDGE3` (pond) shows up in any worker chunk. Cold first worker frame (worker construction → first frame reply, headless Chrome on a preview build, median of 3, base → split): henry 4111 → 1012 ms, light 1733 → 972, materials 1452 → 912, squares 751 → 783, sim 778 → 932, mosaic 1162 → 1240 (unthrottled; same within noise on a loaded 2-core box); with slow-4G throttling every board is faster (e.g. squares 2421 → 1202, sim 2170 → 970). Opening a second board later costs one board-chunk fetch before its first worker frame; the card shows its main-thread first frame meanwhile.

Gates are deltas against this ledger, not absolute numbers: `size.ts --check --against <base dist> --delta <row> [--worker --worker-delta <row>]` (or `--base <kB>` / `--worker-base <kB>` with the running totals) fails when a change grows past its row; the 150 kB cap stays as the backstop. Each merge updates the "Running" column with the measured value. Keep first-load code off the `src/engine` barrel (`export * from` every module): one value import from it makes every engine module a lazy board uses part of first load (that was the 24 kB).

## 7. Owner decisions (deduplicated; default in brackets)

**Needed before work starts:**
1. **Clusters of small dots:** do glyph-tile koi bodies break the rule? Decided from the L1.0 prototype. [If they do, fall back to lattice-4 body interiors, with glyphs only on edges and water.]
2. **`activeDim`:** is it part of the one accent? [No, until ruled; use size contrast.]
3. **First-load spend:** Q1's 0.6 kB, after the F0.11 cut. [Use the array-path fallback until the cut lands.]

**Product:**

4. **Pond placement:** board only, or also a full-bleed hero behind EXPLORE (L4)? [Board only; L4 later.]
5. **Glyph style:** dot micro-patterns or font glyphs? [Dots, with a TYPE toggle in L3.]
6. **Koi colours:** [Kohaku in accent red plus greys; no orange exception.]
7. **Fireflies accent:** [The flash.]
8. **Sound on the pond:** [Out for L1–L3; bubble sounds are an XL option, opt-in.]
9. **Pond extras:** `localStorage` memory for the ageing pond and kintsugi [opt-in]; camera on the pond [existing camera boards only]; `?day=` seed in shared links [yes].

**Squares and materials:**

10. **Squares skin on existing boards:** A (post-raster), B (sample-time) or none? [A, only if approved.]
11. **Bead / stud / stitch inner cuts:** do they count as the "shape presets" AGENTS.md forbids? [Allowed as inner cuts.]
12. **Board groups:** squares and materials [ENGINE]; the Loom [not on START HERE].
13. **Denim selvedge:** [white `value`; red only if approved.]
14. **Paper and leather accent:** [none.]
15. **Rust "days since" epoch:** [2025-10-27.]
16. **Lens without WebGL2:** [lattice 1, no frost.]

**Platform:**

17. **Tilt:** the iOS permission button goes in the TOOLS sheet [yes; cards never ask]; the physics board is the first light-hub consumer [yes].
18. **WebGPU in `src/engine`:** needs an AGENTS.md amendment. [No until amended; goldens stay CPU.]

## Sources

- **daoho.dev:** the page chunk was read directly. The code has no license, so it is used only as a reference for algorithms.
- **Creatures and behaviour:**
  - argonaut, "A simple procedural animation technique" ([animal-proc-anim](https://github.com/argonautcode/animal-proc-anim))
  - Reynolds, "Steering Behaviors for Autonomous Characters" (GDC 1999) and Boids (1987)
  - Ballerini et al., PNAS 2008 (topological neighbours)
  - [Mauthner cell / C-start](https://en.wikipedia.org/wiki/Mauthner_cell)
- **Water and glyph rendering:**
  - Hugo Elias 2D water ([explainer](https://learn.microsoft.com/de-de/archive/blogs/nikola/building-the-reallistic-water-ripples-sample-in-silverlight))
  - Acerola's ASCII shader
  - [Alex Harri, "ASCII characters are not pixels"](https://alexharri.com/blog/ascii-rendering)
- **Ecosystems:**
  - Jones 2010 Physarum ([UWE](https://uwe-repository.worktribe.com/output/980579)), Sage Jenson
  - Kuramoto; Mirollo–Strogatz 1990
  - Runions 2005/2007 space colonisation ([params](https://arxiv.org/pdf/2006.05921))
  - Prusinkiewicz & Lindenmayer, *ABOP*
- **Squares:**
  - Autotiling: [Red Blob autotile](https://www.redblobgames.com/articles/autotile/claude/), [Boris the Brave blob tilesets](https://boristhebrave.com/2013/07/14/tileset-roundup)
  - Metaballs and marching squares: [Jamie Wong](https://jamie-wong.com/2014/08/19/metaballs-and-marching-squares)
  - [Fogleman *Quads*](https://www.michaelfogleman.com/projects/quads/)
  - [Carlson multi-scale Truchet](https://archive.bridgesmathart.org/2018/bridges2018-39.html)
  - [Symbols for Legacy Computing](https://en.wikipedia.org/wiki/Symbols_for_Legacy_Computing)
  - [Playdate dithering](https://devforum.play.date/t/an-exploration-of-dithering-and-flashing/10272)
  - [L∞ Voronoi](https://cg.cs.tu-dortmund.de/publications/2022-voronoi.pdf)
- **Materials:**
  - Noise: Perlin 1985; Worley 1996; [iq Voronoi](https://www.shadertoy.com/view/ldl3W8), [Voronoise](https://iquilezles.org/articles/voronoise/)
  - Glass: [kube.io Liquid Glass](https://kube.io/blog/liquid-glass-css-svg/), [LogRocket](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/)
  - Caustics: [Evan Wallace](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c)
  - Weave and cloth: [weave generators](https://pyweaving.readthedocs.io/en/latest/_modules/pyweaving/generators/twill.html), [cloth BRDFs](https://www.shadertoy.com/view/4tfBzn)
  - [iOS motion permission](https://yal.cc/js-device-motion/)
