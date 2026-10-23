# DOT-MATRIX-ENGINE-PLAN — Architecture Reference

> Routing doc. The original build plan is `public/docs/PRD.md` §1–13; token/component decisions live in `DESIGN.md`. Where this file and the code disagree, fix this file.

## Module Map
```
src/engine/                       framework-free TypeScript + Canvas/SVG APIs only
  types.ts                        Field (+ optional cell bounds), GridConfig, DotStyle, ThemeTokens, DotInstance, Layer (tone or per-cell `toneOf` multi-tone, lattice, origin, sites), Tone
  theme/tokens.ts                 dot480, deerflowMosaic presets
  sampler/gridSampler.ts          sampleField, sampleLayers (card grid + coarser lattices + dot sites), latticeGrid, colorFor, toneColor, cellU
  sampler/quantize.ts, jitter.ts
  renderer/shapePath.ts           circle / square / squircle paths, squircleExponent, bezierHandle
  renderer/svgRenderer.ts, canvasRenderer.ts
  layout.ts                       cell-space placement with bounds: textAt, placeCells, ringCells, barsAt, spriteAt, polylineCells, combine …
  fields/bitmapFont.ts            5×7 glyph set, Scale2x display weight (`smooth`), textField, textWidth, glyphMetrics
  fields/cjkFallback.ts           system-font SDF fallback for glyphs outside the set (no network)
  fields/svgPath.ts               pure-TS SVG path flatten + stroke/fill rasterizer (headless, deterministic)
  fields/iconSDF.ts               iconPaths (stroked outlines), rasterizeToMask, distanceTransform, cachedIconField
  fields/polarField.ts            ringField, sunburstField, concentricRingsField, dialField
  fields/haltoneField.ts          imageToLuminanceField, bayerDither (per-dot), floydSteinbergDither, boxBlurField
  fields/waveformField.ts         amplitudeField (bottom/center baseline, gap), traceField, speech/ecg/sine amplitudes
  fields/splineField.ts, heatmapField.ts, scatterField.ts, projection3D.ts, warpedField.ts
  (tests live in scripts/verify.ts — `pnpm verify`)
src/widgets/
  types.ts                        WidgetPreset { grid, style, chrome?, label?, bleed?, defaults?, layers(ctx) }, TILE/CARD grids, tileStyle, layoutFor() (big, dotRing, dotLine, dotDisc, dotBars, dots, lattice …), cardChrome/withChrome
  sprites.ts                      1-bit pixel art (invaders, bear, deer, pill …)
  boards/<board>.ts               one file per reference board, one export per card
  index.ts                        boards[], widgetPresets, widgetById
src/components/                   DotCanvas, DotWidget, Board, playground/*, draw/*
src/lib/photoDotify.ts            client-only upload → dither
scripts/snap.ts                   headless card/board PNG snapshots — `pnpm snap <id…> | --board <id> | --all`
```

## Pipeline
Every visual = `Layer[]` (each a `Field(u,v) → [0,1]` plus a colour `Tone`, or a per-cell `toneOf(value, u, v)` read in the same sampler pass for one field drawn in several tones) → `sampleLayers(grid, style, theme)` → `DotInstance[]` → SVG | Canvas.
Per cell the layer with the highest value wins and decides the colour; later layers win ties. `tone: 'active'` is the single accent — one element per card.

### Cell-space layout
Widgets place text, rings, bars and sprites by integer dot coordinates (`src/engine/layout.ts`). `textAt(grid, str, col, row, { scale })` makes every font pixel land on exactly `scale` whole dots — that is what keeps glyphs crisp. Fractional `place()` still exists for photos and procedural fields.

### Lattices and dot sites
The references mix dot pitches inside one card, so a layer can opt out of the card grid:
- `lattice: k, origin: [col,row]` — sampled on its own k×-coarser grid starting at that card cell; dots are k× bigger. Hero text (`T.big`) and stepped charts use this.
- `sites: [x,y][]` — sampled at explicit points (card cells, fractional) with `lattice` as the dot-size multiplier. Rings, arcs, rays, sliders and waveform bars use this so dots are evenly spaced along the curve. Coincident sites merge (highest value, later layer on ties).
Lattices are sampled first (largest k first), then sites, then the card grid; card cells under a lit lattice/site dot stay empty.

### Bounds
Cell-space helpers attach `field.bounds` (the cells that can be non-zero); `sampleLayers` only visits those, and skips empty cells unless `opacityMode: 'constant'` draws every dot. A 144² card with ~25 layers samples in ~4 ms.

