# Dot/480 — Dot-Matrix UI Engine
### Full Technical Specification & Build Plan

---

## 0. Goal Recap

Build a single, config-driven rendering engine that can reproduce **every widget type** found across the 7 reference boards (Henry Li dashboards, DeerFlow Mosaic, DOT/480 style sheet) — pixel-for-pixel — and expose every visual parameter (dot density, dot size, dot shape, corner roundness, grid pitch, theme colors, canvas/SVG size) as live-tunable knobs. Ship as a copy-pasteable library (TS core + React wrapper) **and** an interactive playground for visual tuning + export (PNG / SVG / React snippet / HTML).

Core idea locked in previous step:

```
Generator (scalar Field) → Grid Sampler → Renderer (SVG | Canvas)
```

Everything below documents how each piece is actually built.

---

## 1. Repository / Module Structure

```
dot-matrix-engine/
├── packages/
│   ├── core/                     # zero-dependency TypeScript engine
│   │   ├── field/
│   │   │   ├── types.ts          # Field, GridConfig, DotStyle types
│   │   │   ├── polarField.ts     # rings, arcs, sunburst, dial
│   │   │   ├── bitmapFont.ts     # precomputed glyph grids (Latin + digits)
│   │   │   ├── cjkFallback.ts    # canvas-rasterized glyph → SDF fallback
│   │   │   ├── iconSDF.ts        # SVG path → rasterize → distance transform
│   │   │   ├── haltoneField.ts   # image → luminance/dither field
│   │   │   ├── waveformField.ts  # amplitude array → field
│   │   │   ├── splineField.ts    # Catmull-Rom path → field
│   │   │   ├── heatmapField.ts   # discrete grid/matrix values → field
│   │   │   ├── scatterField.ts   # Poisson-disc noise → field
│   │   │   └── projection3D.ts   # simple perspective grid → field
│   │   ├── sampler/
│   │   │   ├── gridSampler.ts    # walks field, emits DotInstance[]
│   │   │   ├── quantize.ts       # posterize/step function
│   │   │   └── jitter.ts         # organic randomness (seeded)
│   │   ├── renderer/
│   │   │   ├── svgRenderer.ts
│   │   │   ├── canvasRenderer.ts
│   │   │   └── shapePath.ts      # circle / square / squircle / superformula
│   │   ├── theme/
│   │   │   ├── tokens.ts         # colors, spacing, defaults
│   │   │   └── presets.ts        # "dot480", "deerflow-mosaic", "mono"
│   │   └── index.ts
│   ├── widgets/                  # Phase-7 presets, one file per reference card
│   │   ├── clock.ts, timer.ts, weatherCard.ts, musicPlayer.ts,
│   │   │   fitnessRings.ts, messagesList.ts, cameraViewfinder.ts,
│   │   │   settingsList.ts, systemStats.ts, evCharge.ts,
│   │   │   thermalMonitor.ts, sleepChart.ts, miniGame.ts,
│   │   │   aiAssistantChat.ts, visionCamera.ts, agentStatus.ts,
│   │   │   metroLine.ts, gaugeSpeed.ts, ecgMonitor.ts, ... (35 total)
│   │   └── index.ts
│   ├── react/
│   │   ├── DotCanvas.tsx         # low-level: <DotCanvas field={...} config={...}/>
│   │   ├── DotWidget.tsx         # high-level: <DotWidget type="clock" .../>
│   │   ├── useDotField.ts        # hook: recompute field on prop change (memoized)
│   │   └── ThemeProvider.tsx
│   └── image-tools/
│       └── photoDotify.ts        # client-side upload → dither → field
├── apps/
│   └── playground/                # Vite + React + Tailwind app
│       ├── src/
│       │   ├── ControlsPanel.tsx  # sliders: density, dot size, shape, corner, theme
│       │   ├── PreviewCanvas.tsx
│       │   ├── WidgetGallery.tsx  # all 35 presets, click to load into editor
│       │   ├── ExportPanel.tsx    # PNG / SVG / React code / HTML export
│       │   └── store.ts           # zustand state
│       └── vite.config.ts
└── docs/
    └── (this file, API reference, glyph atlas docs)
```

