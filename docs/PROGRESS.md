# PROGRESS — handoff checklist

> Single source of truth for **what is done, what is in progress, what was skipped and what is next**.
> Update this file in the same commit as the work. Plan: `docs/MASTER-PLAN.md` (v2). Research: `docs/MOTION-INTERACTION-DEPTH.md`, `docs/ADVANCED-PLAN.md`. Taste: `docs/STYLE-BIBLE.md`.
> Legend: `[x]` done and verified · `[~]` partly done (see note) · `[ ]` not started · `[-]` skipped or deferred on purpose (reason given)

## How to resume (read first)
1. `pnpm i`, then `pnpm dev`.
   - Tabs: BOARDS, GALLERY, WORKSPACE, LOG and DRAW.
   - Deep links: `?board=<id>`, `?card=<id>`, `?tab=log`.
2. Checks: `pnpm check` (tsc + oxlint + `scripts/verify.ts`), `pnpm golden --check`, `pnpm build`. CI runs all three, plus a perf report (`.github/workflows/ci.yml`).
3. Tooling (all write to the gitignored `.snapshots/`):

| Command | Output |
|---|---|
| `pnpm snap <ids> \| --board <id> \| --all` | PNG snapshots |
| `pnpm snap --film <id> --t a:b:step` | Contact sheet + APNG |
| `pnpm snap --bar <id>` | Candidate vs the liked cards: 1×, 3×, blur, silhouette |
| `pnpm golden [--check]` | Golden dot-list hashes in `goldens/hashes.json` |
| `pnpm fidelity [ids\|--all] [--json]` | Gates G1–G3, G5 + metrics |
| `pnpm bench [--strict]` | Per-board mount and frame ms, SVG KB |

4. **Intentional visual change?** Run `pnpm golden` and commit `goldens/hashes.json` with it. CI fails on unexplained drift.
5. Read `AGENTS.md` (invariants), then `MASTER-PLAN.md` §2–§4, then `STYLE-BIBLE.md`, then this file's **Next up**.
6. Decisions still open (MASTER-PLAN §11). Until the user answers, work with the **recommended defaults**:

| Decision | Default |
|---|---|
| Accent | One accent hue, plus `accentRole` |
| Scene and photo heroes | May skip quantization |
| Hover, focus and press states | Allowed, never in the accent colour |
| Frame-rate tiers | 12/30/60, driven by the master clock |
| Type ladder | {.72, 1, 1.3, 1.6, 2, 2.5, 3, 4} |
| Field IR | Core deliverable |
| Product scope | Undecided |
| Packages and Tailwind | Undecided |

## Session log
### 2026-10-14 (a) — research, plan, changelog
- [x] Audit + benchmark → `docs/ADVANCED-PLAN.md`.
- [x] Motion, interaction and depth research → `docs/MOTION-INTERACTION-DEPTH.md`.
- [x] Live prototype → `public/lab/motion-lab.html` (served at `/lab/motion-lab.html`).
- [x] Master plan v1, reviewed by 3 adversarial critics, refined into **v2** → `docs/MASTER-PLAN.md` (critique log in its appendix).
- [x] Root `CHANGELOG.md` (engineering history) + **public changelog in the app** (LOG tab: `src/changelog.ts`, `src/components/Changelog.tsx`, `.log-*` styles).
  - DRAW stays the last tab because the narrow layout hides the last one.
- [x] Commits `f748396` and `c8af647`, pushed.

