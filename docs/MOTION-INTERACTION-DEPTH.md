# MOTION · INTERACTION · DEPTH — research and plan

> **Reference (2026-10-14).** This research became phases P1–P3, which are built. Current state: `docs/PROGRESS.md`; the interaction grammar now lives in `DESIGN.md` › Interaction.


> 2026-10-14, branch `feat/tile-boards`. Companion to `ADVANCED-PLAN.md` (hardening/perf/product). Sources: code audit, three web-research passes (motion, interaction+depth, market). Architecture stays in `DOT-MATRIX-ENGINE-PLAN.md`, tokens in `DESIGN.md`.

## 0. The one rule that falls out of the research
**Animate what the dots sample, not where the dots are.**
- Moving dots off the lattice breaks quantization and makes content shimmer. Lucas Pope fought exactly this in *Obra Dinn*; Aras P. found surface-stable dither too slow on Playdate's CPU.
- So every effect should be one of these:
  - a **coordinate warp** of the field (fisheye, parallax, ripple refraction);
  - a **value change** (glow, press, fog, light);
  - a **mask threshold** (reveal, dissolve).
- The one exception is dot migration. Even there, moving particles are *splatted back into a field* and re-sampled, so the pipeline stays `Field → Sampler → Renderer`.

## 1. What makes the cards you liked work, and how to generalize it

| Card | Technique (file) | Generalize into |
|---|---|---|
| **level-03** | Analytic ray–plane depth `z = min(wall, floor, ceil)`, log-depth brick and tile repeat, linear fog, per-brick hash noise, photo style with no quantization (`audio.ts:258-306`) | `scene3d` helpers: a depth field plus `fog(z)` and `lambert(n, L)`. Depth becomes a reusable primitive, not a one-off. |
| **afterlight** | Hand-authored luminance map (digits 0–9) on an anisotropic 2.52×2.72 site lattice, big dots, red line on top (`metro.ts:241-302`) | `lumaSites(map, pitchX, pitchY)`: any small grayscale map becomes a big-dot portrait. Feed it from an image too. |
| **mosaic** | Tone split instead of a second hue: heat → `mid`/`active`/`value` with hash-dithered boundaries; bevel and rim highlights; 0.72 caption lattice (`mosaic.ts`) | `toneRamp(field, stops)`: one field, several tones, dithered seams. Keeps the one-accent rule. |
| **components** | Arc-length-even outline sites, single huge sites for knobs (roundness 0), gap around the knob, strict tones (`components.ts`) | Becomes the **interactive** component kit (§3). It already has the right primitives. |

The common recipe across all four:
- continuous luminance fields with soft edges;
- `sites` for outlines;
- one lattice tier per element size;
- tone split, never a second hue;
- photos skip quantization.

## 2. Motion: what exists versus what's missing
**Today** (audit):
- 11 animated cards, all looping idles: phase-shifted sine, modulo scroll, blink.
- One rAF loop per card at 12 fps, so cards are not phase-synced.
- The clock restarts at 0 when a card resumes.
- Every frame goes through React `setT`, then a full re-sample, then a full redraw.
- There's **no load-in, no exit, no transition, no easing, no springs.**
- Switching boards remounts every card and samples it synchronously (mosaic takes 103 ms), so the result is a hard cut after a stall.
- Static cards get `t = minute tick`, not the documented 0.

**Model:** three motion moments per card.
- **Enter** is the load-in.
- **Live** is the idle loop that already exists.
- **Change** covers data or state transitions, and moving between cards.

**Primitives** (new `src/engine/motion.ts`, pure functions of `(x, y, p)`):

