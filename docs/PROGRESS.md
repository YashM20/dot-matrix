# PROGRESS — handoff checklist

> Single source of truth for **what is done, what is in progress, what was skipped and what is next**.
> Update this file in the same commit as the work. Plan: `docs/MASTER-PLAN.md` (v2). Research: `docs/MOTION-INTERACTION-DEPTH.md`, `docs/ADVANCED-PLAN.md`.
> Legend: `[x]` done and verified · `[~]` partly done (see note) · `[ ]` not started · `[-]` skipped or deferred on purpose (reason given)

## How to resume (read first)
1. `pnpm i`, then `pnpm dev`. The app has tabs BOARDS, GALLERY, WORKSPACE, LOG and DRAW. `?board=<id>`, `?card=<id>` and `?tab=log` are deep links.
2. Checks: `pnpm check` (tsc + oxlint + verify) and `pnpm build`. Snapshots: `pnpm snap` (PNG files in `.snapshots/`, which is gitignored).
3. Read `AGENTS.md` (invariants) → `MASTER-PLAN.md` §2–§4 → this file's **Next up**.
4. Decisions still open (MASTER-PLAN §11). Until the user answers, work with the **recommended defaults**:

| Decision | Default |
|---|---|
| Accent | One accent hue, plus `accentRole` |
| Scene and photo heroes | May skip quantization |
| Hover, focus and press states | Allowed, never in the accent colour |
| Frame-rate tiers | 12/30/60, driven by a 60 Hz master clock |
| Type ladder | {.72, 1, 1.3, 1.6, 2, 2.5, 3, 4} |
| Field IR | Core deliverable |
| Product scope | Undecided |
| Packages and Tailwind | Undecided |

## Session log
### 2026-10-14
**Research and planning**
- [x] Audit + benchmark → `docs/ADVANCED-PLAN.md`.
- [x] Motion, interaction and depth research → `docs/MOTION-INTERACTION-DEPTH.md`.
- [x] Live prototype → `public/lab/motion-lab.html` (served at `/lab/motion-lab.html`).
- [x] Master plan v1, reviewed by 3 adversarial critics, refined into **v2** → `docs/MASTER-PLAN.md` (critique log in its appendix).

**Changelog**
- [x] Root `CHANGELOG.md` (engineering history from the first commit).
- [x] **Public changelog in the app:** LOG tab (`src/changelog.ts` data, `src/components/Changelog.tsx`, `.log-*` styles in `App.css`).
  - DRAW stays the last tab because the narrow layout hides the last one.

**Housekeeping**
- [x] Memory note: the liked cards (level-03, afterlight, mosaic, components) are the quality bar.
- [x] Commits: `f748396` (docs), then the changelog/handoff commit. Pushed to `origin/feat/tile-boards`.

