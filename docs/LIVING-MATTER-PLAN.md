# LIVING-MATTER-PLAN: pond, squares, materials

> Status: **planned** (2026-10-27). Research came from four agents: a teardown of daoho.dev's koi pond, plus surveys of creature and pond algorithms, square-cell design, and physical materials. Nothing here is built yet.
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
| `src/engine/noise/` | `noise2(x,y,seed)`, `fbm2(x,y,oct,seed)`, `turb2`, `curl2(x,y,t,seed)→[vx,vy]`, `voronoi2(x,y,seed,metric)→{f1,f2,id}` (metric: `l2` \| `l1` \| `linf`), `datan2(y,x)` | koi patterns, curl flow, stone, wood, rust, sand, leather, Chebyshev Voronoi |
| IR builtins for the same functions | same names in `src/engine/ir` | the same noise on the GPU path |
| Light input hub (app side, `src/site/light.ts`) | pointer torch → tilt → `sunAt`, low-passed and bucketed to 64 azimuths. One iOS `DeviceOrientationEvent.requestPermission()` button at app level. Feeds `data.light` and `data.gx/gy` | every material card, physics tilt |
| Golden key extension | append `n…` (shape), `j…` (join), `θ…` (rotation) to the hash key **only when defined** | squares can't regress silently. Today `scripts/golden.ts` hashes only x, y, r, opacity, colour |

Determinism rules:
- seed each entity with `hash32(seed, id, step)`;
- use `dsin` / `tsin` / `datan2` and never `Math.atan2` or `Math.hypot` inside a sim step;
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
| `pond-slime` | Physarum, 10k agents; networks form between food dots | click: add/remove food | tap: food | food dots |
| `pond-fireflies` | pulse-coupled oscillators with local coupling, sync waves, grass silhouette, night only | hover desyncs a patch | tap: burst that re-syncs | the flash |
| `pond-murmur` | topological boids (7 nearest, Ballerini 2008), 400 birds, a falcon that sets off agitation waves | the cursor is the falcon | tap: swoop | the falcon |
| `pond-terrarium` | space-colonisation plant, ant colony, sun arc by hour | click: food / sun | tap: food | the newest growth |

Budget, measured per frame on a 144² card:

| Part | Cost |
|---|---|
| ripple | 0.2 ms |
| 8 koi | 0.5 ms |
| glyph matching | 0.3 ms |
| 400 boids | 0.3 ms |
| physarum, 10k agents | 1.5 ms |

All fit the 4 ms budget. Checkpoint memory: under 5 KB for koi, about 200 KB for physarum (12 checkpoints).

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

## 6. Phases

| Phase | What | Size | Gate |
|---|---|---|---|
| **F0 foundation** | noise + IR builtins, `datan2`, golden key extension, square cover fix, light hub | 2–3 days | verify, goldens 177/177 unchanged, noise determinism checks |
| **L1 pond hero** | `ripple`, `glyphTiles`, `chain`, `body`, `steer`; `pond-koi` card; `/pond/` board | 4–5 days | ≤ 4 ms per frame, t = 0 golden, touch policy probe, taste pass against daoho |
| **Q1 squares core** | `shapeOf`, join pass + 3 renderers, `{grid.gap}`; Squares board v1 (polyomino, quadtree, metaball, Game Boy LCD) | 4–5 days | SVG = Canvas = WebGL join parity, goldens for the new cards |
| **M1 materials core** | height + AO, `anisoSpec`, `matcap`, `weave` / `stitch`; Loom, Knob, Grille, Marble, Terrazzo | 4 days | per-card ≤ 4 ms, one accent check |
| **L2 ecosystems** | `agents`, `oscillators`, `grow`; jelly, slime, fireflies, murmuration, terrarium | 4–5 days | checkpoint memory ≤ 256 KB per card |
| **M2 glass and water** | glass v2, caustics; Liquid Glass lens, Caustic pool, Stained glass, Embroidery, Rust | 3–4 days | WebGL fallback where density > 1 |
| **Q2 squares extra** | `lcd` skin, rect cells / teletext, the square field pack | 3 days | skin fidelity snapshot |

F0 comes first; after it, L1, Q1 and M1 can run as parallel agents, since their files don't overlap.

## 7. Open decisions (owner)

1. **Pond placement:** a board only, or also a full-bleed hero behind the home intro (lazy)?
2. **Glyph style:** dot micro-pattern glyphs (k = 3–4, the most "dot-matrix"), font glyphs in larger tiles (closest to daoho), or both as a toggle?
3. **Koi colours:** kohaku in accent red plus greys is faithful to the rules. A board-level exception for orange-and-white koi would break "one accent", so the default is no.
4. **Tilt lighting on iOS:** it needs a permission tap. Should it be a TOOLS-sheet button, or the first tap on a material card?
5. **Squares rollout:** should joined squares be allowed on existing boards (e.g. as a DISPLAY skin), or only on new cards?

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
