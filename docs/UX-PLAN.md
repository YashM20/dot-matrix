# UX-PLAN: low floor, high ceiling

> **Status (2026-10-26):** U0–U4 are built on branch `feat/ux-u0-u1` (not merged to `main` yet), with the DISPLAY ▾ slice of U5. U4 is built too. The build log is §9: what changed, why, the files, how it was checked, and what's pending. It sits alongside `docs/WEB-PLAN.md` (what the site does) and `docs/SHARE-PLAN.md` (per-card pages, export and the shadcn registry, planned).
> **Goal (from the user):** the layouts and UI are too complicated and confusing. Anyone should be able to land, explore and dive in, and power users should still get everything. Nothing may break.

## 1. Research, short

| Idea | Source | What it means here |
|---|---|---|
| **Progressive disclosure** | Nielsen Norman Group | Show the few things most people need first; put the rest one clearly labelled step away. Staged disclosure spreads a complex task over steps. Movement between levels must be user-driven and reversible. |
| **Low floor, high ceiling, wide walls** | Papert, extended by Resnick (Scratch) | Easy to start, no limit on depth, many paths. Wide walls gets causal evidence from the Scratch community (more engagement and learning). Here: boards to look at, cards to poke, four ways to make. |
| **Multi-layer interfaces** | Shneiderman, *Promoting Universal Usability with Multi-Layer Interface Design* (2003) | Novices start in layer 1, a reduced feature set, and move up when they choose. Experts can jump straight to the top layer and stay there. |
| **Explorable explanations; show the data** | Bret Victor, *Explorable Explanations*, *Learnable Programming*, *Up and Down the Ladder of Abstraction* | Guide attention to what's interesting. Make meaning visible in context, for example hovering a value to see what it is. Let people move between concrete and abstract. Our X-ray is this idea, but it's hidden. |
| **Command palette as a teacher** | Superhuman | ⌘K runs any action and shows its shortcut, so users graduate from palette to keys. A visible entry point must stay (touch has no ⌘K), and power features come only after the plain path works. |
| **Hick's law / information scent** | General HCI | Decision time grows with the number of choices. Labels must say where they lead. Group choices rather than only cutting them. |

**One-line synthesis:** a ladder where every rung is reachable from the one below by one visible, plainly named action, and nothing on a rung requires knowing the next one.

## 2. Where we are (audit, 2026-10-24)
Code read, plus live screenshots at 1440 px and 375 px.

1. **Nothing says what this is or what to do.** The landing view is chips and cards with no sentence of intent.
2. **The primary navigation is 25 cryptic board chips:** HENRY, DEERFLOW12, HENRY3, IR, SIM and the rest. At 375 px they wrap to 5 rows, and the first card starts about 640 px down.
3. **Seven top tabs, five of which overlap:**
   - GALLERY repeats the HENRY board.
   - WORKSPACE (which labels itself "PLAYGROUND"), STUDIO, DOTS and DRAW are four separate "make something" tools.
4. **Interactivity is invisible.** The default board has 0 controls. Interactive cards look the same as static ones, and cards have no description, tooltip or cursor change.
5. **The way from "I like this card" to "let me change it" is hidden.** Remix and edit exist only in the X-ray inspector, the ⌘K palette or the shell.
6. **The makers show everything at once.**
   - STUDIO: 12 panels and about 123 controls at 1440 px, and a 4,441 px tall page on mobile.
   - WORKSPACE: 7 panels and a list of 173 presets.
