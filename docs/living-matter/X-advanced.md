# X-ADVANCED: techniques beyond the Living Matter plan

> Status: **research** (2026-10-27). Nothing here is built. It extends `docs/LIVING-MATTER-PLAN.md` (the "plan" below) and does not repeat it.
> Scope: advanced, niche or recent techniques that push the three tracks (L living scenes, Q squares, M materials) and the site past the plan. Every pick was checked against the repo and the plan. Anything already built or already planned was dropped (see §6).
> Invariants are the ones in `AGENTS.md`:
> - Field → Sampler → Renderer;
> - one accent per board;
> - quantized sizes;
> - a framework-free engine with no deps;
> - goldens;
> - ≤ 4 ms per card frame on the CPU;
> - first-load JS ≤ 150 kB gz, with everything new loading lazily. The current figure and every phase's delta live in one ledger, `docs/LIVING-MATTER-PLAN.md` §6; this doc states its costs only as deltas against it.
>
> Costs are **S** (≤ 1 day), **M** (2–3 days) or **L** (a week or more). Per-frame figures are estimates for a 144² card in Node on an idle laptop, by analogy with the measured costs in `docs/ALGORITHMS.md` and the plan's budget table. None of them is measured yet.
>
> **Frame rate.** A "frame" here is one card frame at the card's own rate, not the display's. Animated cards render at `fps ?? (motion ? 12 : 30)` (`src/components/DotCanvas.tsx:398`), and per-card `WidgetPreset.fps` plus the phone tier arrive in F0.10. A 120 Hz display does not make a card step or draw more often. (Commit 0edd045 only changed how `scripts/algorithms.ts` times frames.)

## 0. What the repo already has (so these picks don't redo it)

| Asked about | Status | Where |
|---|---|---|
| Stable fluids ink-in-water | **built**: Stam 1999 with vorticity confinement and MacCormack ink advection | `src/engine/physics/fluid.ts` |
| Reaction–diffusion | **built**: Gray–Scott | `src/engine/sim/sim.ts` |
| Spatiotemporal blue noise | **built**: void-and-cluster mask, `stbn(x,y,slice)`, level hysteresis on the halftone stream | `src/engine/halftone/` |
| SDF glyph and shape morphing | **built** | `migrate/morph.ts`, `type/kinetic.ts` |
| Optimal-transport dot migration | **queued**: ranked "next" in `docs/PROGRESS.md` | — |
| Flow-Lenia | **queued**: same list | — |
| Worker sampling / OffscreenCanvas | **built**: shared module worker with transferable double buffers | `src/workers/` |
| Camera hand tracking | **built**: skin ∧ background mask, motion history, One Euro filter, pinch | `src/vision/`, `src/media/` |
| Mic FFT, Web Audio synth | **built** | `src/audio/` (NEXT-PLAN R12 covers audio-reactive fields) |
| WebGPU compute | **planned**: WEB-PLAN C1, NEXT-PLAN P12 | — |
| DLA, WFC, stipple, attractor | **built** | `src/engine/algo/` |
| Sand-pile automaton | listed as a candidate in ALGORITHMS "Not done" | — |
| Physarum | **planned**: L2, 2,400 agents on a lattice-2 trail grid (72 × 66) | `docs/living-matter/L-pond.md` (`agents.ts`) |

Three rules come up again and again below, so they are stated once here:
- **Deterministic math.** `docs/ALGORITHMS.md` already replaces `Math.sin` with `dsin`/`tsin` because the standard library is not bit-identical across engines. The same applies to `Math.exp`, `Math.pow` and `Math.log`. Several picks need them. F0.1 delivers them: `src/engine/noise/dmath.ts` holds `dsin`, `dcos`, `tsin`, `tcos`, `datan2` and, at this doc's request (accepted), `dexp` and `dpow`. `Math.sqrt` is correctly rounded by IEEE 754, so it is safe. F0.9's determinism lint is the only lint for this; X adds none.
- **Pristine vs live.** Every interactive pick uses the `World` split (`src/engine/physics/world.ts`): a seeded pristine run gives t = 0 and the goldens, and input forks a live copy. Camera, mic, sound, GPU and date-dependent behaviour run **live only**, and goldens inject a fixed date and an empty storage.
- **Light and tilt.** Cards read light through F0's `sceneLight()`, whose keys are `lightSrc`, `lightAz` and `lightEl`. The tilt offset is `tx`, `ty` (0 at rest). `gx`, `gy` are gravity, for physics only. There is no `data.light`.

---

## 1. Ranked top 15 (plus four runners-up)

| # | Pick | Group | Track / phase | Cost | Frame (est.) |
|---|---|---|---|---|---|
| 1 | Suminagashi: closed-form marbling on the pond | Living | L / X1 | M | 0.3–1.5 ms |
| 2 | Aztec-diamond domino shuffling (arctic circle) | Squares | Q1 | S–M | < 0.2 ms |
| 3 | Kintsugi: fracture on tap, gold-seam repair | Materials | M2 | M | < 0.5 ms |
| 4 | Particle Lenia creatures (dots are the particles) | Living | L2 | M | 0.3–0.8 ms |
| 5 | A pond that ages: daily seed and growth over visits | Experience | X1 | S | ~0 |
| 6 | Bubble acoustics (Minnaert / van den Doel) | Experience | XL, owner decision | S | 0 (audio thread) |
| 7 | Aperiodic floors: hat / spectre and Ammann–Beenker | Squares | XQ | M | 0.3 ms (baked) |
| 8 | Abelian sandpile on 4-shade squares | Squares | Q2 | S | < 0.3 ms |
| 9 | Optical flow from the camera drives the pond | Experience | XL | S–M | 0.05 ms + camera |
| 10 | Lichtenberg figures (dielectric breakdown model) | Materials | XM | M | 0.1–0.4 ms |
| 11 | Hydraulic erosion: "time wears the time" | Materials | XM | M | 0.5 ms |
| 12 | Temporal stability for glyph tiles | Rendering | L1.3 (stateless) + X1 (hysteresis) | S | 0.02 ms |
| 13 | Reiter snowflake: a frost window | Materials | XM | M | 0.6 ms while growing |
| 14 | Subsurface wax: a candle clock | Materials | M2 | S | 0.3 ms |
| 15 | Turing skin with domain growth (second species) | Living | L2 | M | ~0 (baked texture) |
| 16 | WebGPU agent tier (1M physarum, Flow-Lenia) | Performance | X2 | L | GPU |
| 17 | Paper fold operator (origami facets) | Materials | M1 | S–M | 0.2 ms |
| 18 | View Transitions for board → widget | Experience | X1 | S | 0 |
| 19 | MLS-MPM: sand, snow and jelly in one solver | Performance | X2 | L | GPU only |

The ranking is wow × fit ÷ cost. The top four each give a "how is this a dot matrix?" moment that nothing in the repo or the plan gives. Picks 5 and 9 are cheap and make the pond feel alive, not just animated; 6 joins them only if the owner opts into sound.

---

## 2. Living scenes

