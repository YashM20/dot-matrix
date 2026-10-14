# MASTER PLAN — Dot/480 from widget kit to dot-native interface engine

> Draft v1 · 2026-10-14 · branch `feat/tile-boards`.
> Inputs: `ADVANCED-PLAN.md` (audit, perf, product), `MOTION-INTERACTION-DEPTH.md` (motion, interaction, depth research), the code (engine 5.2k LOC), and user feedback. Quality bar: **level-03, afterlight, the mosaic board, the components board.**
> Invariants (AGENTS.md) hold throughout:
> - Field → Sampler → Renderer.
> - One accent per board.
> - Quantized UI dots.
> - Squircle exponent.
> - Framework-free `src/engine`, no deps.

---

## 0. North star

**Dot/480 becomes the reference engine for dot-matrix interfaces.** Anything you can design for a screen, you can make *alive in dots*:
- it moves with intent;
- it responds to touch in under one frame;
- it has light and depth;
- it renders to any dot surface (web, phone Glyph, e-ink, LED wall, paper);
- a human or an agent can author it, at Nothing/Teenage Engineering fidelity.

Three properties nobody else has together:
1. **Field-native.** Every pixel decision is a pure function, so motion, interaction and depth are composable math, not keyframes.
2. **Resolution-free.** The same card spec resamples to 25×25, 144×144 or 800×480.
3. **Fidelity-gated.** Every card passes a measurable fidelity loop before it ships (§2). This is what keeps "sky is the limit" from turning into "sloppy".

## 1. Where we are (baseline)
| Area | State |
|---|---|
| Cards | 71 presets on 8 boards, TILE 144×144; 11 animated (looping idles only) |
| Engine | `Field(u,v)`; `Layer{field, tone, lattice, origin, sites}`; max-composite; per-lattice cover; quantize; squircle; SVG + canvas renderers |
| Time | One rAF per card at 12 fps via React `setT`; clock resets on resume; no easing, transitions or load-in |
| Interaction | None in fields; no hit-testing; canvases `aria-hidden` |
| Depth | Faked inside individual fields (level-03 ray-plane, henry3 painter-mix, mosaic bevels) |
| Perf | Frames fine (≤9.4 ms); mount slow (mosaic 103 ms); SVG 1.3–2.9 MB per board; jitter allocs |
| Debt | H1–H4, M1–M10 in ADVANCED-PLAN |

## 2. The fidelity system (the refinement engine, built first)
"High fidelity" has to be measurable or it drifts. This system is the ratchet every later phase runs through.

### 2.1 Fidelity rubric (score each card 0–3 per criterion, max 36)
1. **Dot integrity:** every glyph and edge lands on dot centres; no half-dots or fractional placement artefacts.
2. **Tonal range:** uses the full value range with intent (deep shadows, mids, highlights), not just on/off.
3. **Lattice tiering:** one lattice per element size (hero, body, caption); no clusters standing in for big dots.
4. **Edge quality:** soft 1-cell ramps where shapes are organic, hard where they're UI.
5. **Accent discipline:** one accent element, used for the single most important thing.
6. **Density balance:** negative space; no area denser than the hero.
7. **Hierarchy:** read order in under 1 s (squint test on the snap PNG).
8. **Reference match:** against the source reference or the liked-card standard.
9. **Motion legibility:** ≤1–2 cells per frame at 12 fps, ≥300 ms tweens, nothing that teleports.
10. **Interaction response:** feedback on the next frame; visible affordance; keyboard parity.
11. **Depth read:** front and back separable at a glance (moat, atmos, light).
12. **Perf:** within the budget for its renderer.

Gates:
- **Ship** at ≥ 28/36 with no criterion at 0.
- **Hero cards** need ≥ 32.