---

## 2. Core Data Types

```ts
// field/types.ts

/** A Field is just a function: given a normalized (u,v) in [0,1]^2,
 *  return a value in [0,1] representing "dot presence/intensity" here. */
export type Field = (u: number, v: number) => number;

export interface GridConfig {
  cols: number;              // horizontal dot count
  rows: number;              // vertical dot count
  pitch?: number;            // px between dot centers (derived if omitted)
  aspect?: number;           // widget aspect ratio, default 1
}

export interface DotStyle {
  shape: 'circle' | 'square' | 'squircle' | 'superformula';
  sizeMin: number;           // px, value=0
  sizeMax: number;           // px, value=1
  sizeCurve?: (t: number) => number; // easing/gamma applied to field value
  cornerRoundness?: number;  // 0 (sharp) .. 1 (circle) — squircle exponent map
  opacityMode?: 'constant' | 'fromValue';
  jitter?: number;           // 0..1, positional noise amount
  quantizeSteps?: number;    // e.g. 4 → posterized dot sizes (chunkier LED look)
}

export interface ThemeTokens {
  bg: string;                // #070809
  surface: string;           // #111315
  dotIdle: string;           // #8A8F98
  dotActive: string;         // #FF3B30 (red accent)
  gridPx: number;            // base grid unit, default 4
  cornerRadiusCard: number;
}

export interface DotInstance {
  x: number; y: number;      // px position
  r: number;                 // radius/half-size
  opacity: number;
  color: string;
}
```

---

## 3. Generators — Algorithms, Math, and Why Each Was Chosen

### 3.1 Bitmap Dot-Font (`bitmapFont.ts`)
- **What**: hand-authored 5×7 grid for digits/uppercase Latin, matching the reference's blocky look exactly (this is *not* a generic font rasterization — dot-matrix numerals have a very specific, standardized bitmap shape going back to Hitachi HD44780 LCD character sets; we reuse that lineage for authenticity).
- **Data structure**: `Record<string, boolean[][]>` — one boolean grid per glyph, cached as a static table (~2KB total).
- **Why not runtime SDF for this**: at small sizes (7-dot-tall digits), a hand-tuned bitmap always looks crisper than a rasterized-then-thresholded TTF glyph. This is the single biggest fidelity win for near-zero cost.
- **Kerning**: fixed-width cell + 1-dot gutter, matches reference spacing.

### 3.2 CJK / Extended-Glyph Fallback (`cjkFallback.ts`)
- **Finding**: rather than build a second font system for Chinese/Japanese/emoji (needed for the "开始吧" interpreter widget), reuse the **icon SDF pipeline** (3.4) — render the glyph with a real webfont (e.g. Noto Sans SC) onto an offscreen canvas, read back the alpha channel, run it through the same distance-transform + grid sampler as icons. **One algorithm, two use-cases** — this is the key simplification versus building bespoke CJK bitmap fonts.

### 3.3 Polar / Radial Field (`polarField.ts`)
- **Math**: for a widget center `(cx,cy)`, convert each grid cell to polar `(r,θ) = (√((u-cx)²+(v-cy)²), atan2(v-cy, u-cx))`.
- **Sub-generators, all built from the same `(r,θ)` pair**:
  - **Ring/arc/gauge**: `field = 1` if `rInner < r < rOuter AND θ within [θStart, θStart+sweep]`, else falloff via smoothstep at the boundary for anti-aliased edges. Sweep angle = `progress * 2π` for progress rings (fitness, timer, battery).
  - **Sunburst**: `field = 1` if `(θ mod (2π/N)) < spokeWidth`, radius modulated by `r` for the "rays fading outward" look.
  - **Concentric breathing rings**: `field = |sin(r * frequency - phase)|` raised to a power for sharp thin rings; `phase` animates over time for the "inhale" pulse.
  - **Dial/knob**: ring + a single marker dot at `θ = value * 2π`.
- **Caveat**: angle wrap-around at `θ = ±π` needs explicit handling for arcs that cross the 12 o'clock mark (e.g. a progress ring starting at 270°) — normalize with `((θ - start + 2π) % 2π)`.

