# Dot/480 packages

Publishable builds of the engine. Nothing lives here twice: each package's entry points re-export from `src/`
(engine, widget presets), so the playground and the packages ship the same code. Not published yet (P6-B).

| Package | What | Entries |
|---|---|---|
| `@dot480/core` | Curated engine API: fields, sampler, renderers, layout/text, motion, interaction, Field IR, raster/light, sim, halftone, describe. Zero runtime deps, `sideEffects: false`, ESM. | `.` · `./ir` · `./presets` (the 146-card library) · `./card` (`mountCard`, framework-free DOM runtime) · `./spec` (`presetFromSpec`: the minimal package JSON spec, IR layers on a grid; not card spec v1) |
| `@dot480/react` | `<DotCard preset="timer" data={…} />` / `<DotCard spec={…} />`, `useDotField(source, grid, style)`. Peer dep `react >= 18`. | `.` |
| `@dot480/element` | `<dot-card>` custom element: shadow DOM, reduced motion, no framework. | `.` (registers on import) · `./standalone` (one file, core inlined) |

```ts
import { sampleField, renderSVG, ringField, dot480 } from '@dot480/core'
const dots = sampleField(ringField(.5, .5, .3, .45, 0, Math.PI), { cols: 32, rows: 32, pitch: 4 }, style, dot480)
const svg = renderSVG(dots, 128, 128)
```
```html
<script type="module" src="https://…/@dot480/element/dist/standalone/dot-card.js"></script>
<dot-card card="ui-knob" data-value="0.7" theme="deerflowMosaic" renderer="auto"></dot-card>
<dot-card src="./ripple.json"></dot-card>   <!-- { grid, layers: [{ ir, tone?, lattice? }], defaults?, controls? } -->
```
`<dot-card>` attributes: `card` (preset id) or `src` (JSON spec URL) or an inline `<script type="application/json">`;
`data-*` → numeric data (`true`/`false` → 1/0); `theme` (`dot480` | `deerflowMosaic`); `renderer` (`auto` | `svg` | `canvas`);
`pitch`; `animated="false"`. Event `dot-input` ({ patch, data }) on control edits. CSS: `--dot-card-width`, `--dot-card-pad`, `::part(card|label|body)`.

**Runtime rules** (`@dot480/core/card`, shared by React and the element): SVG for static cards under 2000 dots, Canvas for
animated or denser ones (DESIGN.md renderer rule, `DotCanvas.CANVAS_THRESHOLD`); animated cards tick on the shared 12 fps
master clock and pause off-screen; `clock` cards re-sample on the minute; `springKeys` glide; controls take pointer
(hover / press / drag via the engine's `pick` / `beginDrag` / `dragValue`) and keyboard (Tab between controls, arrows /
Enter / Space via `keyValue`); reduced motion = one still frame, no entrance, springs cut. `aria-label` comes from `describe()`.

## Build, check, pack
```sh
npx tsx packages/scripts/build.ts              # vite library mode (ESM) + tsc --emitDeclarationOnly + size report
npx tsx packages/scripts/element-headless.ts   # headless Chrome over CDP: demo.html renders, input, reduced motion
npx tsx packages/scripts/registry.ts [--check] # shadcn registry → registry/
npm pack ./packages/core --pack-destination .snapshots/p6b
```
`.d.ts` relative specifiers get `.js` / `/index.js` added after emit, so types resolve under `bundler`, `node16` and
`nodenext` (checked with `--strict`, no `skipLibCheck`). Core types sit at `dist/types/packages/core/src/` because they mirror `src/`.
Install smoke: `packages/scripts/smoke.mjs` (copy next to an `npm i ./dot480-*.tgz`, run with node).

## Sizes (min / min+gz, entry + its chunks, 2026-10-23)
| Entry | min | min+gz |
|---|---|---|
| `@dot480/core` | 124.7 KB | 40.7 KB |
| `@dot480/core/ir` | 21.5 KB | 7.4 KB |
| `@dot480/core/card` | 61.4 KB | 20.2 KB |
| `@dot480/core/spec` | 58.8 KB | 18.9 KB |
| `@dot480/core/presets` | 339.3 KB | 109.2 KB |
| `@dot480/react` | 1.9 KB | 0.9 KB (+ core) |
| `@dot480/element` | 5.6 KB | 2.3 KB (+ core) |
| `@dot480/element/standalone` | 356.6 KB | 114.8 KB (everything, all 146 presets) |

Bundlers tree-shake `@dot480/core` (`sideEffects: false`), so a single import costs far less than the entry total.

## shadcn registry
`registry/registry.json` (schema `https://ui.shadcn.com/schema/registry.json`) lists the 10 Components v2 cards and 6 widgets
as `registry:component` items, each a 6-line `<DotCard preset=…>` wrapper (`registry/dot480/<id>/<id>.tsx`, npm deps
`@dot480/react` + `@dot480/core`). `registry/r/<id>.json` are the built items with file `content` inlined, servable as-is:
`npx shadcn add https://<host>/r/ui-knob.json`.

## Not done yet
- Not published to npm; the registry has no host yet.
- `@dot480/core/spec` (and `<DotCard spec>` / `<dot-card src>`) still takes the minimal package spec
  `{ grid, style?, layers: [{ ir, tone?, lattice? }], defaults?, controls?, animated? }` via `presetFromSpec`. Card spec v1 has
  landed in `src/spec` (`loadSpec`, `validateSpec`, `specToPreset`, `presetToSpec`, `migrateSpec`; `schema/card.v1.schema.json`,
  `examples/specs/`) but no package entry exports it yet. `migrateSpec` does not read the package shape: its v0 is the P3 draft
  `{ spec: 0, cols, rows, layers: [{ type, … }] }`. Swapping the packages to v1 is still to do.
- `<dot-card>` has no enter/exit board choreography, migration, live data sources or camera media (playground-only for now).
- The standalone element bundle carries every preset; a per-card lazy split would cut it.
