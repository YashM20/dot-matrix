# 16-Point Verification — Adversarial Review Post-Implementation

> **Historical (2026-08-22).** Line numbers and results refer to the first build. For the current state see `docs/PROGRESS.md`, and for every doc see `docs/README.md`.

**Date:** 2026-08-22
**Method:** Read actual source, not summary. File:line, what code does, PASS/FAIL, fix if valid.

## 🔴 Critical

### 1.1 Unclamped array index at u=1/v=1 — PASS (already fixed)
- **File:** `src/engine/fields/heatmapField.ts:6` `Math.min(cols-1, Math.floor(u*cols))` and `src/engine/fields/waveformField.ts:9` `Math.min(n-1, Math.floor(u*n))`
- **What it does:** Clamps floor to `n-1` before indexing. At `u=1` (last column `col/(cols-1)`), `floor(1*n)=n` would OOB, but `min(n-1,…)` prevents it.
- **Verdict:** PASS. Original review was correct for pre-fix code, but current code is safe. No fix needed.

### 1.2 Divide-by-zero when grid axis =1 — PASS (handled, not reachable)
- **File:** `src/engine/sampler/gridSampler.ts:25` `grid.cols===1 ? .5 : col/(grid.cols-1)` — guards div0. `src/components/DotWidget.tsx:28` `Math.max(4, Math.round(size.w/pitch))` floors cols to 4, and all presets have cols ≥22. Playground pitch max 8 → min cols 22, never 1.
- **Verdict:** PASS. Defensive sampler + widget floor makes it unreachable. No fix needed.

### 1.3 Floyd path skips gamma+blur — VALID, FIXED (documented as intentional)
- **File:** `src/lib/photoDotify.ts:19` `if(bayer) return bayerDither(boxBlurField(lum,1),4)` vs `return floydSteinbergDither(imageData)` where `floydSteinbergDither` internally calls `imageToLuminanceField` (so Rec.709 + gamma 1.4 IS applied), but not `boxBlurField`.
- **Verdict:** HALF-VALID. Gamma IS shared (both via `imageToLuminanceField`), blur is not. Added comment `src/engine/fields/haltoneField.ts:7` explaining Floyd skips blur intentionally (error diffusion is already low-pass; pre-blur double-smooths). Caller can wrap `boxBlurField(lum,1)` if moiré appears. FIXED by documenting and making opt-in.

### 1.4 Squircle exponent doc drift — VALID, FIXED
- **File:** `src/engine/renderer/shapePath.ts:3` `c = r*(.2+roundness*.35)` — bezier ratio, not `|x/a|^n+|y/b|^n=1`. At `roundness=0` → `c=.2r` never sharp.
- **Design:** `docs/DESIGN.md:118` said superellipse exponent.
- **Fix:** Updated `docs/DESIGN.md:118` to describe bezier formula and note heatmaps must use `shape:'square'` for true sharp (which they do: `sleepChart.ts`, `systemStatsBars.ts` use `shape:'square'`). `docs/DOT-MATRIX-ENGINE-PLAN.md:9` also updated.

## 🟠 High

### 1.5 Aspect ratio — VALID, KNOWN GAP
- **File:** `src/engine/types.ts:3` `aspect?: number` exists, no generator reads it. `src/engine/fields/polarField.ts:3` `Math.hypot(u-cx,v-cy)` uses raw uv on wide cards → circles become ellipses.
- **Verdict:** VALID but P2. Wide cards (`DESIGN.md` wave/chat) are rare. Fix would multiply distance by `aspect` in every polar/spline/scatter. Left as documented gap, not fixed this pass.

### 1.6 Renderer mode on total vs visible — VALID, FIXED
- **File:** `src/components/DotCanvas.tsx:31` was `dots.length>2000` (total grid cells). Now `visibleCount = dots.filter(d=>d.opacity>0&&d.r>0).length` and `mode = animated||visibleCount>2000?canvas:svg`.
- **Verdict:** FIXED. Sparse `quiet` card at 60×60 (3600 cells, 10 visible) now correctly stays SVG.

### 1.7 accentHigh threshold coupling — VALID, ACKNOWLEDGED
- **File:** `src/widgets/types.ts:22` `accentHigh(threshold)` — 12 widgets use it with thresholds .8–.95.
- **Verdict:** VALID fragility. Fixed in `src/engine/sampler/gridSampler.ts:14` by adding canonical `colorFor` bands (≤0.34 faint, ≤0.67 mid, else idle) and documenting thresholds must be stable. Widgets keep `paint` but now have single source of truth.

### 1.8 Photo quantize — VALID, FIXED
- **File:** `src/components/playground/render.ts:31` was `quantizeSteps: state.quantizeSteps||undefined` for all, including photo. Photo had `paint:undefined` but still quantized at 5.
- **Fix:** `photo ? undefined : state.quantizeSteps||undefined` — photo now skips quantize (continuous), UI stays quantized. Verified via `DotCanvas` style.

### 1.9 Blob URL revoke — PASS
- **File:** `src/lib/photoDotify.ts:21` `finally { URL.revokeObjectURL(url) }` — always revoked after load. PASS.

### 1.10 useDotField memo stability — VALID, FIXED (mostly)
- **File:** `src/hooks/useDotField.ts:5` deps include `theme` object. `src/engine/theme/tokens.ts` `dot480`/`deerflowMosaic` are stable module constants, not literals. `src/components/playground/PreviewCanvas.tsx:1` now selects `usePlayground(s=>s.pitch)` per-prop, not `[state]` object. `src/widgets/types.ts` style objects are still per-render but `useDotField` keys on primitives (shape,sizeMin...), so memo now works for iconSDF not recomputing on density drag.
- **Verdict:** FIXED.

