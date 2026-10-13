# DOT-MATRIX-ENGINE-PLAN — Architecture Reference

> Routing doc. The original build plan is `public/docs/PRD.md` §1–13; token/component decisions live in `DESIGN.md`. Where this file and the code disagree, fix this file.

## Module Map
```
src/engine/                       framework-free TypeScript + Canvas/SVG APIs only
  types.ts                        Field (+ optional cell bounds), GridConfig, DotStyle, ThemeTokens, DotInstance, Layer (tone, lattice, origin, sites), Tone
  theme/tokens.ts                 dot480, deerflowMosaic presets
  sampler/gridSampler.ts          sampleField, sampleLayers (card grid + coarser lattices + dot sites), latticeGrid, colorFor, toneColor, cellU
  sampler/quantize.ts, jitter.ts
  renderer/shapePath.ts           circle / square / squircle paths, squircleExponent, bezierHandle
  renderer/svgRenderer.ts, canvasRenderer.ts
  layout.ts                       cell-space placement with bounds: textAt, placeCells, ringCells, barsAt, spriteAt, polylineCells, combine …
  fields/bitmapFont.ts            5×7 glyph set, Scale2x display weight (`smooth`), textField, textWidth, glyphMetrics
  fields/cjkFallback.ts           system-font SDF fallback for glyphs outside the set (no network)
  fields/svgPath.ts               pure-TS SVG path flatten + stroke/fill rasterizer (headless, deterministic)
  fields/iconSDF.ts               iconPaths (stroked outlines), rasterizeToMask, distanceTransform, cachedIconField
  fields/polarField.ts            ringField, sunburstField, concentricRingsField, dialField
  fields/haltoneField.ts          imageToLuminanceField, bayerDither (per-dot), floydSteinbergDither, boxBlurField
  fields/waveformField.ts         amplitudeField (bottom/center baseline, gap), traceField, speech/ecg/sine amplitudes
  fields/splineField.ts, heatmapField.ts, scatterField.ts, projection3D.ts, warpedField.ts
  verify-acceptance.ts            headless acceptance tests — `pnpm verify`
src/widgets/
  types.ts                        WidgetPreset { grid, style, chrome?, label?, bleed?, defaults?, layers(ctx) }, TILE/CARD grids, tileStyle, layoutFor() (big, dotRing, dotLine, dotDisc, dotBars, dots, lattice …), cardChrome/withChrome
  sprites.ts                      1-bit pixel art (invaders, bear, deer, pill …)
  boards/<board>.ts               one file per reference board, one export per card
  index.ts                        boards[], widgetPresets, widgetById
src/components/                   DotCanvas, DotWidget, Board, playground/*, draw/*
src/lib/photoDotify.ts            client-only upload → dither
scripts/snap.ts                   headless card/board PNG snapshots — `pnpm snap <id…> | --board <id> | --all`
```

## Pipeline
Every visual = `Layer[]` (each a `Field(u,v) → [0,1]` plus a colour `Tone`) → `sampleLayers(grid, style, theme)` → `DotInstance[]` → SVG | Canvas.
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

## Tokens
See `DESIGN.md`; runtime values in `src/engine/theme/tokens.ts`.