### 2026-10-14 (b) — Phase 0 + start of Phase 1
Four parallel agents, each owning separate files, plus the main thread on the engine core. See the phase checklists below for per-item detail.
- [x] Engine core: `math.ts` (hash32/hash01, clamp/mix/smoothstep), `context.ts` (FrameContext), `clock.ts` (master clock), sampler hardening, compact SVG, batched canvas.
- [x] Board files: deterministic hash, H1 clip fix, thermal/apps perf, `clock` flag. **Liked cards verified unchanged**; only the mini-game star seeds were retuned.
- [x] Fidelity tooling: snap film/bar, golden, fidelity, bench (`scripts/`, `scripts/lib/`).
- [x] Draw fixes (H4 + DPR + URL leaks + shortcuts).
- [x] `STYLE-BIBLE.md` and the CI workflow.
- [x] P1 motion core: masks, easing, springs, reveal/transition, text decode/split-flap. Wired in: board entrance + change dissolves.

## Phase 0 — Foundations, determinism, fidelity harness
Plan reference: MASTER-PLAN §4 P0.
### Hardening
- [x] H1: `cells()` in `mosaic.ts` returns 0 outside its box. All 71 presets render identically with or without bounds (checked by a throwaway script).
  - [ ] Still to do: add that bounds-vs-no-bounds check to `scripts/verify.ts` permanently.
- [~] H3, partly done:
  - [x] Tests moved from `src/engine/verify-acceptance.ts` to `scripts/verify.ts`, so the engine no longer imports widgets.
  - [x] `superformulaPath` falls back to a circle instead of throwing.
  - [ ] **Not done:** curating the `src/engine/index.ts` barrel (`export *` still leaks internals), and the library build with `.d.ts`. Both belong to the packaging step (P6).
- [x] H4 Draw:
  - W/H apply on blur/Enter (Escape reverts);
  - resize is an undoable snapshot (size + content);
  - DPR-aware canvas;
  - object URLs revoked;
  - B / E / [ / ] / Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts work.
  - New hook API: `resize`, `setPitch`, `commitStroke`, `replaceMatrix`, `loadMatrix`.
  - Known: Draw state is lost when you switch tabs (`App` unmounts it).
- [x] M7 sampler guards: bad lattice values fall back to 1, NaN sites are skipped, `catmullRomField([])` returns 0. Tested.
- [x] Non-mutating `bounded()`: it returns a wrapper, and layout helpers use a private `own()` on the hot path.
- [x] Cover and visibility decided on the **quantized** value (`shown()` in `gridSampler.ts`). Tested.
- [x] `Layer.size` for site layers. `lattice` is still honoured on sites when `size` is absent.
  - [ ] Still to do: migrate board literals that pass `sites` + `lattice` over to `size`.
- [x] Per-card error isolation: a sampling error renders a blank card; the live path keeps the last good frame.
### Determinism
- [x] `hash01`/`hash32` (`src/engine/math.ts`, murmur3 finaliser) replace every `fract(sin)` hash in the board files and in `waveformField`. Goldens re-baselined.
- [x] Determinism lint in verify §12: `src/engine` may not contain `Math.random(`, `Date.now(`, `new Date(` or `43758.5453`. Proven to catch a planted violation.
- [x] `FrameContext` + `Pointer` + `LayerSource` (`src/engine/context.ts`); `WidgetContext` is an alias.
- [x] Master clock (`src/engine/clock.ts`):
  - one shared rAF, with per-subscriber fps and `t = frame/fps`;
  - pauses while the page is hidden and never resets;
  - `invalidate()` forces a draw on the next frame;
  - animated cards draw **imperatively** from it, with no React render per frame.
  - Tested with a fake rAF.
