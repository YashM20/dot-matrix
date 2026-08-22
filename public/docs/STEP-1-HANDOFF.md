# STEP 1 HANDOFF — Foundation (Phases 0–4)

You are building the **core rendering engine** for Dot/480, inside the existing Vite + React + shadcn app that's already scaffolded in this repo. Do not restructure the project, do not create a monorepo, do not add new top-level folders outside `src/`. Do not skip ahead to widgets or the playground UI — Step 2 (a separate handoff doc) covers that.

## Read these files first, in this order
1. `DOT-MATRIX-ENGINE-PLAN.md` — the full architecture. This document is your checklist; that document is your reference for *how* to build each piece.
2. `DESIGN.md` — exact colors, sizes, and component names. Never invent a color or size not in this file.
3. `AGENTS.md` — rules you must never break.
4. `src/index.css` — this already has the Dot/480 theme tokens wired in (`--bg`, `--accent`, etc). Use these, don't redefine them.

If anything in this handoff conflicts with those files, **those files win**. Stop and flag the conflict instead of guessing.

## Ground rules
- Everything you build in this step lives under `src/engine/` and `src/lib/photoDotify.ts`. Nothing else in the repo needs to change.
- `src/engine/` must have **zero npm dependencies**. Not even a small utility library. Pure TypeScript, browser Canvas/SVG APIs only. This folder must never `import` from `react`, `src/components/`, or any npm package.
- Every visual must go through the pipeline: **Field → Grid Sampler → Renderer**. Never write a one-off drawing function for a specific widget in this step — you are not building widgets yet, only the machinery that will render them in Step 2.
- Use exactly the type and function names given below. Do not rename them, even if you think a different name is clearer — Step 2 imports these by exact name.
- Do not add a second accent color anywhere. The only accent is `--accent` / `{colors.dotActive}` (`#FF3B30`).

## Setup
No new project init needed — the app already exists. Just create the folders:
```bash
mkdir -p src/engine/fields src/engine/sampler src/engine/renderer src/engine/theme
```

---

## Phase 0 — Core types, sampler, renderers, theme tokens

**File: `src/engine/types.ts`**
```ts
export type Field = (u: number, v: number) => number;

export interface GridConfig {
  cols: number;
  rows: number;
  pitch?: number;
  aspect?: number;
}

export interface DotStyle {
  shape: 'circle' | 'square' | 'squircle' | 'superformula';
  sizeMin: number;
  sizeMax: number;
  sizeCurve?: (t: number) => number;
  cornerRoundness?: number;
  opacityMode?: 'constant' | 'fromValue';
  jitter?: number;
  quantizeSteps?: number;
}

export interface ThemeTokens {
  bg: string;
  surface: string;
  dotIdle: string;
  dotActive: string;
  gridPx: number;
  cornerRadiusCard: number;
}

export interface DotInstance {
  x: number; y: number;
  r: number;
  opacity: number;
  color: string;
}
```

**File: `src/engine/sampler/gridSampler.ts`**
- [ ] `sampleField(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[]` — walk every cell, call `field(u,v)`, apply quantize → sizeCurve → lerp to radius. See PLAN.md §4 for the exact loop.

**File: `src/engine/sampler/quantize.ts`**
- [ ] `quantize(value: number, steps: number): number` — posterize a 0–1 value into `steps` discrete levels.

**File: `src/engine/sampler/jitter.ts`**
- [ ] `applyJitter(pos: [number,number], amount: number, seed: number): [number,number]` — use a seeded PRNG (mulberry32, ~6 lines inline, no library) so results are reproducible.

**File: `src/engine/renderer/shapePath.ts`**
- [ ] Circle, square, and **squircle** (superellipse `|x/a|^n + |y/b|^n = 1`, approximated with a cubic-bezier fit for SVG) path generators.
- [ ] Leave `superformula` as a stub that throws `"not implemented — deferred, see DESIGN.md Known Gaps"`. Do not implement it.

**File: `src/engine/renderer/svgRenderer.ts`**
- [ ] `renderSVG(dots: DotInstance[], width: number, height: number): string` — returns a serialized `<svg>...</svg>` string, one shape element per dot.

**File: `src/engine/renderer/canvasRenderer.ts`**
- [ ] `renderCanvas(ctx: CanvasRenderingContext2D, dots: DotInstance[]): void` — batched `ctx.arc`/`ctx.rect` fill calls.

**File: `src/engine/theme/tokens.ts`**
- [ ] Define `dot480: ThemeTokens` using the values already in `src/index.css`'s `.dark` block: `bg: '#070809'`, `surface: '#111315'`, `dotIdle: '#8A8F98'`, `dotActive: '#FF3B30'`, `gridPx: 4`, `cornerRadiusCard: 16`.

**Acceptance test**: a throwaway script with a `Field` returning `0.5` everywhere, sampled on a 10×10 grid, rendered with both renderers, produces 100 evenly-spaced grey dots in each. Don't proceed until this works.

---

## Phase 1 — Bitmap dot-font + CJK fallback