### Standard card
`TILE = 144×144` dots at 2.25px, label row drawn in dots (`chrome: 'dots'`), `tileStyle` radii (~85% of the pitch). Tiers: label 5×7 on the card grid, body lattice 1.25–1.3, values 1.6–2, heroes 2.5–3 `smooth`, posters 3.5–4 `smooth` (see `DESIGN.md` › Typography). Legacy `CARD = 80×74` @ 4px with a CSS header still renders.

## Generator Families
- Text: 5×7 bitmap (`bitmapFont.ts`, ~70 glyphs incl. `+ , ' ? ! $ → ● ✓ ♥`), `smooth` = Scale2x 10×14 display weight, CJK via system-font SDF.
- Polar: `ringField` (angle wrap safe for any `thetaStart`), `sunburstField`, `concentricRingsField`, `dialField`; cell-space `ringCells` with `every` for dotted rings.
- Icon: SVG path → pure-TS stroke/fill rasterizer (`svgPath.ts`) → distance transform → `iconField`. Reference boards draw icons as dotted outlines. Works in Node, so `pnpm snap`/`pnpm verify` see real icons.
- Halftone: Rec.709 luminance, gamma 1.4, bright = big dot (not inverted), box-blur + Bayer indexed per dot, or Floyd–Steinberg on the resampled raster.
- Waveform: `amplitudeField` bars anchored at the bottom (`v=1`) or mirrored about the centre; `traceField` thin lines.
- Spline: Catmull-Rom; Heatmap: `gridField`; Scatter: Bridson Poisson-disc + mulberry32.
- 3D: `perspectiveProjection` with `focal/(focal+max(0,z))` (never div0) + `corridorField`.
- Warp: domain warps, `spiralField` as a true Archimedean spiral (no seam at θ=0).

## Dot shape
Squircle = superellipse `|x/r|^n + |y/r|^n = 1`. `cornerRoundness` r∈[0,1] → `n = 2 + 30r²` (0 → circle, ≈0.26 → n=4, 1 → n=32 ≈ square). n ≤ 8 is drawn with four cubic béziers fitted at the exact 45° point; above that a rounded square whose corner radius shrinks with n. Both renderers use the same math (`shapePath.ts`, `canvasRenderer.ts`).

## Renderer Rule
`renderer = animated || visibleDots > 2000 ? 'canvas' : 'svg'`. Canvas scales by `devicePixelRatio`. Animated presets re-sample at 12 fps with a running `t` passed to `layers({ t, data })`.

## Field IR (`dot` v0)
A tiny pure language for fields (`src/engine/ir/`, exported as `ir`; MASTER-PLAN §3.12). `parse(src)` → JSON AST → `compileJS(ast)(env)` → `Field` (closure tree by default, CSP-safe; `mode: 'function'` uses `new Function` and falls back by itself), `emitGLSL(ast)` → `float field(vec2 uv, float t, vec3 pointer, float data_<key>…)` (GLSL ES 3.0, data params in sorted key order, raw unclamped value), `serialize` / `deserialize` (validated, never evaluated). `irProgram(src)` memoises parse + compile; `contextEnv(ctx, grid, rect)` maps a frame context in. Example board: `src/widgets/boards/ir.ts`.
```
program := ('let' NAME '=' expr ';')* expr               // also inside ( … ) and { … }
expr    := cmp ('?' expr ':' expr)?                       // true = non-zero
cmp     := add (< <= > >= == != add)?                     // 1 or 0, no chaining
add     := mul ((+ | -) mul)*      mul := unary ((* | / | %) unary)*
unary   := - unary | + unary | atom ('^' unary)?          // -x^2 = -(x^2); 2^3^2 = 2^9
atom    := NUMBER | u | v | t | PI | TAU | pointer.x | pointer.y | pointer.down | data.NAME | NAME
         | FN '(' expr, … ')' | '(' program ')'
         | 'for' NAME 'in' INT '..' INT 'with' NAME '=' expr '{' program '}'   // acc = init; acc = body per i
FN      := sin cos abs floor fract sqrt exp sign (1) · min max step atan(y,x) length(x,y) hash(a,b) (2)
         · clamp mix smoothstep sdCircle(x,y,r) (3) · sdBox(x,y,hw,hh) sdRing(x,y,r,w) (4)
```
- Everything is a float. `%` is GLSL `mod` (floored); `a ^ b` is `pow(|a|, b)`, except integer literal exponents 0–8, which expand to multiplications (sign kept). `clamp`/`min`/`max`/`step`/`smoothstep` follow the GLSL formulas. `hash` = murmur3 of the 1/256 fixed-point inputs, top 24 bits (exact in float32).
- Inputs: u/v as the sampler sees them (v down); `pointer` in u/v, (-1, -1, 0) when absent; missing `data` keys read 0.
- Limits: 4096 source chars, 2000 nodes, nesting 96, loop range = integer literals with ≤ 64 iterations, nested loops ≤ 1024 body runs per dot. Unknown identifiers or functions, wrong arity and reserved names fail with `IRError` at line:col (or a JSON path on deserialize).
- Tests: `scripts/ir.ts` (also run by `pnpm verify`) checks both JS backends against a GLSL-spec reference interpreter (`reference.ts`) on 20 fields over 48×48 and snapshots the GLSL hashes in `goldens/ir-glsl.json` (`npx tsx scripts/ir.ts --update` after an intended codegen change). Real GPU readback parity is pending P5.

