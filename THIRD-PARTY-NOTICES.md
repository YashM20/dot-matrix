# Third-party notices

Dot/480 ports code from the sources below. Each ported function carries a source comment that names its article.

After the code ports come the techniques we wrote from published work without copying any code, the font the site
ships, and the data the live board shows.

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

## Techniques written from published work

No code from these is copied. We read the work and wrote our own version, and the source comment in each file names it.

- **argonautcode, [animal-proc-anim](https://github.com/argonautcode/animal-proc-anim)** (MIT): the follow-the-leader
  spine with a clamped bend at each joint. Used by `chainFollow` in `src/engine/life/chain.ts`, which the pond board's
  koi swim on.
- **Alexander Mordvintsev, Ettore Randazzo, Eyvind Niklasson and Michael Levin, [Growing Neural Cellular
  Automata](https://distill.pub/2020/growing-ca/)** (Distill, 2020): the model (perception by Sobel filters, a small
  per-cell network, stochastic updates, alive masking) and the regenerating training recipe. Used by `src/engine/nca/`
  and `scripts/nca/`; the lizard's weights are trained by our own script. The heal board's cards carry the credit.
- **Dao Ho, [daoho.dev](https://www.daoho.dev/)** (no licence): the ASCII koi pond the pond board is after. We read
  how it works and used none of its code or constants. The `pond-koi` card carries the credit.
- **Maxim Gumin, [WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)** (MIT): the simple tiled
  model. Used by `src/engine/algo/wfc.ts`.
- **Michael Fogleman, [Quads](https://www.michaelfogleman.com/projects/quads/)** (no licence): split the quad with
  the most error, again and again. Used by the `sq-quads` card.
- **Kim Asendorf, [ASDFPixelSort](https://github.com/kimasendorf/ASDFPixelSort)** (no licence): sorting runs of
  pixels between two thresholds. Used by `src/engine/algo/pixelSort.ts`.
- **Islam El-Ashi, [El-Tetris](https://imake.ninja/el-tetris-an-improvement-on-pierre-dellacheries-algorithm/)**: the
  six features and their weights, which `src/engine/squares/tetris.ts` uses as published.
- **kube.io, [Liquid Glass in the browser](https://kube.io/blog/liquid-glass-css-svg/)**: the bezel refraction
  through a Snell look-up table. Used by `src/engine/matter/glass.ts`.
- **Evan Wallace, [Rendering realtime caustics in WebGL](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c)**:
  caustics from the ratio of a light patch's area before and after refraction. Used by `src/engine/matter/caustics.ts`.
- **Hugo Elias, [2D water](https://web.archive.org/web/2016/http://freespace.virgin.net/hugo.elias/graphics/x_water.htm)**:
  the two-buffer ripple scheme. Used by `src/engine/life/ripple.ts`.

The cards built on these, and on the papers and artworks the engine follows, name them on their own page. The full
list is in [docs/CREDITS.md](docs/CREDITS.md).

## Oxanium

The site's typeface is [Oxanium](https://github.com/sevmeyer/oxanium), installed from
`@fontsource-variable/oxanium`. It is under the SIL Open Font License 1.1.

```
Copyright 2019 The Oxanium Project Authors (https://github.com/sevmeyer/oxanium)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Open-Meteo

The live board's weather card shows data from [Open-Meteo](https://open-meteo.com/), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The card's footer reads OPEN-METEO, and its page carries
the credit line "Weather data by Open-Meteo.com (CC BY 4.0)".