**File: `src/engine/fields/bitmapFont.ts`**
- [ ] `Record<string, boolean[][]>` covering digits `0-9`, uppercase `A-Z`, punctuation `: . % - / →`, each a 5×7 boolean grid (PLAN.md §3.1). Use a public-domain 5×7 LCD/dot-matrix font reference for the dot pattern — don't invent glyphs.
- [ ] `textField(str: string): Field` — lays out glyphs left to right, 1-dot gutter.

**File: `src/engine/fields/cjkFallback.ts`**
- [ ] `glyphFieldFromFont(char: string, fontFamily: string): Field` — draws the char to an offscreen canvas, reads alpha, reuses the icon SDF pipeline built in Phase 3 (fine if this file is only finished after Phase 3).

**Acceptance test**: render `"14A"` and visually confirm it matches the reference boarding-pass numeral style.

---

## Phase 2 — Polar field (rings, arcs, gauges, sunburst, dial, breathing circles)

**File: `src/engine/fields/polarField.ts`**
- [ ] `ringField(cx, cy, rInner, rOuter, thetaStart, sweep): Field` — smoothstep at radius and angle boundaries. Handle angle wrap-around at `±π` explicitly (PLAN.md §3.3) — test with a ring starting at 270°.
- [ ] `sunburstField(cx, cy, spokeCount, spokeWidth): Field`
- [ ] `concentricRingsField(cx, cy, frequency, phase): Field` — `phase` is passed per frame; no timers inside this file.
- [ ] `dialField(cx, cy, rOuter, valueAngle): Field`

**Acceptance test**: render `ringField` at 65% sweep, confirm it matches the "247W"/"32.4 KM/H" gauge style — clean anti-aliased edges, no jagged cutoff.

---

## Phase 3 — Icon SDF pipeline

**File: `src/engine/fields/iconSDF.ts`**
- [ ] `rasterizeToMask(svgPathOrGlyph, resolution): Uint8ClampedArray` — offscreen canvas at 4× target resolution, return alpha channel as binary mask.
- [ ] `distanceTransform(mask, width, height): Float32Array` — **Felzenszwalt–Huttenlocher exact distance transform**. Not Jump Flooding Algorithm — that's for GPU/real-time, which we don't need.
- [ ] `iconField(distanceField, width, height): Field`
- [ ] Cache in a `Map<string, Float32Array>` keyed by `iconId + resolution`.
- [ ] Small icon set as SVG path string constants (in this file or `src/engine/fields/iconPaths.ts`): cloud, car outline, leaf, deer/antler mark, wireframe cube. No icon library.

**Acceptance test**: rasterize the cloud icon at 16×16, 32×32, 64×64 grid densities — silhouette stays clean at all three.

---

## Phase 4 — Photo halftone

**File: `src/engine/fields/haltoneField.ts`**
- [ ] `imageToLuminanceField(imageData: ImageData): Field` — Rec. 709: `L = 0.2126R + 0.7152G + 0.0722B`. Not a flat RGB average.
- [ ] Gamma boost ~1.4 before dithering (PLAN.md §3.5 — preserves facial detail at low grid density).
- [ ] Small box blur (radius 1) before sampling, to reduce moiré.
- [ ] `bayerDither(field, matrixSize: 4 | 8): Field`
- [ ] `floydSteinbergDither(imageData): Field` — error diffusion (7/16, 3/16, 5/16, 1/16). Sequential/stateful internally, but exposes a `Field`-shaped result once precomputed.
- [ ] Map dithered value → continuous dot radius, not just on/off (deliberate deviation from textbook 1-bit dithering, PLAN.md §3.5 finding #1).

**File: `src/lib/photoDotify.ts`**
- [ ] `dotifyUpload(file: File, gridConfig: GridConfig, ditherMode: 'bayer' | 'floyd-steinberg'): Promise<Field>` — `FileReader` → canvas → downsample → halftone. **100% client-side, no server upload, ever** — this is a stated privacy requirement.
- [ ] Downscale large images (>2MB) before processing; use `requestIdleCallback` or a Web Worker if possible to avoid blocking the main thread.

**Acceptance test**: upload a real face photo, run both dither modes at 64×64 — face still recognizable in both. At 24×24 it becomes abstract — that's expected per PLAN.md §12, not a bug.

---

## Definition of done for Step 1
- [ ] All five phases' acceptance tests pass.
- [ ] `src/engine/` imports zero npm packages and zero React.
- [ ] Every exported function name matches exactly what's specified above.
- [ ] You have NOT built: widget presets, `DotCanvas`/`DotWidget` components, the playground UI, waveform/spline/heatmap/scatter/3D fields. Those are Step 2 — stop if you find yourself building any of them.

## What Step 2 will expect from you
Step 2 imports directly from `src/engine/` using the exact function names above. Before finishing, confirm every function listed exists, is exported, and matches its signature exactly. A single barrel file `src/engine/index.ts` re-exporting everything is a nice-to-have but not required.