- [ ] Goldens identical in Chromium and WebKit. Not tested: `pnpm golden` runs in Node only.
### Performance
- [x] Jitter fast path.
- [x] SVG compaction: `<defs>` + `<use>` + `<g>` per fill, 2 dp, about 39 B per dot. The deerflow12 board went from 1.39 MB to 359 KB; `bench` shows every board under 512 KB.
- [x] **Batched canvas renderer**: one `Path2D` and one `fill()` per (colour, opacity). This removed a ~650 ms main-thread stall during dissolves.
- [x] thermal-monitor heat computed once per cell (about 97 → 38 ms); `apps` icons bounded (about 53 → 21 ms). Timings were taken on a busy machine.
- [x] Scoped minute tick: only `clock: true` presets (`home-clock`) re-sample each minute.
- [x] Playground: `withChrome()` cached per preset, so the preview no longer re-samples on unrelated store changes (part of M9).
- [ ] Static sample cache across board visits (perf item 5).
- [ ] **Mosaic mount is still about 100–200 ms** (bench is noisy). The progressive entrance hides most of it: cards sample at their stagger delay. The gate (< 30 ms per board) is not met yet. Next targets: `thermal-puppy` 99 ms, `silhouette` 70 ms, `vision-camera` 68 ms.
### Fidelity tooling
- [x] `snap --film`, `snap --bar`, `golden` (+ `--check`), `fidelity`, `bench` (`scripts/`, `scripts/lib/{raster,cards,freeze}.ts`).
- [ ] Not built: `snap --replay` (needs pointer input, P2), `--ref` with HVS-SSIM (Track L), `--diff` pixelmatch, the G6 flash-safety check.
- [x] `docs/STYLE-BIBLE.md`: 10 rules with pass/fail cards and a ship checklist.
  - Open questions it raised: measure the 2.5× scale contrast on cap height, not on the lattice ratio; is the mosaic red index "primary"?; the mosaic footer values don't fit at 1.3.
- [ ] Lattice ladder migration (35 values → 8). **Deferred on purpose:** it changes the look of every board, including the liked ones, so it needs bar-sheet review and the user's sign-off on decision §11.5.
- [ ] `accentRole` on every `active` layer (26 cards have several). Waiting on decision §11.1.
- [ ] Font registry (M1). Needed before `layoutText` and local-face decode.
### Calibration and CI
- [ ] Score all 71 cards (visual + life), check rank validity, κ ≥ 0.6, and produce the "weakest 15" list. **Needs a human taste pass**; `fidelity` covers only the automatable gates.
- [x] GitHub Action: install, `pnpm check`, `pnpm build`, `pnpm golden --check`, `pnpm bench` (report only, `continue-on-error`).
  - [x] Green on GitHub (run 38613505006, commit `e52b383`). Goldens computed on Linux match the Windows baselines.
### P0 exit gates
- [x] CI green on GitHub.
- [ ] Mosaic mount < 30 ms (not met; see Performance).
- [x] Board SVG < 0.5 MB (bench: every board under 512 KB).
- [ ] Rank validity / κ ≥ 0.6 (needs human scoring).
- [ ] Cross-engine goldens.

## Phase 1 — Time: motion, states, choreography
Plan reference: MASTER-PLAN §4 P1. **Flagship: Departures.**
### Engine (`src/engine/motion/`)
- [x] `masks.ts`:
  - bayer (2^k table), ign, noise, diagonal, wipe, radial, curtain, scan;
  - `ditherEdge(geometry, dither, k)`, `maskByName`.
  - [ ] Blue-noise table not done: needs an offline void-and-cluster bake (Track L).
- [x] `easing.ts`: `cubicBezier`, M3 tokens (standard, emphasized, decelerate, accelerate), durations, `progress()`.
- [x] `spring.ts`: closed-form `criticalSpring` (Holden), `underdampedSpring`, `DataSprings` (re-targets with velocity, pure `at(t)`, `settled()`).
- [x] `reveal.ts`: buffer-level `revealDots` (enter/exit, flashing scan edge, keeps colour so the accent survives) and `transitionDots` (prev → next, cell by cell in mask order).
- [x] `text.ts`: `decodeText` (scramble within the character class, left→right lock-in, pure in `tau`) and `splitFlapText` (drum stepping with column stagger).
- [x] Tests for `motion/*` (verify §13, 20 checks): masks in [0,1), bayer has 64 ranks, reveal/exit/transition boundaries and complements, scan-edge flash, spring half-life/no-overshoot/settling, DataSprings re-target without a jump, bezier monotonicity, decode/split-flap end states and digit-only scrambles.
- [ ] SoA `DotBuffer` + pools. Not started; per-frame allocation is still `DotInstance` objects.
- [ ] `layers()` / `live()` split + liveness lint.
- [ ] Keyed layer transitions, `coarsen`.
- [ ] States API.
- [ ] `layoutText` (blocked on the font registry); typewriter.
- [ ] Afterglow decay raster.
### App
- [x] **Board entrance:** cards enter on a diagonal stagger (`(row + col) × 70 ms`) with a Bayer reveal (420 ms, decelerate, bright scan edge).
  - Each card **samples only when its turn comes** (progressive sampling).
  - Skipped under reduced motion.
  - Verified in the browser: lit-dot counts rise in stagger order.