### 2.2 Instruments (scripts/, outside the engine)
- `pnpm snap` (exists), extended as below.
- `snap --film <id> --t 0:2:0.1`: a filmstrip contact sheet and an APNG/GIF of a time range, so motion is reviewable as an image.
- `snap --replay <id> --path pointer.json`: a scripted pointer path (hover sweep, press, drag) rendered to a filmstrip, so interaction is reviewable.
- `snap --diff`: pixelmatch/SSIM against the golden PNG plus a heatmap; golden hashes of the quantized dot list for CI.
- `snap --ref <id> <crop.png>`: side by side against the reference crop (we already do this ad hoc with PIL), plus an SSIM score.
- `fidelity <id>`: computes the automatable criteria:
  - dot integrity: % of dots off-centre;
  - tonal histogram spread;
  - accent count;
  - density map and max-density region versus hero bbox;
  - motion speed in cells per frame, from consecutive frames' dot diff;
  - perf.
  It emits a scorecard. The other criteria are scored by an agent or human from the snap.
- `bench` (exists in `.snapshots/bench`): promote it to `scripts/bench.ts` with budgets.

### 2.3 Refinement protocol (every card, every phase)
- **v1 Build:** get the structure right (layout, lattice tiers, data).
- **v2 Tone:** do the luminance pass (shadows, mids, highlights, soft edges); compare against the liked-card standard.
- **v3 Life:** add motion, interaction and depth passes, with filmstrips and replays.
- **v4 Polish:**
  - an adversarial critique by a fresh agent that sees only the PNGs, the filmstrip and the rubric, and must list at least 5 defects;
  - fix them;
  - re-score.

Stop when the score is ≥ the gate **and** the last critique found only cosmetic defects. A card is never "done" after one pass.

## 3. Architecture evolution (Engine 2.0)
All of this is plain TypeScript in `src/engine`. `Field(u,v)` stays; everything new is data plus pure functions around it.

### 3.1 Context and time
```ts
// engine/context.ts
export interface Pointer { x: number; y: number; inside: boolean; down: boolean; tDown: number; tUp: number; vx: number; vy: number; pressure: number }
export interface FrameContext<D = Record<string, number>> {
  t: number            // board clock seconds (deterministic: frame / fps in snap)
  dt: number
  frame: number
  grid: GridConfig     // fixes H2: presets read grid from ctx, not TILE
  data: D
  pointer?: Pointer    // cell space
  focus?: string       // focused layer id
  phase?: { name: 'enter' | 'live' | 'exit' | 'change'; p: number; from?: unknown }
  reducedMotion: boolean
  seed: number
}
export type LayerSource<D> = (ctx: FrameContext<D>) => Layer[]
```
- `WidgetContext` becomes an alias. The widget types move onto the engine type (fixes H3).
- **Board clock** (`engine/clock.ts`, framework-free):
  - one scheduler per board with fixed-step `t = frame/fps`, pausable, scrub-able, and resuming without resetting to 0;
  - per-card fps tiers: 12 for ambient, 30 for transitions and interaction, 60 optional for the hero;
  - frame-budget aware: if a frame overruns, it degrades the farthest-off-screen cards first.
- **Imperative render loop:** React mounts the canvas once. The clock calls `sample → render` directly, with no `setState` per frame. This is required for the 11 ms drag threshold.

### 3.2 Layer 2.0
```ts
export interface Layer {
  field: Field; tone?: Tone; lattice?: number; origin?: [number, number]; sites?: [number, number][]
  id?: string                       // hit-testing, focus, transitions, a11y
  role?: 'button' | 'slider' | 'switch' | 'tab' | 'img' | 'text' | 'decor'
  hit?: { sdf: (c: number, r: number) => number; pad?: number }   // cell-space hit shape
  z?: number                        // 0 front … 1 far: atmos, defocus, parallax
  blend?: 'max' | 'over' | 'multiply' | 'knockout' | 'mask'
  moat?: number                     // knock out lower layers within n cells of this layer's lit area
  motion?: { enter?: Reveal; exit?: Reveal; key?: string }       // per-layer choreography
}
```
- `composite()` gets an `owner: Int16Array` (layer index per cell), so `pick(col, row) → id`.
- `blend` is applied on value before quantization.
- `moat` uses a dilation pass (separable max filter, O(n)).

