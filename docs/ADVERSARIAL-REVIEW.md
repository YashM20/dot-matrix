# ADVERSARIAL REVIEW 2 — Post-Fix Dot/480
**Date:** 2026-08-22 (after first remediation pass)
**Verdict:** 3.1/10 — fixes prove the team can edit files, not that the product meets the brief.
## 1. What the first fix actually fixed (and what it pretended to)
Fixes landed: `DOT-MATRIX-ENGINE-PLAN.md` stub, `BLOCK-INVENTORY.md` (68 blocks), `src/engine/fields/warpedField.ts:1`, `Board.tsx:1`, `theme/tokens.ts:1` deerflowMosaic, `DotWidget size` fix, `cjkFallback` SDF, `iconSDF fill`, `waveform traceField`, `canvas squircle`, `halftone` blur+scale, playground theme/animated/thumbnails/photo picker.
Build still passes (`103 modules` vs `91` before). `npx tsc -b` zero errors.

That is real progress — but every fix is shallow. The letter of the adversarial review was addressed, the spirit was not. This review is therefore harsher on depth than on existence.

## 2. Inventory — Exists on paper, still false on status
`BLOCK-INVENTORY.md:1` exists — good. But its Status column still says `Fake grid` for A06/A07/A08, `Bar not trace` for B04, `Procedural fake` for B07/D01, etc. — exactly the same strings as before the fix. The doc was not updated after the fix, so it now self-incriminates. A freeze doc that is stale on creation is not a freeze.

Count check: `src/widgets/*.ts` = 46 ids (including `music-player`+`ecg-monitor` in one file). Board items = 61 slots across 7 boards. The one genuinely missing id is `ecg-monitor` only because the extractor reads one `id:` per file — the second export in `ecgMonitor.ts:6` is `music-player`, second is `ecg-monitor`; our script missed it, but `widgetById('ecg-monitor')` does work. So board has no missing ids. However board composition is wrong:

- `henry: ['clock','album-art',...]` — `album-art` is disc vinyl placeholder for MUSIC's halftone disc; at 48×48 `albumArt.ts` is a target, not `DAYLIGHT` halftone. `clock` is still static `new Date()` at import time (`clock.ts:5` captures `now` once, never ticks) — board will freeze at build time.
- `audio: ['gauge-battery','app-icon-grid',...]` reuses `gauge-battery` for SPEAKER 72 and MIC 48 dual dials — board needs dual dials, not one.
- `deerflow12` uses `headline-text` for WORD PLAY `C _ D E` — but `headlineText.ts` hard-codes `SHIP THE IDEA`, not a param. Board therefore shows wrong text.
- `henry3` uses `voice-listening` twice and `portrait-art` ellipses for AFTERLIGHT split portrait — none match reference.
- `metro` uses `star-field` for DEERFLOW 80K STARS antlers — starField is Poisson dots without antlers; the antler shape is the whole point of `warpedField` leverage and is not used.

The inventory demanded “support for all that” — the fix added 7 new widgets (`sunburstWidget`, `rideDual`, `homeQuiet`, `wikiGraph`, `notificationsGrid`, `pharmaTrack`, `codexUsage`) but left the 68→42 gap essentially unchanged. The board pretends coverage by reusing wrong presets.

## 3. Engine — 6 P0 bugs marked fixed, 2 actually fixed, 4 half-fixed, 1 new bug introduced

### iconSDF.ts:4 fill vs stroke — FIXED, but hollow→fill is the easy half. The O(n²) `distanceTransform` remains brute force (`for(y)for(x)for(point)`). With 3 icons it is ~5M sqrt per mask, okay. But `warpedField` + deer antler SDF would push to 30 icons → ~150M ops on first render, main-thread jank as `ACCEPTANCE.md:51` already warns “needs FH for 100+”. No FH implemented.

### cjkFallback.ts:1 — HALF-FIXED. Now caches, calls `rasterizeToMask(char,64)` + `distanceTransform` if mask non-empty, else raw alpha. Good. But `interpreterDual.ts` still does not import `cjkTextField`; interpreter board's `开始吧` is still rendered via `textField('EN -> ZH')` Latin only. The CJK field exists but no widget uses it, so the fix is dead code. Also `rasterizeToMask` for single glyph uses `fillText` at `.1,.8` with default sans — `Noto Sans SC` is never loaded (PRD says on-demand Google Font), so fallback is system sans, not the spec font. No `font-display` or `document.fonts.load` check.