### #1 Suminagashi: closed-form marbling on the pond
- **What:** Japanese floating-ink marbling, done the way Lu, Jaffer et al. describe it: every ink drop and every comb stroke is a closed-form homeomorphism of the plane, so there is no fluid solver and no blur.
- **Why it's striking here:**
  - Ink rings are hard tone contours, and those suit quantized dots far better than diffused ink.
  - It is native to the koi-pond theme.
  - **Koi swimming through the ink comb it.** Each fish's recent path becomes a curved tine stroke, so the pond keeps a visible memory of where the fish went.
- **Algorithm:**
  - **Drop** at centre c with radius r: `p' = c + (p − c)·√(1 + r²/|p − c|²)`. The inverse is `p = c + (p' − c)·√(1 − r²/|p' − c|²)` for |p' − c| ≥ r. Points inside the drop take the new drop's tone.
  - **Tine** through b with unit direction m and normal n, shift α and sharpness λ: `d = |(p − b)·n|`, `p' = p + (αλ/(d + λ))·m`. The inverse subtracts the same term, because d doesn't change along m.
  - **Vortex stroke** around c: rotate by `αλ/(d + λ)`, where d is the distance to c.
  - **Sampling:** walk the operation list backwards from the sample point. The first drop that contains the point gives the tone.
  - **Speed-up:** keep a baked backward map (x, y per cell at the card lattice) and compose each new operation into it. That is O(cells) per operation instead of O(cells × ops) per frame. Re-bake exactly from the operation list every 32 operations, at idle, because bilinear composition slowly blurs.
  - **Parameters:** drops r = 6–20 cells; tines α = 4–12 and λ = 6–16 cells; fish tines α = 1.5 with λ equal to the body width; and 40–80 operations in the pristine pattern.
