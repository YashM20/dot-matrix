# Dots off the screen

<!-- VISUAL: kind=card · what=surface-browser · notice=the timer card rendered as circular dots on a 144x144 canvas -->

For the foundation of fields, samplers and dot rendering, see [build-your-own-dot-engine.md](build-your-own-dot-engine.md).

Most interfaces are made for screens. When bringing an interface card to a physical panel, web styling, anti-aliased subpixels and RGB palettes do not translate directly to an 800×480 e-ink panel, an electromechanical flip-disc sign or an addressable LED matrix.

This guide explains how to drive physical output devices from a single dot field by following one modest first build: a small 1-bit panel. You will see how device profiles resample graphics to physical dimensions, how to manage hardware limits like 1-bit tone depth and refresh latency, how blue-noise and error diffusion preserve readability on e-ink, and how to convert dots into pen-plotter toolpaths.

## One field, many devices

<!-- VISUAL: kind=card · what=surface-eink · notice=the timer card on e-ink with partial refreshes and ghosting -->

Hardware displays vary in resolution, aspect ratio and physical pitch:
- A round LED display offers 25×25 circular light nodes spaced at 1.5 mm.
- An e-ink reader like the 7.5-inch TRMNL panel provides an 800×480 matrix of square pixels at 0.2 mm.
- A bus station flip-disc sign features a 28×14 grid of magnetic plastic discs spaced at 10 mm.
- A mechanical pen plotter draws ink paths across an A6 paper sheet using a 48×48 dot grid.

In Dot/480, cards avoid hardcoding target pixel grids. Instead, every target hardware panel is defined as a `DeviceProfile` in `src/engine/device/profile.ts`. A profile encapsulates physical dimensions, tone depth, dot geometry and simulated physical dynamics:

```typescript
export const DEVICES = {
  browser: { id: 'browser', cols: 144, rows: 144, bits: 8, tones: { map: 'linear', gamma: 2.2 }, pitch: 0.6, dotShape: 'circle', refresh: 60 },
  'glyph-matrix-25': { id: 'glyph-matrix-25', cols: 25, rows: 25, mask: 'round', bits: 8, tones: { map: 'linear', gamma: 2.2 }, pitch: 1.5, dotShape: 'circle', refresh: 60, physics: { kind: 'led', bloom: 0.14, offGlow: 0.05 } },
  'trmnl-800x480': { id: 'trmnl-800x480', cols: 800, rows: 480, bits: 1, tones: { map: 'blueNoise' }, pitch: 0.2, dotShape: 'square', refresh: 1, physics: { kind: 'eink', fullEvery: 10, partialS: 0.32, fullS: 0.9, ghost: 0.3, ghostDecay: 0.8 } },
  'flipdisc-28x14': { id: 'flipdisc-28x14', cols: 28, rows: 14, bits: 1, tones: { map: 'threshold', threshold: 0.5 }, pitch: 10, dotShape: 'disc', refresh: 1, physics: { kind: 'flipdisc', columnS: 0.02, omega: 60, zeta: 0.32 } },
  plotter: { id: 'plotter', cols: 48, rows: 48, bits: 2, tones: { map: 'blueNoise' }, pitch: 2, dotShape: 'pen', refresh: 0, physics: { kind: 'plotter', drawSpeed: 90, travelSpeed: 260, loop: 0.42, pen: 0.14 } },
}
```

Resampling a card onto a hardware profile is handled by `toDevice()` in `src/engine/device/toDevice.ts`. The algorithm performs an area-weighted splat. Each dot from the authored card is treated as a light emitter whose luminous energy spreads across the target device cells it covers.

If a card author provided curated variant layouts for specific small dimensions (like `'25x25'`), `toDevice()` selects that curated variant directly. For other dimensions, it resamples the authored field into device space automatically.

## Device limits and physical dynamics

<!-- VISUAL: kind=card · what=surface-glyph · notice=the timer card sampled onto a round 25x25 LED matrix -->

Physical hardware introduces physical boundaries:

1. **Monochrome bit depth.** Many e-ink panels and flip-disc boards support only 1 bit per pixel: a dot is on or off. There are no native greys. Monochrome panels also lack red color filters. In `toDevice()`, the single Signal Red accent (`#FF3B30`) maps to full white brightness (1.0). In a monochrome interface, the accent represents the most energetic visual element on screen.

