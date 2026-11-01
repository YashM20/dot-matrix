# Living matter

<!-- VISUAL: kind=card · what=pond-koi · notice=six koi swim across a pond of glyph tiles, turning as they steer -->

For the foundation of fields, samplers and dot rendering, see [build-your-own-dot-engine.md](build-your-own-dot-engine.md).

Digital generative art often looks cold and detached from the physical world. Polygons clip without resistance, and random numbers change on every refresh. A physical surface behaves differently. Water holds momentum, living organisms navigate around boundaries, fabric catches light along woven threads, and touched surfaces slowly settle back to rest.

This guide explains how to build physical simulations and tactile materials inside a dot-matrix engine by following one ambient piece: a touchable ripple pond. You will see how wave equations and autonomous steering agents turn into fields, how compound bodies use glyph tiles, how to maintain bit-exact determinism across devices, how raking light reveals surface relief, and how dots merge into connected squares.

## Simulations as live fields

<!-- VISUAL: kind=card · what=pond-jelly · notice=three moon jellies pulse and coast across the dot field -->

In standard game engines, simulations update particle arrays or physics colliders, and a separate graphics engine draws sprites over the top. Dot/480 treats the simulation itself as a continuous field.

Consider the living koi pond in `src/engine/life/pond.ts` and `src/engine/life/ripple.ts`. The water surface is governed by the Hugo Elias 2D wave equation. The solver allocates two height planes, current plane `H` and previous plane `P`, stored in a single flat `Float32Array`.

On each simulation tick at `dt = 1/30`, the solver updates height values using a five-point stencil:

$$h'(x, y) = \frac{(h(x-1, y) + h(x+1, y) + h(x, y-1) + h(x, y+1))}{2} - h_{prev}(x, y)$$

The result is multiplied by a damping factor of 0.984 per step, keeping about 30% of wave amplitude after 2.5 s. When a disturbance drops into the water, a wave spreads outward in concentric rings. When it strikes a boundary cell marked with mask 0, it reflects inverted. The scheme is stable at Courant number $1/\sqrt{2}$ cells per step, crossing a 36-cell pond in about 1.7 s.

Koi swim through this height field using autonomous steering rules defined in `src/engine/life/steer.ts`, based on Craig Reynolds' flocking principles. Each fish agent maintains position, heading vector and speed. Behaviors contribute weighted acceleration vectors:
- **Seek.** Directs the fish toward food pellets or cursor taps.
- **Flee.** Pushes the fish away from rapid pointer movements.
- **Wander.** Adds smooth angular perturbation driven by 2D simplex noise.
- **Contain.** Evaluates a signed distance field to keep fish inside pond borders.
- **Separate.** Prevents fish from colliding with school neighbours.

As the koi swim, their moving bodies deposit momentum into the ripple field. The fish displace the water, and the resulting ripples distort the dots representing the pond bed beneath them.

## Compound bodies in glyph tiles and determinism

<!-- VISUAL: kind=card · what=pond-marble · notice=suminagashi ink trails combed across the water by swimming koi -->

Drawing organic creatures on a coarse dot grid presents geometric challenges. If you rotate a polygon mesh across a 32×32 grid, fine details flicker and disappear as vertices cross cell thresholds.

Dot/480 solves this with glyph tiles, implemented in `src/engine/life/glyphTiles.ts` and `src/engine/life/body.ts`. Creatures are composed of discrete kinematic segments connected by spine joints. Each segment references an entry in a curated glyph table.

A koi has a rounded head tile, broad pectoral fin tiles, three tapering body tiles, and a flexible tail fin. As the fish steers, spine angles compute along the kinematic chain. The engine selects pre-rasterized dot tiles corresponding to the nearest quantized heading angle (typically 16 discrete orientations). This maintains solid structural silhouette shapes without aliasing artifacts.

Ambient installations require reproducibility. If an artwork runs in an exhibition lobby for months, it must produce identical frames when restarted from a given seed. It must not drift due to differences in browser JavaScript runtimes.

Standard JavaScript mathematical functions diverge across browsers. Different engines use different polynomial approximations for `Math.sin`, `Math.cos` and `Math.atan2`. Over thousands of simulation frames, tiny differences in the 15th decimal place compound into divergences.

Dot/480 achieves bit-exact reproducibility through three systems:
- **Seeded pseudo-random generator.** The engine uses the `mulberry32` PRNG in `src/engine/sampler/jitter.ts`. Given the same 32-bit integer seed, it emits identical random numbers on any device.
- **Table-driven math.** High-precision trigonometry in `src/engine/noise/dmath.ts` replaces native functions with Cody-Waite range reduction and fixed Taylor polynomials.
- **Fixed time-step loop.** Physics worlds defined in `src/engine/physics/world.ts` advance with a constant delta time `dt = 1/30` or `dt = 1/60`. Frame drops skip rendering passes instead of inflating physics delta times.

## Materials: height, normals and raking light