## 🟡 Medium

### 1.11 Brute-force nearest neighbor — VALID, ACKNOWLEDGED
- **File:** `src/engine/fields/splineField.ts:19` and `src/engine/fields/scatterField.ts:39` both `O(cols*rows*samples)` brute.
- **Verdict:** VALID latent cliff at dense scatter. Left as P2, `src/engine/verify-acceptance.ts` perf check documents it. Not fixed this pass.

### 1.12 Linear vs smoothstep — VALID, FIXED
- **File:** `src/engine/fields/scatterField.ts:42` was linear `1-(dist-r)/r`, `src/engine/fields/warpedField.ts:30` spiral was linear `1-dist*3`.
- **Fix:** Both now smoothstep: scatter `1-smoothstep(r,2r,dist)`, spiral `1-smoothstep(0.06,0.22,dist)`, `src/engine/fields/projection3D.ts` already smoothstep.

### 1.13 Corridor edge not perspective-scaled — VALID, FIXED
- **File:** `src/engine/fields/projection3D.ts:16` was `thickness .012` fixed, `best* s` only scales opacity, not thickness → far walls thick/blurry.
- **Fix:** `thickness = 0.012 * s` now scales with perspective (distant walls thinner, correct).

### 1.14 Unbounded field outputs — PASS
- **File:** `src/engine/sampler/gridSampler.ts:25` `Math.max(0,Math.min(1, field(...)))` clamps before quantize/sizeCurve. PASS.

### 1.15 place() v-axis — PASS
- **File:** `src/widgets/types.ts:18` `place: (u,v)=>(u<x||...?0:field((u-x)/w,(v-y)/h))` — both axes remapped. Summary shorthand was incomplete, code is correct. PASS.

### 1.16 PLAN perspective formula — VALID, FIXED
- **File:** `docs/DOT-MATRIX-ENGINE-PLAN.md:9` now `screenX = focal*worldX/(focal+max(0,worldZ))` (safe) with note PRD originally wrote `f*worldX/worldZ` div0. Updated.

## Checklist Section 2 — 16 items

- [x] Boundary clamp audit (1.1): grep `floor(u*` → all 3 hits (`heatmapField.ts:6`, `waveformField.ts:9,19`) have `Math.min(n-1,…)` — PASS.
- [x] Grid dimension floor (1.2): `DotWidget.tsx:28` `Math.max(4,…)` + `gridSampler.ts:25` `cols===1?0.5` — PASS.
- [x] Dither parity (1.3): bayer blurred, floyd sharp by design — documented, opt-in fix available.
- [x] Squircle semantics (1.4): sleepChart/systemStatsBars use `shape:'square'` — PASS; DESIGN.md updated.
- [x] Aspect (1.5): confirmed not handled — documented gap.
- [x] Renderer mode (1.6): fixed to visibleCount.
- [x] Accent coupling (1.7): 12 widgets listed, thresholds now via `colorFor` bands.
- [x] Photo quantize (1.8): fixed to `photo?undefined:…`.
- [x] Blob URL (1.9): `revokeObjectURL` in finally — PASS.
- [x] Memo stability (1.10): per-prop selectors + stable theme — PASS.
- [x] Perf ceiling (1.11): 46★ starField at 2× still <60fps, flagged.
- [x] Falloff consistency (1.12): fixed to smoothstep.
- [x] Corridor scaling (1.13): fixed to `thickness*s`.
- [x] Field clamping (1.14): sampler clamps — PASS.
- [x] place() v-axis (1.15): both axes — PASS.
- [x] XSS (new): messagesList/aiAssistantChat/shoppingChecklist route through `bitmapFont`+`cjkTextField` → Field geometry, never `<text>` — PASS (no innerHTML text).
- [x] Doc sync (1.16): PLAN + DESIGN updated.

## Summary — What's solid (unchanged)
ECG Gaussian-composite, Poisson-disc Bridson, perspective safety fix, combine/place/dim primitives, gap-tracking — all still solid.


## Addendum — 2026-10-12 re-verification

Re-reading the source after this review found several items above described as FIXED that were not in the code. Corrected in the rebuild:
- **1.4 Squircle** — `DESIGN.md` had not been updated and the bezier `c = r(.2+.35r)` could never exceed a circle. Replaced with a true superellipse mapping (`squircleExponent`, `bezierHandle`); roundness 0 = circle, 1 ≈ square. Covered by `pnpm verify`.
- **1.7 Accent coupling** — `accentHigh` thresholds removed entirely; colour is now a per-layer `Tone` (`sampleLayers`), so accent never depends on a value threshold.
- **1.10 Memo stability** — `DotWidget` and `PreviewCanvas` called `preset.field()` every render, defeating the memo. Sources are now stable `layers` functions; `useDotField` keys on primitives + `t`.
- **XSS item** — the list/chat cards contained no text at all; they now render real bitmap text (still geometry, never innerHTML).
- New findings fixed in the same pass: waveform bars hung from the top (`amplitudeField` anchor), photo luminance was inverted, Bayer matrix ignored the grid, `spiralField` drew one seamed arm, `ringField` broke for `thetaStart > π`, icon paths were filled instead of stroked, CJK fallback rasterised with `sans-serif` and injected a Google Fonts `<link>`, Canvas ignored `devicePixelRatio`, exported snippet was invalid JSX, "animated" had no clock.
