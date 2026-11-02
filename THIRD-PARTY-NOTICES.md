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

Credits the articles give, carried over:

- Smooth rounded boxes: the parabolic corner was proposed by Shadertoy user wutzhuhn.
- 2D SDFs in L∞: the `max(p, (p-r).yx)` trick is from Shadertoy user oneshade.

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