### waveformField.ts:5 — HALF-FIXED. `amplitudeField` now has smoothstep `edge .018`, good. New `traceField` and `mirroredTraceField` exist (`waveformField.ts:15`). But `audioRecorder.ts`, `voiceListening.ts`, `interpreterDual.ts` still call `amplitudeField(sumOfSines...)` — they were the ones that needed to stay bars, okay. `ecgMonitor.ts:19` now uses `traceField(ecgAmplitudes(...),0.038)` — correctly thin. However `sumOfSinesAmplitudes` still does `phase = t + x*6.5` spatial wave, not temporal `sin(t*f1)` as PRD says `sin(t*f1)+0.4*sin(t*f2+φ)` — the frequency constants `f1,f2` are gone; the demo waveform is spatial not temporal. `amplitudesFromAnalyser` exists but no playground wire to mic (PRD native Web Audio optional) — not even a toggle.

### canvasRenderer.ts:1 — FIXED. Now has `squircle` bezier via `c = r*(.2+roundness*.35)`. Correct match to `shapePath.ts:3` `c` formula. Good.

### haltoneField.ts:4 — HALF-FIXED + NEW BUG.
- Bayer scale now `64*matrixSize` (was `128`), good. Returns `lum*0.35` when below threshold — continuous radius now, good.
- Floyd now keeps `lumVals` and `binary`, returns `binary?lum:lum*0.28` — continuous radius, good.
- But `boxBlurField` has a copy-paste bug: `v+dx*0.004` twice (`boxBlurField.ts:6` loop `for(dx) for(dy)` but second term uses `dx` not `dy`). Blur is diagonal only, not 2D. Also `boxBlurField` is defined but `photoDotify.ts` only calls it for bayer, not for floyd — moiré reduction is half.
- No gamma UI, no pre-blur radius control in playground — hard `radius 1`.

### photoDotify.ts:1 — HALF-FIXED. Now has `file.size>2MB → requestIdleCallback` + `maxDim>1024` downscale + `boxBlurField` for bayer. Good. But `canvas.width = grid.cols` is set before downscale override that recomputes `canvas.width = round(grid.cols*s)` where `s=1024/maxDim` — if image is 2000×2000, `s=0.512`, grid 48→24, so halftone resolution halves silently. Should keep grid cols constant and downscale image via `drawImage` sampling, not grid.

### warpedField.ts:1 — EXISTS, but LEVERAGE = 1/11. File exports 11 trig combinators, but only `sinWarp` is used by one widget (`thermalMonitor.ts:5`). `modulatedRingField` (the killer for RIDE dual rings, DEVICE dashed donut), `spiralField`, `checkerField`, `truchetField`, `concentricWaveField` are dead code. The user's ask “sign/trigonomatric functions etc … humans have created lots which we can bring” was answered by committing a file, not by wiring it into widgets where time-poor devs would see the payoff. A file with 0 consumers is not “beyond plu ultra”.

### Other engine files untouched and still flawed
- `gridSampler.ts:11` still hard-sets `color=dotIdle` + widget `paint` thresholds (fragile quantize coupling) — unchanged.
- `splineField.ts:13` tension math still wrong for non-0.5.
- ` polarField.ts:3` sunburst exists but never used in any preset except dead `sunburstWidget` which board does use — okay, but `concentricRingsField` phase still static, breathing not breathing.
- `scatterField.ts:34` `maxX = max(pts.x)` normalization still off (should be `width`).

## 4. Widgets — More files, not more fidelity

46 ids now (was 36). The 7 new presets are thin wrappers:

- `sunburstWidget.ts:8` `sunburstField(.5,.5,9,0.11)` + paint that colors only center `hypot(d.x-52,d.y-52)<18` red — but board never shows day count `3 OF 7` that the reference sunburst has (E02). Also `paint` uses hard `52` px (centroid of 26×2 pitch) — breaks if board uses different pitch.
- `rideDual.ts:8` `dim(ring 0.32)+ring+dim(ring)` — dual rings via three `ringField` calls, but reference RIDE is two *concentric* rings at different radii with one red arc each — this is approximation, not `modulatedRingField`.
- `homeQuiet.ts:8` manual hollow squares via `u>0.08&&u<0.46` checks — not a `checkerField` or occupancy heatmap; the “quiet” story (dot absence = whitespace per DESIGN.md) is mimicked by drawing outlines, not by field value.
- `wikiGraph.ts:8` builds `spokes = nodes.map(n=>catmullRomField([center,mid,n]))` — uses `catmullRomField` for straight spokes, overkill; also hard-codes `oneRed` exactly at `0.82,0.25` — board will always light same node regardless of data.
- `notificationsGrid.ts:5` 3×5 matrix `[[1,0.25...]]` with `first` dot red — reference G08 `3 NEW` has `●○○○○ / ○○○○○ / ○○○○○` pagination (15 dots) with only first red — this file is correct by accident.
- `pharmaTrack.ts:5` `gridField([[0.95,0.25,0.25,0.25]])` 4-step — reference C05 has pill halftone + `66%` progress `●●○○` — this is just the dots, no pill.
- `codexUsage.ts:5` single row `[[0.2...0.3]]` — reference D03 has y-axis `0-6K` + x-axis `00 06 12 18 24` + two colors — no axes.

