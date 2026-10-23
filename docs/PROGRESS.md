# PROGRESS — handoff checklist

> Single source of truth for **what is done, what is in progress, what was skipped and what is next**.
> Update this file in the same commit as the work. Plan: `docs/MASTER-PLAN.md` (v2). Research: `docs/MOTION-INTERACTION-DEPTH.md`, `docs/ADVANCED-PLAN.md`. Taste: `docs/STYLE-BIBLE.md`.
> Legend: `[x]` done and verified · `[~]` partly done (see note) · `[ ]` not started · `[-]` skipped or deferred on purpose (reason given)

## Status board (updated 2026-10-22)
**Where we are:** On branch `feat/p1-complete`: P0 agent items are done (P0-A borderline). P1-A to P1-F are done. P2-A to P2-D are done: input layer, Components v2, Instrument board, interaction tokens. P3–P6 have not started. 96 presets.
`main` = `666c0eb` (PR #2 merged: TILE boards + P0 + P1 motion core).

| Phase | Plan | Done | State |
|---|---|---|---|
| P0 Foundations, determinism, fidelity harness | 2 wk | 22 / 28 items · 2 / 5 gates | 🟡 3 items waiting on the user; mosaic perf borderline |
| P1 Motion, states, choreography | 2.5 wk | visible items done (P1-A..F) | 🟢 Needs browser checks + Departures taste pass |
| P2 Interaction + Components v2 | 3 wk | P2-A..D done | 🔵 **Active**: polish + gates left (below) |
| P3 Depth, light, material, Field IR | 3 wk | 0 | ⚪ |
| P4 Hero transitions, simulation, agents, live data | 3 wk | 0 | ⚪ |
| P5 GPU, devices, display physics | 3 wk | 0 | ⚪ |
| P6 Authoring + ecosystem | 4 wk | 0 | ⚪ |
| Track L (Perception Lab) / Track R (research spikes) | parallel | 0 | ⚪ |

### Remaining for P0 / P1, by who can unblock it
**Agent can do now (P1, visible; the user's priority order):**
- [x] P1-A: board-to-board exit → enter transition. `DotCanvas.exit` (Bayer, accelerate, 220 ms per card, held blank); `cardMotion()` in `Board.tsx` staggers the exit on the same diagonal inside `VIEW_EXIT_MS` = 420 ms; `useExitSwap` in `App` keeps the old view mounted for that window (instant when leaving LOG/DRAW/WORKSPACE or under reduced motion). The gallery enters and exits too. Verified in the browser.
- [x] P1-B: home-clock split-flap on the minute tick. New `burst` preset flag + `ctx.since`: the card samples live for 1.2 s after the tick. Engine `splitFlapCells` (only changed columns stagger). `flapText` in `henry.ts` folds the flap about the hinge (rows squeeze by \|cos πφ\|, dim while steep). Film: `pnpm snap --film home-clock --since --t 0:0.6:0.05`.
- [x] P1-C: **Departures** flagship board (`src/widgets/boards/departures.ts`, `?board=departures`). Six live cards: split-flap departures list (rows cascade every 7 s; the letter drum has a blank flap), Swiss station clock (58.5 s sweep, rests at 12, minute hand jumps on an underdamped spring), platform-change flip, next-train countdown (minute flip + draining 30-dot bar), line map (dwell + emphasized glide, decoded stop name), service status (decode on change). v0 only: needs the user's taste pass (the v1 pick in the protocol).
- [x] P1-D: data springs on timer, music, fitness and audio-levels (`springKeys`). Details in the Phase 1 section. Not yet watched in the browser.
- [x] P1-E: card upgrades: messages typewriter, audio-levels peak-hold, weather city morph (decode). Details in the Phase 1 section.
- [x] P1-F: Transition Lab in WORKSPACE (`src/components/playground/TransitionLab.tsx`): mask, duration, easing, enter/exit/change, Replay.

**Agent can do now (P0 leftovers, invisible):**
- [~] P0-A: mosaic mount < 30 ms (`thermal-puppy`, `silhouette`, `vision-camera`) + static sample cache across board visits. The cache is done. Mosaic went from 117–200 ms to about 30–33 ms (bench median), so the gate is borderline. Remaining cost is `DotInstance` allocation (SoA `DotBuffer`).
- [x] P0-B: permanent bounds-vs-no-bounds check in `scripts/verify.ts` (§14, all 77 presets, nothing skipped).
- [x] P0-C: migrate `sites` + `lattice` literals to `Layer.size` (`T.dots`, metro `afterlight`; verify §14 lints for it).

**P2 (interaction + Components v2): started 2026-10-22, run as parallel agents on the `Control` contract** (`src/engine/context.ts`: cards declare `controls`; the input layer edits `data[key]` and fills `hover`/`pressed`/`focus`):
- [x] P2-A: input layer: pointer/touch/keyboard → data, hit testing, a11y overlay, hover/press/focus in ctx (`DotCanvas`, `src/engine/interaction/`). Done 2026-10-22: engine `toLocal` / `pick` / `beginDrag` + `dragValue` / `releaseValue` / `keyValue` / `settle` (verify §15); `useControlInput` (pointer capture, `pointers[]` in cells, rAF-batched commits, input frames cut instead of dissolving, springKeys still glide); a hovered / pressed / focused card runs on the clock at 30 fps so focus rings march (still frame under reduced motion); `ControlOverlay` + `.dot-a11y-*` styles (button, `role=switch`, ranges, xy range pair, radiogroup; one roving stop for buttons/switches; 24/44 px hit pads); `DotWidget` owns the data and is `role=group` when interactive. Checked in the browser on `ui-toggle` / `ui-slider` (mouse, drag, keyboard). Not done: axe run, latency gate measurement, multitouch on a real device.
- [x] P2-B: Components v2 on the components board. Done 2026-10-22: 10 new cards with `controls` and hover/press/focus states (`ui-segmented`, `ui-stepped-slider`, `ui-knob`, `ui-stepper`, `ui-check`, `ui-tabs`, `ui-progress`, `ui-loaders`, `ui-keypad`, `ui-text-field`); `pnpm snap --ctx '<json>'` merges extra frame-context fields for state snapshots. Chips and toast not built yet.
- [x] P2-C: **Instrument** flagship board (knobs, crank, XY pad, 16-step sequencer, transport, meter). Done: `src/widgets/boards/instrument.ts`, nine `inst-*` cards with `controls`, rendered purely from `data`/`hover`/`pressed`/`focus`/`t` (hover glow in mid, press one quantize step down, marching-dots focus); red only on the playhead, record light and XY live dot. Goldens added; needs a browser check once P2-A lands.
- [x] P2-D: DESIGN.md "Interaction" tokens + lift pass (`henry-bear`, `sunburst`). The bunny is still a little blobby.
- [x] P2 follow-up: `ui-toggle` / `ui-slider` now draw hover glow + marching focus ring; segmented / tabs / radio / transport pass `optionLabels` (screen readers read "Record", "Play", "Stop", not "1/2/3").

**P2 left (agent can do):**
- [x] P2-E: chips + toast cards. Done 2026-10-22: `ui-chips` (4 stadium toggles, own data keys) and `ui-toast` (animated top slide-in reveal, dismiss button), both in components board; goldens +2.
- [ ] P2-F: browser pass on the Instrument board (knobs, crank, XY, sequencer, transport) and the new `ui-*` cards; axe run on the overlay.
- [ ] P2-G: measure the one-frame input latency gate; multitouch on a real device.
- [x] P2-H: a released touch lingers in `pointers[]` for 520 ms (`up: true`, not down/inside, never hover/pressed) and keeps the clock live, so `ui-keypad`'s ripple finishes; `ptr()` ignores lingering pointers.
- [x] P2-I: `size` only re-grids the canvas (layers and boxes share cell space), so controls stay on unscaled; boxes fully outside the smaller grid are dropped.
- [ ] P2-J: `inst-level` follows the sequencer's default pattern, not live edits (cards don't share data yet; needs board-level data).

**P3 (depth, light, material, IR): started 2026-10-22**
- [x] P3-B: **Cinema** flagship board (`src/widgets/boards/cinema.ts`, `?board=cinema`): nine `cinema-*` film posters of the Afterlight cycle (noir, sci-fi, western, horror, romance, documentary, thriller, drama, musical), procedural scenes baked onto one 2.5-cell luma lattice, title on the same lattice knocked out of the scene, one red "last light" per poster; quantized 12 fps projector flicker + `decodeText` title per 16 s reel; EXIT 14 centre dashes move. Goldens +9.

**Needs the user (blocked):**
- [ ] P0-D: lattice ladder migration (35 → 8 sizes). Changes how the liked boards look → decision §11.5.
- [ ] P0-E: `accentRole` on multi-accent cards → decision §11.1.
- [ ] P0-F: score the 71 cards for the rank-validity gate (needs a human taste pass).

**Deferred to a later phase (not blocking P1 exit):**
- [-] SoA `DotBuffer` + pools, `layers()`/`live()` split, keyed layer transitions, States API → do these with P2 interaction, where they are needed.
- [-] Font registry → `layoutText` → typewriter on local faces: P1-E uses the existing `textDots` instead.
- [-] Afterglow decay raster → P3 (Raster kind).
- [-] Cross-engine goldens, `snap --replay/--ref/--diff`, the G6 flash check → Track L.
- [-] Engine barrel curation + library `.d.ts` build → P6 packaging.

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
  - [x] P0-B: permanent check in `scripts/verify.ts` §14. Every preset (77, animated ones at t=0 and 1.3) samples identically with each layer's `bounds` stripped. No card is skipped; the check takes about 1–4 s on this machine.
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
  - [x] P0-C: board literals migrated. `T.dots` now returns `size`, and so does the metro `afterlight` face layer. verify §14 fails on any preset site layer that still carries `lattice`. Hash-neutral: all goldens unchanged.
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
- [x] Static sample cache across board visits (perf item 5, part of P0-A), in `src/hooks/useDotField.ts`.
  - Module-level LRU of 200 entries, keyed by layers-function identity + theme + JSON of grid/style/t/data.
  - Only presets that are neither `animated` nor `clock` are cached. Cached dot arrays are shared, so treat them as read-only.
- [~] **P0-A mosaic mount: about 30–33 ms, down from 117–200 ms.** Measured as the median of 3 interleaved `pnpm bench` runs per side on a busy machine. The gate sits at the edge: runs gave 30.4, 32.7 and 47.6 ms. All changes are hash-neutral.
  - Sampler (engine):
    - lattice groups are composited and scanned only inside the union of their fields' bounds, where they used to cover the whole sub-grid (a 0.72 caption spans about 200×200 cells);
    - cell-centre tables are cached per width;
    - typed scratch buffers are reused, and owner indices replace the holey tone array;
    - site merge keys are numeric, with exactly the `toFixed(2)` equality (tested in verify §14).
  - Fields:
    - `len()` (`Math.sqrt`) replaces `Math.hypot` in hot photo fields. Hypot is about 12× slower in V8 and not engine-identical;
    - bbox early-outs in the vision-camera desk;
    - `baked(grid, field)` (`src/widgets/types.ts`) memoises static photo fields per cell: puppy, skyline, corridor, desk, car, thermal tones and the fitness wash.
  - Card mount ms, before → after (bench median): `thermal-puppy` 56–64 → 4.4, `silhouette` 34–39 → 4.9, `vision-camera` 39–82 → 4.5, `thermal-monitor` 12–15 → 8.8.
  - Boards, before → after (ms): henry 43 → 34, deerflow12 31 → 16, henry3 50 → 12, metro 25 → 12, ride 23 → 13, audio 92 → 21, components 8 → 4. Departures is about 6.
  - **Caveat:** bench is a warm median. The first-ever sample of a card is still JIT-bound and fills the baked tables, so it improved much less (mosaic first pass ≈ 280 ms in both). The stagger entrance spreads that cost, and the static cache removes it on revisits.
  - What is left is mostly allocating `DotInstance` objects and GC: about 42 k dots per mosaic mount. The SoA `DotBuffer` (P1) is the next lever.
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
- [~] Mosaic mount < 30 ms: about 30–33 ms on the bench median, borderline (see P0-A under Performance).
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
- [x] P1-D data springs: opt-in `WidgetPreset.springKeys` → `DotCanvas` `spring` transient re-samples each frame with `DataSprings` (half-life .12 s) until settled, no IGN dissolve; live cards read the springs per frame. Wired on timer, music, fitness, audio-levels. Reduced motion = instant. Not yet checked by dragging in the browser.
- [ ] Tab switch exit → enter. Only the enter runs now; the old board unmounts instantly.
- [x] P1-F Transition Lab in the playground (WORKSPACE, bottom row): mask, duration 150–1200 ms, easing, enter/exit/change (preset → next preset), Replay; engine `revealDots`/`transitionDots` on a canvas.
- [x] P1-E card upgrades (home-clock split-flap landed separately as P1-B; pure in `t`, t=0 frame unchanged): messages typewriter + blinking cursor (9 s cycle), audio-levels mic meter with decaying peak-hold dot, weather cycles TOKYO/OSAKA/KYOTO via `decodeText` (6 s). Goldens: new t=1.3 entries for those three. Home-clock split-flap not done.
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

Work the **Status board** list top to bottom: P1-A → P1-F, then P0-A → P0-C. When all of those are ticked, P1 is closed and P2 (interaction + Components v2) starts.

## Known issues / notes for the next agent
- **Pending browser checks (2026-10-22):** the data springs (drag the WORKSPACE sliders on timer, music or fitness) and the Transition Lab panel were only verified by tsc, verify, goldens and headless snaps. The preview browser hung before a manual look. One agent saw a React warning, "Cannot update a component (`Board`) while rendering `DotCanvas`"; reproduce it on the current tree before fixing.
- Agent worktrees live under `.claude/worktrees/` (gitignored, and ignored by the Vite watcher).
- Root `index.css` sets centred text. New views must set `text-align: left` (the LOG view does).
- `pnpm snap` renders CJK as empty; icons render fine headlessly.
  - Agents keep claiming icons are empty. They are not: verify asserts every icon rasterizes.
- Weakest cards: `henry-bear`, `silhouette`, `thermal-puppy`, `sunburst`, `vision-camera`, `ev-charge` (MASTER-PLAN §5).
- Ports 5173/5174 may be held by old dev servers; use `pnpm dev --port 5180 --strictPort`.
- Node/tsx start slowly on this machine (about 3 s), and `tsc -b` can take minutes while other jobs run. Use generous timeouts.
- Overlapping dots of the same colour and opacity now render as a **union** (one path) in both SVG and canvas, instead of stacking alpha. This was intended (overlapping lattice dots read as one shape), but check it if a card relied on alpha build-up.
- SVG export uses `<use href>` (SVG 2). Very old design tools may need `xlink:href`.