## Phase 0 — Foundations, determinism, fidelity harness
Plan reference: MASTER-PLAN §4 P0. Exit gates are listed at the bottom.
### Hardening
- [ ] H1: `cells()` in mosaic returns 0 outside its box. Verify asserts each preset renders identically with and without bounds.
- [ ] H3: move tests out of `src/engine`, curate the `index.ts` barrel, `superformulaPath` must not throw.
- [ ] H4: Draw W/H applies on blur/Enter; resize is undoable; history is cleared on resize.
- [ ] M7: sampler guards (lattice 0/NaN/negative, NaN sites, `catmullRomField([])`).
- [ ] Non-mutating `bounded()`.
- [ ] Cover decided on the **quantized** value (fixes holes).
- [ ] `size` split from `lattice` for site layers.
- [ ] Per-card error isolation (try/catch; keep the last good frame).
### Determinism
- [ ] `hash32` (Math.imul-based) replaces `fract(sin)` in the board files; re-baseline goldens.
- [ ] Lint-ban `Math.random`, `Date.now` and sin-hashing in `src/engine`.
- [ ] `FrameContext` in the engine (`WidgetContext` becomes an alias).
- [ ] Master board clock (`engine/clock.ts`): 60 Hz rAF, per-card fps tier, deterministic `t`, resume without reset.
### Performance
- [ ] Jitter fast path when the amount is 0.
- [ ] SVG compaction (2-dp rounding, drop default attributes, group fills).
- [ ] `thermal-monitor` heat computed once per cell; `apps` gets bounds.
- [ ] Static sample cache; scoped minute tick (only clock cards).
### Fidelity tooling
- [ ] `snap --film`, `--replay`, `--bar`, `--ref` (HVS-SSIM later in Track L), `--diff` + golden hashes.
- [ ] `fidelity <id>` scorecard (gates G1–G3, G5, G6 + metrics).
- [ ] `scripts/bench.ts` with budgets (promote `.snapshots/bench`).
- [ ] `docs/STYLE-BIBLE.md` extracted from the liked cards.
- [ ] Lattice ladder migration (35 values become 8; exceptions logged).
- [ ] `accentRole` on every `active` layer.
- [ ] Font registry (M1); a prerequisite for text motion.
### Calibration and CI
- [ ] Score all 71 cards; rank validity; κ ≥ 0.6 on 20 cards; output the "weakest 15" list.
- [ ] GitHub Action: tsc, lint, verify, goldens, bench budgets.
### P0 exit gates
- [ ] CI green.
- [ ] Mosaic mount < 30 ms.
- [ ] Board SVG < 0.5 MB.
- [ ] Rank validity.
- [ ] κ ≥ 0.6.
- [ ] Goldens identical in Chromium and WebKit.

## Phase 1 — Time: motion, states, choreography
Plan reference: MASTER-PLAN §4 P1. **Flagship: Departures.**
- [ ] SoA `DotBuffer` + buffer pools.
- [ ] `layers()` / `live()` split + liveness lint.
- [ ] Buffer-level card enter/exit (masks: bayer, blue noise, ign, radial, linear, curtain, ditherEdge).
- [ ] Keyed layer transitions, `coarsen`.
- [ ] Data springs (closed-form critical damper).
- [ ] States API.
- [ ] Easing tokens.
- [ ] `layoutText` + `decode` / `splitFlap` / `typewriter`.
- [ ] Afterglow decay raster.
- [ ] Reduced-motion policy for every primitive.
- [ ] Board choreography: diagonal stagger + Bayer reveal; progressive sampling.
- [ ] Tab switch plays an exit then an enter.
- [ ] Transition Lab in the playground.
- [ ] Card upgrades: home-clock split-flap; data springs on timer, music, fitness; message typewriter; meter peak-hold; weather morph.
- [ ] Lift pass: home-clock, weather, messages, settings, agent-status, word-play, codex-tokens.
- [ ] **Departures** board through the v0–v5 protocol (needs the user's pick at v1 and a like at v5).
- [ ] P1 exit gates: 0 hard cuts; 71/71 cards enter; board p95 ≤ 8 ms including enter; no GC pause > 4 ms; Departures visual ≥ 20, life ≥ 10, and a user like.

## Next up
1. P0 hardening and determinism (H1, M7, the cover fix, non-mutating `bounded`, `hash32`, `FrameContext`, the master clock).
2. P0 perf quick wins (jitter fast path, SVG compaction).
3. P0 fidelity tooling (`snap --film/--bar`, the `fidelity` scorecard), style bible, ladder migration.
4. P1 motion core (masks, board enter, data springs, decode), then Departures.

## Known issues / notes for the next agent
- Root `index.css` sets centred text. New views must set `text-align: left` (the LOG view does).
- `pnpm snap` renders CJK as empty; icons render fine headlessly.
- `henry-bear`, `silhouette`, `thermal-puppy`, `sunburst`, `vision-camera` and `ev-charge` are the known weakest cards (MASTER-PLAN §5).
- Dev servers from earlier sessions may still hold ports 5173/5174. Use `--port 5180 --strictPort` if needed.