### 3.3 Field algebra (`engine/fx/`)
Pure combinators, each preserving `bounds` where it can:
- **Warps:** `shift(f, dx, dy)`, `scale`, `rotate`, `warp(f, (u,v) => [u', v'])`, `fisheye(f, focus, r, d)`, `refract(f, heightField, k)`.
- **Masks:** `mask(f, m)`, `knockout(f, m)`, `dilate(f, cells)`, `erode`, `outline(f, w)`.
- **Light:** `heightOf(sdf, profile)`, `normalOf(h)`, `lambert(h, L)`, `phong(h, L, ks, α)`, `ao(sdf)`, `shadow(sdfScene, L, offset)`, `fog(depth, near, far)`.
- **Tone:** `toneRamp(f, stops)` (the mosaic technique), `dither(f, mask)`, `lumaSites(map, px, py)` (the afterlight technique), `halftone(img, {area: true, linear: true, mask: 'blue'})` (ADVANCED-PLAN §4 fix: √v radius, constant opacity).
- **Scene:** `scene3d({ planes, sdfs, camera, fog })` → depth plus a luminance field (generalizes level-03), and `iso(sites, zbuffer)`.

### 3.4 Motion (`engine/motion/`)
- **Masks:**
  - `bayer(k)`, `blueNoise` (64² baked table, generated offline and checked in as a Uint8Array literal), `ign`;
  - `radial(c)`, `linear(angle)`, `angular(c)`, `curtain`, `hilbert`;
  - `ditherEdge(geom, noise, k)`.
- **Ops:**
  - `reveal(f, mask, p, edge?)`, `transition(a, b, mask, p, edge?)`;
  - `coarsen(a, b, p)` (lattice morph), `morph(sdfA, sdfB, p)`;
  - `afterglow(fAt: (t) => Field, t, taps, τ)`.
- **Time:**
  - `ease` tokens (M3 emphasized, decelerate, accelerate);
  - `spring.critical(x0, v0, goal, halflife, τ)` and `spring.under(...)`, closed form;
  - `stagger(index | cell, pattern, total)`.
- **Text:** `decode(str, prev, τ, opts)`, `splitFlap`, `typewriter`, all on `textAt` (dot-aligned).
- **Choreography:** `timeline([{ at, layerId, enter: Reveal }...])` resolves `ctx.phase` per layer.
- **SimField:** `simField(N, step, read)`, a stateful buffer stepped by the clock (ripple, trails, sand, fluid). Deterministic given the input log, so replays work.

### 3.5 Sampler and renderers
- **Sampler:**
  - typed arrays (`Uint8Array` tone index, reused buffers);
  - a jitter fast path (ADVANCED-PLAN perf 1);
  - area sampling for `layer.motion` or flagged moving layers (2×2 supersample);
  - owner tracking;
  - the static/animated split: cache static layers' composite and re-sample only layers whose field reads `t`/`pointer`. Each layer is marked with `live?: 't' | 'pointer' | 'data'`.
- **Canvas:** batch by (colour, opacity, size step) into `Path2D` per bucket, or a sprite atlas plus `drawImage`. Target ≤ 30 fills per card.
- **SVG:** 2-decimal rounding, `<defs>`/`<use>` per size step, grouping by fill. Target < 0.5 MB per board.
- **WebGL2** (P5): instanced superellipse quads with an AA'd `f/|∇f|` edge; one canvas per board with scissor rects; 1M dots at 60 fps.
- **Export:** PNG, SVG, APNG/GIF (filmstrip), MP4 via WebCodecs, the device raster (§P5).

### 3.6 Card spec (data, not code), from P6, designed now
```json
{ "id": "timer", "grid": [144,144], "style": "tile", "states": { "idle": {...}, "running": {...} },
  "layers": [{ "id": "ring", "gen": "ringCells", "args": {...}, "tone": "mid", "z": 0.2,
               "bind": { "sweep": "data.progress * TAU" }, "motion": { "enter": "radial-dither" } }],
  "transitions": [{ "from": "idle", "to": "running", "mask": "bayer", "dur": 400, "ease": "emph" }] }
```
- Interpreted by `engine/spec.ts` into a `LayerSource`.
- TS presets stay first-class; the spec is the interchange format for the editor, agents, devices and the registry.

## 4. Phases
Each phase:
- ends with a showcase board;
- every card goes through the §2.3 refinement protocol;
- has hard exit gates.

