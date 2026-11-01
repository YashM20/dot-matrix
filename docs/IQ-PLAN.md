# IQ-PLAN: techniques from Inigo Quilez's articles

Status: **planned.** Tracking: GitHub issues labelled `area: iq` (numbers listed in the tracking issue). Source: [iquilezles.org/articles](https://iquilezles.org/articles/), 145 written articles by Inigo Quilez.

## Licence and credit (read first)
The articles index says:

> all technical code snippets you'll find are under the MIT license so you can easily reuse them, but the mathematical/shader art is protected and requires a license for use.

So:
- **Techniques and code snippets may be used**, under the MIT licence.
  - Keep the copyright notice and the MIT text in `THIRD-PARTY-NOTICES.md` (new file: "Copyright © Inigo Quilez", MIT).
  - Add a source comment on every function ported from an article: `// after Inigo Quilez, https://iquilezles.org/articles/<slug>/ (MIT)`.
- **His art is not ours to copy.** That covers the Shadertoy pieces and the compositions shown in the articles. Every card built on these techniques is an original Dot/480 composition.
- **Credit is visible:**
  - Cards built mainly on one technique carry a `credit` (the preset field from the tixy plan's T2, #53): `{ by: ['Inigo Quilez'], title: '<article>', source: 'https://iquilezles.org/articles/<slug>/', note: 'technique' }`.
  - ABOUT › CREDITS and `docs/CREDITS.md` list them.
  - The essay's acknowledgements gain a line.

## What we already have (don't redo)
- **Noise:** `src/engine/noise/` has `fbm2` and gradient noise, plus `voronoi2` with L2, L1 and L∞ metrics.
- **Domain warp:** `src/engine/fields/warpedField.ts` has `warpDomain`.
- **Basic SDFs:** `src/engine/light/sdf.ts` has `sdfCircle`, `sdfBox`, `sdfRing`, `sdfUnion` and `sdfSubtract`.
- **Lighting:** `src/engine/matter/` has height, AO, normals, matcap and anisotropic specular.
- **Game of Life:** the algorithms and pond boards cover it.

## Prioritised (one issue each)

| Key | Priority | What | Articles |
|---|---|---|---|
| IQ1 | high | **2D SDF library.** A complete 2D shape vocabulary as fields, in `src/engine/sdf/`. The existing `light/sdf.ts` is re-exported through it, with no pixel change. Include exact gradients where the article gives them, and L∞ variants for the squares track. | [2D SDFs](https://iquilezles.org/articles/distfunctions2d/), [2D SDFs and gradients](https://iquilezles.org/articles/distgradfunctions2d/), [2D SDFs in L∞](https://iquilezles.org/articles/distfunctions2dlinf/), [Smooth rounded boxes](https://iquilezles.org/articles/roundedboxes/), [Distance to an ellipse](https://iquilezles.org/articles/ellipsedist/), [Distance to triangle](https://iquilezles.org/articles/triangledistance/) |
| IQ2 | high | **SDF operators.** Smooth min/max (with the blend factor for colour mixing), xor, onion and annular shapes, interior distance, and domain repetition (infinite, limited and mirrored, done correctly). | [Smooth minimum](https://iquilezles.org/articles/smin/), [Domain repetition](https://iquilezles.org/articles/sdfrepetition/), [Xor operator](https://iquilezles.org/articles/sdfxor/), [Interior SDFs](https://iquilezles.org/articles/interiordistance/) |
| IQ3 | high | **Shaping and easing functions** in `src/engine/shape.ts`: remapping curves (almostIdentity, impulse, cubicPulse, expStep, gain, parabola, pcurve, sinc, …), the smoothstep family, sigmoids, inverse smoothstep and the smoothstep integral. Used by `sizeCurve`, motion and tone ramps. | [Remapping functions](https://iquilezles.org/articles/functions/), [Smoothstep functions](https://iquilezles.org/articles/smoothsteps/), [Sigmoid functions](https://iquilezles.org/articles/sigmoids/), [Inverse smoothstep](https://iquilezles.org/articles/ismoothstep/), [Smoothstep integral](https://iquilezles.org/articles/smoothstepintegral/) |
| IQ4 | high | **Filtered fields for coarse dot grids.** Patterns sampled once per dot alias: stripes, checkers and high-frequency noise shimmer or moiré on a lattice. Give fields an optional footprint (the cell size), add band-limited variants of sin/cos/checkers/fbm, and gate it with a shimmer probe. This is core sampler quality. | [Filterable procedurals](https://iquilezles.org/articles/filterableprocedurals/), [Filtering procedural textures](https://iquilezles.org/articles/filtering/), [Band-limiting](https://iquilezles.org/articles/bandlimiting/), [Checkers filtering](https://iquilezles.org/articles/checkerfiltering/), [Improved checkers filtering](https://iquilezles.org/articles/morecheckerfiltering/) |
| IQ5 | medium | **Noise upgrades:** exact Voronoi edges (border distance), smooth Voronoi, Voronoise (blending noise and Voronoi), and analytic noise derivatives. The derivatives give the materials and light code cheaper normals than finite differences. Also the domain-warp recipe (fbm of fbm) as a named generator. | [Voronoi edges](https://iquilezles.org/articles/voronoilines/), [Smooth voronoi](https://iquilezles.org/articles/smoothvoronoi/), [Voronoise](https://iquilezles.org/articles/voronoise/), [Gradient noise derivatives](https://iquilezles.org/articles/gradientnoise/), [Value noise derivatives](https://iquilezles.org/articles/morenoise/), [Domain warping](https://iquilezles.org/articles/warp/), [FBM](https://iquilezles.org/articles/fbm/) |
| IQ6 | medium | **Oldschool effects board** (`/oldschool/`, lazy): plane deformations (tunnels, flowers, twisters), 2D dynamic clouds, simple water, a feedback effect and a Voronoi effect. Each one is an original card. | [Plane deformations](https://iquilezles.org/articles/deform/), [2D dynamic clouds](https://iquilezles.org/articles/dynclouds/), [Simple water](https://iquilezles.org/articles/simplewater/), [Feedback effect](https://iquilezles.org/articles/feedbackfx/), [Voronoi effect](https://iquilezles.org/articles/cellularffx/) |
| IQ7 | medium | **Fractal cards:** smooth (continuous) iteration-count Mandelbrot and Julia sets, procedural and geometric orbit traps, popcorn, IFS, Lyapunov and icon images. Original framings, with the accent on one live element. | [Continuous iteration count](https://iquilezles.org/articles/msetsmooth/), [Procedural orbit traps](https://iquilezles.org/articles/ftrapsprocedural/), [Geometric orbit traps](https://iquilezles.org/articles/ftrapsgeometric/), [Popcorn images](https://iquilezles.org/articles/popcorns/), [IFS fractals](https://iquilezles.org/articles/ifsfractals/), [Lyapunov fractals](https://iquilezles.org/articles/lyapunovfractals/), [Icon images](https://iquilezles.org/articles/iconimages/) |
| IQ8 | low | **3D SDF scenes in dots:** sphere-traced 3D SDF scenes sampled onto the dot grid, with soft shadows, numerical normals, AO and fog. Live on the GPU tier (`gpuIR`), with the CPU path at card pitch for goldens. One or two original scenes. | [Raymarching SDFs](https://iquilezles.org/articles/raymarchingdf/), [3D SDFs](https://iquilezles.org/articles/distfunctions/), [Soft shadows](https://iquilezles.org/articles/rmshadows/), [Numerical normals](https://iquilezles.org/articles/normalsSDF/), [Better fog](https://iquilezles.org/articles/fog/), [Outdoors lighting](https://iquilezles.org/articles/outdoorslighting/) |
| IQ9 | low | **Fourier epicycles card:** a chain of rotating circles draws a dot outline, for example the DOT/480 logo, with the pen as the accent. | [Fourier series](https://iquilezles.org/articles/fourier/) |

**Order:**
1. IQ3, IQ1 and IQ2 are small engine packs and unblock the rest.
2. IQ4 is next, because it improves every board.
3. IQ5, IQ6 and IQ7 add cards.
4. IQ8 is last, since it is heavy.

The packs can also become Field IR builtins, so CODE users can call them by name (`sdBox`, `smin`, `gain`, …). That is a follow-up task inside IQ1 to IQ3.

## Gates (every IQ PR)
- **Invariants:** `src/engine` stays framework-free, with no new dependency. Every visual goes through Field → Grid Sampler → Renderer, with one accent per board.
- **Goldens:** 0 changed (packs are additive; `light/sdf.ts` behaviour is bit-identical), and N added for new cards.
- **First-load JS:** unchanged, ±0.1 kB gz. New modules are imported by path, never through the engine barrel. New boards are lazy.
- **Frame time:** ≤ 4 ms × load per card. Heavy cards (IQ7, IQ8) record their budget.
- **Unit checks:** each ported function gets a unit check against reference values, such as distance at known points, gradient by finite difference, or band-limited mean preservation.
- **Credit:** every ported function has its source comment, `THIRD-PARTY-NOTICES.md` is present, and cards carry a `credit`.

## Ideation (later, one issue)
Everything else is listed in the ideation issue by section, with links, so it can be picked up when a use appears. It includes:
- raytracing and voxels;
- compression and size coding (including simple colour palettes and the mini PNG writer);
- the rest of the SDF and raymarching section (bounding volumes, binary search, FBM detail, ellipsoids, implicits, Menger, terrains);
- texturing (premultiplied alpha, biplanar, texture repetition, improved filtering);
- the rest of lighting;
- the renderer/engine notes (avoiding trigonometry, GPU conditionals, gamma-correct blurring);
- the remaining useful maths (inverse bilinear, IK, ellipses, FM synthesis, quaternions, float and random);
- the Mandelbrot geometry articles;
- 3D fractals (Mandelbulb, 3D Julia, Budhabrot, distance to fractals).

Ideas noted for later:
- Gamma-correct blurring for dot glow.
- Avoiding trigonometry for hot loops.
- Inverse bilinear for the lens/perspective cards.
- FM synthesis for the audio board.
- Simple colour palettes for theme ramps (inside the one-accent rule).
