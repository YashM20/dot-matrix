# DOT-MATRIX-ENGINE-PLAN — Architecture Reference

> Routing doc. The original build plan is `public/docs/PRD.md` §1–13; token/component decisions live in `DESIGN.md`. Where this file and the code disagree, fix this file.

## Module Map
```
src/engine/                       framework-free TypeScript + Canvas/SVG APIs only
  types.ts                        Field (+ optional cell bounds), GridConfig, DotStyle, ThemeTokens, DotInstance, Layer (tone or per-cell `toneOf` multi-tone, lattice, origin, sites), Tone
  theme/tokens.ts                 dot480, deerflowMosaic presets
  sampler/gridSampler.ts          sampleField, sampleLayers (card grid + coarser lattices + dot sites), sampleLayersInto (→ DotBuffer), latticeGrid, colorFor, toneColor, cellU
  buffer/dotBuffer.ts             DotBuffer (struct of arrays, one ArrayBuffer), TONE/paletteOf/toneIndex, pushDot, reserve, toDots adapter, pool
  sampler/quantize.ts, jitter.ts
  renderer/shapePath.ts           circle / square / squircle paths, squircleExponent, bezierHandle
  renderer/svgRenderer.ts, canvasRenderer.ts, canvasBuffer.ts (renderCanvasBuffer: draws a DotBuffer)
  layout.ts                       cell-space placement with bounds: textAt, placeCells, ringCells, barsAt, spriteAt, polylineCells, combine …
  fields/bitmapFont.ts            5×7 glyph set, Scale2x display weight (`smooth`), textField, textWidth, glyphMetrics
  fields/cjkFallback.ts           system-font SDF fallback for glyphs outside the set (no network)
  fields/svgPath.ts               pure-TS SVG path flatten + stroke/fill rasterizer (headless, deterministic)
  fields/iconSDF.ts               iconPaths (stroked outlines), rasterizeToMask, distanceTransform, cachedIconField
  fields/polarField.ts            ringField, sunburstField, concentricRingsField, dialField
  fields/haltoneField.ts          imageToLuminanceField, bayerDither (per-dot), floydSteinbergDither, boxBlurField
  fields/waveformField.ts         amplitudeField (bottom/center baseline, gap), traceField, speech/ecg/sine amplitudes
  fields/splineField.ts, heatmapField.ts, scatterField.ts, projection3D.ts, warpedField.ts
  migrate/                        hilbertIndex/hilbertOrder, migrate (Hilbert-rank dot pairing), migrationLayers, morph/morphSDF/signedDistance (SDF morph, EDT cache)
  (tests live in scripts/verify.ts — `pnpm verify`)
src/widgets/
  types.ts                        WidgetPreset { grid, style, chrome?, label?, bleed?, defaults?, layers(ctx) }, TILE/CARD grids, tileStyle, layoutFor() (big, dotRing, dotLine, dotDisc, dotBars, dots, lattice …), cardChrome/withChrome
  sprites.ts                      1-bit pixel art (invaders, bear, deer, pill …)
  boards/<board>.ts               one file per reference board, one export per card
  index.ts                        boards[], widgetPresets, widgetById
src/components/                   DotCanvas, DotWidget, Board, playground/*, draw/*
src/workers/                      protocol.ts (handleSample), sampleWorker.ts (module worker), client.ts (remoteSampler, workerPresetId)
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

## Migration and SDF morph
Shared-element transitions (`src/engine/migrate/`; MASTER-PLAN §3.5, P4).
- **`migrate(from, to, opts)`** pairs two `DotInstance[]` sets by rank along one Hilbert curve (`hilbertIndex`, order 12 over the square bounds of both sets; ties break by position, so the pairing ignores input order). Unequal counts: `spares: 'split'` (default) splits / merges the smaller set's dots so every drawn dot travels; `'fade'` rank-matches min(n) pairs and shrinks the rest in place (r, opacity → 0). `stagger` spreads the starts along the curve (a sweep), `arc` bows each path into a quadratic, `ease` shapes each dot's own progress. Returns `count`, `fromIndex` / `toIndex` and `frame(p)` (packed `[x, y, r, opacity, mix]`), `dots(p)` (colour mixed per dot), `colorAt`. p = 0 / 1 reproduce the two sets exactly. Units are the caller's: pixels from the sampler, or card cells (r = site size, opacity = value, color = tone name).
- **`migrationLayers(m, p)`** turns a frame in card cells into site layers grouped by tone, snapped size and value (tone switches at half way): migration is always drawn as site layers, never splatted to card pitch.
- **`morph(a, b, k)`** blends the signed distance rasters of two masks (`Raster` or `Field` + grid) and returns a coverage raster with tight bounds; `signedDistance` caches the EDT (`distanceRaster`) per shape identity, so a frame is one lerp. `morphSDF` returns the blended distance itself.
- **App:** `DotCanvas` `migrate={ key, to, delay?, duration?, options? }` flies the frame on screen into `to` (target card dots in this canvas's pixel space) and holds; clearing it flies back. Reduced motion: instant. `glyph-longpress` uses the engine pairing: the open lock migrates into a now-playing glyph, release flies it back.
- **Gates (verify):** 3000 → 2600 dots, setup ≤ 8 ms, frame ≤ 4 ms (median, printed); deterministic, input-order independent, identity on A → A, counts conserved / faded, morph ends exact.
## Live data
Real sources bound to cards (`src/data/`, app-level, not engine; MASTER-PLAN P4). Cards never fetch: they draw from `ctx.data` like every other card.
- **Source:** `createSource({ id, transports, map, fixture, statusKey, textKeys?, staleMs? })`. `map(payload, now)` is pure and returns numeric data keys (namespaced per source: `wx*`, `np*`, `gh*`). Strings travel as `textId(s)` (a stable FNV-1a id; the card reads `textOf(data.key)`), so text changes are number changes too. Status `live` / `cached` / `offline` is written to `data[statusKey]` (2 / 1 / 0).
- **Transports:** `poll(request, intervalMs)` (exponential backoff with jitter on failure, Retry-After / X-RateLimit-Reset honoured), `broadcast(name)` (webhook-style push over `BroadcastChannel('dot480:<name>')`; `Source.push(payload)` is the in-page entry; in the app also `window.dot480Live[id](payload)`), `websocket(url)` (one JSON payload per message, reconnect on backoff), `mediaSession()` (this page's own media only). All pause while the tab is hidden; the last unsubscribe closes everything.
- **Fallbacks:** start from the last good value in localStorage (`dot480:live:<id>`, status `cached`), else from the deterministic `fixture` (`offline`). A failure keeps the last good value on screen. `Source.fixture` (fixture + status key) is the cards' `defaults`, so snapshots, goldens and tests never touch the network.
- **Binding a board:** `{ id, items, sources: [weatherSource(...), ...] }` in `src/widgets/index.ts`. `Board.tsx` subscribes while the board is mounted (`useLiveData`) and passes each card only the keys its `defaults` declare. Numbers listed in `springKeys` glide; everything else (text, icons, status) goes through the change dissolve.
- **The three sources** (`src/data/sources.ts`): weather from Open-Meteo (no key; current + 12 hourly temperatures + daily high/low), GitHub contributions (a public contributions proxy for the full year, falling back to the public events API's 90 days; 60 requests/h unauthenticated, so it polls every 30 min), now playing (browsers can't read other apps' playback: feed it via `BroadcastChannel('dot480:now-playing').postMessage({ title, artist, album, position, duration, playing })`, `window.dot480Live['now-playing'](…)`, or `?np=ws://…` for a local bridge that relays a player such as MPRIS or Spotify's API). Board config: `?board=live&lat=…&lon=…&place=…&gh=<user>&np=<ws url>`.
- **Privacy:** no tokens or credentials are requested, sent or stored. Requests carry only the configured coordinates or user name. The cache holds the mapped numbers and their strings, nothing else.
- **Tests:** `scripts/live.ts` (also run by `pnpm verify`) uses a fake env (manual clock, fake fetch / storage / socket): fixture determinism, backoff, retry timing, caching and restart, hidden-tab pause, rate-limit waits, push and websocket.
## Halftone ladder
Luma `Raster` → quantized dot levels (`src/engine/halftone/`; MASTER-PLAN §8 Track L, P4 live media). `halftone(r, { step, levels, mode, frame })` is pure: step 1 thresholds `v·(L-1)` against the STBN mask; step 2 first runs a self-guided filter (radius 2, from two summed-area tables), stretches flat neighbourhoods about their ±6 mean (local contrast) and scales the dither amplitude down on gradients so edges snap to the nearest level. `stbn(x, y, k)` = fract(blue[x, y] + k·φ) over a 64² void-and-cluster rank table generated on first use (no asset). `halftoneStream` keeps per-cell level, anchor and slice: a cell takes the current frame's slice only when its prepared input moved > `reroll` (.08), and changes level only past `hysteresis` (.35 level) beyond the boundary, so a static noisy scene is stable and moving regions get fresh thresholds. Host capture is app-level (`src/media/`), passed as `ctx.media.camera`. Tests: `scripts/halftone.ts` (run by verify: mask, determinism, tone, noise robustness, flicker table, motion tracking, live frame timing).