Durations assume one developer plus agent help.

### P0 · Foundations and the fidelity harness (1.5 wk)
**Goal:** a trustworthy base and the measuring stick.
- **Hardening:** ADVANCED-PLAN H1 (cells clip), H3 (tests out of engine, curated barrel), H4 (Draw resize), M7 (sampler guards), perf items 1–3 and 5 (jitter fast path, SVG compaction, hot spots, static cache).
- **Fidelity tooling:** `snap --film / --replay / --diff / --ref`, `fidelity` scorecard, golden hashes, `scripts/bench.ts` with budgets.
- **CI:** GitHub Action running tsc, lint, verify, golden hashes and bench budgets.
- **Baseline scoring:** score all 71 cards with the rubric. That gives a ranked "worst 15" list, refined in P1–P3 alongside new work.

Exit gates:
- CI green;
- mosaic mount < 30 ms;
- board SVG < 0.5 MB;
- every card has a scorecard;
- the liked cards score ≥ 30 (validating the rubric against taste).

### P1 · Time: clock, motion, choreography (2 wk)
**Goal:** every board feels alive and intentional; no hard cuts anywhere.
- **Engine:** `FrameContext`, board clock, imperative loop, `motion/*` (masks, reveal, transition, coarsen, springs, ease, stagger, text decode/split-flap, afterglow), static/animated split, reduced-motion policy (everything degrades to `transition` with e→0 or a cut).
- **App:**
  - **board choreography:** cards enter on a diagonal stagger with a Bayer reveal (~400 ms). Sampling is progressive, so the stagger also hides mount cost;
  - **tab switching:** an exit dissolve, then an enter;
  - a **playground transition lab**: pick A/B presets, mask, ease and duration; scrub `p` with a slider; export the filmstrip.
- **Card upgrades (data changes animate):**
  - clock digits split-flap or decode;
  - weather icon SDF morph;
  - timer arc on a spring;
  - fitness rings on stagger fill;
  - music progress on a spring;
  - message arrival as a typewriter;
  - mosaic thermal with afterglow;
  - audio meters with peak-hold afterglow.
- **Showcase · "Boot" board:** a full device boot sequence (CRT line-open, then a lamp-test scan, then a logo reveal, then cards staggering in), and a "night mode" transition across the whole board.

Refinement focus: motion legibility (criterion 9) via filmstrips. Each animated card gets a filmstrip review and ≥ 2 refinement passes.

Exit gates:
- 0 hard cuts in app navigation;
- all 71 cards have an enter;
- p95 frame < 8 ms at 30 fps on the mid-tier laptop profile;
- reduced motion verified;
- the Boot board scores ≥ 32.

### P2 · Touch: interaction model and Components v2 (2.5 wk)
**Goal:** dot UI you can *use*, not just watch, at native-feel latency.
- **Engine:** `pointer`/`focus` in context, `Layer.id/role/hit`, `pick()`, `SimField` (ripple, trails), fx `fisheye`, `refract`, `glow`.
- **App:**
  - an a11y overlay: real `<button>`, `<input type=range>` and `role=switch` elements positioned over the hit rects, with roving tabindex, 24/44 px targets and `aria-valuenow` bound to data;
  - pointer capture;
  - `navigator.vibrate` where supported.
- **Interaction grammar** (DESIGN.md gains an "Interaction" section with tokens for glow radius, press step, spring half-life, focus-ring dash and hit pad):
  - hover glow in value/mid, never accent;
  - press compression one quantize step down, with an underdamped spring on release;
  - focus ring of marching dots;
  - a drag scrubs in whole dot columns;
  - long-press uses a radial reveal as its progress.
- **Components v2**, all interactive and keyboard-complete:
  - basics: toggle, segmented control, slider (continuous and stepped), knob/crank with detents, stepper, checkbox, radio, tabs, list with fisheye, chips, progress (determinate and indeterminate), loaders (8 patterns), toast, notification stack, modal sheet;
  - a dot keypad with key-press ripples;
  - a dot text field: caret blink, typewriter echo, a full 5×7 keyboard;
  - a date wheel with inertial scroll;
  - a color-less "theme" switch (dot roundness and pitch live).