7. **Power features are key-only:** X, ⇧X, T-scrub, `` ` ``, ⌘K, the Konami code and per-tab keys. Their hints live in hover-only `title` tooltips, so there are none on touch. About 15 URL params are documented nowhere in the UI.
8. **The chrome is jargon:**
   - "CONFIGURATION 01" and "STATUS: NOMINAL";
   - a decorative "LIVE" badge that clashes with the LIVE board;
   - skin names explained only in tooltips.
9. **Mobile:**
   - DRAW can't be reached from the nav (`App.css:350`);
   - the tool dock covers the second card;
   - the skin row takes a line of its own.
10. **Bugs:**
    - The palette's skin list is stale (`src/components/palette/api.ts:10,41`). "lcd" and "e-ink" fail, and FLIP and NIXIE are missing.
    - Tab state is not pushed to the URL, so Back doesn't work across views.

## 3. The ladder (the model everything hangs on)

| Rung | Visitor does | What exposes it (visible, one step) | Today |
|---|---|---|---|
| 0 · **Look** | Lands and sees something alive | The curated "Start here" board plus one sentence of intent | No intent; HENRY is the default |
| 1 · **Touch** | Pokes a card | A hint in the card header (`DRAG`, `TAP`, `SCRATCH`, `CAMERA`) and a pointer cursor on control hit areas | Invisible |
| 2 · **Peek** | "How is this a dot matrix?" | A card action **ⓘ How it works**, which opens the X-ray for that card | X key or the dock only |
| 3 · **Remix** | Changes this card | A card action **Remix**, which opens the card in MAKE at the right mode | Hidden in the X-ray |
| 4 · **Build** | Makes their own | MAKE: TUNE → COMPOSE → CODE / DRAW, each starting simple with "More" sections | Four separate tabs, all fully expanded |
| 5 · **Hack** | Bends the tool | ⌘K, the shell, keys, URL params, renderer and worker overrides, and a **Pro** switch | Exists, but undocumented in the UI |

Rules:
- **Every feature is reachable by click.** Keys and URLs are accelerators, never the only way in. The palette shows the shortcut beside each command.
- **Nothing is removed for power users.** It is folded one level down, and a persistent **Pro** setting (`localStorage`, and `?pro=1`) opens every fold by default.
- **Folds remember their state** per visitor, so experts fold things once.

## 4. Information architecture

### 4.1 Top level: 7 tabs → 3
| New | Contains | Old |
|---|---|---|
| **EXPLORE** | Boards, grouped (§4.2) | BOARDS, GALLERY |
| **MAKE** | One maker with modes **TUNE · COMPOSE · CODE · DRAW** | WORKSPACE, STUDIO, DOTS, DRAW |
| **ABOUT** | What this is, the essay, how it works, shortcuts and URL params, changelog | LOG (+ `essay.html`) |

- GALLERY goes: it is the HENRY board again. Its `?tab=gallery` link opens EXPLORE → HENRY.
- Every old link keeps working through an alias table:
  - `?tab=workspace|studio|dots|draw|log|gallery|essay`;
  - `?board=`, `/<board>/`, `?card=`, `?p=`, `?skin=`, `?play=`, `?np=`, …

  `scripts/verify.ts` gets a check that every old URL still resolves to the same view.
- The URL follows navigation (`/<board>/`, `?make=compose`, `?about`) with `history.pushState`, so Back and Forward work. The prebuilt `/<board>/` pages are unchanged.

### 4.2 Boards: 25 chips → a grouped picker
Add display metadata in `src/widgets/manifest.ts`. The metadata is UI-only, and ids, URLs, goldens and OG pages stay as they are.
- `label`: a plain name.
- `blurb`: one line.
- `group`.
- `tags`: `touch`, `camera`, `audio`, `live-data`, `game`.

**Groups as built in U1 (`boardGroups` in `src/widgets/manifest.ts`).** These are defaults; the user can still change names and membership in the taste session (§7).

| Group | Boards | One-liner (`src/widgets/blurbs.ts`) |
|---|---|---|
| **START HERE** (a tour; its boards also sit in their own group) | henry, mosaic, physics, heal, levels, instrument, cinema | "A short tour of what this dot matrix can do." |
| **INTERFACES** | henry, deerflow12, mosaic, henry3, metro, ride, audio, lock, components, surfaces | "Whole interface kits drawn only with dots." |
| **DATA** | live, departures, heartbeat | "Boards that show changing data: weather, transit, an agent's state." |
| **PLAY** | levels, physics, instrument, scope, mirror, heal | "Touch it, play it, hear it." |
| **ENGINE** | ir, sim, light, gpu, type, cinema | "Engine demos: programs, light, simulation, half a million dots." |

Two departures from the first draft:
- The group was renamed from "Live" to **DATA**, so it doesn't clash with the LIVE board.
- The AUDIO board moved to INTERFACES, because it's a static UI kit.

**Plain labels:**
- `henry` → MICRO UI
- `deerflow12` → DASHBOARD
- `henry3` → PERSONAL
- `ir` → PROGRAMS
- `sim` → LIVING
- `gpu` → 500K DOTS

Every other board shows its id. Ids and URLs never change.

- **Desktop:** one row with the group names and the group's one-liner, and the boards of the open group below them. The board's description shows under its title and as the chip tooltip. Tag icons (camera, audio, touch) were not built: the descriptions say it in words. U2's card hint verbs cover touch.
- **Mobile (≤ 760 px):** one **BOARD ▾** native select with optgroups, which the phone shows as its own picker sheet. That takes 5 rows of chips down to 1 line.
- **Landing:** the landing board is still `henry` (MICRO UI). START HERE begins with it, so a new visitor lands inside the tour. Moving `/` to another board is a taste decision. It would also change which board chunk is in the first load.

### 4.3 Header and footer
- **Header:** brand · EXPLORE / MAKE / ABOUT · **DISPLAY: OLED ▾** · a `?` help button.
  - The display menu lists the skins with one line each ("CRT: phosphor glow and afterimage").
  - The decorative LIVE badge goes. A red status dot appears only on boards that really stream live data, which follows DESIGN.md's statusDot rule.
- **Footer:** plain and useful: "Every pixel is a dot sampled from a field · How it works · Shortcuts (?) · Source".
  - "FIELD → SAMPLER → RENDERER" stays, because it is the identity.
  - "CONFIGURATION 01" and "STATUS: NOMINAL" go, or move into ABOUT as flavour.

## 5. Component changes

### 5.1 First visit (rung 0)
- One line of intent above the first board: *"A dot-matrix UI engine. Every pixel here is a dot sampled from a field. Touch the cards; press ⓘ to see how."*
  - It is dismissible and remembered.
  - It is HTML chrome, like the board title, so it doesn't touch the Field → Sampler → Renderer rule, which covers card visuals.
- No modal tour and no forced onboarding. The page itself is the tutorial.

### 5.2 Cards (rungs 1–3)
- **Header hint:** a small grey verb on cards that have controls. It is derived from `controls` and preset tags (`DRAG`, `TAP`, `HOLD`, `SCRATCH`, `CAMERA`, `SOUND`), never in accent red. It is HTML, next to the existing card name in `DotWidget.tsx`.
- **Cursor:** `pointer` or `grab` over control hit areas (`ControlOverlay.tsx` already knows the rectangles).
- **Action strip** on hover or keyboard focus, and always shown as a `⋯` button on touch:
  - **ⓘ How it works** opens the existing X-ray for this card;
  - **Remix** opens MAKE with this card (CODE if it has an IR program, otherwise TUNE, and COMPOSE from the X-ray);
  - **Link** copies the `?card=` deep link;
  - **PNG** exports the card.

  It reuses the X-ray remix code (`src/components/xray/remix.ts`).
- **Optional `blurb` per card**, shown in the ⓘ panel header and not on the card face, so the cards stay clean.

### 5.3 X-ray, plain-language first (rung 2)
- It opens on a new **SUMMARY** tab. It says, in words: what field this card uses, how many dots it has, what the controls change, and "hover any dot to see its value". The existing LAYERS / DATA / DESCRIBE / SPEC tabs move behind it.
- Each panel term gets a hover/tap definition in a small glossary for lattice, site, tone, quantize and IR. The same glossary feeds ABOUT.
- On small screens it becomes a bottom sheet, so it no longer covers the board picker.

### 5.4 MAKE (rung 4): one maker, staged
- A mode switch: **TUNE · COMPOSE · CODE · DRAW**, with one line under each ("change a preset's look", "layer and animate a card", "write a field program", "paint dots"). TUNE is the default. Modes stay lazy chunks, as today.
- **Every mode** follows the same pattern: canvas + the 3–5 most used controls + **Export** visible, and everything else in named, collapsed **More** sections. **Pro** opens all of them.

| Mode | Visible by default | Folded under "More" |
|---|---|---|
| TUNE (today's WORKSPACE) | Preset picker (grouped like the boards, with search), preview, top controls, Export (PNG/SVG/link) | DATA, PHOTO, TRANSITION LAB, ADVANCED/APPEARANCE, video, plotter and React-snippet export |
| COMPOSE (today's STUDIO) | Canvas, Layers, Inspector (basic props), Export | States, Edges, Timeline, Bindings, Card, Scorecard, Bar sheet, Devices, Spec/JSON |
| CODE (today's DOTS) | Examples gallery ("pick one, change a number"), editor, preview | Remix graph, grid/lattice/tone, data |
| DRAW | Canvas, brush, export | Reference/auto-trace, pitch, history |

- **Plain labels first, technical term second:** "Animation (timeline)", "Device preview (toDevice)", "Quality checks (scorecard)".
- **Mobile:** a single column with the canvas sticky at the top. More sections stay folded, which brings STUDIO from about 4,400 px tall to about one screen plus folds.

### 5.5 Power layer (rung 5)
- **`?` help sheet**, also a button in the header and the dock. It lists every key per view, the URL params with examples, and a "Pro mode" switch. Its data comes from one source that the palette, shell `help` and ABOUT also read, so they can't drift.
- **Palette:**
  - lists every command with its shortcut on the right;
  - fix the skin list (`api.ts:10,41`) by reading `SKIN_NAMES` from `src/engine/display/names.ts`;
  - add commands for every board, every MAKE mode, Pro mode and each URL toggle.
- **Dock:**
  - keeps X-RAY, TIME, ⌘K and `>_`, and gains `?`;
  - the board content gets bottom padding the height of the dock, so it never covers a card;
  - on narrow screens it folds into one `⋯ TOOLS` button.
- **Pro mode:**
  - opens every More fold;
  - shows the renderer, worker and FPS controls in MAKE;
  - shows raw ids next to labels (`HOME OS · henry`).

## 6. Not breaking anything: guardrails
- **Card pixels don't change.** All of this is HTML chrome and app code. No `src/engine` change and no new dependency. `pnpm golden --check` must stay byte-identical, and `pnpm check` must stay green.
- **One accent:** hints, help and action strips are grey (`value` / `mid`). Red keeps its meaning (live, active).
- **Links:** an alias table plus a verify check for every old `?tab`, `?board`, path and param. OG pages and `dist/<board>/index.html` are unchanged.
- **Budget:** first load stays ≤ 150 kB gz (about 1 kB left today). The new chrome must be tiny. The grouped picker reuses manifest metadata. The help sheet, glossary and X-ray SUMMARY are lazy, like CommandLayer, and the board-meta strings are counted in the budget check.
- **A11y:**
  - real `role=tablist`/`tab` for EXPLORE/MAKE/ABOUT and MAKE modes;
  - the board sheet is a proper dialog;
  - the action strip is reachable by keyboard;
  - nothing is hover-only.
- **Screens:** before/after screenshots at 1440 and 375 px for each phase (the audit script approach). The existing browser probes (C10/C6/skins/game) must pass.
- **Small PRs:** one phase per PR, each revertable. A `?ui=classic` flag can keep the old shell for one phase if a side-by-side comparison is wanted.

## 7. Phases
| Phase | Scope | Size | Status |
|---|---|---|---|
| **U0 · Fixes** | Palette skin bug; DRAW reachable on mobile; dock padding so it doesn't overlap the footer; LIVE badge only when live; plainer footer; URL pushes tab/board | ½ day | **Done** 2026-10-24 (§9) |
| **U1 · Orientation** | Grouped board picker (desktop row and mobile menu); plain labels; a one-line description per board and group; START HERE tour; intent line | 1–2 days | **Done** 2026-10-24 (§9); the DISPLAY ▾ menu moved to U5 |
| **U2 · Card ladder** | Header hint verbs; cursors; action strip (ⓘ / Remix / Link / PNG); X-ray SUMMARY tab and glossary; X-ray as a bottom sheet on mobile | 2 days | **Done** 2026-10-26 (§9) |
| **U3 · IA merge** | EXPLORE / MAKE / ABOUT; alias table and verify check; GALLERY folded in; LOG and essay links in ABOUT | 2 days | **Done** 2026-10-26 (§9), with the plan's proposed names; the taste session can still rename |
| **U4 · Staged makers** | More folds and plain labels in TUNE/COMPOSE/CODE/DRAW; remembered fold state; mobile single column | 3–4 days | **Done** 2026-10-26 (§9); Pro renderer/worker/FPS controls and raw ids moved to U5 |
| **U5 · Power layer** | `?` help sheet from one shortcut registry; palette completeness; Pro mode; shell `help` from the same registry; DISPLAY ▾ menu; the dock folds into `⋯ TOOLS` on phones | 1–2 days | DISPLAY ▾ menu **done** 2026-10-26 (§9); the rest next |
| **U6 · Check with people** | 3 friends, 5 minutes each, no hints (§8) | 1 hour + fixes | Not started |

Order: U0, U1 and U2 deliver most of the clarity without moving any tool. U3 and U4 are the bigger structural changes, so they come after the taste session confirms names and groups.

**Decisions for the user (taste session, about 30 minutes):**
1. Board display names and the five groups (§4.2, as built).
2. Which boards make **START HERE**, and which one is the landing board (now `henry`).
3. Whether GALLERY goes. It repeats the `henry` board.
4. Whether the essay becomes the front door (WEB-PLAN C10). The proposal: keep a live board as the front door, and let the intent line link to the essay, as built.

## 8. How we'll know it worked
| Check | Target | Before (audit) | After U1 |
|---|---|---|---|
| Top-level choices on first screen | ≤ 4 views, ≤ 6 groups | 7 tabs + 25 chips + 7 skins | After U1: 7 tabs + 5 groups + 7 skins. **After U3/U5: 3 views + 5 groups + one DISPLAY ▾ button** |
| First card top at 375 px | ≤ 300 px | about 640 px | 360 px with the intent line; about 250 px once it is dismissed |
| Features reachable only by key or URL | 0 | X-ray-all, time scrub, shell, Pro toggles, all URL params | After U2–U4: per-card X-ray, remix, link and PNG are on the card; keys and URL params are listed in ABOUT; Pro has no switch yet (`?pro=1` only, U5) |
| A newcomer, unprompted, can… | say what the site is in 5 s; make a card react in 30 s; reach "how it works" in 1 min; remix and copy a link in 3 min | not tested; likely fails 1 and 3 | the intent line and descriptions target 1; untested with people (U6) |
| Breakage | Goldens unchanged; every old link resolves; budget ≤ 150 kB; probes pass | n/a | U1: goldens 173/173, 142.9 kB gz. **U2–U5 merged: goldens 173/173, every old link resolves (verify), 143.87 kB gz, probes pass (§9)** |

## 9. Build log

### U0 + U1 (2026-10-24, branch `feat/ux-u0-u1`)

**Why.** The audit (§2) found three problems:
- a first-time visitor got no sentence of intent;
- 25 cryptic chips (5 rows on a phone) were the primary navigation;
- several small bugs made the site feel broken: wrong skins in ⌘K, DRAW missing on phones, Back not working across views.

U0 and U1 fix orientation (rung 0 of the ladder, §3) without moving any tool, so nothing a returning visitor knows stops working.

**What changed:**

| Area | Change | Why | Files |
|---|---|---|---|
| Board picker | Five groups. Desktop shows the group tabs, the group's one-liner and the open group's chips. At ≤ 760 px a native `<select>` with optgroups lists every board: the phone shows its own picker sheet, and it costs a few hundred bytes with no custom dialog. A board opened from elsewhere (palette, shell, Back) opens its own group; that state is adjusted during render, not in an effect. | Hick's law and information scent (§1): 5 named choices instead of 25 opaque ones | `src/components/BoardPicker.tsx`; `src/widgets/manifest.ts` (`boardGroups`, `boardLabel`, `groupOf`); `src/App.css` (U1 block) |
| Plain labels | Display names for the cryptic ids (§4.2). Ids, paths, OG pages and goldens are untouched. | Labels must say where they lead | `manifest.ts` (`LABELS`) |
| Descriptions | One line per board (under its title, and as the chip tooltip) and per group | Explorable explanations: say what to try, in place | `src/widgets/blurbs.ts` (lazy chunk); `src/components/useBlurbs.ts`; `src/components/Board.tsx` |
| Intent line | "Interfaces drawn entirely in dots…" with an essay link and ×. Dismissal is stored in `localStorage` (`dot480:intro` = `off`). It is HTML chrome like the board title, so the Field → Sampler → Renderer rule for card visuals is unaffected. | Rung 0: what is this, what can I do | `src/App.tsx` (`IntroLine`) |
| URLs and history | Every view change pushes a history entry; the first render only normalises the URL. The path names the board (the first board keeps `/`), `?tab=<view>` names other views, and `?board=` folds into the path. `?worker`, `?skin` and the DOTS `?p` survive, and Back / Forward restore the view through `popstate`. | Back was broken across views, and other views had no link of their own | `src/site/meta.ts` (`syncUrl`, split out of `setPageMeta`); `src/App.tsx` (`viewFromUrl`) |
| LIVE badge | Shown only on boards with live sources (`liveBoards`: live, surfaces), as "LIVE DATA" | Red means live (DESIGN.md); a permanent badge was noise | `App.tsx`; `manifest.ts` |
| Footer | "Every pixel is a dot sampled from a field · FIELD → GRID SAMPLER → RENDERER · How it works · Source" | Replaces the jargon "CONFIGURATION 01 / STATUS: NOMINAL" | `App.tsx`; `App.css` |
| Mobile nav | The view tabs wrap instead of hiding the last one | DRAW was unreachable at ≤ 760 px | `App.css` |
| Dock room | `.shell` has 64 px of bottom padding | The fixed dock covered the footer | `App.css` |
| ⌘K and shell | The skin list comes from `SKIN_NAMES` (`src/engine/display/names.ts`), with entries like "Display skin — CRT: phosphor…". Board items show labels and still match ids. The shell's stale "display skins land with C7" message is gone. | "lcd" / "e-ink" failed; FLIP / NIXIE were missing | `src/components/palette/api.ts`; `Shell.tsx` |
| Small fixes | The brand label shows the tab (no more "PLAYGROUND"). Essay links are root-absolute (`/essay.html`), because the relative form broke under `/<board>/` paths. | Correctness | `App.tsx`; `src/changelog.ts` |
| First-load budget | The audio engine moved behind a lazy `AudioCards` wrapper that mounts only on INSTRUMENT / SCOPE and is fetched alongside the board chunk. First load dropped from **148.9 to 142.9 kB gz**. | Adding the picker would otherwise have broken the 150 kB budget; this leaves about 7 kB for U2–U5 | `src/audio/AudioCards.tsx`; `src/components/Board.tsx` |
| Visitor changelog | Release "0.10 Easier to find your way" in the LOG tab; the stale "COMING UP" list was rewritten | Visitors see what changed and what's next | `src/changelog.ts` |

**How it was checked:**
- **`pnpm check` passes in full.** That covers tsc, oxlint (no new warnings) and verify, including 4 new `ux:` checks:
  - every board is in exactly one group;
  - START HERE boards are real;
  - labels are unique and every board has a description;
  - `/light/` and `/glyph/` still resolve.
- **Goldens:** `pnpm golden --check` matches all 173 presets, so the cards are pixel-identical.
- **Budget:** `npx tsx scripts/site/size.ts --check` reports 142.94 kB gz (budget 150).
- **Mobile probe:** `scripts/site/mobile.ts` passes against `vite preview` of a full build, OG images and crawler pages included. Two edits:
  - it hovers `[data-board=…]` instead of `:nth-child(3)`;
  - its "first load fetches only static imports" check names the chunks that load after first paint by design: `blurbs` and the idle-mounted command layer (`CommandLayer`, `Palette`, `Shell`, `fuzzy`, `describe`).
- **C10 probe:** `scripts/c10-browser.ts` passes 45/45 on the dev server.
- **Audio probe:** `scripts/audio-chrome.ts` passes 22/23. It now picks boards through `.board-select select`, because the picker shows one group at a time.
  - The one failure, "mic analyser non-silent" (−60 dBFS), fails the same way on a clean `main` worktree. It's Chrome's fake capture device on this machine, not this change.
- **Behaviour check** (playwright-core, throwaway install outside the repo), with no console errors:
  - group switching;
  - board → STUDIO → Back → Back → Forward;
  - `?board=glyph` → `/lock/`;
  - `?tab=studio`;
  - intro dismissal surviving a reload;
  - the mobile select opening INSTRUMENT with its 9 cards and the audio engine loading.

**Pending / known:**
- **Taste decisions (§7):**
  - labels and groups;
  - the START HERE list;
  - the landing board;
  - GALLERY;
  - the essay as the front door.
- **Moved to U5:** the DISPLAY ▾ menu, and folding the dock into `⋯ TOOLS` on phones. The dock still floats over cards while you scroll, though no longer over the footer.
- **Still key-only:** features that are keyboard-only stay that way until U2 (card action strip) and U5 (`?` sheet).
- **Pre-existing, not touched:** the skin segments are 20 px tall at 375 px, under the 24 px tap target. The mobile probe lists them.
- **Not run:** `scripts/c6-browser.ts` (camera and hand tracking). It clicks the INSTRUMENT chip from the MIRROR board, and both sit in PLAY, so it should still find it. It needs a camera-emulating Chrome run to confirm.

### U2 + U3 + U4 + U5 slice (2026-10-26, branch `feat/ux-u0-u1`)

**How it was built.** Four agents in parallel git worktrees, one per phase, plus one for cleanup (below). Each checked only its own area (AGENTS.md › Testing). They were merged in the order U3, U2, U5, cleanup, U4, and the full suite ran once on the merged branch. Merge fixes:
- `App.css`: each agent appended one block, and two of the blocks lost their closing braces in the merge. The braces were restored, and the counts match (602 `{` / 602 `}`).
- `CommandLayer.tsx`: U2's imports were combined with U3's.
- The X-ray buttons were renamed to OPEN IN CODE / OPEN IN COMPOSE, and the probes use U3's URLs plus `&pro=1` (U4).

**Why.** U2–U5 cover rungs 1–5 of the ladder (§3):
- U2: touch, peek and remix from the card itself;
- U3: three places instead of seven tabs;
- U4: makers that start simple;
- the U5 slice: one display menu.

The taste-session names (§7) were not decided, so U3 uses the plan's proposals. They can still be renamed: the alias table keeps every link working.

| Phase | Change | Files |
|---|---|---|
| U2 | **Hint verb** in grey on cards with controls, picked in this order: CAMERA, SCRATCH, HOLD, SOUND, DRAG, TAP. It sits in the header, or in the top padding when the card draws its own name in dots. | `src/components/DotWidget.tsx` |
| U2 | **Action strip** ⓘ / REMIX / LINK / PNG. It shows on hover and on keyboard focus; on touch a `⋯` button opens it. It is routed through `cardAction()` / `onCardAction()` in the X-ray store, which queues clicks until the command layer mounts. REMIX goes to MAKE · CODE (IR cards) or MAKE · COMPOSE. PNG is `src/export/still.ts`, loaded lazily. | `DotWidget.tsx`; `xray/store.ts`; `palette/CommandLayer.tsx`; `src/export/still.ts` |
| U2 | **X-ray SUMMARY** is the first, default tab: fields, dot count, lattice and sites, quantize, IR, and what each control does. A **glossary** of field, lattice, site, tone, quantize and IR shows on hover or tap. At ≤ 760 px the X-ray is a **bottom sheet**. | `xray/Inspector.tsx`; `src/components/glossary.ts` |
| U3 | **EXPLORE / MAKE / ABOUT** with real tablist semantics and arrow keys. MAKE has a **TUNE · COMPOSE · CODE · DRAW** switch with one grey line per mode. **ABOUT** (lazy) holds the intro, the essay and source links, keys and URL params (`src/site/shortcuts.ts`), and the changelog. GALLERY is gone. | `src/App.tsx`; `src/components/About.tsx`; `src/site/shortcuts.ts` |
| U3 | **URLs.** The pure resolver `src/site/views.ts` (`viewFromUrl`, `urlForView`, `TAB_ALIASES`) gives canonical `/<board>/`, `?make=<mode>` and `?about`. Every old `?tab=` / `?board=` / path resolves, which 4 new `ux:` verify checks enforce. The palette has one item per view and mode, and the shell `open` takes old and new names. | `views.ts`; `meta.ts` (`syncUrl`); `palette/*`; `src/lib/share.ts`; `scripts/verify.ts` |
| U4 | **Pro mode**: `src/site/pro.ts` (`isPro`, `setPro`, `togglePro`, `subscribePro`) reads `?pro=1` or `localStorage dot480:pro`. **`<More>`** (`src/components/More.tsx`) is a remembered `<details>` fold (`dot480:fold:<id>`) that is open by default in Pro. Folded content stays mounted. | `pro.ts`; `More.tsx` |
| U4 | **Staged makers** per §5.4 (plain label first, term second). TUNE folds data, photo, transition lab, advanced, appearance, and video/plotter/code export. COMPOSE folds states, timeline, bindings, card, scorecard, bar sheet, devices and spec. CODE folds the remix graph, grid/tone and data. DRAW folds pitch, history and trace. On phones the makers are a single column with a sticky canvas. | `playground/*`, `studio/Studio.tsx`, `studio/SidePanel.tsx`, `dwitter/*`, `draw/*`; `App.css` |
| U5 slice | A **DISPLAY: OLED ▾** menu replaces the 7 skin buttons: `menuitemradio` items with one line each, full keyboard support, targets ≥ 24 px. | `src/components/skins/SkinSwitcher.tsx`; `App.css` |
| Cleanup | The device plotter is renamed `penPlanSVG` (no more `plotterSVG` clash). `scripts/c10.ts` runs under verify (`c10Checks`). `packages/README.md` gets the spec story right. Three `STAGE_COLORS` now use tokens. The `c6-browser` probe passes after U1. | `src/engine/device/plotter.ts`, `scripts/verify.ts`, `scripts/c10.ts`, `src/engine/display/stage.ts`, `packages/README.md` |

**How it was checked (merged branch, full suite once):**
- `tsc -b` clean; oxlint shows only the 6 old warnings.
- `verify` passes everything except "mirror-camera ≤ 4 ms", a timing check. Its code didn't change, and run alone it measured 3.9, 5.0 and 5.3 ms, so it's machine variance.
- `pnpm check` itself refused to start: pnpm's dependency check wanted to reinstall. The three steps were run directly instead.
- Goldens: 173/173 match.
- Full build; `size.ts --check` reports **143.87 kB gz** (budget 150).
- `scripts/site/mobile.ts` passes on `vite preview`, including `?make=*` and `?about`.
- Probes on the dev server:
  - `c10-browser`: all 48 pass;
  - `dots-browser`: all pass;
  - `studio-browser`: all pass.
- Per agent, before merge: U2's headless strip and sheet checks; U3's 25 Back/Forward and alias checks; U5's keyboard and 375 px menu checks; and `c6-browser`.

**Pending / known:**
- **U5 rest:**
  - the `?` help sheet (data is ready in `src/site/shortcuts.ts`);
  - a visible Pro switch (the API is ready);
  - Pro's renderer/worker/FPS controls and raw ids;
  - the dock folding into `⋯ TOOLS` on phones.
- **U6:** test with 3 people.
- **Taste session (§7):** the names, groups, landing board and front door.
- `studio-browser` "scrub: the enter track…" fails intermittently, on base too: its fixed 250 ms wait races idle scorecard work.
- Small tap targets left: the dock buttons are 23 px, the footer links 10 px tall, and COMPOSE's layer rows 22 px.
- A dev server started inside `.claude/worktrees/` doesn't see edits (`vite.config.ts` ignores `.claude/**`), so restart it after every change.
- Next product plan: `docs/SHARE-PLAN.md` (widget metadata, slug + short uid links, widget page with pill action bars, copy/share/embed, shadcn registry).

## Sources
- [NN/g: Progressive Disclosure](https://nngroup.com/articles/progressive-disclosure/)
- [Pattern Playground: progressive disclosure (staged, reversible)](https://pattern-playground.onrender.com/patterns/progressive-disclosure)
- [Testing the "wide walls" design principle in the wild](https://blog.communitydata.science/testing-the-wide-walls-design-principle-in-the-wild/), [MIT MAS.714J brief (low floor / high ceiling)](https://ocw.mit.edu/courses/mas-714j-technologies-for-creative-learning-fall-2009/a3162dbc4de046e3f231c72277bd7fe3_MITMAS_714JF09_proj2_brief.pdf)
- [Shneiderman: Promoting Universal Usability with Multi-Layer Interface Design](https://www.cs.umd.edu/~ben/ACM-CUU2003.pdf)
- [Explorable explanation (Wikipedia)](https://en.wikipedia.org/wiki/Explorable_explanation), [Bret Victor: Learnable Programming](https://worrydream.com/LearnableProgramming)
- [Superhuman: How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- [Hick's law: building usable navigations](https://www.designorate.com/?p=1844)
