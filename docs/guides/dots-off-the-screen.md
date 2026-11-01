# Dots off the screen

<!-- VISUAL: kind=card · what=b4rdznv2 · notice=the timer displays across browser canvas, LED matrix, e-ink and plotter -->

For the foundation of fields, samplers and dot rendering, see [build-your-own-dot-engine.md](build-your-own-dot-engine.md).

Most user interfaces are bound to the glowing glass of phone screens and desktop monitors. When an engineer attempts to bring an interface card onto a custom hardware project, the software stack often collapses. Web styling assumptions, anti-aliased subpixels, and RGB color palettes do not translate cleanly to an 800x480 e-ink panel, an electromechanical flip-disc sign, or an addressable LED matrix.

This guide explains how to drive physical output devices from a single dot field. You will learn how device profiles resample graphics to physical dimensions, how to manage hardware constraints like 1-bit tone depth and refresh latency, how blue-noise and error diffusion preserve readability on e-ink, and how to convert dots into optimized pen-plotter toolpaths.

## One field, many devices

<!-- VISUAL: kind=card · what=pbq54zfr · notice=partial refresh updates change dots while earlier frames leave ghost marks -->

Hardware displays vary widely in resolution, aspect ratio, and physical pitch:
- A round LED display might offer 25x25 circular light nodes spaced at 1.5 millimetres.
- An e-ink reader like the 7.5-inch TRMNL panel provides an 800x480 matrix of crisp square pixels at 0.2 millimetres.
- A bus station flip-disc sign features a 28x14 grid of magnetic plastic discs spaced at 10 millimetres.
- A mechanical pen plotter draws ink paths across an A6 paper sheet using a 48x48 dot grid.

In Dot/480, cards avoid hardcoding target pixel grids. Instead, every target hardware panel is defined as a `DeviceProfile` in `src/engine/device/profile.ts`. A profile encapsulates physical dimensions, tone depth, dot geometry, and simulated physical dynamics:

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

If a card author provided curated variant layouts for specific small dimensions (like `'25x25'`), `toDevice()` selects that curated variant directly. For larger or arbitrary dimensions, it resamples the authored field into device space automatically.

## Device limits and physical dynamics

<!-- VISUAL: kind=card · what=j5s95f8j · notice=continuous grey values become discrete stipples on the 25x25 LED matrix -->

Physical hardware introduces physical boundaries that do not exist in a browser canvas:

1. **Monochrome bit depth.** Many e-ink panels and flip-disc boards support only 1 bit per pixel: a dot is either completely black or completely white. There are no native greys. Monochrome panels also lack red color filters. In `toDevice()`, the single Signal Red accent (`#FF3B30`) maps to full white brightness (1.0). In a monochrome interface, the accent represents the most energetic visual element on screen.

Hardware designers must also consider cell polarity. Certain panels, like reflective LCDs or electrophoretic ink, read as black pigment on light paper. Emissive LED panels produce bright light on dark backgrounds. In `src/components/editor/devices.ts`, profiles declare whether they operate in paper mode or emissive mode, inverting output bitmaps where appropriate.
2. **Refresh latency and ghosting.** An e-ink display cannot refresh at 60 Hz. A partial refresh takes approximately 0.32 seconds (`partialS`). A full clearing flash takes 0.9 seconds (`fullS`). To prevent dark ghosting artifacts, firmware controllers trigger a full flashing cycle every 10 partial updates (`fullEvery: 10`). Software driving e-ink panels must throttle frame delivery to 1 Hz or trigger updates only on significant state changes.
3. **Electromechanical inertia.** Flip-disc signs update column by column with a 20-millisecond delay between columns (`columnS: 0.02`). Each physical disc is a magnetic rotor with mass. When flipped, the disc oscillates around its axis with natural frequency $\omega = 60\text{ rad/s}$ and damping ratio $\zeta = 0.32$, creating a momentary flutter before snapping flat.
4. **Optical bloom.** Bright LEDs encased beneath diffuse plastic lenses do not stop at cell borders. A lit diode leaks roughly 14% of its light into its eight neighboring cells (`bloom: 0.14`). Firmware must account for this point spread function, avoiding adjacent high-intensity clusters that wash out legibility.

## Dithering and halftone for 1-bit panels

<!-- VISUAL: kind=card · what=tgayvr46 · notice=magnetic discs flip column by column with visible mechanical delay -->

Mapping a continuous 8-bit image to a 1-bit display using a simple 50% threshold produces harsh, broken graphics. Thin lines vanish, and soft gradients become solid monochrome cliffs.

To retain perceived tone gradations on 1-bit devices, Dot/480 applies blue-noise ordered dithering and error diffusion, implemented in `src/engine/halftone/mask.ts`.

Blue-noise dithering distributes quantization errors into high spatial frequencies. Because human vision is least sensitive to high-frequency noise, the stippled dots appear to blend into smooth grey tones when viewed from normal reading distance. The dithering lookup compares incoming linear light against a spatio-temporal blue noise texture (`stbn`). If the field value exceeds the threshold at cell `(x % 64, y % 64)`, the pixel turns on.

For static e-ink dashboards, Floyd-Steinberg error diffusion offers an alternative approach. As the algorithm steps across the grid row by row, the rounding error between the continuous input value (e.g. 0.72) and the quantized output (1.0) distributes to neighboring unprocessed cells:

