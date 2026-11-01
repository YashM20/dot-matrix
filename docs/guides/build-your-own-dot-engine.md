# Build your own dot engine

<!-- VISUAL: kind=card · what=8vw39pnx · notice=clock digits and second markers align to dot coordinates without blur -->

Most user interfaces draw text with anti-aliased vectors, shade buttons with gradients, and round panels with varying corner radii. A dot matrix strips those options away. Every shape on screen is a sample of a continuous field mapped onto a fixed grid of cells. Each cell contains a dot whose size and shape depend on mathematical rules.

This guide explains how to build a dot-matrix engine from scratch. You will learn how continuous scalar fields become discrete dot grids, how superellipses replace arbitrary shape presets, how to place typography without resampling blur, and how to choose between SVG and Canvas renderers.

## The foundation idea

<!-- VISUAL: kind=card · what=ysgr68jt · notice=the audio volume columns light up as discrete dots that track instantaneous sound levels -->

The core pipeline has three distinct stages:

1. **Field.** A pure mathematical function `f(u, v, t) -> number` defined over the unit square `[0, 1] x [0, 1]`. The coordinates `u` and `v` run across the horizontal and vertical span of the surface. The parameter `t` is elapsed time in seconds. The function returns a single floating-point number between 0 and 1. A circle is a distance field to a centre point. A glyph is a lookup into a font bitmap. A waveform is an offset relative to an audio buffer.
2. **Sampler.** A routine that steps across every cell of a regular grid with `cols` columns and `rows` rows. At each cell centre, the sampler queries the field for its value. It quantizes that continuous value into one of a few discrete steps. It assigns dot diameter, opacity, and tone.
3. **Renderer.** A drawing layer that converts the sampled array of dots into visual pixels on a screen. Sparse and static graphics use SVG elements. Dynamic interfaces with thousands of moving dots use an HTML5 2D canvas buffer.

This separation keeps the visual representation decoupled from display resolution. A single field definition can render onto a 24x24 low-resolution hardware panel or a 144x144 high-density retina card without rewriting rendering logic.

In the Dot/480 codebase, this pipeline lives in three directories:
- `src/engine/fields/` defines basic fields including shapes, bitmaps, waveforms, and distance functions.
- `src/engine/sampler/gridSampler.ts` implements the sampling pass, jitter offsets, and step rounding.
- `src/engine/renderer/canvasRenderer.ts` and `src/engine/renderer/svgRenderer.ts` handle output.

## Quantization and the squircle

<!-- VISUAL: kind=diagram · what=squircle-exponent-curve · notice=continuous roundness knob maps 0 to a circle and 1 to a sharp rounded square -->

A continuous gradient displayed on an analog screen creates smooth transitions. When mapped to a dot matrix, continuous variations can look like noisy video dithering. To give the display a physical hardware character, the sampler quantizes continuous values into distinct levels.

In `src/engine/sampler/quantize.ts`, quantization is computed with a single line of arithmetic:

```typescript
export function quantize(value: number, steps: number): number {
  const bounded = Math.max(0, Math.min(1, value))
  if (!Number.isFinite(steps) || steps < 2) return bounded
  return Math.round(bounded * (steps - 1)) / (steps - 1)
}
```

When `steps` equals 5, any input value between 0.0 and 1.0 collapses onto one of five discrete plateaus: 0.0, 0.25, 0.5, 0.75, or 1.0. These steps translate directly to dot radii. A field value below 0.1 produces an empty cell. A field value of 0.6 maps to 0.5, creating a medium dot. A field value of 0.9 maps to 1.0, creating a full-size dot.

The shape of each dot is governed by a superellipse, also known as Gabriel Lame's curve:

$$|x|^n + |y|^n = 1$$

The engine avoids presets such as circle, pill, or rounded rectangle. It uses a single continuous exponent:

$$n = 2 + 30r^2$$