- **Reference:** S. Lu, A. Jaffer, X. Jin, H. Zhao, X. Mao, "Mathematical Marbling", IEEE CG&A 32(6), 2012, [DOI 10.1109/MCG.2011.51](https://ieeexplore.ieee.org/document/5887299/) ([PDF copy](https://www.gwern.net/doc/cs/cellular-automaton/2012-lu.pdf)). Also [Jaffer's marbling pages](https://people.csail.mit.edu/jaffer/Marbling) and [Coding Train #183](https://thecodingtrain.com/challenges/183-mathematical-marbling).
- **Fit:**
  - One `toneOf` field, so it is Field → Sampler.
  - The pristine operation list is seeded, so the result is pure in t. The math is only `+ × √`, which is bit-exact.
  - Live taps add a drop and fish add tines, both in the live fork, which heals by fading back to the pristine list.
  - **Accent:** one *beni* (red) ring, the newest drop. Sumi ink is `value` / `mid`, and the water is empty.
- **Cost:** M. Per frame: about 0.3 ms with the baked map. A cold evaluation of 64 operations over 20k cells is about 1.5 ms, once at mount.
- **Risks:**
  - It drifts toward "stock generative art" unless the koi tines are the hero.
  - Rings thinner than 2 cells alias, so drop radius and ring spacing need clamps to keep periods ≥ 2 cells (the plan's material rule).

### #4 Particle Lenia creatures
- **What:** Lenia rewritten as particles that descend an energy field (Mordvintsev, Niklasson, Randazzo, 2022). Rotors, gliders and "cells" self-assemble, then heal when you poke them.
- **Why it's striking here:** the particles **are** the dots: each one is a `sites` dot, and the Lenia field U is drawn faintly on the card grid as the creature's body. It is the most direct "living dots" demo possible. The existing NCA grows on a lattice; this one moves freely.
- **Algorithm:**
  - Kernel `K(r) = w_K·exp(−(r − μ_K)²/σ_K²)`, field `U(x) = Σ K(|x − p_i|)`, growth `G(u) = exp(−(u − μ_G)²/σ_G²)`, repulsion `R = (c_rep/2)·Σ max(1 − |x − p_i|, 0)²`, energy `E = R − G(U)`, and Euler steps `p ← p − dt·∇E(p)`.
  - The 2D rotor uses μ_K = 4, σ_K = 1, w_K = 0.022, μ_G = 0.6, σ_G = 0.15, c_rep = 1, dt = 0.1 and N = 200.
  - Cut the kernel off at μ_K + 3σ_K = 7 and use the existing spatial hash (`physics/particles.ts`).
- **Reference:** [Particle Lenia (Google Research)](https://google-research.github.io/self-organising-systems/particle-lenia/), [demo](https://znah.net/lenia/), and Horibe et al., ALIFE 2023, [arXiv 2305.16706](https://arxiv.org/pdf/2305.16706).
- **Fit:**
  - L2, as a sixth ecosystem card: `pond-plankton`, a microscope inset with 2–3 creatures and about 600 particles.
  - Pure in t through `World` checkpoints, using F0.1's `dexp` (see §0).
  - Tap scatters a creature's particles and it re-forms, which echoes the NCA "heals" moment (NEXT-PLAN R1).
  - **Accent:** the particle nearest the creature's centre of mass, as its "nucleus".
- **Cost:** M. About 600 particles × ~40 neighbours × 2 exps per step, at 2 steps per frame, comes to roughly 0.3–0.8 ms.
- **Risks:**
  - The parameter space is narrow: creatures die or explode off the published values. Ship only vetted parameter sets, each checked for "alive after 10k steps" in `scripts/life.ts`.
  - The O(N²) reference code must not be copied naively.
- **Flow-Lenia** (already queued in PROGRESS) is the grid version, with mass conservation and parameters carried by the matter itself, so species can mix ([Plantec et al., ALIFE 2023, arXiv 2212.07906](https://arxiv.org/pdf/2212.07906); [2025 follow-up, arXiv 2506.08569](https://arxiv.org/pdf/2506.08569)).
  - Its ring kernels (R ≈ 13 cells, about 530 taps) on a 72² grid cost about 3–5 ms per step on the CPU, which is over budget.
  - **Recommendation:** ship Particle Lenia on the CPU now, and move grid Flow-Lenia to the WebGPU tier (#16).

### #15 Turing skin with domain growth (a second species)
- **What:** reaction–diffusion skin computed in body (s, v) space while the body grows. Stripes widen, then **new stripes insert** between them. Kondo & Asai saw exactly this in angelfish, and it was the first good evidence for Turing patterns in a living animal.
- **Why it's striking here:**
  - It pairs with #5 (a pond that ages): a fish whose pattern visibly rearranges over days of visits.
  - Gray–Scott already exists; the new parts are the body-UV domain and the growth.
- **Algorithm:**
  - Run Gray–Scott in the stripe regime (F ≈ 0.037, k ≈ 0.06) on a 64 × 20 grid in (s, v), with diffusion along s ×1.5 for orientation.
  - At each growth stage, resample the grid 8% wider (nearest neighbour) and run 200 steps.
  - The skin then becomes a lookup in `bodyField`'s u, v.
- **Reference:** S. Kondo & R. Asai, "A reaction–diffusion wave on the skin of the marine angelfish *Pomacanthus*", Nature 376 (1995), [doi:10.1038/376765a0](https://www.doi.org/10.1038/376765A0). Also Kondo & Miura, Science 329 (2010), and Turk, SIGGRAPH 1991 (RD on surfaces).
- **Fit:**
  - L2. The skin is baked per growth stage, so the per-frame cost is a texture lookup.
  - Keep the koi on the plan's fbm patches. **Real koi markings are bred patches, not Turing patterns,** so RD on a koi would be wrong. Use a second species: an angelfish in a `pond-reef` card, or a single "elder" fish.
  - The skin is neutral tones, with no accent on it.
- **Cost:** M. A growth stage is 1.3k cells × 200 steps, about 2 ms once.
- **Risks:** it is subtle at small sizes. The fish needs at least 30 cells of length for the stripes to read.

---

## 3. Squares & tiling

### #2 Aztec-diamond domino shuffling
- **What:** a uniformly random tiling of the Aztec diamond by dominoes, grown one order at a time by Propp's *domino shuffling*. A perfect **arctic circle** emerges: frozen brick-wall corners around a disordered, "liquid" disc.
- **Why it's striking here:**
  - Dominoes are joined 2-cell squares, which makes this the best showcase for the plan's join pass.
  - The circle comes from pure combinatorics and is visible at a glance.
  - The shuffle animation is satisfying in itself: every domino slides one cell in its own direction.
- **Algorithm:**
  - The order-n diamond is the cells with |x + ½| + |y + ½| ≤ n. Each domino gets a direction (N, S, E or W) from its checkerboard parity.
  - One shuffle step, n → n + 1, has three parts:
    1. **Annihilate** the pairs of dominoes that would collide (they face each other inside a 2×2 block).
    2. **Slide** every domino one cell in its direction.
    3. **Create:** fill each empty 2×2 block with a horizontal or a vertical pair, by a seeded coin flip.
  - Coin weights other than ½ give biased tilings, and the circle becomes an ellipse.
  - The arctic circle has radius n/√2.
- **Reference:**
  - Elkies, Kuperberg, Larsen & Propp (1992).
  - Jockusch, Propp & Shor, "Random domino tilings and the arctic circle theorem", [arXiv math/9801068](https://ar5iv.labs.arxiv.org/html/math/9801068).
  - Propp, "Generalized domino-shuffling", [arXiv math/0111034](https://arxiv.org/pdf/math/0111034).
- **Fit:**
  - Q1 (`squares-arctic`). The four directions map to four tones (`value`, `idle`, `mid`, `faint`); the frozen corners turn into solid bands of one tone.
  - **Accent:** the dominoes created in the latest step.
  - The history is cached, so frames scrub like WFC and t = 0 is the finished order-48 diamond.
- **Pairing:** the join pass merges cells of equal tone, but two adjacent dominoes with the same orientation must **not** merge. Q's `JoinSpec.group` is widened to `number | ((u, v) => number)`, and cells join only within one group. The card passes `join: { group: (u, v) => dominoId(u, v) }`, where the ids are a 4-colouring of the domino adjacency graph (so they fit the 0–255 group range and no two touching dominoes share one). There is no separate `Layer.joinOf` channel. The same function form serves polyomino Tetris.
- **Cost:** S–M. Steps are O(n²), about 5k cells at n = 48. Per frame it is under 0.2 ms.
- **Risks:** few. At small pitch the diamond needs at least 96 cells across, so it has to be a wide card.

### #7 Aperiodic floors: hat / spectre and Ammann–Beenker
- **What:** floors that never repeat.
  - The **hat** and the **spectre** (2023) are the first single-tile aperiodic shapes ("einsteins").
  - **Ammann–Beenker** is an 8-fold quasicrystal made of squares and 45° rhombi.
- **Why it's striking here:**
  - **The hat gives a natural one-accent story.** A hat tiling needs some mirrored hats; they are sparse and isolated, about 1 in every 7 (φ⁴ : 1). Draw them in the accent and the "exception" literally becomes the highlight.
  - Ammann–Beenker uses only squares and rhombi at multiples of π/4, which is exactly Q3.1's `rotation` snap for squares. It is the square track's quasicrystal.
- **Algorithm:**
  - **Hat:** substitute the four metatiles (H, T, P, F) to level 3–4 (about 1–2k hats), then crop to the card. Every hat is a union of 8 kites of the kite tiling over a hex grid. A card dot finds its kite in O(1) with hex arithmetic, then its hat id from a baked map. Grout is the empty cells on hat boundaries (the plan's `{grid.gap}`).
  - **Ammann–Beenker:** use de Bruijn's multigrid: 4 families of parallel lines at angles kπ/4, with offsets γ_k that sum to 0. Each crossing of two families is one tile: a square or a rhombus, depending on the angle between the families.
  - **Drawing:** the squares are joined square cells at Q3.1's π/4 rotation. The 45° rhombi are not squares, so they are drawn as dot `sites` filling the rhombus (one site per cell centre inside it), never as squares.
  - **Animation:** inflate one substitution level over 6 s, so each tile splits into its children.
- **Reference:**
  - Smith, Myers, Kaplan & Goodman-Strauss, "An aperiodic monotile", [arXiv 2303.10798](https://arxiv.org/pdf/2303.10798v1), and "A chiral aperiodic monotile" (the spectre, 2023). Also [C. Kaplan](https://en.wikipedia.org/wiki/Craig_S._Kaplan).
  - [Ammann–Beenker tiling](https://en.wikipedia.org/wiki/Ammann%E2%80%93Beenker_tiling), [cut-and-project notes, arXiv 1906.10392](https://arxiv.org/pdf/1906.10392), [a guide to Penrose tilings, arXiv 2310.18950](https://arxiv.org/pdf/2310.18950).
  - Implement from the papers. Check the licence before reading any viewer source.
- **Fit:**
  - XQ, after Q3.1. It needs Q3.1's `rotation` and Q1's `{grid.gap}`.
  - The tiling is a baked static `toneOf` field, so it is deterministic.
  - Card ideas: an aperiodic terrazzo floor under the marble plaque (M1), or a "never-repeating calendar" where each day is a tile.
- **Cost:** M. Generation is 5–20 ms once (cached), and each frame is a lookup at about 0.3 ms.
- **Risks:**
  - Substitution code is fiddly, so it needs a checker that no two tiles overlap and that every hat has the right area.
  - Tiles need at least 6 cells across to read, which caps them at about 20 × 20 hats per card.

### #8 Abelian sandpile on 4-shade squares
- **What:** self-organised criticality (Bak–Tang–Wiesenfeld). Any cell with 4 or more grains topples, giving one grain to each neighbour. The *identity element* of the sandpile group and the single-source pile both produce famous fractal patterns in exactly **4 states**.
- **Why it's striking here:**
  - The 4 states map one-to-one onto the plan's 4-shade presets (Game Boy, Playdate). No other algorithm fits that palette as exactly.
  - Under the join pass, the regions fuse into fractal blobs.
  - Tapping drops grains and sets off an avalanche that sweeps across the squares.
- **Algorithm:**
  - The state is z ∈ {0, 1, 2, 3} per cell, with sinks at the border.
  - **Bulk toppling:** each sweep sets `q = z >> 2` and `z −= 4q`, then adds q to the 4 neighbours, repeated until stable.
  - **Identity** on an N×N grid: `id = (6 − (6)°)°`, where ° means "stabilise" and 6 is the all-6 configuration.
  - **Single source:** start with 2^k grains at the centre.
- **Reference:**
  - Bak, Tang & Wiesenfeld, PRL 59 (1987).
  - Dhar, PRL 64 (1990): the abelian property.
  - Levine & Propp, "What is… a sandpile?", Notices AMS 57 (2010).
- **Fit:**
  - Q2. It uses only integers, and the **abelian property makes the result independent of toppling order**, so it is robust for goldens.
  - **Accent:** the cells toppling in this sweep (the avalanche front).
  - The pristine identity is precomputed. Taps fork into a live copy.
  - This also covers the "sand-pile automaton" candidate in `ALGORITHMS.md`.
- **Cost:** S. The identity for 128² takes about 20–80 ms once, so it can be cached or baked at build time. A tap avalanche costs under 0.3 ms per frame.
- **Risks:** the identity image is well known, so the joined-square rendering and the interactive avalanches have to carry the novelty.

---

## 4. Materials

### #3 Kintsugi: fracture on tap, gold-seam repair
- **What:** a ceramic plate that **breaks where you tap**. The cracks run out from the impact, the shards part by one cell, then pull back and heal with **gold seams**. The seams accumulate across visits.
- **Why it's striking here:**
  - Kintsugi's gold is literally the one accent, and the ceramic stays neutral, so this is the most rule-native material story available.
  - Breakage is a physical event that leaves a lasting mark: the plate remembers.
- **Algorithm:**
  - **Fracture pattern** (aligned to the impact, after Müller et al.):
    - shard seeds at 7–11 radial angles, jittered;
    - × 2–3 rings at radii ≈ (0.25, 0.55, 0.85)·R;
    - shard id = nearest seed under a metric stretched along the radius;
    - edges warped by `fbm2` from F0, so they read as ceramic rather than a Voronoi diagram.
  - **Crack line** where `f2 − f1 < w`. It is revealed outward at about 40 cells/s from the impact.
  - **Shards** offset by 1 cell along (centroid − impact), with a moat between them.
  - **Repair:** a spring brings each shard back over 2–4 s, and the crack cells become accent seams lit by `anisoSpec` along the seam tangent.
  - **Mud-crack variant:** add cracks in sequence, each ending in a T-junction on an existing one. Joint angles drift from 90° toward 120° over repeated drying cycles (Goehring 2010).
- **Reference:**
  - Müller, Chentanez & Kim, "Real Time Dynamic Fracture with Volumetric Approximate Convex Decompositions", SIGGRAPH 2013 (fracture patterns aligned at the impact).
  - Iben & O'Brien, ["Generating Surface Crack Patterns"](https://diglib.eg.org/handle/10.2312/SCA.SCA06.177-185), SCA 2006.
  - Goehring et al., Soft Matter 2010 ([RSC](https://pubs.rsc.org/en/content/articlelanding/2010/sm/b922206e/unauth)).
- **Fit:**
  - M2. It needs F0's `voronoi2`/`fbm2` and M1's `anisoSpec` and `matcap` for glaze.
  - The pristine plate has a seeded set of old seams. Live breaks fork, and the healed seams persist in `localStorage` (as a union of seam masks, a few KB) only after the visitor opts in (owner decision 2).
  - Goldens use the pristine plate only.
- **Cost:** M. A break is baked once (a shard-id raster, about 1 ms). Each frame only moves shards and reveals seams, under 0.5 ms.
- **Risks:**
  - Kintsugi is a well-worn visual idea, so this lives or dies on the crack quality.
  - Snapshot it against a real photo with `pnpm snap`.

### #10 Lichtenberg figures (dielectric breakdown model)
- **What:** Laplacian growth with an exponent η on the field. η = 1 grows DLA-like coral, and η = 2–4 grows thin, branching **lightning**. This is the burned-in pattern of a high-voltage discharge in acrylic or wood.
- **Why it's not the DLA we already have:**
  - η controls how thin and directed the branches are.
  - The growth follows a real potential field, so it can bend toward a ground electrode (the card edge, or your finger).
  - `algo/dla.ts` is a random-walk cluster with no field and no η.
- **Algorithm:** use Kim et al.'s fast DBM, which needs no Laplace solve.
  - Each candidate cell i holds `φ_i = Σ_j (1 − R₁/r_ij)` over the charged cells j.
  - When a cell joins, add its term to every candidate (O(candidates)). A new candidate is computed from scratch in O(n).
  - Choose the next cell with probability ∝ Φ_i^η, where Φ is φ normalised to [0, 1].
  - Use an integer η (multiply) or `dpow`, so the result is deterministic.
  - Size: about 1,500 cells, grown over about 90 frames.
- **Reference:**
  - Niemeyer, Pietronero & Wiesmann, PRL 52 (1984).
  - Kim, Sewall, Sud & Lin, ["Fast Simulation of Laplacian Growth"](https://faculty.cc.gatech.edu/~turk/bio_sim/articles/laplacian_growth.pdf), IEEE CG&A 2007.
  - Kim & Lin, ["Fast Animation of Lightning Using an Adaptive Mesh"](https://gamma.cs.unc.edu/LIGHTNING/lightning.pdf).
- **Fit:**
  - XM. The card is a **Lichtenberg plate**: tap or hold, and a figure burns from the electrode in 1.5 s. Burned cells become a height (char) through M1's height, AO and light.
  - **Accent:** the live growth front.
  - A pond-night storm variant draws the bolt in `value` with bloom (`light/`), so the koi keep the accent. Thunder arrives with a delay through `src/audio`.
  - The pristine figure is seeded.
- **Cost:** M. About 7M operations spread over 90 frames comes to 0.1–0.4 ms per frame.
- **Risks:** if it is overused it looks like a screensaver. Keep it to one card.

### #11 Hydraulic erosion: "time wears the time"
- **What:** droplet-based hydraulic erosion (Beyer 2015) on a stone height raster. The hour is carved into sandstone at midnight, and **rain wears it down through the day**.
- **Why it's striking here:**
  - Material from relief alone, which is the plan's own rule, plus a slow, real physical process tied to the clock.
  - The digits soften, gullies form and sediment fans out.
- **Algorithm:** per droplet, per step:
  - take the bilinear gradient g, then `dir = dir·inertia − g·(1 − inertia)`, and move 1 cell;
  - `Δh` = the change in height; the capacity is `c = max(−Δh, minSlope)·vel·water·K`;
  - deposit `(sed − c)·deposit` if the sediment is above capacity or the droplet went uphill;
  - otherwise erode `min((c − sed)·erode, −Δh)` over a brush of radius 3;
  - then `vel = √(vel² + Δh·g)` and `water *= 1 − evaporate`.
  - Parameters: inertia 0.05, K 4, minSlope 0.01, erode 0.3, deposit 0.3, evaporate 0.01, gravity 4, radius 3, lifetime 30.
  - **Pure in t:** droplets come in a fixed seeded order, and the state at t is the first N(t) droplets, with N growing with the minutes since midnight. Checkpoint every 2k droplets.
- **Reference:**
  - H. T. Beyer, *Implementation of a method for hydraulic erosion*, TUM thesis (2015); [erodr](https://github.com/henrikglass/erodr) implements it.
  - Sebastian Lague, "Coding Adventure: Hydraulic Erosion" (2019).
- **Fit:**
  - XM. It needs M1's height, AO and light, with raking light from `sceneLight()`.
  - It uses only `√` and mulberry32, so it is deterministic.
  - A tap is a cloudburst: 200 droplets at the tap, live fork.
  - **Accent:** the current minute's digit, kept crisp (erosion is masked off it).
- **Cost:** M. About 300 droplets per frame × 30 steps × a precomputed brush is about 0.5 ms. A cold start at a late hour replays from the nearest checkpoint.
- **Risks:**
  - Digits become illegible by evening, so cap erodibility inside the glyph walls.
  - Relief on a 144² grid needs strong lighting to read.

### #13 Reiter snowflake: a frost window
- **What:** a two-parameter cellular automaton on a hex lattice that grows plates, stellar dendrites and sectored snowflakes. It is a winter sibling of the pond.
- **Why it's striking here:**
  - Six-fold symmetry with faceted tips is unlike anything on the site.
  - **A daily snowflake:** β and γ come from the date seed (#5), so every visitor gets the same, unique flake each day.
- **Algorithm:**
  - Each cell holds s. It is *receptive* if it is frozen (s ≥ 1) or has a frozen neighbour.
  - Per step: `u = receptive ? 0 : s` and `v = receptive ? s + γ : 0`; diffuse `u ← u + (α/12)(Σ₆ u_n − 6u)`; then `s = u + v`.
  - Parameters: α = 1; β (background vapour) = 0.35–0.9; γ = 10⁻⁴ for plates up to 10⁻² for dendrites.
  - Compute one 1/12 wedge and mirror it (12× cheaper).
  - Gravner–Griffeath is the faceted, realistic upgrade, with 3 fields and about 7 parameters.
- **Reference:**
  - C. Reiter, "A local cellular model for snow crystal growth", Chaos, Solitons & Fractals 23 (2005) ([PDF](https://webbox.lafayette.edu/~reiterc/mvp/sfn/sfn_pp.pdf)).
  - Gravner & Griffeath, ["Modeling snow crystal growth II"](https://mk.bcgsc.ca/snowflakes/paper/modeling-snow-crystal-growth-2.pdf) (2008).
  - Libbrecht, ["Snow Crystals"](https://arxiv.org/pdf/1910.06389) (2019 review).
- **Fit:**
  - XM. Hex positions are `sites` with offset rows (√3/2 pitch), so no new lattice type is needed.
  - **Accent:** the growing tips. Frost on glass can combine with Glass v2 (M2).
  - History is cached and t = 0 is the finished flake.
- **Cost:** M. About 10k cells, with wedge symmetry about 1k updated per step, at 40 steps per frame while growing: about 0.6 ms. The full grow is about 5 ms, spread over frames.
- **Risks:** if the γ/β pair is unvetted the result is a blob, so seed from a vetted table of about 30 pairs, not a raw range.

### #14 Subsurface wax: a candle clock
- **What:** cheap subsurface scattering, light bleeding through thin wax and jade, on a candle that **burns down over the day**, with the flame as the accent.
- **Why it's striking here:**
  - Translucency is the one material quality the plan's set (matte, gloss, glass, metal, fabric) lacks.
  - On dots it reads as light *inside* the object: a glowing rim near the flame and a soft terminator.
- **Algorithm:**
  - Wrap diffuse `(N·L + w)/(1 + w)` with w ≈ 0.5.
  - Transmission `T = exp(−σ·thickness)·falloff(flame distance)`, where thickness comes from the existing `distanceRaster` to the silhouette and σ ≈ 0.35 per cell.
  - Candle height = 1 − hour/24.
  - Drips are 2–3 verlet chains (plan `chain.ts`) that set and freeze.
  - The flame shape is `curl2` noise.
- **Reference:** S. Green, "Real-time approximations to subsurface scattering", *GPU Gems* ch. 16 (2004); Jimenez et al., "Separable Subsurface Scattering", CGF 2015.
- **Fit:**
  - **M2, scheduled after L1.4** merges, because the drips need L's `chain.ts`. Never M1. It uses M1's light module and F0.1's `dexp` (or a 64-entry table).
  - Thickness is baked; per frame only the flame and the light move.
  - **Accent:** the flame.
  - A jade-seal variant is lit through `sceneLight()` (`lightSrc` = tilt, `lightAz`/`lightEl`).
- **Cost:** S. About 0.3 ms per frame.
- **Risks:** it can read as just "glow". Check it with `pnpm snap` against a candle photo before calling it done.

### #17 Paper fold operator
- **What:** a field operator that folds a card's field along straight creases with real facet shading and a visible back side. It does tri-fold letters, a fortune teller, and a calendar page that folds over at midnight.
- **Why it's striking here:**
  - Paper is the one everyday material the plan only mentions (letterpress).
  - A fold is also a transition that no other dot UI has.
- **Algorithm:**
  - For a crease with point p, normal n and angle θ, take `d = (x − p)·n` on the moving side. Its projected position is `x − n·d + n·d·cosθ`, at depth z = d·sinθ.
  - The facet normal gives Lambert shading from `sceneLight()`. Past θ > π/2 the flap shows its back (`faint`).
  - **Inverse (per sample):** test the flap first by solving `d = d'/cosθ`, then fall back to the base. Several folds compose in order.
- **Reference:** R. Lang, *Origami Design Secrets* (2nd ed., 2011); the Huzita–Hatori axioms for which creases can be constructed.
- **Fit:** M1 or X1. It is pure in t and wraps any field, so it composes with existing cards.
- **Cost:** S–M. About 0.2 ms per frame for 1–3 folds.
- **Risks:**
  - θ near π/2 is singular (clamp it).
  - It is limited to straight creases, so no crane.

---

## 5. Rendering quality, performance, experience

### #12 Temporal stability for glyph tiles
- **What:** a fix for crawl and sparkle. The plan's `glyphTiles.ts` snaps Sobel angles to `- / | \` and picks the nearest micro-pattern, so a value or angle hovering on a boundary flips the glyph every frame. daoho hides this behind random 3% flicker.
- **Split in two.** `glyphTiles.ts` freezes its API at L1.3, and stateful hysteresis does not fit the pond's checkpoint budget as plain floats, so the stateless half ships in L1.3 and the stateful half is deferred.
- **L1.3 (stateless, inside `glyphTiles.ts` before the freeze):**
  1. **Flicker as blue noise:** replace `Math.random` flicker with `stbn(x, y, frame) < 0.03`, so it is evenly spread in space and time and deterministic.
  2. **A flicker budget check** in `scripts/life.ts`: on a held field, at most 2% of tiles may change per card frame.
- **X1 (stateful, only if memory allows):**
  1. **Glyph hysteresis:** keep the current glyph unless a candidate's L2 match score beats it by δ ≈ 0.08.
  2. **Angle deadband:** ±7.5° around each 45° sector boundary (it needs the previous sector, so it is stateful too).
  - It lives outside `glyphTiles.ts` (a post-filter in the pond world), so the frozen API is untouched. It recomputes the L2 score from the published alphabet descriptors if L1.3 exposes no score accessor.
  - **Purity:** hysteresis makes a frame depend on history, so its state must live in the pond's `World` state (stepped at fixed dt and checkpointed), not in the renderer.
  - **Memory budget:** the pond checkpoints 3,178 floats (12.7 KB) × 16 = 203 KB against a 256 KB gate. One Float32 per tile adds about 1,188 floats, giving 4,366 floats × 4 B × 16 ≈ **279 KB, which fails**. The headroom is 53 KB, i.e. ≤ 3.3 KB per checkpoint. Packed state fits: 6 bits per tile (glyph index 4 bits + sector 2 bits), stored as float-exact 24-bit integers, is 297 floats (1.2 KB) per checkpoint, about 19 KB in total, so ≈ 222 KB. X1 ships hysteresis only in that packed form, and only if L1.7's `pond: checkpoint memory ≤ 256 KB` check still passes; otherwise it is dropped.
- **Reference:** Wolfe et al., "Spatiotemporal Blue Noise Masks", EGSR 2022 (already used by `halftone/`). The halftone stream's level hysteresis already uses the same idea for photos.
- **Cost:** S. About 0.02 ms.
- **Risks:** the visible artefact is boundary crawl at the card's own rate (12 or 30 fps, F0.10), not the display's, so the flicker budget check is the gate. If the packed state doesn't fit, the pond keeps only the STBN half.

### #16 WebGPU agent tier (1M physarum, grid Flow-Lenia)
- **What:** a feature-detected compute tier for the agent sims.
  - Physarum at 1M agents (L2 has 2,400 agents on a lattice-2 trail grid on the CPU).
  - Grid Flow-Lenia (#4).
  - MPM (#19).
- **Why now:** WebGPU shipped in Safari 26 (September 2025, every Apple platform) and in Firefox 141 (Windows, July 2025; Apple Silicon later, Linux and Android still uneven), on top of Chromium. That makes it a real tier, not a Chrome toy.
- **Algorithm:**
  - Agents live in a storage buffer, with one compute pass each for sense, rotate and move.
  - Deposits use **`atomicAdd` on u32 fixed point**. Integer atomics don't depend on order, so the trail map is reproducible on one device. Sensing still uses vendor `sin`/`cos`, so the result is not reproducible across devices.
  - Diffuse and decay in a 3×3 compute pass.
  - Hand the trail texture to the existing GPU pass path (`renderer/webgl/passes.ts`, `GPUTag.density`) or a WebGPU twin of it.
- **Reference:** Jones 2010 (plan), Sage Jenson's physarum notes, and [WebGPU status](https://en.wikipedia.org/wiki/WebGPU) ([Khronos SIGGRAPH 2026](https://www.khronos.org/developers/linkto/webgl-and-webgpu-sigg26)).
- **Fit:**
  - X2, merged with WEB-PLAN C1 / NEXT-PLAN P12 (do not build two WebGPU paths).
  - The **GPU tier is live-only.** Goldens, t = 0 and reduced motion always come from the CPU pristine run.
  - **Invariant gate:** `AGENTS.md:14` allows only "plain TypeScript + browser Canvas/SVG/WebGL2 APIs" in `src/engine/`. WebGPU is a browser API with no dependency, but it is **not** on that list. X2 does not start until the owner approves it **and** AGENTS.md is amended (owner decision 1; the default is no). C1 assumes it too, so the same decision gates both.
  - **Goldens stay CPU.** Nothing GPU-side is ever hashed.
- **Cost:** L.
- **Risks:**
  - Older devices and some Linux setups lack an adapter (fall back to CPU).
  - Thermals on phones (cap agents by `adapter.limits` and frame time).

### #19 MLS-MPM: one solver for sand, snow and jelly
- **What:** the moving-least-squares material point method (Hu et al., SIGGRAPH 2018, the "MPM in 88 lines" solver). One particle-grid solver covers sand (Drucker–Prager), snow (Stomakhin 2013), jelly (neo-Hookean) and water.
- **Algorithm:**
  - Per substep: particle → grid (P2G) over a 3×3 quadratic B-spline stencil, with the affine C matrix (APIC); grid update with gravity and boundary conditions; then grid → particle (G2P).
  - Size: a 64² grid, with 2–4k particles on the CPU or 100k+ on the GPU.
- **Reference:** Hu et al., ACM TOG 37(4) (2018). WebGPU demos run about 100k particles in real time ([three.js forum](https://discourse.threejs.org/t/mls-mpm-simulation-with-webgpu-and-threejs/77686), [CGWorld report](https://cgworld.jp/flashnews/202501-matsuoka-601-LiquidSim.html)). EA's PB-MPM (SIGGRAPH 2024) is a WebGPU variant.
- **Fit:**
  - X2 only. On the CPU, 3k particles × 8 substeps is about 10–20 ms per frame, **which fails the 4 ms budget**.
  - The CPU pristine run is a reduced 800 particles, used for goldens.
  - Cards: the plan's "sand you carve", a snow globe, and a jelly koi-food pellet.
- **Cost:** L.
- **Risks:** precision issues on some Windows GPUs are reported. Keep it as a runner-up until #16 exists.

### #5 A pond that ages: daily seed and growth over visits
- **What:**
  - The **pond of the day:** lily pads, koi varieties and weather are seeded from the local date, so everyone sees the same pond today and a different one tomorrow.
  - **Your pond ages:** koi grow over days of visits, fry hatch every 10 days (capped at 9 fish), and the fish gather where you last fed them.
- **Why it's striking here:** it costs almost nothing and turns a demo into a place people come back to. That matters for a personal site, where returning visitors are the goal.
- **Algorithm:**
  - `day = hash32(YYYY-MM-DD)`.
  - **Weather** is `noise1(dayIndex/5)` thresholded into calm, wind and rain, so it changes smoothly from day to day.
  - **Growth** follows von Bertalanffy: `L(a) = L_max·(1 − e^(−k·a))`, with k ≈ 0.05 per day.
  - **Storage:** `localStorage['pond.v1'] = {born, fed, lastFeed: [x, y]}`, under 200 B, written only after the visitor opts in (owner decision 2). It is read after idle and never on first load. Without opt-in the pond still has the day seed; it just doesn't age.
- **Reference:** the von Bertalanffy growth model. PROGRESS already queues "ambient mode + daily card"; this pick generalises it.
- **Fit:**
  - X1. The date and the age enter as `ctx.data.day` / `ctx.data.age`.
  - **Goldens inject a fixed date and an empty store** (day 0).
  - Nothing leaves the device.
  - The accent stays the koi.
- **Cost:** S. About 0 per frame.
- **Risks:**
  - Storage may be wiped (so the pond just starts over).
  - A date in the URL (`?day=`) overrides the seed, so shared links show the same pond (owner decision 4: yes).

### #6 Bubble acoustics for the pond
- **What:** physically based water sound. Every pellet landing, tap ripple, fish gulp and raindrop is a **Minnaert bubble**: a decaying sine whose pitch rises slightly.
- **Why it's striking here:**
  - It sounds like water rather than a sample.
  - Each sound is tied to a visible event at a known position, so it can be panned to it.
  - It costs nothing visually.
- **Algorithm:**
  - Radius r = 1–6 mm (drawn from a power law).
  - `f₀ ≈ 3.26/r` Hz with r in metres, so r = 3 mm gives about 1.1 kHz.
  - Damping `d ≈ 0.043·f₀ + 0.0014·f₀^1.5`.
  - Pitch `f(t) = f₀·(1 + σt)` with σ ≈ 0.1·d, and the signal is `a·sin(2π∫f)·e^(−dt)`, with amplitude a growing with r.
  - Rain is a Poisson stream of bubbles whose rate follows the day's weather (#5).
  - Implement it as an AudioWorklet voice in `src/audio`.
- **Reference:**
  - K. van den Doel, "Physically based models for liquid sounds", ACM TAP 2(4) (2005) ([GT repository](https://repository.gatech.edu/entities/publication/dcc121b6-5fdb-42db-b758-971522f01c70)).
  - Moss et al., ["Sounding Liquids"](https://gamma.cs.unc.edu/SoundingLiquids/soundingliquids.pdf), ACM TOG 2010.
- **Fit:**
  - **An owner decision, scheduled no earlier than XL** (owner decision 5). Track L rules sound out for L1–L3: cards are pure in ctx and have no side-effect channel, and `src/audio` is started only by the Instrument's SOUND toggle.
  - If approved, it is app-level (`src/audio`, never the engine). The pond world would publish its events (pellet, gulp, raindrop, position) through a new app-level channel that the pixels never read, so goldens and the pristine run are unaffected.
  - **Opt-in and audio unlock:** off by default, behind an explicit SOUND toggle. The `AudioContext` is created or resumed only inside that user gesture (autoplay policy; iOS needs the gesture), and nothing plays before it.
  - The mic → ripple direction (NEXT-PLAN R12) is the inverse and needs no sound output: mic onsets call `rippleSplat`. It belongs to XL too.
- **Cost:** S, plus the event channel.
- **Risks:** mixing. Cap at 24 concurrent voices and add a soft limiter.

### #9 Optical flow from the camera drives the pond
- **What:** dense optical flow on the existing camera stream. Fish flee **in the direction your hand moves** and gather under a still palm, and the hand's motion pushes ripples and lily pads.
- **Why it's new:** `src/vision/` has a motion-history magnitude and a hand point, but no *direction* field. Flow is the missing piece that makes the water respond to a gesture rather than to a point.
- **Algorithm:**
  - Horn–Schunck on 48 × 36 luma (downsampled from the tracker's 96 × 72 frame) at 15–20 Hz.
  - Gradients I_x, I_y, I_t come from 2×2 differences. Each iteration sets `u = ū − I_x(I_x ū + I_y v̄ + I_t)/(α² + I_x² + I_y²)`, and v the same way, with α ≈ 1.5.
  - Run 12 iterations, warm-started from the last frame.
  - Wherever |w| > τ: call `rippleSplat` along w, add a flee force along w, and advect the lily pads. Mirror x.
- **Reference:**
  - Horn & Schunck, "Determining optical flow", AI 17 (1981).
  - Lucas–Kanade (1981), the sparse alternative ([OpenCV.js tutorial](https://docs.opencv.org/5.0/js_tutorials/js_video/js_lucas_kanade/js_lucas_kanade.html)).
- **Fit:**
  - XL. It is live only, so the pristine pond and goldens are untouched.
  - **Placement:** only on the existing camera boards (owner decision 3), as a pond card there. `/pond/` itself never asks for the camera.
  - **Privacy:** on-device, opt-in through the existing CAMERA hint and permission, with no frame stored or sent. The CSP already allows the camera.
  - Smooth with the existing One Euro filter.
- **Cost:** S–M. About 0.05 ms per flow update, on top of the camera pipeline that already exists.
- **Risks:**
  - Low light gives noisy flow (raise τ with the frame's variance).
  - Asking for camera permission on a pond can feel invasive, which is why it stays on the camera boards.

### #18 View Transitions for board → widget
- **What:** `document.startViewTransition()` around the board → `/widget/<slug>/` swap, so the card frame flies to its page.
- **Status:** same-document view transitions became Baseline in October 2025: Chrome 111, Safari 18, Firefox 144 ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)).
- **Dot-specific catch:** a view transition animates **raster snapshots**, so a scaled card bitmap blurs the dot grid mid-flight.
  - Give the frame and chrome `view-transition-name: card-<uid>`.
  - Give the canvas `view-transition-name: none`.
  - Inside, the dots continue with the engine's own `migrate`, so each dot stays crisp at its pitch.
  - The card grows by gaining cells, not by scaling.
- **Fit:** X1. About **+0.3 kB gz** on first load (a delta; measure it), counted inside X1's +0.5 kB line in the ledger (`docs/LIVING-MATTER-PLAN.md` §6). That line only exists after F0.11's ≥ 1 kB cut lands. Under reduced motion it is an instant swap.
- **Cost:** S.
- **Risks:** routing details in `App`'s `useExitSwap`, which must not fight the existing 420 ms exit choreography.

---

## 6. Considered and dropped

| Candidate | Why it was dropped |
|---|---|
| Stable fluids / FLIP / SPH for ink in water | `fluid.ts` already is Stam with vorticity confinement and MacCormack advection. FLIP and SPH add no visible gain at a 144² dot pitch. Couple the plan's ripple to `fluidSplat` instead. |
| Optimal-transport migration, SDF glyph morph | OT is queued in PROGRESS; the morph is built (`migrate/morph.ts`, `typeMorph`). |
| Spatiotemporal blue noise | Built (`halftone/mask.ts`). #12 reuses it for glyphs. |
| Temporal anti-aliasing for dot grids | Dots are vector-exact, so there is no sub-pixel aliasing to resolve. The real temporal artefact is glyph flicker (#12). |
| OffscreenCanvas workers | Built (`src/workers/`). Moving `World` stepping into the same worker is a later perf item, not a new technique. |
| Thin-film interference (soap, oil slick) | Interference is a *hue* phenomenon. In luminance it collapses to cosine bands, i.e. `toneBands` over a sine. That is a gimmick under the one-accent rule. |
| Haptics (Vibration API, iOS `switch` trick) | MASTER-PLAN §10 cuts `navigator.vibrate`, and NEXT-PLAN R11 keeps haptics native-only. The iOS checkbox-switch trick is an exploit WebKit has since restricted ([bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)); one tester reports it patched in iOS 26.5 (unverified). |
| WebXR / AR | Cut in MASTER-PLAN ("off-thesis"). |
| Wang tiles, aperiodic Truchet | WFC is built and multi-scale Truchet is planned. Penrose P3 is superseded for this site by Ammann–Beenker (squares) and the hat (new mathematics). |
| Mic-reactive ripples | NEXT-PLAN R12, and the mic analyser exists. It is a hookup, noted under #6. |
| Cloth tearing | It is a small extension of `pbd.ts` (break a constraint at strain > 1.6). Add it as a detail on Loom or the embroidered patch (M1/M2), not as a headline. |
| Self-organising texture NCA / DyNCA | A "living material that heals" is tempting, but a DyNCA-size model is about 20M MACs per step on 64² (CPU over budget), and training needs an offline JAX pipeline. Revisit on the WebGPU tier together with NEXT-PLAN R1 ([DyNCA, CVPR 2023](https://arxiv.org/pdf/2211.11417), [Self-Organising Textures](https://distill.pub/selforg/2021/textures)). |
| Sand-pile landslide (angle of repose) | `fallingSand` exists. The Abelian sandpile (#8) is the interesting variant. |
| Origami crane folding | Only straight-crease folds (#17) are tractable as a field operator. |

---

## 7. How these slot into the phases

The tracks' phases are F0, L1–L4, Q1–Q3 and M1–M3: L3 is pond polish and interaction, L4 the optional full-bleed hero, Q3 the square field pack, rotation, nested shapes and morphs, and M3 the workshop board extras. This doc's own phases carry an X prefix so they never collide with those: **X1** (pond depth, after L1 and L3), **XL** (pond senses), **XQ** (aperiodic floors), **XM** (growth and wear) and **X2** (the GPU tier).

### Additions to existing phases

| Phase | Add | Prerequisites | Extra estimate |
|---|---|---|---|
| **F0.1 dmath** | `dexp` / `dpow` in `src/engine/noise/dmath.ts`, checked against `Math.exp`/`pow` (< 1e-7), next to `datan2` (accepted; F0 owns it). F0.9's lint covers them | none | in F0's estimate |
| **L1.3 glyph tiles** | #12's stateless half: STBN flicker and the flicker-budget check, inside `glyphTiles.ts` before its API freezes | `glyphTiles.ts`, `halftone/` STBN | +0.25 day |
| **Q1 squares core** | #2 `squares-arctic`, pairing through `JoinSpec.group` as `(u, v) => dominoId` (4-coloured per-domino ids; no `Layer.joinOf`) | join pass and its 3 renderers; the group function form | +1 day |
| **M1 materials core** | #17 fold operator | height + AO, `sceneLight()` | +1 day |
| **L2 ecosystems** | #4 `pond-plankton` (Particle Lenia, vetted parameter sets); #15 a Turing-skin second species | F0.1 `dexp`, spatial hash, `body.ts` | +3 days |
| **M2 glass and water** | #3 kintsugi plate (with the mud-crack variant); #14 candle clock, **after L1.4** merges | F0 `voronoi2`/`fbm2`, M1 `anisoSpec`/`matcap`, M1 light; L's `chain.ts` (L1.4) for #14 | +3.5 days |
| **Q2 squares extra** | #8 Abelian sandpile on the 4-shade presets | Q2 presets, join pass | +1 day |

### New phases

| Phase | What | Prerequisites | Size | Gate |
|---|---|---|---|---|
| **X1 pond depth** (after L1 and L3) | #1 suminagashi card (`pond-marble`, koi tines); #5 daily and ageing pond; #12's stateful half (packed hysteresis, only if memory allows); #18 view transitions | L1 (ripple, chain, steer, World fork); L3; SHARE widget pages; F0.11's ≥ 1 kB first-load cut | 4–5 days | goldens with injected date and empty store; ≤ 4 ms per card frame; first-load **delta ≤ +0.5 kB gz** in the ledger (`LIVING-MATTER-PLAN.md` §6, `size.ts --check`), possible only after F0.11; pond checkpoints ≤ 256 KB with hysteresis state (else it is dropped); storage never written without opt-in; taste pass on the marbled pond |
| **XL pond senses** (after X1) | #9 optical flow (a pond card on the existing camera boards); the mic → ripple hookup; #6 bubble acoustics **only if the owner approves sound** | X1; `src/vision`, `src/audio`; an app-level event channel for #6 | 1.5 days (+1 day with #6) | flow latency ≤ 1 camera frame; no startle loops when the camera is still; camera never requested on `/pond/`; no `AudioContext` before the SOUND gesture; pixels and goldens identical with sound on and off |
| **XQ aperiodic** (after Q3.1) | #7 hat / spectre floor (mirrored hats as the accent) and the Ammann–Beenker floor (squares rotated by Q3.1, rhombi as dot `sites`) | Q3.1 `rotation`; Q1 `{grid.gap}`; an X-owned `hexSites(cols, rows)` helper (built here, reused by XM) | 3–4 days | overlap and area checker over 3 substitution levels; bake ≤ 20 ms; mirrored-hat ratio close to φ⁴ |
| **XM growth and wear** (after M1; cards may join M3's workshop board) | #10 Lichtenberg plate; #11 erosion stone; #13 frost window (daily snowflake) | M1 height + AO and light; F0.1 `dpow`; `hexSites`; #5's day seed | 5–6 days | each pristine run is bit-identical across Node and Chrome; ≤ 4 ms per card frame during growth; legibility check on the eroded digit at 23:59 |
| **X2 GPU tier** (merges with WEB-PLAN C1 / P12) | #16 WebGPU physarum at 1M agents and grid Flow-Lenia; #19 MLS-MPM (sand, snow, jelly) | **owner approval and an amendment to `AGENTS.md:14` for WebGPU** (default no); the C1 compute sampler; the CPU pristine fallback for every card | 2–3 weeks | goldens stay CPU and are unchanged; GPU step ≤ 8 ms at 1M agents on an M1-class GPU at the card's F0.10 fps; graceful fallback when there is no adapter |

### Order
1. F0 (F0.1 delivers `dexp`/`dpow`), then L1 with #12's stateless half in L1.3. In parallel with L1: Q1 with #2 and M1 with #17.
2. L2 and L3; M2 with #3, and #14 once L1.4 has merged; Q2 with #8.
3. **X1** after L1 and L3. It has the best wow per day; #5 and #1 make the pond feel alive.
4. XL after X1 (sound only on the owner's say-so); XQ after Q3.1; XM after M1.
5. X2 last, gated on the owner's WebGPU decision and the AGENTS.md amendment.

### Owner decisions this doc adds
1. **WebGPU in `src/engine`:** amend `AGENTS.md:14` ("Canvas/SVG/WebGL2") to allow a feature-detected, live-only WebGPU tier? **Default no until AGENTS.md is amended.** X2 and WEB-PLAN C1 both wait on it; goldens stay CPU either way.
2. **Persistent memory:** may the ageing pond (#5) and the kintsugi plate (#3) keep a few hundred bytes in `localStorage`? **Recommended: opt-in** (nothing is written until the visitor turns it on in TOOLS).
3. **Camera on the pond (#9):** **existing camera boards only**; `/pond/` never asks for the camera.
4. **Daily seed in shared links:** `/pond/` links carry `?day=`, so a shared pond is the one the sender saw. **Yes.**
5. **Sound (#6):** **out for L1–L3** (track L's ruling; cards have no side-effect channel). If wanted, it is decided no earlier than XL, with an explicit SOUND opt-in and the `AudioContext` unlocked only by that gesture.