## SimField
Stateful simulations as Fields (`src/engine/sim/`; MASTER-PLAN §3.7). `createSim(spec)` steps a Float32Array grid (`channels` interleaved) at a fixed `dt`; `simAt(sim, t)` = the grid at step `simStep(sim, t)`, a pure function of (seed, step), in any call order.
- **Loop:** `lead` + `period` (seconds) fold any t (negative, 3600 s, wall clock) into steps [lead/dt, (lead+period)/dt): the sim resets each period and a cold call never replays more than lead + period. Cards always set a loop; `simPhase(sim, t)` is the 0..1 position for rails and fades.
- **Checkpoints:** every `every` steps, an LRU of `maxCheckpoints` (default 64; step 0 and the loop start pinned). A back-jump restores the nearest checkpoint ≤ n; forward playback continues from the head (0–1 steps per frame).
- **Budget:** one call takes at most `maxSteps` (default 4096); an unlooped far jump then catches up over later calls (`sim.lag` > 0 until exact). `simReset` drops the cache for cold benches.
- **Memory:** the stepper ping-pongs head/scratch (Gray–Scott sub-steps reuse src), neighbour index tables are built once, `simView`/`simField`/`simMapField` read a ring of 3 reused snapshots, so steady state allocates only new checkpoints.
- **Models:** `grayScott` (explicit Euler, unit sub-step, 5-point Laplacian, `edge: 'wrap'` torus or `'clamp'` zero-flux, per-cell `killAt`, V flushed to 0 below 1e-9 (guards against float32 denormals)), `fallingSand` (0 empty, 2 wall, any other value a grain that keeps its kind; one move per grain per step, only into empty cells, so mass is conserved; sources are `emitters`, custom scenes via `init`), `life` (B3/S23, `edge: 'wrap'` torus default or `'dead'` bounded, `soup` rect, `stamps` via `lifeStamp`, optional `afterglow` trail channel).
- **Tests:** `scripts/verify.ts` (end): determinism across fresh instances, replay and LRU restore; loop folding at 3600 s and wall clock; the step budget; sand mass conservation; Life oscillator/glider/edge cases; Gray–Scott fixed point and mirror symmetry; buffer reuse; cold board mount at t = 1, 60, 3600 s. `pnpm bench` prints the same cold-start table.

## Halftone ladder
Luma `Raster` → quantized dot levels (`src/engine/halftone/`; MASTER-PLAN §8 Track L, P4 live media). `halftone(r, { step, levels, mode, frame })` is pure: step 1 thresholds `v·(L-1)` against the STBN mask; step 2 first runs a self-guided filter (radius 2, from two summed-area tables), stretches flat neighbourhoods about their ±6 mean (local contrast) and scales the dither amplitude down on gradients so edges snap to the nearest level. `stbn(x, y, k)` = fract(blue[x, y] + k·φ) over a 64² void-and-cluster rank table generated on first use (no asset). `halftoneStream` keeps per-cell level, anchor and slice: a cell takes the current frame's slice only when its prepared input moved > `reroll` (.08), and changes level only past `hysteresis` (.35 level) beyond the boundary, so a static noisy scene is stable and moving regions get fresh thresholds. Host capture is app-level (`src/media/`), passed as `ctx.media.camera`. Tests: `scripts/halftone.ts` (run by verify: mask, determinism, tone, noise robustness, flicker table, motion tracking, live frame timing).

## Tokens
See `DESIGN.md`; runtime values in `src/engine/theme/tokens.ts`.
