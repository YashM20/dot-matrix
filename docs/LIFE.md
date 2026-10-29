# LIFE — living scenes in glyph tiles

> Current (2026-10-28, Phase L1). Code: `src/engine/life/` (import from `src/engine/life`: it is deliberately not re-exported by the `src/engine` barrel, which first-load code imports), cards: `src/widgets/boards/pond/` (board `pond`, `/pond/`), checks: `scripts/life.ts` (run by `pnpm verify`; alone: `npx tsx scripts/life.ts`; `--snapshot` prints the determinism hashes). Plan and rationale: [`living-matter/L-pond.md`](living-matter/L-pond.md).

A koi pond drawn the dot-matrix way, after daoho.dev's ASCII koi pond but with no daoho code or constants: wave-equation water, dot micro-glyph tiles, koi on follow-the-leader spines with Reynolds steering and published swim kinematics. Every scene is a physics `World` (`src/engine/physics/world.ts`): a pristine, seeded, looped run that goldens, thumbnails and reduced motion read, and a live fork on input that heals back 4 s after the last input.

| Module | What | Source |
|---|---|---|
| `ripple.ts` | Two-plane wave equation, h' = (ΣN4/2 − hPrev)·damp, walls = mask 0. **API frozen at L1.2** (M2's caustic pool) | H. Elias, *2D water* |
| `glyphTiles.ts` | Alphabets (`EDGE3 RAMP3 SHAPE3 QUAD4 RAMP4 FONT57`), `matchTile`, edge snapping, the tile raster with a big-dot plane, STBN `flickerOn`, `tileLayers`. **API frozen at L1.3**; Q adds alphabets via `defineAlphabet` only | A. Harri, *ASCII characters are not pixels* |
| `chain.ts` | Spine with a joint limit, Verlet rope, FABRIK | argonaut (animal-proc-anim); Aristidou & Lasenby 2011 |
| `body.ts` | Width profile LUT, swim wave, the body raster (body, fins, tail fan), koi marking LUTs, Strouhal beat | Videler 1993; Taylor, Nudds & Thomas 2003 |
| `steer.ts` | seek / flee / arrive / wander / contain / separate / align, turn-capped `integrate`, C-start `startle` | Reynolds 1999; Eaton 1977, Domenici & Blake 1997 |
| `pond.ts` | `createKoiPond(spec)` (the world) and `drawKoiPond` (state → tile raster) | — |

## Pipeline

Everything a pond card draws is one **tile raster** (`TileRaster`): per card cell a tone index (`LIFE_TONES`: faint, mid, idle, value, activeDim, active) and a value, plus one optional big dot per tile. `tileLayers` turns it into one multi-tone `toneOf` layer over the tile box (one sampler scan) and, when any big dot is set, one `lattice: 4` layer on the tile grid (the sampler hides card dots under it). So a glyph is ordinary card dots (goldens, X-ray and quantization all work), and bigger things are coarser lattice dots, never clusters of small dots.

`pond-koi`: tiles are 36 × 33 at pitch 4 from card row 11 (a glyph is 3 × 3 dots plus a 1-cell gutter). The ripple grid is the tile grid.

## Body style (the L1.0 ruling)

Two ways to fill a koi's interior were prototyped (one L = 56 koi on a still pond, both styles at 1× and 2×, a film and all four varieties, through the real draw path): **A** stamps each interior tile as a full micro-glyph (bright background pixels with a darker ramp glyph), **B** draws each interior tile as **one lattice-4 dot**, shaded by dot size, with glyph-matched edges, fins and tail. A body tile counts as interior at ≥ 60 % cover (the plan's 85 % left a 3-tile-wide koi mostly edge glyphs, so it read as a chain of beads). B is the default (`DEFAULT_BODY_STYLE = 'lattice'` in `pond.ts`; it satisfies "never clusters of small dots" as written and reads as one body). A is a one-line switch (`bodyStyle: 'glyph'` in the spec, or the constant), pending the owner's ruling.

## The koi

