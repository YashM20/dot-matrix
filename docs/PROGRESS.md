# PROGRESS — handoff checklist

> Single source of truth for **what is done, what is in progress, what was skipped and what is next**.
> Update this file in the same commit as the work. Active plans: `docs/WEB-PLAN.md` (what the site does) and `docs/UX-PLAN.md` (how visitors find it); every doc and its status: `docs/README.md`. Original phase plan: `docs/MASTER-PLAN.md` (v2). Research: `docs/MOTION-INTERACTION-DEPTH.md`, `docs/ADVANCED-PLAN.md`. Taste: `docs/STYLE-BIBLE.md`.
> Legend: `[x]` done and verified · `[~]` partly done (see note) · `[ ]` not started · `[-]` skipped or deferred on purpose (reason given)

## Live run state: resume here (updated 2026-10-29)
> The coordinator keeps this block current. Read it after any interruption or compaction, before doing anything else.

**Shipped:** round 2 is on main and live.
- **PR #10:** merge `2b4780e`, branch `feat/round2`.
- **PR #11:** merge `bcacd5a`, the desktop editor re-measures its height, which fixed the marquee; `shots.ts` covers the new boards.
- **Full suite** (`dmdocs/full2.sh`): green except one editor check, which PR #11 fixed.
- **Sizes:** first load 123.49 kB gz; the worker's initial chunk 17.14 kB gz.

**Working branch:** `feat/round3`. It tracks origin and equals main plus nothing new yet. Merge each round-3 agent here; PR to main when the owner says.

**Running agents (round 3):**
- Each runs in `.claude/worktrees/agent-<id>/` on branch `worktree-agent-<id>`.
- Resume one with SendMessage to `<id>`. If its worktree is gone, restart from the brief and its last WIP commit.
- Each keeps a resume note in its latest WIP commit message.

| id | task | spec | owns | preview port |
|---|---|---|---|---|
| `a8dfb81136182c15c` | **L2 ecosystems**: physarum/ants, fireflies, space colonisation; jelly, slime, fireflies, murmuration, terrarium cards | `docs/living-matter/L-pond.md` §L2 | `src/engine/life/`, the pond board, `scripts/life*.ts` | 4385 |
| `a9dfd85cca3ece366` | **Q2 squares**: lcd and grout skins, rect cells, teletext sextants, line screens | `docs/living-matter/Q-squares.md` Q2 | `src/engine/squares/`, the squares board, `scripts/squares*.ts` | 4386 |
| `a4b5a283f78296248` | **M2 glass and water**: glass v2, caustics; Lens, Pool, Window, Patch, Rust, the candle clock | `docs/living-matter/M-materials.md` M2 | `src/engine/matter/`, the materials board, `scripts/materials*.ts` | 4391 |
| `ae843d4fcd441b7d8` | **E5 share**: frame/document links, remix lineage, device exports, the QUALITY fold | `docs/EDITOR-PLAN.md` §10 E5 | `src/components/editor/` | 4383/4384 |
| `a144235843227f454` | **Round-2 housekeeping** (listed below) | this block | the changelogs, `docs/README.md`, the test scripts named in the list | 4389/4390 |

The housekeeping list:
- CHANGELOG and `src/changelog.ts` rows for round 2;
- the `shots.ts` phone palette NOT READY bug;
- an "editor fits the window" probe check;
- the pond swipe flake;
- the marble cold-frame options (investigate only);
- `docs/README.md` statuses.

**Next, in order** (each starts when an agent above frees a slot):
- **Within each track, phases are sequential:** Q3 after Q2, M3 after M2, L3 after L2.
- **Editor:** E6 phone polish after E5.
- **Then:** the X phases.
- **The polish plan** (`docs/POLISH-PLAN.md`) waits until the owner says to start. When it starts: P0 probes first (one agent), then P1 (four agents). The owner has answered:
  - the desktop header hides on scroll down;
  - all 14 cuts are approved;
  - the other recommendations are accepted;
  - the essay's name and URL are **still open**.

**How the coordinator runs agents:**
- **Agent count:** at most 4 at a time; the owner allows 2–3 extra quick ones. Each agent runs in its own worktree.
- **Commits:** no Co-Authored-By or "Generated with Claude Code" lines, ever. Commit or push only when the owner asks; the owner has said to merge to main via a PR when asked ("merge push").
- **Heavy work:** every build, golden run, timing run and browser probe goes through `node C:/Users/integrated/AppData/Local/Temp/dmdocs/heavy.mjs "<cmd>"`.
  - It is a FIFO ticket queue in `dm-heavy-queue/`, with a v2 lock that refreshes a heartbeat every 5 s and goes stale after 45 s.
  - A command is killed after `HEAVY_TIMEOUT_MIN` (default 40).
  - Timing checks sample load next to the timed code (`scripts/lib/load.ts`).
- **Worktree setup:** `cmd /c mklink /J node_modules D:\MyRepo\nextjs\dot-matrix\node_modules`.
- **Worktree cleanup:**
  1. Delete the junction with `[System.IO.Directory]::Delete(path, $false)`; never recursive.
  2. `git worktree unlock`.
  3. `git worktree remove --force`.
  4. `git branch -D worktree-agent-<id>`.
- **Merging an agent:** `git merge --no-ff`. The usual conflicts are additive unions: `manifest.ts` (board rows plus `density`, the group lists), `index.ts`, `ids.json`, `goldens/hashes.json` (merge the JSON with a script), `catalog.ts`, `meta.ts`, `blurbs.ts`, `verify.ts` blocks, and DESIGN.md tables. Then run `npx tsc -b` and the area checks.
- **Full suite before a PR to main:** `bash C:/Users/integrated/AppData/Local/Temp/dmdocs/full2.sh` through heavy.mjs.
  - It runs the build first, then `pnpm check`, goldens, parity, size, theme, CSS tokens and WebGL.
  - It then starts previews on 4317 and 4318 and runs the mobile, light, editor, layout, theme-boot, picker, squares, life and materials probes.
  - Logs and the summary go to `dmdocs/full-r2/`.
- **Screenshots:** `npx tsx scripts/site/shots.ts --pages … --themes … --sizes 1440,390 --out <dir>`. The round-2 shots are in `dmdocs/r2shots/`.
- **Rate limits and restarts:** resume each agent by SendMessage after the reset. Clear dead locks if the holder PID is gone.

**Open owner decisions:**
- the essay's name and URL;
- koi body style B (the default) or A;
- `activeDim` (unruled; every card uses size contrast);
- the pond's 288 KB memory exception;
- whether VFD on the default theme turns red (it follows the accent) or stays cyan-green;
- the ruled grid (built, off);
- `dark_signal` accent text: salmon `#FFA193` now, or `#FF6856` if APCA is relaxed;
- the first-load overages Q1 +0.92 and T6 +1.28 (both accepted for now);
- the real-iPhone tilt checklist.

**Round 2 (done; merged as PR #10):** the T3, T5, T6, E3, M1, L1 and Q1 entries below are kept as the as-built record; read "not merged" in them as merged.

## Status board (updated 2026-10-27)
- [x] **E3 editor: editing on canvas** (branch `worktree-agent-a603245a37988c6ee`, on `feat/round2` 0741d3b; `docs/EDITOR-PLAN.md` §4.2, §8.3). Not merged.
  - Sites handles: a ring's radius and sweep (the sweep snaps to the ring's own sites, so an arc ends on a dot of its track), a disc's radius, a line's ends; whole cells.
  - Spec layers: placed ones (sites, text, generators, IR fields with `bounds`) move in whole cells; an IR field's box is its declared bounds, resized by four corners; DESIGN · PLACE edits them and the spec JSON follows.
  - Text typed in place (double-click, Enter, a tap on the selected text, the Text tool): one invisible input, the letters are the frame's own dots through `textAt` / `T.big`, a caret drawn in the glyph gaps; one session = one undo step, Esc cancels, an emptied text goes. On a phone the text pans above the keyboard.
  - The quick bar over the selected layer: TONE, LATTICE − / + (spec text / bounds rescaled to stay put), SIZE for sites, EDIT / DONE, INK and PICK; one undo step each; 44 px on phones, above the selection bar.
  - The eyedropper: I, PICK, Alt-click while drawing; rounds onto the INK ladder; never paints.
  - Checks: editor Node 125 (95 + 30 E3 in `editorE3Checks`, in verify); browser probe desktop 76/76 and phone 45/45 (E3: 14 desktop, 8 phone); goldens 182/182; first-load JS 120.41 → 120.41 kB gz (Δ +0.00, against a build of 0741d3b); CSS token lint clean.
  - Left for later: an arc start handle (START ° is in DESIGN), handles for generator params and raster windows, word selection on double-click, multi-line text.
