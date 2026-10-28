# Changelog

All notable engineering changes to Dot/480 are recorded here, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dot/480 is a personal website (https://dot-matrix1.vercel.app, deployed from `main`), not a published package: there are no tagged or npm releases, so entries are grouped by date, commit and PR. The visitor-facing notes live in the LOG tab (`src/changelog.ts`).

## [Unreleased] — 2026-10-28 · Foundation round: F0 engine foundation, T0–T4 layout and themes, E1–E2 editor (branch `feat/foundation`)
Plans: `docs/living-matter/F0-foundation.md`, `docs/LAYOUT-THEME-PLAN.md`, `docs/EDITOR-PLAN.md`. Status and checks: `docs/PROGRESS.md` › Foundation run.
### Added
- **TILT on phones (F0.7–F0.8):** a TILT row in the TOOLS sheet asks for motion access once (iOS) and the physics board follows the phone: tip it and the PIT and INK cards fall that way; held upright they heal back onto their loop. `src/site/light.ts` (a lazy `Source`), `src/engine/light/input.ts`; vertical swipes still scroll, and Reduce Motion never starts tilt by itself.
- **14 themes (T4a–T4b):** 7 accents × light and dark, following the system by default. Switch with the ⌘K "Theme: …" commands or the TOOLS LIGHT / DARK row. The CSS, the cards, the widget page, the editor chrome and exports all follow it; a no-flash boot script picks the theme before first paint. OG images and goldens stay `dark_signal`.
- **The frame (T2):** one left edge and a three-step rhythm across the home page, About and the widget page; the dock moved into the top bar; a footer band with a live count of the dots drawn.
- **Touchable hero card (T2):** drop, paste or pick an image and it becomes a live halftone on the home card. The image stays on the device; nothing is uploaded. `src/components/hero/`.
- **Figure legends (T2):** a short legend under the widget card and the essay figures.
- **Editor selection (E2):** multi-select and marquee, groups, locks, align and distribute, smart guides; copy, cut, paste and duplicate across tabs and through the system clipboard (Alt-drag moves a copy); a SELECT bar on phones. Docs migrate from v1 to v2.
### Changed
- **Faster first load (F0.11, T4b):** first-load JS 148.14 → 120.07 kB gz. First-load code imports engine modules by path instead of the `src/engine` barrel (−24.4), and the playground store, the widget registry and the home board left first load (−4.4). `scripts/site/size.ts --check` guards the IR parser staying out.
- **Tokens (T0) and chrome (T1):** one token block (`src/tokens.css`) with a raw-literal lint; first-load CSS 16.68 → 12.54 kB gz; dotted hairlines, one glow, four states on every control, glass on raised layers only, grouped tooltips with dot keycaps; cards have a 12 px radius.
### Removed
- The old MAKE screens (E1): 22 files, −2,264 lines; the one editor replaced them.
- Round-2 cleanup: `src/components/dwitter/DotsRepl.tsx` and `RemixGraph.tsx` (unused since the editor; RemixGraph is restorable for E5) and `scripts/export-chrome.ts` (it drove the removed playground export panel).
### Tooling
- CI runs the CSS token lint and re-runs `scripts/site/theme.ts --check` after the build (the `dist/index.html` boot-script check). `scripts/spec.ts` and `scripts/physics.ts` use the shared golden key helpers (`scripts/lib/goldenKey.ts`). `src/spec/validate.ts` loads the IR noise pack itself. The essay's sim figure leans the hourglass through the light hub.

## [Unreleased] — 2026-10-27 · ALGORITHMS board (branch `feat/algorithms`)
Doc: `docs/ALGORITHMS.md`.
### Added
- `src/engine/algo/`: `stipple` (weighted Voronoi stippling, Secord 2002: Lloyd relaxation with a bucket ring search, then a Voronoi-neighbour walk; lazy, cached iterations), `attractorDensity` (Clifford / de Jong log-density histogram; deterministic `dsin` / table `tsin`; a collapse guard that nudges out of periodic windows), `wfc` (simple tiled Wave Function Collapse with AC-3, chronological backtracking, fresh seeds and a scrubbable option history), `dla` (off-lattice diffusion-limited aggregation with circle jumps, a near-distance map and bisected contacts).
- Board `algorithms` (`/algorithms/`, ENGINE group, 2 columns, its own lazy chunk): `algo-stipple` (the moon in 2,400 Lloyd-relaxed stipples), `algo-attractor` (a drifting Clifford attractor), `algo-collapse` (a knot that ties itself, tile by tile), `algo-aggregate` (frost from one grain, with a live fractal-dimension readout). Each card's t = 0 is the finished picture; red marks only the live front.
- `scripts/algorithms.ts` (run by `pnpm verify`): determinism, invariants (stipples on the density, a consistent WFC tiling with a monotone history, non-overlapping DLA discs touching their parents, D in 1.6–1.85, no attractor collapse along the card path) and timing budgets scaled by a measured load factor.
- Goldens: 4 new presets (`algo-*`, t = 0 and t = 1.3); the existing hashes are unchanged.

## [Unreleased] — 2026-10-26 · UX U2–U4, U5 DISPLAY menu, cleanup (branch `feat/ux-u0-u1`)
Build log: `docs/UX-PLAN.md` §9. Built by parallel agents in worktrees, merged and fully checked once.
### Added
- **U2:** card hint verbs; the card action strip ⓘ / REMIX / LINK / PNG (`DotWidget.tsx`, `xray/store.ts` `cardAction`, `src/export/still.ts`); X-ray SUMMARY tab and glossary (`src/components/glossary.ts`); X-ray as a bottom sheet at ≤ 760 px.
- **U3:** EXPLORE / MAKE (TUNE · COMPOSE · CODE · DRAW) / ABOUT; the pure URL resolver `src/site/views.ts` with an alias table for every old `?tab=` / `?board=` / path; lazy `About.tsx`; `src/site/shortcuts.ts`; 4 `ux:` verify checks.
- **U4:** `src/site/pro.ts` (Pro mode: `?pro=1` / `localStorage`), `src/components/More.tsx` (remembered folds), staged makers per UX-PLAN §5.4, a single column on phones.
- **U5 slice:** the DISPLAY ▾ menu (`SkinSwitcher.tsx`) replaces the 7 skin buttons.
- `docs/SHARE-PLAN.md`: widget metadata, slug + short uid links (`/widget/<slug or uid>/`, room for org scopes), a widget page with iOS-style pill action bars, copy/share/embed, the shadcn registry.
- AGENTS.md › Testing: module-level checks while iterating; the full suite before a push or merge of bulk work, or after core changes.
### Changed
- GALLERY is gone (`?tab=gallery` opens EXPLORE). LOG moved into ABOUT. Share links write `?make=code&p=`.
- The device plotter's `plotterSVG` is renamed `penPlanSVG`. `STAGE_COLORS` uses `value`, `dotFaint` and `bg` tokens (same hex). `scripts/c10.ts` runs under verify.
- Probes use the new URLs (`studio-browser` and `dots-browser` add `&pro=1`); `c10-browser` expects the SUMMARY tab.
- First-load JS 142.9 → 143.87 kB gz.
### Fixed
- `packages/README.md` described `@dot480/core/spec` as card spec v0.

## [Unreleased] — 2026-10-24 · UX U0 + U1 (branch `feat/ux-u0-u1`)
Plan: `docs/UX-PLAN.md` (low floor, high ceiling); the build log, with what, why, checks and pending items, is §9.
### Added
- **App**
  - Grouped board picker `src/components/BoardPicker.tsx`: group tabs and chips on desktop, one native select at ≤ 760 px.
  - Groups and plain labels in `src/widgets/manifest.ts`: `boardGroups` (START HERE, INTERFACES, DATA, PLAY, ENGINE), `boardLabel`, `groupOf`, `liveBoards`.
  - START HERE is a curated tour (henry, mosaic, physics, heal, levels, instrument, cinema); every other board has exactly one home group.
  - One-line board descriptions in `src/widgets/blurbs.ts` (a lazy chunk, read via `src/components/useBlurbs.ts`), shown under the board title.
  - A dismissible intent line above the boards, with an essay link; dismissal persists in `localStorage` (`dot480:intro`).
  - The URL follows every view (`syncUrl` in `src/site/meta.ts`): the path names the board, `?tab=` names other views; Back / Forward walk them (`popstate`).
  - LOG: public release 0.10 "Easier to find your way" (`src/changelog.ts`).
- **Tooling:** `scripts/verify.ts` checks the picker groups, unique labels, a blurb per board and that old paths (`/light/`, `/glyph/` → lock) still resolve.
### Changed
- **Perf:** the audio engine left the first load (`src/audio/AudioCards.tsx`, lazy on INSTRUMENT / SCOPE): first-load JS 148.9 → 142.9 kB gz (budget 150).
- **App**
  - The footer is plain ("EVERY PIXEL IS A DOT SAMPLED FROM A FIELD"), with HOW IT WORKS (essay) and SOURCE links; the "STATUS: NOMINAL" filler is gone.
  - The header LIVE badge shows only on boards that stream live data (`liveBoards`: live, surfaces), as LIVE DATA.
  - The brand label shows the tab name; WORKSPACE no longer reads "PLAYGROUND".
  - Essay links are root-absolute (`/essay.html`), so they work from `/<board>/` paths.
  - Palette board entries use the plain labels and still match on the board id.
  - At 375 px the nav wraps so DRAW is reachable, and the first card starts at about 360 px (was about 640 px).
- **Tooling:** `scripts/site/mobile.ts` and `scripts/audio-chrome.ts` drive the new picker; the first-load check allows the idle-loaded blurbs and command-layer chunks.
### Fixed
- The ⌘K palette and the dot shell listed placeholder skins (`lcd`, `e-ink`, `none`, marked "soon"); both now read the real list from `src/engine/display/names.ts`.
- The dot shell's `skin` command no longer says "display skins land with C7".
- The shell leaves 64 px of bottom room so the dock no longer overlaps it.
### Docs
- New: `docs/UX-PLAN.md` (research, audit, the ladder, phases U0–U6, the build log) and `docs/README.md` (an index of every doc with its status: current, reference, historical).
- Rewritten for the current code:
  - `README.md`;
  - the `docs/DOT-MATRIX-ENGINE-PLAN.md` module map and subsystems;
  - the status boards in `docs/PROGRESS.md` and `docs/WEB-PLAN.md`;
  - `docs/DEPLOY.md` deep links (URL history);
  - the LOG tab's "coming up" list (U2, U3, U5, C1).
- `AGENTS.md`: the engine APIs now include WebGL2, the renderer choice includes `webgl`, and a short "The site" section covers goldens, the first-load budget and board ids as URLs.
- Status banners on finished or historical docs: MASTER-PLAN, ADVANCED-PLAN, MOTION-INTERACTION-DEPTH, ADVERSARIAL-REVIEW, VERIFICATION-16POINT, BLOCK-INVENTORY and HARNESS.
- Stale code comments fixed: `ir/reference.ts` (GPU parity), `studio/adapter.ts` (spec v1), `mcp/src/author.ts`, and `site/meta.ts` (script paths).

## 2026-10-24 · `43eb614` (PR #5) — Vercel only
### Added
- **Deploy:** `vercel.json` with the SPA rewrite, the security headers (CSP, `nosniff`, referrer and permissions policies) and caching that the Cloudflare files carried.
- OG URLs fall back to `https://$VERCEL_PROJECT_PRODUCTION_URL` when `SITE_URL` is unset (`scripts/site/postbuild.ts`).
### Changed
- Vercel auto-deploys `main` to production and every PR to a preview; CI only checks and builds.
- `docs/DEPLOY.md`, `docs/WEB-PLAN.md` and `docs/PROGRESS.md` describe the Vercel setup.
### Removed
- The Cloudflare Pages setup: the wrangler deploy job in `.github/workflows/ci.yml`, `public/_headers` and `public/_redirects`.

## 2026-10-23/24 · PR #4 (`feat/p1-complete`), part 3 — P5–P6 and the Web plan (W0, C2–C8, C10, lift)
Merged to `main` as `bc5fcaa` on 2026-10-24. At merge: 173 presets, `pnpm golden --check` matches all, first-load JS ≈ 149 kB gz.
### Added
- **Engine (P5)**
  - P5-A WebGL2 renderer (`src/engine/renderer/webgl/`): instanced squircle quads, IR on the GPU via `emitGLSL`, lost-context recovery; `gpu` board (up to 507k dots).
  - P5-B struct-of-arrays `DotBuffer` (`src/engine/buffer/`), `renderer/canvasBuffer.ts`, and worker sampling (`src/workers/`) to `ImageBitmap`.
  - P5-C device profiles and `toDevice` (`src/engine/device/`), e-ink / flip-disc / LED / plotter simulators, `surfaces` board ("One Field, Five Surfaces").
  - P5-E IR bytecode VM (`src/engine/ir/bytecode.ts`), C99 interpreter `targets/esp32/dotvm.c`, and Node senders in `targets/` (WLED DDP, AWTRIX, TRMNL, Tronbyt, Glyph Toy); tested against local fakes only.
- **Engine (Web plan)**
  - C2 dot physics (`src/engine/physics/`): pure-in-t worlds, stable fluids, PBD cloth and jelly, disc particles; `physics` board (`phys-*`).
  - C3 growing NCA (`src/engine/nca/`, Int8 lizard asset `src/assets/nca/lizard.ts`, trainer `scripts/nca/train.ts`); `heal` board.
  - C7 display skins (`src/engine/display/`, `src/components/skins/`): oled, crt, vfd, led, eink, flipdisc, nixie as a post-raster stage; `afterglow` raster op.
  - C8 kinetic dot type (`src/engine/type/`): variable stroke font, `typeMorph`, `typeMigration`, `marqueeField`; `type` board.
  - `src/engine/scene`: hall and grid DDA ray casters promoted from `levels.ts` (lv-* goldens unchanged).
- **Authoring (P6)**
  - P6-A card spec v1 (`src/spec/`, `schema/card.v1.schema.json`, `examples/specs/`): validator, preset ↔ spec round trip, `migrateSpec`.
  - P6-B packages (`packages/`): `@dot480/core`, `@dot480/react`, `@dot480/element` (`<dot-card>`) and a shadcn registry (`registry/`); not published.
  - P6-C DOTS tab (`src/components/dwitter/`, `src/lib/share.ts`): Field IR REPL, share links, remix graph.
  - P6-D Dot Studio (STUDIO tab, `src/components/studio/`): layered card document, timeline, state machine, bindings, scorecard and exports.
  - P6-E authoring MCP tools (`mcp/src/author.ts`, `scripts/author/`): `render_card`, `score_card`, `refine_card`, `record_verdict`, `push_to_device` (stub).
  - P6-F essay "Ditherpunk for UI" (`essay.html`, its own Vite entry; `src/essay/`) with 15 lazy live figures.
- **App (Web plan)**
  - W0: lazy boards (`src/widgets/manifest.ts`, one `import()` per board, prefetch on hover/focus; `src/widgets/registry.ts`), other views `React.lazy`.
  - W0: `/<board>/` deep links, runtime meta from `src/site/meta.ts`, crawler pages and OG images from `scripts/site/postbuild.ts`.
  - C4 playable HIVE (`src/game/`, `src/components/game/`, `?board=levels&play=1`): five stages, the queen, high scores, autopilot demo.
  - C5 sound (`src/audio/`): WebAudio synth and drums, lookahead scheduler, meter, mic, REC; `scope` board.
  - C6 camera hand tracking without ML deps (`src/vision/`): HAND mode as a page-wide pointer, shared camera stream (`media/stream.ts`); `mirror-shadow`, `mirror-conduct`.
  - C10 explorable layer (`src/components/xray/`, `src/components/palette/`): X-ray, inspector, time machine, ⌘K palette, dot shell, remix to DOTS / STUDIO.
  - P5-D exports (`src/export/`): APNG, GIF, WebM, MP4, plotter SVG; OG PNG via `scripts/og.ts`.
  - LOG: public releases 0.7 (DOTS), 0.8 (Dot Studio) and 0.9 (the essay).
- **Tooling:** `scripts/site/size.ts --check` (first-load budget 150 kB gz), `scripts/site/mobile.ts` (375 px pass), and headless Chrome checks `c10-browser`, `c6-browser`, `game-browser`, `essay-browser`, `studio-browser`, `skins-browser`, `webgl`, `browser-perf`, `export-chrome`, `audio-chrome`.
- **Tooling:** verify sections for buffer, device, export, DOTS, studio, spec, bytecode, ESP32, physics, type, display, vision, game and NCA.
- **CI:** the bundle budget check and a `site` artifact upload.
- **Docs:** `docs/WEB-PLAN.md` (personal-site direction), `docs/DEPLOY.md`, `docs/NEXT-PLAN.md`, `docs/MARKET-RESEARCH.md` (later marked superseded), `docs/MCP-APP.md`, `packages/README.md`, `targets/README.md`; DESIGN.md "Display skins".
- `.gitattributes` (LF text, binary images); renormalizing changed nothing.
### Changed
- **Lift** (craft pass): `cinema-encore`, `cinema-closer`, `cinema-keeper`, `light-gloss`, `light-fabric`, `live-now-playing` (sun cover, animated EQ), `live-contribs`, `hb-thinking` (new `bud` token).
- Board `glyph` → `lock` (cards `lock-*`); `/glyph/` and `?board=glyph` still resolve via `boardAliases`.
- `DotCanvas` picks `webgl` for cards with tagged layers, else Canvas; registered animated cards sample in the worker.
- The renderer path and the essay no longer import every board (registered presets only).
- Palette and shell search boards through the manifest.
- **Perf:** first load kept under budget: lazy skin overlay, command layer mounted on idle, hand tracker on demand (157 → 148.5 kB gz).
- **Deps:** vite ^8.2.4 and source-map-js ^1.2.2 via an override (Dependabot alerts; supersedes #3).
### Fixed
- Skins: boards opened with `?skin=` stayed OLED once the overlay became lazy.
- C10: X-ray hover through the OLED skin wrapper; the key that mounts the idle command layer is replayed; probes register on commit.
- C6: hand tracking capped at ~45 fps on average instead of a hard 22 ms gap (back to 28–29 fps).
- The camera hand pointer id maps to a number in physics and heal.
- HIVE: the covered levels board stops rendering while the game plays (initials entry lost letters).
- Levels: PRESS START fits its button.
- The draining hourglass heap and the flag's perspective corner stay on the card (CI failed at hh:mm:00–01).
- Mobile: view tabs and playground controls get 24 px targets; STUDIO timeline rows no longer overflow at 375 px.

## 2026-10-22/23 · PR #4, part 2 — P2 interaction, P3 depth + Field IR, P4 living boards
### Added
- **Engine (P2)**
  - `Control` contract in `src/engine/context.ts`: cards declare `controls`; the input layer edits `data` and fills `hover`/`pressed`/`focus`.
  - P2-A input layer (`src/engine/interaction/`): `toLocal`, `pick`, drag/release/key values; `useControlInput` and an a11y `ControlOverlay`.
  - P2-H released touches linger 520 ms for ripples; P2-I `size` only re-grids, so controls survive it.
  - P2-J board-level shared data (`BoardDef.shared`).
- **Engine (P3)**
  - P3-A Raster stack (`src/engine/raster/`) and light stack (`src/engine/light/`): blur, morphology, SDF heights and normals, Lambert/Phong, bloom.
  - P3-E Field IR v0 (`src/engine/ir/`): parser, JS and GLSL backends, JSON, reference interpreter; `scripts/ir.ts`, `goldens/ir-glsl.json`.
  - P3-F multi-tone layer `Layer.toneOf`; `toneRamp` returns one layer.
  - P3-G materials as dot vocabularies (`src/engine/light/material.ts`): matte, gloss, glass, emissive, metal, fabric; wall-clock `sunAt`.
- **Engine (P4)**
  - P4-A SimFields (`src/engine/sim/`): deterministic fixed-dt stepper with checkpoints; Gray–Scott, falling sand, Life.
  - P4-D migration and SDF morph (`src/engine/migrate/`): Hilbert-rank pairing, `DotCanvas` `migrate` transient.
  - P4-F halftone ladder with STBN (`src/engine/halftone/`) and webcam capture (`src/media/`).
  - P4-G `describe()` (`src/engine/describe.ts`) and Agent Heartbeat as an MCP App (`mcp/`, deps in `mcp/` only).
- **Boards**
  - P2-B/E Components v2: `ui-segmented`, `ui-stepped-slider`, `ui-knob`, `ui-stepper`, `ui-check`, `ui-tabs`, `ui-progress`, `ui-loaders`, `ui-keypad`, `ui-text-field`, `ui-chips`, `ui-toast`.
  - P2-C **Instrument** (`instrument.ts`): knobs, crank, XY pad, 16-step sequencer, transport, meter.
  - P3-B **Cinema** (nine Afterlight posters), P3-C **Levels** (nine HIVE game-world cards), `light`, `ir`.
  - P4-B **Heartbeat** (`heartbeat.ts`): tokenized agent presence states; P4-C **Glyph** lock board; `sim`; P4-E `live` (`src/data/`: poll, broadcast, websocket, mediaSession); `mirror`.
- **Tooling:** `pnpm snap --ctx '<json>'` for state snapshots; dev latency probe `src/hooks/latencyProbe.ts` (`__dotLatency()`).
- **Docs:** DESIGN.md "Interaction" tokens and "Agent presence".
### Changed
- P3-D lift: `silhouette`, `thermal-puppy`, `vision-camera`, `ev-charge`; P2-D lift: `henry-bear`, `sunburst`.
- `ui-toggle` / `ui-slider` draw hover glow and a marching focus ring; segmented controls pass `optionLabels`.
- Toast becomes a dismissible two-toast notification stack.
- Input commits inside its rAF: input latency p50 ~35 → 16.8 ms, p95 ~65 → 40.4 ms (dev build, headless Chrome).
### Fixed
- P2-F browser and a11y pass: radiogroup focus follows a pointer pick; the WORKSPACE preview honours `springKeys`; cards are `<div>` instead of `<article role=…>`.

## 2026-10-22 · PR #4, part 1 — P1 complete, P0 leftovers
### Added
- **Engine:** `splitFlapCells` and a `burst` preset flag with `ctx.since` (live sampling for 1.2 s after the minute tick).
- **Boards:** **Departures** flagship (`src/widgets/boards/departures.ts`): split-flap list, Swiss station clock, platform flip, countdown, line map, service status.
- **App**
  - P1-A board-to-board exit → enter transition (`DotCanvas.exit`, `cardMotion()`, `useExitSwap`, `VIEW_EXIT_MS` = 420 ms).
  - P1-B home-clock split-flap on the minute tick.
  - P1-D data springs (`WidgetPreset.springKeys`) on timer, music, fitness and audio-levels.
  - P1-E messages typewriter, audio-levels peak-hold, weather city decode.
  - P1-F Transition Lab in WORKSPACE (`src/components/playground/TransitionLab.tsx`).
  - LOG: public release 0.6.
### Changed
- **Perf (P0-A):** sampler windows, baked photo fields (`baked()`), static sample cache across board visits; mosaic mount 117–200 → about 30–33 ms (gate borderline).
- P0-B: permanent bounds-vs-no-bounds check in verify §14 (all presets).
- P0-C: site literals use `Layer.size` (`T.dots`, metro `afterlight`); verify lints for it.
- Dev: the Vite watcher ignores `.claude` worktrees.

## 2026-10-14 → 10-19 · `fa47cd9`, `4abf78a`, PR #2 — motion tests, merge to main
### Added
- **Tooling:** verify §13, 20 checks on the motion primitives (masks, reveal, springs, easing, decode, split-flap).
- **CI:** first green run on GitHub; Linux goldens match the Windows baselines.
- **Docs:** user priority feedback in `docs/PROGRESS.md` (visible work first).
### Changed
- PR #2 (`feat/tile-boards`) merged to `main` on 2026-10-19: TILE boards, Phase 0 and the Phase 1 motion core.

## 2026-10-14 · Phase 0 foundations + Phase 1 motion core
### Added
- **Engine**
  - `src/engine/math.ts`: deterministic `hash32`/`hash01` (murmur3 finaliser), plus `clamp`/`mix`/`smoothstep`.
  - `src/engine/context.ts`: `FrameContext`, `Pointer`, `LayerSource`; `WidgetContext` is now an alias.
  - `src/engine/clock.ts`: master clock. One shared rAF, per-subscriber fps (`t = frame/fps`), pause on hidden page, never resets, `invalidate()` for next-frame redraw.
  - `src/engine/motion/`:
    - masks: bayer, ign, noise, diagonal, wipe, radial, curtain, scan, `ditherEdge`;
    - easing: `cubicBezier`, M3 tokens, durations;
    - closed-form springs and `DataSprings`;
    - buffer-level `revealDots` / `transitionDots`;
    - `decodeText` / `splitFlapText`.
  - `Layer.size` for site layers (split from `lattice`).
- **App**
  - Board entrance: cards reveal on a diagonal stagger with a Bayer mask, and each card samples only when its turn comes.
  - Change dissolve: any card whose dots change (data, minute tick) dissolves old → new in mask order.
  - Both respect reduced motion.
- **Tooling**
  - `pnpm snap --film` (contact sheet + APNG) and `--bar` (candidate vs liked cards at 1×, 3×, blur, silhouette).
  - `pnpm golden [--check]` with `goldens/hashes.json`.
  - `pnpm fidelity` (gates G1–G3, G5 + metrics) and `pnpm bench` (per-board budgets).
- **CI:** `.github/workflows/ci.yml` (check, build, golden check, perf report).
- **Docs:** `docs/STYLE-BIBLE.md` (10 rules extracted from the liked cards).

### Changed
- Animated cards draw imperatively from the master clock; React no longer re-renders every frame.
- The SVG renderer emits `<defs>` + `<use>` grouped by fill, at 2 dp. Board markup is about 4× smaller (deerflow12: 1.39 MB → 359 KB).
- The canvas renderer is batched: one `Path2D` + `fill()` per colour and opacity, instead of one per dot.
- `bounded()` no longer mutates its argument.
- Cover and visibility are decided on the quantized value, so a dot that quantizes to 0 no longer punches a hole.
- The minute tick re-samples only `clock: true` presets.
- `withChrome()` is cached per preset, so the playground preview stops re-sampling on unrelated changes.
- All board hashes moved from `fract(sin)` to `hash01`, and goldens were re-baselined. Liked cards are unchanged; the mini-game star seeds were retuned.
- Acceptance tests moved from `src/engine/verify-acceptance.ts` to `scripts/verify.ts`, so the engine no longer imports widgets.

### Fixed
- **H1:** mosaic `cells()` returned non-zero outside its box. Every preset now renders identically with or without bounds.
- **H4 Draw:**
  - W/H apply on blur/Enter, and resize is undoable;
  - the canvas is DPR-aware;
  - object URLs are revoked;
  - the advertised shortcuts work.
- **M7:** bad lattice values, NaN sites and empty splines no longer throw or corrupt output.
- `superformulaPath` falls back to a circle instead of throwing.
- **Perf:** thermal-monitor heat is computed once per cell, and apps icons are bounded.
- A broken preset renders blank instead of crashing the board.

## 2026-10-14 · `f748396`, `c8af647` — research, planning, changelog
### Added
- `docs/ADVANCED-PLAN.md`: full audit and roadmap. It covers:
  - a baseline benchmark (per-frame vs mount cost, SVG size);
  - findings H1–H4, M1–M10 and Low;
  - a measured performance plan, technique upgrades (halftone, type, motion, testing) and product direction;
  - a phased roadmap and the open decisions.
- `docs/MOTION-INTERACTION-DEPTH.md`: research on animation (load-in, transitions, springs, afterglow), interaction (pointer, press, focus, ripple, fisheye) and depth (blend modes, occlusion moat, lighting, parallax, bloom). Includes an analysis of why level-03, afterlight, mosaic and components work, and a market scan, with sources.
- `docs/MASTER-PLAN.md` (draft v1): phased plan from widget kit to dot-native interface engine:
  - a fidelity rubric and refinement protocol;
  - an Engine 2.0 architecture (`FrameContext`, Layer 2.0, field algebra, motion, SimField, card spec);
  - phases P0–P7, cross-cutting budgets, risks and decisions.
- `public/lab/motion-lab.html` (served at `/lab/motion-lab.html`): standalone live prototype with four tiles:
  - mask transitions;
  - decode scramble plus a closed-form spring;
  - pointer interaction (fisheye, hover glow, press spring, ripple, keyboard focus);
  - Lambert-lit depth with a pointer torch, shadows, moat and bloom.
- `CHANGELOG.md` (this file).
- **Public changelog in the app:** a LOG tab (deep link `?tab=log`) listing releases v0.1–v0.4 and the upcoming phases, written for visitors (`src/changelog.ts`, `src/components/Changelog.tsx`).
- `docs/PROGRESS.md`: handoff checklist of what's done, pending and skipped, per phase.
### Changed
- `docs/MASTER-PLAN.md` → **v2**, after adversarial review by three critics (engine architecture, design/fidelity, vision/research). Main changes:
  - **Fidelity:** split into gates + visual score + life score, with rank-validity calibration; a style bible; a type-scale ladder; a v0–v5 refinement protocol with variants, bar sheets and a human like on heroes.
  - **Architecture:** a `Raster` kind for neighbourhood ops; a `layers()`/`live()` static split; buffer-level keyed transitions with data springs; a 60 Hz master clock; hit-testing as data; a fixed-rate SimField; an integer hash.
  - **Field IR:** promoted to a core deliverable.
  - **Perception Lab:** a new track (DeviceProfile, HVS-SSIM, halftone ladder, display simulators).
  - **Showcases:** sharper flagships (Departures, Instrument, Cinema, Levels, Glyph, Agent Heartbeat, Five Surfaces).
  - **Backlog and scope:** a lift backlog for the weakest cards; an explicit cut list.

## 2026-10-13 · `d2bbb22` — rebuild all boards on the 144×144 TILE standard
### Added
- **Engine:**
  - per-layer coarser `lattice` and `origin`, and explicit dot `sites`, so bigger elements use bigger dots instead of clusters;
  - `Field.bounds` (`CellBounds`), so the sampler visits only the cells a layer can light;
  - cell-space layout helpers in `src/engine/layout.ts` (`textAt`, `placeCells`, `ringCells`, `barsAt`, `polylineCells`, `spriteAt`, …);
  - the Scale2x `smooth` display weight for big type;
  - a pure-TS SVG path rasterizer (`fields/svgPath.ts`), so icons render headlessly.
- **Widgets:**
  - all seven reference boards rebuilt as `src/widgets/boards/*` (henry, deerflow12, mosaic, henry3, metro, ride, audio) on `TILE` with dot-drawn chrome (`chrome: 'dots'`);
  - the new **components** board (toggle, pill, slider, icon button, status dot);
  - shared sprites in `src/widgets/sprites.ts`.
- **Tooling:** `pnpm snap`, headless PNG snapshots of cards and boards in `.snapshots/` for reference checks.
- **App:**
  - animations pause off-screen and when the tab is hidden;
  - `prefers-reduced-motion` support;
  - DPR-aware canvas;
  - a responsive 3 → 2 → 1 column grid;
  - card accessibility labels (`role="img"`).
### Changed
- The `gridSampler` composites layers by maximum value, with lattices first and card cells under lit lattice dots and sites covered.
- `DESIGN.md`, `README.md` and `docs/DOT-MATRIX-ENGINE-PLAN.md` document the TILE typography tiers and lattice/sites/bounds.
### Removed
- The 40+ legacy single-file widgets in `src/widgets/*.ts` (replaced by the board files).
- Unused shadcn UI components (`src/components/ui/*`), `ThemeProvider`, `components.json`, and template assets.

## 2026-08-24 · `6c526fe` — verification script, Draw and Gallery tabs
### Added
- `pnpm verify` (`src/engine/verify-acceptance.ts`): engine acceptance tests.
- A **Draw** tab: a grid drawing canvas, toolbar, reference image panel, Bresenham lines and field export (`src/components/draw/*`, `src/hooks/useDrawBoard.ts`, `src/lib/*`).
- A **Gallery** tab and a playground data editor (per-preset sliders).
- A recorder widget.
### Changed
- Corrected the 3D projection maths in `projection3D.ts` and the engine plan.
- Refined the icon SDF, the halftone, polar, scatter and warped fields, and the sampler.
- Updated `ADVERSARIAL-REVIEW.md` (final pass verdict) and `BLOCK-INVENTORY.md` (widget coverage).

## 2026-08-22 · `278cf24` — Dot/480 engine, widgets and docs
### Added
- **Engine** (`src/engine`, framework-free):
  - the `Field → Grid Sampler → Renderer` pipeline;
  - generators: bitmap font, CJK fallback, halftone, heatmap, icon SDF, polar, 3D projection, scatter, spline, warped, waveform;
  - quantize and jitter;
  - squircle dot shapes;
  - SVG and canvas renderers;
  - theme tokens.
- **App:**
  - board view with `DotCanvas` and `DotWidget`;
  - playground (controls, photo upload, export, gallery, preview);
  - `useDotField` hook.
- About 40 widget presets (clock, timer, weather, fitness rings, music, messages, thermal monitor, metro line and more).
- Reference images in `public/images/`.
- Docs: `DOT-MATRIX-ENGINE-PLAN.md`, `ADVERSARIAL-REVIEW.md`, `BLOCK-INVENTORY.md`, the PRD and step handoffs.
- shadcn UI components and Tailwind wiring.
### Changed
- `AGENTS.md` clarifies the engine dependency rule.
- `README.md` describes the architecture and usage.

## 2026-08-22 · `0e5e97a` — Tailwind and import aliases
### Added
- Tailwind CSS v4 via `@tailwindcss/vite`.
- `@/` path aliases in Vite and TypeScript.

## 2026-08-22 · `8002c2d` — first commit
### Added
- Vite + React + TypeScript scaffold, oxlint config.
- `AGENTS.md` (invariants) and `DESIGN.md` (tokens, colours, typography, components).