Profiles declare whether they operate in paper mode or emissive mode in `src/components/editor/devices.ts`. Reflective e-ink and plotters use ink on paper, whereas LED matrices use light on a dark ground.
2. **Refresh latency and ghosting.** An e-ink display cannot refresh at 60 Hz. A partial refresh takes approximately 0.32 s (`partialS`). A full clearing flash takes 0.9 s (`fullS`). To prevent ghosting artifacts, firmware controllers trigger a full flashing cycle every 10 partial updates (`fullEvery: 10`). Pixels cleared on a partial refresh retain 30% ghost ink (`ghost: 0.3`), fading by 20% each partial (`ghostDecay: 0.8`).
3. **Electromechanical inertia.** Flip-disc signs update column by column with a 20 ms delay between columns (`columnS: 0.02`). Each physical disc is a magnetic rotor with mass. When flipped, the disc oscillates around its axis with natural frequency $\omega = 60\text{ rad/s}$ and damping ratio $\zeta = 0.32$, creating a momentary flutter before settling flat.
4. **Optical bloom.** Bright LEDs encased beneath diffuse plastic lenses do not stop at cell borders. A lit diode leaks roughly 14% of its light into its eight neighbouring cells (`bloom: 0.14`). Firmware must account for this point spread function, avoiding adjacent high-intensity clusters that wash out legibility.

## Dithering and halftone for 1-bit panels

<!-- VISUAL: kind=card · what=surface-flipdisc · notice=the timer card on a 28x14 flip-disc panel flipping column by column -->

Mapping a continuous 8-bit image to a 1-bit display using a 50% threshold produces broken graphics. Thin lines vanish, and soft gradients become solid monochrome cliffs.

To retain perceived tone gradations on 1-bit devices, Dot/480 applies blue-noise ordered dithering and error diffusion, implemented in `src/engine/halftone/mask.ts`.

Blue-noise dithering distributes quantization errors into high spatial frequencies. Because human vision is least sensitive to high-frequency noise, the stippled dots blend into smooth grey tones when viewed from normal reading distance. The dithering lookup compares incoming linear light against a spatio-temporal blue noise texture (`stbn`). If the field value exceeds the threshold at cell `(x % 64, y % 64)`, the pixel turns on.

For static e-ink dashboards, Floyd-Steinberg error diffusion offers an alternative approach. As the algorithm steps across the grid row by row, the rounding error between the continuous input value (e.g. 0.72) and the quantized output (1.0) distributes to neighbouring unprocessed cells:

$$\text{Error} = \text{Input} - \text{Quantized}$$
$$\text{Right: } \frac{7}{16} \cdot \text{Error}, \quad \text{Down-Left: } \frac{3}{16} \cdot \text{Error}, \quad \text{Down: } \frac{5}{16} \cdot \text{Error}, \quad \text{Down-Right: } \frac{1}{16} \cdot \text{Error}$$

This ensures that total light energy is conserved across every local patch of dots.

## Exporting images and plotter pen plans

<!-- VISUAL: kind=card · what=surface-plotter · notice=the timer card drawn as concentric pen loops by an A6 pen plotter -->

Putting dots into the physical world requires exporting files formatted for downstream hardware tools:

- **Per-device PNG images.** In `src/components/editor/Review.tsx` and `src/components/editor/devices.ts`, the editor exports a PNG for every configured profile. Each image scales by integer factors (`exportScale`) to roughly 480 px on the long side (never below 1×). For the TRMNL panel, it outputs an 800×480 PNG at 1× scale.
- **Pen plotter SVG plans.** Drawing a dot matrix with a pen plotter requires translating dot coordinates into vector toolpaths. In `src/engine/device/plotter.ts`, each lit pixel at tone level $k$ is converted into $k$ concentric circular pen loops. Pixels are visited in greedy nearest-neighbour order from the origin `(0, 0)` to minimize pen-up travel.
- **Microcontroller bytecode compilation.** The repository provides a compilation script in `targets/esp32/send.ts`. It compiles a Field IR program into bytecode and sends it to the ESP32 sketch (`targets/esp32/sketch/main.cpp`) over HTTP (`POST /program` with hex text) or a serial port as lines (`P <hex>\n`), with data keys sent as `POST /data?key=value` or `D <key> <value>\n`.

## Direction: physical computing and low-power screens

<!-- VISUAL: kind=card · what=device-overview · notice=device telemetry status on a ring with active alerts -->

Decoupling dot fields from browser runtimes opens opportunities across physical computing:

- **Low-power ambient displays.** An ESP32 microcontroller paired with an e-ink panel can update periodically from deep sleep, drawing power only during display refresh cycles.
- **Electromechanical office signage.** A 28×14 magnetic flip-disc sign mounted in a workplace lobby can display deployment statuses, server health meters or transit schedules. The mechanical click of flipping discs alerts onlookers without glowing screens.
- **Archival plotter prints.** Digital generative fields can be rendered directly onto heavy paper with pigment pens. The discrete dot patterns reveal mechanical pen strokes, creating physical artifacts that reflect digital constraints.
- **Binary serial streaming.** For real-time LED arrays running at 30 Hz, packing 1-bit dot states into raw byte arrays allows microcontrollers to receive frames across USB-serial or SPI buses without text parsing overhead.

