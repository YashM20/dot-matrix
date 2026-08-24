# DOT-MATRIX-ENGINE-PLAN — Architecture Reference (Consolidated)

> This file was missing; STEP-1/STEP-2 hand-offs treated it as authoritative. The canonical build plan lives in `public/docs/PRD.md` §1–13. This file exists only to satisfy `AGENTS.md` and to be the routing doc: all module/algorithm decisions are in PRD, all token/component decisions are in `DESIGN.md`.

## Module Map (PRD §1)
```
src/engine/
  types.ts, theme/tokens.ts
  sampler/gridSampler.ts, quantize.ts, jitter.ts
  renderer/svgRenderer.ts, canvasRenderer.ts, shapePath.ts
  fields/bitmapFont.ts, cjkFallback.ts, polarField.ts, iconSDF.ts, haltoneField.ts,
         waveformField.ts (amplitudeField + traceField + mirroredTraceField), splineField.ts,
         heatmapField.ts, scatterField.ts, projection3D.ts, warpedField.ts (trig leverage)
src/widgets/ — one file per widget, Field→Grid→Renderer only
src/components/ — DotCanvas, DotWidget, Board, playground/*
src/lib/photoDotify.ts — client-only upload → dither
```

## Field Pipeline (PRD §3–§4)
Every visual = `Field(u,v)->number[0,1] → sampleField(grid,style,theme) → DotInstance[] → SVG|Canvas`.

## Generator Families (see PRD §3 + ADVERSARIAL-REVIEW.md §2 inventory)
- Text: bitmapFont 5×7 + CJK via icon SDF
- Polar: ringField (with angle wrap at ±π), sunburstField, concentricRingsField, dialField
- Icon: rasterize→distanceTransform (FH) → iconField (filled silhouette)
- Halftone: Rec.709 luminance, gamma 1.4, boxBlur 1, Bayer 4/8 or Floyd-Steinberg → continuous radius
- Waveform: amplitudeField (bars), traceField/mirroredTraceField (thin lines)
- Spline: Catmull-Rom with tension 0.5
- Heatmap: gridField nearest lookup
- Scatter: Bridson Poisson-disc + mulberry32
- 3D: perspectiveProjection `screenX = focal*worldX/(focal+max(0,worldZ))` (safe, never div0) + corridorField (receding rects, dot size 1/z); PRD originally wrote `f*worldX/worldZ` which div0 at wz=0 — implementation is intentional fix
- Warped (next-level): domain warps via sin/cos/tan, modulated polar (see `src/engine/fields/warpedField.ts`)

## Renderer Rule (PRD §5.3)
`renderer = dotCount > 2000 || animated ? 'canvas' : 'svg'`; squircles render via bezier in both.

## Tokens
See `DESIGN.md` for all `{colors.*}`, `{spacing.*}`, `{rounded.*}`, `{typography.*}`; runtime `src/engine/theme/tokens.ts` (`dot480`, `deerflowMosaic`).

## Phases
Phases 0–4 in `STEP-1-HANDOFF.md`, 5–8 in `STEP-2-HANDOFF.md`. Acceptance tests per phase.