### 3.4 Icon SDF Pipeline (`iconSDF.ts`)
1. Rasterize the source (SVG path or font glyph) onto an offscreen canvas at 4× target resolution (supersampling for cleaner distance field).
2. Read alpha channel → binary mask.
3. Run **exact Euclidean distance transform** using the **Felzenszwalt–Huttenlocher algorithm** (1D squared-distance transform applied twice, along rows then columns) — O(n) per dimension, simple to implement in plain JS, no dependencies. (Alternative considered: Jump Flooding Algorithm — better suited to GPU/WebGL real-time deformation, which we don't need since icons are static; EDT is simpler and exact.)
4. Signed distance = `distance-inside − distance-outside`.
5. Cache the resulting `Float32Array` per icon (keyed by icon id + resolution) so it's computed once, sampled many times as density/size change.
- **Why SDF at all instead of just rasterizing straight to dots**: SDF gives sub-pixel accurate edges at *any* dot density — zoom the grid pitch in or out and the icon silhouette stays clean, because the sampler re-thresholds the same continuous field rather than re-rasterizing a coarse bitmap.

### 3.5 Photo Halftone (`haltoneField.ts`) — built now per your priority call
1. Client-side only (privacy: no upload leaves the browser) — draw the user's image to an offscreen canvas, downsample to the target grid resolution using canvas's built-in bilinear filtering.
2. Convert each cell to luminance: `L = 0.2126R + 0.7152G + 0.0722B` (Rec. 709 coefficients — perceptually correct grayscale, not a flat average).
3. Two dithering modes, selectable:
   - **Ordered/Bayer dithering** (4×4 or 8×8 threshold matrix) — gives the clean, structured halftone-grid look matching the "silhouette" and "portrait" reference images.
   - **Floyd–Steinberg error diffusion** — gives a softer, more organic/noisy look (closer to the "binary sunset" texture); errors propagated to right/below-left/below/below-right neighbors at 7/16, 3/16, 5/16, 1/16.
4. Map dithered value → dot radius (not just on/off) for a richer look than pure 1-bit dithering — this is a deliberate deviation from textbook dithering (which targets binary printers) since we have continuous dot-size available.
- **Tweak found**: applying a mild **gamma boost (≈1.4)** to luminance before dithering better preserves midtone detail at low grid resolutions (≤64×64) — straight linear luminance loses faces/features at these densities.
- **Caveat**: very low grid resolution (<32 cols) + high-detail photos (faces) → unrecognizable without the gamma tweak and a small pre-blur (box blur, radius 1) to reduce aliasing/moiré before sampling.

### 3.6 Waveform Field (`waveformField.ts`)
- Input: `number[]` amplitudes (from Web Audio `AnalyserNode.getByteFrequencyData` for real audio, or a procedural `sin(t*f1) + 0.4*sin(t*f2+φ)` sum-of-sines for demo/static states).
- Field = distance from each cell to the nearest amplitude-bar top, smoothstepped for a soft bar edge.
- **EKG variant**: same field type but amplitudes come from a **synthetic ECG waveform function** (piecewise: P-wave = small Gaussian bump, QRS = sharp Gaussian derivative spike, T-wave = wider Gaussian) rather than random noise — real heart-rate monitors don't look like audio waveforms, and matching that shape is what sells the "medical monitor" widget.

### 3.7 Spline Field (`splineField.ts`)
- **Catmull-Rom spline** through control points → sampled at fine `t` steps → each sample becomes a field "seed"; grid cells near a seed get high value (distance-to-nearest-sample, smoothstepped).
- Chosen over cubic Bezier because Catmull-Rom passes *through* all control points (no manual handle-tuning needed) — important since chart data points must be hit exactly (lap-time deltas, sales curves).
- **Caveat**: Catmull-Rom can overshoot ("ring") on data with sharp direction changes; clamp tangents (Catmull-Rom variant with tension parameter, default 0.5) to tame this for volatile data like stock/retail charts.

### 3.8 Heatmap/Grid Field (`heatmapField.ts`)
- Direct 2D array → field, no interpolation (nearest-cell lookup). Used for sleep-stage blocks, floor-plan occupancy, notification-dot grids, CPU/system bars (a bar is just a 1×N heatmap row).

### 3.9 Scatter Field (`scatterField.ts`)
- **Bridson's Poisson-disc sampling algorithm** (2007) — generates evenly-spaced-but-randomized points with a minimum distance constraint, which is what makes star fields and password-dot rings look "randomly scattered" without ever clumping or leaving obvious gaps (naive `Math.random()` scatter clumps badly at low point counts).
- Seeded PRNG (mulberry32) so the same "random" scatter is reproducible for a given seed — needed for consistent exports.

### 3.10 3D Projection Field (`projection3D.ts`)
- Minimal perspective projection: `screenX = focalLength * worldX / worldZ`, corridor walls defined as a receding rectangle grid, sampled into dot positions with size falling off by `1/z` (closer dots bigger — matches the maze-game reference).
- Deliberately not a full 3D engine — just enough matrix math for one-point-perspective corridors, since that's the only 3D case in the reference set.

---

## 4. Grid Sampler — the piece that unifies everything

```ts
// sampler/gridSampler.ts
function sampleField(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] {
  const dots: DotInstance[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const u = col / (grid.cols - 1);
      const v = row / (grid.rows - 1);
      let value = field(u, v);                       // 0..1
      if (style.quantizeSteps) value = quantize(value, style.quantizeSteps);
      const eased = style.sizeCurve ? style.sizeCurve(value) : value;
      const r = lerp(style.sizeMin, style.sizeMax, eased);
      const [px, py] = applyJitter(cellToPx(col, row, grid), style.jitter);
      dots.push({ x: px, y: py, r, opacity: value, color: colorFor(value, theme) });
    }
  }
  return dots;
}
```

- **Quantization** (`quantize.ts`) — posterizes the continuous field into N discrete size steps. This is what gives the reference images their authentic "hardware LED" chunkiness rather than a smooth photographic gradient. Default N=5 for UI widgets, N=∞ (off) for photo halftones where smooth gradation looks better.
- **Jitter** — small seeded positional noise, used only for the scatter/star fields; zero everywhere else (UI elements must stay grid-locked).
- **Corner roundness knob**: implemented via the **superellipse / squircle formula** `|x/a|^n + |y/b|^n = 1`. `n=2` = perfect circle, `n→∞` = perfect square, `n≈4` = the "squircle" look (iOS-style) — this single exponent, exposed as the "roundness" slider, smoothly interpolates dot shape from square → squircle → circle, which is a nicer UX than a boolean shape switch.
- **Advanced-but-deferred**: Gielis **superformula** (generalizes superellipse to N-fold symmetric shapes — stars, hexagons, flowers) as an optional `shape: 'superformula'` mode for a future "fun/decorative" theme. Flagged as deferred to avoid scope creep — the squircle covers 95% of real needs.

---

## 5. Renderers

### 5.1 SVG Renderer
- One `<circle>`/`<rect>`/`<path>` per dot, grouped in a single `<svg>`.
- Pros: crisp at any zoom, directly exportable/copy-pasteable, themeable via CSS custom properties (`--dot-color`, `--dot-bg`), trivially convertible to PNG (draw to canvas, `toDataURL`).
- **Caveat / performance ceiling**: past ~2,000–3,000 DOM nodes, SVG render and re-render (for animated widgets) gets noticeably slow, especially on mobile Safari. 

### 5.2 Canvas Renderer
- Batched `ctx.arc()`/`ctx.rect()` fill calls, no DOM nodes — handles 10,000+ dots at 60fps.
- Used automatically for: photo halftones, the maze game, dense star fields, any widget with live animation (waveforms, agent "thinking" pulse).

### 5.3 Auto-select rule
```ts
renderer = dotCount > 2000 || widget.animated ? 'canvas' : 'svg';
```
User can override per-widget in the playground, but this default matches every reference widget correctly (static text/icon cards → SVG for copy-paste-ability; photos/waveforms/games → canvas for performance).

---

## 6. Theming System

```ts
// theme/tokens.ts
export const dot480: ThemeTokens = {
  bg: '#070809', surface: '#111315',
  dotIdle: '#8A8F98', dotActive: '#FF3B30',
  gridPx: 4, cornerRadiusCard: 16,
};
```
- All widget presets reference tokens, never hardcoded hex values — swapping `theme` prop reskins every widget at once (e.g. a "DeerFlow Mosaic" warm-amber-hero theme vs. the flat "DOT/480" mono theme, both already present across your references).
- Exposed as CSS custom properties too, so pure-HTML/CSS export (no JS) still supports theme swapping via a `data-theme` attribute.

---

## 7. React API

```tsx
// low-level
<DotCanvas field={polarField({...})} grid={{cols:40, rows:40}} style={{...}} theme={dot480} />

// high-level (Phase 7 presets)
<DotWidget
  type="fitnessRings"
  density={4}          // grid pitch multiplier
  dotShape="squircle"
  roundness={0.7}
  size={{ w: 320, h: 320 }}
  theme="dot480"
  data={{ move: 62, exercise: 40, stand: 80 }}
/>
```
- `useDotField` hook memoizes field computation keyed on props — recompute only what changed (e.g. dragging the density slider shouldn't re-run the icon distance-transform, only the sampler).

---

## 8. Playground App (built in parallel, per your call)

- **Stack**: Vite + React + Tailwind + zustand (small, no Redux ceremony needed for this state shape).
- **Panels**:
  - `WidgetGallery` — all 35 presets as thumbnails, click to load into editor.
  - `ControlsPanel` — sliders/toggles for: grid density, dot size min/max, shape, roundness, jitter, quantize steps, theme picker, canvas size, animation on/off.
  - `PreviewCanvas` — live render, checkerboard-transparent background toggle.
  - `ExportPanel` — buttons: **PNG** (canvas→dataURL), **SVG** (serialize DOM), **React snippet** (codegen the exact `<DotWidget .../>` call with current prop values), **HTML/CSS** (static, no-JS export using inline SVG).
  - `PhotoUpload` — drag-drop image → auto-runs halftone pipeline → drops into a widget slot as a `photoField` source, all client-side (no server round-trip).

---

## 9. Dependencies (deliberately minimal)

| Package | Used for | Why this one |
|---|---|---|
| *(none)* | core engine | zero-dependency by design — pure math/canvas/SVG, portable to any framework or even vanilla JS embed |
| `zustand` | playground state | tiny (~1kb), no boilerplate vs Redux |
| `tailwindcss` | playground styling only | fast iteration on the control panel UI; never used in exported widget output |
| `file-saver` | export downloads | trivial blob-download helper |
| Web Audio API (native) | optional real-mic waveform mode | no library needed, built into browser |
| Google Fonts: Noto Sans SC (loaded on demand) | CJK glyph fallback rasterization source | only fetched if a CJK glyph is requested, keeps default bundle small |

No charting library, no icon library, no font library beyond the one CJK fallback font — everything else is generated by our own field/sampler/renderer pipeline. This is intentional: the whole point of the SDF+field architecture is that dependencies don't compound as widget count grows.

---

## 10. Algorithm Reference Sheet (names, for your own further reading)

- **Felzenszwalt–Huttenlocher exact distance transform** (2004) — icon SDF generation
- **Bayer ordered dithering** (4×4/8×8 threshold matrices) — structured halftone
- **Floyd–Steinberg error diffusion** (1976) — organic halftone alternative
- **Catmull-Rom splines** (with tension parameter) — chart/path smoothing
- **Bridson's Poisson-disc sampling** (2007) — even-but-random scatter (stars, decorative dots)
- **Superellipse / squircle formula** (Lamé curve, generalized by Piet Hein) — continuous square↔circle roundness knob
- **Gielis superformula** (1997) — optional future N-fold decorative dot shapes (deferred)
- **Smoothstep / quantize (posterize)** — standard shader-toolkit functions, used everywhere edges need anti-aliasing or chunkiness respectively
- **One-point perspective projection** — basic `x' = f·x/z` — corridor/maze widget
- **Rec. 709 luminance coefficients** (0.2126/0.7152/0.0722) — correct grayscale for photo halftone, not naive RGB average

---

## 11. Findings / Tweaks Beyond "Textbook" Versions

1. **Continuous dot-size dithering** (not 1-bit) — textbook Bayer/Floyd-Steinberg targets binary printers; we map the dithered value to a *continuous* dot radius, giving noticeably richer photo halftones than a pure black/white dot pattern.
2. **Gamma-boosted luminance (~1.4)** before halftone dithering — preserves facial/detail recognizability at low grid densities (<64 cols), which straight linear luminance loses.
3. **CJK-glyph-as-icon reuse** — instead of a second font system, feed extended glyphs through the icon SDF pipeline. Cuts a whole subsystem down to a config flag.
4. **Squircle exponent as the single "roundness" control** — smoothly unifies what would otherwise be a shape enum + separate corner-radius value into one intuitive slider.
5. **EKG uses a purpose-built Gaussian-composite waveform function**, not the same noise generator as audio waveforms — visually distinct medical-monitor shape "for free" from a different field function, same renderer.
6. **Auto renderer selection by dot-count/animation** — avoids the single most likely performance foot-gun (thousands of animated SVG nodes) without the user needing to think about it.
7. **Clamped-tension Catmull-Rom** — prevents spline overshoot/ringing on volatile chart data (a known weakness of vanilla Catmull-Rom).

---

## 12. Caveats & Known Limitations

- **SVG DOM limits**: hard ceiling around 2–3k live dot nodes before jank on low-end/mobile — mitigated by auto-canvas-fallback, but a user who forces SVG on a dense widget will see it.
- **CJK coverage**: only glyphs present in the loaded webfont subset rasterize correctly; extremely rare Unicode (emoji-ZWJ sequences, etc.) may rasterize as tofu boxes — acceptable for v1, flagged for later font-subset expansion.
- **Low-density photo halftones lose detail**: below ~32×32 grid, most photos become abstract regardless of dithering tweaks — this is a hard information-theoretic limit, not a bug to fix.
- **Distance-transform cache memory**: each cached icon SDF at 4× supersampling for a 64×64 grid is ~16KB (`Float32Array`); fine for dozens of icons, would need an LRU eviction policy if the icon library grows into the hundreds.
- **Animation cost**: any widget with a live field recompute (waveform, breathing rings, agent pulse) should throttle to ~30fps on canvas rather than 60fps — visually indistinguishable for this style of chunky LED animation, meaningfully cheaper on battery/mobile.
- **Color contrast**: the reference palette (grey dots on near-black, red accent) is quite low-contrast by WCAG standards — fine for a stylized dashboard aesthetic, worth flagging if this ever needs to be an accessible production UI rather than a design showcase.
- **Client-side photo processing**: keeps user photos private (never uploaded), but means processing speed depends on the user's device — large images should be downscaled before the luminance/dither pass to avoid UI-thread jank (do the initial downsample in a `requestIdleCallback` or a Web Worker for big files).
- **Squircle rendering in SVG**: true superellipse curves aren't a native SVG primitive — approximated via a cubic-bezier fit (standard technique, small but nonzero deviation from the exact curve; imperceptible at UI sizes).

---

## 13. Build Phases (execution order)

| Phase | Deliverable |
|---|---|
| 0 | Core types, grid sampler, SVG + Canvas renderers, theme tokens |
| 1 | Bitmap dot-font (Latin/digits) + CJK fallback via icon pipeline |
| 2 | Polar field: rings, arcs, gauges, sunburst, dial, breathing circles |
| 3 | Icon SDF pipeline (EDT) + first icon set (weather, settings, car, cube, logo) |
| 4 | Photo halftone (Bayer + Floyd–Steinberg) + client-side upload flow |
| 5 | Waveform, spline, heatmap/grid fields |
| 6 | Scatter (Poisson-disc) + 3D projection (maze) |
| 7 | All 35 widget presets assembled from Phases 0–6 |
| 8 | Playground app (in parallel from Phase 1 onward): controls, gallery, export |

Next step: start Phase 0 + Phase 1 as a working code artifact — the core engine skeleton plus the bitmap font, since every other phase depends on the sampler/renderer contract being solid first.