Unfixed old fakes remain fakes:

- `messagesList.ts:8` now pretends avatars via `avatar = hypot/0.07` circles + `textLine` strips — better than pure `gridField`, but still no `MAX`/`M` letters inside circles, no timestamps `10:30`, no `LET'S MEET UP` two-line text. At 34×18 grid the circles are 2–3 dots wide, illegible.
- `aiAssistantChat.ts`, `cameraViewfinder.ts`, `settingsList.ts`, `agentStatus.ts` unchanged — still `gridField(5×12)` heatmap matrices. `ecgMonitor.ts` is now thin trace (good) but `audioRecorder.ts`/`voiceListening.ts` still bars at same `sumOfSines` data — board shows two identical bar widgets.
- Photo fakes `portraitArt.ts`, `silhouetteArt.ts`, `albumArt.ts` still ellipses/disc — `warpedField` not used to make them halftone-like; upload path exists but board does not use it.

Widget count inflation without fidelity is the exact anti-pattern the user warned: “what you plaaneed anyone can easily copy”.

## 5. Board — Exists, but composition is a lie

`Board.tsx:5` hard-maps 7 boards, each `cols: 'repeat(3,1fr)'` — but `deerflow12` should be `3×4` per `BLOCK-INVENTORY.md:35` (12 cards). All 7 are `repeat(3,1fr)`, so 12-card board overflows or wraps. No `3×4` variant as PRD §1/ DESIGN.md `3×4` says.

Each board item is `<DotWidget type={id} density={4}>` — fixed pitch 4, no per-widget density tuning. Reference boards have varying density (MUSIC disc dense, CLOCK large). All 61 cards render at same density, so visual density is flat — loses the “hardware, not software” quantization story.

No board shows its reference screenshot side-by-side per STEP-2 acceptance: “pick 3+ cards and render your preset next to original”. No visual-equivalence harness.

`DOT-MATRIX-ENGINE-PLAN.md:1` exists now but is a 41-line stub that says “canonical lives in PRD, this exists only to satisfy AGENTS.md”. That's not a plan; it's a pointer.

## 6. Playground — 7 controls → 9, still not live-tunable per spec

`store.ts:1` now has `theme` + `animated` — good. `ControlsPanel.tsx:6` adds theme switch + `ANIMATED` checkbox (SVG vs CANVAS). `WidgetGallery.tsx:1` now renders mini `DotCanvas` at pitch 2, good. `PreviewCanvas.tsx:1` now DRY via `DotCanvas` + `getTheme`, good. `PhotoUpload.tsx:1` now has Bayer/Floyd toggle + active on any photo, good. `render.ts:45` snippet now includes `theme/size/animated` — good.

But:

- `store` is still global, not per-preset. Changing density for clock also changes density for thermalMonitor on next board switch — no isolation. PRD `useDotField` memo “must not recompute icon's distance transform because density changed” is moot because store forces full recompute via `resolveCurrent(state)` on every setter (object identity). `PreviewCanvas` dep is `[state]` object, not `[state.pitch,state.shape,...]` — so memo bust remains, just moved one layer.
- `WidgetGallery` mini canvases render 46× (` DotCanvas` each does `sampleField` at pitch 2) on every gallery open — 46× (26×26 avg) ≈ 30k dots computed synchronously, main-thread spike. No `React.memo`, no virtualization.
- `ControlsPanel` theme switch changes `presets[theme]` but `Board.tsx` ignores it — boards always `density 4`, theme `dot480`. Workspace theme does not affect Board view. So “one accent per board” rule (AGENTS.md) cannot be verified across themes.
- `ExportPanel` still re-generates via `renderCurrentSVG(state)` not DOM serialization — if preview is canvas (animated), exported SVG is SVG-fallback (different renderer) — export ≠ preview.
- No `sizeCurve`, no per-widget `data` editors (e.g., MOVE 62% slider), no `grid cols/rows override`, no `jitter` visible effect (jitter 0–1 but canvas squircle now ignores jitter scale vs pitch).

## 7. Theme / Design / AGENTS non-negotiables