$$\text{Error} = \text{Input} - \text{Quantized}$$
$$\text{Right: } \frac{7}{16} \cdot \text{Error}, \quad \text{Down-Left: } \frac{3}{16} \cdot \text{Error}, \quad \text{Down: } \frac{5}{16} \cdot \text{Error}, \quad \text{Down-Right: } \frac{1}{16} \cdot \text{Error}$$

This ensures that total light energy is conserved across every local patch of dots.

## Exporting images and plotter pen plans

<!-- VISUAL: kind=card · what=jfm4e97e · notice=pen loops trace concentric circles with greedy path routing between dots -->

Putting dots into the physical world requires exporting files formatted for downstream hardware tools:

- **Per-device PNG images.** In `src/components/editor/Review.tsx` and `src/components/editor/devices.ts`, the editor exports a 1:1 pixel PNG for every configured profile. For the TRMNL panel, it outputs an uncompressed 800x480 1-bit PNG ready for HTTP deployment over Wi-Fi.
- **Pen plotter SVG plans.** Drawing a dot matrix with an AxiDraw or Roland pen plotter requires translating dot coordinates into vector toolpaths. In `src/engine/device/plotter.ts`, each lit pixel at tone level $k$ is converted into $k$ concentric circular pen loops.

Because mechanical pen travel between dots consumes significant time, the plotter exporter applies a greedy nearest-neighbor path optimization:

1. Collect all active cells that require pen strokes.
2. Start the pen at the home coordinate `(0, 0)`.
3. Locate the nearest unvisited dot to the pen's current position.
4. Draw concentric circular loops for that cell.
5. Move directly to the next nearest dot without lifting the pen further than necessary.

This path routing reduces total pen-up travel time by up to 60%, protecting delicate pen tips and accelerating print jobs.

## Direction: physical computing and low-power screens

<!-- VISUAL: kind=card · what=4ar5v8y4 · notice=device telemetry status updates once per minute on low-power display -->

Decoupling dot fields from browser runtimes opens opportunities across physical computing:

- **Ultra-low-power ambient dashboards.** An ESP32 microcontroller paired with an 800x480 e-ink panel can operate on a rechargeable lithium battery for months. The microcontroller wakes from deep sleep once every five minutes, fetches a 48 kB 1-bit bitmap over Wi-Fi, updates the display controller, and returns to sleep.
- **Electromechanical office signage.** A 28x14 magnetic flip-disc sign mounted in a workplace lobby can display real-time CI/CD deployment statuses, live server health meters, or transit departure schedules. The mechanical click of flipping discs alerts onlookers to status changes without distracting glowing screens.
- **Archival plotter prints.** Digital generative fields can be rendered directly onto heavy cotton paper with archival pigment pens. The discrete dot patterns reveal mechanical pen strokes, creating physical artifacts that celebrate digital constraints.
- **Binary serial streaming.** For real-time LED arrays running at 30 Hz, text formats like JSON add excessive packet overhead. Packing 1-bit or 4-bit dot states into raw binary byte streams allows microcontrollers to receive frames across USB-serial or SPI buses without incurring parsing latency.

## Recreating the hardware pipeline

<!-- VISUAL: kind=steps · what=device-resample-pipeline · notice=card dots resample onto device grid and map to bit depths -->

The following four self-contained snippets provide the essential tools for driving external hardware devices.

### 1. Resampling a field to a custom grid

Save this as `DeviceResampler.ts`. It samples a continuous field onto any arbitrary column and row configuration.

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
  // Copy to mutable buffer for error accumulation
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

### 3. ESP32 microcontroller LED matrix receiver

Save this as `esp32_matrix.ino`. It receives uncompressed dot bytes over UDP and pushes them to a MAX7219 or WS2812 matrix.

```cpp
#include <WiFi.h>
#include <WiFiUdp.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

WiFiUDP udp;
const int localPort = 4800;
const int MATRIX_WIDTH = 25;
const int MATRIX_HEIGHT = 25;
const int BUFFER_SIZE = MATRIX_WIDTH * MATRIX_HEIGHT;

uint8_t frameBuffer[BUFFER_SIZE];

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
  udp.begin(localPort);
  Serial.printf("Listening on UDP port %d\n", localPort);
}

void loop() {
  int packetSize = udp.parsePacket();
  if (packetSize >= BUFFER_SIZE) {
    udp.read(frameBuffer, BUFFER_SIZE);

    // Push bytes to LED shift registers
    for (int y = 0; y < MATRIX_HEIGHT; y++) {
      for (int x = 0; x < MATRIX_WIDTH; x++) {
        uint8_t brightness = frameBuffer[y * MATRIX_WIDTH + x];
        // Drive physical LED pin or WS2812 strip buffer here:
        // setPixelBrightness(x, y, brightness);
      }
    }
    // updateMatrixLeds();
  }
}
```

### 4. Generating SVG pen plotter paths

Save this as `PlotterExport.ts`. It turns a 2-bit dot grid into concentric vector toolpaths with greedy routing.

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

    // Greedy nearest-neighbor tour
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

These techniques decouple your interface from browser viewports. By mastering device profiles, 1-bit dithering, and hardware serialization, you can bring the dot-matrix aesthetic to any physical surface.