- **Spine:** 20 nodes, seg = L/19, joint limit .11 rad (the plan's .16 let a cruising koi curl into a full C). Only the head integrates motion.
- **Body:** B(s) = .13·L·√s·(1 − s)^1.15 / .3634 (peak at s = .303); .13 rather than the plan's .11 because .11 read as eels at tile resolution. The LUT holds (1 − s)^1.15 on 1,025 points and √s is applied exactly (a 257-point LUT of the whole profile can't follow √s at the snout or the bend at the tail). Koi lengths 46, 43, 41, 40, 44, 37 (the plan's 44–56 crowded a pond 2.4 lengths wide). Dives aim for z ∈ [.1, .65]. Pectoral fins at s = .19, pelvic at .47, swept back 35° and flapping ±12°·beat; a forked tail fan for s ∈ [.86, 1.06].
- **Swim wave (render time):** A(s) = L(.02 − .0825 s + .1625 s²)·beat, k = 2π/1.1 per length; beat frequency f = 1.5·U/L (Strouhal .3).
- **Burst and glide:** burst .6–1.2 s at .6 L/s² toward 1 L/s, glide 1.5–3.5 s (beat × (1 − dt/.6), U × (1 − dt/2.2)) down to the .28 L/s cruise. These are slower than the published 1.4 L/s burst, which looked frantic in a pond 2.4 body lengths wide.
- **Turning:** the heading turns toward the steering target at a capped rate, min(mode cap, U / (R·L)) with R = .9 (.45 while contain is active): a koi turns on about a body length. The C-start (a tap within .7 L, a > 90 cells/s flick within .9 L) bends 90–105° at 14 rad/s for 4 steps, then escapes at 2.6 L/s for .4 s; refractory 1.5 s.
- **Steering weights (× L/s²):** wander .6, contain 2.5 (1.2 s look-ahead, margin .45 L), separate 1.4 (heads and nearest spine nodes, .6 L), align .15 (1.2 L), food 1.2 (nearest floating pellet within 2.5 L in front), curiosity .8 (pointer still for .6 s), lure 1.6 (press held .3 s). The bank is also a hard wall: a head that reaches it is pushed back.
- **Markings:** a 64 × 16 LUT per koi over (s, v/B), baked once from `fbm2` (kohaku, sanke, showa, tancho); frames only read it. Kohaku red is fbm2 > 0 (the plan's .12 gave 10–30 % red over seeds; 0 gives 30–50 %); the tancho crown covers s ∈ [.045, .215] so it survives the head's edge and eye tiles. Six bakes take ~4–9 ms once per mount (a 4-octave fbm2 is ~.65 µs here, about 3× the plan's estimate). Red is `active`, the only accent; darker red is a smaller red dot, never `activeDim` (owner decision D2).

## The water

Elias water at tile resolution (damp .984 per step at dt 1/30). Per water tile, from the gradient at its centre: a crest (∇h·(−.6, −.8) > .12) is `=` in value; slopes are line glyphs along the iso-line in faint / mid / idle by steepness; calm water shows drifting contour lines of a slow noise field and a 3.5 % STBN twinkle. Koi wakes are moving point sources (−.01·(U/L)·beat per tail node per step), so V-wakes come from the wave equation itself. Foam (18 × 17, decays ×.95, diffuses every 2nd step) draws `·` and `:`. The shore is a baked rim line; the bank is Voronoi stones in density glyphs. Lily pads (three, drifting with `noise2`) are drawn over the koi.

## State, loop and memory

One `Float32Array` of 3,178 floats (12.7 KB): globals, 6 × 16 koi floats, 6 × 40 spine floats, 18 × 8 pellet floats, two ripple planes (2 × 1,188) and the foam (306). dt 1/30, lead 12 s, period 48 s, seam 3 s; checkpoints every 120 steps, at most 16: 15 are kept (0, 120, …, 1680), so nothing evicts once warm. Total ≈ 15 × 12.7 + 6 working copies × 12.7 ≈ 267 KB (the gate is 288 KB for this card). The world's seam blends toward the loop-start state with k = 1/(rem + 1) while the koi keep swimming, which left them about a tile off at the wrap; the pond's blend doubles k (capped at 1), so the remaining gap telescopes to exactly 0 and the wrap changes 0.3 % of dots (an ordinary frame changes ~13 %). The autopilot (feeds at 6 s and 28 s, surface kisses at 21 s and 46.5 s, dives on per-koi hash schedules) reads the loop phase, so the pre-roll before the loop start matches the loop end.

## Input (scroll-first, UX-PLAN §10)

The card is a touch surface: a vertical swipe scrolls the page, a tap is replayed as a short press, a 300 ms hold or a horizontal drag engages it. Tap: a ripple, then 5–7 pellets that land with ripples and startle nearby koi. Hold ≥ .3 s: a lure (no pellets). Hover (desktop): wake ripples; still for .6 s: the two nearest koi come and circle. Enter / Space: pellets at the centre. Reduced motion: no input, pristine t.

## Worker bundle

Pond cards are main-thread only (`mainThread()`). The sampling worker imports the eager registry, so `vite.config.ts` resolves `boards/pond/index` to `boards/pond/worker-stub.ts` in the worker build only (`mainThreadOnly`). A pond id is then unknown to the worker, which replies with an error, and the card samples on the main thread.

## Checks (`scripts/life.ts`)

Ripple (bit-exact symmetry, wave speed, energy decay, walls, M2's 72 × 62 pool, cost), glyph tiles (self-match, edge snapping, pinned bitmaps and STBN table, raster ≡ layers, memo hit rate, flicker purity and budget), chain / rope / FABRIK, body (profile, LUT accuracy, symmetry and area, swim envelope, markings, bake cost), steering in the real scene (10 simulated minutes inside the pond, turn caps, C-start, Strouhal), the world (purity, seam, memory, violent input, step cost), the card (t = 0 content, one accent, frame and matching budgets, style B lattice-only interiors) and interaction (tap, hold, flick, heal, live frame cost), plus the Node ≡ Bun/JSC state hash when Bun is installed.