- `tokens.ts:1` now has `deerflowMosaic` — correct. But `AGENTS.md` says “One accent color per board ({colors.dotActive}). If you're about to add a second, stop and ask.” — `thermalMonitor.ts:15` paint colors `dotActive` for >=.85 else `dotMid/dotFaint` — technically one accent, but `fitnessRings.ts:11` `accentHigh .95` would color whole inner ring red, which on deerflowMosaic theme is still red on warm gray — contrast fails DESIGN.md warning threshold but allowed.
- Corner roundness: `App.css` added `:root{--card-corner-exp:4}` but `.dot-card{border-radius:16px}` and `.pg-panel{border-radius:18px}` remain hard px. The invariant “Corner roundness = squircle exponent, not a radius enum” is documented but not enforced — card chrome still uses radius enum. No squircle `clip-path` or `border-radius` computed from exponent.
- `DESIGN.md` spacing tokens still not wired: `spacing.cardGap 6 pitches ~24px` vs `.board-grid{gap:18px}` and `.pg-layout{gap:18px}` — close but not token.
- `README.md` still says “React + TypeScript + Vite” template — not updated to Dot/480 playground.
- `ACCEPTANCE.md:1` now documents checkboxes but `Phase 3 cloud at 16/32/64` was never re-checked after `fill` fix — the acceptance is checked off without running.

## 8. “Beyond plu ultra” — the user’s core ask is still unmet

User: “we need to utilise math/programming algorithums to do many thing with little effor sign/trigonomatric functions etc … there are so many we can use beyond my capabilities which you should be able to gather. humans have created lots whch we can bring to this.”

What landed: `warpedField.ts` with 11 exports, one consumer. That is the opposite of leverage — it is code without adoption. The review’s “humans have created lots” list (10 algorithms in PRD §10) was already the baseline. “Beyond” would be:

- Domain warping for occupancy heatmaps (HOME QUIET could be `sin(u*π)*cos(v*π)` field, not hollow squares)
- Modulated polar for RIDE dual rings via `modulatedRingField` (already exported, not used)
- Truchet + checker for VIBE PAD 4×4 (instead of `appIconGrid` A–I letters)
- Spiral for MUSIC vinyl groove (instead of `albumArt` disc)
- FFT or `tan` folding for audio waveform shape variation

None are wired. The board still looks like a grid of placeholder widgets that any junior could copy by hard-coding icon grids and heatmaps. The moat is zero.

## 9. Ranked re-issue list (P0 = still blocks ship, P1 = ships but is lying)

**P0 — Still no board-as-spec**
1. `BLOCK-INVENTORY.md` stale — status not updated after fix, defeats freeze purpose.
2. `Board.tsx` all `repeat(3,1fr)` — `deerflow12` 12-card should be `3×4`, not `3×3`. Also no per-widget density/theme, so board fidelity cannot match reference.
3. `clock.ts:5` static `now` — board CLOCK frozen at build time, not live. PRD `Field` should be time-parameterized or ticked.
4. `interpreterDual.ts` + `cjkFallback` dead code — interpreter CJK line still Latin, so Board B06 is wrong.
5. `warpedField` leverage 1/11 — math moat not demonstrated where it matters (RIDE, HOME QUIET, VIBE PAD, MUSIC).
6. Photo fakes still procedural — `portraitArt/silhouetteArt/albumArt` not halftone; upload exists but board does not showcase it.

**P1 — Fixed but fragile / half-fixed**
7. `haltoneField.ts:6` `boxBlurField` bug (`v+dx` not `v+dy`) — blur is diagonal.
8. `photoDotify.ts` downscale mutates `grid` size — resolution halves silently.
9. `distanceTransform` still O(n²) — will need FH before icon set scales.
10. `waveformField sumOfSines` spatial vs temporal — still not PRD's `sin(t*f1)+0.4*sin(t*f2+φ)` constants.
11. `splineField tension` still wrong for non-0.5.
12. `scatterField maxX` normalization still `max` not `width`.
13. `WidgetGallery` 46 mini canvases no memo/virtualization — jank.
14. `store` global + `PreviewCanvas [state]` dep — per-prop memo still busted.
15. `App.css` hard `border-radius:16/18px` vs squircle exponent invariant.
16. `README.md` not Dot/480.

**P2 — Polish, but blocks “beyond”**
17. No `sizeCurve` control, no per-widget data editors (MOVE 62%, HR 72, etc.)
18. No visual-equivalence harness (side-by-side with `public/images/*`).
19. No `Noto Sans SC` lazy load for CJK.

## 10. Score delta

First review **1.3/10**: correct — nothing beyond plumbing.
This pass **3.1/10**: `+1.0` for inventory/plan stub/board scaffold/thermal warp, `+0.5` for theme/mosaic/size fix, `+0.3` for CJK/waveform/canvas/ halftone continuous. Remaining `6.9` requires: wiring `warpedField` into at least 5 widgets that currently fake it, making `Board` 3×4 + per-widget props + live clock, fixing `boxBlur` bug + FH + CJK live, and adding a single harness that screenshots board vs reference (the only way to prove pixel-for-pixel).

Until `warpedField` is *consumed* and `Board` is *faithful*, the product is still a standard build with a math file attached.

