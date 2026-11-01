# Build your own dot engine

<!-- VISUAL: kind=card · what=home-clock · notice=clock digits and second markers align to dot coordinates without blur -->

Most interfaces are made for screens with anti-aliased vectors, gradients and arbitrary corner radii. A dot matrix strips those choices away. Every shape on screen is a sample of a continuous field mapped onto a fixed grid of cells. Each cell contains a dot whose size and shape follow mathematical rules.

This guide explains how to build a dot-matrix engine from scratch by following one concrete build: an animated dot clock widget. You will see how continuous scalar fields become discrete dot grids, how Gabriel Lamé superellipses replace preset shapes, how to place typography without resampling blur, and how to choose between SVG and canvas output.

## The foundation idea

<!-- VISUAL: kind=card · what=audio-levels · notice=speaker and microphone volume meters track levels across discrete dots -->

The rendering pipeline has three stages:

1. **Field.** A pure mathematical function `f(u, v, t) -> number` defined on the unit square `[0, 1] × [0, 1]`. The coordinates `u` and `v` span the surface horizontally and vertically. The parameter `t` is elapsed time in seconds. The function returns a floating-point number between 0 and 1. A circle is a distance field to a centre point. A glyph is a lookup into a font bitmap.
2. **Sampler.** A routine that steps across every cell of a regular grid with `cols` columns and `rows` rows. At each cell centre, the sampler queries the field for its value. It quantizes that continuous value into discrete steps, setting dot diameter, opacity and tone.
3. **Renderer.** A drawing layer that converts the sampled array of dots into screen pixels. Sparse and static cards use SVG elements. Dynamic interfaces with moving dots use an HTML5 2D canvas buffer.

This separation keeps visual logic independent of display resolution. A single field definition renders onto a 24×24 hardware matrix or a 144×144 canvas card without changing field formulas.

In the Dot/480 codebase, this pipeline lives in three directories:
- `src/engine/fields/` defines basic fields including shapes, bitmaps, waveforms and distance functions.
- `src/engine/sampler/gridSampler.ts` implements the sampling pass, jitter offsets and step rounding.
- `src/engine/renderer/canvasRenderer.ts` and `src/engine/renderer/svgRenderer.ts` handle output.

## Quantization and the squircle

<!-- VISUAL: kind=diagram · what=squircle-exponent-curve · notice=continuous roundness knob maps 0 to a circle and 1 to a sharp rounded square -->

A continuous gradient displayed on an analog screen creates smooth transitions. When mapped to a dot matrix, continuous variations can look like noisy dithering. To give the display a physical hardware character, the sampler quantizes continuous values into distinct levels.

In `src/engine/sampler/quantize.ts`, quantization is computed with this arithmetic:

```typescript
export function quantize(value: number, steps: number): number {
  const bounded = Math.max(0, Math.min(1, value))
  if (!Number.isFinite(steps) || steps < 2) return bounded
  return Math.round(bounded * (steps - 1)) / (steps - 1)
}
```

When `steps` equals 5, any input value between 0.0 and 1.0 collapses onto one of five discrete levels: 0.0, 0.25, 0.5, 0.75 or 1.0. These steps translate directly to dot radii. A field value below 0.1 produces an empty cell. A field value of 0.6 maps to 0.5, creating a medium dot. A field value of 0.9 maps to 1.0, creating a full-size dot.

The shape of each dot is governed by a superellipse, Gabriel Lamé's curve:

$$|x|^n + |y|^n = 1$$

The engine avoids presets such as circle, pill or rounded rectangle. It uses a single continuous exponent:

$$n = 2 + 30r^2$$

Here, `r` is a roundness parameter from 0 to 1. When `r = 0`, the exponent `n` equals 2, producing a geometric circle. When `r = 0.25`, the exponent evaluates to approximately 3.875, matching the squircle used in hardware industrial design. When `r = 1.0`, the exponent reaches 32, which produces a square with slight corner easing.

Squaring `r` concentrates slider resolution near the circular end of the scale, where the human eye is most sensitive to curvature changes. The path calculation in `src/engine/renderer/shapePath.ts` fits four cubic bezier curves for exponents up to 8. For exponents above 8, it transitions to a rounded square whose corner radius contracts as `n` grows.

## Lattices and integer text layout

<!-- VISUAL: kind=card · what=departures · notice=train departure rows place 5x7 bitmap characters directly onto grid cells without anti-aliasing -->

If you draw a large numeral by clustering small dots together, the number looks like a broken mosaic. Hardware displays solve this by changing physical pitch. Large digits on train departure boards use large physical indicators spaced further apart.

Dot/480 adopts this principle through lattices. In `src/engine/layout.ts`, elements can be sampled on a coarser lattice multiplier. A lattice multiplier of 2 evaluates every second cell and scales dot diameter to match. The element feels monolithic because each dot is larger, keeping the visual rhythm unified.