Here, `r` is a roundness parameter ranging from 0 to 1. When `r = 0`, the exponent `n` equals 2, producing an exact geometric circle. When `r = 0.25`, the exponent evaluates to approximately 3.875, matching the classic squircle used in modern industrial design. When `r = 1.0`, the exponent reaches 32, which visually produces a sharp square with slight corner easing.

Squaring `r` concentrates slider resolution near the circular end of the spectrum, where the human eye is most sensitive to curvature changes. The exact path calculation in `src/engine/renderer/shapePath.ts` fits four cubic bezier curves for exponents up to 8. For exponents above 8, it transitions to a rounded square whose corner radius contracts as `n` grows.

## Lattices and integer text layout

<!-- VISUAL: kind=card · what=p8xka5g4 · notice=train departure rows place 5x7 bitmap characters directly onto grid cells without anti-aliasing -->

If you draw a large numeral by clustering dozens of tiny dots together, the number looks like a broken mosaic. Hardware displays avoid this by changing physical pitch. Large digits on train departure boards use large physical indicators spaced further apart.

Dot/480 adopts this principle through lattices. In `src/engine/layout.ts`, elements can be sampled on a coarser lattice multiplier. A lattice multiplier of 2 evaluates every second cell and scales dot diameter accordingly. The element feels monolithic because each dot is larger, keeping the visual rhythm unified.

Text requires special care. Traditional vector fonts rasterized with subpixel anti-aliasing look blurry when sampled onto a coarse grid. Dot/480 uses dedicated bitmap dot fonts stored as boolean bit arrays, defined in `src/engine/fields/bitmapFont.ts`. Standard Latin characters and digits use a 5x7 cell grid.

To keep bitmap text crisp, every character must anchor to exact integer cell coordinates. Converting floating-point field coordinates to integer cell indices is handled by `toCell`:

```typescript
export const toCell = (u: number, n: number) => Math.round(u * (n - 1))
```

Layout functions like `placeCells`, `textAt`, `rectCells`, and `hRule` operate entirely in cell space. When a digit is placed at column 12 and row 8, its font pixels land directly on cell centres. No fractional interpolation occurs.

## Choosing a renderer and managing performance

<!-- VISUAL: kind=card · what=dykmba98 · notice=the circular countdown ring animates smoothly at sixty frames per second -->

Dot/480 supports two primary rendering targets in `src/engine/renderer/`:

1. **SVG Renderer (`svgRenderer.ts`).** Best for static or low-frequency cards with fewer than 2,000 dots. SVG outputs semantic `<circle>` or `<path>` elements inside an `<svg>` root. The output is resolution-independent, inspectable in browser developer tools, and directly copyable as vector artwork.
2. **Canvas Renderer (`canvasRenderer.ts`).** Required for animated cards, interactive surfaces, and grids containing more than 2,000 dots. The canvas renderer draws directly into an HTML5 2D context using `arc` or precomputed `Path2D` objects.

A 60 frames per second budget provides 16.6 milliseconds per frame. A 144x144 card contains 20,736 dots. Evaluating a complex field and rendering 20,736 bezier paths on every animation frame can consume the entire frame budget.

To maintain 60 frames per second, the engine enforces three performance rules:
- **Spatial bounds skipping.** Fields declare cell bounding boxes `[c0, r0, c1, r1]` using `bounded()` in `src/engine/layout.ts`. The sampler loops only over active cells and skips surrounding empty space.
- **Path pre-compilation.** For a given dot shape and quantized radius step, `Path2D` instances are cached. The renderer calls `ctx.fill(cachedPath)` with a translation matrix instead of recomputing geometry.
- **Dirty rect blitting.** Unchanged background cells are preserved between frames, redrawing only dots whose underlying field values have changed.

## Color and accessibility

<!-- VISUAL: kind=card · what=4ar5v8y4 · notice=a single red status dot marks the active device card against cool grey dots -->

Color design in Dot/480 follows a strict discipline described in `DESIGN.md`. There is exactly one accent color across the entire system: Signal Red (`#FF3B30`), mapped to the token `dotActive`. It is reserved for active states, live recordings, warnings, and running progress indicators.

