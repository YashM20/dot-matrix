# NEXT PLAN — After P6: v1.0 and beyond

> **Direction update (2026-10-23):** this is a personal project deployed as a website only — no release, publishing or monetization. The product phases in §3 (launch, hosted service, plugins, partnerships) are superseded by `docs/WEB-PLAN.md`. §1 (gap audit), §2 (consolidation), §4 (Track R) and §6 (agent lessons) still apply.

> **v1** · 2026-10-23 · written against `feat/p1-complete` @ `d6ea7e1` (P0–P4 merged, P5 running as parallel agents, P6 not started).
> **Assumption:** P5 (GPU, devices, exports, targets) and P6 (card spec, packages, Dwitter page, MCP authoring tools) land roughly as `MASTER-PLAN.md` §4 describes. Wherever that assumption carries risk, the risk is flagged **⚠ P5/P6 risk**.
> **Inputs:**
> - `AGENTS.md`, `DESIGN.md`, `docs/MASTER-PLAN.md` (v2), `docs/PROGRESS.md` (status board of 2026-10-22), `docs/DOT-MATRIX-ENGINE-PLAN.md`, `docs/MCP-APP.md`, `docs/STYLE-BIBLE.md`;
> - the code: `src/widgets/index.ts` (19 boards, 146 presets), `src/engine/index.ts` (30 `export *` lines), `scripts/`, `goldens/`, `.github/workflows/ci.yml`;
> - git state: 40 worktrees, 48 local branches, 23 merges on `feat/p1-complete` since `main`.
>
> **This file plans; it does not restate.** Architecture lives in MASTER-PLAN §3, taste in STYLE-BIBLE, tokens in DESIGN.md. When this file is wrong about the code, fix this file.

---

## 0. Recommendations (read this if nothing else)
1. **Don't start P7 yet. Ship v1.0 first.** About half of the P0–P4 exit gates are unmet or unverified (§1.1). Most of them are blocked on **one 2-hour user taste session** and **about $400 of hardware**, not on engineering.
2. **Book the taste session in week 1.** It unblocks P0-D/E/F, every flagship "like" (Departures, Instrument, Cinema, Levels, Glyph, Heartbeat, Five Surfaces), the κ gate and the whole P6 AI-quality gate. Without it, P6's "κ(agent, human) ≥ 0.7" gate can't even be measured.
3. **Answer the 8 open §11 decisions plus 5 new ones in a single sitting** (§1.2). Each has a recommended default. Any decision left open past week 2 blocks the v1.0 freeze.
4. **Run Consolidation (Phase C) before Hardening (Phase H).** Do the cheap hygiene (worktrees, CRLF, verify split, docs archive) first so that parallel agents stop colliding, then do the perf and a11y work on a clean base.
5. **The biggest engineering gap is the deferred P1 engine core:** SoA `DotBuffer` + pools, `layers()`/`live()` split, liveness lint and the States API. It is the reason for the borderline mosaic mount (31–34 ms against a 30 ms gate), the unmeasured GC gate and the 40 ms latency p95. Build it in H1.
6. **Lazy-load the boards.** `src/widgets/index.ts` eagerly imports all 19 boards and 146 presets. That breaks the "boards lazy-loaded" half of the §6 shell budget (≤ 150 kB gzip), which nobody has measured.
7. **Curate the engine barrel before anyone runs `npm publish`.** 30 `export *` lines leak internals (H3, still open). **⚠ P6 risk:** `@dot480/core` freezes whatever the barrel exports today as public API.
8. **After v1.0, distribution beats features.** The order is: docs site + the "Ditherpunk for UI" essay + the hosted card service (P7), then Studio and AI quality (P8–P9), then reach (P10–P12). Theming beyond one accent and native ports come last, and theming needs an explicit user yes (AGENTS.md).
9. **Next Track R spikes:** NCA "heals" (this finishes signature moment 2), sonified UI on Instrument, e-paper waveform LUTs (TRMNL) and haptics in the native shell only. Each has a graduation metric (§4).
10. **Next time you run parallel agents, shard the shared files.** Goldens per board, verify per module, progress as fragments and a generated board registry. Pin each worktree's base. Regenerate goldens once, after the merge train (§6).

---

## 1. Honest gap audit

### 1.1 Exit gates, P0–P6
Status key:
- ✅ met and evidenced;
- 🟡 borderline, or met only under a narrower definition;
- ❌ unmet or never measured;
- ⏳ phase still in flight.

**Unblocker** says who or what closes the gate:
- **A:** an agent can do it;
- **U:** needs the user's taste or decision;
- **H:** needs real hardware or a real host.