Text requires special care. Traditional vector fonts rasterized with subpixel anti-aliasing look blurry when sampled onto a coarse grid. Dot/480 uses dedicated bitmap dot fonts stored as boolean bit arrays, defined in `src/engine/fields/bitmapFont.ts`. Standard Latin characters and digits use a 5×7 cell grid.

To keep bitmap text crisp, every character must anchor to exact integer cell coordinates. Converting floating-point field coordinates to integer cell indices is handled by `toCell`:

```typescript
export const toCell = (u: number, n: number) => Math.round(u * (n - 1))
```

Layout functions like `placeCells`, `textAt`, `rectCells` and `hRule` operate in cell space. When a digit is placed at column 12 and row 8, its font pixels land directly on cell centres. No fractional interpolation occurs.

## Choosing a renderer and managing performance

<!-- VISUAL: kind=card · what=timer · notice=a countdown ring of dots that animates over time as seconds run out -->

Dot/480 supports two primary rendering targets in `src/engine/renderer/`:

1. **SVG renderer (`svgRenderer.ts`).** Best for static or low-frequency cards with fewer than 2,000 dots. SVG outputs `<circle>` or `<path>` elements inside an `<svg>` root. The output is resolution-independent, inspectable in browser developer tools, and directly copyable as vector artwork.
2. **Canvas renderer (`canvasRenderer.ts`).** Used for animated cards, interactive surfaces and grids containing more than 2,000 dots. The canvas renderer draws into an HTML5 2D context using `arc` or precomputed `Path2D` objects.

A 60 frames per second budget provides 16.6 ms per frame. A 144×144 card contains 20,736 dots. Evaluating a complex field and rendering 20,736 bezier paths on every animation frame can consume the entire frame budget.

To maintain frame rates, the engine uses three performance rules:
- **Spatial bounds skipping.** Fields declare cell bounding boxes `[c0, r0, c1, r1]` using `bounded()` in `src/engine/layout.ts`. The sampler loops only over active cells and skips surrounding empty space.
- **Path pre-compilation.** For a given dot shape and quantized radius step, `Path2D` instances are cached. The renderer calls `ctx.fill(cachedPath)` with a translation matrix instead of recomputing geometry.
- **Dirty rect blitting.** Unchanged background cells are preserved between frames, redrawing only dots whose underlying field values have changed.

## Color and accessibility

<!-- VISUAL: kind=card · what=device-overview · notice=one red status dot marks an alert on the ring against cool grey dots -->

Color design in Dot/480 follows the rules in `DESIGN.md`. There is exactly one accent color across the entire system: Signal Red (`#FF3B30`), mapped to the token `dotActive`. It is reserved for active states, live recordings, warnings and running progress indicators.

Every other dot on the board uses neutral greys on a dark background (`#070809`):
- `dotIdle` (`#8A8F98`): Full brightness for static text and inactive values.
- `dotMid` (`#5B5F66`): Intermediate field values and quiet progress tracks.
- `dotFaint` (`#2E3033`): Subtle grid guides and inactive borders.

Contrast ratios adhere to WCAG 2.1 AA standards. Primary text values in `dotIdle` on card surface (`#111315`) achieve a 5.6:1 contrast ratio. Secondary labels in `mute` (`#81858B`) achieve 4.7:1.

For accessibility, canvas elements carry `role="img"` with an `aria-label` describing current card state in plain language. Screen readers announce the textual values, while the canvas presents the dot grid visually.

## Direction: widgets in dots

<!-- VISUAL: kind=card · what=weather · notice=a cloud icon with high and low temperature readings on the dot grid -->

Once the core pipeline is operational, interface widgets are assembled by combining fields:

- **Clocks and timers.** Digits render using `textAt`, framed by an outer circular arc drawn with `ringCells`. A blinking colon toggles by modulating field amplitude with `Math.floor(t * 2) % 2`.
- **Meters and gauges.** A horizontal level meter samples a step function: values below the current metric return 1.0, while values above return 0.0. The highest active dot receives the Signal Red accent color.
- **Buttons and switches.** Interactive hit areas track pointer input. When clicked, an internal spring variable animates an outward ripple field that sweeps across the button's dot lattice.
- **Sparklines and charts.** Time series data maps to a vertical distance field. Points on the curve output 1.0, and cells fall off exponentially with distance from the trend line.

## Recreating the engine

<!-- VISUAL: kind=steps · what=minimal-engine-pipeline · notice=code snippets compile from raw field equation to canvas pixels -->

The following four TypeScript snippets provide a complete dot engine and a working dot clock widget.

### 1. The canvas dot renderer

Save this as `DotCanvas.ts`. It initializes a canvas, samples a field, and draws circular dots. It requires an HTML5 `<canvas>` element (or a compatible 2D context mock in headless tests).

