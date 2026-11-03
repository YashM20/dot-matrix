# Third-party notices

Dot/480 ports code from the sources below. Each ported function carries a source comment that names its article.

## Inigo Quilez

The code snippets on [iquilezles.org](https://iquilezles.org/articles/) are under the MIT license. His
mathematical and shader art is not, and none of it is copied here: we port the functions only, and every card
built on them is an original Dot/480 composition.

Ported articles:

| Article | What we ported | Where |
| --- | --- | --- |
| [2D distance functions](https://iquilezles.org/articles/distfunctions2d/) | Every 2D primitive on the page, `opRound`, `opOnion` | `src/engine/sdf/` |
| [2D SDFs and gradients](https://iquilezles.org/articles/distgradfunctions2d/) | The `sdg*` primitives, `sdgRound`, `sdgOnion` | `src/engine/sdf/gradients.ts`, `ops.ts` |
| [Distance to an ellipse](https://iquilezles.org/articles/ellipsedist/) | The Newton solver and its trig-free form | `src/engine/sdf/ellipse.ts` |
| [Smooth rounded boxes](https://iquilezles.org/articles/roundedboxes/) | The circle, parabola, cosine and cubic corners | `src/engine/sdf/corners.ts` |
| [2D SDFs in L∞](https://iquilezles.org/articles/distfunctions2dlinf/) | Box, circle, ellipse, parabola, segment, rounded box, rhombus, oriented box | `src/engine/sdf/linf.ts` |
| [Useful little functions](https://iquilezles.org/articles/functions/) | The identities, impulses, unit remaps, bumps and steps | `src/engine/shape/remap.ts` |
| [Smoothstep integral](https://iquilezles.org/articles/smoothstepintegral/) | The integral of smoothstep, an ease from rest into constant speed | `src/engine/shape/remap.ts` |
| [Smoothstep functions](https://iquilezles.org/articles/smoothsteps/) | The smoothstep variants and their inverses | `src/engine/shape/smoothstep.ts` |
| [Inverse smoothstep](https://iquilezles.org/articles/ismoothstep/) | The closed-form inverse of the cubic smoothstep | `src/engine/shape/smoothstep.ts` |
| [Sigmoid functions](https://iquilezles.org/articles/sigmoids/) | The six sigmoids with their inverses and derivatives | `src/engine/shape/sigmoid.ts` |
| [Smooth minimum](https://iquilezles.org/articles/smin/) | The quadratic, cubic, quartic, circular, exponential and root smooth minimums, the mix-factor forms, the quadratic one with gradient | `src/engine/sdf/smin.ts` |
| [3D distance functions](https://iquilezles.org/articles/distfunctions/) | Smooth union, subtraction and intersection | `src/engine/sdf/smin.ts` |
| [Domain repetition](https://iquilezles.org/articles/sdfrepetition/) | Grid repetition with the neighbour check, mirrored, limited, rotational and rectangular-perimeter repetition | `src/engine/sdf/repeat.ts` |
| [Xor](https://iquilezles.org/articles/sdfxor/) | The exact xor | `src/engine/sdf/xor.ts` |
| [Interior SDFs](https://iquilezles.org/articles/interiordistance/) | No code: its advice on inside distances, as a note | `src/engine/sdf/ops.ts` |
| [Voronoi edges](https://iquilezles.org/articles/voronoilines/) | The two-pass exact distance to the cell border | `src/engine/noise/cells.ts`, `voronoi.ts` |
| [Smooth Voronoi](https://iquilezles.org/articles/smoothvoronoi/) | The exponential and power-sum smooth Voronoi | `src/engine/noise/cells.ts` |
| [Voronoise](https://iquilezles.org/articles/voronoise/) | The blend of cell noise, noise and Voronoi through u and v | `src/engine/noise/cells.ts` |
| [Gradient noise derivatives](https://iquilezles.org/articles/gradientnoise/) | The 2D `noised`, value plus analytic derivatives (the 3D form was already in `noise3Grad`) | `src/engine/noise/derivatives.ts`, `gradient.ts` |
| [Value noise derivatives](https://iquilezles.org/articles/morenoise/) | Value noise with derivatives, fBm with derivatives, the erosion fBm | `src/engine/noise/derivatives.ts` |
| [Domain warping](https://iquilezles.org/articles/warp/) | The nested fBm warp with q and r exposed | `src/engine/noise/fractal.ts` |
| [fBM](https://iquilezles.org/articles/fbm/) | The gain from the Hurst exponent, G = 2^−H, and the noise colours | `src/engine/noise/fractal.ts` |
| [Filterable procedurals](https://iquilezles.org/articles/filterableprocedurals/) | Box-filtered checkers, grid, squares, crosses and xor | `src/engine/filter/procedural.ts` |
| [Band limiting](https://iquilezles.org/articles/bandlimiting/) | `fcos` (cos × sinc) and its smoothstep form, the faded noise and the band-limited fBm | `src/engine/filter/bandlimit.ts` |
| [Checkers filtering](https://iquilezles.org/articles/checkerfiltering/) | The triangle signal and the box-filtered checkers | `src/engine/filter/checkers.ts` |
| [Improved checkers filtering](https://iquilezles.org/articles/morecheckerfiltering/) | The square signal's second integral and the triangle-filtered checkers | `src/engine/filter/checkers.ts` |
| [Filtering procedural textures](https://iquilezles.org/articles/filtering/) | Supersampling over the footprint | `src/engine/filter/supersample.ts` |
| [Smooth iteration count](https://iquilezles.org/articles/msetsmooth/) | The smooth escape count for z^d + c, Mandelbrot and Julia | `src/engine/fractal/escape.ts` |
| [Geometric orbit traps](https://iquilezles.org/articles/ftrapsgeometric/) | Point and line orbit traps | `src/engine/fractal/traps.ts` |
| [Procedural orbit traps](https://iquilezles.org/articles/ftrapsprocedural/) | A trap given as any function of z | `src/engine/fractal/traps.ts` |
| [Popcorn images](https://iquilezles.org/articles/popcorns/) | Pickover's popcorn field, the article's cosine variant, the density render and the travel-distance render | `src/engine/fractal/popcorn.ts`, `density.ts` |
| [IFS fractals](https://iquilezles.org/articles/ifsfractals/) | The chaos game with \|det\|-weighted picks, the twist and inversion variations, the address, the square-root density tone | `src/engine/fractal/ifs.ts`, `density.ts` |
| [Lyapunov fractals](https://iquilezles.org/articles/lyapunovfractals/) | The exponent with one logarithm after the loop (folded when the product over- or underflows) | `src/engine/fractal/lyapunov.ts` |
| [Icon images](https://iquilezles.org/articles/iconimages/) | The symmetric icon map, rendered as a density | `src/engine/fractal/icon.ts` |
| [Plane deformations](https://iquilezles.org/articles/deform/) | The eight formula pairs and the worked example, the look-up table and the scrolled read | `src/engine/oldschool/deform.ts` |
| [2D dynamic clouds](https://iquilezles.org/articles/dynclouds/) | Octaves drifting at their own speeds, the threshold and sharpness remap, the march toward the sun | `src/engine/oldschool/clouds.ts` |
| [Feedback effect](https://iquilezles.org/articles/feedbackfx/) | The rotated and scaled quad, the faded copy into the centre, the untouched border | `src/engine/oldschool/feedback.ts` |
| [3D distance functions](https://iquilezles.org/articles/distfunctions/) | Sphere, box, round box, box frame, torus, link, capsules, capped and rounded cylinders, plane, ellipsoid; union, subtraction, intersection, round, onion, both elongations, revolution, extrusion, twist, cheap bend, scale, mirror, limited repetition | `src/engine/sdf3d/prims.ts`, `ops.ts` |
| [Numerical normals for SDFs](https://iquilezles.org/articles/normalsSDF/) | The tetrahedron normal, with h set to the dot's footprint | `src/engine/sdf3d/march.ts` |
| [Soft shadows](https://iquilezles.org/articles/rmshadows/) | The k·h/t penumbra, Aaltonen's improvement, the inner-penumbra extension | `src/engine/sdf3d/march.ts` |
| [Better fog](https://iquilezles.org/articles/fog/) | Distance fog, the sun-coloured fog, the split extinction and in-scattering, the height fog in closed form | `src/engine/sdf3d/light.ts` |
| [Outdoors lighting](https://iquilezles.org/articles/outdoorslighting/) | The sun, sky and bounce lights with their colours, the coloured penumbra, the 1/2.2 gamma | `src/engine/sdf3d/light.ts` |

Credits the articles give, carried over:

- Smooth rounded boxes: the parabolic corner was proposed by Shadertoy user wutzhuhn.
- 2D SDFs in L∞: the `max(p, (p-r).yx)` trick is from Shadertoy user oneshade.
- Useful little functions: the square-root smooth abs is from Shadertoy user omeometo, and the sinc impulse was suggested by Hubert-Jan.
- Smooth minimum: the optimised form of the quadratic smooth minimum is Media Molecule's (Dreams). The article also traces the circular-geometrical variant (not ported here) to the Mercury demogroup.
- Domain repetition: mirroring every other cell is from Shadertoy user and demoscener Fizzer, and the rectangular-perimeter fold was improved by Shadertoy user timestamp.
- Xor: the operator is from Shadertoy user jt (Jakob Thomsen), and the short argument for why it is exact is Boris The Brave's.
- Popcorn images: the popcorn formulas are Clifford Pickover's.
- Lyapunov fractals: the images are Mario Markus's; the name has stuck to them since.
- Icon images: the formula comes from Michael Field and Martin Golubitsky's book *Symmetry in Chaos* (1992). We use the book's form, with |z|² and z̄ⁿ⁻¹, which the article quotes loosely.
- Numerical normals for SDFs: the article first saw the tetrahedron technique from Paulo Falcao (Pouet, around 2008) and later from Paul Malin (Shadertoy).
- Soft shadows: the improvement is Sebastian Aaltonen's (his GDC presentation), and marching on through the shape for inner penumbras was explored by Shadertoy user nurof3n.
- Better fog: the height falloff follows a trick of Crytek's.

```
MIT License

Copyright (c) Inigo Quilez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