<!-- VISUAL: kind=card · what=light-matte · notice=a moving light casts diffuse highlights across surface bumps -->

Dot/480 can turn any two-dimensional field into a tactile material such as stone, wood, leather or woven fabric. This system is implemented in `src/engine/matter/relief.ts` and `src/engine/light/shade.ts`.

The material pipeline operates in four steps:

1. **Height map creation.** A continuous field or bitmap is evaluated to create a height raster `H(x, y)`. Veins in marble come from domain-warped turbulence. Grain in wood comes from concentric cylinders perturbed by low-frequency noise.
2. **Surface normal calculation.** Surface gradients are computed using central finite differences:
   $$N_x = \frac{H(x-1, y) - H(x+1, y)}{2}$$
   $$N_y = \frac{H(x, y-1) - H(x, y+1)}{2}$$
   $$N_z = 1.0$$
   Normalizing this vector produces a 3D unit normal vector `N` at every dot cell.
3. **Lighting evaluation.** A light source `L` is positioned in space. It can be a distant directional light (such as the sun at azimuth $\theta$ and elevation $\phi$) or a local point light (such as a torch tracking the user pointer). Shading combines three terms:
   - **Diffuse.** Lambertian reflection $I_d = \max(0, N \cdot L)$.
   - **Specular.** Blinn-Phong highlight $I_s = (N \cdot H)^{shininess}$, where $H$ is the halfway vector between light and viewer.
   - **Sheen.** Anisotropic scattering across woven thread directions in textiles (`src/engine/matter/knit.ts`).
4. **Matcap texturing.** For materials like chrome, mercury or polished obsidian, `src/engine/matter/matcap.ts` maps surface normals directly to texture coordinates on a pre-rendered sphere.

## Dots that join into squares

<!-- VISUAL: kind=card · what=sq-tetris · notice=falling tetromino pieces fuse into solid joined shapes when settled -->

In a standard dot matrix, every cell renders an isolated round dot. Certain physical displays, like flip-disc boards and split-flap indicators, use square tiles. In other cases, graphic elements like buttons, progress blocks and retro gaming shapes look better when adjacent dots fuse into solid geometric slabs.

This fusion is implemented in `src/engine/squares/sampler.ts` and `src/engine/squares/geometry.ts`. The algorithm avoids arbitrary 2×2 thresholds. Instead, during the join pass in `sampler.ts`, each active cell evaluates its orthogonal neighbours. If adjacent cells share the same tone index and quantized step, bits are recorded in a per-cell join mask.

In `geometry.ts`, each cell quadrant draws with joined half-extents expanded toward lit neighbours. The geometry pass applies a bleed offset along joined sides to eliminate seams, a convex outer corner radius (`ro`) where boundaries meet empty space, and an inner fillet (`ri`) at internal junctions. Adjacent dots fuse into cohesive geometric shapes that keep clean corner curvatures.

## Direction: ambient installations and healing trace

<!-- VISUAL: kind=card · what=mat-marble · notice=time digits cut into marble, lit by a raking light source -->

A dot display can sit in a room and change slowly through the day:

- **Circadian awareness.** An installation connected to a real-time clock adjusts its lighting direction and tone depth over 24 hours. At dawn, light strikes from a low eastern angle with soft diffuse fill. At noon, light shines from directly overhead with sharp specular contrasts. At night, the field dims to faint amber embers.
- **The healing trace.** When a visitor touches the screen or moves a pointer across the dots, the interaction leaves an energetic trail. In `src/engine/physics/world.ts`, the simulation enters a live state. Once input ceases, the engine measures idle time (`quiet`). After 3 s without input (`idle`), the `heal` routine blends the live state back onto the unperturbed loop over 1.5 s (`heal`). The simulation returns to its original cycle once blending finishes.
- **Multi-panel physical installations.** Large lobby walls can arrange multiple dot-matrix panels into split displays. One panel shows environmental sensor data, while adjacent panels show living slime molds or water ripples reacting to foot traffic.

## Recreating living matter

<!-- VISUAL: kind=steps · what=matter-pipeline · notice=wave step flows into normal calculation and light shading -->

The following four self-contained TypeScript snippets recreate wave physics, steering behaviors, material shading and deterministic pseudo-random generation.

### 1. 2D wave-equation ripple buffer

Save this as `RippleSimulation.ts`. It maintains two floating-point height planes and computes wave propagation with Hugo Elias damping.