- **Showcase · "Controls" board:** TE OP-1-style performance controls (4 knobs, a crank, XY pad with trails, a sequencer grid of 16 steps with a playhead). Wired to Web Audio, so it actually makes sound. This is proof of latency.

Refinement focus: criterion 10. `snap --replay` filmstrips for hover, press, drag and keyboard on every component, plus an automated next-frame latency test (pointer event timestamp → frame commit).

Exit gates:
- every component works by mouse, touch and keyboard;
- axe-core clean;
- input-to-pixel ≤ 16 ms p95;
- the Controls board scores ≥ 32.

### P3 · Space: depth, light and material (2.5 wk)
**Goal:** cards with real depth at the level-03 / afterlight standard, as reusable primitives rather than one-offs.
- **Engine:**
  - `Layer.z/blend/moat`;
  - fx light (`heightOf`, `normalOf`, `lambert`, `phong`, `ao`, `shadow`, `fog`);
  - `scene3d` (ray-plane plus SDF raymarch with step cap and a precompute cache for static scenes);
  - `toneRamp`, `lumaSites`, `halftone 2.0` (linear light, area-correct, blue noise, serpentine FS, structure-aware option);
  - defocus by integer lattice ratio (no-moiré rule asserted in verify);
  - cell-snapped parallax.
- **Materials as dot vocabularies:**
  - **matte:** Lambert;
  - **gloss:** spec highlight that steps 2 sizes up;
  - **glass/refraction:** a warp of the layer behind, through the normal;
  - **emissive:** accent bloom halo in activeDim steps;
  - **metal:** env-mapped stripes;
  - **fabric:** a dither texture.