| # | Primitive | Formula / approach | Cost | Use |
|---|---|---|---|---|
| 1 | **Mask library** | Bayer 2^k (Kronecker), blue noise (64² baked), radial, linear, angular, `dither-edge = (1-k)·geom + k·bayer` | table / O(1) | everything below |
| 2 | **`reveal(field, mask, p, e)`** | `f·smoothstep(M-e, M, p)`; with e→0 each dot pops once at its rank | O(1) | Enter, CRT power-on, lamp-test scan |
| 3 | **`transition(a, b, mask, p)`** | `mix(a, b, smoothstep(M-e, M, p))`; doubles as the reduced-motion fallback (Apple recommends dissolves) | 2 evals | Change |
| 4 | **Stagger** | delay per cell or element: wave, drift, curtain (Vestaboard), radial, hash jitter | O(1) | board load-in |
| 5 | **Clock + easing** | deterministic `t = frame/fps`; M3 emphasized `cubic-bezier(.2,0,0,1)`; Holden exact critical spring (closed form, scrub-safe) | O(1) | all |
| 6 | **Text: decode, typewriter, split-flap** | glyph *i* resolves at `t0 + i·s + hash(i)·j`; before that `charset[hash(i, ⌊t·r⌋)]` | ~0 | numbers changing, labels |
| 7 | **Lattice coarsen** | block size `b(p)` peaks mid-transition and swaps a→b there; reuses the lattice concept | O(1) | card ↔ card |
| 8 | **Area-averaged sampling** | supersample moving layers so sub-cell motion splits across dot sizes | 4× evals | smooth slow motion |
| 9 | **SDF morph** | `mix(dA, dB, p)`; glyph SDF via Felzenszwalb O(n) EDT, cached | precompute | icon ↔ icon, digit ↔ digit |
| 10 | **Afterglow** | pure K-tap `max_k A(t-kΔ)·e^(-kΔ/τ)`, K ≈ 4–6 | K× | waveforms, sweeps, trails |
| 11 | **Dot migration** | match lit dots of A and B: Hilbert-sort rank pairing (O(n log n)) or sliced OT (SIGGRAPH '19). Avoid Hungarian, which is O(n³). Splat into a field | precompute per transition | hero shared-element |

**Motion rules** (heuristics from the research; check them before they go into DESIGN.md):
- At 12 fps, move ≤ 1–2 cells per frame or the motion reads as teleporting.
- A 200 ms tween is only 2.4 frames, so use ≥ 300 ms.
- Keep fast pans off 12 fps boards: judder grows with contrast, and OLED black is maximum contrast.
- Temporal dithering (STBN) shimmers at 12–30 fps, so use it only for photos and slow fades.
- WCAG 2.3.3: under `prefers-reduced-motion`, migration, wipes and rain become an `e→0` dissolve or a cut.

**Board load-in, concretely:**
- Cards enter on a radial or diagonal stagger, each with a Bayer reveal over about 400 ms.
- The stagger also *hides sampling cost*: render cards progressively instead of in one 103 ms block.

## 3. Interaction
**Today:**
- `Field = (u, v) => number`, and `WidgetContext` is `{t, data}`.
- There's no pointer input, no hit-testing, and `DotInstance` doesn't know its layer.
- Canvases are `aria-hidden`.
- DESIGN.md says "No hover states documented", so adding hover needs a DESIGN update in the same PR.

**Engine change** (framework-free, plain data):
- **`FrameContext`:** add `FrameContext { t, dt, data, grid, pointer?: { x, y, inside, down, tDown, tUp, vx, vy } }` in the engine, in cell space. Presets close over `ctx.pointer`, so `Field(u, v)` stays unchanged. This also fixes ADVANCED-PLAN H2: `grid` comes in through the context.
- **Layer metadata:** `Layer` gains `id?`, `role?` and `hit?` (an SDF plus padding). `composite()` records an owner, and `pick(x, y)` returns a layer id.
- **`SimField`:** a wrapper for stateful effects (ripple, trails). It holds a 144² `Float32Array` that the clock steps, and it is read as a field.

**Techniques, ranked:**

| # | Technique | How | Fit |
|---|---|---|---|
| 1 | **Hover glow** | `max(v, a·smoothstep(R, 0, d))` in `value`/`mid` tone; never the accent | high |
| 2 | **Press compression** | on `pointerdown`, the target drops one quantize step, then springs back with about 10% overshoot | high |
| 3 | **Focus ring** | ring SDF `1 - smoothstep(w-.5, w+.5, |sdf - gap|)` with marching dots `sin(θk - t)`; roving tabindex | high |
| 4 | **Toggle / slider / knob physics** | sprung knob that snaps to whole cells; slider value = dot column; knob = atan2 accumulation with detents (Playdate crank, TE TP-7) | high |
| 5 | **Dock proximity scaling** | `1 + m·cos(min(d/R, 1)·π/2)` per element, sprung | high (rows, keys) |
| 6 | **Ripple** | Hugo Elias two-buffer, 8-neighbour, damping .96; used as a value offset *or* a refraction warp | high |
| 7 | **Fisheye** | Sarkar–Brown `T(x) = (1+d)x/(1+dx)` on the *sample coordinate*, so the lattice stays fixed and content swells | high |
| 8 | **Torch light** | pointer is the light vector in the Lambert pass (§4) | high, signature effect |
| 9 | **Trails + metaball cursor** | decay buffer `*= decay^dt` + Gaussian stamp; `Σr²/d²` | medium |
| 10 | **Repulsion displacement** | per-dot offset | **low**: breaks the lattice; decorative hero layers only, never text |

**Latency** (Jota et al. CHI '15, Ng et al. '12):
- Thresholds: a drag that lags by about 11 ms feels laggy; for a tap the threshold is about 69 ms.
- Press, drag and scrub must therefore draw on the *next rAF* straight into the canvas.
- That means no React `setT` per frame: move the clock into an imperative loop and keep React for mounting only.

**Accessibility:**
- **Overlay:** put a DOM overlay of real `<button>`/`<input type=range>` elements over each interactive layer's cell rect. Canvas hit regions are dead.
- **Target size:** WCAG 2.5.8 requires 24 px targets; aim for 44 px on touch.
- **Static cards:** keep `role="img"` with a `describe(ctx)` label.

## 4. Depth and layering
**Today:**
- Layers composite with max-value wins only.
- Lattice and site dots "cover" card cells, and overlapping lattices just alpha-paint.
- There's no z, blend, shadow, glow or parallax. DESIGN's "Ambient Glow" is unimplemented.
- Depth is faked inside individual fields: henry3 uses a painter's `mix`, level-03 a ray-plane, mosaic bevels.

| # | Technique | How | Fit |
|---|---|---|---|
| 1 | **Blend modes** | `Layer.blend`: `max` (default), `over` `a+b(1-a)`, `multiply`, `knockout` `b(1-m)`, `mask` `b·m`, applied in `composite()` | high |
| 2 | **Occlusion moat** | dilate the front layer by 1 pitch and knock out the back. At 144² touching shapes don't read as "in front" without a gap | high, cheap |
| 3 | **`z` → atmospheric** | `v *= mix(1, .3, z)` plus a lower quantize cap for far layers | high |
| 4 | **Defocus by coarser lattice** | pitch ×2 or ×3 by `|z - focus|`. **Only integer pitch ratios on a shared origin**, so no moiré (halftone screen-angle theory). Rotated or near-equal pitches only for deliberate moiré art | high |
| 5 | **Halftone shadows** | `smoothstep(0, k, sdf(p - offset))` multiplied into a *lit backplate* (black-on-black is invisible on OLED) | high |
| 6 | **Lambert/Phong on SDF height** | dome `h = √(1-(sdf/r)²)` or emboss `clamp(-sdf/bevel)`; normal by central difference; `amb + kd·n·L + ks·(n·H)^α` | high: pseudo-3D buttons with no colour |
| 7 | **Parallax** | per-layer offset `ptr·(1-z)·k`, **snapped to whole cells of that layer's pitch** | high if snapped |
| 8 | **Accent bloom** | blur the accent layer at 2× pitch, ×.25, `max`; quantization turns it into stepped halo rings. Use `activeDim`, never canvas `shadowBlur` (the SVG renderer has no equivalent) | high |
| 9 | **Projected sites / z-buffer** | ground-plane grid projected to `sites` (Gibson texture gradient); donut.c-style z-buffer per cell | medium: iso and spinning objects |
| 10 | Raymarched 3D | about 1.3M evals per frame at 144² × 64 steps | precomputed hero cards only |

## 5. Other perspectives (market scan, Oct 2026)
**Signals:**
- **Nothing:** Phone (3) Glyph Matrix ships an open SDK with no key, and paid Toys exist. The Phone (4a) Glyph Bar drives Android 16 Live Updates. Nothing Playground already does prompt → widget.
- **Type:** Vercel's **Geist Pixel** (Feb 2026) and Google's **Doto** (a variable font whose axes are dot size and roundness, the same space as our squircle) make the look mainstream.
- **Agent-built cards:** MCP Apps went stable in Jan 2026, so `ui://` widgets render inline in Claude, ChatGPT and Copilot. TRMNL and Tronbyt both have MCP servers.
- **Kits:** retro kits get traction (8bitcn about 2k stars, NES.css about 21k), but **no Nothing-grade dot *system* exists** (widgets, primitives, photo and type on one lattice). That's the gap.
- **One-file formats:** Rive and dotLottie converged on one file = state machine + data bindings + theme.

**New directions (impact / effort):**
1. **Card spec as JSON:** `Layer[]` plus `states`, `transitions`, bindings (`progress`, `time`, `fft[]`) and a token theme, modelled on Rive/dotLottie. It unlocks everything below. (H / M)
2. **MCP App "status card" server:** an agent emits a spec, the card renders inline in chat and is pushed to TRMNL or Tronbyt. (H / M)
3. **shadcn registry** of the interactive component kit: toggle, slider, knob, status dot, loaders, skeletons. (H / L-M)
4. **Live Activity / Glyph templates:** progress, ETA and timer at `small` and AOD sizes; a 25×25 Glyph exporter plus a Toys pack (Snake, Life, timer). (M-H / M)
5. **Live modes:** Web Audio FFT feeding the audio board, and a webcam halftone mirror through the photo-field path. (M / L-M; strong demo clips)
6. **README cards:** GitHub contributions or dev metrics as embeddable SVG (snk has 6.1k stars, so the format spreads). (M / L)
7. **OG / email endpoint:** dot-aligned SVG rasterised with resvg. (M-H / L)
8. **"Ditherpunk for UI" explainer + field playground** with share links, as a launch vehicle. (M / L)
9. **Physical export:** LEGO stud bill of materials, cross-stitch, laser threshold PNG, plotter SVG. (M niche / M)
10. **Tactile:** a Braille pin-display renderer for Dot Pad (2400 pins). Novel accessibility angle, but the SDK is unverified. (speculative)

## 6. Plan
| Phase | Scope | Showcase / exit |
|---|---|---|
| **M0 · Clock** (2–3 d) | One board clock, imperative rAF with no React per frame, `FrameContext` in the engine, deterministic `t`, resume without resetting to 0, static/animated layer split | 60 fps-capable path; per-frame cost ≤ ADVANCED-PLAN targets |
| **M1 · Motion** (1 wk) | `motion.ts`: masks, `reveal`, `transition`, stagger, easing, springs, text decode / split-flap, lattice-coarsen, afterglow; board load-in; reduced-motion fallbacks; transition scrubber in the playground | Switching boards plays a staggered dither reveal, not a stall then a cut |
| **M2 · Interaction** (1–2 wk) | pointer in `FrameContext`, `Layer.id/hit` + `pick`, DOM a11y overlay, `SimField`; **components board v2**: live toggle, slider, knob with detents, press compression, hover glow, focus ring, ripple button, fisheye list; DESIGN.md interaction tokens (glow radius, press step, spring half-life) | Every component works with mouse, touch and keyboard; next-frame feedback |
| **M3 · Depth** (1–2 wk) | `Layer.blend/z`, occlusion moat, atmospheric, defocus lattices, halftone shadows, Lambert SDF with **torch light**, cell-snapped parallax, accent bloom; `scene3d` (from level-03), `lumaSites` (from afterlight), `toneRamp` (from mosaic); **depth board** | Depth board at the level-03 / afterlight standard |
| **M4 · Hero** (2 wk) | Dot migration (card → expanded view), SDF morph of icons and digits, live audio and webcam modes | Shared-element transition demo |
| **P · Product** | Card spec JSON → shadcn registry → MCP App → device exporters (with ADVANCED-PLAN phases 2–3) | — |

**Decisions this adds:**
1. Can hover, focus and press use the **accent**? I recommend no: interaction states stay in `value`/`mid`, and the accent keeps marking the one active element.
2. Is DESIGN.md's "no hover states" an intentional constraint, or just undocumented? M2 changes it.
3. Is a 30 fps option allowed for interactive and transition moments, or is 12 fps a hard aesthetic rule?

## Sources (selected)
- **Motion and transitions:**
  - Vestaboard transitions: https://www.vestaboard.com/help/transitions
  - gl-transitions: https://cdn.jsdelivr.net/npm/gl-transitions@1.67.0/transitions/
  - SPOT (sliced OT): https://perso.liris.cnrs.fr/nicolas.bonneel/spot/
  - Bertsekas auction: https://www.mit.edu/~dimitrib/Bertsekas_Assignment_1981.pdf
  - Jump flooding: https://www.comp.nus.edu.sg/~tants/jfa.html
  - Holden springs: https://theorangeduck.com/page/spring-roll-call
  - STBN: https://research.nvidia.com/publication/2022-07_spatiotemporal-blue-noise-masks
  - MAME vector CRT: https://docs.mamedev.org/techspecs/bgfx_vector_crt.html
  - WCAG 2.3.3: https://w3c.github.io/wcag/understanding/animation-from-interactions.html
  - play.core: https://play.ertdfgcvb.xyz
- **Interaction:**
  - Sarkar–Brown fisheye: https://cs.brown.edu/research/pubs/techreports/reports/CS-93-40.html
  - Playdate crank: https://devforum.play.date/t/getcrankticks-is-it-possible-to-not-tick-on-0-aka-how-to-get-1-full-turn/18735
  - GlyphMatrix SDK: https://github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit
  - WCAG 2.5.8: https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html
  - Latency summary: https://arxiv.org/pdf/2408.02525
  - FFitts: https://research.google/pubs/pub41645/
- **Depth:**
  - iq articles: https://iquilezles.org/articles/
  - Soft shadows: https://iquilezles.org/articles/rmshadows
  - donut.c: https://www.a1k0n.net/2011/07/20/donut-math.html
  - Obra Dinn dither: https://www.alanzucconi.com/?p=10365
  - Surface-stable dither: https://runevision.com/tech/dither3d
  - Aras on Playdate: https://aras-p.info/blog/2025/02/09/Surface-Stable-Fractal-Dither-on-Playdate/
  - AM screen angles: https://www.hdm-stuttgart.de/science/science/scienceverzeichnis/468/The_angles_of_AM_screening_FGG_2_2018.pdf
- **Market:**
  - Glyph dev kit: https://bg.nothing.tech/pages/glyph-developer-kit
  - Glyph Bar: https://www.androidauthority.com/nothing-phone-4a-series-glyph-bar-3642786/
  - Nothing Playground: https://techcrunch.com/2025/09/30/nothing-launches-ai-tool-for-building-mini-apps-using-prompts/
  - Geist Pixel: https://vercel.com/blog/introducing-geist-pixel
  - Doto: https://fonts.google.com/specimen/Doto/about
  - MCP Apps: https://blog.modelcontextprotocol.io/tags/apps/
  - 8bitcn: https://github.com/TheOrcDev/8bitcn-ui
  - paper shaders: https://github.com/paper-design/shaders
  - snk: https://github.com/Platane/snk
  - Rive data binding: https://rive.app/docs/editor/data-binding/controlling-data
  - Lottie 2026: https://lottiefiles.com/blog/inside-lottiefiles/the-lottie-power-stack-2026
  - Ditherpunk: https://surma.dev/things/ditherpunk/
- Caveats: the Material 3 values, the Apple HIG wording, the apparent-motion thresholds and the latency numbers come from secondary write-ups. Check them before they go into DESIGN.md.