| Phase | Gate | Status | Evidence / gap | Unblocker |
|---|---|---|---|---|
| P0 | CI green | ✅ | run 38613505006 | — |
| P0 | Mosaic mount < 30 ms | 🟡 | Bench median 30–34 ms, with one run at 47.6. P3-D's lift added about 3 ms. The remaining cost is `DotInstance` allocation | A (SoA `DotBuffer`, H1) |
| P0 | Board SVG < 0.5 MB | ✅ | bench: every board under 512 KB | — |
| P0 | Rank validity | ❌ | P0-F never ran. `fidelity` covers only G1–G3 and G5 | U |
| P0 | κ ≥ 0.6 on 20 cards | ❌ | Needs human scores | U |
| P0 | Every card carries a scorecard | ❌ | The gate was written for 71 cards; there are now 146 | U + A |
| P0 | Cross-engine goldens (Chromium = WebKit) | ❌ | `pnpm golden` runs in Node only (it matches across Linux and Windows) | A |
| P1 | 0 hard cuts in navigation | 🟡 | Leaving LOG, DRAW or WORKSPACE is instant on purpose (`useExitSwap`). Decide whether that counts | U (D-12) |
| P1 | Every card enters | 🟡 | Verified for the 71 original cards. The 75 cards added since P1 (departures, instrument, sim, glyph, mirror, live and more) were never checked on entrance | A |
| P1 | Board p95 ≤ 8 ms incl. enter, 30 fps, mid-tier | ❌ | No mid-tier profile is defined. Bench measures warm medians, not p95 with entrance | A |
| P1 | 0 GC pauses > 4 ms in a 10 s loop | ❌ | Never measured. SoA was deferred, so this probably fails on mosaic and audio | A |
| P1 | Departures visual ≥ 20, life ≥ 10, like | ❌ | Built at v0 only; no v1 pick | U |
| P2 | Mouse, touch and keyboard on every component | 🟡 | Mouse and keyboard pass. Touch was synthetic CDP touch only; multitouch was never run on a device | H |
| P2 | axe clean | 🟡 | The overlay passes. `--mute` (#6E7278 on #070809) is 4.14:1, under 4.5:1. axe is not in CI | U (D-9) + A |
| P2 | Input → next draw ≤ 1 frame, p95 | ❌ | p95 is 40.4 ms (dev build, headless, 60 Hz) against a 16.7 ms gate. No production-build number exists | A |
| P2 | Instrument visual ≥ 20, life ≥ 10, like | ❌ | — | U |
| P3 | Cinema and Levels average visual ≥ 20, plus a like each | ❌ | Both are v0 | U |
| P3 | Static scenes cached (< 1 ms re-sample) | ❌ | Never measured. The static cache keys on `JSON.stringify(data)`, and animated `lv-*` and `cinema-*` cards bypass it | A |
| P3 | Torch light ≤ 1 ms per frame | 🟡 | 0.5 ms median, but about 1.5 ms once every cell is read back | A |
| P3 | IR JS/GLSL parity on 20 fields | 🟡 | JS ≡ the reference interpreter. Real GPU readback is **⏳ P5** | ⏳ |
| P4 | 60 s Glyph recording, no drops at 30 fps | ❌ | Never recorded | A + H |
| P4 | Migration ≤ 4 ms per frame for 3k dots | ✅ | 0.4 ms per frame, setup 2.6 ms | — |
| P4 | Glyph and Heartbeat visual ≥ 20, life ≥ 10, like | ❌ | — | U |
| P4 | Heartbeat renders inside a real host | ❌ | Tested only with the official `AppBridge` in headless Chrome. No Claude, ChatGPT or VS Code run, and no HTTP transport | H |
| P5 | 500k IR dots / 100k CPU dots @ 60 fps | ⏳ | **⚠ P5 risk:** 100k CPU dots needs the worker path and SoA, and SoA isn't built | A |
| P5 | Simulator vs photo of the real device, HVS-SSIM ≥ 0.85 on 2 targets | ⏳ | **⚠ P5 risk:** HVS-SSIM does not exist yet (Track L item 2 is at 0), and nothing for camera calibration has been bought | A + H |
| P5 | 3 real targets demonstrated | ⏳ | **⚠ P5 risk:** no hardware in the repo or the docs | H |
| P6 | `npm i @dot480/core` works | ⏳ | **⚠ P6 risk:** barrel not curated, no `.d.ts` build, the `@dot480` npm scope not reserved, Tailwind still a dependency | A + U |
| P6 | ≥ 60% of AI cards reach the ship gate within 4 rounds | ⏳ | **⚠ P6 risk:** the critic needs Bradley–Terry exemplars, which need like/kill votes. There are none | U |
| P6 | κ(agent, human) ≥ 0.7 | ⏳ | **⚠ P6 risk:** circular. The P0 κ ≥ 0.6 gate was never measured | U |

**Engine promises that slipped and are not tracked as gates:**

| Promise (MASTER-PLAN) | State in code | Consequence |
|---|---|---|
| SoA `DotBuffer` + pools (§3.10, P1) | Not started; `DotInstance[]` everywhere | Mount, GC and latency gates |
| `layers()`/`live()` split + liveness lint (§3.3) | Not started. Liveness is flag soup: `animated`, `clock`, `burst`, `springKeys`, `controls`, `media` | Wasted re-sampling, and a wrongly-static layer can freeze silently |
| States API (§3.6, P1) | Replaced by the P2 `Control` contract plus `springKeys` | Card spec v1 (P6) has no states model to serialize. **⚠ P6 risk** |
| Keyed layer transitions, `coarsen` (§3.5) | Not built | No lattice morphs; change dissolves only |
| Font registry → `layoutText` → typewriter on local faces (M1) | Not built; `textDots` workaround | CJK and i18n (P11) are blocked |
| `scene3d`, `lumaSites` as engine APIs (§3.8) | Not in `src/engine`. `levels.ts:72` has a local `cast()` ray-plane; afterlight still uses its own site pattern | Five or more scene engines live in board files |
| Afterglow decay raster (§3.5) | Only the Life `afterglow` channel inside `sim/` | Departures and the Instrument meters fake their trails |
| SimFields Lenia, boids, metaball blob (P4) | RD, sand and Life only | R1 hasn't started |
| `snap --replay`, `--ref` (HVS-SSIM), `--diff`, G6 flash check (§2.6) | Not built | The G6 safety gate is never enforced. Flash-heavy cards (`hb-error` dropout bursts, cinema flicker) are unchecked |
| G2 `accentRole`, G3 lattice ladder | Blocked on decisions §11.1 and §11.5 | Two of the six gates are inert |
| ≤ 8 MB memory per board, ≤ 150 kB gzip shell (§6) | Never measured; boards are not lazy-loaded | Unknown |
| Hourglass tilt (signature moment 1) | `glyph-hourglass` reads `data.tilt`, but nothing in `src/hooks` or `src/components` wires DeviceOrientation (or the iOS permission prompt) to it | The moment can't be demoed on a phone |
| Mirror "heals" (signature moment 2) | `mirror-camera` exists; the scratch-and-regrow interaction does not | Moment 2 is incomplete |
| Torch in the Dark (signature moment 5) | `light-torch` and the torchlit `lv-corridor` exist, but level-03 itself is not torch-lit | Moment 5 is a stand-in |

### 1.2 Open decisions (recommendation first)
D-1 to D-8 are MASTER-PLAN §11. D-9 onward are new, raised by this audit and by PROGRESS.md.

| # | Decision | Recommend | Blocks | Decide by |
|---|---|---|---|---|
| D-1 | Accent semantics (§11.1, P0-E) | One accent hue per board, and each red layer carries `accentRole` (live, hot or primary) | G2; rewording AGENTS.md and DESIGN.md:284 ("exactly one accent per card"); STYLE-BIBLE rule 3 | wk 1 |
| D-2 | Quantization exemption (§11.2) | Scene and photo heroes may use `quantizeSteps: 0` (level-03, afterlight, cinema, levels); UI stays quantized | Rewording DESIGN.md:286 and AGENTS.md ("only photos skip quantization") | wk 1 |
| D-3 | Hover, focus and press states (§11.3) | Already built that way. Ratify it | DESIGN.md "Don't" list cleanup | wk 1 |
| D-4 | fps tiers 12/30/60 (§11.4) | Ratify | The mid-tier perf profile (H1) | wk 1 |
| D-5 | Type ladder {.72, 1, 1.3, 1.6, 2, 2.5, 3, 4} (§11.5, P0-D) | Ratify. Migrate the **non-liked** boards first and give level-03, afterlight, mosaic and components logged exceptions until a bar-sheet review signs them off | G3 | wk 2 |
| D-6 | Field IR as core (§11.6) | Already built. Ratify | — | wk 1 |
| D-7 | Product scope (§11.7) | The full track, but **v1.0 = kit + IR + MCP + 2 device targets**. Everything else is labelled "preview" | v1.0 scope (§1.3) | wk 1 |
| D-8 | Package names `@dot480/*`; drop Tailwind (§11.8) | Yes to both. Reserve the npm scope **today**. Tailwind is one `@import` in `src/index.css` | P6 publish | wk 1 |
| D-9 | `--mute` contrast, 4.14:1 | Raise `{colors.mute}` to about #7A7E85 (4.9:1 on `{colors.bg}`). Update DESIGN.md in the same commit | axe gate | wk 1 |
| D-10 | Mosaic red index numbers (`num()`, `mosaic.ts:68`) under G2 | Call them `primary` (chrome on the favourite board), not exempt | G2 on the liked board | wk 1 |
| D-11 | Hero "like" protocol for 9+ flagships | One bar-sheet session per flagship with three outcomes: like, kill or one named fix. The agent iterates on fixes asynchronously | Every flagship gate | wk 1 |
| D-12 | Do instant exits from LOG, DRAW and WORKSPACE count as "hard cuts"? | No. They are tool views, not boards. Write that into the P1 gate | P1 gate | wk 1 |
| D-13 | Hardware budget | About $400: a Nothing Phone with a Glyph Matrix (or the emulator only), TRMNL, a 64×32 HUB75 panel + ESP32 (WLED), and an Ulanzi TC001 (AWTRIX) | P5 gates, the H6 workstream | wk 1 |

### 1.3 Phase H: Hardening → v1.0 (about 4 weeks, after C1)
**Goal:** every P0–P4 gate is green or explicitly waived in writing, and P5/P6 are scoped to what v1.0 promises.

**v1.0 scope (recommended, per D-7):**

| In v1.0 (stable) | Preview (ships, labelled, no stability promise) | Out |
|---|---|---|
| `@dot480/core` (curated), `@dot480/react`, `<dot-card>`; card spec v1; Field IR (JS + GLSL); all 19 boards; Components v2; the MCP Heartbeat (stdio + HTTP); OG/SVG export; two device targets (TRMNL, WLED) | Dot Studio; AI authoring loop; Glyph Toy, AWTRIX and Tronbyt targets; IR bytecode on ESP32; the Dwitter page; the Figma plugin | Native ports; theming beyond one accent; WebGPU |

**Workstreams:**

| # | Workstream | Work | Exit criterion |
|---|---|---|---|
| H1 | **Engine core debt** | SoA `DotBuffer` (x, y, r, opacity, tone, n) + raster/buffer pools per board, with a `DotInstance[]` adapter for exports. `layers()`/`live()` split for the 44 animated presets. Liveness lint in verify | Mosaic mount ≤ 25 ms (headroom); 0 GC pauses > 4 ms over a 10 s loop on mosaic, audio and levels; goldens unchanged (the work is hash-neutral) |
| H2 | **Latency** | Production-build probe (`latencyProbe.ts` behind a `?probe` flag); input → draw inside the same rAF for every live path; drop `flushSync` where the store already batches | Input p95 ≤ 16.7 ms (prod, Instrument, 60 Hz); a mid-tier profile (4× CPU throttle) reported |
| H3 | **Perf gates in CI** | `bench --strict` on a relative baseline (fail on > 15% regression against `main`'s artifact, not on absolute ms); a board p95 that includes entrance; heap per board; shell size with `boards/*` code-split by `import()` | Board p95 ≤ 8 ms at 30 fps; ≤ 8 MB per board; shell ≤ 150 kB gzip; no strict-mode false positives in 10 CI runs |
| H4 | **Safety and a11y** | G6 flash analysis over `snap --film` frames (WCAG 2.3.1: ≤ 3 flashes/s, red flash); axe in CI on 4 boards via Playwright; the `--mute` fix (D-9); real-device touch and multitouch on iOS Safari and Android Chrome | G6 passes on all 146 cards, or the card gets a reduced-flash variant; axe 0 violations in CI; Instrument XY + 4 knobs work with two fingers on a phone |
| H5 | **Fidelity calibration** | The taste session (D-11), then P0-F: score 20 cards for κ and rank all 146 by visual score. Build `snap --ref` with HVS-SSIM (CSF at 2 viewing distances) and `snap --diff` | κ ≥ 0.6; liked cards in the top quartile; rejected cards in the bottom half; every flagship has a like or a waiver |
| H6 | **Real hosts and devices** | MCP Heartbeat in Claude Desktop, VS Code Copilot and ChatGPT (adds Streamable HTTP, `@modelcontextprotocol/node` in `mcp/` only); 2 device targets photographed for HVS-SSIM; the 60 s Glyph recording; DeviceOrientation wired for `glyph-hourglass` | Screenshots from 3 hosts in `docs/MCP-APP.md`; simulator vs photo HVS-SSIM ≥ 0.85 on TRMNL and WLED; a 60 s recording at 30 fps with 0 drops |
| H7 | **Determinism** | Goldens in Chromium and WebKit through Playwright (the dot-list hash, rendered in-page) | Hashes match across engines, or every mismatch has a named cause and a fix |
| H8 | **Packaging** | Curated barrel (`src/engine/index.ts` → explicit named exports, internals under `@dot480/core/internal`); `.d.ts` via `tsc --emitDeclarationOnly`; `publint` + `arethetypeswrong` in CI; Tailwind removed | `npm i @dot480/core` in a clean Vite, Next and Node 22 app renders `ui-toggle`; the public API surface is listed in `docs/API.md` (generated) |

**v1.0 exit:** H1–H8 met; CI enforces perf, axe, G6 and goldens; `CHANGELOG.md` and `src/changelog.ts` have a 1.0 entry; the tag is `v1.0.0` on `main`.

---

## 2. Tech debt and architecture

### 2.1 What the parallel build left behind (with evidence)
| Area | Finding | Evidence | Risk |
|---|---|---|---|
| **Test monolith** | `scripts/verify.ts` is 68 KB in 776 lines, 26 of them over 200 characters. Sections were appended per phase (§12–§16, "P3-G", the sim tail), and sub-suites `ir.ts`, `live.ts` and `halftone.ts` are called from it | `scripts/verify.ts` | Every agent edits it, so it is the #1 merge hot spot; there is no per-module run and no test runner |
| **Golden monolith** | `goldens/hashes.json` has 814 entries in one file | `goldens/` | Conflicts on every parallel board change. "Regenerate after merges" commits (`0d1f778`) hide real drift |
| **Board registry** | `src/widgets/index.ts` is hand-edited by every board agent and eagerly imports all 19 boards | `src/widgets/index.ts:1-21` | Merge conflicts, plus the shell budget |
| **Board file size** | `components.ts` 37 KB, `mosaic.ts` 37 KB, `cinema.ts` 33 KB, `levels.ts` 31 KB, `henry.ts` 27 KB | `src/widgets/boards/` | Hard to review; agents re-derive helpers instead of finding them |
| **Duplicated helpers** | Same-named top-level helpers redefined across board files: `FOOT` ×5, `segDist` ×4, `frac` ×4, `deg` ×4, `BODY` ×4, `CAP` ×3, `circle` ×3, `footer` ×3, `ring` in 6 files, `frame` (light, mosaic), `num` (live, mosaic), `photoStyle` ×2, `onLattice` ×2, a local `soft` (ride, henry3) | `grep` over `src/widgets/boards/*.ts` | Drift in tier constants (each board's `CAP`/`BODY` is its own ladder), so G3 is harder to enforce |
| **Local scene engines** | Ray-plane `cast()` in `levels.ts:72`, the level-03 corridor in `audio.ts`, `corridorField` in `projection3D.ts`, the cinema procedural scenes | board files | `scene3d` was never extracted, and the light stack isn't reused |
| **App hot files** | `DotCanvas.tsx` is 23 KB and holds every transient: enter, exit, dissolve, spring, migrate, live, the latency hook. `useControlInput.ts` is 15 KB | `src/components/` | Each new motion feature adds a branch; no unit tests |
| **Barrel** | 30 `export *` lines, plus `export * as ir` | `src/engine/index.ts` | Accidental public API; tree-shaking (the MCP view bundle is 53 KB) |
| **Line endings** | No `.gitattributes`; `core.autocrlf=true`; 175 files are LF in the index and CRLF in the working tree | `git ls-files --eol` | Whole-file churn when a tool rewrites a file; noisy merges between agents with different settings |
| **Worktrees and branches** | 40 worktrees, 48 local branches (`worktree-agent-*`, `backup/tile-boards-pre-rewrite`) | `git worktree list` | Disk, confusion, a risk of basing new work on a stale branch |
| **Docs drift** | `README.md`: "66 cards … seven reference boards" (it's 146 / 19). `docs/HARNESS.md`: `npm run build`, "~103 modules", `verify-acceptance.ts`. `ci.yml` comments name `src/engine/verify-acceptance.ts`. MASTER-PLAN §1 baseline "71 presets on 8 boards". ENGINE-PLAN renderer rule "re-sample at 12 fps" predates the master clock. DESIGN.md:284 says "one accent per card" while :202 says "red is spent once per board". `ADVERSARIAL-REVIEW.md`, `VERIFICATION-16POINT.md` and `BLOCK-INVENTORY.md` are from 2026-08. PROGRESS "Track L: 0" although the halftone ladder and STBN shipped in P4-F. PROGRESS "Next up" is from 2026-10-14. Phase 1 still lists Departures and the tab exit as unticked although the status board marks them done | files cited | Agents follow stale docs. AGENTS.md says the code and the two docs win, but the two docs disagree with each other |
| **Two changelogs** | Root `CHANGELOG.md` and the public `src/changelog.ts` are maintained by hand | — | They drift, and both are merge hot spots |
| **Test coverage** | No test runner. No fast-check properties (§7). No Playwright suite in the repo (P2-F used ad hoc CDP). `mcp/` tests are not in CI. Bench is report-only | `ci.yml` | Regressions in interaction, a11y and MCP are invisible |
| **Perf trend** | One-off bench numbers live in PROGRESS prose; there is no history | — | Slow creep (P3-D +3 ms on mosaic) goes unnoticed |
| **Flag soup** | `WidgetPreset` liveness hangs off `animated`, `clock`, `burst`, `springKeys`, `controls`, `media`, plus the board-level `shared`/`sources` | `src/widgets/types.ts` | Card spec v1 has to serialize all of it. **⚠ P6 risk** |

### 2.2 Phase C: Consolidation (about 1.5 weeks; C1 before H, C2 alongside H)
**C1: hygiene (3–4 days, one agent, sequential).** Do it first, because it makes every later parallel phase cheaper.

| # | Task | Done when |
|---|---|---|
| C1.1 | Merge the P5/P6 branches into `feat/p1-complete`, then open a PR to `main` and merge it | `main` contains P0–P6; one tag `v0.9.0` |
| C1.2 | `git worktree prune`; remove merged worktrees; delete merged `worktree-agent-*` branches (keep `backup/*` as a tag, not a branch) | ≤ 3 worktrees, ≤ 5 branches |
| C1.3 | `.gitattributes` (`* text=auto eol=lf`, binaries `-text`) plus one `git add --renormalize .` commit | `git ls-files --eol` shows `w/lf` everywhere after a fresh checkout |
| C1.4 | Split verify: `scripts/verify/<module>.ts` (sampler, motion, interaction, raster, light, ir, sim, migrate, live, halftone, presets, lints) with a tiny runner. `pnpm verify` runs all; `pnpm verify sim` runs one | No file > 15 KB; same checks, same count, all green |
| C1.5 | Shard goldens: `goldens/<board>.json`, plus `ir-glsl.json` | A board agent touches only its own golden file |
| C1.6 | Generated board registry: `scripts/gen-boards.ts` writes `src/widgets/registry.gen.ts` from `boards/*.ts` exports (each board exports `board: BoardDef`), with lazy `import()` per board for the app | Adding a board edits no shared file |
| C1.7 | Docs: move `ADVERSARIAL-REVIEW`, `VERIFICATION-16POINT`, `BLOCK-INVENTORY`, `HARNESS` and `ADVANCED-PLAN` to `docs/archive/`; fix the README counts and the CI comments; re-verify AGENTS.md against the code (as AGENTS.md itself requires) | No doc names a file that doesn't exist (a verify lint greps docs for backticked paths) |
| C1.8 | Progress fragments: `docs/progress/<phase>-<item>.md`, one per agent task, compiled into the PROGRESS status board by a script | Agents never edit `PROGRESS.md` directly |

**C2: architecture (about 1 week, alongside H1).**

| # | Task | Done when |
|---|---|---|
| C2.1 | `src/widgets/kit/`: `geom.ts` (`segDist`, `frac`, `deg`, `circle`, `ring`, `soft`, `onLattice`), `chrome.ts` (`CAP`/`BODY`/`FOOT` **as ladder tiers**, `footer()`, `num()`, `frame()`), `styles.ts` (`photoStyle`) | The duplicate-helper grep returns 0; goldens unchanged |
| C2.2 | Extract `scene3d` (ray-plane + iso box) into `src/engine/light/` from `levels.ts`; port `lv-corridor` and level-03 to it **hash-neutrally**, or with a bar-sheet sign-off if it changes | Levels and level-03 share one caster; the torch works on level-03 (signature moment 5) |
| C2.3 | Promote `lumaSites` and `toneRamp` into the engine (`toneRamp` lives in `src/widgets/types.ts` today) | The afterlight and cinema faces use them |
| C2.4 | Split `DotCanvas.tsx` into a transient state machine (`src/components/canvas/transients/*.ts`: enter, exit, dissolve, spring, migrate), each a pure `(prev, next, p) → DotBuffer` | `DotCanvas.tsx` < 8 KB; the transients are unit-tested in verify |
| C2.5 | Reconcile **States API ↔ `Control` contract**: `states` + `transitions` become data over `ctx.data`/`ctx.state`; `springKeys` becomes a transition property | One model, serialized by card spec v1. **⚠ P6:** if the spec already shipped, add it as spec v1.1 with a migration |
| C2.6 | Collapse the liveness flags into the `layers()`/`live()` split (H1), keeping `clock` and `media` as declared inputs | `WidgetPreset` has ≤ 3 liveness-related fields |
| C2.7 | One changelog source: `CHANGELOG.md` generated from conventional commits plus a `public:` trailer for user-facing lines; `src/changelog.ts` generated from it | Nobody edits `src/changelog.ts` by hand |
| C2.8 | Testing base: fast-check properties in verify (fields in [0,1], bounds soundness, `pick` correctness, determinism); Playwright smoke (4 boards, axe, 1 replay); `mcp` test job in CI | CI has 4 jobs: check, golden, browser, mcp |

---

## 3. Product phases after v1.0 (P7+)
Ordered by leverage. Sizes assume one developer plus agents. Every phase keeps the §2.7 protocol, a flagship and a lift pass, as MASTER-PLAN §4 requires.

| Phase | Theme | Size | Depends on |
|---|---|---|---|
| P7 | Launch: docs site, essay, hosted card service | 3 wk | v1.0 |
| P8 | Dot Studio maturity | 3 wk | P6 Studio, card spec v1(.1) |
| P9 | AI authoring quality | 3 wk + ongoing | ≥ 300 like/kill votes (collected through P7–P8) |
| P10 | Ecosystem and plugins | 2–3 wk | P7 card service, P8 |
| P11 | Accessibility and i18n (CJK, RTL) | 3 wk | Font registry (M1) |
| P12 | Performance: WebGPU | 2–3 wk | P5 WebGL2, IR |
| P13 | Hardware partnerships | ongoing, about 20% | P5 targets, H6 |
| P14 | Mobile and native | 4 wk | IR bytecode (P5) |
| P15 | Theming beyond one accent | 1.5 wk | **A user decision (AGENTS.md: "stop and ask")** |

### P7 · Launch: docs site, interactive essay, hosted card service (3 wk)
- **Goal:** turn the build into something people can find, read, embed and link. Most of the value of P0–P6 is invisible until this ships.
- **Flagship:** the *"Ditherpunk for UI"* interactive essay (if P6 slipped it), embedding the 5 signature moments live: `glyph-hourglass`, `mirror-camera` (with heals, R1), Five Surfaces, `hb-live`, and level-03 torch-lit (C2.2).
- **Engine work:**
  - `<dot-card>` hydration from a spec hash;
  - SSR-safe static render (SVG string from Node, no DOM);
  - a deterministic `?t=` for OG frames.
- **Card service** (app or edge, not engine):
  - `GET /c/<spec-hash>.svg|.png|.webp` and `/gh/<user>.svg` (from `live-contribs`);
  - resvg for PNG;
  - immutable cache keyed by spec hash;
  - the README badge use case.
- **Docs site:**
  - generated API reference from the curated barrel (H8);
  - every board live;
  - token tables pulled from DESIGN.md (not copied);
  - a `?card=` deep link per card.
- **Exit gates:**
  - OG PNG p95 under 150 ms cold and under 20 ms cached;
  - SVG ≤ 60 KB per typical card;
  - essay LCP < 2.5 s on mid-tier mobile, with every embed lazy;
  - axe-clean docs site;
  - 3 external READMEs using the GitHub card (KPI, not a gate).

### P8 · Dot Studio maturity (3 wk)
- **Goal:** the P6 Studio becomes the place where cards are *finished*, not only drafted. It runs the whole v0–v5 protocol inside the editor.
- **Flagship:**
  - lift `henry-bear` to hero quality entirely in Studio, with no TS edits;
  - then remix `thermal-monitor` into a new card.
- **Engine work:**
  - spec ↔ TS round-trip beyond the generator subset (raster assets for bespoke fields);
  - undo/redo as spec patches (JSON Patch);
  - a luma-table / sprite painter that writes hand-authored hero data (STYLE-BIBLE rule 4);
  - a keyed-transition timeline (`coarsen`).
- **App:**
  - live bar sheet + scorecard in the sidebar;
  - three divergent variants side by side (§2.7 v1);
  - a critic panel (P9 hook);
  - one-click export to every target.
- **Exit gates:**
  - a non-developer rebuilds `ui-toggle` from scratch in ≤ 15 min (one user test);
  - round-trip on 20 presets is lossless (golden hash equal);
  - Studio interaction p95 ≤ 1 frame on Instrument-sized specs.

### P9 · AI authoring quality (3 wk, then ongoing)
- **Goal:** AI-generated cards clear the ship gate without the user in the loop, except for heroes.
- **Flagship:** "Prompt → board". One sentence generates a coherent 3×3 board that passes G1–G6, average visual ≥ 17, one chrome and one red story.
- **Work:**
  - **preference data:** like/kill votes captured in Studio, the gallery and the essay (opt-in), stored as pairwise comparisons; Bradley–Terry refit nightly;
  - **critic stack:**
    - automated gates first;
    - then the HVS-SSIM squint and silhouette metrics;
    - then an LLM critic given the bar sheet and the K nearest liked and killed exemplars (UICrit-style, MASTER-PLAN §2.5);
  - **reference image → IR + spec:** via `lumaSites` + the halftone ladder (step 3, perceptual error optimization, Track L), so faces aren't raw threshold output;
  - **MCP:** `render_card`, `score_card` and `refine_card` (P6) gain `explain_score`; the eval harness is a fixed set of 50 prompts with the outputs archived per model version.
- **Exit gates:**
  - ≥ 75% of the 50-prompt set reaches ship within 4 rounds (up from 60%);
  - κ(critic, human) ≥ 0.7 on a held-out 30;
  - 0 G2 accent violations;
  - no regression when the underlying model changes (same harness).
- **Anti-goal:** don't train weights on 146 cards (§2.5 already says that). Exemplars and ranking only.

### P10 · Ecosystem and plugins (2–3 wk)
- **Goal:** Dot/480 cards show up where designers and developers already work.
- **Flagship:** the Figma plugin (if P6 picked Figma): paste a spec, get vector dots on a frame, with the card scaled to the frame and live re-render on property edits. Framer second, as a code component wrapping `<dot-card>` (cheap once `@dot480/react` exists).
- **Also:**
  - shadcn registry (Components v2 + widgets) kept in CI;
  - an Obsidian/Notion embed via the card service;
  - a Raycast or menu-bar "agent heartbeat" fed from the MCP state.
- **Exit gates:**
  - plugin accepted in the Figma Community;
  - shadcn `add` works in a fresh Next app;
  - no new dependency under `src/engine` (plugins live in `packages/*`).

### P11 · Accessibility and i18n (3 wk)
- **Goal:** the dot system works for low vision, screen readers, motion sensitivity and non-Latin scripts.
- **Flagship:** the Departures board in Japanese (station names in a CJK dot face) with a low-vision mode that re-resolves IR cards one ladder tier coarser.
- **Engine work:**
  - the **font registry** (M1, overdue since P0) → `layoutText`;
  - a CJK bitmap face: 12×12 or 16×16; check font licences (misaki, k8x12, Unifont) before choosing; MSDF for morphs (R7);
  - RTL layout plus Arabic shaping (DESIGN.md Known Gaps), with the shaper in a separate package;
  - the lattice a11y dial (§7);
  - `describe()` for every preset in the user's locale.
- **App:**
  - a high-contrast theme (`--mute` ≥ 7:1);
  - forced-colors support for the overlay;
  - the Dot Pad tactile export if R5 graduates.
- **Exit gates:**
  - `pnpm snap` renders CJK (today it renders empty);
  - WCAG 2.2 AA audit across all boards;
  - 3 low-vision testers read every Departures row at 1×;
  - all text cards pass G4.

### P12 · Performance: WebGPU (2–3 wk)
- **Goal:** the IR's GPU path runs as compute, and the renderer can scale past 1M dots on desktop.
- **Engine work:**
  - a WebGPU backend for the IR (WGSL emitter next to `emitGLSL`);
  - a compute-shader sampler for IR layers;
  - a storage-buffer instanced renderer;
  - a feature-detected fallback to WebGL2, then canvas;
  - plain browser APIs only (the AGENTS.md invariant holds).
- **Flagship:** `ir-plasma` at 1M dots, 60 fps, beside the CPU version, with a parity diff overlay.
- **Exit gates:**
  - IR WGSL ≡ GLSL ≡ JS golden hashes on the 20-field suite;
  - 1M IR dots @ 60 fps on an M-class laptop and 250k on a mid-tier Android;
  - no regression in the WebGL2 path.

### P13 · Hardware partnerships (ongoing, about 20%)
- **Goal:** move from demos on bought hardware to supported targets with a vendor contact.
- **Targets, in order:**
  1. TRMNL: plugin marketplace, e-paper waveforms (R10);
  2. WLED and AWTRIX communities: upstream DDP and MQTT examples;
  3. Nothing Glyph Matrix: Glyph Toy template, emulator parity;
  4. a flip-disc vendor (AlfaZeta or Hanover): a loaner panel for the clack and inertia model;
  5. Tronbyt.
- **Deliverables:**
  - per target, a reference kit (config, a 3-card bundle, a photo-calibrated `DeviceProfile`);
  - one co-announced post.
- **Exit gates:**
  - 2 vendor-listed integrations;
  - HVS-SSIM ≥ 0.9 (up from 0.85) on calibrated profiles;
  - IR bytecode running offline on ESP32 for 72 h with no drift beyond 1 frame against the master clock.

### P14 · Mobile and native (4 wk)
- **Recommendation:** **port the IR bytecode VM, not the TS engine.** The VM is about 2 kB on ESP32 (P5), so Swift and Kotlin ports are small, and bespoke TS fields reach native as baked raster assets (§3.12).
- **Flagship:** the Agent Heartbeat as an iOS Live Activity / Dynamic Island card and an Android home-screen widget, fed by the same MCP state.
- **Work:**
  - React Native via `@dot480/react-native`, using Skia (a dependency of that package only);
  - SwiftUI `DotCanvas` from the IR VM;
  - Core Haptics for the haptic grammar (R11).
- **Exit gates:**
  - native output ≡ web golden hash for 20 IR fields;
  - Live Activity updates within OS limits;
  - widget battery cost ≤ 1% per day.

### P15 · Theming beyond one accent (1.5 wk, **needs the user's yes first**)
- **Constraint:** AGENTS.md says "if you're about to add a second [accent], stop and ask". This phase **does not add a second accent**. It makes `{colors.dotActive}` swappable **per board** (Signal Red stays the default), and it adds a light/e-paper surface theme.
- **Candidate themes:**
  - phosphor green (CRT);
  - amber (Nixie/VFD; the existing `accentAmber` is mosaic-only today);
  - ice (LED blue);
  - e-paper (black on white, `quantizeSteps` tied to the device levels).
- **Exit gates:**
  - every board passes G2 in every theme (one hue per board);
  - contrast ≥ 4.5:1 for `mute` in every theme;
  - liked cards bar-sheet-approved in at least 2 themes;
  - DESIGN.md token tables updated in the same PR.

---

## 4. Track R: spikes worth running next
Rules (MASTER-PLAN §10):
- each spike is ≤ 1 week;
- a spike graduates only on its metric;
- a spike that misses its metric is written up in 10 lines and archived.

Ranked by expected value per week.

| Rank | Spike | Why now | Metric to graduate | Feeds |
|---|---|---|---|---|
| 1 | **R1 NCA "Mirror that Heals"** (RD fallback) | It completes signature moment 2 for the essay. `src/engine/sim` and `mirror-camera` already exist | Regrowth to SSIM ≥ 0.9 within 3 s, ≤ 4 ms per step at 48² lattice; weights ≤ 32 KB as a `Uint8Array` | P7 |
| 2 | **R3 Sonified UI** on Instrument (Web Audio, spring parameters → ticks, detents, transport) | Instrument already has the data model (`bpm`, `s0..s15`, the shared store) | Blind A/B preference ≥ 65% vs silent (n ≥ 12); audio callback never blocks a frame | P8, P14 |
| 3 | **R10 E-paper waveform LUTs** (new): custom partial-refresh waveforms and ghost pre-compensation for the TRMNL / IT8951 class | It turns the P5 ghosting *simulation* into *compensation* (Track L item 4) | Measured ghosting energy reduced ≥ 40% after 20 updates; HVS-SSIM vs photo ≥ 0.9 | P13 |
| 4 | **R11 Haptic grammar** (new): press, detent and long-press map to Core Haptics and Android `VibrationEffect` *in the native shell only* (MASTER-PLAN cut `navigator.vibrate`) | Pairs with P14; Instrument knobs are the obvious test | Blind preference ≥ 65% on iOS and Android; latency ≤ 20 ms from input | P14 |
| 5 | **Track L step 3: perceptual error optimization** (Chizhov 2022), offline | AI authoring (P9) needs faces better than structure-aware step 2 | Beats step 2 on HVS-SSIM for 10 portraits; afterlight-class result on 1 new face in a blind A/B | P9, cinema |
| 6 | **R7 MSDF glyphs and icons** | Unblocks CJK morphs (P11) and weather icon morphs without corner collapse | Mid-frame morphs free of collapse on 30 glyph pairs; CJK at 16² legible to 3 readers | P11 |
| 7 | **R4 Multi-screen choreography** (BroadcastChannel → WebRTC, NTP-style sync) | The Five Surfaces flagship already uses BroadcastChannel locally | ≤ 1 frame drift over 60 s across 2 devices on Wi-Fi | P13, essay |
| 8 | **R2 Sliced-OT migration** (worker) | Hilbert rank is good enough (0.4 ms). Run this only if the `glyph-longpress` taste pass flags crossings | Blind A/B preference over Hilbert rank ≥ 60% | P8 |
| 9 | **R12 Audio-reactive fields** (new): mic → FFT → `ctx.data` via `src/media/` (camera pattern) | `audio-levels` and the mirror pipeline already exist | ≤ 1 frame of latency from FFT to draw; no G6 flash failures at music peaks | essay |
| 10 | **R8 Generative editions** | A gallery/artist track. Low priority until the essay ships | One curated edition of 64, deterministic across engines (H7) | P10 |

**Not now:** R5 tactile (waits for P11 and tester access), R6 temporal super-resolution (needs 120 Hz LED hardware with smooth pursuit; revisit after P13).

---

## 5. Timeline: 12 weeks, one developer plus agents
Indicative. It assumes P5 and P6 merge by the end of week 1. If they slip, C1.1 slips with them and everything moves right by the same amount.

| Week | Main line | Parallel (agents) | User time | Milestone |
|---|---|---|---|---|
| 1 | C1 hygiene (C1.1–C1.8) | Draft scorecards for all 146 cards (agent scores only, marked as such) | **Taste session 1 (2 h):** D-1 to D-13, κ set of 20, like/kill on Departures, Instrument, Cinema and Levels | `v0.9.0` on `main`; ≤ 3 worktrees |
| 2 | H5 calibration; P0-D ladder migration on non-liked boards | C2.1 widget kit; C2.7 changelog | **Session 2 (1 h):** Glyph, Heartbeat, Five Surfaces; the bar sheet for the ladder migration | κ measured; D-5 applied |
| 3 | H1 SoA `DotBuffer` + pools | C2.4 DotCanvas transients; C2.8 test base | — | Mosaic ≤ 25 ms; GC gate measured |
| 4 | H1 `layers()`/`live()` + liveness lint; H2 latency | H4 G6 flash check; axe in CI | Order and unbox hardware | Latency p95 ≤ 1 frame |
| 5 | H3 perf gates in CI; lazy boards | C2.2 `scene3d` extraction; C2.5 states reconciliation | 30 min: level-03 torch bar sheet | CI enforces perf |
| 6 | H6 real hosts (MCP HTTP, 3 hosts); H6 devices | H7 cross-engine goldens; H8 packaging | 1 h: device photos for HVS-SSIM | **v1.0 RC** |
| 7 | v1.0 release; P7 card service | R1 NCA heals | Review the launch copy | **`v1.0.0` tagged and published** |
| 8 | P7 docs site | R1 continued; R3 sonified Instrument | — | Docs site live |
| 9 | P7 essay | Track L step 3 (offline) | 1 h: essay read-through | **Launch** (HN, X) |
| 10 | P8 Studio: round-trip, painter | P9 preference capture wired into Studio, gallery and essay | Like/kill in Studio (15 min/day, optional) | Votes flowing |
| 11 | P8 Studio: variants, critic panel | R10 e-paper LUTs | — | `henry-bear` lifted in Studio |
| 12 | P9 critic stack v1 + 50-prompt eval harness | R11 haptics (if the native shell exists) or R7 MSDF | 1 h: score 30 held-out cards | P9 baseline numbers |

**Cut order if behind:**
1. P9 slips to after week 12;
2. the docs site ships without the API reference;
3. the essay ships with 4 of the 5 moments (drop Five Surfaces if the devices aren't calibrated).

Never cut the v1.0 gates or the taste sessions.

### 5.1 First 2 weeks: a checklist you can start tomorrow
**Day 1 (user, about 1 h):**
- [ ] Reserve the `@dot480` npm scope (and the GitHub org or domain for the card service).
- [ ] Answer D-1 to D-13 in §1.2. Writing "default" against a row is a valid answer.
- [ ] Order the hardware (D-13): TRMNL, a 64×32 HUB75 + ESP32 kit, an Ulanzi TC001. Decide on the Nothing phone or the emulator only.
- [ ] Put two taste sessions on the calendar: 2 h in week 1, 1 h in week 2.

**Day 1–2 (agent, C1.1–C1.3):**
- [ ] Merge P5/P6 into `feat/p1-complete`; `pnpm check && pnpm golden --check && pnpm build`; open the PR to `main`, merge it, tag `v0.9.0`.
- [ ] `git worktree prune`; remove merged worktrees; delete merged branches; turn `backup/tile-boards-pre-rewrite` into a tag.
- [ ] Add `.gitattributes` and renormalize in one commit, with nothing else in it.

**Day 3–5 (agent, C1.4–C1.8):**
- [ ] Split `scripts/verify.ts` into `scripts/verify/*.ts`, with the same check count before and after.
- [ ] Shard `goldens/hashes.json` per board; update `scripts/golden.ts`.
- [ ] Generate the board registry with lazy imports; measure the shell gzip before and after.
- [ ] Archive the stale docs; fix README, HARNESS and the CI comments; re-verify AGENTS.md against the code and DESIGN.md (do D-1/D-2 rewording only after the user answers).
- [ ] Set up progress fragments; trim the stale "Next up" in PROGRESS.md.

**Week 1 taste session (user + agent driving `pnpm snap --bar`):**
- [ ] Score 20 cards (the κ set): the 4 liked cards, the 6 weakest from MASTER-PLAN §5 and 10 mixed.
- [ ] Like, kill or name one fix on: Departures, Instrument, Cinema, Levels.
- [ ] Rule on the mosaic red index (D-10) and `--mute` (D-9) while looking at the boards.

**Week 2 (agent):**
- [ ] Compute κ and rank validity; if they fail, fix the rubric, not the cards (§2.5).
- [ ] Ladder migration (D-5) on every board except the 4 liked ones; show bar sheets in session 2.
- [ ] `src/widgets/kit/` extraction, hash-neutral (C2.1).
- [ ] Session 2: Glyph, Heartbeat, Five Surfaces, plus the migrated boards.
- [ ] Update PROGRESS.md: every §1.1 row marked ✅, ❌ (with a named owner) or "waived (reason)".

---

## 6. Running parallel agents safely next time
Lessons from this build. 23 merges into `feat/p1-complete`, and this very planning agent's worktree started from `main` and had to fast-forward before it could read the plan it was planning from.

### 6.1 File ownership
| File class | Rule |
|---|---|
| `src/widgets/boards/<id>.ts` | One owner per board per wave. A second agent on the same board waits |
| `src/engine/<module>/` | One owner per module. Cross-module changes go to the main thread or are serialized |
| Shared registries (`src/widgets/index.ts`, `src/engine/index.ts`) | **Generated** (C1.6) or edited only by the integrator after the merge |
| `goldens/*` | Sharded per board (C1.5). Agents commit only their own shard |
| `scripts/verify/*` | One file per module (C1.4). No agent edits another module's suite |
| `PROGRESS.md`, `CHANGELOG.md`, `src/changelog.ts` | Agents write fragments (C1.8, C2.7); the integrator compiles them |
| `DESIGN.md` | Token-table edits only, in the same PR as the code (AGENTS.md). Two agents touching the same table get serialized |

### 6.2 Worktrees from the right base
- The brief names the base branch **and its commit hash**. The agent's first command is `git merge --ff-only <base>` followed by a check that `git rev-parse HEAD` equals the hash. If it doesn't, stop and report.
- Branch names carry the task id (`agent/p5-c-trmnl`), not a random hash, so cleanup and merge order are readable.
- `node_modules` junctions break Vite's `fs.allow` in worktrees (the WORKSPACE font 403s). Either add the repo root to `server.fs.allow` in `vite.config.ts` or document the snapshot-only workflow.
- Ports: each agent gets `--port 51<NN> --strictPort` from its task number.

### 6.3 Merge order
1. **Engine modules** (no visual change; goldens must not move).
2. **Shared app code** (`DotCanvas`, hooks, the overlay): browser smoke after each one.
3. **Boards**, in any order (they're isolated once registries are generated and goldens are sharded).
4. **Docs and progress fragments**, compiled once.
5. **Golden regeneration: once, on one machine, in its own commit** titled `chore(goldens): regenerate after <wave>`, listing every changed card id in the message. Never hand-merge a goldens conflict; take either side and regenerate.

### 6.4 Stalls and rate limits
- **Concurrency:** ≤ 4–5 agents at once. More than that hit rate limits and stalled mid-task, which left half-finished worktrees.
- **Checkpoint commits:** a WIP commit every meaningful step. The integrator can then salvage a stalled agent's branch instead of re-running it. Never use bare `git stash` (the stack is shared across worktrees).
- **Time boxes:** each brief states a budget and a "stop and report" condition. A stalled agent is cancelled and resumed with `SendMessage`, not re-spawned from scratch.
- **Slow tools on this machine:** `tsc -b` takes minutes under load, and `tsx` takes about 3 s to start. Briefs should say to use `pnpm verify <module>` and a scoped `tsc --noEmit -p tsconfig.app.json` while iterating, with the full `pnpm check` once before handoff.
- **Known false alarms to put in every brief:** "icons render empty" (they don't; verify asserts it), "CJK renders empty in snap" (it does, and that's known).

### 6.5 Review
- A fresh critic agent reviews the **diff and the bar sheet**, not the author's summary. The critic has kill-your-darlings veto (§2.7 v4).
- Every visual change attaches `pnpm snap --bar <id>` output paths in its report.
- **Commit hygiene:** no AI attribution trailers in commit messages (user preference). Conventional prefixes (`feat(board):`, `fix(engine):`, `chore(goldens):`) feed the generated changelog.

---

## Appendix: traceability
| This plan | Source |
|---|---|
| §1.1 gates | MASTER-PLAN §4 P0–P6 exit gates; PROGRESS status board, P0 exit gates and the P2-F / P2-G / P3-A / P4-F / P4-G notes |
| §1.2 decisions | MASTER-PLAN §11; PROGRESS "Needs the user"; STYLE-BIBLE ⚠ Pending/Open; DESIGN.md:202, :284, :286 |
| §2 debt | `git ls-files --eol`, `git worktree list`, file sizes, the duplicate-helper grep, `src/engine/index.ts`, `src/widgets/index.ts`, `ci.yml` |
| §3 phases | MASTER-PLAN §0 north star, §3.12 IR, §7 cross-cutting, §9 signature moments, §10 cut list (honoured: no WebXR, no Lottie, no `navigator.vibrate`) |
| §4 spikes | MASTER-PLAN §8 Track L, §10 Track R (R1–R8); R10–R12 are new |
