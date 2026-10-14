# MASTER PLAN — Dot/480: the perceptual compiler for dot surfaces

> **v2** · 2026-10-14 · branch `feat/tile-boards`.
> v1 was reviewed adversarially by three critics: engine architecture, design/fidelity, and vision/research. Every accepted amendment is folded in; the appendix logs what changed and why.
> **Inputs:**
> - `ADVANCED-PLAN.md` (audit, perf, product);
> - `MOTION-INTERACTION-DEPTH.md` (motion, interaction, depth research);
> - `public/lab/motion-lab.html` (live proof of the core techniques);
> - the code (engine about 5.2k LOC);
> - user feedback.
>
> **Quality bar:** level-03, afterlight, the mosaic board, the components board.
> **Invariants** (AGENTS.md) hold throughout:
> - Field → Sampler → Renderer;
> - one accent **hue** per board;
> - quantized UI dots;
> - squircle exponent;
> - framework-free `src/engine`, no deps.
>
> The two places this plan proposes to *clarify* invariants (accent semantics, the quantization exemption for scenes) are user decisions in §11.

---

## 0. North star
> **Write a field once and get the best possible dots for any lattice, any display physics and any viewer: alive, touchable, and verifiably high-fidelity.**

What that means concretely:
1. **Field-native.** Every dot decision is a pure function: motion, interaction, depth and light are composable math, not keyframes.
2. **Perception-aware.** A `DeviceProfile` (lattice, levels, gamma, bloom, response time, viewing distance) drives both an honest *preview* of how a card will look on e-ink, LED or flip-disc and an *optimizer* that picks dot sizes against a human-visual-system model.
3. **Fidelity-gated.** Nothing ships on vibes. Hard gates, a taste-calibrated score and a human "like" on every hero card.
4. **Portable programs, not frames.** A small field IR compiles to JS, GLSL and device bytecode, so a card runs on a GPU, an ESP32 or inside an AI chat from one source.

**What we explicitly don't claim (v1 was wrong):**
- **Not resolution-free for the existing presets.** All 71 are authored in absolute TILE cells: module-level `layoutFor(TILE)`, `N = TILE.cols-1` (`mosaic.ts:11-13`, `audio.ts:11`). Resampling them as flattened fields turns dot-aligned text into mush.
- **The plan instead:** presets declare `authoredGrid`, and device targets use explicit `variants` (§3.9). Only new IR-authored cards are grid-agnostic.

---

