# IQ-PLAN: techniques from Inigo Quilez's articles

Status: **planned.** Tracked in GitHub issues labelled `area: iq`:

| Issue | Covers |
|---|---|
| #61 | tracking |
| #62 | IQ1: 2D SDF library |
| #63 | IQ2: operators |
| #64 | IQ3: shaping |
| #65 | IQ4: filtered fields |
| #66 | IQ5: noise |
| #67 | IQ6: oldschool board |
| #68 | IQ7: fractals |
| #69 | IQ8: 3D SDF scenes |
| #70 | ideation: the other 104 articles |

Source: [iquilezles.org/articles](https://iquilezles.org/articles/), 145 written articles by Inigo Quilez. The 46 shortlisted articles were read in full on 2026-11-01. The descriptions below come from their actual content, not their titles.

## Licence and credit (read first)
The articles index states:

> all technical code snippets you'll find are under the MIT license so you can easily reuse them, but the mathematical/shader art is protected and requires a license for use.

The individual article pages carry no licence text of their own; the index statement covers them. `distfunctions2d` adds "all formulas and code are derived by myself (unless otherwise stated)". So:

- **Techniques and code snippets may be used under MIT.** `THIRD-PARTY-NOTICES.md` (new) holds the copyright line for Inigo Quilez and the MIT text.
- **Every ported function carries a source comment:** `// after Inigo Quilez, https://iquilezles.org/articles/<slug>/ (MIT)`.
- **Credit the people the articles credit:**
  - `smin`: Media Molecule (Dreams) and the Mercury demogroup.
  - `sdfrepetition`: Fizzer (mirroring) and Shadertoy user "timestamp" (rectangular repetition).
  - `sdfxor`: Shadertoy users "jt" and "Boris The Brave".
  - `distfunctions2dlinf`: Shadertoy user "oneshade".
  - `roundedboxes`: Shadertoy user "wutzhuhn".
  - `functions`: "omeometo" (smooth abs) and "Hubert-Jan" (sinc).
  - `popcorns`: Cliff Pickover.
  - `lyapunovfractals`: Mario Markus.
- **His art is not ours to copy.** That covers the Shadertoy pieces and the compositions shown in the articles. Every card built on these techniques is an original Dot/480 composition.
- **Credits are visible.** A card built mainly on one technique carries a `credit` (the preset field from the tixy plan's T2, #53): `{ by: ['Inigo Quilez'], title: '<article>', source: 'https://iquilezles.org/articles/<slug>/', note: 'technique' }`. ABOUT › CREDITS and `docs/CREDITS.md` list them, and the essay's acknowledgements gain a line.
- **CPU path, no GPU derivatives.** Articles that use `fwidth`/`dFdx` (`bandlimiting`, `checkerfiltering`) take the footprint explicitly: the cell size, passed as `(cell, 0)` and `(0, cell)`.

## What we already have (don't redo)
- **Noise:** `src/engine/noise/` has `fbm2` and gradient noise, plus `voronoi2` with the L2, L1 and L∞ metrics.
- **Domain warping:** `src/engine/fields/warpedField.ts` has `warpDomain`.
- **Basic SDFs:** `src/engine/light/sdf.ts` has `sdfCircle`, `sdfBox`, `sdfRing`, `sdfUnion` and `sdfSubtract`.
- **Lighting:** `src/engine/matter/` has height, AO, normals, matcap and anisotropic specular.
- **Game of Life:** covered on the algorithms and pond boards.
- **Dot roundness:** a squircle exponent, and it stays one; `roundedboxes` is for shapes, not dots.

## Prioritised (one issue each)

### IQ1 · high · 2D SDF library (`src/engine/sdf/`)
The full 2D primitive set from [2D SDFs](https://iquilezles.org/articles/distfunctions2d/):
- **Shapes:** circle, (rounded, chamfer, oriented) box, segment, rhombus, trapezoid, parallelogram, equilateral, isosceles and general triangle, uneven capsule, pentagon, hexagon, octagon, hexagram, pentagram, star(n, m), pie, cut disk, arc, ring, horseshoe, (oriented) vesica, moon, rounded cross, egg, heart, cross, rounded X, polygon, ellipse, parabola (and segment), quadratic Bézier, blobby cross, tunnel, stairs, quadratic circle, hyperbola, cool S and circle wave;
- **Modifiers:** `opRound` and `opOnion`.

Analytic gradients come from [2D SDFs and gradients](https://iquilezles.org/articles/distgradfunctions2d/) (`sdg*`, returning d plus ∂x and ∂y), which gives per-dot normals for lighting at no extra samples.

The robust ellipse comes from [Distance to an ellipse](https://iquilezles.org/articles/ellipsedist/) (Newton or trig-free), and the C²-continuous corners from [Smooth rounded boxes](https://iquilezles.org/articles/roundedboxes/).

L∞ variants from [2D SDFs in L∞](https://iquilezles.org/articles/distfunctions2dlinf/) are optional: square isolines suit the squares track.

`light/sdf.ts` is then re-exported through the new module, with no pixel change.

### IQ2 · high · SDF operators
- **[Smooth minimum](https://iquilezles.org/articles/smin/):** the k-normalised quadratic, cubic, quartic, circular, exponential and root variants, plus the vec2 form that returns the **mix factor**. That factor drives tone blending inside the one-accent rule. The smooth union, subtraction and intersection come with it.
- **[Domain repetition](https://iquilezles.org/articles/sdfrepetition/)**, done correctly:
  - the cell id plus a neighbour check;
  - mirrored repetition;
  - limited (clamped-id) repetition;
  - rotational repetition;
  - rectangular-perimeter repetition.

  Per-cell ids map directly onto lattice instancing.
- **[Xor](https://iquilezles.org/articles/sdfxor/):** an exact SDF.
- **[Interior SDFs](https://iquilezles.org/articles/interiordistance/):** guidance (no code) on keeping inside distances correct for onion and inset bands over unions.

### IQ3 · high · Shaping and easing (`src/engine/shape.ts`)
- **[Remapping functions](https://iquilezles.org/articles/functions/):**
  - almostIdentity (both forms), smoothAbs, integralSmoothstep;
  - exp, quadratic, polynomial and sustained impulses;
  - sinc, truncated falloff, almostUnitIdentity;
  - gain, parabola, pcurve, tone;
  - cubicPulse, rationalBump, doubleBump, expStep.
- **[Smoothstep functions](https://iquilezles.org/articles/smoothsteps/):** cubic, quartic, quintic, quadratic-rational, cubic-rational, rational(n) and piecewise-quadratic, each with its inverse where one exists.
- **[Sigmoid functions](https://iquilezles.org/articles/sigmoids/):** the six sigmoids with inverses and derivatives (the formulas on the page are images; check them against the Graphtoy link).
- **[Inverse smoothstep](https://iquilezles.org/articles/ismoothstep/)** (closed form).
- **[Smoothstep integral](https://iquilezles.org/articles/smoothstepintegral/):** a stateless ease from rest into constant speed.

These are used by `sizeCurve`, the motion code and tone ramps.

### IQ4 · high · Filtered fields for coarse dot grids
A pattern sampled once per dot aliases: stripes, checkers and fine noise shimmer or moiré on a lattice. This issue covers:
- **Footprint:** fields get an optional footprint (the cell size).
- **[Filterable procedurals](https://iquilezles.org/articles/filterableprocedurals/):** filtered checkers, grid, squares, crosses and xor, taking `(p, dpdx, dpdy)`.
- **[Band-limiting](https://iquilezles.org/articles/bandlimiting/):** `fcos` (cos × sinc, with a smoothstep approximation), and an fbm whose octaves fade out below the cell size.
- **Checkers:** analytic box-filtered checkers from [Checkers filtering](https://iquilezles.org/articles/checkerfiltering/), and triangle-filtered ones from [Improved checkers filtering](https://iquilezles.org/articles/morecheckerfiltering/) for animated boards.
- **Supersampling:** per-dot supersampling over the cell as the generic fallback, as in [Filtering procedural textures](https://iquilezles.org/articles/filtering/).
- **Gate:** a shimmer probe.

This is core sampler quality, so it improves every board.

### IQ5 · medium · Noise upgrades
- **[Voronoi edges](https://iquilezles.org/articles/voronoilines/):** exact distance to the cell border, two-pass; this gives even lines where F2 − F1 does not.
- **[Smooth Voronoi](https://iquilezles.org/articles/smoothvoronoi/):** a power-sum or exponential smooth min.
- **[Voronoise](https://iquilezles.org/articles/voronoise/):** one function blending cell noise, noise and Voronoi through jitter u and metric v.
- **Derivatives:** `noised` (2D) from [Gradient noise derivatives](https://iquilezles.org/articles/gradientnoise/), and value-noise derivatives plus erosion fbm from [Value noise derivatives](https://iquilezles.org/articles/morenoise/). These are cheaper normals for the materials and light code than finite differences.
- **Domain warping:** the nested fbm recipe from [Domain warping](https://iquilezles.org/articles/warp/) as a named generator, exposing q and r for tone.
- **fbm:** H/gain parameterisation and the noise-colour presets (blue to yellow) from [fBM](https://iquilezles.org/articles/fbm/).

### IQ6 · medium · Oldschool effects board (`/oldschool/`, lazy)
- **[Plane deformations](https://iquilezles.org/articles/deform/):** UV deformation tunnels, twists and stars (eight formula pairs). They are cheap, animated and lattice-friendly.
- **[2D dynamic clouds](https://iquilezles.org/articles/dynclouds/):** octaves scrolled at different speeds and summed, a clear-sky threshold, and a short march toward the sun for shading. That is cheap animated fbm on CPU.
- **[Feedback effect](https://iquilezles.org/articles/feedbackfx/):** rotate, scale and fade the previous frame (a per-card frame buffer).

Every card is an original composition.

### IQ7 · medium · Fractal cards
- **[Continuous iteration count](https://iquilezles.org/articles/msetsmooth/):** smooth Mandelbrot and Julia.
- **[Geometric orbit traps](https://iquilezles.org/articles/ftrapsgeometric/):** point and line traps.
- **Density-accumulation fractals**, where the histogram maps to dot size:
  - [Popcorn images](https://iquilezles.org/articles/popcorns/), after Pickover;
  - [IFS fractals](https://iquilezles.org/articles/ifsfractals/), using the chaos game and Flames-style maps.
- **Stretch goals** (short articles; formulas on the page are images):
  - [Procedural orbit traps](https://iquilezles.org/articles/ftrapsprocedural/);
  - [Lyapunov](https://iquilezles.org/articles/lyapunovfractals/), after Markus;
  - [Icon images](https://iquilezles.org/articles/iconimages/), after *Symmetry in Chaos*.

Each card is an original framing, with the accent on one live element.

### IQ8 · low · 3D SDF scenes in dots
Sphere-traced 3D SDF scenes, sampled onto the dot grid:
- **Shapes:** primitives and operators from [3D SDFs](https://iquilezles.org/articles/distfunctions/), including revolution, extrusion, elongate, round, onion, twist and bend.
- **Shading:**
  - [Soft shadows](https://iquilezles.org/articles/rmshadows/): the k·h/t penumbra plus Aaltonen's improvement;
  - [Numerical normals](https://iquilezles.org/articles/normalsSDF/): the tetrahedron technique, with h ≈ the cell footprint;
  - [Better fog](https://iquilezles.org/articles/fog/);
  - the light rig from [Outdoors lighting](https://iquilezles.org/articles/outdoorslighting/).
- **Rendering paths:** live on the GPU tier (`gpuIR`), with the CPU path at card pitch for goldens.

One or two original scenes.

**Order:**
1. IQ3, IQ1 and IQ2 first: small engine packs that unblock the rest.
2. Then IQ4, which improves every board.
3. Then IQ5, IQ6 and IQ7, which add cards.
4. IQ8 last, since it is heavy.

**Follow-up within IQ1–IQ3:** expose the packs as Field IR builtins (`sdBox`, `smin`, `gain`, …) so CODE users can call them.

## Gates (every IQ PR)
- **Invariants:**
  - `src/engine` stays framework-free, with no new dependency;
  - every visual goes Field → Grid Sampler → Renderer;
  - one accent per board.
- **Goldens:** 0 changed (the packs are additive and `light/sdf.ts` stays bit-identical); N added for new cards.
- **First-load JS:** unchanged, within ±0.1 kB gz. New modules are imported by path, never through the engine barrel, and new boards are lazy.
- **Frame budget:** ≤ 4 ms × load per card. Heavy cards (IQ7, IQ8) record their own budget.
- **Unit checks:** each ported function gets one against reference values:
  - distance at known points;
  - gradient vs. finite difference;
  - an inverse round-trip;
  - band-limited mean preservation.
- **Credit:**
  - every ported function has its source comment;
  - `THIRD-PARTY-NOTICES.md` is present;
  - cards carry a `credit`;
  - the article's own credits are carried over.

## Ideation (later, one issue)
Everything else stays in the ideation issue, grouped by section with links, to pick up when a use appears. Moved there after reading:
- [Fourier series](https://iquilezles.org/articles/fourier/): it is about compressing and smoothing camera paths, not drawing. It could give smooth looping motion paths.
- [Raymarching SDFs](https://iquilezles.org/articles/raymarchingdf/): a history and gallery page.
- [Simple water](https://iquilezles.org/articles/simplewater/): a prose recipe for a 3D mesh shader.
- [Voronoi effect](https://iquilezles.org/articles/cellularffx/): a GPU z-buffer trick. Analytic Voronoi is better here.
- [Distance to triangle](https://iquilezles.org/articles/triangledistance/): 3D only. The 2D triangle is in IQ1.

The ideation issue also notes possible uses:
- gamma-correct blurring for dot glow;
- avoiding trigonometry in hot loops;
- inverse bilinear interpolation for the lens and perspective cards;
- FM synthesis for the audio board;
- simple colour palettes for theme ramps, within the one-accent rule;
- the mini PNG writer for exports.
