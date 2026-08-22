# STEP 2 HANDOFF — Widgets, Playground UI, Export (Phases 5–8)

You are finishing the Dot/480 engine inside the existing Vite + React + shadcn app: the remaining field generators, all 35 widget presets, the React wrapper components, and the in-app playground/control panel. Everything lives in `src/` — no monorepo, no separate packages, no new top-level folders.

## Read these files first, in this order
1. `DOT-MATRIX-ENGINE-PLAN.md` — full architecture reference.
2. `DESIGN.md` — exact colors, sizes, component names. Never invent a value not in this file.
3. `AGENTS.md` — rules you must never break.
4. `src/index.css` — actual theme token values, already wired in.
5. `STEP-1-HANDOFF.md` — what was already built. **Read this even though you're not doing this work** — it tells you the exact function names and file locations you'll be importing from.

If anything here conflicts with those files, **those files win**. Stop and flag the conflict instead of guessing.

## Before you write any code
Verify Step 1 is actually complete — check every file below exists in the repo. If any are missing, stop and say so; do not rebuild Step 1's work yourself.

```
src/engine/types.ts
src/engine/fields/bitmapFont.ts
src/engine/fields/cjkFallback.ts
src/engine/fields/polarField.ts
src/engine/fields/iconSDF.ts
src/engine/fields/haltoneField.ts
src/engine/sampler/gridSampler.ts
src/engine/sampler/quantize.ts
src/engine/sampler/jitter.ts
src/engine/renderer/svgRenderer.ts
src/engine/renderer/canvasRenderer.ts
src/engine/renderer/shapePath.ts
src/engine/theme/tokens.ts
src/lib/photoDotify.ts
```

## Ground rules (still apply)
- `src/engine/` stays framework-free — zero npm deps, no React import, ever. New npm packages (if truly needed) only go in the root `package.json` for playground UI code, and only under `src/components/playground/`.
- Every visual = Field → Sampler → Renderer. No hand-drawn one-off widgets.
- Only one accent color (`#FF3B30`) per rendered board, ever — including inside the playground's own chrome (sliders, panels), not just inside rendered widgets.
- Reuse Step 1's functions by name — do not reimplement `sampleField`, `iconField`, etc.

---

## Phase 5 — Waveform, spline, heatmap fields

**File: `src/engine/fields/waveformField.ts`**
- [ ] `amplitudeField(amplitudes: number[]): Field`
- [ ] `sumOfSinesAmplitudes(n: number, t: number): number[]` — procedural demo data (`sin(t*f1) + 0.4*sin(t*f2+φ)`), used when no real audio is available.
- [ ] `ecgAmplitudes(n: number, t: number): number[]` — **do not reuse the sine generator.** Piecewise Gaussian-composite: small bump (P-wave), sharp derivative spike (QRS), wider bump (T-wave). See PLAN.md §3.6 — the EKG must look visually distinct from an audio waveform, that's the point.
- [ ] Optional: `amplitudesFromAnalyser(analyser: AnalyserNode): number[]` via the native Web Audio API.

**File: `src/engine/fields/splineField.ts`**
- [ ] `catmullRomField(points: [number,number][], tension?: number): Field` — default `tension = 0.5` to prevent overshoot on volatile data (PLAN.md §3.7). Sample the curve, each sample is a seed; nearby cells get high value via smoothstepped distance-to-nearest-seed.

**File: `src/engine/fields/heatmapField.ts`**
- [ ] `gridField(matrix: number[][]): Field` — direct nearest-cell lookup, no interpolation. Powers sleep-stage blocks, floor-plan occupancy, notification dots, system usage bars (a bar is a 1×N heatmap row).

**Acceptance test**: render `ecgAmplitudes` and `sumOfSinesAmplitudes` side by side at the same grid size — they must look clearly different (spiky/medical vs. smooth/audio).

---

## Phase 6 — Scatter + 3D projection

**File: `src/engine/fields/scatterField.ts`**
- [ ] `poissonDiscPoints(width, height, minDistance, seed): [number,number][]` — Bridson's algorithm (2007). Not naive `Math.random()` scatter — it clumps badly at low point counts.
- [ ] `scatterField(points, dotRadius): Field`
- [ ] Reuse the mulberry32 PRNG from `src/engine/sampler/jitter.ts` — don't add a random-number library.

**File: `src/engine/fields/projection3D.ts`**
- [ ] `perspectiveProjection(worldX, worldY, worldZ, focalLength): [number, number]` — one-point perspective only, for the maze widget. Not a general 3D engine.
- [ ] `corridorField(depth: number, focalLength: number): Field` — receding rectangle grid, dot size falls off by `1/z`.

**Acceptance test**: 200 Poisson-disc points in a 100×100 area — no two closer than `minDistance`, no large empty gaps.

---

## Phase 7 — All 35 widget presets

Create one file per widget in `src/widgets/`. Each exports a config object combining Step 1/5/6 generators + a `GridConfig` + a `DotStyle` (pattern in PLAN.md §1 and §7).

**Do not invent new generator logic here.** If a widget needs something not built in Phases 0–6, stop and flag it — don't write a one-off field function inside a widget file.

Group and build (cross-reference PLAN.md §1 and the original reference images):