Every other dot on the board is rendered in cool neutral greys on a near-black background (`#070809`):
- `dotIdle` (`#8A8F98`): Full brightness for static text and inactive values.
- `dotMid` (`#5B5F66`): Intermediate field values and quiet progress tracks.
- `dotFaint` (`#2E3033`): Subtle grid guides and inactive borders.

Contrast ratios adhere to WCAG 2.1 AA standards. Primary text values in `dotIdle` on card surface (`#111315`) achieve a 5.6:1 contrast ratio. Secondary labels in `mute` (`#81858B`) achieve 4.7:1.

For accessibility, canvas elements carry `role="img"` with an `aria-label` describing current card state in plain language. Screen readers announce the textual values, while the canvas presents the dot grid visually.

## Direction: widgets in dots

<!-- VISUAL: kind=card · what=mkf3sd15 · notice=weather temperature curve plots across dotted grid columns with high and low markers -->

Once the core pipeline is operational, interface widgets are assembled by combining fields:

- **Clocks and timers.** Digits render using `textAt`, framed by an outer circular arc drawn with `ringCells`. A blinking colon toggles by modulating field amplitude with `Math.floor(t * 2) % 2`.
- **Meters and gauges.** A horizontal level meter samples a step function: values below the current metric return 1.0, while values above return 0.0. The highest active dot receives the Signal Red accent color.
- **Buttons and switches.** Interactive hit areas track pointer input. When clicked, an internal spring variable animates an outward ripple field that sweeps across the button's dot lattice.
- **Sparklines and charts.** Time series data maps to a vertical distance field. Points on the curve output 1.0, and cells fall off exponentially with distance from the trend line.

## Recreating the engine

<!-- VISUAL: kind=steps · what=minimal-engine-pipeline · notice=code snippets compile from raw field equation to canvas pixels -->

The following four TypeScript snippets provide a complete, self-contained dot engine that you can copy directly into a project.

### 1. The 40-line canvas dot renderer

Save this as `DotCanvas.ts`. It initializes a canvas, samples a field, and draws circular dots.

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

### 2. A continuous radial field

This function produces an animated pulsating disc centered on the surface:

```typescript
export function pulsatingDisc(cx = 0.5, cy = 0.5, baseRadius = 0.3): Field {
  return (u: number, v: number, t: number) => {
    const dx = u - cx
    const dy = v - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const currentRadius = baseRadius + 0.08 * Math.sin(t * 3)
    const edgeSoftness = 0.06
    const delta = (currentRadius - dist) / edgeSoftness
    return Math.max(0, Math.min(1, delta))
  }
}
```

### 3. A sampler with superellipse squircle support

This sampler handles superellipse paths using the `n = 2 + 30r^2` formula:

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

  // Four cubic bezier arcs approximating a superellipse
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

### 4. A dot-matrix progress meter widget

This widget creates an animated progress bar with a numeric percentage display:

```typescript
export class DotProgressMeter {
  constructor(private engine: DotCanvas) {}

  makeField(progress: number, label: string): Field {
    return (u: number, v: number, t: number) => {
      // Progress bar occupies vertical region 0.65 to 0.85
      if (v >= 0.65 && v <= 0.85) {
        const barLength = 0.8
        const left = 0.1
        if (u < left || u > left + barLength) return 0.05
        const normX = (u - left) / barLength
        if (normX <= progress) return 1.0
        return 0.15
      }

      // Background ambient wave pattern
      const wave = 0.1 * Math.sin(u * 12 + t * 2) * Math.cos(v * 8)
      return Math.max(0, wave)
    }
  }

  update(progress: number, t: number): void {
    const field = this.makeField(progress, `${Math.round(progress * 100)}%`)
    this.engine.render(field, t, 5, '#FF3B30')
  }
}
```

You now have a complete, working dot engine pipeline. The mathematical fields supply the shapes, the sampler standardizes them across regular cells, and the renderer puts physical-feeling light onto the screen.