```typescript
export interface Field {
  (u: number, v: number, t: number): number
}

export class DotCanvas {
  private ctx: CanvasRenderingContext2D
  constructor(
    private canvas: HTMLCanvasElement,
    public cols = 32,
    public rows = 32,
    public pitch = 12
  ) {
    this.canvas.width = cols * pitch
    this.canvas.height = rows * pitch
    this.ctx = canvas.getContext('2d')!
  }

  render(field: Field, t = 0, steps = 5, accentColor = '#FF3B30'): void {
    const { ctx, cols, rows, pitch } = this
    ctx.fillStyle = '#070809'
    ctx.fillRect(0, 0, cols * pitch, rows * pitch)

    const maxRadius = (pitch * 0.85) / 2
    for (let r = 0; r < rows; r++) {
      const v = (r + 0.5) / rows
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols
        const raw = field(u, v, t)
        const q = Math.round(Math.max(0, Math.min(1, raw)) * (steps - 1)) / (steps - 1)
        if (q <= 0) continue

        const cx = (c + 0.5) * pitch
        const cy = (r + 0.5) * pitch
        const rad = q * maxRadius

        ctx.beginPath()
        ctx.arc(cx, cy, rad, 0, Math.PI * 2)
        ctx.fillStyle = q >= 0.95 ? accentColor : `rgba(200, 205, 215, ${0.25 + q * 0.75})`
        ctx.fill()
      }
    }
  }
}
```

### 2. A clock field with dial markers and moving hands

Save this as `clockField.ts`. It computes a dial rim, 12 hour tick marks, hour and minute hands, and an active second marker at time `t`.

```typescript
import type { Field } from './DotCanvas'

export function clockField(now: Date = new Date()): Field {
  const sec = now.getSeconds() + now.getMilliseconds() / 1000
  const min = now.getMinutes() + sec / 60
  const hr = (now.getHours() % 12) + min / 60

  const hrAngle = (hr / 12) * Math.PI * 2 - Math.PI / 2
  const minAngle = (min / 60) * Math.PI * 2 - Math.PI / 2
  const secAngle = (sec / 60) * Math.PI * 2 - Math.PI / 2

  return (u: number, v: number, _t: number) => {
    const dx = u - 0.5
    const dy = v - 0.5
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    const rim = Math.abs(dist - 0.42) < 0.03 ? 0.3 : 0
    const tick = Math.abs(dist - 0.38) < 0.03 && Math.cos(angle * 12) > 0.92 ? 0.6 : 0

    const hrDist = Math.hypot(dx - 0.11 * Math.cos(hrAngle), dy - 0.11 * Math.sin(hrAngle))
    const hrHand = dist < 0.22 && hrDist < 0.12 ? 0.8 : 0

    const minDist = Math.hypot(dx - 0.16 * Math.cos(minAngle), dy - 0.16 * Math.sin(minAngle))
    const minHand = dist < 0.32 && minDist < 0.17 ? 0.8 : 0

    const secDist = Math.hypot(dx - 0.42 * Math.cos(secAngle), dy - 0.42 * Math.sin(secAngle))
    const secMarker = secDist < 0.04 ? 1.0 : 0

    return Math.max(rim, tick, hrHand, minHand, secMarker)
  }
}
```

### 3. A squircle dot path generator

Save this as `drawSquircleDot.ts`. It draws dots using Gabriel Lamé's curve with the formula $n = 2 + 30r^2$. It requires a 2D rendering context.

```typescript
export function drawSquircleDot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  roundness: number
): void {
  const r = Math.max(0, Math.min(1, roundness))
  const n = 2 + 30 * r * r

  if (n <= 2.05) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const handle = (Math.pow(2, -1 / n) - 0.5) / 0.375
  const k = radius * handle

  ctx.beginPath()
  ctx.moveTo(cx, cy - radius)
  ctx.bezierCurveTo(cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy)
  ctx.bezierCurveTo(cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius)
  ctx.bezierCurveTo(cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy)
  ctx.bezierCurveTo(cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius)
  ctx.closePath()
  ctx.fill()
}
```

### 4. The complete dot clock widget

Save this as `DotClockWidget.ts`. It wraps the canvas engine and clock field into an interactive component.

```typescript
import { DotCanvas } from './DotCanvas'
import { clockField } from './clockField'

export class DotClockWidget {
  constructor(private engine: DotCanvas) {}

  renderAt(date: Date, t = 0): void {
    const field = clockField(date)
    this.engine.render(field, t, 5, '#FF3B30')
  }

  start(fps = 30): () => void {
    let frameId: number
    const tick = () => {
      const now = new Date()
      const t = performance.now() / 1000
      this.renderAt(now, t)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }
}
```

### Try this

Change `steps = 5` in `DotCanvas.render` to `steps = 2`. The clock dial loses its intermediate grey levels, snapping into hard 1-bit on/off dots. Next, replace `ctx.arc` with `drawSquircleDot(ctx, cx, cy, rad, 0.25)` to turn the circular dots into squircle hardware tiles.

### Next experiment

Add a second concentric ring outside the 12 hour marks to display a 60-second progress sweep, or place digital 5×7 hour numbers directly on the dial using `toCell`.