- **Queued next:** M1 materials, T5 theme picker, E3 editor, T6 type and contrast (T6 done, below). Then L2, Q2, M2, Q3, M3, L3 and X.
- **Queued after round 2:** `docs/POLISH-PLAN.md`, the site polish. It starts with P0 probes, then P1 (broken: the essay route, sticky header, widget-page chrome, Back with sheets), P2 (ugly) and P3 (nits). Owner decisions are in its §3.
- [x] **T6 type, contrast, more** (branch `worktree-agent-a5cf9c4ead82b0da0`, on `feat/round2` 4b60ecf; not merged; docs/LAYOUT-THEME-PLAN.md §5 T6):
  - **Contrast, no waivers:** `--mute` `#6E7278` → `#81858B`; `--dim` is a non-text glyph grey (`#65696F`, ≥ 3:1; the editor's 4 text uses moved to `--mute`); `dark_signal`'s `on-red` is generated (dark ink `#321A16`; white was 3.55:1); 21 `color: var(--red)` rules → `--red-text` (red fails 4.5:1 on paper), the X-ray HUD badge included. `theme.ts --check` gained: dot-idle as a text role, dim ≥ 3:1, a CSS scan that every `color:` is a text role, the contrast-more roles, and a sweep of all 360 custom hues × 2 schemes (gamut, text, dots, lines, colour-blind, tone order). No goldens moved (none is an engine token).
  - **`prefers-contrast: more`:** a generated `@media` block per theme in themes.css (label, mute, red-text ≥ 7:1, dim ≥ 4.5:1, hairline alpha ×2) and the materials in tokens.css (stronger dotted rules, opaque raised layers).
  - **Custom hue:** an 8th swatch in THEME and TOOLS › THEME opens a hue slider (native range over 36 generated dots). `src/site/theme/custom.ts` (lazy, 4.3 kB gz with the generator: the plan's ≈ 1 kB was the slider alone) runs `accents.ts` in the browser; `specForHue` interpolates C and L between neighbouring presets, and `pickSolid` now also searches ±.3 in L and lower chroma (needed for a few light pink-reds under protanopia; presets unchanged). The store keeps `{accent: "custom", hue, css}`; the boot script writes the CSS into `<style id="theme-custom">` before first paint (boot 900 → 960 B budget, 934 B). Custom share links carry `?scheme=` only.
  - **Type:** 12 px chrome minimum (120 rules lifted to `--fs-label-12`; under 12 px only in-card text, keycaps, glyph marks, on-canvas badges); prose (intro, blurbs, About lede, changelog) in Oxanium; `text-wrap: balance` / `pretty`; board names and the widget page's card name in engine dot type (`src/components/DotName.tsx`, `textAt` through `DotCanvas`, word-wrapped to the box; the subtitle after "—" stays a mono label).
  - **Skins:** e-ink and flip-disc take a light card's paper and ink (`SkinOverlay` → `StageOptions.colors`; dark cards keep `STAGE_COLORS`); the footer's live number is a dark inset under an emissive skin on a light page.
  - **Checks:** `npx tsc -b` and oxlint clean on the changed files; `css-tokens.ts` 0 raw literals; `theme.ts --check` 30/30 on a fresh build; `theme-boot.ts` all passed (custom hue no-flash and contrast-more cases added); `theme-picker.ts` all passed (custom swatch, slider, reload, phone sheet added; 12 touch targets ≥ 44 px); `layout.ts` all passed with the new < 10% gate (chrome under 12 px: 0–1% on boards, 4% on MAKE, 0% elsewhere); `mobile.ts` all passed; goldens 187/187 unchanged.
  - **Size:** first-load JS 122.19 → 123.47 kB gz (+1.28: the dot names on the board heading, the custom-aware store and the stage tones); first-load CSS 17.08 → 17.53 kB gz (+0.45: the contrast-more blocks). Lazy: `custom` 4.3 kB gz.
  - **Screenshots** for the owner's taste pass: `C:/Users/integrated/AppData/Local/Temp/dmdocs/t6shots/index.html` (dark_signal, light_signal, dark_vite, light_cobalt; 108 shots). The 4 phone `palette` shots are marked NOT READY by `shots.ts` (the sheet opens, but focus is not in its input on touch) though the captures look right.
  - **Taste decisions for the owner:** accent text in `dark_signal` is now the generated `#FFA193` (salmon) instead of `#FF3B30` (which passes WCAG 4.72:1 on `raised` but only APCA Lc 40; a pin like `#FF6856`, 5.87:1, Lc 47, would keep it redder if the owner prefers and the APCA rule is relaxed); dark ink on the red fill; the dot-name size (pitch 3 board, pitch 4 card, dots 84% of the pitch); Oxanium for prose at 14 px; keycaps kept at 9 px.
  - **Left:** a CONTRAST: MORE toggle in the picker (only the OS setting is honoured now); `?hue=` links for custom themes; names in dot type on the About and essay headings (only board and card names now).
- [x] **T5 picker and moment** (branch `worktree-agent-a70c72cff7bd3964e`, 1 commit, not merged; docs/LAYOUT-THEME-PLAN.md §4 Picker, §5 T5):
  - THEME next to DISPLAY ▾ (`src/components/theme/ThemeButton.tsx`, first load): 100 ms hover intent (it warms the chunk), click / ArrowDown pins it with focus inside; the popover (`ThemePicker.tsx` + `picker.css`, lazy) has SYSTEM / LIGHT / DARK, the 7 accents as 7×7 dot swatches (listbox, arrow roving), a tone ramp, and the share-link switch. Live preview: the popover re-scopes itself (`data-scheme` + `data-accent`) to the hovered or focused choice. Phones: TOOLS › THEME, the same controls at 44 px (the LIGHT / DARK tile is gone).
  - The switch moment (`src/site/theme/moment.ts`): a view transition with a halftone mask front from the pressed control (`mask-composite` fold of disc and dot layers, `--dur-wipe` 720 ms, `pointer-events: none` on the overlay). Instant under reduced motion (OS or the ⌘K override), without the API, or in a hidden tab. A pick drops `?theme=` / `?scheme=` / `?accent=` from the URL.
  - ⌘K (C1 of docs/POLISH-PLAN.md, approved): "Theme: system / light / dark", "Accent: <name>" ×7 and "Accent: next" replace the 15 raw rows.
  - Share links (`src/site/theme/share.ts`, opt-in, off by default): ⌘K copy link, the card LINK, TOOLS › SHARE and the widget page's LINK / SHORT / SHARE add `?theme=<resolved>`.
  - Checks: `scripts/site/theme-picker.ts` (new browser probe, desktop + touch sheet + reduced motion; 43/43, twice in a row on the final build; captures in `.snapshots/t5/`); `theme.ts --check` and `theme-boot.ts` pass; goldens 182/182 unchanged; CSS token lint clean.
  - Size: first-load JS +0.55 kB gz (120.41 → 120.95; the THEME button), first-load CSS +0.35 kB gz (the button and the wipe); the popover is a lazy chunk of 3.28 kB JS + 0.89 kB CSS gz.
  - Header: THEME measures nothing and lives in the header's flow, so the later hide-on-scroll header (POLISH P1) needs no change here.
  - Learned: a view transition moves hit-testing off the page, which reads as the mouse leaving a hover-opened popover; THEME waits for the wipe to end and re-hit-tests (`elementFromPoint`) before closing. Headless screenshots only show a wipe frame when the animation is paused (the probe holds it).
  - Left: the custom hue swatch (T6); the essay and legal pages have no picker (they follow the stored choice).

**Foundation run (2026-10-27, branch `feat/foundation`):** the shared foundation of `docs/LIVING-MATTER-PLAN.md` (F0) and `docs/LAYOUT-THEME-PLAN.md` (T0), done in two phases of two parallel agents each. Priority: F0 first, because it unblocks the L, Q and M tracks and cuts first-load JS (148.14 of 150 kB) before the tracks and the theme spend it. Then T0, which unblocks T1–T6.
- **Phase 1:** F1-A noise (F0.1–F0.4 and the determinism lint of F0.9); F1-B pixels and budget (F0.5, F0.6, F0.10, F0.11). Merge order: B, then A, then the full suite (the F0.9 join).
- **Phase 2:** F2-C light hub (F0.7, F0.8, which needs `datan2` from phase 1); F2-D T0 tokens and cleanup. Then the full suite again.
- **Machine budget** (2 cores, 4 threads, 16 GB): worktrees share `node_modules` through a junction; heavy commands (`vite build`, `pnpm golden`, browser probes, `pnpm check`) take a machine-wide lock so only one runs at a time. The owner later raised the run to six parallel agents.
- **Merged so far:**
  - [x] **F0.5 golden key.** `scripts/lib/goldenKey.ts` adds optional channels `,s<shape>:<r>`, `,j<mask>:<hx>:<hy>:<ro>:<ri>:<seam>`, `,θ<rad>`, `,a<aspect>` and `,m<motif>` after `legacyKey`. Every entry stores `style`; the one-time backfill is done, so later golden diffs read "0 changed, N added".
  - [x] **F0.6 square cover.** `hides()` in `src/engine/sampler/cover.ts` is the one cover rule. Rotated non-circles reach R·√2, so Q1 must widen the scan box when it passes `rot`.
  - [x] **F0.10 per-card fps.** Added `WidgetPreset.fps` and `src/widgets/fps.ts`; the phone tier halves the rate, min 12. Note: any machine with 4 or fewer cores counts as a phone.
  - [x] **F0.11 first-load cut: 148.14 → 123.99 kB gz.** First-load code imported the `src/engine` barrel by value; it now imports by path. `size.ts --check` guards against the IR parser returning to first load. It also gained `--worker` and delta gates.
  - [x] **F0.7–F0.8 light and tilt hub.**
    - `src/site/light.ts` and `src/engine/light/input.ts`, the TILT button in TOOLS, and the physics board on the hub.
    - Tests: `scripts/light.ts` 16/16; `scripts/light-browser.ts` 9/9.
    - The two `Math.atan2` calls in `bucketLight` become `datan2` when F0.1 merges.
    - Real-iPhone checklist (Safari over HTTPS):
      - the permission prompt appears once;
      - rolling the phone tips the PIT and INK cards;
      - upright, the cards heal back onto their loop;
      - a reload doesn't re-prompt;
      - a Safari restart re-asks;
      - vertical swipes still scroll;
      - with Reduce Motion on, tilt doesn't start by itself.
  - [x] **E1 editor tests and cleanup.**
    - `scripts/editor.ts` (56 checks) runs in verify; `scripts/editor-browser.ts` passes 66/66 (desktop and touch).
    - 22 old MAKE files are deleted (−2,264 lines). `studio/doc.ts`, `adapter.ts` and `playback.ts` stay, since the editor uses them.
    - [x] Dead probes (round-2 cleanup): `scripts/export-chrome.ts` deleted (it drove the removed `.pg-export` panel); `scripts/c10-browser.ts` passes 50/50 on `vite preview` as it is (`.dw-code textarea` is the editor's CODE inspector now). `dwitter/DotsRepl.tsx` and `RemixGraph.tsx` deleted too (RemixGraph is restorable for E5, see `docs/EDITOR-PLAN.md`).
  - [x] **T0 tokens.**
    - `src/tokens.css` is the one token block, and the `scripts/site/css-tokens.ts` lint finds 0 raw literals.
    - The starter, shadcn and old-MAKE CSS is deleted: first-load CSS went 16.68 → 12.54 kB gz.
    - [x] The lint runs in CI (round-2 cleanup), and `scripts/site/theme.ts --check` runs again after the build, so the `dist/index.html` boot-script check is gated too.
  - [x] **T1 chrome design language.**
    - Applied: surfaces, dotted hairlines, one glow, four states with a lint, glass for raised layers only, grouped tooltips with dot keycaps, hover intent, scroll-snap sheets, card radius 12.
    - Not yet done: the sticky ALL pill still covers the first group tab on phones (T3).
  - [x] **T4a theme engine.**
    - `src/site/theme/` holds the OKLCH generator, the 14-theme table, the store, and a no-flash boot script with its CSP hash in `vercel.json`. Checks: `scripts/site/theme.ts` 22/22 and `scripts/site/theme-boot.ts` 14/14.
    - Two `dark_signal` contrast waivers are left for T6: text-3 at 3.85:1, and white on `#FF3B30` at 3.55:1.
  - [x] **F0.1–F0.4 noise toolkit and the F0.9 determinism lint.**
    - What landed: `src/engine/noise/` (dmath, gradient, Voronoi, curl) and the IR noise pack, registered through the zero-byte fallback hook.
    - Checks:
      - `scripts/noise.ts` 32/32;
      - a Bun/JSC snapshot matches Node;
      - GPU parity max |Δ| 4e-6 with 0 flips;
      - first load +0.03 kB gz.
    - `bucketLight` now uses `datan2`.
    - The Voronoi time budget flakes when other heavy work runs at the same time.
  - [x] **T4b themes wired.**
    - What it covers: all 14 themes drive the CSS, the cards, the widget page, the editor chrome and exports.
    - Defaults: the default is `system`. OG images and goldens stay `dark_signal`, and editor frames keep `dot480`.
    - Checks: `golden --theme-parity` (14 × 177 only recolour) and `theme-boot.ts` 29/29.
    - Size: first load −4.4 kB gz, because the unused playground store went and the widget registry and home board left first load.
    - For T5 (done, see T5 below): the palette's "Theme: …" commands and the TOOLS LIGHT/DARK row were placeholders.
    - For T6: the two `dark_signal` contrast waivers, `--dim`, and the skin stage colours.
  - [x] **T2 frame and rhythm.**
    - What it covers:
      - one left edge and a three-step rhythm;
      - About and the widget page inside the frame;
      - the dock moved into the top bar;
      - a footer band with a live dots-drawn count;
      - the touchable hero card (drop, paste or pick an image; it stays on the device);
      - figure legends;
      - `scripts/site/layout.ts` at six widths.
    - Size: first load +0.29 kB gz.
    - For T3: density-driven auto-fill grids, at least 6 cards above the fold at 1440, the phone header at ≤ 120 px, and the ALL pill.
  - [x] **E2 editor selection.**
    - Selection: multi-select and marquee, groups, locks, align and distribute, and smart guides.
    - Clipboard: copy, cut, paste and duplicate, across tabs and through the system clipboard; Alt-drag moves a copy.
    - Phone: a SELECT bar.
    - Doc v2, with v1 migration.
    - Checks: editor Node 95, browser probe 99.
- **Full suite on `feat/foundation` (2026-10-28): all green.**
  - `pnpm check`;
  - goldens 177/177 and theme parity;
  - first-load JS **120.07 kB gz**, down from 148.14 at the start of the run;
  - theme and CSS lints;
  - `webgl.ts`, `site/mobile.ts`, `light-browser.ts`, `editor-browser.ts`, `site/layout.ts`, `theme-boot.ts`.
  - The mobile and layout probes need a running `vite preview` (ports 4317 and 4318).
- **Next, waiting for the owner:** Q1 squares, L1 pond and M1 materials (all unblocked by F0); T3 grids; T5 picker; E3.
- [~] **M1 materials** (branch `worktree-agent-add27cae4d261d877`, docs/living-matter/M-materials.md §3). Not merged; it waits for its integration-queue slot (L1 → Q1 → M1).
  - Engine (M1.1–M1.5): `src/engine/matter/` (not in the engine barrel) holds relief + AO (blur and horizon), `rake` and `cardMask`; Kajiya–Kay `anisoSpec` with four tangent builders; `matcap` (64² LUT, rotate / tilt, `studioMatcap` ≡ `metal().env` bit for bit); weave drawdowns, drafts and `weaveRelief`; stitches and `contour`; `marble` and `terrazzo`.
  - Board `/materials/` in ENGINE, lazy, `sources: [lightSource]`: `mat-loom` (fps 40), `mat-knob`, `mat-grille`, `mat-marble`, `mat-terrazzo`. Every card declares the light-hub keys. `matLight` is a thin wrapper over `sceneLight`.
  - **`activeDim`: no owner ruling**, so the plan's default applies: it is not part of the one accent and no M card uses it. The Loom's trail is size contrast inside its one `active` layer. This is checked.
  - Engine addition: `Control.map` (`(x, y, value) => value`), an absolute pointer → value mapping for drag controls. The knob passes its dial function (`knobDial`, in the lazy board), so a tap on the arc sets v. It is opt-in, and existing controls are unchanged.
  - Checks:
    - `scripts/materials.ts`: 52 checks.
    - `scripts/materials-browser.ts` (M1.12): 11/11 on `vite preview` :4391, at 375×812 touch and 1280 desktop.
    - Goldens: 5 added, then all 182 match after the grille change.
  - Size, measured against a fresh build of the merge-base `dbe4716`, so there is no drift:
    - first load 120.07 → 120.24 kB gz (+0.18; the ledger row was +0.06):
      - +0.10 the manifest row and its ENGINE group slot;
      - +0.04 Vite's preload-map entry for the new lazy chunk;
      - +0.03 `Control.map` in the first-load interaction code.
    - `sampleWorker` 156.56 → 168.73 kB gz (+12.18). The worker imports the eager registry, so the board and `matter/` ship in it. Keeping them out of the worker is open (F0 §7 R13).
  - Frame budget. `--bench` at normal priority with the heavy lock held (no other heavy job), two runs, load factor 1.62 / 1.81. Raw ms, warm / hover (median of 13):

    | card | run 1 | run 2 | cold (ms) |
    |---|---|---|---|
    | loom | 4.85 / 6.82 | 4.60 / 4.42 | 53–79 |
    | knob | 2.01 / 1.59 | 1.70 / 2.11 | 18–28 |
    | grille | 3.22 / 4.79 | 3.66 / 4.57 | 55–84 |
    | marble | 3.52 / 5.20 | 2.83 / 2.19 | 54–66 |
    | terrazzo | 2.25 / 2.63 | 3.06 / 4.67 | 68–132 |

    - Grille: the plate shading is now cached per light (LRU of 8, M §3.2's mitigation), so the sun and tilt buckets don't re-shade. Warm is 3.2–3.7 ms raw.
    - The ≤ 4 ms × load gate passed in run 2 and failed in run 1 (Loom and Marble hover).
    - **Cold first frames are still over 30 ms × load**, except the knob. The bakes (relief, EDT, AO, marble turbulence, the terrazzo month) run on the first frame. Still to do: split the bakes, or warm them in idle time.
    - **Cold-frame pass (round 2, pixel-identical: all 187 goldens match).** In the check's cold module even the engine helpers are barely warm, so the first frame runs mostly interpreted and its cost is the work it does. The bakes now do much less, and their per-cell loops sit in small per-row helpers that reach compiled code inside that one frame:
      - terrazzo: each day's chip is laid over its own box instead of testing 31 days per cell; the keep-out is a 3×3 row helper over the chips' box; Poisson uses a typed grid, nearest cells first, and d² with an exact `hypot` fallback at the edge;
      - grille: the hole distance is stamped round each hole (exact d² < 16, ≡ the EDT) instead of a hole raster and two full-grid EDTs; `heightFromField` takes the baked raster and visits only the mask's window;
      - marble: `cardMask`, `toLattice15`, the colon and its clearing visit only their bounds;
      - loom: per-row woven runs, and the bare-warp relief is skipped while the shuttle is parked (t = 0);
      - knob: the SDF is rasterized once for both profiles;
      - every card: `surfaceLayer` / `tonedLayer` moved to `engine/matter/surface.ts`; the VU caches its per-beat hash.
    - Cold first frame, ms ÷ load, from `--only board --bench` with the heavy lock held at normal priority. Before: 3 runs at load 2.4–4.7. After: 4 runs at load 1.3–2.5, the box being quieter by then.

      | card | before | after |
      |---|---|---|
      | loom | 27–89 | 8–18 |
      | knob | 8–19 | 6–14 |
      | grille | 50–124 | 12–24 |
      | marble | 39–111 | 13–31 |
      | terrazzo | 65–97 | 17–21 |

      The check passed in 3 of the 4 after-runs; the failing run had marble at 30.9. Warm frames are 0.9–3.1 ms ÷ load, loom 1.7–2.9. First-load code is unchanged: `raster/ops.ts` was left alone because it ships in first load. The +0.01 kB gz that `size.ts --against` reports is lazy-chunk hash names inside `main` / `manifest` / `useTheme`; the bytes are identical apart from those names.
    - The marble rebake is 11–18 ms (the budget is 10 ms × load).
  - Deviations from the M doc:
    - The tie-up toggle redraws the whole panel, because card data carries no edit time, so "only picks ≥ the current one" can't be pure.
    - The marble hero is on lattice 2, not 2.5: smooth `00:00` is 58 dots wide, so 2.5 would overrun the card.
    - The year is drawn as void letters rather than a lit groove, because 1-dot grooves don't read.
    - The matcap LUT agreement is ≥ 97% at 64² (99.3% at 256²), not the plan's 99% at 64².
    - Terrazzo: a tap selects a day through an `xy` control and stays until the next tap, instead of a 3 s preview, which would need time state.
  - Still to do: cold bakes ≤ 30 ms with margin (marble is borderline under load: its engraving still runs two full EDTs and two text masks); the worker chunk; the `pnpm snap` taste pass beside the reference cards; the CHANGELOG / `src/changelog.ts` rows at integration.

**Resume here (2026-10-27):** branch `feat/native-editor-share` merges six parallel tracks on top of `main` (3a1775c, UX U0–U5 slice):
- **Phone shell** (`src/site/mobile.css`, `BoardSheet`, `Sheet`, `useSwipeDown`, `site/layer.ts`): bottom tab bar EXPLORE / MAKE / ABOUT / TOOLS, sticky title bar that opens a boards sheet, thumb strips, swipe-down sheets, touch palette (no autofocus, boards first), 16 px fields on coarse pointers, safe areas, short-landscape layout, installable PWA (`public/manifest.webmanifest`, dot-field icons).
- **Touch policy** (`src/engine/interaction/gesture.ts`, `useControlInput`, `touch.css`; `docs/UX-PLAN.md` §10): cards are scroll-first; tap controls act on lift, drag controls on a horizontal drag or a 300 ms hold; physics cards are `gesture: 'surface'`; X-ray is a swipeable bottom sheet.
- **One editor replaces the four MAKE tabs** (`src/components/editor/`, `docs/EDITOR-PLAN.md`): Figma-like frames on an infinite canvas, LAYERS / ASSETS, DESIGN / ANIMATE / CODE / EXPORT inspector, tools V H F B T C, undo; full-screen with a floating dock and bottom sheets on phones. Old `?make=` / `?tab=` links open it on the matching tool. The old screens (Studio, DotsRepl, DrawBoard, playground panels) are unused and due for deletion (E1).
- **Share S0–S1 (+ most of S2)** (`docs/SHARE-PLAN.md`): permanent 8-char uids (`src/widgets/ids.json`, `scripts/widgets/ids.ts --assign` after adding widgets), `WidgetMeta` for every widget, `/widget/<slug>/`, `/widget/<uid>/`, `/<uid>`, the single-widget page with pill bars, crawler pages + `dist/widgets.json`.
- **Algorithms board** (`src/engine/algo/`, `docs/ALGORITHMS.md`): weighted Voronoi stippling, Clifford attractor, Wave Function Collapse, off-lattice DLA. 177 presets, 26 boards.
- **Privacy / Terms** (`privacy.html`, `terms.html`, `/privacy`, `/terms`).
Next, ranked (research notes in this session's roadmap): E1 delete the old MAKE screens; E2 multi-select / groups / copy-paste; optimal-transport dot migration; Flow-Lenia; ambient mode + daily card; Android Back closing sheets; first-load JS is 148 kB of 150, so the next first-load addition needs a cut first.

**Where we are (2026-10-24):** everything is merged into `feat/p1-complete` — P0–P6 agent work (P6-D Studio, P6-F essay included) and the Web plan tracks W0, C2–C8, C10 and the craft lift. 173 presets, 25 boards. Direction: personal website (`docs/WEB-PLAN.md`). Not started from the Web plan: C1 (WebGPU compute) and C9 (multiplayer). All agent worktrees are merged and removed.
`main` = `82778a4` (PR #4: P1–P6 and the web plan; PR #5: Vercel only). UX U0–U4 + the U5 DISPLAY slice are on branch `feat/ux-u0-u1` (pushed, not merged).

| Phase | Plan | Done | State |
|---|---|---|---|
| P0 Foundations, determinism, fidelity harness | 2 wk | 22 / 28 items · 2 / 5 gates | 🟡 3 items waiting on the user; mosaic perf borderline |
| P1 Motion, states, choreography | 2.5 wk | visible items done (P1-A..F) | 🟢 Needs browser checks + Departures taste pass |
| P2 Interaction + Components v2 | 3 wk | P2-A..J done | 🟢 Instrument taste pass + `--mute` contrast decision left |
| P3 Depth, light, material, Field IR | 3 wk | P3-A..G done | 🟢 Taste passes (Cinema, Levels, light) + exit gates left |
| P4 Hero transitions, simulation, agents, live data | 3 wk | P4-A..G done | 🟢 Taste passes, real-host MCP test, 60 s Glyph recording gate left |
| P5 GPU, devices, display physics | 3 wk | P5-A..E merged | 🟢 Real hardware, HVS-SSIM and the 100k CPU-dots gate left |
| P6 Authoring + ecosystem | 4 wk | P6-A..F merged | 🟢 Publishing dropped (personal site); essay to become the front page |
| UX U0–U6 (`docs/UX-PLAN.md`) | about 2 wk | U0–U4 done, U5 partly | 🟢 On `feat/ux-u0-u1`. Next: the rest of U5, then U6. Taste decisions in UX-PLAN §7 |
| Share / widget pages (`docs/SHARE-PLAN.md`) | about 9–10 days | planned | ⚪ S0 (metadata, slug + uid links) first; owner decisions in §9 |
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
- [x] P4-D: migration + SDF morph (`src/engine/migrate/`): `migrate(from, to, opts)` Hilbert-rank pairing (split/merge or fade spares, stagger by rank, arc paths, colour crossfade), `migrationLayers` (site layers), `morph(a, b, k)` over cached EDTs; `DotCanvas` `migrate` transient (holds on target, reverse on clear, reduced motion = instant). `glyph-longpress`: after the unlock the lock's dots migrate into a now-playing glyph (vinyl grooves, progress, transport; record turns, time runs), release flies back and the shackle shuts. Verify: 8 checks; 3k dots setup ~2.6 ms, frame ~0.4 ms. Needs the user's taste pass on the mid-flight frames.
- [x] P4-B: Agent Heartbeat v1 (`src/widgets/boards/heartbeat.ts`, `?board=heartbeat`): tokenized presence vocabulary `HEARTBEAT` / `heartbeatState(name)` / `blendStates` (DESIGN.md "Agent presence"); one lobed, breathing, wandering metaball organism (mid body, up-left highlight) per state: `hb-thinking` calm lobes, `hb-tool-running` condensed with a site ring + comet it watches, `hb-awaiting-approval` lub-dub pulse in `active` (text neutral), `hb-error` whole-cell row-offset stutter + dropout bursts, `hb-done` condenses into a dot check mark. Eyebrow names the state, a 1× status line says what the agent does. `hb-agent`: stadium segmented control (THK RUN ASK ERR OK, hover/press/focus), `springKeys: ['state']` so parameters and knob glide between states (~0.4 s); red-free, so the board spends red once. Not done: real agent event feed, `describe(ctx)`.
- [x] P4-A: SimFields (`src/engine/sim/`): `createSim` fixed-dt stepper, `simAt(sim, t)` deterministic in any call order; review pass: `lead`/`period` loop folds any t (3600 s, wall clock) so cold cost ≤ one loop, checkpoint LRU (`maxCheckpoints`, step 0 + loop start pinned), `maxSteps` per call with `lag` catch-up, allocation-free stepping and a 3-view ring for fields. Gray–Scott `edge`/`killAt`, sand grain kinds + `emitters`/`init` (mass conserved), Life `edge: 'dead'`/`soup`/`stamps`/`afterglow`. Board `sim`: `sim-rd` coral labyrinth growing from 50 seeds with relief tones and a size falloff at the border, `sim-sand` an hourglass in two strata tones whose falling stream is the board's only red, `sim-life` a Gosper gun firing into soup next to two pulsars with a fading trail. Verify: 12 sim checks incl. cold mount at t = 1/60/3600; `pnpm bench` prints the cold-start table. Goldens: only sim-* changed.
- [x] P4-C: **Glyph** lock experience v1 (`src/widgets/boards/glyph.ts`, `?board=glyph`, 2 columns): `glyph-hourglass` (HH:MM in the home-clock grain face; on the minute changed digits drain off the card, new grains pour in lattice-stepped and settle bottom-up by ~6 s, then one grain a second falls from the colon into a 60-grain cone heap; `ctx.since` overrides the wall clock for films, `data.tilt` leans the stream), `glyph-longpress` (dotted padlock on a ring, `button` control; ring sweeps clockwise from `t - tDown`, at 1.6 s the shackle lifts open: UNLOCKED; hover/press/focus per the components grammar; checked holding in headless Chrome), `glyph-notify` (metaball bud detaches and becomes the red count badge with a white 3×5 numeral on the same lattice; the board's only red), `glyph-idle` (Gray–Scott labyrinth from `src/engine/sim` on a round 46-site matrix, looped bounded sim time, 4 tone/size bands, 1-site edge ramp; ~150 s regrow loop). Board mount 5.9 ms, frame 5.5 ms. Needs the user's taste pass.
- [~] P4-G: **Agent Heartbeat as an MCP App** + `describe()` (`mcp/`, `docs/MCP-APP.md`, `src/engine/describe.ts`). The spec was checked 2026-10-23: MCP Apps 2026-01-26 is stable, `ui://` + `text/html;profile=mcp-app`, `_meta.ui.resourceUri`, postMessage JSON-RPC. The SDK is now split v2 `@modelcontextprotocol/server` 2.3.1 + `ext-apps` 2.0.3, both installed in `mcp/` only. `describe(preset, ctx)` / `describeBoard` are pure, read control values and drawn strings (`Field.text`, tagged by `textAt`), and verify covers all 141 presets: no throws, deterministic, hb-agent and live states. `heartbeatCard(label)` = `hb-live` (sprung `data.state`, not on a board, goldens unchanged). Server: `set_agent_state` → `ui://dot-card/heartbeat`, and `describe_board`. The card is one 53 KB HTML file (esbuild) with a hash-only CSP, no eval and no network. Verified offline: `mcp && pnpm test` checks the stdio JSON-RPC (tools/list meta, resources/read, all 5 states, a bad state rejected, describe_board). Headless Chrome with the official `AppBridge` host in a sandboxed iframe checks the handshake, size-changed, a canvas that draws and animates, a state switch per host postMessage, red only while awaiting approval, and that eval and fetch are blocked; screenshots are in `.snapshots/mcp/`. **Not verified:** inside a real host (Claude / ChatGPT / VS Code Copilot), host-specific extras (Claude domain signing, ChatGPT Apps review), and HTTP transport (only stdio is built).
- [x] P4-E: live data (`src/data/`, `?board=live`): `Source` binding layer with `poll` (backoff + jitter, rate-limit waits), `broadcast` push, `websocket` and `mediaSession` transports; hidden-tab pause, last-good localStorage cache, deterministic fixtures as card defaults (goldens never see the network); strings travel as `textId`s. Board-level `sources` in `BoardDef`, bound in `Board.tsx` (`useLiveData`). Cards `live-weather` (Open-Meteo, 12-hour dot bars, condition icons), `live-now-playing` (push/websocket feed, generated cover, red playhead), `live-contribs` (52-week dot lattice, red only for today); footer status LIVE / CACHED / OFFLINE. Verify: 15 checks with a fake fetch/clock (`scripts/live.ts`). Checked live in headless Chrome (weather + contributions fetched, push fed). Needs the user's taste pass.

- [x] P4-F: Live media: **halftone ladder + STBN** (`src/engine/halftone/`): `halftone(raster, { step: 1|2, levels, mode: 'size'|'area', frame })` (step 1 ordered multi-level threshold, step 2 structure-aware: self-guided filter + local contrast + edge-snapped dither), `halftoneStream(opts).push(raster, frame)` (per-cell STBN slice re-rolled only when the input moves, level hysteresis), `stbn(x, y, slice)` on a 64² void-and-cluster mask built in code (~20 ms, first use) with golden-ratio slices. Webcam capture `src/media/` (`createCamera`, `useCamera`, `withMedia`; `ctx.media.camera`, `WidgetPreset.media`), started only by the card's toggle, stopped on unmount / hidden tab. Board `mirror` (`mirror-camera` live step 2 with REC + the one red dot, a field-built test portrait + TAP TO START otherwise; `mirror-ladder` noisy portrait step 1 vs 2). Flicker on a static noisy scene: plain threshold 13.8% of dots/frame, STBN-only 47%, stream step 2 0.02%. Live frame 2.7–3.1 ms at 144² (verify, fresh process). Not done: real-device test in a browser, HVS-SSIM gate, the "heals" scratch interaction.

**P5 (reach: GPU, devices, display physics): started 2026-10-23**
- [~] P5-A: **WebGL2 renderer** (`src/engine/renderer/webgl/`): instanced quads (corner from `gl_VertexID`), exact superellipse SDF (n = 2 + 30r²) with analytic AA and Steiner ink correction, palette uniform. Explicit dots go through an instance buffer. Lattice passes take positions from the instance index and values from an RG32F texture. `gpuIR` evaluates the IR's `emitGLSL` on the GPU, with u/v from a CPU table because D3D's 47/47 = 0.99999994. `gpuValues` samples a CPU field straight into the texture. One context per page, copied into each card's canvas, and a lost context is replaced after 1.5 s. `DotCanvas` picks `webgl` for cards with tagged layers, else Canvas. Board `gpu` has three cards: `gpu-plasma` (507k dots), `gpu-starfield` (276k) and `gpu-moire` (432k). Its goldens, export and fallback use the CPU lattice. `scripts/webgl.ts` runs in headless Chrome (CDP); its PNGs are in `.snapshots/p5a/`. IR parity covers 20 fields × 3 envs: max error 2.9e-5 (HD 520) and 2.6e-4 (SwiftShader) away from discontinuities, plus 45 of 138k `loopWork` cells that flip at an exact `fract` jump. Pixels vs canvas: PSNR 34–45 dB. WebGL ink is closer to the exact area, while Skia under-covers sub-px dots. Perf on Intel HD 520 / D3D11: 500k IR dots at 60 fps (GPU 9.8 ms/frame). 100k CPU dots: GPU ~2 ms, but the main thread is the limit: 57 fps from a value table, 18 fps for the CPU plasma field, 12 fps for `DotInstance[]`. SwiftShader runs 500k at 0.6 fps. Verify adds 5 checks (pass at density 1 ≡ sampler). Not verified: other GPUs, mobile, Safari/Firefox, and the 100k CPU-field gate (field-bound; worker sampling, P5-B, is the lever).
- [~] P5-B: SoA `DotBuffer` + worker sampling (`src/engine/buffer/`, `src/workers/`, `renderer/canvasBuffer.ts`). `sampleLayersInto` shares the sampler pass, goldens unchanged (146). `renderCanvasBuffer` makes the same fills as `renderCanvas`, worst UI card 12 fills. Sub-paths stay open in both renderers, because `closePath` was the top main-thread cost in Chrome. A module worker samples registered animated cards and rasterizes them to an `ImageBitmap`, with transferable double buffers. The main thread samples instead during transients, while a control is engaged, for media cards and with `?worker=0`. Headless Chrome (`scripts/browser-perf.ts`), main-thread ms per 12 fps tick, before → after: cinema 43–46 → 1.7, light 85 → 2.3, mosaic 12–31 → 2.5. JS is ≤ 0.4 ms of that; the rest is native compositing. So the ≤ 2 ms gate is met for JS but borderline for total busy time. `scripts/buffer.ts` is in verify. **P0-A not met:** the static mount still goes through `DotInstance[]`, and bench mosaic mount is 32.8/34.3 → 31.6/30.6 ms (allocation was only about 2 ms of it; field evaluation dominates). Not verified: real GPU Chrome, Safari/Firefox workers, a production build in a browser (`vite build` emits the worker chunk), interactive cards on the worker path under real input.
- [x] P5-C: **devices + "One Field, Five Surfaces"** (`src/engine/device/`, `?board=surfaces`): `DeviceProfile` (`browser`, `glyph-matrix-25` round 489-LED mask, `trmnl-800x480` 1-bit, `flipdisc-28x14`, `plotter`) and `toDevice(spec, profile)` (curated `variants['25x25' | '28x14']`, else area-weighted resample of the TILE card; linear / threshold / blue-noise tone maps). Pure-in-t simulators: e-ink ghosting (partials leave ghosts, full refresh flashes and clears), flip-disc column scan + underdamped disc inertia + clack events, LED bloom, plotter pen paths (NN travel, loops per tone, `plotterSVG`). Cards `surface-browser` (the board's one red), `surface-glyph`, `surface-eink`, `surface-flipdisc`, `surface-plotter`, all on one board time; `createClockSync` (BroadcastChannel, earliest epoch wins) via the board's `clock` source; clack app-side, muted unless `?clack=1`. Verify: 9 checks (`scripts/device.ts`). Goldens +5. Not done: real-hardware calibration, the e-ink card is the heaviest frame (~10k pixel dots), clack untested in a browser.
- [~] P5-D: exports (`src/export/`, playground `ExportPanel`, `scripts/og.ts`): clips of any card at N s × fps, re-sampled offline (exact durations), with progress, cancel and download. Formats: APNG (snap encoder port), GIF (hand-written LZW, palette from the board's tones), WebM (VP9) and MP4 (H.264), both through WebCodecs + in-repo muxers (MediaRecorder WebM fallback). An optional data-key sweep lets static cards animate. Plotter SVG: spiral or hatch per size step, opacity becomes fill density, NN + 2-opt cuts `timer` pen-up travel 2.36 → 1.33 m, deterministic. OG 1200×630 PNG via the headless raster (no resvg). Verify: 14 checks (round-trips, muxers, plotter coverage). `scripts/export-chrome.ts`: `timer` 2 s @ 30 fps at 704², each file 2.000 s (readers + `<video>`): APNG 65 KB, GIF 32 KB, WebM 92 KB, MP4 87 KB; in `.snapshots/p5d/`. Not verified: Safari/Firefox (Firefox has no H.264 `VideoEncoder` in some builds), the MediaRecorder fallback path, a real pen plotter, OG in real mail clients.
- [~] P5-E: IR bytecode + device targets. `compileBytecode(ast)` / `runBytecode` / `verifyBytecode` (`src/engine/ir/bytecode.ts`) is an f32 stack VM with an opcode per builtin, forward-only jumps and bounded `FOR`/`NEXT` loops, a static verifier (stack depth, slots, jump targets) and a 65 536-step budget per dot. On the 20 IR fields × 3 envs at 48×48 it is bit-exact (Δ 0) to the float32 reference, and 99.96% of samples are within 1e-5 of the f64 JS backend (the rest is `loopWork` step edges). The programs are 30–99 B, median 60 B. `targets/esp32/dotvm.c` is a C99 interpreter with no malloc. Compiled with MSVC x64 (found through vswhere, not on PATH), it is 100% bit-exact to the TS VM on the same 60 jobs. Its code is 4.3 kB as an x64 `/O1` object (eval + verifier), so the ~2 kB target is **missed**; the Xtensa `-Os` size is estimated at ~3 kB and not measured. `targets/` has Node senders with no new deps: WLED DDP, AWTRIX NG (+ AWTRIX 3 fallback, hand-written MQTT 3.1.1), a TRMNL BYOS server + Private Plugin markup (1-bit BMP/PNG, blue-noise dither), Tronbyt/Tidbyt (hand-written lossless animated WebP), and a Glyph Toy template + frame export. Licence notes are in `targets/README.md`. **Tested against local fakes only:** UDP DDP receiver, AWTRIX HTTP + MQTT broker, TRMNL device poll, Tronbyt push (WebP decoded by ffmpeg / Pillow), ESP32 sketch HTTP API, Glyph export. **Tested on real hardware: none.** The PlatformIO sketch and the Kotlin toy were not compiled.

**P6 (author + ecosystem): started 2026-10-23**
- [x] P6-A: **Card spec v1** (`src/spec/`, `schema/card.v1.schema.json`, `examples/specs/`): JSON cards with `ir` / `text` / `sites` / `raster` / `generator` layers, IR `bind`s (parsed, never eval'd), theme tokens, data, controls, states, transitions, springKeys. `validateSpec` is hand-written, mirrors the schema plus IR/size/reference checks, and reports errors with paths. `specToPreset` builds normal Layers. `presetToSpec` exports the generator subset via `Field.from` provenance (set by `irProgram`, `textAt`, `layoutFor` generators). Each converted layer is checked cell by cell; anything else bakes to a raster at the authored grid. `migrateSpec` handles v0 → v1. `scripts/spec.ts` (in verify): schema ≡ validator on 48 fixtures; 144/146 presets keep their golden hash through preset → spec → JSON → preset (IR board at both golden times, 87 with no baked layer); re-export is byte-stable. Not covered: `sizeCurve` styles (`mirror-*`); TS-animated cards export as their t = 0 frame; TS-computed strings become literals; no app UI loads specs yet.
- [~] P6-B: distribution packages (`packages/`, `packages/README.md`). `@dot480/core` (curated entry, not `export *`: `.`, `./ir`, `./presets`, `./card` framework-free `mountCard` runtime, `./spec` JSON spec v0; zero deps, `sideEffects: false`, ESM via Vite lib mode + `tsc --emitDeclarationOnly`, `.d.ts` specifiers fixed for node16/nodenext), `@dot480/react` (`<DotCard preset|spec data />`, `useDotField`, peer react), `@dot480/element` (`<dot-card>`: shadow DOM, `card`/`src`/inline JSON, `data-*`, `theme`, `renderer`, reduced motion, pointer + keyboard controls; `demo.html`; standalone one-file bundle), shadcn registry (`registry/`: 10 Components v2 + 6 widgets, built items in `registry/r/`, generated by `packages/scripts/registry.ts`). Sizes min+gz: core 40.7 KB, ir 7.4, card 20.2, presets 109.2, react 0.9 (+core), element standalone 114.8. Proof: `npm pack` → fresh temp dir `npm i ./dot480-core-0.1.0.tgz` (1 package, no deps) + react/element tarballs, `packages/scripts/smoke.mjs` samples fields/IR/presets in Node: pass; consumer types pass `tsc --strict` nodenext without skipLibCheck; registry wrappers type-check; `packages/scripts/element-headless.ts` (headless Chrome, CDP): every demo card draws, SVG/Canvas rule, data-* edit, pointer click, reduced-motion still frame, no console errors: pass. Not done: npm publish, registry hosting, `<DotCard>` not driven in a browser yet, spec v1 (`src/spec`) swap, element has no board choreography/migration/live sources/camera; old barrel `src/engine/index.ts` untouched (the app still uses it).
- [x] P6-C: **DOTS tab, "Dwitter for dots"** (`src/components/dwitter/`, `src/lib/share.ts`, `?tab=dots&p=<encoded>`): Field IR REPL (plain textarea with a line-number gutter, the IR error marked at line:col by a mirror `<pre>`; Ctrl+Enter runs), live card through DotCanvas on a stable refs-reading `layers` (typing never re-subscribes), grid (square/wide/tall) / lattice (1–6×) / tone pickers, scrubber (play/pause, drag t, loop 2–32 s), `data.<key>` sliders generated from `info.data`, pointer as `pointer.x/.y/.down`. Share: `{src, grid, lattice, tone, parent?}` → deflate-raw + base64url (`z…`, plain `b…` fallback), source ≤ 4096, link ≤ 8192 chars, inflate capped (deflate bomb refused); a bad link shows the error, a bad program shows its IR error and is never run; Dwitter-style char count + link length, COPY LINK; the address bar follows the program. Remix graph: every saved program stores `parent` (FNV hash of the parent), local gallery in localStorage (40 own + 8 seeds: ripple, plasma, rings, spiral, rain, lissajous, checker warp, heartbeat), drawn in dots (2× lattice thumbnails, dotted edges, current node framed in the accent). Verify `scripts/dots.ts` (6 checks: round trip, limits, malformed links, hash, seeds closure ≡ function + non-empty + animate, gallery/graph). Headless Chrome `scripts/dots-browser.ts` (20 checks: type, error, scrub, copy link, reload from it, remix, data slider, bad links), screenshots in `.snapshots/p6c/`. Not done: a thumbnail hover/scrub in the graph, server-side short links, GLSL preview path.
- [~] P6-D: **Dot Studio** (STUDIO tab, `?tab=studio`, `src/components/studio/`; own tab so WORKSPACE stays the one-preset tuner; lazy-loaded). Document model (`doc.ts`, React-free): grid + style + layers `{id, kind: ir|text|sites|preset-layer|spec, src/params, tone, lattice/size, z, blend (normal/add/multiply/subtract/max, folded into the layer below), visible}` + data + controls + bindings + states/machine + enter/change/exit transitions + timeline; validated JSON, undo/redo (typing coalesces), localStorage autosave + named saves, JSON file open/save. Imports: any preset as a live read-only reference stack (`withChrome(p)(ctx)[i]`), a preset through card spec v1 (`exportPreset` → IR/text editable, other kinds as `spec` layers built by `buildLayer`), card spec v1 JSON, DOTS links/codes/examples. Adapters (`adapter.ts`): spec v1 out (exportPreset + states/initial/transitions) and in, spec v0 out. UI: drag/Alt+↑↓ layer list with visibility/tone/blend; inspector (IR via the DOTS `CodeEditor` with line:col errors, last good program kept; text/sites params; ladder lattice/size pickers; spec layer JSON); timeline (scrub, play, length, enter/change/exit tracks with mask/ease/ms, mask order + ease curve drawn as dot cards); state machine (states = data presets, SVG graph + edge table, FIRE, and press/release on the preview fires matching edges); bindings (sliders or sources: LFO, clock, pointer, weather/GitHub fixtures); card settings; sidebar: scorecard (`scripts/lib/fidelity.ts` G1–G3/G5 + metrics in the browser; helpers moved to browser-safe `scripts/lib/stats.ts`), live bar sheet (port of `snap --bar`: 1×/3×/blur/silhouette vs level-03, afterlight, thermal-monitor, ui-toggle), export (PNG/SVG/HTML/plotter/doc JSON/spec v0, APNG/GIF/WebM/MP4 of the timeline), `toDevice` previews for all 5 profiles + EXPORT ALL DEVICES. Verify `scripts/studio.ts` (15 checks: round trip, refusals, storage, compile/blend, IR errors, undo/redo, 5 reference stacks ≡ presets, DOTS, spec v1 round trip, timeline, firing, ≤ 16 ms frame). Headless Chrome `scripts/studio-browser.ts` (build 2 IR + text from scratch, scrub, fire, APNG, undo/Ctrl+Y, ref/spec/DOTS import; slowest interaction frame ~7–10 ms), screenshots in `.snapshots/p6d/`. Not done: one-click "publish", controls editor (controls are carried, not edited), live network sources in bindings (fixtures only), multi-card boards, a taste pass.
- [~] P6-E: authoring MCP tools (`mcp/src/author.ts`, logic in `scripts/author/`, docs `docs/MCP-APP.md` › Authoring tools). `render_card` (PNG image content + describe), `score_card` (G1–G5 + tonal depth / density / motion-legibility proxies; Bradley–Terry rank + exemplars when history exists), `refine_card` (deterministic rule-based §2.7 loop: a round is kept only if it scores better; no LLM inside, the host model is the critic via `feedback`), `record_verdict` (`.dot480/verdicts.jsonl`, gitignored), `push_to_device` (stub: not configured unless a loopback URL or a local folder is set). Fidelity scoring factored into `scripts/lib/fidelity.ts`; CLI output unchanged. Seeds (`scripts/author/seeds.ts`): speckle 5/7 → 7/7 in 1 round, red flood 6/7 → 7/7 in 2, strobe 5–6/8 → 8/8 in 3. `mcp/test/author.ts` runs in `pnpm test`. Card input is IR + params until card spec v1 (`src/spec`) lands (TODO). **Not verified:** inside a real host, the gates' agreement with the user's taste (κ, P0-F), a real device.
- [~] P6-F: essay "Ditherpunk for UI" (`essay.html`, its own Vite entry so it deploys alone; `src/essay/`; `?tab=essay` redirects): a builder's explorable deep-dive (~3.3k words, 14 sections, no pitch) with 15 lazy-mounted live figures (IntersectionObserver, one chunk each) on the real engine: resolution, drag-the-field pipeline + pitch, quantize steps + squircle exponent, cluster vs lattice/sites, second-accent toggle, enter masks, Departures, Instrument knobs, torch + "Torch in the Dark" (level-03 relit by the cursor), Hourglass/sand/RD, white-noise vs STBN vs STBN+hysteresis flicker counts, "Mirror that Heals" (scratch, regrows from the edges), editable Field IR → DOTS link, five surfaces, heartbeat + its 25×25 LED phone-back. Figures register only the presets they embed (`src/widgets/registry`), so the essay never loads every board: first view ~124 KB JS gz. Headless Chrome `scripts/essay-browser.ts` (1280 + 375, mount on scroll + input per figure, no console errors, no overflow, reduced-motion stills; screenshots `.snapshots/essay/`). Not done: essay as the site index, OG image, Mirror regrowth is an RD-like front (no NCA), Torch has no normals/parallax, real-phone tilt untested.

**Resume here (2026-10-26):**
- Branch `feat/ux-u0-u1` (pushed, **not merged to `main`**) holds UX U0–U4, the DISPLAY ▾ slice of U5, and the cleanup pass. On the merged branch: tsc and oxlint clean, verify passes except the load-sensitive mirror-camera timing, goldens 173/173, first-load JS **143.87 kB gz**. `mobile.ts`, `c10-browser` (48), `dots-browser` and `studio-browser` all pass. Details: UX-PLAN §9.
- `pnpm check` may refuse to start after agent worktrees with junctioned `node_modules` (pnpm's dependency check wants to reinstall). Run `npx tsc -b && npx oxlint && npx tsx scripts/verify.ts` instead, or `pnpm install` on an idle tree.
- Testing rule (AGENTS.md): module-level checks while iterating; the full suite only before a push or merge of bulk work, or after core changes.
- Next: merge `feat/ux-u0-u1` to `main` (on request); the rest of U5 (`?` sheet, Pro switch, dock); the taste session; then `docs/SHARE-PLAN.md` S0 (widget metadata, slug + uid links).
- Earlier (2026-10-24): everything up to PR #5 is on `main`.
- Browser integration scripts (run against `pnpm dev`): `scripts/c10-browser.ts` 45/45, `c6-browser.ts` PASS, `game-browser.ts` 16/16, `essay-browser.ts` 39/39, `studio-browser.ts` 23/23, `skins-browser.ts` clean. Timing checks (`mirror-camera`, `migrate perf`, `type field`) fail only under heavy machine load (A/B showed no regression).
- Merged to `main` via PR #4 (2026-10-24). `git push` works again (`gh auth setup-git`, account YashM20).
- Deploy: Vercel auto-deploys `main` (production) and every PR (preview); host config in `vercel.json`, details in `docs/DEPLOY.md`. Cloudflare setup removed 2026-10-24.
- UX plan (`docs/UX-PLAN.md`, low floor / high ceiling): U0 + U1 built on `feat/ux-u0-u1`. Boards are grouped (START HERE, INTERFACES, DATA, PLAY, ENGINE), with plain labels, one-line descriptions, an intent line, and a mobile board select. The URL follows every view, and Back / Forward work. The audio engine is lazy, so first load is 142.9 kB gz. Next: U2 (card hint verbs + action strip: how it works / remix / link / PNG). The taste-session decisions are listed in UX-PLAN §7.
- Next (Web plan): a taste session (UX-PLAN §7 decisions plus the new boards); UX U2; make the essay the front page or keep a board (UX-PLAN §7.4); C1 WebGPU compute; C9 multiplayer (optional); a taste session on the new boards (type, physics, heal, scope, lock, the HIVE game, skins).

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

**Web plan (2026-10-23)** (`docs/WEB-PLAN.md`)
- [x] W0: **ship the site** (agent side; `docs/DEPLOY.md`). Static deploy, hosted on Vercel (Cloudflare Pages setup removed 2026-10-24):
  - `vercel.json` headers: immutable `/assets/*`; a CSP with `'self'` scripts, workers, camera, the live APIs and no eval; no COOP/COEP.
  - `vercel.json` rewrite: SPA fallback (real files such as `/<board>/index.html` win).
  - CI checks and builds only (Vercel deploys). CI also runs the bundle budget and uploads a `site` artifact.
- [x] C2: dot physics you can touch, CPU-first (`src/engine/physics/`, `?board=physics`). The engine pieces:
  - `createWorld`/`worldAt` is pure in t (a SimField with checkpoints, a loop and a seam pull) until the first input, then live at fixed dt (it drops time, never stretches a step) and heals back after 3 s idle;
  - stable fluids with warm-started Jacobi, MacCormack ink, vorticity and buoyancy;
  - PBD cloth with aero wind, and a shape-matched jelly with an area constraint;
  - disc particles with a spatial hash.
- [x] C4: **playable HIVE** (`src/game/`, `src/components/game/`, `?board=levels&play=1`): a PRESS START button on the levels board opens a full-screen 192×144 dot game: title → corridor (first-person DDA raycast, torches, drones you shoot) → warren (top-down maze, 3 keys, BFS grubs) → surface (run / jump / stomp side-scroller, parallax ≡ `lv-surface`) → warp → the queen (bullet patterns in 3 phases, shell armoured while her red eye is shut, health bar) → win / game over (continue countdown) → initials → high scores (localStorage). Fixed 60 Hz deterministic sim, render per display frame; keyboard, Gamepad API, dot touch pad, optional pointer-lock mouse-look; whole-cell shake, Bayer dither-burst hit flashes, mask dissolves between stages and a dot migration into the boss (all off under reduced motion); pause on blur; 20 s idle → autopilot demo; sound hooks call `src/audio` if it exists. Engine: `src/engine/scene` (hall + grid ray casters, promoted from `levels.ts`; lv-* goldens unchanged). Checks: `scripts/game.ts` in verify (autopilot reaches the boss in ~79 s, recorded inputs replay bit-identically, sky ≡ card), `scripts/game-browser.ts` (CDP, 16 checks, screenshots `.snapshots/c4/`). Left: corridor frame is the heavy one (~10 ms layers + sample, ~25 k dots); bot cannot beat the queen; taste pass on difficulty.
- [x] C6: **camera magic**, no ML dependency (`src/vision/`): skin (YCbCr) ∧ background-model mask on a 96×72 frame, connected components, palm centre by distance transform, pinch = hole in the hand or area collapse, One Euro smoothing; ~1.7 ms/frame on the main thread (no worker). HAND mode (`vision/handPointer.ts`) replays the hand as real pointer events (`id: 'hand'` in `ctx.pointers`, pinch = down), so every card's controls work by hand; toggle + privacy text on `mirror-conduct`, STOP/Esc pill. One shared, ref-counted camera stream (`media/stream.ts`, test hook `__dotTestCamera`). New presets `mirror-shadow` (silhouette shadow puppet, tilt/pointer parallax) and `mirror-conduct` (wave flips a split-flap word, pinch gathers dots); scripted fixtures, goldens +2. Checks: `scripts/vision.ts` (verify) and `scripts/c6-browser.ts` (headless Chrome, synthetic video): 29 fps, error 1.8% of frame width (0.9% at 100 ms lag), pinch 90%, knob turned by hand. Not verified: a real webcam/hand; the mirror board itself only tracks at ~7 fps headless (three live camera cards).
- [x] C7: **display skins** (`src/engine/display/`, `src/components/skins/`, `DESIGN.md` › Display skins): `oled` (default, no overlay) / `crt` / `vfd` / `led` / `eink` / `flipdisc` / `nixie` as a post-raster overlay stage per card (one `DisplaySurface` wrap in `DotCanvas`; 2D and WebGL-composited canvases are copied, SVG cards re-rastered from their dots, no re-sample). Afterglow raster op (`afterglow`, the P3 debt). Header segmented control + `?skin=` + localStorage, `setSkin(name)` exported (also `window.dot480.setSkin`); the switch is drawn as a refresh (CRT beam open, LED row scan, e-ink flash, flip sweep, OLED wipe). Accent hue kept (colour matrix passes red; verify checks it). Headless Chrome (`scripts/skins-browser.ts`, loaded machine): one 144² animated card crt 1.03 ms / led 0.49 ms mean per card frame; screenshots 3 boards × 7 skins + switch frames in `.snapshots/c7/`. Verify `scripts/display.ts` (7 checks); goldens unchanged. Not done: split-flap skin; real GPU/Safari; flip-disc/e-ink readback stalls (p95 up to ~11 ms on a busy board).
- [x] C8: **kinetic dot type** (`src/engine/type/`, `?board=type`): stroke font (67 glyphs, SDF centrelines) with weight / width / roundness / slant axes, lattice hinting, profile kerning; `typeMorph` (SDF, letter sweep), `typeMigration`, quantized `marqueeField`, wave / bounce / weight-wave / breathe; CJK/emoji via offscreen canvas in the browser only (skipped headlessly). Board: VARIABLE (3 knobs), MORPH, MARQUEE (ON AIR = the one red), KINETIC, FLIGHT, TYPE ANYTHING (`data.text` textId, migrates on change). Verify `scripts/type.ts` (9 checks), goldens +6. Not done: ⌘K wiring, CJK not seen in a real browser, lowercase.
- [x] C10: **explorable layer** (`src/components/xray/`, `src/components/palette/`): X-ray per card (`X` on hover, `⇧X` / dock for all) — sampler grid + layer lattices, hover tooltip ("value .62 → size step 4/4, tone, layer 3 'arc'", probe ≡ sampler on 1637/1637 points), HUD (renderer svg/canvas/webgl/+worker, delivered fps, dot count), inspector (layers solo/mute, live data, `describe()`, `presetToSpec`); time machine (`sharedClock().seek()` + `isPaused()`, hold `T` + drag / scrubber / ← →, `Space` resumes, view change resumes); remix → DOTS (own IR, else a `describe()` stub that compiles for every card) or → STUDIO (`importPreset`); ⌘K/Ctrl-K palette (ARIA combobox, fuzzy, boards from the manifest, cards once chunks load, renderer / reduced-motion / worker / skin-placeholder (`data-skin` + `dot480:skin`) / deep-link actions); dot shell (`` ` ``, rendered as `textAt` dots: help, ls, open/load, xray, fps, t, play, describe, remix, studio, skin); Konami → Level 07 boss. Off = untouched layers/renderer (goldens 160 match; henry pixels identical before/after). Checks: `scripts/c10.ts`, `scripts/c10-browser.ts` (CDP, `.snapshots/c10/`). Not done: per-layer dot counts, skins themselves (C7), worker frames can land late after a seek on a loaded machine.

  Lazy boards:
  - `src/widgets/manifest.ts` holds one `import()` per board; tab hover/focus prefetches the board.
  - The `Board` suspends on `use(loadBoard(id))`. The other views are `React.lazy`.
  - `src/widgets/registry.ts` replaces the eager registry reads in `useDotField`, the worker client and the playground store.
  - First-load JS: 222.7 kB gz (one 613 kB chunk) → 119.8 kB gz after the STUDIO/gpu merge (`scripts/site/size.ts --check`, gzip -9, budget 150). Deep links: `/mosaic/` 127.2, `/gpu/` 121.0.

  Deep links:
  - `/<board>/` paths, with `?board=` still accepted; the address bar follows the board.
  - Runtime `<title>`/description/OG tags come from `src/site/meta.ts`.
  - `scripts/site/postbuild.ts` (run from the vite plugin) writes `dist/<board>/index.html` crawler copies and `dist/og/<board>.png` (22 images via `scripts/og.ts`, ~20–35 s).

  `.gitattributes` (LF + binaries) with a renormalize commit; the index was already LF, so renormalizing changed nothing; goldens unchanged (154).

  Mobile (`scripts/site/mobile.ts`, CDP, 375 px + touch, screenshots in `.snapshots/w0/`):
  - All 21 boards and 6 views: no horizontal overflow. STUDIO overflowed by 4 px (timeline rows); fixed with 2-column rows at ≤ 480 px.
  - View tabs were 10 px tap targets. Fixed in `App.css` (append-only): 24 px tabs, and 24 px selects/ranges/playground controls on coarse pointers.
  - DRAW stays hidden in the narrow nav (deliberate; still reachable at `?tab=draw`).

  **Needs the user:** optional `SITE_URL` in Vercel for a custom domain (`docs/DEPLOY.md`). Not verified: the `vercel.json` headers on a live deploy (`npx vercel dev` locally); Safari/Firefox.

  Cards: `phys-splash` (a swipe knocks DEPARTURES loose, the dots settle and Hilbert-migrate back, a full splash re-forms as ARRIVALS; the in-flight dots are the board's only red), `phys-ink`, `phys-flag`, `phys-jelly`, `phys-pit`. Input is the pointer plus Enter = kick plus `data.gx/gy` tilt; the DeviceOrientation wiring is not done. Verify has 13 checks (`scripts/physics.ts`); goldens +5. Weak spots:
  - the cards throw inside the sampling worker so that they stay on the main thread; a `WidgetPreset` flag would be cleaner;
  - motion runs at the 12 fps animated tier;
  - board frame Σ exceeds the 8 ms bench budget under load;
  - no GPU path yet.
- [x] C5 Sound: `src/audio/` (WebAudio synth + drums, lookahead scheduler on `bpm`, AnalyserNode meter, mic, REC); SOUND toggle on the transport; `scope` board (scope, spectrum, mic). Browser check `npx tsx scripts/audio-chrome.ts` (URL=dev server): onsets ≤0.4 ms off grid. REC muxes board video + audio via MediaRecorder; in headless the video take is empty, so it saves audio-only.
- [x] Lift (craft: cinema, light, live, heartbeat, lock): `cinema-encore` singer silhouette at a mic stand in a curtain spot (was an "A"), `cinema-closer` two flame-lit profiles on black (was the vase illusion), `cinema-keeper` black rock + surf + per-row swell; `light-gloss` black lacquer (void body, highlight held toward the lit limb, floor-bounce rim), `light-fabric` higher-ambient weave + shadow-side sheen rim; `live-now-playing` seeded sun-over-sea cover + EQ animated from `t` (12 fps), `live-contribs` level 0/1 sizes 1.15/1.75; `hb-thinking` budding lobes (new `bud` token: per-lobe sphere shading, darker necks; `hb-agent` state 0 follows); board `glyph` → `lock` (`LOCK — LOCK SCREEN EXPERIENCES`, cards `lock-*`, `?board=glyph`, `/glyph/` and `?card=glyph-*` still resolve via `boardAliases` in `manifest.ts`), `lock-notify` 5×7 badge digit, `lock-idle` finer 60-site labyrinth that keeps rearranging. Snapshots `.snapshots/{before,r1..r5}`.
- [x] C3 Growing NCA, board `heal` (heal-mirror / heal-xray / heal-persist). Engine `src/engine/nca/`: 12 ch, 48 hidden, Int8 asset `src/assets/nca/lizard.ts` (2,352 params, ~3 KB). Training: `scripts/nca/train.ts`, plain-TS BPTT on worker threads, 4,374 iterations in 3 sessions (39 min total; smaller than planned because this laptop was at 100% load). Regrowth after a top-half cut (47%): 50 steps = 1.7 s at 30 steps/s. Left/right/bottom cuts regrow the body, but the limbs on that side only come back as stubs. Step cost under load: 6 ms (board grid) and 26 ms (64², four lizards). The 2 ms gate is unverified on an idle machine.

**UX plan (2026-10-26)** (`docs/UX-PLAN.md`: low floor, high ceiling; the build log is §9)
- [x] U0 fixes:
  - the ⌘K palette and the shell use the real skin list (`SKIN_NAMES`);
  - DRAW is reachable at 375 px;
  - 64 px of bottom room for the dock;
  - LIVE DATA shows only on boards with live sources;
  - plain footer;
  - the brand label shows the tab;
  - the URL follows every view (`syncUrl`), and Back / Forward work;
  - root-absolute essay links.
- [x] U1 orientation:
  - board groups START HERE, INTERFACES, DATA, PLAY and ENGINE (`boardGroups`), with plain labels (`boardLabel`);
  - `BoardPicker.tsx`: group tabs and chips on desktop, a native select at ≤ 760 px;
  - one-line board and group descriptions (`src/widgets/blurbs.ts`, lazy) under the board title;
  - a dismissible intent line;
  - 4 `ux:` checks in verify.
- [x] Budget: the audio engine is lazy (`src/audio/AudioCards.tsx`): first load 148.9 → 142.9 kB gz.
- [x] U2 card ladder: hint verbs, the ⓘ / REMIX / LINK / PNG strip (`⋯` on touch), X-ray SUMMARY + glossary, X-ray bottom sheet on phones.
- [x] U3 EXPLORE / MAKE / ABOUT: `src/site/views.ts` resolver + alias table (verify-checked), MAKE modes, lazy ABOUT, GALLERY folded into EXPLORE.
- [x] U4 staged makers: `src/site/pro.ts`, `<More>` folds in TUNE / COMPOSE / CODE / DRAW, a single column on phones.
- [~] U5 power layer: DISPLAY ▾ menu done; `?` sheet, Pro switch, Pro extras and dock → `⋯ TOOLS` left.
- [ ] U6 test with 3 people.
- Open (user): the board names and groups, the START HERE list, the landing board (still `henry`), GALLERY, the essay as the front door.
- Known: the `audio-chrome.ts` "mic analyser non-silent" check fails on this machine on `main` too (Chrome's fake mic); `c6-browser.ts` passes after U1 (2026-10-26).

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
- Found in the 2026-10-24 doc sweep; **resolved 2026-10-26** on `feat/ux-u0-u1` (cleanup pass), except the e-ink paper grey, which stays a literal on purpose:
  - **Two different `plotterSVG` functions:** `src/export/plotter.ts` takes dots, and `src/engine/device/plotter.ts` takes a pen plan. The engine index re-exports the device one, so watch imports.
  - **`scripts/c10.ts` checks don't run:** `scripts/verify.ts` doesn't import them, so they never run under `pnpm verify`.
  - **Possibly stale package docs:** `packages/README.md` still describes `@dot480/core/spec` as card spec v0. Check this before relying on the package docs; the packages are unpublished.
  - **Hard-coded colours:** `src/engine/display/stage.ts` `STAGE_COLORS` hard-codes hex colours. The e-ink paper grey is deliberately not a token.
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
