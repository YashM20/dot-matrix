# PROGRESS — handoff checklist

> Single source of truth for **what is done, what is in progress, what was skipped and what is next**.
> Update this file in the same commit as the work. Plan: `docs/MASTER-PLAN.md` (v2). Research: `docs/MOTION-INTERACTION-DEPTH.md`, `docs/ADVANCED-PLAN.md`. Taste: `docs/STYLE-BIBLE.md`.
> Legend: `[x]` done and verified · `[~]` partly done (see note) · `[ ]` not started · `[-]` skipped or deferred on purpose (reason given)

## Status board (updated 2026-10-22)
**Where we are:** On branch `feat/p1-complete`: P0 agent items done (P0-A mosaic mount ~31–34 ms, gate 30 ms, still open). P1-A..F done. P2-A..J done (browser + axe pass done; only `--mute` contrast 4.14:1 left, a design call). P3-A..G done: light/raster engine, Cinema, Levels, lift pass, Field IR v0, multi-tone layer, materials + time-of-day light. P4–P6 not started. 128 presets.
`main` = `666c0eb` (PR #2 merged: TILE boards + P0 + P1 motion core).

| Phase | Plan | Done | State |
|---|---|---|---|
| P0 Foundations, determinism, fidelity harness | 2 wk | 22 / 28 items · 2 / 5 gates | 🟡 3 items waiting on the user; mosaic perf borderline |
| P1 Motion, states, choreography | 2.5 wk | visible items done (P1-A..F) | 🟢 Needs browser checks + Departures taste pass |
| P2 Interaction + Components v2 | 3 wk | P2-A..J done | 🟢 Instrument taste pass + `--mute` contrast decision left |
| P3 Depth, light, material, Field IR | 3 wk | P3-A..G done | 🟢 Taste passes (Cinema, Levels, light) + exit gates left |
| P4 Hero transitions, simulation, agents, live data | 3 wk | P4-A..C v0 | 🔵 **Active**: migration, SDF morph, live data, MCP App left |
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
- [x] P2-E: chips + toast cards. Toast reworked 2026-10-23: a two-toast stack with an auto-dismiss rail; × toggles `dismissed` (spring), so the newest slides out and the older rises. Done 2026-10-22: `ui-chips` (4 stadium toggles, own data keys) and `ui-toast` (animated top slide-in reveal, dismiss button), both in components board; goldens +2.
- [x] P2-F: browser pass on the Instrument board (knobs, crank, XY, sequencer, transport) and the new `ui-*` cards; axe run on the overlay. Done 2026-10-23 (headless Chrome over CDP, axe-core 4.10): every control on instrument / components / light / ir changes data and the render by mouse, synthetic touch and keyboard (arrows, Home / End, PageUp, Space / Enter, roving Tab stops); focus ring only for keyboard focus. Fixed: a pointer pick in a radiogroup left focus on the old option (focus now follows the selection); WORKSPACE preview ignored `springKeys` (sliders dissolved, now glide); cards were `<article role=group|img>` (not allowed, now `<div>`); Transition Lab modes got `aria-pressed`, the snippet `<pre>` is focusable, the playground `<aside>` inside `<main>` is a region. axe: overlay clean; left: `--mute` text (#6e7278 on #070809) is 4.14:1, under AA 4.5 (a token call). Keypad keys and toast × only animate (no PIN entry / dismiss), by design.
- [x] P2-G: latency gate instrumented. Done 2026-10-22: dev-only probe (`src/hooks/latencyProbe.ts`) times pointer/keyboard `event.timeStamp` → end of the first canvas draw showing it; in the dev console `__dotLatency()` gives `{ n, p50, p95, max }` ms over the last 512 events (`__dotLatency(true)` clears; paint/compositing not included). Input now commits inside its rAF (`flushSync`) and the live card draws before that frame paints; live cards skip the redundant static sample. Measured (dev build, headless Chrome 60 Hz, Instrument board, 110 clicks/drag/keys): p50 16.8 ms, p95 40.4 ms (was p50 ~35 / p95 ~65). Not done: multitouch on a real device, production-build numbers.
- [x] P2-H: a released touch lingers in `pointers[]` for 520 ms (`up: true`, not down/inside, never hover/pressed) and keeps the clock live, so `ui-keypad`'s ripple finishes; `ptr()` ignores lingering pointers.
- [x] P2-I: `size` only re-grids the canvas (layers and boxes share cell space), so controls stay on unscaled; boxes fully outside the smaller grid are dropped.
- [x] P2-J: board-level shared data. Done 2026-10-22: `BoardDef.shared` keys live in one `Board` store (seeded from card defaults), merged into every card's data; `DotWidget` writes control edits to shared keys back to it. Instrument shares `bpm`, `mode`, `s0..s15`: step edits, tempo and stop (silent meter, parked playhead) drive `inst-level` and the sequencer live; goldens unchanged.

**P3 (depth, light, material, IR): started 2026-10-22**
- [x] P3-E: Field IR v0 (`src/engine/ir/`): parser with limits and line:col errors, closure-tree JS backend (+ optional `new Function`), GLSL ES 3.0 emitter, JSON serialize/validate, GLSL-semantics reference interpreter. `scripts/ir.ts` (in `pnpm verify`): JS ≡ reference on 20 fields over 48×48, GLSL hash snapshot in `goldens/ir-glsl.json`. Demo board `ir` (`ir-ripple`, `ir-plasma`, `ir-dial`). Not done: real GPU parity (P5), bytecode/device backend.
- [x] P3-B: **Cinema** flagship board (`src/widgets/boards/cinema.ts`, `?board=cinema`): nine `cinema-*` film posters of the Afterlight cycle (noir, sci-fi, western, horror, romance, documentary, thriller, drama, musical), procedural scenes baked onto one 2.5-cell luma lattice, title on the same lattice knocked out of the scene, one red "last light" per poster; quantized 12 fps projector flicker + `decodeText` title per 16 s reel; EXIT 14 centre dashes move. Goldens +9.
- [x] P3-A: engine Raster + light stack. `src/engine/raster/` (`Raster`, `rasterize`, `sample` nearest/bilinear, mass-preserving `blur`, `dilate`/`erode`/`outline`/`moat`/`cut`, exact signed `distanceRaster`) and `src/engine/light/` (`sdfCircle`/`sdfBox`/`sdfRing` + union/subtract, `heightRaster` + `normalRaster` cached per geometry, `stackHeights`, `lambert`, `phong`, one-pass `illuminate`, `torch`/`lightDir`, `bloom`). Verify §16 (round-trip, mass, flat normals, lambert/phong peaks, bloom moat, torch relight ≤ 1 ms: about 0.5 ms median on a loaded laptop, about 1.5 ms incl. reading every cell back). Demo board `light` (`?board=light`): `light-torch` (pointer = torch, orbit fallback, XY control parks it), `light-orb` (gloss sphere, slow sun, blurred contact shadow), `light-on-air` (red sign + activeDim bloom). Goldens +3. Not yet checked in the browser.
- [x] P3-G: materials as dot vocabularies (`src/engine/light/material.ts`): `matte` (Lambert in tone bands), `gloss` (lacquer body ≤ 1 − 2 steps, highlight +1/+2 whole size steps in `value`), `glass` (scene behind offset by the normal in whole cells, fresnel rim, highlight), `emissive` (shape + cached `bloom` halo behind a one-dot moat, `active`/`activeDim` by default), `metal` (hard chrome-ball studio stripes off the normal + the light's reflection), `fabric` (Lambert ordered-dithered between size steps on Bayer 4×4). Board-wide light: `sunAt(hour)` / `hourOf(date)`, the wall-clock sun shared by `light-orb` (reworked from its own slow sun) and the materials; the pointer is a torch over a materials card. Six new `light-*` cards (matte, gloss, glass, emissive, metal, fabric) on one ball; emissive stays white so ON AIR keeps the board's only red. Verify P3-G (7 checks). Goldens +6, `light-orb` re-baselined.
- [x] P3-C: **Levels** flagship board (`src/widgets/boards/levels.ts`, `?board=levels`): nine animated HIVE game-world cards (title, torchlit corridor, isometric vault, parallax side-scroller, lantern maze, warp, boss, game over, high scores); local ray-plane `cast` + iso box tracer, Lambert point/window light, depth fog, cell-snapped parallax, one red element per card. v0: needs the user's taste pass.
- [x] P3-D: lift pass on `silhouette` (structure-aware halftone, blue-noise-ish sky, hand-masked figure), `thermal-puppy` (heat `toneRamp`, red hot core, `38.6°` spot readout), `vision-camera` (silhouette pass per object, lamp-pool tone ramp, snapped detection boxes), `ev-charge` (Lambert-lit car from the cable side); `toneRamp(field, stops)` in `src/widgets/types.ts`, also used by `thermal-monitor` (output unchanged). Mount cost: henry3 +8 ms, audio +2 ms, mosaic +3 ms, because each tone is a separate layer pass in the sampler; an engine multi-tone layer would remove it.
- [x] P3-F: multi-tone layer: optional `Layer.toneOf(value, u, v)` read by the sampler in the same pass (card grid, lattices, sites; single-tone path unchanged). `toneRamp` now returns one such layer instead of tones × 12-row strips. Goldens unchanged (122). Verify §14b: every multi-tone preset ≡ its split-layer form (card grid + 72² thumbnail), plus lattice/sites cases. Bench median of 5 interleaved runs, before → after: henry3 16.3 → 14.2 ms, mosaic 32.6 → 34.2 (noise; min 31.6 → 31.4), audio 22.8 → 23.6; silhouette 9.1 → 7.1, thermal-puppy 6.4 → 5.8, vision-camera 6.1 → 6.1, ev-charge 5.4 → 4.7 ms. Mount time left is mostly dot emission and the other layers, so P0-A is still borderline.

**P4 (living: transitions, simulation, agents, live data): started 2026-10-23**
- [x] P4-B: Agent Heartbeat v1 (`src/widgets/boards/heartbeat.ts`, `?board=heartbeat`): tokenized presence vocabulary `HEARTBEAT` / `heartbeatState(name)` / `blendStates` (DESIGN.md "Agent presence"); one lobed, breathing, wandering metaball organism (mid body, up-left highlight) per state: `hb-thinking` calm lobes, `hb-tool-running` condensed with a site ring + comet it watches, `hb-awaiting-approval` lub-dub pulse in `active` (text neutral), `hb-error` whole-cell row-offset stutter + dropout bursts, `hb-done` condenses into a dot check mark. Eyebrow names the state, a 1× status line says what the agent does. `hb-agent`: stadium segmented control (THK RUN ASK ERR OK, hover/press/focus), `springKeys: ['state']` so parameters and knob glide between states (~0.4 s); red-free, so the board spends red once. Not done: real agent event feed, `describe(ctx)`.
- [x] P4-A: SimFields (`src/engine/sim/`): `createSim` fixed-dt stepper, `simAt(sim, t)` deterministic in any call order; review pass: `lead`/`period` loop folds any t (3600 s, wall clock) so cold cost ≤ one loop, checkpoint LRU (`maxCheckpoints`, step 0 + loop start pinned), `maxSteps` per call with `lag` catch-up, allocation-free stepping and a 3-view ring for fields. Gray–Scott `edge`/`killAt`, sand grain kinds + `emitters`/`init` (mass conserved), Life `edge: 'dead'`/`soup`/`stamps`/`afterglow`. Board `sim`: `sim-rd` coral labyrinth growing from 50 seeds with relief tones and a size falloff at the border, `sim-sand` an hourglass in two strata tones whose falling stream is the board's only red, `sim-life` a Gosper gun firing into soup next to two pulsars with a fading trail. Verify: 12 sim checks incl. cold mount at t = 1/60/3600; `pnpm bench` prints the cold-start table. Goldens: only sim-* changed.
- [x] P4-C: **Glyph** lock experience v1 (`src/widgets/boards/glyph.ts`, `?board=glyph`, 2 columns): `glyph-hourglass` (HH:MM in the home-clock grain face; on the minute changed digits drain off the card, new grains pour in lattice-stepped and settle bottom-up by ~6 s, then one grain a second falls from the colon into a 60-grain cone heap; `ctx.since` overrides the wall clock for films, `data.tilt` leans the stream), `glyph-longpress` (dotted padlock on a ring, `button` control; ring sweeps clockwise from `t - tDown`, at 1.6 s the shackle lifts open: UNLOCKED; hover/press/focus per the components grammar; checked holding in headless Chrome), `glyph-notify` (metaball bud detaches and becomes the red count badge with a white 3×5 numeral on the same lattice; the board's only red), `glyph-idle` (Gray–Scott labyrinth from `src/engine/sim` on a round 46-site matrix, looped bounded sim time, 4 tone/size bands, 1-site edge ramp; ~150 s regrow loop). Board mount 5.9 ms, frame 5.5 ms. Needs the user's taste pass.
- [~] P4-G: **Agent Heartbeat as an MCP App** + `describe()` (`mcp/`, `docs/MCP-APP.md`, `src/engine/describe.ts`). The spec was checked 2026-10-23: MCP Apps 2026-01-26 is stable, `ui://` + `text/html;profile=mcp-app`, `_meta.ui.resourceUri`, postMessage JSON-RPC. The SDK is now split v2 `@modelcontextprotocol/server` 2.3.1 + `ext-apps` 2.0.3, both installed in `mcp/` only. `describe(preset, ctx)` / `describeBoard` are pure, read control values and drawn strings (`Field.text`, tagged by `textAt`), and verify covers all 141 presets: no throws, deterministic, hb-agent and live states. `heartbeatCard(label)` = `hb-live` (sprung `data.state`, not on a board, goldens unchanged). Server: `set_agent_state` → `ui://dot-card/heartbeat`, and `describe_board`. The card is one 53 KB HTML file (esbuild) with a hash-only CSP, no eval and no network. Verified offline: `mcp && pnpm test` checks the stdio JSON-RPC (tools/list meta, resources/read, all 5 states, a bad state rejected, describe_board). Headless Chrome with the official `AppBridge` host in a sandboxed iframe checks the handshake, size-changed, a canvas that draws and animates, a state switch per host postMessage, red only while awaiting approval, and that eval and fetch are blocked; screenshots are in `.snapshots/mcp/`. **Not verified:** inside a real host (Claude / ChatGPT / VS Code Copilot), host-specific extras (Claude domain signing, ChatGPT Apps review), and HTTP transport (only stdio is built).

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
- **Browser checks (2026-10-23, P2-F):** data springs (WORKSPACE sliders on timer, music, fitness) glide in the browser after the preview started passing `springKeys`. Transition Lab REPLAY / ENTER / EXIT / CHANGE, mask, duration and easing all redraw. The React warning "Cannot update a component (`Board`) while rendering `DotCanvas`" did not reproduce (instrument board, shared keys, every control); no console errors or warnings on the four boards. In an agent worktree, the WORKSPACE font 403s because `node_modules` is a junction outside Vite's `fs.allow`; that only happens in worktrees.
- Agent worktrees live under `.claude/worktrees/` (gitignored, and ignored by the Vite watcher).
- Root `index.css` sets centred text. New views must set `text-align: left` (the LOG view does).
- `pnpm snap` renders CJK as empty; icons render fine headlessly.
  - Agents keep claiming icons are empty. They are not: verify asserts every icon rasterizes.
- Weakest cards: `henry-bear`, `silhouette`, `thermal-puppy`, `sunburst`, `vision-camera`, `ev-charge` (MASTER-PLAN §5).
- Ports 5173/5174 may be held by old dev servers; use `pnpm dev --port 5180 --strictPort`.
- Node/tsx start slowly on this machine (about 3 s), and `tsc -b` can take minutes while other jobs run. Use generous timeouts.
- Overlapping dots of the same colour and opacity now render as a **union** (one path) in both SVG and canvas, instead of stacking alpha. This was intended (overlapping lattice dots read as one shape), but check it if a card relied on alpha build-up.
- SVG export uses `<use href>` (SVG 2). Very old design tools may need `xlink:href`.
