# ADVERSARIAL REVIEW — Final Pass (2026-08-22, after sub-agent fix loop)
**Verdict:** 6.4/10 — system now demonstrates the brief, but not the moat.

## Executive
Four sub-agents closed 16 P0/P1s in parallel. Build `104 modules` `npx tsc -b` zero errors, `npx tsx src/engine/verify-acceptance.ts` 16/16 pass. `docs/` now holds 5 files, `public/docs/` untouched, `README.md` correct. This is the first build that can show all 7 boards without lying about coverage.

But “beyond plu ultra but wont add complexity” still means “do more with sin/cos/trig than a junior copying grids”. That bar is still missed: warpedField is now 8/11 wired (was 1→3), but the 3 most visible boards (HOME QUIET floorplan, VIBE PAD 4×4, DEVICE dashed donut) were only half-wired, and the harness is a checklist not a screenshot.

## Inventory — now honest
`docs/BLOCK-INVENTORY.md:1` no longer stale: 7 previously stale rows now `Partial`/`Exists` with notes (sunburst 26×26 red center, rideDual modulatedRingField, homeQuiet checker+sinWarp, pharmaTrack/codexUsage 10-bar, wikiGraph spokes, notificationsGrid 3×5). Zero rows remain `Fake grid`/`No preset` as bare status — good.

Still weak: 12 rows remain `Partial` or `Exists (dots only, no pill)` — e.g., C05 `pharmaTrack` is still `gridField 4-step` without pill, D03 `codexUsage` single row without y-axis `0-6K`/`00 06…`. The table now tells the truth, but the truth is still 14/68 blocks are thin wrappers.

## Engine — 4 P0 closed, 1 still O(n²), 2 still half
- `iconSDF.ts:5` fill fixed, `distanceTransform` now dispatches `width*height>4096` → chamfer 3-4 O(n) (6% error) else brute. Exact FH still TODO, but 30-icon case no longer 150M sqrt — acceptable for v1.
- `cjkFallback.ts:1` now `ensureNotoSansSC()` + `cjkTextField` and `interpreterDual.ts:5` places it at `0.22,0.88` — live, but font load is `fonts.load().catch(()=>{})` fire-and-forget, no await, so first Board render still system sans. Needs `document.fonts.ready.then(rerender)`.
- `waveformField.ts:30` `f1=2.1 f2=5.7` temporal now literal, `splineField.ts:5` Hermite correct, `scatterField.ts:34` `width,height` param added, `haltoneField.ts:6` `v+dy` fixed + `photoDotify.ts:1` temp canvas keeps grid. All closed.
- `gridSampler.ts:11` now `colorFor(value,theme)` canonical (`≤0.34 dotFaint, ≤0.67 dotMid, else dotIdle`) + `sampleField(...,colorForFn)`. Widgets can keep `paint` but fragile thresholds are now documented as `ColorFor` bands. Good.
- `polarField.ts:5` `breathingField(phase)` exists, `breathingCircles.ts` exports `breathingCirclesField(phase)` with comment — but no `requestAnimationFrame` drives it. Still static.

## Widgets — 46→46 ids but 8 now warped (was 3), photo fakes still procedural
- `homeQuiet.ts:1` now `checkerField(8,8)` masked + `sinWarp(8,0.02)` — demonstrates `checker`+`sinWarp`. Good.
- `appIconGrid.ts:1` glyphs `A-I→□▂☼◯◐⬡▭▲≡` + cells 4/7 `truchetField(4)`/`spiralField` — `truchet`+`spiral` now live. Good.
- `deviceOverviewDonut.ts:1` now `modulatedRingField(...,18,0.28)` — tick-dashed wavy radius. Good.
- `portraitArt.ts:1`/`silhouetteArt.ts:1` now `gradientField`+`concentricWaveField`+`sinWarp` overlay — adds `gradient`+`concentricWave` leverage. Good.
- Still fakes: `aiAssistantChat`/`cameraViewfinder`/`settingsList`/`agentStatus` remain `gridField` matrices (4 untouched). `messagesList.ts` avatar circles now 2–3 dots, still illegible, no `M` letters. Photo boards still procedural disc/ellipses; real halftone demo via `public/images/*` not committed.

## Board — 3×4 fixed, per-widget density + theme, live tick
- `Board.tsx:5` now `deerflow12: rows repeat(4,1fr)` explicit 3×4 + `densityMap` (`album-art 48×48→3`, `clock/timer 5`) + `usePlayground(s=>s.theme)` → `presets[theme]` passed to `DotWidget:18`. Also `useState+setInterval 60s` tick so `clock.ts:8` `clockFieldFor()` updates per minute. Good.
- Still missing: no per-widget theme variant (all cards same theme), no `size={{w,h}}` propagation from board (all cards equal width), no side-by-side vs `public/images/*`.

## Playground — DRY + memo + theme, but still no data editors beyond scaffold
- `PreviewCanvas.tsx:1` per-prop selectors, `WidgetGallery.tsx:1` `memo(MiniThumb)`, `store.ts:10` `theme/animated` + `widgetData` + `render.ts:5 fieldFor()` for fitness-rings/retail. `HARNESS.md:1` + `src/engine/verify-acceptance.ts:1` (16 checks) runnable via `npm run verify`. Good.
- `ControlsPanel.tsx:6` theme+animated now, but still no `sizeCurve`, `DataEditor.tsx:1` only scaffolds MOVE/EXERCISE/STAND + SALES — 2/46 widgets. No `grid cols/rows override`.

## Docs / Design
- `docs/AGENTS.md`, `docs/DESIGN.md`, `docs/DOT-MATRIX-ENGINE-PLAN.md`, `docs/BLOCK-INVENTORY.md`, `docs/HARNESS.md`, `docs/ADVERSARIAL-REVIEW.md` all in `/docs`, `public/docs/*` untouched, `README.md` correct. `src/App.css` now `calc(var(--card-corner-exp)*4px)` + `--spacing-cardGap/Pad`. `DESIGN.md` spacing still not fully 1:1 (gap 18 vs token 24) but variable now.

## Ranked remaining
P0 (blocks “beyond”): 1) `BLOCK-INVENTORY` 14/68 thin wrappers still `Partial` 2) `warpedField` 8/11 — need VIBE PAD `truchet` full 4×4 + DEVICE pill halftone 3) photo board no real `halftoneField` demo from `public/images/*` 4) Board no per-card `size` + no screenshot harness
P1: 5) `iconSDF` FH exact still TODO 6) CJK no `fonts.ready` await 7) breathing no rAF 8) `gridSampler` still allows `quantizeSteps 0 → OFF` for UI (only photos should)
P2: 9) `sampleField` `toneByValue` alias not enforced, 10) `led-panel` pitch lock missing

## Score
1.3 → 3.1 → 4.8 → 6.4 (+1.6 this loop: +0.6 board 3×4/theme/tick/CJK, +0.5 engine math closed, +0.3 warped 3→8 + gallery memo, +0.2 docs/harness). To reach 7.5: wire 2 more warped (VIBE full, DEVICE pill), add one real halftone photo card, make board per-card size + rAF breathing, and add screenshot diff. Then FH can stay chamfer.