- [x] **Change dissolve on every card:** any re-sample that changes the dots (data slider, minute tick) dissolves old → new in IGN order over 360 ms.
  - Identical frames are skipped.
  - SVG cards switch to canvas for the dissolve and back to SVG afterwards.
  - Verified in the playground.
- [x] Reduced motion: no entrance, no dissolve (instant).
- [ ] Data springs wired into cards: an opt-in `springKeys` on presets for timer, music and fitness. Not wired yet; the dissolve is the generic fallback.
- [ ] Tab switch exit → enter. Only the enter runs now; the old board unmounts instantly.
- [ ] Transition Lab in the playground.
- [ ] Card upgrades: home-clock split-flap via `splitFlapText`, message typewriter, meter peak-hold, weather morph.
- [ ] Lift pass: home-clock, weather, messages, settings, agent-status, word-play, codex-tokens.
- [ ] **Departures** board, through the v0–v5 protocol (needs the user's pick at v1 and a like at v5).
- [ ] P1 exit gates.

## Next up (in order)
> **User feedback (2026-10-14, end of session): priorities were wrong.** Too much tooling and docs, not enough visible work.
> Focus next on what the user sees, in this order:
> 1. Board-to-board transition: old board exits (`revealDots` exit, staggered), then the new one enters.
> 2. Split-flap digits on the home-clock (`splitFlapText`, triggered on the minute tick).
> 3. The **Departures** flagship board (live split-flap transit board).
> 4. Interactive components (extend `components.ts`; the user loved this board).
>
> Keep doc and tooling updates minimal: just tick this checklist.

1. Wire data springs (`springKeys`) and a home-clock split-flap using `splitFlapText` + `tick`.
2. Font registry (M1), then `layoutText`, then decode on local faces.
3. Departures flagship: v0 references + thesis, then 3 variants for the user to pick.
4. Mosaic mount cost (thermal-puppy, silhouette, vision-camera) and the static sample cache.
5. User decisions §11.1 (accent) and §11.5 (ladder), then the `accentRole` annotation and the ladder migration with bar-sheet review.

## Known issues / notes for the next agent
- Root `index.css` sets centred text. New views must set `text-align: left` (the LOG view does).
- `pnpm snap` renders CJK as empty; icons render fine headlessly.
  - Agents keep claiming icons are empty. They are not: verify asserts every icon rasterizes.
- Weakest cards: `henry-bear`, `silhouette`, `thermal-puppy`, `sunburst`, `vision-camera`, `ev-charge` (MASTER-PLAN §5).
- Ports 5173/5174 may be held by old dev servers; use `pnpm dev --port 5180 --strictPort`.
- Node/tsx start slowly on this machine (about 3 s), and `tsc -b` can take minutes while other jobs run. Use generous timeouts.
- Overlapping dots of the same colour and opacity now render as a **union** (one path) in both SVG and canvas, instead of stacking alpha. This was intended (overlapping lattice dots read as one shape), but check it if a card relied on alpha build-up.
- SVG export uses `<use href>` (SVG 2). Very old design tools may need `xlink:href`.