**Text/bitmap-font:**
- [ ] `clock.ts`, `timer.ts`, `boardingPass.ts`, `headlineText.ts`

**Polar/ring:**
- [ ] `gaugeSpeed.ts`, `gaugeBattery.ts`, `fitnessRings.ts`, `oxygenRing.ts`, `moistureLeafRings.ts`, `dialRadio.ts`, `breathingCircles.ts`, `deviceOverviewDonut.ts`, `agentAvatarRing.ts`

**Icon:**
- [ ] `weatherCard.ts`, `settingsList.ts`, `evCharge.ts`, `visionCube.ts`, `appIconGrid.ts`

**Photo/halftone:**
- [ ] `thermalMonitor.ts` (check DESIGN.md — may use a true color-mapped thermal photo rather than pure grey halftone), `portraitArt.ts`, `albumArt.ts`, `silhouetteArt.ts`

**Waveform/spline/heatmap:**
- [ ] `musicPlayer.ts`, `audioRecorder.ts`, `voiceListening.ts`, `interpreterDual.ts`, `ecgMonitor.ts`, `lapTimeChart.ts`, `retailAnalytics.ts`, `sleepChart.ts`, `systemStatsBars.ts`, `metroLine.ts`

**Scatter/3D:**
- [ ] `starField.ts`, `passwordDotsRing.ts`, `mazeGame.ts`

**Composite/UI-primitive (mostly non-dot, from DESIGN.md Components section):**
- [ ] `messagesList.ts`, `aiAssistantChat.ts`, `cameraViewfinder.ts`, `shoppingChecklist.ts`, `agentStatus.ts`

For each file:
- [ ] Name exports exactly as they appear in `DESIGN.md`'s Components section where one exists (e.g. `progress-ring`, `list-card`, `waveform`) — don't rename.
- [ ] Every color references a `ThemeTokens` field or a `src/index.css` custom property — no hardcoded hex.

**Acceptance test**: for each of the 7 original reference images, pick 3+ cards and render your preset next to the original screenshot. Must match in layout/structure/generator family (not pixel-identical).

---

## Phase 8 — React components + in-app playground

**File: `src/components/DotCanvas.tsx`**
- [ ] `<DotCanvas field grid style theme />` — renders via `svgRenderer` or `canvasRenderer`, auto-selected: `renderer = dotCount > 2000 || animated ? 'canvas' : 'svg'` (PLAN.md §5.3), with an explicit `renderer` prop to override.

**File: `src/hooks/useDotField.ts`**
- [ ] Memoizes field computation keyed on relevant props only — must not recompute an icon's distance transform because an unrelated prop (like density) changed.

**File: `src/components/DotWidget.tsx`**
- [ ] `<DotWidget type="clock" density={4} dotShape="squircle" roundness={0.7} size={{w,h}} theme="dot480" data={{...}} />` — looks up the preset by `type` from `src/widgets/`, wires props into `DotCanvas`.

**Playground UI: `src/components/playground/`**
```bash
npm install zustand file-saver
```
(Tailwind and shadcn are already in the repo — reuse `src/components/ui/` primitives, don't duplicate them.)
- [ ] `WidgetGallery.tsx` — thumbnail grid of all 35 presets, click loads into the editor.
- [ ] `ControlsPanel.tsx` — sliders/toggles for density, dot size min/max, shape, roundness, jitter, quantize steps, theme, canvas size, animation on/off. Every control maps straight to a `DotStyle`/`GridConfig` field — no custom logic beyond prop wiring.
- [ ] `PreviewCanvas.tsx` — live render of the selected widget with current controls.
- [ ] `ExportPanel.tsx`:
  - [ ] PNG: draw current SVG/canvas to an offscreen canvas → `toDataURL('image/png')` → download via `file-saver`.
  - [ ] SVG: serialize the current `<svg>` DOM node.
  - [ ] React snippet: generate the literal `<DotWidget type="..." density={...} .../>` string with current control values, as copyable plain text.
  - [ ] HTML/CSS: static inline-SVG output, no JS runtime required.
- [ ] `PhotoUpload.tsx` — drag-drop zone calling `dotifyUpload` from `src/lib/photoDotify.ts` (built in Step 1), inserting the result into a widget slot. Confirm it's still 100% client-side.
- [ ] Wire the playground into `App.tsx` as the app's main view (or a route/tab if `App.tsx` already has other views — check before overwriting).

**Acceptance test**: run the app (`npm run dev`), load 5 different widget presets, change density/roundness/theme on each, export one as PNG and one as a React snippet. Paste the exported snippet into a fresh file — it renders identically to the playground preview.

---

## Definition of done for Step 2
- [ ] All 35 widgets from Phase 7 exist and pass the visual-equivalence check against the reference images.
- [ ] The app runs (`npm run dev`), all four export formats work.
- [ ] `src/engine/` still has zero npm dependencies and zero React imports — check before finishing.
- [ ] Every widget's colors trace back to `src/index.css` / `DESIGN.md` tokens — grep `src/widgets/` and `src/components/` for hardcoded hex codes and account for any hits.
- [ ] Re-read `DESIGN.md`'s "Do's and Don'ts" once more and confirm nothing violates it — most common mistake: a second accent color sneaking into the playground's own chrome, not just the rendered widgets.
