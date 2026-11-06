# Changelog

All notable engineering changes to Dot/480 are recorded here, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dot/480 is a personal website (https://matrix.reactopia.me, deployed from `main`), not a published package: there are no tagged or npm releases. From 0.14 on, an entry is one checkpoint (a GitHub milestone, see `docs/CHECKPOINTS.md`) and names its PRs; older entries are grouped by date, commit and PR. The visitor-facing notes live in the LOG tab (`src/changelog.ts`).

## [Unreleased] · 0.17 · 2026-11-04 to 2026-11-06 · CP5, UI hill climb (in progress)
Milestone `CP5 · 0.17 · UI hill climb` (tracking issue #189), merged to `main` PR by PR. Still open: #186 (MAKE layout), #187 (the full accessibility walk), #188 (rename the falling-blocks card). Status: `docs/PROGRESS.md`.
### Added
- **Browse** (`/browse/`, lazy; #182, PR #205): every card from every board in one windowed grid, filtered by board, tag and name, with the filters in the URL (`?in=`, `?tag=`, `?q=`). The header, the palette and the shell (`open browse`) reach it, and it has its own meta and a sitemap entry. Probe: `scripts/site/browse-browser.ts`.
- **Accessibility probe** (#187, PR #195): `pnpm a11y` (`scripts/site/a11y.ts`) runs axe-core on each route and fails on serious or critical findings. Run by hand; not in CI yet.
- **Credit to Henry Li** (`@henry19840301` on X): his ESP-Mosaico concept screens for a 480 × 480 OLED device, posted on 20 Aug 2026, are where the project started. The credit, with links to both posts, is in ABOUT › CREDITS, the essay's Prior art list, the README, and a new opening section of `docs/CREDITS.md` (from `conceptCredit` in `src/widgets/blurbs.ts`, through `scripts/site/credits.ts`). The seven boards that rebuild his sheets (henry, deerflow12, mosaic, henry3, metro, ride, audio) show a credit line under their blurb. Goldens: 0 changed.
- **Brand mark** (PR #212): the M of the dot font on a 5 × 5 dot grid, the accent on its centre vertex. It is the header's home link, the blog and lab nav mark, the favicon and the app and touch icons, all written from `src/site/brand/mark.svg` by `scripts/site/favicon.ts`.
- **`/favicon.ico`** (#198, PR #204): 16, 32 and 48 px, drawn from the app icon by `scripts/site/favicon.ts` (`--check` in `pnpm check`). `public/favicon.svg` uses the dot icon.
### Changed
- **Flags** (PR #200): a release flag comes from the registry default, then `VITE_FLAG_<ID>`, then `localStorage['dot480:flags']`. The URL never sets one: `?flags=`, `?worker=` and `?clack=` do nothing. `likes` is on by default and stays hidden while the likes API answers 404. Probes seed flags with `launch(w, h, { flags })`.
- **MAKE and LAB behind flags** (#178, PR #192): `make` and `lab`, both off by default. Off, they leave the header, tab bar, footer, TOOLS, palette, shell, card actions and sitemap; a MAKE URL or `/lab/` opens the home board.
- **Header and titles** (#179, #180, PR #192, PR #204): the view tabs and BLOG sit in one group; board titles read `NAME: subtitle`, with no DOT/480 and no em dashes, the name in dot type.
- **Widget page** (#183 to #185, PR #191): above 760 × 560 it fits the screen with no page scroll, the card scaled to fit and a side panel; MORE is a real menu button; links and tags look clickable.
- **Card actions** (#181, PR #194): the hover strip that covered the drawing is gone. Each card has one ⋯ menu in its top padding.
- **CI** (#197, #193, PR #199): four parallel jobs (typecheck + lint, verify, build + site checks, mcp) behind the required `check + build` gate, about 2.5 minutes from push to green. One run per push. `pnpm check` is `pnpm check:static && pnpm verify`. The perf report runs on `main` only.
- **React Doctor** (PR #210): `pnpm react-doctor` and a report-only CI job outside the gate, with settings in `doctor.config.ts`. It fixed its first few findings; the rest are #207, #208 and #209.
- **Dependencies** (PR #201, #202, #203): `pnpm/action-setup` 6.1.1, `actions/checkout` 7.0.1, and ten minor and patch updates.
- **Docs**: the live run state in `docs/PROGRESS.md` for CP4 and CP5 (PR #206). Then this file's 0.14 to 0.17 entries, and a sweep of the README, the doc index, `AGENTS.md`, `DEPLOY.md`, `HARNESS.md`, `CHECKPOINTS.md` and the plan status lines for flags, likes, MAKE and LAB, browse and CI.
### Fixed
- **SEO checkup** (#198, PR #204): `/` keeps its own title and canonical; Field IR builds code with `new Function` only in Node, so pages make no eval attempt; the tool dock holds its place from first paint (CLS 0.304 → 0.012 at 1280 px); each page links one stylesheet.
- **Board chunks after a deploy** (PR #211): a board chunk that 404s is tried three times, then the failure is cached for 30 s, so a stale tab no longer requests it in a loop. A stale deploy reloads the page once (at most once per 5 minutes per tab), and a board or BROWSE card that still can't load shows RELOAD (`LoadBoundary`). This fixed SURFACES and LOCK not loading in tabs opened before a deploy. Probe: `scripts/site/chunks-browser.ts`.
- **X-ray probe** (#190, PR #199): `scripts/c10-browser.ts` passes on a production build with the flag off and on. The `mcp/` package type-checks again (#193).
- **Accessibility quick fixes** (PR #195): the ⌘K dock button's name includes the text it shows, and the blog post line's BLOG link keeps its underline.

## 0.16 · 2026-11-04 · CP4, flags, SEO, analytics, shell and security (PRs #153 to #177, #196)
Milestone `CP4 · 0.16 · Flags, SEO, analytics, shell and security`, merged to `main` PR by PR. Open: #169 (likes; phase 1 shipped).
### Added
- **Feature flags** (#144, #145, PR #154, PR #173): `src/site/flags.ts`, a typed registry with build values and `kill`, which leaves a feature's chunks out of the build. X-ray is behind `xray`, off by default.
- **SEO** (#146, PR #157, PR #173): `scripts/site/seo.ts` writes `sitemap.xml`, `robots.txt`, crawlable text on board, widget, blog and home pages, JSON-LD, and a dot 404 page served with status 404. `seo-check.ts` checks the build and plays the `vercel.json` routes against `dist/`.
- **Analytics** (#151, PR #171): opt-in PostHog. Nothing loads before Allow; GPC and Do Not Track keep it off; events go through the `/ingest` proxy and carry ids only.
- **Likes, phase 1** (#169, PR #176): Vercel Functions in `api/` over Upstash Redis, weighted and capped, with BotID. A like button on widget pages and gallery programs, shipped off.
- **Shell** (#152, PR #174): one command table drives `help`, Tab completion and did-you-mean.
- **Brand** (PR #168): the public name is MATRIX. The legal pages follow the MIT license, and the README is written for visitors.
- **Repo** (PR #166): MIT `LICENSE`, community files, `THIRD-PARTY-NOTICES.md`, a pinned Node version, and docs scrubbed of local paths.
- **Prose lint in `pnpm check`** (#77, PR #170): `scripts/site/prose-lint.ts` (rules in `prose-rules.ts`) over visitor text, the README and the changelogs; the voice guide `docs/WRITING.md`.
### Security
- **Headers** (#141, PR #153): one header block for every path (the old one skipped `/lab/motion-lab/*`), `frame-ancestors 'self'`, `X-Frame-Options`, COOP and HSTS; no socket sources in `connect-src`.
- **Field IR cost** (#142, PR #155, PR #177): a static cost cap per dot and a frame budget that pauses slow programs.
- **Field IR front end** (#158, PR #160, PR #175): a seeded fuzz check in verify, an allowlist for emitted code, closures only for visitor programs, and a sandbox worker the page terminates after 250 ms.
- **Live board** (#147, PR #156): its URL config and API parsing are locked down; `?np=` is gone.
- **Editor imports** (#143, PR #167, PR #177): documents are validated and grids capped, a bad saved document recovers, and program and document links ask OPEN THIS LINK? first.
- **Navigation** (#148, PR #172): every URL write goes through `src/site/safe-url.ts`, `//path` addresses are cleaned at startup, bad escapes no longer throw, and error boundaries catch render errors.
- **Repo and themes** (#150, #149, PR #159, PR #196): CI actions pinned to SHAs, `.env*` ignored, custom themes stored as a hue, the boot script paints only stored CSS that passes a strict shape test, and test globals are off in production.
- **Trusted Types** (PR #196): two policies (`dot480-svg`, `default`) in `src/lib/trusted.ts`, sent as `Content-Security-Policy-Report-Only`. `scripts/site/csp-browser.ts` walks the pages and fails on any violation.
### Changed
- **Dependencies** (PR #161 to #165): `actions/upload-artifact` 7.0.2, `pnpm/action-setup` 6.1.0, two minor updates, and TypeScript 7.0.2 and `@types/node` 26.6.6 in `mcp/`.

## 0.15 · 2026-11-04 · CP3, kits and new boards (PRs #102 to #140)
Milestone `CP3 · 0.15 · Kits and new boards`: all 11 issues closed. The same days also landed parts of #36 (Backlog, still open) and #20, #21, #34 and #69.
### Added
- **Car dash** (`/dash/`; #125, PR #135): nine cards driven by one 30 s lap that hands over on the first control edit.
- **Faces** (`/faces/`; #127, PR #136): four lit halftone heads whose eyes follow the pointer.
- **Kinetic type** (`/kinetic/`; #129, PR #137): seven effects on one shared word, kept in `?word=`.
- **Micro motion** (`/motion/`; #128, PR #138): eleven looping micro-interactions; a tap replays.
- **Charts** (`/charts/`; #132, PR #139): seven dot charts that grow in, morph and read out the nearest point.
- **Watch faces** (`/watch/`; #126, PR #140): eight faces, with moon phase and sun times computed on the device.
- **IQ boards** (#66 to #69, PR #102, #107, #108, #118): noise upgrades, `/oldschool/` effects, `/fractals/`, and `/scenes/` (3D SDF scenes sphere-traced on the CPU).
- **Squares** (#20, #36, PR #112, #114, #123): `sq-hat` and `sq-ammann` aperiodic floors, `sq-arctic`, `sq-sandpile` and `sq-ascii`.
- **Pond** (#36, PR #115, #122): `pond-plankton` (Particle Lenia) and `pond-turing` (Turing skin).
- **Workshop** (#21, #36, PR #116, #121, #124, #134): `mat-lichtenberg`, `mat-erosion`, `mat-frost`, `mat-kintsugi`, `mat-mud` and `mat-fold`.
- **Theme** (#34, PR #117): a CONTRAST: MORE switch and `?hue=` share links.
- **Probes** (#37, PR #113): P0 probes for layout, sticky bars, navigation and focus.
- **Guides** (#77, PR #120): three visitor guides in `docs/guides/`.
### Changed
- **Tokens** (#45, PR #110): a z-index scale, tap sizes and bar heights.
### Fixed
- **Site chrome** (PR #119): a sticky desktop header that hides on scroll down, the footer wrap and overflow found by the P0 probes.

## 0.14 · 2026-11-03 · CP2, foundations and fixes (PRs #79 to #111)
Milestone `CP2 · 0.14 · Foundations and fixes`: all 8 issues closed.
### Added
- **Engine packs** (#62 to #65, PR #89, #91, #96, #105): IQ1 2D SDFs (`src/engine/sdf`), IQ2 smooth minimums, domain repetition and xor, IQ3 shaping and easing (`src/engine/shape`), IQ4 filtered fields for coarse grids.
- **Tixy** (#53, PR #92): the `tixy()` adapter and a card `credit` field. `docs/CREDITS.md` is generated by `scripts/site/credits.ts` and checked in `pnpm check` (PR #109).
- **Blog** (`/blog/`; PR #80, #81, #82, #85, #99): the essay (now `/blog/dot-matrix-essay/`; old essay URLs redirect) and three deep dives, code highlighting, and hero and social images drawn by the engine.
- **Lab** (`/lab/`; #86, PR #87): interactive pieces off the board grid, starting with Field to dots.
- **Checks** (#75, #28, #29, PR #83, #88, #94, #95, #104, #111): one reporter, wall-clock checks warn unless `DOT_TIMING=strict`, steadier timing gates, and a `mat-lens` WebGL parity entry.
- **File-size rule** (#76, PR #93): `scripts/site/file-size.ts` in `pnpm check`, with an allowlist for the current overages.
### Changed
- **Goldens** (#76, PR #101): one file per board, `goldens/<board>.json`.
- **Splits** (#76, PR #93, #97, #98): `verify.ts`, `materials.ts`, `pond.ts`, `App.css` and `mobile.css`.
- **Workshop** (#27, PR #100): cheaper cold first frames, same pixels.
- **Release notes** (PR #79): 0.13 in the LOG and this file.
### Fixed
- **Pond** (#90, PR #97): koi no longer snap back after a feed.
- **Full-bleed widths** (#42, PR #106): `100cqi` replaces `100vw`, so scrollbars no longer push the editor, bars and figures past the page edge.

## 0.13 · 2026-11-01 · PR #78 (`feat/round3`), round 3: workshop, glass and water, squares Q2 and Q3, pond L3 and X1, editor E5 and E6
Merged to `main` as `8a1a6fb` (PR #78). Plans and status: `docs/PROGRESS.md`, `docs/CHECKPOINTS.md` (CP1), `docs/living-matter/`, `docs/EDITOR-PLAN.md`.
### Added
- **Workshop board (M3)** (`/workshop/`): nine materials (knit, denim, paper, wood, leather, sand, ice, mercury, thread) and one light resolver for tilt on both material boards. Goldens: 9 added.
- **Glass and water (M2)**: `mat-lens` (the board's GPU layer), `mat-pool`, `mat-window`, `mat-patch`, `mat-rust`, `mat-candle`; `glass.ts` and `caustics.ts` in `src/engine/matter/`. Goldens: 6 added.
- **Squares Q2 and Q3**: rect cells, teletext sextants, line screens, `lcd` and `grout` skins, the square field pack, `Layer.rotation`, `Layer.motif`, equal-ink morphs. Goldens: 9 added.
- **Pond X1**: `pond-marble`, the daily and ageing pond (`?day=`, opt-in POND MEMORY), board to widget View Transitions, the OPEN card action. Goldens: 1 added.
- **Editor E5 and E6**: frame and document links, remix lineage, EXPORT · DEVICES and QUALITY; the long-press menu, snap cue, sheet detent memory, landscape side sheet, `visualViewport`, `navigator.share`.
- `scripts/site/prose-lint.ts` and `docs/WRITING.md` (visitor prose, plain voice), `docs/CHECKPOINTS.md`, `docs/TIXY-PLAN.md`, `docs/IQ-PLAN.md`, `docs/TILT-CHECKLIST.md`.
### Changed
- `pnpm verify` reports timing budgets as warnings unless `DOT_TIMING=strict`. The X-ray probe applies the squares form hook. The essay got a plain-voice pass.

### Pond L3 (part of 0.13)
Plan: `docs/living-matter/L-pond.md` §L3; as built: `docs/LIFE.md` "L3".
### Added
- **Pond depth:** koi hunger (sated koi ignore food), feeding bursts and gulps, circling back to a missed pellet; startle contagion (a cascade of at most 3 koi); day and night by the hour (render-only: the moon's reflection, dimmer whites, fireflies' stars, a thinner terrarium floor at night); salt on the slime and a lantern on the fireflies (holds).
- **DOTS / TYPE switch** on `pond-koi` (`glyphs`): the same scene in 5×7 font glyphs on 6×8 tiles; shown on hover or focus, default DOTS.
- **Tilt and light on the pond:** `pond-koi` reads the light hub (`pondSources`); `rippleTilt` (new, `rippleStep` untouched) sloshes the water, `lightSrc` 1 lights the koi by tilt.
- `scripts/life-l3.ts` (in `scripts/life.ts`); `scripts/life-browser.ts` covers all six cards at 375 and 390 px (phone fps tier, swipe, tap, hold) and reduced motion.
### Changed
- The koi flick threshold is 200 cells/s (was 90, reached by ordinary mouse moves); the hover wake follows the pointer's speed.
- Goldens: 0 changed (frames at rest equal the L2 frames bit for bit).

## 0.12 · 2026-10-30 · PR #10 (`feat/round2`), PR #11 and PR #50, round 2: materials, pond, squares, card size, editing on canvas, the worker trim, themed essay and legal pages
Merged to `main` as `2b4780e` (PR #10), `bcacd5a` (PR #11) and `238e68a` (PR #50). T5 and T6, also in PR #10, have their own entries below. Status: `docs/PROGRESS.md`; plans: `docs/LIVING-MATTER-PLAN.md`, `docs/living-matter/`, `docs/EDITOR-PLAN.md` §8.3, `docs/LAYOUT-THEME-PLAN.md` (T3).
<!-- TODO(later): confirm whether T5 and T6 (PR #10) and Foundation round (PR #9) entries below should keep [Unreleased] tags or be grouped into release notes -->
### Added
- **Materials board (M1)** (`/materials/`, ENGINE, lazy): `mat-loom` (a weave you can tie up, 40 fps), `mat-knob`, `mat-grille`, `mat-marble` (an engraved clock) and `mat-terrazzo` (a month of chips), all lit by the light hub. `src/engine/matter/` (not in the engine barrel): relief and AO, Kajiya–Kay anisotropic sheen, matcaps, weave drafts and relief, stitches, marble and terrazzo. `Control.map` (opt-in) maps a pointer straight to a value, so a tap on the knob's arc sets it. Checks: `scripts/materials.ts` (52), `scripts/materials-browser.ts`; goldens: 5 added.
- **Pond board (L1)** (`/pond/`, PLAY): `pond-koi` at 30 fps. `src/engine/life/` (lazy, under the determinism lint): wave-equation water, dot micro-glyph tiles, koi spines, bodies and Reynolds steering, the koi pond world. Hover or touch forks a live world (a tap or click drops pellets, a hold lures), which heals back to the pristine loop when idle. Main thread only: the worker build stubs the board. Doc: `docs/LIFE.md`. Checks: `scripts/life.ts` in verify (46), `scripts/life-browser.ts`.
- **Squares board (Q1)** (`/squares/`, ENGINE): `sq-tetris` (pieces that fuse), `sq-quads` (a face in 1,201 quads), `sq-blob` (terraced metaballs) and `sq-gameboy` (a four-shade LCD clock). `src/engine/squares/`: join masks, joined-cell geometry, the sampler's join pass and `{grid.gap}`, Canvas / SVG / WebGL join renderers behind hooks (`sampler/ext.ts`, `renderer/ext.ts`). Checks: `scripts/squares.ts` in verify, `scripts/squares-browser.ts`; goldens: 4 added.
- **Editing on canvas (E3):** handles for a sites ring's radius and sweep (whole cells, the sweep ends on a dot), a disc's radius and a line's ends; spec layers move in whole cells and an IR field's bounds resize from four corners; text typed in place in the frame's own dots (one undo step, Esc cancels); a quick bar over the selection (TONE, LATTICE − / +, SIZE, EDIT, INK, PICK); the eyedropper (I, PICK, Alt-click).
- `scripts/site/shots.ts` (`pnpm shots`): screenshots of every page and UI state in every theme, with a contact sheet; pond, squares and materials included.
- `docs/POLISH-PLAN.md`: the site audit and the polish phases P0–P3, queued after round 2.
### Changed
- **Card size (PR #50):** 3 big cards a row again by default at 1440 (restoring impact from T3's 5-card grid); CARD SIZE option (large / medium / compact) in the THEME popover, TOOLS sheet and ⌘K palette (`html[data-cards]` `l` / `m` / `s`, stored in `localStorage` `dot480:cards`, set before first paint by the boot script); track minimum clamp with `--board-cols-max` (large 3, medium 4, compact uncapped; dense boards +1) and `--board-cols-min` (2 on phones at compact); orphan container queries keyed by size.
- **Sample worker trim:** the worker imported every board; it now loads only the requesting card's board chunk, once per page. Worker initial load 178.31 → 17.14 kB gz; first load unchanged. `size.ts --worker` reports each board's chunks and fails if the squares joint code or the pond's tiles reach a worker chunk.
- **Essay, `/privacy`, `/terms` and the X-ray follow the theme:** the same no-flash boot script (one CSP hash for all four pages), the app's links there carry the theme along, essay figures read the theme tokens (photo and camera figures stay dark insets on paper), X-ray guides use the scheme's tint. `theme.ts --check` holds the essay and legal text to 4.5:1 in all 14 themes.
- **Board grids (T3):** density per board (hero, standard, dense) drives auto-fill grids; square cards capped at 62svh; centred orphan rows; a one-line intro on phones, and ALL scrolls with the group strip.
- **VFD and LED skins take the theme's accent** (the accent stays exact); Nixie and CRT keep their own colours.
- **Materials cold first frames 2–4× cheaper** (pixel-identical, all 187 goldens match): the bakes do less work, in small per-row helpers.
- LOG: public release 0.12 ("Materials, pond and squares") in `src/changelog.ts`.
### Fixed
- Round-2 integration: the card spec carries `style.gap` and a JSON `join` (cards with `shapeOf` or a function join are refused with that reason); the X-ray probe applies the gap clamp; the golden key check keeps the legacy prefix; the fps check reads DESIGN.md's table; a stale `dist/` is reported, not judged; every CDP call has a timeout and `life-browser` has a watchdog; load factors are sampled next to the timed code.
- The phone editor went blank (its scroll lock shared the lock button's class).
- PR #11: the desktop editor re-measures its height when the site bar grows after mount (the lazy tool dock), so it no longer runs 11 px past the window.

## [Unreleased] · 2026-10-29 · T6 type, contrast and the custom hue (round 2)
Plan: `docs/LAYOUT-THEME-PLAN.md` §1c #3 and #15, §4 Custom hue, §5 T6. Status: `docs/PROGRESS.md`.
### Added
- **Custom hue** (`src/site/theme/custom.ts`, lazy): an 8th THEME swatch opens a hue slider over 36 generated dots. The browser runs the same generator as the presets; chroma and lightness come from the neighbouring presets and are clamped by the rules, so every hue (swept 0–359 × 2 schemes in `scripts/site/theme.ts`) passes them. The CSS is stored with the choice and replayed by the boot script (no flash).
- **`prefers-contrast: more`:** per theme, label, mute and accent text at ≥ 7:1, the glyph grey at ≥ 4.5:1, hairlines twice as strong, opaque raised layers.
- **Names in dot type** (`src/components/DotName.tsx`): board names and the widget page's card name are drawn by the engine through `textAt` and `DotCanvas`, wrapped to their box; the subtitle after the `—` stays a mono label.
- Probes: the layout probe now fails a page with ≥ 10% of its chrome characters under 12 px; `theme-boot.ts` checks a stored custom hue paints before first paint and the contrast-more roles; `theme-picker.ts` checks the custom swatch and slider on desktop and in the phone sheet.
### Changed
- **No contrast waivers:** `--mute` `#6E7278` → `#81858B` (≥ 4.5:1 on every surface), `--dim` is now a non-text glyph grey (`#65696F`, ≥ 3:1), `dark_signal`'s `on-red` is the red's dark ink (white was 3.55:1). Accent text is `--red-text` everywhere (21 rules used `--red`, which fails on paper); a check fails any `color:` that is not a text role. Goldens unchanged (none of these is an engine token).
- **Type:** chrome text is 12 px minimum (120 rules lifted; under 12 only in-card text, keycaps, glyph marks and on-canvas badges). Prose (intro, blurbs, About, changelog) is in Oxanium; `text-wrap: balance` on headings, `pretty` on prose.
- **Skins:** e-ink and flip-disc take a light card's paper and ink; the footer's live number is a dark inset under an emissive skin on a light page (it was dark ink on dark glass); the X-ray HUD figures use `--red-text`.
- Boot script 900 → 960 B budget (the custom hue's style).

## [Unreleased] · 2026-10-28 · T5 theme picker and the switch moment (round 2)
Plan: `docs/LAYOUT-THEME-PLAN.md` §4 Picker, §5 T5. Status: `docs/PROGRESS.md`.
### Added
- **THEME popover** next to DISPLAY ▾ (`src/components/theme/`): SYSTEM / LIGHT / DARK, the 7 accents as 7×7 dot swatches, a tone ramp and a live preview (the popover re-scopes itself to the hovered or focused theme). Opens on 100 ms of hover intent or a click; its content is a lazy chunk. Phones get the same controls in TOOLS › THEME (44 px targets).
- **The switch moment** (`src/site/theme/moment.ts`): a view transition whose halftone front spreads from the pressed control (CSS mask fold, `--dur-wipe` 720 ms). Instant under reduced motion or without the API.
- **Share-link opt-in** (`src/site/theme/share.ts`): copied and shared links carry `?theme=` when the visitor turns it on.
- `scripts/site/theme-picker.ts`: the browser probe for all of it (touch sheet and reduced motion included).
### Changed
- ⌘K: the 15 "Theme: dark_signal…" rows became "Theme: system / light / dark", "Accent: <name>" and "Accent: next". The TOOLS LIGHT / DARK tile is gone (TOOLS › THEME replaces it). An explicit pick drops `?theme=` / `?scheme=` / `?accent=` from the address bar.

## [Unreleased] · 2026-10-28 · Foundation round: F0 engine foundation, T0–T4 layout and themes, E1–E2 editor (branch `feat/foundation`)
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

## [Unreleased] · 2026-10-27 · ALGORITHMS board (branch `feat/algorithms`)
Doc: `docs/ALGORITHMS.md`.
### Added
- `src/engine/algo/`: `stipple` (weighted Voronoi stippling, Secord 2002: Lloyd relaxation with a bucket ring search, then a Voronoi-neighbour walk; lazy, cached iterations), `attractorDensity` (Clifford / de Jong log-density histogram; deterministic `dsin` / table `tsin`; a collapse guard that nudges out of periodic windows), `wfc` (simple tiled Wave Function Collapse with AC-3, chronological backtracking, fresh seeds and a scrubbable option history), `dla` (off-lattice diffusion-limited aggregation with circle jumps, a near-distance map and bisected contacts).
- Board `algorithms` (`/algorithms/`, ENGINE group, 2 columns, its own lazy chunk): `algo-stipple` (the moon in 2,400 Lloyd-relaxed stipples), `algo-attractor` (a drifting Clifford attractor), `algo-collapse` (a knot that ties itself, tile by tile), `algo-aggregate` (frost from one grain, with a live fractal-dimension readout). Each card's t = 0 is the finished picture; red marks only the live front.
- `scripts/algorithms.ts` (run by `pnpm verify`): determinism, invariants (stipples on the density, a consistent WFC tiling with a monotone history, non-overlapping DLA discs touching their parents, D in 1.6–1.85, no attractor collapse along the card path) and timing budgets scaled by a measured load factor.
- Goldens: 4 new presets (`algo-*`, t = 0 and t = 1.3); the existing hashes are unchanged.

## [Unreleased] · 2026-10-26 · UX U2–U4, U5 DISPLAY menu, cleanup (branch `feat/ux-u0-u1`)
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

## [Unreleased] · 2026-10-24 · UX U0 + U1 (branch `feat/ux-u0-u1`)
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

## 2026-10-24 · `43eb614` (PR #5): Vercel only
### Added
- **Deploy:** `vercel.json` with the SPA rewrite, the security headers (CSP, `nosniff`, referrer and permissions policies) and caching that the Cloudflare files carried.
- OG URLs fall back to `https://$VERCEL_PROJECT_PRODUCTION_URL` when `SITE_URL` is unset (`scripts/site/postbuild.ts`).
### Changed
- Vercel auto-deploys `main` to production and every PR to a preview; CI only checks and builds.
- `docs/DEPLOY.md`, `docs/WEB-PLAN.md` and `docs/PROGRESS.md` describe the Vercel setup.
### Removed
- The Cloudflare Pages setup: the wrangler deploy job in `.github/workflows/ci.yml`, `public/_headers` and `public/_redirects`.

## 2026-10-23/24 · PR #4 (`feat/p1-complete`), part 3: P5–P6 and the Web plan (W0, C2–C8, C10, lift)
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

## 2026-10-22/23 · PR #4, part 2: P2 interaction, P3 depth + Field IR, P4 living boards
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

## 2026-10-22 · PR #4, part 1: P1 complete, P0 leftovers
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
- Dev: the Vite watcher ignores agent worktrees.

## 2026-10-14 → 10-19 · `fa47cd9`, `4abf78a`, PR #2: motion tests, merge to main
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

## 2026-10-14 · `f748396`, `c8af647`: research, planning, changelog
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
  - **Flagships:** sharper hero boards (Departures, Instrument, Cinema, Levels, Glyph, Agent Heartbeat, Five Surfaces).
  - **Backlog and scope:** a lift backlog for the weakest cards; an explicit cut list.

## 2026-10-13 · `d2bbb22`: rebuild all boards on the 144×144 TILE standard
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

## 2026-08-24 · `6c526fe`: verification script, Draw and Gallery tabs
### Added
- `pnpm verify` (`src/engine/verify-acceptance.ts`): engine acceptance tests.
- A **Draw** tab: a grid drawing canvas, toolbar, reference image panel, Bresenham lines and field export (`src/components/draw/*`, `src/hooks/useDrawBoard.ts`, `src/lib/*`).
- A **Gallery** tab and a playground data editor (per-preset sliders).
- A recorder widget.
### Changed
- Corrected the 3D projection maths in `projection3D.ts` and the engine plan.
- Refined the icon SDF, the halftone, polar, scatter and warped fields, and the sampler.
- Updated `ADVERSARIAL-REVIEW.md` (final pass verdict) and `BLOCK-INVENTORY.md` (widget coverage).

## 2026-08-22 · `278cf24`: Dot/480 engine, widgets and docs
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

## 2026-08-22 · `0e5e97a`: Tailwind and import aliases
### Added
- Tailwind CSS v4 via `@tailwindcss/vite`.
- `@/` path aliases in Vite and TypeScript.

## 2026-08-22 · `8002c2d`: first commit
### Added
- Vite + React + TypeScript scaffold, oxlint config.
- `AGENTS.md` (invariants) and `DESIGN.md` (tokens, colours, typography, components).