## Recreating the hardware pipeline

<!-- VISUAL: kind=steps · what=device-resample-pipeline · notice=card dots resample onto device grid and map to bit depths -->

The following four self-contained TypeScript snippets provide the pipeline for driving a small 1-bit panel and generating plotter paths.

### 1. Resampling a field to a custom grid

Save this as `DeviceResampler.ts`. It samples a continuous field onto any column and row configuration.

```typescript
export interface Field {
  (u: number, v: number): number
}

export function resampleToDeviceGrid(
  field: Field,
  cols: number,
  rows: number
): Float32Array {
  const output = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / rows
    const rowOffset = r * cols
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols
      const value = field(u, v)
      output[rowOffset + c] = Math.max(0, Math.min(1, value))
    }
  }
  return output
}
```

### 2. 1-bit Floyd-Steinberg error diffusion

Save this as `ErrorDiffusion.ts`. It converts continuous grey levels into a binary 1-bit bitmap suitable for e-ink panels.

```typescript
export function ditherFloydSteinberg(
  input: Float32Array,
  width: number,
  height: number
): Uint8Array {
  const buffer = new Float32Array(input)
  const output = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const idx = row + x
      const oldVal = buffer[idx]
      const newVal = oldVal >= 0.5 ? 1.0 : 0.0
      output[idx] = newVal > 0 ? 1 : 0

      const err = oldVal - newVal

      if (x + 1 < width) {
        buffer[idx + 1] += err * (7 / 16)
      }
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += err * (3 / 16)
        buffer[idx + width] += err * (5 / 16)
        if (x + 1 < width) buffer[idx + width + 1] += err * (1 / 16)
      }
    }
  }

  return output
}
```

### 3. Packing 1-bit pixels into row bytes

Save this as `Pack1Bit.ts`. It packs 1-bit pixel arrays into byte arrays (8 pixels per byte, MSB first) for transmission to small display controllers or LED shift registers.

```typescript
export function pack1BitRows(pixels: Uint8Array, cols: number, rows: number): Uint8Array {
  const rowBytes = Math.ceil(cols / 8)
  const packed = new Uint8Array(rowBytes * rows)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pixels[r * cols + c]) {
        const byteIndex = r * rowBytes + (c >> 3)
        packed[byteIndex] |= 0x80 >> (c & 7)
      }
    }
  }

  return packed
}
```

### 4. Generating SVG pen plotter paths

Save this as `PlotterExport.ts`. It turns a 2-bit dot grid into concentric vector toolpaths with greedy nearest-neighbour routing.

```typescript
export interface Point { x: number; y: number }

export class PlotterExport {
  constructor(public cols: number, public rows: number, public pitchMm = 2.0) {}

  generateSVG(dots: Uint8Array, maxLevel = 3): string {
    const { cols, rows, pitchMm } = this
    const todo: { x: number; y: number; level: number }[] = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const level = dots[r * cols + c]
        if (level > 0) {
          todo.push({ x: (c + 0.5) * pitchMm, y: (r + 0.5) * pitchMm, level })
        }
      }
    }

    // Greedy nearest-neighbour tour
    const visited = new Uint8Array(todo.length)
    let curX = 0
    let curY = 0
    const paths: string[] = []

    for (let step = 0; step < todo.length; step++) {
      let bestDist = Infinity
      let bestIdx = -1

      for (let i = 0; i < todo.length; i++) {
        if (visited[i]) continue
        const d = Math.hypot(todo[i].x - curX, todo[i].y - curY)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }

      visited[bestIdx] = 1
      const item = todo[bestIdx]
      curX = item.x
      curY = item.y

      // Draw concentric loops proportional to tone level
      const maxRadius = (pitchMm * 0.8) / 2
      for (let loop = 1; loop <= Math.min(item.level, maxLevel); loop++) {
        const radius = (loop / maxLevel) * maxRadius
        paths.push(
          `<circle cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="none" stroke="black" stroke-width="0.3"/>`
        )
      }
    }

    const svgWidth = (cols * pitchMm).toFixed(2)
    const svgHeight = (rows * pitchMm).toFixed(2)

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}mm" height="${svgHeight}mm" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
      paths.join('\n'),
      '</svg>'
    ].join('\n')
  }
}
```

### Try this

Run `resampleToDeviceGrid` with a radial gradient field on a 24×24 grid, then pass the result through `ditherFloydSteinberg`. Print the output to your terminal as ASCII dots (`.` and `#`) to observe how the error diffusion redistributes tone energy without greys.

### Next experiment

Pipe the packed output of `pack1BitRows` to an SSD1306 OLED controller or an attached microcontroller over USB serial at 115,200 baud.