- **Light as interaction:** a torch light that follows the pointer (P2 + P3), and time-of-day light across a whole board (the light angle drives every card's shading).
- **Showcase · "Depth" board:**
  - a lit physical button panel;
  - an isometric room (a level-03 descendant);
  - a dome planet with a terminator line and parallax stars;
  - a donut.c-style spinning glyph;
  - a glass card refracting the card behind it;
  - a portrait via `lumaSites` from any photo (the afterlight technique, productized);
  - a depth-of-field photo with a focus slider.

Refinement focus: criteria 2, 4 and 11, with tone-pass reviews against afterlight and level-03 crops side by side.

Exit gates:
- the depth board averages ≥ 32;
- the no-moiré verify passes;
- static scenes are cached (< 5 ms re-sample);
- halftone 2.0 beats the current photo cards in a blind A/B of mid-tone accuracy (histogram match vs source).

### P4 · Living cards: hero transitions, simulation, live data (3 wk)
**Goal:** moments people screen-record.
- **Shared-element transitions:** a card expands into a full-screen detail view. The lit dots of A migrate to B via Hilbert-rank or sliced-OT matching, are splatted into a field, and are resampled. Unmatched dots spawn or fade on a dither mask.
- **SDF morph** for icons and digits, with the glyph EDT cached.
- **Simulation fields** (SimField):
  - falling sand (cellular automaton) that settles into the time digits ("hourglass clock");
  - a fluid level for battery, splatted SPH-lite at 2k particles;
  - boids for an ambient "flock" wallpaper;
  - Conway's Life;
  - a ferrofluid-like notification blob (metaballs attracted to the pointer).
- **Live data:** a binding layer (`poll`, `webhook`, `websocket`, JSONPath) with 10 sources (weather, stocks, GitHub contributions, now playing, calendar, transit, air quality, crypto, system stats, news ticker). Every change animates via P1 primitives.
- **Live media:**
  - Web Audio FFT → audio board;
  - webcam → halftone 2.0 mirror (`requestVideoFrameCallback`, spatiotemporal blue noise for stability);
  - screen capture → dot mirror.
- **Showcase · "Dot OS" board/app.** A complete interactive phone shell in dots:
  - lock screen with a sand clock;
  - unlock gesture;
  - home grid;
  - app opening via shared-element migration;
  - notification shade (sheet);
  - control center (P2 components);
  - a live wallpaper (flock).

  This is the flagship demo.

Refinement focus: everything. Dot OS goes through ≥ 3 adversarial critique rounds with filmstrips.

Exit gates:
- a 60 s Dot OS screen recording with no frame drops at 30 fps;
- migration ≤ 4 ms per frame for 3k dots;
- Dot OS scores ≥ 33.

### P5 · Render and reach: GPU, devices, outputs (3 wk)
**Goal:** any dot surface, any scale.
- **WebGL2 renderer:**
  - instanced superellipse SDF quads;
  - per-instance radius, opacity, colour index and roundness;
  - one context per board;
  - fallbacks from WebGL2 to batched canvas to SVG, chosen by DESIGN's dot-count/animation rule (updated with GPU thresholds).
- **Worker sampling** via OffscreenCanvas and a SharedArrayBuffer of dot instances, plus the struct-of-arrays `DotInstance`.
- **Scale test:** a 1920×1080 "LED wall" mode, ~500k dots at 60 fps.
- **Device targets:** `toDevice(spec, profile)` resamples the *field* (not the pixels) to the device lattice, with per-device tone maps:
  - Nothing Glyph Matrix: 25×25 round mask, an Android Toy template;
  - TRMNL: 800×480 1-bit, blue-noise dithered, plugin template;
  - AWTRIX: 32×8 MQTT;
  - Tronbyt/Tidbyt: 64×32 WebP;
  - Pixoo: 64×64 HTTP;
  - WLED/ESP32 LED matrices: UDP DDP realtime streaming;
  - Apple Live Activity / Android Live Update `small` templates (as images).
- **Outputs:**
  - an OG/email image endpoint (spec → SVG → resvg PNG);
  - GIF, MP4 and APNG;
  - Lottie export (dots as shape layers);
  - physical: LEGO stud bill of materials (palette-quantized), cross-stitch chart PDF, laser threshold PNG, pen-plotter SVG (circles as spirals sized by value);
  - a tactile Dot Pad renderer (1-bit, 60×40 pins) behind a feature flag.
- **Showcase · "Everywhere":** the same timer card live on web, a Glyph Matrix emulator, a TRMNL emulator, an LED wall and as a plotter preview, with a time-synced animation across all of them.

Exit gates:
- 500k dots at 60 fps (WebGL2);
- 3 physical targets demonstrated;
- device output passes per-profile golden tests.

### P6 · Author and ecosystem (4 wk, then ongoing)
**Goal:** anyone can make an alive dot card, and the best rise.
- **Card spec v1** (§3.6), with a JSON Schema, validator, migration tooling and TS ↔ spec round-trip for the generator subset.
- **Dot Studio** (playground → editor):
  - layer list with z, blend and tone;
  - generator inspector;
  - a timeline for enter/change/exit with mask and ease curves;
  - a state machine view, in the spirit of Rive;
  - data binding UI;
  - fidelity scorecard live in the sidebar;
  - one-click export to every P5 target.
- **AI authoring:**
  - prompt or reference image → spec;
  - the agent runs the **§2.3 refinement loop automatically**: render, then the fidelity scorecard, then a critique from a vision model against the rubric, then revise;
  - stops at ≥ the gate or N rounds;
  - exposed as an **MCP server** with tools `render_card`, `score_card`, `refine_card` and `push_to_device`, plus an **MCP App** (`ui://dot-card`) so the card renders inline in Claude, ChatGPT and Copilot.
- **Distribution:**
  - `@dot480/core`, `@dot480/react` and a `<dot-card>` custom element;
  - a shadcn registry (Components v2 + widgets);
  - Framer and Figma plugins (spec ↔ frames);
  - a GitHub README card service (contributions, stats).
- **Community:** a gallery with fork, remix, fidelity badges, and a weekly "card of the week" chosen by score plus votes.

Exit gates:
- `npm i @dot480/core` works;
- ≥ 60% of AI-generated cards reach the ship gate within 4 rounds;
- 100 community cards.

### P7 · Moonshots (research track, parallel from P3)
Each is a time-boxed spike (≤ 1 wk). It graduates only if it beats the baseline on its metric.
1. **Perceptual-optimal halftoning:** an offline optimizer that adjusts each dot's size to minimize a perceptual error (HVS-filtered, SSIM) against the source (Pang et al. structure-aware halftoning; Chizhov et al. 2022 perceptual error optimization). It turns any photo card into its best possible dot rendition. **Metric:** SSIM against the source over halftone 2.0.
2. **Temporal super-resolution:** sub-cell motion plus area sampling, so moving content appears sharper than the grid (the eye integrates). **Metric:** user A/B readability of small moving text.
3. **Dot shader language:** a tiny DSL (`dot` expressions → JS Field and → GLSL) so the same field runs on CPU and GPU without duplication. **Metric:** parity tests.
4. **Multi-screen choreography:** a card flows phone → desktop → LED wall via BroadcastChannel/WebRTC, with a shared board clock (NTP-style sync).
5. **WebXR volumetric dots:** layer `z` becomes real depth; cards are dot-clouds you can walk around.
6. **Sonified UI:** every interaction's spring also drives a Web Audio click or tick synthesized from the same parameters (TE-style), so motion and sound are one function.
7. **Neural style capture:** learn the "Henry Li / Nothing" style from the reference corpus as rubric weights, and use it to auto-score.
8. **Tactile-first cards:** a Braille/Dot Pad renderer with sonification for screen-reader users.

## 5. Cross-cutting tracks
- **Performance budgets (CI-enforced):**
  - per frame: sample + render ≤ 4 ms per animated card at 30 fps, ≤ 8 ms for the board total;
  - mount ≤ 30 ms per board, progressive;
  - SVG ≤ 0.5 MB per board;
  - JS bundle ≤ 150 kB gzip for the app shell; boards lazy.
- **Determinism:**
  - all randomness is `hash(seed, cell, frameBucket)`;
  - lint-ban `Math.random` and `Date.now` in `src/engine`;
  - a SimField is deterministic given its input log.
- **Accessibility:**
  - reduced-motion policy per primitive;
  - the a11y overlay;
  - `describe(ctx)` per card for screen readers;
  - contrast for `--mute` ≥ 4.5:1;
  - the focus ring is never accent-only.
- **Docs:**
  - DESIGN.md gets Motion, Interaction, Depth and Material token sections, updated in the same PR as code (AGENTS rule);
  - DOT-MATRIX-ENGINE-PLAN.md gets updated architecture;
  - stale docs are archived.
- **Governance of invariants:**
  - `verify` asserts one accent per board, quantization on UI cards, integer lattice ratios for overlapping layers, no deps in the engine, and deterministic output;
  - the rubric's accent and integrity criteria are automated.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Scope explosion | Phases ship independently; P7 is time-boxed spikes with graduation metrics |
| Per-frame cost as effects stack (warp + light + sim) | Static/animated split, `live` flags, area-sampling only on moving layers, the GPU path in P5, budgets in CI |
| Lattice shimmer from motion | The §0 rule (warp the samples, not the dots); cell-snapped parallax; filmstrip review |
| Accent creep with interaction states | Interaction tokens exclude the accent; verify assertion |
| Fidelity drift as cards multiply | Rubric gate in CI (automatable parts) plus required critique rounds |
| React re-render latency | Imperative loop; React mounts only |
| SVG unsuitable for animation | Canvas/WebGL for live; SVG for static export only |

## 7. Decisions needed
1. Accent on interaction states: proposed **no**.
2. Hover states in DESIGN.md: proposed **allowed**, with interaction tokens.
3. Frame-rate tiers: proposed 12 ambient / 30 interactive / 60 hero.
4. Card spec as the interchange format with TS presets kept: proposed **yes**.
5. Product track: kit only, or kit plus devices and AI authoring (P5–P6)?
6. Package names `@dot480/*`.

## 8. Timeline (indicative)
| Weeks | Phase |
|---|---|
| 1–1.5 | P0 Foundations + fidelity harness |
| 2–3.5 | P1 Time |
| 4–6 | P2 Touch |
| 6.5–9 | P3 Space (P7 spikes start) |
| 9–12 | P4 Living cards → Dot OS |
| 12–15 | P5 Render & reach |
| 15–19+ | P6 Author & ecosystem |