## DotBuffer and worker sampling (P5-B)
- **DotBuffer** (`src/engine/buffer/`): `x, y, r, opacity: Float32Array; tone: Uint8Array; n` as views into one `ArrayBuffer` (17 bytes per dot), so a frame moves in one transfer. `tone` is a `TONE` index (faint, mid, idle, value, activeDim, active) into `palette` (from the theme, same fallbacks as `toneColor`); shape and roundness are per frame. `reserve` grows by doubling, `acquireDotBuffer`/`releaseDotBuffer` pool retired stores.
- **Sampler:** `sampleLayers` and `sampleLayersInto(layers, grid, style, theme, buf?)` share one pass; `emit` writes either an object or five array slots (one sink shape, a branch rather than a virtual call). Same dots, same order. `toDots(buf)` is the `DotInstance[]` adapter for SVG, export and motion. Goldens hash the float64 `sampleLayers` path, so they are unchanged; float32 storage moves values by ≤ 1.5e-5 px, which flips a `toFixed` tie in some frames, so do not hash `toDots` output against `goldens/hashes.json`.
- **Canvas from a buffer:** `renderCanvasBuffer(ctx, buf)` batches by (tone, opacity step of 1/1000) with an integer key per dot. It makes the same fills and sub-paths as `renderCanvas` (verified on every preset); the worst quantized UI card has 12 fills. Sub-paths stay open (`fill` closes them): in Chrome, `closePath` was the largest self-time item of path building.
- **Worker** (`src/workers/`): one module worker per page (`new Worker(new URL('./sampleWorker.ts', import.meta.url), { type: 'module' })`) imports the preset registry. `DotCanvas` live frames ask `remoteSampler(layers, …)`: the request names the preset id (`workerPresetId`: registered `withChrome(p)` functions only, no `media` cards), `t`, frame, data (springs already applied), grid, style primitives and theme. The worker samples into the store it was handed and also rasterizes on an `OffscreenCanvas` with `renderCanvasBuffer`. It transfers back the buffer and an `ImageBitmap`. Double buffering: the main thread keeps the frame on screen and hands the previous one back with the next request. At most one request per card is in flight, and the newest pending one wins. The main thread blits the bitmap, or draws the buffer if the backing size changed meanwhile.
- **Main-thread fallback** (it still samples into a reused `DotBuffer`): the first frame of a subscription (drawn before paint), while a transient runs (enter, change, exit, migrate, spring, burst need `DotInstance[]`), while a control is engaged (hover, press, focus, pointers: input answers without a round trip), for media and unregistered layers, without `Worker`, after a worker error, and with `?worker=0`. Transferables only: no SharedArrayBuffer, so embeds and MCP Apps need no COOP/COEP.
- **Measure:** `npx tsx scripts/browser-perf.ts --boards mosaic,cinema [--runs 3] [--top 8]` (headless Chrome over CDP, dev server on :5196). It compares main-thread sampling and drawing at mount and per 12 fps tick, worker on vs `?worker=0`. Checks: `scripts/buffer.ts` (in verify).

## Tokens
See `DESIGN.md`; runtime values in `src/engine/theme/tokens.ts`.