```typescript
export class RippleSimulation {
  private H: Float32Array
  private P: Float32Array
  private damp: number

  constructor(public width = 48, public height = 48, damp = 0.984) {
    const size = width * height
    this.H = new Float32Array(size)
    this.P = new Float32Array(size)
    this.damp = damp
  }

  drop(cx: number, cy: number, radius = 2, strength = 1.0): void {
    const { width, height, H } = this
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const dist = Math.hypot(dx, dy)
          if (dist <= radius) {
            H[y * width + x] += strength * (1 - dist / radius)
          }
        }
      }
    }
  }

  step(): void {
    const { width, height, H, P, damp } = this
    for (let y = 1; y < height - 1; y++) {
      const row = y * width
      for (let x = 1; x < width - 1; x++) {
        const i = row + x
        const sum = H[i - 1] + H[i + 1] + H[i - width] + H[i + width]
        P[i] = (sum * 0.5 - P[i]) * damp
      }
    }

    // Swap current and previous buffers
    for (let i = 0; i < width * height; i++) {
      const temp = H[i]
      H[i] = P[i]
      P[i] = temp
    }
  }

  getHeight(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0
    return this.H[y * this.width + x]
  }
}
```

### 2. Autonomous boids steering agent

Save this as `BoidAgent.ts`. It computes target seeking and obstacle separation, limiting steering force by its vector magnitude.

```typescript
export interface Vector2 { x: number; y: number }

function limit(v: Vector2, max: number): Vector2 {
  const m = Math.hypot(v.x, v.y)
  if (m > max && m > 1e-6) {
    return { x: (v.x / m) * max, y: (v.y / m) * max }
  }
  return v
}

export class BoidAgent {
  public pos: Vector2
  public vel: Vector2
  public maxSpeed = 2.0
  public maxForce = 0.1

  constructor(x: number, y: number) {
    this.pos = { x, y }
    this.vel = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 }
  }

  seek(target: Vector2): Vector2 {
    const dx = target.x - this.pos.x
    const dy = target.y - this.pos.y
    const dist = Math.hypot(dx, dy)
    if (dist < 1e-6) return { x: 0, y: 0 }

    const desiredX = (dx / dist) * this.maxSpeed
    const desiredY = (dy / dist) * this.maxSpeed

    return limit({ x: desiredX - this.vel.x, y: desiredY - this.vel.y }, this.maxForce)
  }

  separate(others: BoidAgent[], minDist = 3.0): Vector2 {
    let steerX = 0
    let steerY = 0
    let count = 0

    for (const other of others) {
      if (other === this) continue
      const d = Math.hypot(this.pos.x - other.pos.x, this.pos.y - other.pos.y)
      if (d > 0 && d < minDist) {
        steerX += (this.pos.x - other.pos.x) / d
        steerY += (this.pos.y - other.pos.y) / d
        count++
      }
    }

    if (count > 0) {
      steerX /= count
      steerY /= count
      const len = Math.hypot(steerX, steerY)
      if (len > 0) {
        steerX = (steerX / len) * this.maxSpeed - this.vel.x
        steerY = (steerY / len) * this.maxSpeed - this.vel.y
      }
    }

    return limit({ x: steerX, y: steerY }, this.maxForce)
  }

  update(force: Vector2): void {
    this.vel.x += force.x
    this.vel.y += force.y
    const speed = Math.hypot(this.vel.x, this.vel.y)
    if (speed > this.maxSpeed) {
      this.vel.x = (this.vel.x / speed) * this.maxSpeed
      this.vel.y = (this.vel.y / speed) * this.maxSpeed
    }
    this.pos.x += this.vel.x
    this.pos.y += this.vel.y
  }
}
```

### 3. Height to normal to diffuse light shader

Save this as `ReliefShading.ts`. It takes a height grid and computes lit dot intensities.

```typescript
export function computeReliefLight(
  heights: Float32Array,
  width: number,
  height: number,
  lightX = 0.5,
  lightY = -0.8,
  lightZ = 0.7,
  ambient = 0.15
): Float32Array {
  const output = new Float32Array(width * height)

  const lLen = Math.hypot(lightX, lightY, lightZ) || 1
  const lx = lightX / lLen
  const ly = lightY / lLen
  const lz = lightZ / lLen

  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x

      const dx = (heights[idx + 1] - heights[idx - 1]) * 0.5
      const dy = (heights[idx + width] - heights[idx - width]) * 0.5

      const nx = -dx
      const ny = -dy
      const nz = 1.0
      const nLen = Math.hypot(nx, ny, nz) || 1

      const diffuse = Math.max(0, (nx * lx + ny * ly + nz * lz) / nLen)
      const lit = ambient + (1 - ambient) * diffuse
      output[idx] = Math.max(0, Math.min(1, lit))
    }
  }

  return output
}
```

### 4. Deterministic PRNG (`mulberry32`)

Save this as `DeterministicPRNG.ts`. It generates reproducible pseudo-random numbers given a 32-bit integer seed.

```typescript
export class Mulberry32 {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }
}
```

### Try this

In `RippleSimulation`, change `damp = 0.984` to `damp = 0.996`. Drops will produce standing wavefronts that reflect back and forth across pond boundaries for over 10 s before dissipating.

### Next experiment

Feed the height output from `RippleSimulation` directly into `computeReliefLight` on each frame, rendering the resulting light values with `DotCanvas` from tutorial #1 to create an interactive touch pond.