## 1. Baseline (verified against the code)
| Area | State | Evidence |
|---|---|---|
| Cards | 71 presets on 8 boards, TILE 144×144; 11 animated, all looping idles | `src/widgets/boards/*` |
| Composite | Max-value fold per sample space (base grid, one sub-grid per `(lattice, origin)`, a string-keyed site map); lattices "cover" card cells | `gridSampler.ts:59-127` |
| Cover bug | Cover is decided on the *unquantized* value, so a value of about .1 quantizes to 0 but still punches a hole | `gridSampler.ts:96-100` vs `:35` |
| `lattice` overload | For site layers, `lattice` is the dot *size*, not the pitch | `types.ts:39-41`, `widgets/types.ts:130` |
| Type scale | **35 distinct lattice values** (.72, .92, 1.05, 1.1, 1.15, 2.1, 3.05…); DESIGN gives ranges, not steps | board files |
| Accent | AGENTS: one accent *colour* per board; DESIGN:216: one per *card*; mosaic uses `active` 32 times (the user's favourite board) | — |
| Determinism | `hash = fract(sin(x)*43758.5453)` in 5 files; `Math.sin` isn't bit-identical across JS engines, so goldens are single-engine | `mosaic.ts:32`, `audio.ts:117` |
| Time | One rAF per card at 12 fps through React `setT`; the clock resets on resume; static cards re-sample every minute via `tick` | `useDotField.ts:25-35`, `Board.tsx:23,30` |
| Allocation | `DotInstance` objects, about 20k per frame per card, so GC pressure | `gridSampler.ts:37` |
| Interaction | None in fields; no hit-testing; card wrapper `role="img"` hides descendants from assistive tech | `DotWidget.tsx:35` |
| Depth | Faked inside individual fields (level-03 ray-plane, henry3 painter-mix, mosaic bevels) | — |
| Perf | Frames ≤ 9.4 ms; mount: mosaic 103 ms; SVG 1.3–2.9 MB per board | `.snapshots/bench` |
| Debt | H1–H4, M1–M10 | ADVANCED-PLAN §2 |

---

## 2. The fidelity system (built first, used for everything)
v1 measured engineering, not taste. Scored as written, it failed the user's favourite board (criterion 5) and passed cards the user rejected. v2 separates **gates**, **visual craft** and **life**, calibrates against the user's taste, and adds the stages that actually produced the liked cards.

### 2.1 Style bible (`docs/STYLE-BIBLE.md`, extracted in P0 from the liked cards)
1. **Tonal depth beats on/off.** Heroes are continuous-tone (level-03, afterlight and the mosaic photos use `quantizeSteps: 0`). Flat on/off cards are the ones the user rejected.
2. **Scale contrast.** At least a 2.5× lattice jump between hero and caption.
3. **Red is the plot point, not the status.** The level-03 invader at the vanishing point; the afterlight line that splits the face; the thermal core.
4. **Hand-authored hero data beats generic generators** for faces, characters and creatures (afterlight's `FACE` luma table, level-03's `INVADER` sprite). Generators produce the draft; a human or agent tunes the data.
5. **Scenes over inventories.** One idea or story per card.
6. **Component vocabulary:** dotted outlines, generous negative space, exact geometry, single huge sites for knobs.
7. **Type ladder** (§2.2 G3) and **label system:** numbered index, label, corner glyph, stat footer (the mosaic chrome).

### 2.2 Gates (pass/fail; automated where marked ⚙)
| # | Gate | Check |
|---|---|---|
| G1 ⚙ | **Dot integrity** | Glyph and UI pixels on dot centres; no cover holes; no NaN sites |
| G2 ⚙ | **Accent semantics** | One accent *hue* per board. Red only on live, hot or primary elements: every `active` layer carries `role` ∈ {live, hot, primary} in its metadata; decorative red fails |
| G3 ⚙ | **Type-scale conformance** | Lattice ∈ ladder **{0.72, 1, 1.3, 1.6, 2, 2.5, 3, 4}**; exceptions need a logged reason |
| G4 | **1× optical legibility** | The smallest text tier reads cleanly at 1× on a 2.25 px pitch. If not, raise its *dot size*, not its lattice (the current eyebrow labels fail) |
| G5 ⚙ | **Perf** | Within the §6 budgets for its renderer and fps tier |
| G6 ⚙ | **Safety** | WCAG 2.3.1 flash and red-flash analysis on every filmstrip; reduced-motion variant present |

### 2.3 Visual score (0–3 each, max 24): craft and taste only
1. **Silhouette at 1×.** Fill every lit dot solid: can you name the subject? (`cody` and `tatooine` pass; `henry-bear` and `vision-camera` fail.)
2. **Tonal depth:** shadows, mids and highlights used with intent.
3. **Hierarchy:** the read order survives a 6 px Gaussian blur (squint test, computed as HVS-filtered at two viewing distances).
4. **One idea / story.**
5. **Material honesty:** tone means something physical (`thermal-monitor` passes; `thermal-puppy`, a grey ghost labelled THERMAL, fails).
6. **Edge quality:** soft one-cell ramps for organic shapes, hard edges for UI.
7. **Density balance:** negative space; nothing denser than the hero.
8. **Board coherence:** shared label system, hero baselines, margins, one numeral weight per board (henry fails: `home-clock`/`weather` versus `timer`).

### 2.4 Life score (0–3 each, max 12; animated or interactive cards)
1. **Motion legibility:** ≤ 1–2 cells per frame at the card's fps; ≥ 300 ms for tweens meant to read as motion.
2. **Easing feel:**
   - entrances decelerate and exits accelerate;
   - only mechanical things (playheads, scanners) move linearly;
   - moving elements show velocity (afterglow or a lattice change).
3. **Interaction response:** next-frame feedback, a visible affordance, keyboard parity.
4. **Depth read:** front and back are separable at a glance.

**Ship:** all gates pass, visual ≥ 17, and life ≥ 8 if animated.
**Hero:** visual ≥ 20 **and an explicit user "like"**. An agent score never ships a hero alone.

### 2.5 Calibration (stops the rubric from being circular)
- **Rank validity (P0 exit):**
  - the rubric must place level-03, afterlight, mosaic and components in the top quartile of all 71 cards;
  - it must place the cards the user rejected in the bottom half;
  - if it can't separate them, fix the rubric, not the cards.
- **Inter-rater agreement:** human versus agent scores on 20 cards, Cohen's κ ≥ 0.6 before the agent score is used as a gate.
- **Preference model** (P6): pairwise like/kill votes, fitted Bradley–Terry, used as few-shot exemplars for the AI critic, UICrit-style. 71 cards is too few to learn weights, so we don't try.

### 2.6 Instruments (`scripts/`, outside the engine)
| Tool | Output |
|---|---|
| `snap` (exists) | Card and board PNGs |
| `snap --film <id> --t a:b:step` | Contact sheet + APNG; deterministic t |
| `snap --replay <id> --input input.json` | Scripted pointers (in sim ticks) → filmstrip |
| `snap --bar <id>` | **Bar sheet:** the candidate beside level-03, afterlight, `thermal-monitor` and `ui-toggle`, at the same pitch, in 1×, 3×, blur and silhouette views |
| `snap --ref <id> <crop>` | Side by side + **HVS-SSIM** (CSF-filtered at 2 viewing distances, from the `DeviceProfile`) |
| `snap --diff` | pixelmatch heatmap vs golden PNG; golden **hash** of the quantized dot list |
| `fidelity <id>` | Automated gates (G1–G3, G5–G6) + metrics: tonal histogram, density map vs hero bounding box, motion speed in cells per frame, accent roles, lattice ladder |
| `bench` | Per-card sample, emit and render times, against budgets |

### 2.7 Refinement protocol: v0 → v5, every card, every phase
| Stage | Work | Exit |
|---|---|---|
| **v0 References** | 3–5 references (Nothing Glyph, TE OP-1/TP-7, Braun, Swiss transit, Rams-era instruments, the `public/images` set); a one-line **thesis**; the hero element; the style-bible rules that apply | Thesis approved (agent; user for heroes) |
| **v1 Divergent** | **3 divergent variants** (structure, lattice tiers, data). The thumbnail strip goes to the user (heroes) or the critic (others) | One variant picked |
| **v2 Tone** | Luminance pass: shadows, mids, highlights, soft edges; hand-tune the hero data; bar-sheet review | Visual ≥ 14 |
| **v3 Life** | Enter/change/exit, interaction, depth; filmstrip + replay review | Life ≥ 8 |
| **v4 Critique** | A fresh critic agent gets the bar sheet, 1×/3×/blur/silhouette views and the filmstrip. It answers **"screenshot-worthy? yes/no + why"** first, then lists defects ranked by severity, and holds a **kill-your-darlings veto** (it may recommend scrapping the concept) | Defects fixed or rebutted |
| **v5 Ship** | Re-score; heroes get the user like/kill decision on the bar sheet | Gates + thresholds |

**Loop rule:** repeat v4 until the critic's top defect is cosmetic **and** the score clears the gate. Heroes need ≥ 3 critique rounds.

---

## 3. Architecture: Engine 2.0
Everything here is plain TypeScript in `src/engine`. `Field(u,v)` stays. The big change from v1: **pointwise fields are not enough.** Caching, neighbourhood ops, transitions, hit-testing and workers need *data*: rasters, keys and hit rects.

### 3.1 Two value kinds: `Field` and `Raster`
```ts
type Field = ((u: number, v: number) => number) & { bounds?: CellBounds }
interface Raster { grid: GridConfig; space: SpaceId; data: Float32Array; bounds?: CellBounds }
type SpaceId = 'card' | `lat:${number}|${number},${number}` | 'sites'
rasterize(field, grid, space): Raster
sample(raster): Field               // bounded lookup; nearest or bilinear
```
- **Pointwise ops** (warps, tone, masks against a field) work on `Field`.
- **Neighbourhood ops work on `Raster` only:** dilate, erode, outline, moat, blur/bloom, normals, AO, afterglow decay, SimField.
- This fixes v1's O(k²)-per-sample combinators and makes caching natural.

### 3.2 Context and the clock
```ts
interface Pointer { id: number; x: number; y: number; inside: boolean; down: boolean; tDown: number; tUp: number; vx: number; vy: number; pressure: number; captureKey?: string }
interface FrameContext<D = Record<string, number>> {
  t: number; dt: number; frame: number          // card-quantized time (below)
  grid: GridConfig; authoredGrid: GridConfig
  data: D                                       // already spring-smoothed (§3.5)
  pointers: Pointer[]                           // multitouch: Instrument needs 4 knobs + XY at once
  focus?: string
  state?: string                                // current state (§3.6)
  reducedMotion: boolean; seed: number
  toLocal(p: Pointer, space: SpaceId): { x: number; y: number }
}
```
- `WidgetContext` becomes a type alias. It's a structural subset, so nothing breaks.
- **Master clock** (`engine/clock.ts`):
  - **one 60 Hz rAF per board**;
  - each card renders at `t_card = floor(T·fps)/fps` for its tier (12 ambient, 30 transition, 60 hero);
  - **any input marks the card dirty and renders on the next rAF regardless of tier**, which is required to meet the latency gate.
- **Time:**
  - live time is quantized wall time;
  - snap/film time is `frame/fps`;
  - pausing keeps state and resuming does not reset to 0;
  - over budget, the farthest-off-screen cards drop a tier first.
- **Imperative loop:** React mounts once; the clock calls sample → render directly. Playground data reaches the clock through a store subscription, not props.
- **Error isolation:** each card is sampled in try/catch; keep the last good frame and show a dev overlay. A throwing field (M7) can't kill the board.

### 3.3 Static/live split (replaces v1's honour-system `live` flag)
```ts
interface WidgetPreset {
  layers(ctx): Layer[]            // re-run only when data / grid / theme / state change
  live?(ctx): Layer[]             // the only per-frame call (t, pointers)
  authoredGrid: GridConfig; variants?: Partial<Record<DeviceKey, LayerSource>>
}
interface Layer { …; key?: string; deps?: readonly unknown[] }   // cache key = (key, deps, space)
```
- **Cache:** static layers rasterize once per (key, deps, space) and stay cached.
- **Per frame:** only `live()` layers sample each frame. They composite over a cached **static prefix** per space.
- **Liveness lint** (verify, dev): perturb `t` and the pointer, re-run `layers()`, and assert identical hashes. A wrongly-static layer is caught, not silently frozen.
- **Migration:** existing presets keep `layers()`. The 11 animated ones split their moving parts into `live()`. Cards without `live` are fully cached.

### 3.4 Layer 2.0 and composition
```ts
interface Layer {
  field: Field; tone?: Tone
  lattice?: number; origin?: [number, number]
  sites?: Float32Array | [number, number][]     // [x, y] or packed [x, y, size, value]
  size?: number                                  // site dot size (splits the overloaded `lattice` for sites)
  key?: string; deps?: readonly unknown[]
  id?: string; role?: 'button' | 'slider' | 'switch' | 'tab' | 'text' | 'img' | 'decor'
  accentRole?: 'live' | 'hot' | 'primary'      // required when tone === 'active' (gate G2)
  hit?: { rect: CellBounds; shape?: 'rect' | 'round' | 'circle'; r?: number; pad?: number } // card cells, data
  z?: number                                     // 0 front … 1 far: atmos, defocus, parallax
  blend?: 'max' | 'over' | 'multiply' | 'knockout' | 'mask'
  moat?: number                                  // card cells
  motion?: { enter?: RevealSpec; exit?: RevealSpec }
}
```
- **Within one space:** a left fold in array order.
  - `max` and `over` take their tone from the winning contributor;
  - `multiply`, `mask` and `knockout` keep the accumulator's tone.
- **Across spaces:** the only interaction is a card-space **coverage raster** (float, generalizing `covered`). Lattice dots, sites, `knockout` and `moat` write into it; `moat` = dilate(lit mask) as a Raster op.
- **Cover triggers on the quantized value > 0** (fixes the hole bug).
- **`bounded()` returns a wrapper** instead of mutating its argument (it currently mutates shared and cached fields).
- **Bounds through fx:**
  - `shift` translates bounds;
  - `scale` and `rotate` bound the transformed corners;
  - `warp`, `fisheye` and `refract` must declare `maxDisplacement` or drop bounds.
  - H1 (bounds as clip) lands before any fx.
- **Hit-testing:** `pick(c, r)` walks `hit` shapes in reverse z and then array order. The owner raster is a decor-only fallback, written where cover is computed; sites use the nearest site within reach.
- **Interactive cards:** use `role="group"` instead of `img`, with a real-control a11y overlay positioned from `hit.rect`.

### 3.5 Motion
Transitions operate on **sampled buffers, not fields.** That means no re-evaluating old closures, and it's cheap enough to run on every card at once.

**Card-level enter/exit:**
- A mask is applied to the card's final value and coverage buffers, at about 0.1 ms per card.
- **Zero preset edits** give all 71 cards an entrance.

**Keyed layer transitions** (A → B):
- Same `key`, same space: `transition(bufA, bufB, mask, p)`.
- Same key, different space: `coarsen` (lattice morph) or exit + enter.
- Unmatched: enter or exit, with exiting buffers frozen.

**Data springs:** `ctx.data` is smoothed by the clock (`springData(keys, halflife)`, Holden's exact critical damper, closed form). Timer arcs, progress bars, rings and meters animate with **no field transition at all**. This covers most P1 card upgrades.

**Masks:**
- `bayer(k)`;
- `blueNoise` (a 64² table baked offline into a `Uint8Array` literal);
- STBN slices for temporal use;
- `ign`, `radial`, `linear`, `angular`, `curtain`, `hilbert`, `ditherEdge`.
- Edge width `e` snaps to `1/(steps-1)`, so quantized reveals don't stutter.

**Easing tokens:** emphasized, decelerate, accelerate. Springs are closed-form critical and under-damped.

**Text motion:**
- `layoutText(str, opts) → { glyphs: {ch, col, w}[] }` aligns over `max(prev, next)` width, so centred strings don't jump.
- `decode`, `splitFlap` and `typewriter` sit on top of `layoutText`.
- Needs the **font registry** (M1) first, which also covers the local faces in `audio.ts` and `metro.ts`.

**Afterglow:** a decay raster `v' = max(v, old·e^(-Δt/τ))` stepped at the sim rate. v1's K-tap re-evaluation would cost 5× a full card, and the thermal monitor alone would reach 65 ms.

**Migration (P4):**
- Rendered as a **site layer** with packed `[x, y, size, value]`, never splatted to card pitch (which would make clusters, forbidden by AGENTS).
- Hilbert-rank matching online, with setup ≤ 8 ms; sliced OT offline or in a worker.

### 3.6 States
A state machine as a TS API from **P1**, not P6:
```ts
states: { idle: {...dataOverrides}, running: {...} }
transitions: [{ from: 'idle', to: 'running', on: 'press:start', mask: 'bayer', dur: 400, ease: 'emph' }]
```
- `ctx.state` and the transition progress come from the clock.
- Toggles, tabs, the Glyph lock screen and Departures all need it.

### 3.7 SimField
- **Fixed 60 Hz sim rate** with an accumulator, independent of render fps.
- The input log is stamped in sim ticks.
- **Checkpoint** every 60 ticks, so `snap --film --t 5` doesn't re-simulate from 0.
- Pause keeps state; resume never catches up past 250 ms.
- Buffers come from the board pool.

### 3.8 Light, depth and scene (Raster-based, P3)
- **Height and normals:**
  - `heightRaster(sdf, profile)`, then `normalRaster`, both cached per geometry;
  - per frame, `lambert(normals, L)` / `phong(...)` is about 20k dot products ≈ 0.1 ms.
  - v1's 5 evals per dot came to about 5 ms, or about 20 ms with area sampling.
- **Scene:** `scene3d({ planes, sdfs, camera, fog })` generalizes level-03's ray-plane corridor. Raymarched SDFs (about 1.3M evals, 30–70 ms) are **precomputed static rasters only**.
- **Tone and halftone:**
  - `toneRamp(field, stops)` evaluates once and emits several tones (the thermal monitor currently calls `mugHeat` 3× per cell);
  - `lumaSites(map, px, py)` keeps a **hand-tuning pass** (style bible rule 4);
  - `halftone` ladder: §8, Track L.
- **Defocus:** only `z`-defocus layers must use integer ratios of their parent lattice. The global "integer lattice" assertion from v1 is dropped, since the liked mosaic board uses 0.72.
- **Parallax:** cell-snapped per layer pitch. **Bloom:** a Raster blur of the accent at 2× pitch, rendered in `activeDim`.

### 3.9 Grids, variants and determinism
- **`authoredGrid`** on every preset.
- **Device output:**
  - curated `variants['25x25' | '64x32' | '800x480']` for presets;
  - automatic resampling only for IR-authored cards;
  - no codemod to make all 71 presets grid-agnostic.
- **Integer hash:**
  - `hash32(seed, a, b)` (PCG/xxhash-style `Math.imul`) replaces `fract(sin)` everywhere;
  - lint-ban `Math.random`, `Date.now` and `Math.sin`-hashing in `src/engine`;
  - goldens are re-baselined once in an explicit PR.

### 3.10 Memory and data layout
- **Struct of arrays from P1:**
  - `DotBuffer { x, y, r, opacity: Float32Array; tone: Uint8Array; n }` with reused buffers;
  - a renderer adapter keeps the `DotInstance[]` API for exports.
- **Pools:**
  - a raster pool per mounted board (about 83 KB per 144² raster), released on tab switch;
  - **≤ 8 MB per board** gate;
  - glyph/EDT cache, LRU of 256 keyed on (font, glyph, scale, weight).
- **Static tick:** the minute tick re-samples only cards that read wall-clock time (`Board.tsx:23,30`).

### 3.11 Renderers
| Renderer | Plan | Gate |
|---|---|---|
| Canvas (default for live) | Batch by (tone, size step, opacity step) into `Path2D` | UI cards ≤ 30 fills; photo cards use a sprite atlas + `drawImage` |
| SVG (static and export) | 2-dp rounding, `<defs>`/`<use>` per size step, grouped fills | < 0.5 MB per board |
| WebGL2 (P5) | Instanced superellipse quads, AA via `f/|∇f|`; **upload a value/tone texture, derive positions from the instance index**; one context per board | 500k dots @ 60 fps for **GPU-native IR fields**, 100k for CPU fields |
| Worker (P5) | The preset module runs in the worker; **transferable double buffers**; SharedArrayBuffer only where cross-origin isolation is acceptable (never embeds or MCP Apps) | Main-thread frame ≤ 2 ms |

### 3.12 Field IR (`dot`): promoted from moonshot to core (end of P3)
- **What it is:** a tiny pure expression language: arithmetic, `smoothstep`/`mix`/`sdf*`, `t`, `pointer`, `data.*` and bounded `for`. No closures over JS. Programs are serializable, sandboxed and size-bounded.
- **Compiles to:**
  - JS closures (CPU);
  - GLSL (WebGL2: the GPU path for 500k dots);
  - compact bytecode for an about-2 kB ESP32/WLED interpreter (devices run programs offline at device fps);
  - JSON inside the card spec (`bind` expressions with no `eval`, which keeps it CSP- and MCP-safe);
  - short-URL "Dwitter for dots".
- **Parity tests:** IR → JS and IR → GLSL must render identical golden hashes.
- **Scope:** new cards and spec bindings. Bespoke TS fields stay first-class; the spec carries them as **raster assets** (luma maps, baked heights).

---

## 4. Phases
Each phase:
- ships independently;
- ends with a **flagship board** built through the full §2.7 protocol;
- runs a **lift pass** over the weakest existing cards (§5);
- has hard exit gates.

Durations assume one developer plus agents. **Track L** (Perception Lab, about 20%) and **Track R** (research spikes) run in parallel from P1.

### P0 · Foundations, determinism, fidelity harness (2 wk)
1. **Hardening:**
   - H1 (cells clip), H3 (tests out of the engine, curated barrel), H4 (Draw resize), M7 (sampler guards);
   - non-mutating `bounded()`;
   - the cover-on-quantized fix;
   - `size` split from `lattice` for sites.
2. **Determinism:**
   - `hash32` replaces `fract(sin)` (codemod), with goldens re-baselined;
   - lint bans;
   - `FrameContext` + master clock + deterministic `t`, needed by `snap --film` (moved here from P1).
3. **Perf:** jitter fast path, SVG compaction, thermal/apps hot spots, the static cache, a scoped minute tick.
4. **Fidelity:**
   - all §2.6 instruments;
   - `STYLE-BIBLE.md`;
   - **the lattice ladder migration** (35 values become the 8-step ladder, exceptions logged);
   - accent `accentRole` annotation on every `active` layer (G2).
5. **Calibration:** score all 71 cards, prove rank validity, and get κ ≥ 0.6 on 20 cards. The output is the ranked "weakest 15".
6. **CI:** GitHub Action running tsc, lint, verify (+ liveness lint, G1–G3, G6), golden hashes and bench budgets.
7. **Error isolation** and **font registry** (M1). Text motion depends on it.

**Exit gates:**
- CI green;
- mosaic mount < 30 ms;
- board SVG < 0.5 MB;
- rank validity holds;
- κ ≥ 0.6;
- all cards carry a scorecard;
- goldens are cross-engine stable (Chromium + WebKit hashes match).

### P1 · Time: motion, states, choreography (2.5 wk)
**Flagship · "Departures."** A Swiss-transit split-flap board on live data (3×3):
- flap physics with an under-damped settle;
- `decode` on destinations;
- a platform-change ripple;
- **one red "boarding" row** (accent = live);
- clock seconds as a sweep with afterglow.

It is motion people screen-record, with a reason to exist.

**Engine:**
- SoA `DotBuffer` + pools;
- static/live split + liveness lint;
- buffer-level card enter/exit;
- keyed transitions, `coarsen`;
- data springs;
- the states API;
- masks, easing, `layoutText` + `decode`/`splitFlap`/`typewriter`;
- afterglow raster;
- the reduced-motion policy (every primitive falls back to an e→0 dissolve or a cut).

**App:**
- board choreography: a diagonal stagger with a Bayer reveal, about 400 ms, and *progressive sampling* hidden under the stagger;
- tab switching as an exit then an enter;
- the **Transition Lab** in the playground: A/B presets, mask, ease, duration, a `p` scrubber, filmstrip export.

**Card upgrades:**
- henry `home-clock` split-flap, unified numeral weight with `timer` (fixes board coherence);
- timer, music and fitness via data springs;
- message typewriter;
- audio meters with peak-hold afterglow;
- thermal shimmer;
- weather icon morph (the SDF morph uses the cached EDT).

**Lift pass:** `home-clock`, `weather`, `messages`, `settings`, `agent-status`, `word-play`, `codex-tokens` (§5).

**Exit gates:**
- 0 hard cuts in navigation;
- 71/71 cards enter;
- board p95 ≤ 8 ms **including enter**, at 30 fps, on the mid-tier profile;
- 0 GC pauses > 4 ms during a 10 s board loop;
- Departures: visual ≥ 20, life ≥ 10, and a user like.

### P2 · Touch: interaction and Components v2 (3 wk)
**Flagship · "Instrument."** One Teenage Engineering-style device spread across a 3×3 board with continuous chrome:
- 4 detented knobs;
- a crank (atan2 accumulation, tick count);
- an XY pad with trails (SimField);
- a 16-step sequencer with a playhead;
- transport;
- a level meter.

Multitouch via `pointers[]`. Sound is a Track R spike, not a gate.

**Engine:**
- `pointers[]`, `toLocal`, `focus`;
- `hit` as data + `pick`;
- **blend, moat and coverage raster** (moved here from P3: glow halos, focus rings and press insets need them);
- SimField (fixed rate, checkpoints) for ripple and trails;
- fx `fisheye` and `refract` with `maxDisplacement`;
- hover glow.

**App:**
- the a11y overlay (`role="group"`, real `<button>`/`<input type=range>`/`role=switch`, roving tabindex, 24/44 px targets, `aria-valuenow` from data);
- pointer capture;
- input → next rAF;
- `describe(ctx)` labels.

**Interaction grammar** (a DESIGN.md "Interaction" section with tokens for glow radius, press step, spring half-life, focus dash and hit pad):
- hover glow in value/mid, **never the accent**;
- press = one quantize step down (0.25 on unquantized styles), under-damped release;
- focus = marching dots;
- drag scrubs whole dot columns;
- long-press = a radial-reveal progress.

**Components v2** (extends the liked board, same vocabulary):

| Group | Components |
|---|---|
| Basic controls | toggle, segmented, slider (continuous/stepped), knob, crank, stepper, checkbox, radio |
| Navigation and lists | tabs, list + fisheye, chips |
| Progress | determinate and indeterminate, 8 loaders |
| Feedback and overlays | toast, notification stack, sheet |
| Input | keypad + ripple, dot text field (caret, typewriter echo, 5×7 keyboard), date wheel with inertia |

**Lift pass:** `henry-bear`, `sunburst`.

**Exit gates:**
- every component works by mouse, touch and keyboard;
- axe clean;
- `event.timeStamp` → end of the next draw ≤ 1 frame at p95 (display latency reported separately);
- Instrument: visual ≥ 20, life ≥ 10, and a user like.

### P3 · Space: depth, light, material, and the IR (3 wk)
**Flagships:**
- **"Cinema."** Nine film posters, each a hand-tuned `lumaSites` portrait or scene, with display type and one red narrative mark. Afterlight becomes a series. Motion: the projector-flicker lattice breathes and titles decode in.
- **"Levels."** Nine dot-native game worlds descended from level-03:
  - corridor, isometric room, side-scroller parallax, top-down maze, starfield warp;
  - title screen, game over, high score, boss.

  One coherent fiction exercising `scene3d`, fog, light and cell-snapped parallax.

**Engine:**
- the Raster light stack (§3.8): `scene3d`, `toneRamp`, `lumaSites`, `z` atmos/defocus, parallax, bloom;
- **materials as dot vocabularies:**
  - matte (Lambert);
  - gloss (spec two size steps up);
  - glass (refract the layer behind);
  - emissive (activeDim halo);
  - metal (environment stripes);
  - fabric (dither texture);
- **torch light** (pointer as L) and **board-wide light direction** (time of day);
- **Field IR v0:** parser, JS backend, GLSL backend, parity tests.

**Lift pass:** `silhouette`, `thermal-puppy`, `vision-camera`, `ev-charge`.

**Exit gates:**
- Cinema and Levels: average visual ≥ 20, and a user like on each;
- static scenes cached (< 1 ms re-sample);
- torch light ≤ 1 ms per frame;
- IR JS/GLSL parity on 20 test fields.

### P4 · Living: hero transitions, simulation, agents, live data (3 wk)
**Flagship · "Glyph."** A narrow, *finished* Nothing-style lock experience (replaces v1's sprawling Dot OS):
- an hourglass clock where sand settles into the digits; tilt flows it (DeviceOrientation);
- long-press shows a radial reveal;
- unlock via **shared-element migration** into one app;
- back via the reverse;
- an idle wallpaper (reaction-diffusion).

**Second flagship · "Agent Heartbeat"** (pulled forward from P6):
- an **agent presence vocabulary**: a closed set of tokenized animations for `thinking`, `tool-running`, `awaiting-approval`, `error` and `done`;
- agents write `ctx.data`/`state`, never draw;
- a living Lenia/RD organism that calms while thinking and pulses the single accent on `awaiting-approval`;
- shipped as an **MCP App** (`ui://dot-card`) rendering inline in Claude, ChatGPT and Copilot (verify the MCP Apps spec status before building);
- `describe(ctx)` lets agents *read* any board.

**Engine:**
- migration as site layers (Hilbert rank online, setup ≤ 8 ms);
- SDF morph (EDT cache);
- SimFields: falling sand, RD (Gray–Scott), Lenia, boids, Life, metaball notification blob.

**Live data:** 3 sources (weather, now playing, GitHub contributions) via a poll/webhook/websocket binding layer; every change animates through data springs.

**Live media:** a webcam mirror, using halftone ladder step 1–2 with STBN for temporal stability.

**Exit gates:**
- a 60 s Glyph recording with no drops at 30 fps;
- migration ≤ 4 ms per frame for 3k dots;
- Glyph and Agent Heartbeat each visual ≥ 20, life ≥ 10, and a user like.

### P5 · Reach: GPU, devices, display physics (3 wk)
**Flagship · "One Field, Five Surfaces."** The same timer, time-synced (shared master clock over BroadcastChannel), on:
- the browser;
- a Glyph Matrix (25×25 round mask) emulator;
- TRMNL e-ink with a ghosting simulation;
- a flip-disc simulation with disc inertia and clack;
- a pen-plotter preview.

**Engine and app:**
- the WebGL2 renderer (value texture, instance-index positions);
- worker sampling (transferables);
- **`DeviceProfile` + simulators** from Track L;
- `toDevice(spec, profile)` using variants or IR resampling plus per-device tone maps;
- targets:
  - Glyph Toy template;
  - TRMNL plugin (800×480 1-bit, blue-noise dither);
  - WLED DDP realtime (ESP32 matrices);
  - **IR bytecode on ESP32** (offline programs);
  - Tronbyt WebP;
  - AWTRIX MQTT;
- outputs:
  - OG/email endpoint (SVG → resvg);
  - GIF/APNG/MP4 (WebCodecs);
  - plotter SVG (the one physical demo).

**Exit gates:**
- 500k IR dots @ 60 fps and 100k CPU dots @ 60 fps;
- simulator vs photo of the real device HVS-SSIM ≥ 0.85 on 2 targets;
- 3 real targets demonstrated.

### P6 · Author and ecosystem (4 wk, then ongoing)
- **Card spec v1:**
  - generators + IR bindings + raster assets + states + transitions + theme tokens;
  - JSON Schema, validator, migrations, TS ↔ spec round-trip for the generator subset.
- **Dot Studio** (playground → editor):
  - layers with z/blend/tone;
  - generator inspector;
  - timeline (enter/change/exit, mask and ease curves);
  - a Rive-style state machine view;
  - binding UI;
  - **the live bar sheet and scorecard in the sidebar**;
  - one-click export to every P5 target.
- **AI authoring:**
  - prompt or reference image → **IR + spec**;
  - the agent runs §2.7 automatically: render → `fidelity` → critic with Bradley–Terry exemplars from the user's like/kill history → revise;
  - stops at the gate or after N rounds;
  - heroes still need a human like;
  - MCP server tools: `render_card`, `score_card`, `refine_card`, `push_to_device`, `describe_board`.
- **Distribution:**
  - `@dot480/core`, `@dot480/react`, a `<dot-card>` custom element;
  - a shadcn registry (Components v2 + widgets);
  - a **Figma** plugin (pick one; Framer deferred);
  - a README card service (GitHub contributions);
  - **"Dwitter for dots"**: an IR in the URL, REPL, scrubber, remix graph.
- **Launch vehicle:** an interactive essay, *"Ditherpunk for UI"* (Surma-style), embedding the five signature moments (§9).

**Exit gates:**
- `npm i @dot480/core` works;
- ≥ 60% of AI cards reach the ship gate within 4 rounds;
- κ(agent, human) ≥ 0.7.

**KPIs, not gates:** community cards, stars.

---

## 5. Lift backlog: weakest existing cards (from the design review)
| Card | Defect | Lift | Phase |
|---|---|---|---|
| `henry-bear` | Flat grey block; the bunny is illegible | Hand-authored 3-tone sprite (fur mid, muzzle light, eyes void); drop the bunny or make it a clear sprite on 1.6 | P2 |
| `silhouette` | Two-tone threshold, banding, figure is a blob | Halftone ladder step 2 (structure-aware); blue-noise sky; hand-masked figure edge | P3 |
| `thermal-puppy` | Grey ghost with no heat story | `toneRamp` heat, with the hot core in red (accent = hot); one hotspot readout | P3 |
| `sunburst` | Square grid patch at the centre | Concentric site disc + radially tapered rays | P2 |
| `vision-camera` | Objects unreadable, flat grey | Silhouette pass per object, tone-ramp lamp pool, bounding boxes snapped to objects | P3 |
| `ev-charge` | Car is a faint smear | Lambert-lit car rim from the cable side; the cable is the single red path | P3 |
| `home-clock`, `weather` | Thin 5×7 numerals beside `timer` | Smooth heroes on the ladder; one numeral weight per board | P1 |
| `messages`, `settings` | Doubled dotted borders; body text the size of the hero | One row style, mute body, one scale step down | P1 |
| `agent-status`, `word-play`, `codex-tokens` | Tiny heroes, empty middles, crude bars | Hero at 2.5; `dotBars` with peak-hold | P1 |
| All eyebrow labels | Lattice-1 labels read as dashed at 1× | Raise label dot size (G4); unify label size across boards | P0 |

---

## 6. Budgets (CI-enforced)
| Budget | Value |
|---|---|
| Board frame p95 (incl. enter, 30 fps tier) | ≤ 8 ms |
| Live card sample + render | ≤ 2 ms typical, ≤ 4 ms hero |
| Input → next draw | ≤ 1 frame (p95) |
| Board mount (progressive) | ≤ 30 ms to first frame |
| GC pauses during a 10 s loop | none > 4 ms |
| Memory per mounted board | ≤ 8 MB |
| SVG per board | < 0.5 MB |
| Canvas fills | UI ≤ 30 per card; photo cards use the atlas |
| Migration | setup ≤ 8 ms, frame ≤ 4 ms per 3k dots |
| GPU | 500k IR dots / 100k CPU dots @ 60 fps |
| App shell JS | ≤ 150 kB gzip; boards lazy-loaded |

## 7. Cross-cutting
- **Determinism:** `hash32`, lint bans, fixed-rate sims, input logs in ticks, cross-engine goldens.
- **Accessibility:**
  - reduced-motion fallbacks per primitive;
  - G6 photosensitivity;
  - the overlay for interactive cards;
  - `describe(ctx)`;
  - `--mute` ≥ 4.5:1;
  - focus never shown by the accent alone;
  - **lattice as an a11y dial**: low-vision mode re-resolves IR cards to coarser ladder tiers.
- **Docs:**
  - DESIGN.md gains Motion, Interaction, Depth, Material and Type-ladder token sections in the same PR as code;
  - STYLE-BIBLE.md;
  - the engine plan is updated;
  - stale docs are archived;
  - AGENTS.md is updated per the §11 decisions.
- **Testing:**
  - golden hashes + PNG diffs;
  - fast-check properties (fields in [0,1], bounds sound, glyphs on dots, `pick` correctness, determinism);
  - Playwright + axe for the overlay;
  - replay files for interaction;
  - the liveness lint.

## 8. Track L: Perception Lab (parallel from P1, about 20%)
1. **`DeviceProfile`** `{ lattice, mask, levels, gamma, psf/bloom, responseτ, ghosting, refresh, viewingDistance }`, plus **camera calibration**: photograph a physical panel and fit a gamma/uniformity LUT.
2. **HVS-SSIM** at viewing distance (CSF-filtered), used by `snap --ref` and `fidelity`.
3. **Halftone ladder** (each step graduates only if it beats the previous one on HVS-SSIM):
   1. linear-light + area-correct (√v radius, constant opacity) + blue noise + serpentine Floyd–Steinberg, then **variable-coefficient error diffusion** (Ostromoukhov 2001 / Zhou–Fang 2003; under 100 LOC);
   2. **structure-aware** (Pang 2008; the SAED variant, Chang 2009, is 2–3 orders of magnitude faster) for faces;
   3. **perceptual error optimization** (Chizhov et al. TOG 2022) driven by the profile's kernel, offline, for hero and photo cards;
   4. **differentiable multi-level halftoning** (EGSR 2025; DiffVG for optimizing `sites` and radii), offline Python tooling, with outputs as data assets.
4. **Display simulators:** e-ink ghosting (Ghostbuster, EMSOFT '24), LED PSF/bloom, flip-disc inertia, then **compensation** (pre-distort for ghosting).
5. **STBN** masks for webcam/video and sparkle-free dissolves (metric: temporal flicker energy).

## 9. Signature moments (built for X and HN, embedded in the launch essay)
1. **Hourglass Clock:** sand pours each minute and settles into the time digits; tilt the phone and it flows. *Built from:* SimField sand, `layoutText` digits as the attractor, DeviceOrientation, settle reveal.
2. **The Mirror that Heals:** a webcam halftone mirror (SAED + STBN, no shimmer). Swipe to scratch it and the image regrows. *Built from:* Track L halftone, afterglow, an NCA spike (Track R) or an RD fallback.
3. **One Field, Five Surfaces:** the P5 flagship.
4. **Agent Heartbeat:** the P4 flagship, mirrored to a phone's back-panel emulator.
5. **Torch in the Dark:** the level-03 corridor goes black and the cursor becomes a torch (Lambert on cached normals, fog, dust motes, cell-snapped parallax).

## 10. Track R: research spikes (≤ 1 wk each; graduate only on their metric)
| # | Spike | Metric to graduate |
|---|---|---|
| 1 | **Living fields:** RD → Lenia → Growing NCA (Mordvintsev 2020). Weights shipped as a `Uint8Array`; NCA on a 48² lattice or GPU | Regrowth recovers SSIM ≥ 0.9 at ≤ 4 ms per step |
| 2 | **Sliced-OT migration** (SPOT 2019), offline/worker | No visible crossings; quality vs Hilbert rank in a blind A/B |
| 3 | **Sonified UI:** each interaction's spring drives a Web Audio tick from the same parameters | Blind preference vs silent |
| 4 | **Multi-screen choreography:** a card flows phone → desktop → LED via BroadcastChannel/WebRTC with NTP-style clock sync | ≤ 1 frame drift over 60 s |
| 5 | **Tactile export:** Dot Pad 1-bit (an export path; the vendor APIs are native, not web) | Legibility with 3 blind testers |
| 6 | **Temporal super-resolution:** a 120 Hz hero/LED mode only (Didyk 2010 needs high refresh plus smooth pursuit) | Moving-text legibility A/B at 120 Hz |
| 7 | **MSDF** glyph/icon SDFs for morphs and CJK (5×7 bitmaps stay canonical) | Morph mid-frames free of corner collapse |
| 8 | **Generative editions:** seed → unique deterministic output (gallery/artist track) | One curated edition of 64 |

**Cut from v1** (with reasons):
- WebXR volumetric dots: off-thesis; the value lives in surfaces.
- Neural style capture: too little data; replaced by Bradley–Terry exemplars.
- Eye-tracked foveation: WebGazer error is about 100 px, roughly a whole card.
- Lottie export: thousands of shape layers make huge files.
- LEGO, cross-stitch and laser exports: the plotter stays as the one physical demo.
- 7 of 10 live sources: stocks and crypto are off-taste and become maintenance debt.
- Framer plugin.
- Screen-capture mirror.
- Designing around `navigator.vibrate` (no iOS support).

## 11. Decisions needed (recommendation first)
1. **Accent semantics:** one accent **hue** per board; multiple red elements are allowed only when each marks a live, hot or primary state (the mosaic precedent), enforced by `accentRole`. AGENTS.md and DESIGN.md:216 would be reworded to match.
2. **Quantization exemption:** scene and photo heroes may use `quantizeSteps: 0` (level-03 already does); UI elements stay quantized.
3. **Interaction states:** hover, focus and press allowed (DESIGN.md "no hover states" removed), and **never in the accent**.
4. **fps tiers:** 12 ambient / 30 transition / 60 hero and interaction, with a 60 Hz master clock.
5. **The type ladder** {0.72, 1, 1.3, 1.6, 2, 2.5, 3, 4}, with migration in P0.
6. **Field IR** as a core deliverable (end of P3), with the card spec built on it.
7. **Product track:** kit plus perception plus devices plus AI authoring (P0–P6), or kit only (P0–P3)?
8. **Package names** `@dot480/*`; **Tailwind** removed (effectively unused).

## 12. Timeline (indicative; one developer plus agents)
| Weeks | Main line | Parallel |
|---|---|---|
| 1–2 | P0 Foundations, determinism, harness | — |
| 3–5 | P1 Time → **Departures** | Track L: profile, HVS-SSIM, halftone step 1 |
| 5–8 | P2 Touch → **Instrument** | Track L: step 2; R1 RD/Lenia |
| 8–11 | P3 Space + IR v0 → **Cinema, Levels** | Track L: simulators; R2 OT |
| 11–14 | P4 Living → **Glyph, Agent Heartbeat** | R3 sound, R7 MSDF |
| 14–17 | P5 Reach → **Five Surfaces** | Track L: step 3, compensation |
| 17–21+ | P6 Author and ecosystem → **launch essay** | R4–R6, R8 |

---

## Appendix: critique log (v1 → v2)
| Critic | Finding | Change |
|---|---|---|
| Engine | Resolution-free claim false for TILE-authored presets | `authoredGrid` + `variants`; resampling only for IR cards (§0, §3.9) |
| Engine | Integer-lattice assertion fails the mosaic (0.72) | Scoped to `z`-defocus layers (§3.8) |
| Engine, Design | Accent rule contradicts AGENTS/DESIGN and the user's favourite board | Accent *hue* + `accentRole` semantics (G2, §11.1) |
| Engine | Pointwise fx can't do neighbourhood ops efficiently | `Raster` kind (§3.1) |
| Engine | Static/live split impossible with opaque closures | `layers()` / `live()` + `key/deps` + liveness lint (§3.3) |
| Engine | Field-level transitions re-sample every frame; layer identity undefined | Buffer-level enter/exit, keyed matching, data springs (§3.5) |
| Engine | 30 fps tier can't meet the 16 ms latency gate | 60 Hz master clock, input renders on the next rAF (§3.2) |
| Engine | Cover on the unquantized value leaves holes | Cover on quantized > 0 (§3.4) |
| Engine | `hit.sdf` closure not serializable or positionable | `hit` as data in card cells (§3.4) |
| Engine | Single pointer breaks multitouch | `pointers[]` + `toLocal` (§3.2) |
| Engine | SimField non-deterministic with variable dt | Fixed 60 Hz + checkpoints (§3.7) |
| Engine | Splatting migration into card pitch makes clusters | Migration as site layers (§3.5) |
| Engine | `fract(sin)` hash not cross-engine | `hash32` + re-baseline (§3.9) |
| Engine | GC from `DotInstance` objects kills the P1 gate | SoA moved into P1 (§3.10) |
| Engine | SAB needs COOP/COEP, which breaks embeds and MCP | Transferables by default (§3.11) |
| Engine | 500k dots CPU-infeasible | Value texture + IR on GPU; separate CPU/GPU gates |
| Engine | Card spec `bind` needs an evaluator, i.e. the DSL | IR promoted to core (§3.12) |
| Engine | Afterglow K-tap is 5× cost; Lambert 5 evals per dot | Decay raster; cached normals (§3.5, §3.8) |
| Engine | Sequencing: snap film/replay need the clock/pointer; blend needed by P2; states needed by P1 | Clock → P0; blend/moat → P2; states → P1; font registry → P0 |
| Engine | `role="img"` hides the overlay; minute tick re-samples all; no error isolation or memory budget | `role="group"`; scoped tick; try/catch per card; ≤ 8 MB per board |
| Design | Rubric equal-weight, circular, measures engineering | Gates + visual + life scores; rank validity + κ (§2) |
| Design | 35 lattice values, no type scale | Ladder gate G3 + P0 migration |
| Design | Eyebrow labels broken at 1× | G4 optical legibility |
| Design | Protocol converges on "competent" | v0 references, 3 variants, bar sheet, blur/silhouette views, screenshot-worthy question, kill veto, human like (§2.7) |
| Design | No codified taste | STYLE-BIBLE.md (§2.1) |
| Design | Showcases are phase demos | Departures, Instrument, Cinema, Levels, Glyph |
| Design | Weak cards unaddressed | Lift backlog (§5) |
| Vision | Still a better widget kit | Perceptual-compiler north star; `DeviceProfile`; IR to core; Track L |
| Vision | Agents are a big, cheap opportunity | Agent presence vocabulary + MCP App pulled into P4 |
| Vision | Hype items | Cut list (§10) |
| Vision | Moonshots unverified | Halftone ladder with citations and graduation metrics; spikes with metrics |
