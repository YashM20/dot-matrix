# POLISH-PLAN: refine, fix and patch the site

> **Status (2026-10-28):** planned, queued after round 2. Audited on `feat/round2` at `7737a20` (T3 grids and the essay / legal / X-ray theming included). Nothing here is built yet.
> **Asked for (owner):** "refine the product, fix issues and patch things": spacing, padding, overlap, out-of-bounds, text wrapping; layout; navigation; sticky header and footer; options that don't help anyone; and a direct way to reach the essay. Already planned items are referenced, not re-planned: `docs/LAYOUT-THEME-PLAN.md` (T3 grids, T5 picker, T6 type and contrast) and `docs/UX-PLAN.md` (U5, U6, §7 taste session).

## 0. Evidence

**Screenshots** (`scripts/site/shots.ts`, plus 768 px captures from the probe) are in `C:/Users/integrated/AppData/Local/Temp/dmdocs/polish/shots/`, named `<theme>-<page>-<width>.png`. The full set of 55 is in `../allshots/`.

**Probe** (`C:/Users/integrated/AppData/Local/Temp/dmdocs/polish/probe.mts`, raw output in `probe-dark_signal.json`): 9 pages × 1440 / 768 / 390 / 320, `dark_signal`, plus `light_signal` at 1440 / 768 / 390. Real-input history test: `nav.mts`, output in `nav.json`. Results cited below as #n:

| # | Check | Result |
|---|---|---|
| 1 | Horizontal overflow (`scrollWidth > clientWidth`) | 0 on 35 of 36 page × width runs. `privacy@320` is 325 / 320, caused by a `code` with `nowrap`. Chrome ran with `--hide-scrollbars`, so `100vw` overflow is invisible to this check (L1). |
| 2 | Fixed / sticky elements | **1440 and 768: nothing is pinned on any page.** The header is gone after 56 px. Phones: the top bar is sticky (0–52) and the tab bar fixed (785–844). The widget page on a phone pins its own pills and has no tab bar. Essay and legal pages: nothing is pinned at any width. |
| 3 | Page heights | Essay 16.5k px (1440) / 18.8k (390) / 21.5k (320). ABOUT 4.8k / 8.7k / 9.4k. Privacy 4.1k–6k. |
| 4 | Interactive elements covered by a fixed layer | `widget@1440`: at mid scroll the floating `.pal-dock` covers the footer's SOURCE, PRIVACY and TERMS links. |
| 5 | Scroll inside an app view | MAKE at 1440 scrolls 241 px (206 at 768) to reveal a footer under the editor. |
| 6 | Small targets | Desktop: view tabs 48×10 / 27×10 / 34×10 px, dock buttons 21 px tall, group tabs 21 px, intro × 25×24. Essay nav 13 px tall and TOC links 14 px tall at every width (41–42 targets). Legal nav 29 px and legal footer links 12 px tall on phones. ABOUT links 24 px tall on phones. The hero's "pick one" is 54×18. The widget page's board link is 50×13. |
| 7 | Focus order | Home at 1440: header → hero card (right column) → intro (left) → picker. Phone home: top bar → hero card at y = 3768 → back up to the intro at y = 64. There is no skip link. With 4 action buttons per card, a 9-card board is 36 Tab stops before the footer. Essay: Tab jumps from y 1166 to y 7549, because the figure controls aren't mounted until they're scrolled into view. ABOUT on a phone: the tab bar sits mid-order (before the footer), and the focused "OPEN DEPARTURES" lands under the tab bar. |
| 8 | Clipped text | `home@320`: the new short intro "Every card is a live dot field." is cut off with an ellipsis. Nothing else, apart from `sr-only` and the editor's doc name. |
| 9 | Deep link and reload | Every route reloads to the same view. On `vite preview`: `/about`, `/essay/` and `/nope/` open the **home board** at the wrong URL. `/essay` works on preview only. `/widget/nope/` shows the widget page's empty state. |
| 10 | Back / Forward (real mouse and touch) | (a) View history works: `/lock/ → ?about → ?make` steps back and forth correctly. (b) **Scroll is not restored:** back on `/lock/` (left at y 500) lands at y 23, and back on ABOUT (left at 1500) at y 23. (c) **Phone: Back with the boards sheet open leaves the view and keeps the sheet open** over ABOUT. The next tap then lands on the stale sheet: tapping TOOLS opened DEPARTURES. (d) Coming back from the essay restores the scroll position. The widget page's prev / next / back history is correct. |
| 11 | Live site (`curl https://dot-matrix1.vercel.app/<path>`) | `/essay`, `/essay/`, `/about` and `/nope/` all serve the home board's title. `/privacy`, `/terms` and `/essay.html` are fine. |
| 12 | Chrome text under 12 px | 59% of chrome characters at 1440, 65% at 390. T6 owns this; it isn't re-planned here. |

## 1. Findings

Severity: **broken** (wrong result or unreachable), **ugly** (works but looks or feels wrong), **nit**. Line numbers are at `7737a20`.

### 1.1 Navigation and wayfinding

- **N1 · broken: the essay has no direct URL.**
  - **Where:** `vercel.json:6–14` has no rewrite for `/essay` or `/essay/`. All in-site links point to `/essay.html`.
  - **Evidence:** #9, #11.
  - **Fix:**
    - Make `/essay/` canonical: rewrites for `/essay` and `/essay/` → `/essay.html`. `/essay.html` and `?tab=essay` keep working.
    - Teach `vite preview` the same rewrites (a `configurePreviewServer` hook in `vite.config.ts`), so the probes see what production does.
    - Point every link at `/essay/`.
- **N2 · broken: the essay is hard to find.** Today the ways in are:
  - the intro line (`src/App.tsx:120`), which is gone for good once dismissed;
  - "HOW IT WORKS" in the 9 px footer (`App.tsx:46`);
  - ABOUT's links;
  - one changelog entry.

  The header, the phone tab bar and the palette have nothing. Typing "essay" in ⌘K offers "Go to ABOUT", because `essay` is an ABOUT keyword (`src/components/palette/api.ts:54–57`).
  - **Fix:** one label everywhere (owner decision 1), and these entries:
    - **Header (desktop):** an `ESSAY ↗` link right after the EXPLORE / MAKE / ABOUT tablist. It is a link, not a `role=tab`, because it is its own page; on the essay it shows as current.
    - **Phone:** ABOUT opens with a full-width "Read the essay" band (64 px tall, first thing under the bar). The tab bar stays at four tabs.
    - **Home:** the end of each board gets a second row next to NEXT BOARD: "How it works: the essay →". The intro keeps its link, but dismissing the intro no longer removes the only visible way in.
    - **⌘K:** a `Place` item "Read the essay: Ditherpunk for UI" with keywords `essay guide blog how it works docs tour`, ranked with the views, so "essay" matches it first.
    - **Footer:** the first link, with the same label.
- **N3 · broken: the widget page drops the site chrome.**
  - **Where:** the `widget` branch of `App.tsx:213–217` renders no top bar and no `TabBar`. There is no brand or home link, no EXPLORE / MAKE / ABOUT and no DISPLAY menu. The dock can't portal into `.topbar-dock` (`CommandLayer.tsx:46`), so it floats bottom right and covers the footer links.
  - **Evidence:** #4; shots `dark_signal-widget-timer-1440.png` and `-390.png`.
  - **Fix:**
    - Render the same header (and the phone tab bar) on the widget page; the dock then goes back into the header.
    - The page's prev / next pills sit under the header on desktop.
    - On phones the top bar's place title shows the card's name, and its ‹ goes back to the board.
- **N4 · broken: phone Back with a sheet open.**
  - **Where:** `src/components/Sheet.tsx` (the sheet is not a history entry); `App.tsx:180` (`onPop` never closes `BoardSheet`).
  - **Evidence:** #10c.
  - **Fix:**
    - Opening a sheet pushes `{ sheet: label }`. A popstate that removes that entry closes the sheet; DONE, Escape and the scrim call `history.back()` when the top entry is the sheet's own.
    - The same goes for the phone palette, the X-ray sheet and the editor sheets.
    - This is the "Android Back closing sheets" item in `docs/PROGRESS.md` (Resume, next ranked).
- **N5 · ugly: scroll position isn't restored on Back / Forward.**
  - **Where:** `App.tsx:174–212` (`syncUrl`, `onPop`).
  - **Evidence:** #10b.
  - **Fix:**
    - Set `history.scrollRestoration = 'manual'`.
    - Before each push, `replaceState` the leaving entry with `{ y: scrollY }`.
    - On popstate, restore `y` once the view has mounted (the board's cards or ABOUT's bands).
    - A new view starts at the top.
- **N6 · ugly: unknown paths open the home board at the wrong URL.**
  - **Where:** `src/site/views.ts:46` falls back to `boardIds[0]`.
  - **Evidence:** #9 (`/nope/`, `/about`).
  - **Fix:** treat `/about` and `/about/` as aliases of `?about`. An unknown first segment → `replaceState('/')` plus a toast "No board called nope". Owner decision 6 picks between that and a not-found band.
- **N7 · ugly: three different navs.**
  - **Where:**
    - the app header;
    - the essay's `site-nav` (`src/essay/Essay.tsx:44–47`), where MAKE goes to `?make=code` while the app's MAKE opens TUNE;
    - the legal `legal-nav` (`privacy.html:19`, `terms.html:19`).
  - **Evidence:** shots `dark_signal-essay-1440.png` and `dark_signal-privacy-1440.png`.
  - **Fix:** one static site bar, shared by the essay and the legal pages: brand → `/`, EXPLORE, MAKE (`/?make`), ABOUT, ESSAY, with `aria-current` on the page you are on. It uses the `.topbar` tokens and is sticky (S2).
- **N8 · ugly: focus order and Tab cost.**
  - **Where:** the home hero is floated (`src/App.css:636`) but comes first in the DOM (`App.tsx:236`). Each card has four action buttons.
  - **Evidence:** #7.
  - **Fix:**
    - Put the hero after the picker in the DOM and place it with grid areas, not a float.
    - Add a "Skip to the cards" link as the first stop.
    - Make the card action strip one Tab stop per card, with arrow keys moving across its four buttons (a roving tabindex inside `DotWidget`'s strip).
    - Essay figures: mount a figure's control overlay as soon as it takes focus (focus-within), or keep a focusable placeholder that mounts on focus.
- **N9 · nit: changelog links.**
  - **Where:** `src/components/Changelog.tsx:19` and `src/changelog.ts`.
  - **Problems:**
    - The in-app links are plain `<a href="?make=compose">`, so they reload the page.
    - "OPEN THE MOTION LAB" (`changelog.ts:108`) leaves the site chrome for `/lab/motion-lab.html`.
    - "Coming up" (`changelog.ts:143–151`) still lists shipped work (F0, T4, T2, E2, F0 LOAD) as in progress, and S1 as planned.
  - **Fix:** route in-app links through `go()`, label the lab link as external (↗), and update the list (or cut it: option C14).
- **N10 · nit: the boards sheet lists START HERE boards twice.** MICRO UI, for example, is marked current both in START HERE and in INTERFACES.
  - **Where:** `src/components/BoardSheet.tsx`.
  - **Evidence:** `dark_signal-boards-390.png`.
  - **Fix:** START HERE as a chip row at the top of the sheet, with the groups below it, so each board is listed once.
- **N11 · nit: the footer's SHORTCUTS link** (`App.tsx:46`) opens ABOUT. On a phone, shortcuts are no use. Rename it ABOUT.

### 1.2 Header and footer: sticky behaviour

- **S1 · broken (as asked): the desktop header scrolls away.**
  - **Where:** `src/App.css:65` (`.topbar` is static at ≥ 761 px).
  - **Evidence:**
    - #2: on a 4.8k px ABOUT or a 16k px essay there is no navigation without scrolling back up;
    - the X-RAY, TIME and ⌘K dock lives in the header, so it is gone too.
  - **Fix:**
    - Make `.topbar` `position: sticky; top: 0`, with a new `--topbar-h` (48 px); see R3.
    - Background: the phone bar's glass (`color-mix(var(--bg) 84%)` plus `--glass-blur`). The dotted hairline shows only once the page has scrolled (a scroll-driven `animation-timeline`, no JS).
    - The editor uses `--ed-h: calc(100dvh - var(--topbar-h))`.
    - Owner decision 3: always pinned, or hide on scroll down and show on scroll up.
- **S2 · broken (as asked): nothing is pinned on the essay and legal pages.**
  - **Evidence:** #2, #3; the TOC exists only in the essay's hero.
  - **Fix:**
    - The shared site bar from N7, sticky.
    - On the essay, a section indicator in the bar, `03 / 14 · QUANTIZATION`, driven by an IntersectionObserver on `.sec`. It opens the TOC as a menu (a sheet on phones).
    - `scroll-margin-top` on `.sec` equal to the bar's height.
- **S3 · ugly: the footer sits under the editor.**
  - **Where:** `src/components/editor/editor.css:15` (`calc(100dvh - 80px)` against a real top of 68 px).
  - **Evidence:** #5; `dark_signal-make-1440.png`.
  - **Fix:** MAKE is an app view, so the site footer is hidden on MAKE at every width (phones already go full screen). The editor fills the viewport under the sticky header exactly, and the page itself doesn't scroll.
- **S4 · ugly: fixed bars over the footer on the widget page.**
  - **Evidence:** #4, from the floating dock. The fixed action pill also needs room under the footer's last line.
  - **Fix:** N3 moves the dock back into the header. `.shell--widget` gets `padding-bottom: calc(var(--pillbar-h) + var(--gap-action))` (new token, R5).
- **S5 · ugly: no scroll padding for the pinned bars.**
  - **Evidence:** #7. Focused and scrolled-to elements land under the phone's top bar or tab bar (now, and under the desktop header once S1 lands).
  - **Fix:** `html { scroll-padding-top: var(--app-top) | var(--topbar-h); scroll-padding-bottom: var(--tabbar-h) }`.
  - It is the counterpart of S1, so it ships with it.
- **S6 · nit: the footer floats on short pages.**
  - **Fix:** `.shell { min-height: 100svh; display: flex; flex-direction: column }` and `footer.bottom { margin-top: max(var(--gap-section), auto) }`, done with a wrapper since `max()` can't take `auto`. The footer then meets the bottom of the screen on short pages (widget page or a 4-card board at 1920 × 1080).
  - **Check:** the sticky probe at 1920.

### 1.3 Layout and overflow

- **L1 · broken (to confirm on Windows): `100vw` widths overflow by the scrollbar width wherever scrollbars take space.**
  - **Where:**
    - `.ed-root { width: 100vw; margin-left: calc(50% - 50vw) }` (`editor.css:13–14`);
    - `.fig--wide` (`src/essay/essay.css:63`, `:149`);
    - `--gutter` (`src/site/mobile.css:12`);
    - `--frame-inset` (`src/tokens.css:65`).
  - **Evidence:** #1 is blind to this (hidden scrollbars). MAKE scrolls (#5), so on Windows Chrome it shows a vertical scrollbar and so overflows sideways.
  - **Fix:**
    - The existing theme boot script sets `--sbw = innerWidth − clientWidth` (a few bytes, no new chunk), and full-bleed widths use `calc(100vw - var(--sbw, 0px))`.
    - The editor uses negative inline margins of `--frame-inset`, not `100vw`.
    - Add a scrollbar-visible probe run (P0).
- **L2 · broken: privacy scrolls sideways at 320 px.**
  - **Where:** `essay.css:27` gives every `code` `white-space: nowrap`, and `legal.css` relaxes it only in `.keys dt`.
  - **Evidence:** #1 (`github-contributions-api.jogruber.de`).
  - **Fix:** `code` in prose: `white-space: normal; overflow-wrap: anywhere` at ≤ 640 px.
- **L3 · ugly: the home hero at ≥ 1280.**
  - **Problems:**
    - The floated hero's bottom is 12 px above the first card row: the hero spans y 88–304 and the grid starts at y 316.
    - Its legend wraps so that a line starts with the separator ("· HALFTONE STEP 2").
  - **Where:** `App.css:623–650`; `src/components/hero/HeroCard.tsx:118`.
  - **Evidence:** `dark_signal-home-1440.png`, `light_signal-home-1440.png`.
  - **Fix:**
    - The hero becomes a grid area of the header band (with N8), with `--gap-action` below it.
    - The legend's parts become `nowrap` spans with CSS separators, and the legend gets `text-wrap: balance`.
- **L4 · ugly: the home hero below 1280.**
  - **Problem:** it lands after the board at 420 px, wider than the cards (about 340 at 768), a `--gap-section` away. It reads as a stray card.
  - **Where:** `App.css:648–660`.
  - **Evidence:** `dark_signal-home-768.png`.
  - **Fix:**
    - 768–1279: the hero shares the header band with the intro (picture left, legend right).
    - Phones keep it after the board, at card width (`--card-max`).
- **L5 · ugly: the footer row wraps raggedly from 761 to 1100 px, and on phones.**
  - **Problems:**
    - At 768 the site line, the pipeline line and the links make three columns that each wrap mid-phrase ("SAMPLED FROM / A FIELD"), with TERMS alone on a second line.
    - On phones TERMS is alone too.
  - **Where:** `App.css:190` (`.bottom-row`, a flex row with space-between; the ≤ 760 rule hides only the middle span).
  - **Evidence:** `dark_signal-home-768.png`, `dark_signal-widget-768.png`, `dark_signal-widget-timer-390.png`.
  - **Fix:** the footer becomes two rows:
    - a links `<ul>` (whole items wrap, `gap: var(--gap-group)`);
    - the identity line, with the pipeline line dropped under 1100 px.
- **L6 · ugly: the intro at 1440 is three floating pieces.**
  - **Problem:** the text is measured at about 430 px, "Read the essay →" sits 40 px to its right and the × 100 px beyond that.
  - **Where:** `App.css:308–360`.
  - **Evidence:** `dark_signal-home-1440.png`.
  - **Fix:** the link goes inline at the end of the text, and the × sits on the same baseline right after it.
- **L7 · nit: the T3 short intro is clipped at 320** (#8).
  - **Fix:** below 360 px, let it wrap to two lines, or move "Read the essay →" onto its own 44 px row. The ≤ 120 px intro + picker budget from T3 still holds: measure it.
- **L8 · nit: the widget page at 768.** The stage is capped at `cols × pitch + 32` = 648 px in a 720 px frame, so there is a dead strip at the right (`src/components/widget/WidgetPage.tsx:150`).
  - **Fix:** below 900 px the stage fills the frame.
- **L9 · nit: ABOUT's URL table at 768.**
  - **Problem:** long keys (`?skin=crt|vfd|led|eink|flipdisc|nixie`, `?make=tune|compose|code|draw`) run into their descriptions.
  - **Evidence:** `dark_signal-about-768.png`.
  - **Fix:** `dt { overflow-wrap: anywhere }`, and stacked rows below 900 px.
- **Noted, owned by T3:** the 768 home still ends with one card alone (09 SYSTEM), and 2-column boards leave the right half empty at 1440. T3's orphan rule should cover the 2-column step. Check it against `dark_signal-home-768.png`.

### 1.4 Spacing and padding rhythm (tokens)

The three rhythm steps hold: the T2 layout probe gates them. What's missing is tokens for things that are still literals:
- **R1 · nit: z-index.** There are 16 distinct literals in the CSS (1, 3, 5, 20, 30, 35, 40, 41, 45, 50, 60, 70, 72, 80, 90, 91).
  - **Fix:** a `--z-*` scale in `tokens.css`: `--z-raise 1`, `--z-sticky 30`, `--z-bar 50`, `--z-app 60`, `--z-sheet 70`, `--z-modal 90`, `--z-toast 95`. Add a `css-tokens.ts` rule and a DESIGN.md row.
- **R2 · nit: hit sizes.** There are 30 literal `44px` min sizes, and desktop chrome has no floor at all (#6).
  - **Fix:** tokens `--tap: 44px` (coarse pointers) and `--tap-min: 24px` (WCAG 2.2 target size, fine pointers). Desktop header tabs, dock buttons, group tabs and the intro × get `min-height: var(--tap-min)` through padding, without changing the type.
- **R3 · nit: bar heights live in `mobile.css`.** `--app-top` and `--tabbar-h` are defined at `src/site/mobile.css:9–11`.
  - **Fix:** move them to `tokens.css` next to a new `--topbar-h` (desktop, S1) and `--pillbar-h` (widget page, R5), and add them to the DESIGN.md layout table.
- **R4 · ugly: the essay shadows site tokens.**
  - **Where:** `essay.css:5–12` redefines `--measure: 680px` (the token is `68ch`), `--mono`, `--sans` (`system-ui` rather than Oxanium) and `--mute`, so the essay's type is not the site's.
  - **Fix:** use the tokens as they are. If the essay needs a wider measure, add `--measure-essay` to `tokens.css`. AGENTS.md: no shadowing names. This builds on the just-merged essay theming.
- **R5 · nit: widget-page offsets are raw px** (`14px`, `72px`, `78px` at `WidgetPage.css:135–140` and `:349–399`).
  - **Fix:** `--space-*` plus the new `--pillbar-h`.

### 1.5 Text wrapping and type

T6 owns sizes and contrast (the 12 px minimum, #12). Only what T6 doesn't cover is listed here.
- **X1 · nit: a missing space in the essay:** "…everything is sampled.Below is a lit sphere". A JSX line ends on `</em>` (`src/essay/Essay.tsx:71`). Add `{' '}`.
- **X2 · ugly: five names for the essay:** "HOW IT WORKS" (the footer and both legal footers), "Read the essay →", "How it works: the essay →", "READ THE ESSAY", and the title "Ditherpunk for UI". Pick one label (owner decision 1) and use it everywhere.
- **X3 · ugly: ABOUT on a phone leads with a keyboard-shortcut table** (⌘K, hold T, ↑↑↓↓…) and dev URL params.
  - **Where:** `src/components/About.tsx:23`.
  - **Evidence:** `dark_signal-about-390.png`.
  - **Fix:** on coarse pointers, fold KEYBOARD and URL into a closed "For keyboards and links" fold (`More`). ABOUT then opens with the lede, the essay band (N2) and the changelog.
- **X4 · nit: ABOUT is a 4.8k–9.4k px page with no wayfinding** (#3).
  - **Fix:** a row of in-page anchors under the title (WHAT · ESSAY · KEYS · LOG), and the changelog folded after the latest three releases ("Older releases (8)").
- **Not re-planned:** board display names against board titles (for example MICRO UI against "DOT / 480 — OLED MICRO INTERFACE SYSTEM") are UX-PLAN §7.1.

### 1.6 Options to cut or merge (owner approves each)

| # | Option | Where | Proposal | Reason |
|---|---|---|---|---|
| C1 | 15 "Theme: dark_signal…" palette rows | `palette/api.ts:83–84` | Replace with "Theme: system / light / dark" plus "Accent: <name>" (10 rows), or leave it to T5 | Raw ids in a visitor list; T5 brings the real picker |
| C2 | "Renderer: auto / svg / canvas / webgl" and two worker rows | `api.ts:78–80` | Pro mode only (`?pro=1`) and the shell | Engine diagnostics; a visitor gains nothing |
| C3 | "Reduced motion: on / off / system" | `api.ts:77` | Merge into one "Reduced motion" toggle (system first) | The OS setting already rules; three rows for one switch |
| C4 | "Toggle the fps meter" | `api.ts:76` | Pro only | Debug HUD |
| C5 | Desktop palette shows about 35 actions before any board | `Palette.tsx:24, 38` (board-first ordering is touch-only) | Boards and places first everywhere | People come to the palette to go somewhere |
| C6 | SHELL in the phone TOOLS sheet | `CommandLayer.tsx:102` | Hide on coarse pointers (its own comment says "where there is a keyboard") | A typed terminal on a touch screen |
| C7 | `>_` in the desktop dock | `CommandLayer.tsx` dock | Keep ⌘K; the shell is reached with `` ` `` and the palette | Four dock buttons → three; the shell is a power-user key |
| C8 | Brand suffix `<small>EXPLORE</small>` | `App.tsx:221` | Remove | It repeats the selected tab beside it |
| C9 | "CONFIGURATION 01 · STATUS: NOMINAL" | `About.tsx:16` | Remove | Flavour text that is `aria-hidden` and says nothing (UX-PLAN §4.3 already leaned this way) |
| C10 | Footer middle line "FIELD → GRID SAMPLER → RENDERER" | `App.tsx:45` | Keep one identity line (the left one) | It says the left line twice |
| C11 | `?worker=0` and `?clack=1` in ABOUT's URL table | `src/site/shortcuts.ts:26–27` | Pro only | Developer switches shown to visitors |
| C12 | The intro line's dismiss × | `App.tsx:121` | Remove (the line is one line now) or keep | Dismissing it removes the most visible essay link |
| C13 | Duplicate START HERE rows in the boards sheet | `BoardSheet.tsx` | Chip row on top (N10) | Each board once |
| C14 | The changelog's "Coming up" list | `changelog.ts:143–151` | Cut, or keep three current items | It goes stale (four of nine rows are wrong today); PROGRESS is the real list |

## 2. Phases and tasks

Each task is 1–2 agent days. **Files** are exclusive within a phase. Where two tasks share a file, the regions are named and the merge order is given. Every task runs `npx tsc -b`, `npx oxlint <changed>` and `npx tsx scripts/site/css-tokens.ts`. All heavy commands go through `heavy.mjs`.

### P0 · Probes first (½–1 day, one agent, before P1)

Add the assertions now as **reported** checks, listed in one array of known-failing ids at the top of each probe. Each P1–P3 task deletes its ids when its fix lands, which makes the check a gate.

**Files:**
- `scripts/site/layout.ts`;
- `scripts/site/mobile.ts`;
- a new `scripts/site/nav.ts`;
- `scripts/lib/cdp.ts` (a `scrollbars: true` launch option);
- `vite.config.ts` (`configurePreviewServer` applying `vercel.json` rewrites).

**Assertions:**
- **`layout.ts`** (add 320 and the essay, privacy and terms pages):
  - `overflow`: no horizontal overflow at 320–1920, also in a `scrollbars: true` run;
  - `sticky`: at 1440 and 768 the header (or site bar) top is in [0, 1] at mid and bottom scroll on home, ABOUT, essay, privacy and the widget page;
  - `covered`: no footer link is covered by a fixed layer at any scroll position;
  - `footer-wrap`: no footer link alone on a line;
  - `no-app-scroll`: MAKE `scrollHeight == innerHeight`.
- **`mobile.ts`:**
  - every chrome target ≥ 44 px on the essay and legal pages too;
  - the widget page has the tab bar;
  - after each Tab, the focused element is clear of the top bar and the tab bar.
- **`nav.ts`** (real CDP input, because Chrome skips pushState entries made without user activation):
  - a route table: `/`, `/lock/`, `/glyph/`, `?board=`, `?about`, `/about`, `?make`, `?tab=*`, `/essay`, `/essay/`, `/essay.html`, `/privacy`, `/terms`, `/widget/<slug>/`, `/<uid>`, `?card=`, `/nope/` → expected view, canonical URL, the same after reload;
  - Back / Forward restore scroll (±40 px);
  - Back with any sheet open closes it and keeps the URL;
  - the Tab order never jumps back up more than one viewport before the footer.
- **Fix in `scripts/site/shots.ts`:** `palette-390` reports NOT READY in both themes, because on touch the sheet, not the combobox, takes focus. Check `.pal` instead.

**Acceptance:** each probe runs on `vite preview`, prints today's failures under their ids, and exits 0.

### P1 · Broken (4 agents in parallel)

| Task | Fixes | Files (exclusive) | Acceptance |
|---|---|---|---|
| **P1-A Routes and history** (1.5 d) | N1 (routes), N4, N5, N6 | `vercel.json`, `src/site/views.ts`, `src/site/meta.ts`, `src/site/routes.ts`, new `src/site/history.ts`, `src/components/Sheet.tsx`, `src/components/palette/Palette.tsx` (sheet history only), the editor and X-ray sheet open/close calls, `scripts/verify.ts` (route checks), `scripts/site/postbuild.ts`; **`App.tsx` state and effects only** (`:163–212`) | `nav.ts` route table, scroll and sheet checks gate; `pnpm verify`; `size.ts --check` (views.ts is first load: budget Δ ≤ +0.3 kB); live check after deploy: `curl /essay/` gives the essay's title |
| **P1-B Site header and footer** (2 d) | N2 (header, footer, home), N3, N11, S1, S3, S4, S5, S6, L5, L6, L7; C8, C10, C12 if approved | `src/App.tsx` JSX (`SiteFooter`, `IntroLine`, header, the widget branch, `NextBoard` row; **not** `:163–212`), `src/App.css` (topbar, bottom, intro, shell), `src/site/mobile.css` (topbar, tabbar, bottom, scroll padding), `src/components/BoardPicker.tsx` (`NextBoard`), `CommandLayer.tsx:46` (`dockIn`), `src/tokens.css` (`--topbar-h`, `--pillbar-h`, the moved `--app-top` / `--tabbar-h`), `src/components/editor/editor.css:15` (`--ed-h` only), `DESIGN.md` (layout table, header and footer rules) | `layout.ts` sticky, covered, footer-wrap and no-app-scroll gate; `mobile.ts` widget tab bar and focus-clear gate; the existing ±1 px left-edge and rhythm checks still pass; `pnpm golden --check` 177/177; `size.ts --check`; `theme-boot.ts`; shots at 1440 / 768 / 390 in dark_signal and light_signal |
| **P1-C Essay and legal chrome** (1.5 d) | N7, S2, L2, X1, R4 (the essay tokens) | `src/essay/Essay.tsx`, `src/essay/essay.css`, `src/essay/main.tsx`, `essay.html`, `privacy.html`, `terms.html`, `src/legal/legal.css`; a new shared static site bar (for example `src/site/sitebar.ts`, which renders the markup for the essay and is copied into the legal pages at build) | `layout.ts` sticky gate on the essay and privacy pages; overflow at 320 gates; `mobile.ts` 44 px targets on the essay and legal pages; `scripts/essay-browser.ts` still passes; `theme-boot.ts` on the essay and legal pages |
| **P1-D Palette and wayfinding entries** (1 d) | N2 (palette, ABOUT band), N9, N10, X2 (copy), X3; C1–C7, C9, C11, C13, C14 if approved | `src/components/palette/api.ts`, `src/components/palette/CommandLayer.tsx` (everything but `:46`), `src/components/palette/Shell.tsx` (help text), `src/site/shortcuts.ts`, `src/site/pro.ts`, `src/components/About.tsx`, `src/components/Changelog.tsx`, `src/changelog.ts`, `src/components/BoardSheet.tsx`, the ABOUT / log sections of `App.css` (`.about-*`, `.log-*`) | Typing "essay" in ⌘K ranks the essay first (add it to `scripts/c10-browser.ts`); `c10-browser.ts` passes; `mobile.ts` passes; `editor-browser.ts` unaffected; `pnpm verify` |

**Shared strings:** every task uses `/essay/` and the label from owner decision 1.

**Merge order:** P1-A → P1-B (they share `App.tsx` by region) → P1-C → P1-D. Then the full suite once: it is a cross-cutting round.

### P2 · Ugly (3 agents in parallel)

| Task | Fixes | Files (exclusive) | Acceptance |
|---|---|---|---|
| **P2-A Full-bleed without `100vw`** (1 d) | L1 | `src/components/editor/editor.css` (`.ed-root` width and margins), `essay.css` (`.fig--wide`), `src/site/mobile.css:12` (`--gutter`), `tokens.css` (`--frame-inset`, `--sbw`), `src/site/theme/boot.ts` (sets `--sbw`) plus its CSP hash in `vercel.json` | `layout.ts` overflow gate in the `scrollbars: true` run on MAKE, the essay and home; `theme-boot.ts` (hash); `editor-browser.ts`; `size.ts --check` |
| **P2-B Home hero, focus and the widget page** (2 d) | L3, L4, L8, N8, R5, X4 | `src/components/hero/*`, the `App.css` hero section, `App.tsx` (hero placement and the skip link, after P1), `src/components/DotWidget.tsx` (action strip roving), `src/components/widget/WidgetPage.tsx`, `WidgetPage.css`, the essay figure mount (`src/essay/ui/*`), `About.tsx` anchors and the changelog fold (after P1-D) | `nav.ts` Tab-order gate; `layout.ts` left edge and rhythm at 6 widths; `pnpm golden --check`; `scripts/editor-browser.ts`, `essay-browser.ts`, `c10-browser.ts` (card actions) |
| **P2-C Desktop hit targets and ABOUT tables** (1 d) | R2 (desktop part), L9, `mobile.ts` 44 px fixes on the essay and legal pages left over from P1-C | `App.css` (topbar, picker and dock padding), `skins/SkinSwitcher` CSS, the `.about-keys` CSS, `legal.css` (after P1-C) | A new `layout.ts` check: fine-pointer chrome targets ≥ 24 × 24 px; `mobile.ts`; shots |

### P3 · Nits (2 agents, after P2)

| Task | Fixes | Files | Acceptance |
|---|---|---|---|
| **P3-A Token sweep** (1 d, runs alone: it touches most CSS files) | R1, R2 (`--tap` everywhere), R3 | every `*.css` under `src/` (z-index and 44 px literals), `tokens.css`, `DESIGN.md` token tables, `scripts/site/css-tokens.ts` (z-index and tap rules) | `css-tokens.ts` gates raw z-index and 44 px; `pnpm golden --check`; `layout.ts`; `mobile.ts`; size unchanged |
| **P3-B Copy pass** (½ d) | whatever is left of X2, N9 and C14; the `docs/README.md` / `PROGRESS.md` / `CHANGELOG.md` / `src/changelog.ts` entries | copy only (strings), docs | `pnpm verify`; shots |

**Not here, but in the way:**
- **T5 picker:** the sticky header must leave a slot next to DISPLAY ▾ for its THEME popover; C1 is superseded by T5 if T5 lands first.
- **T6 type:** the 12 px minimum and contrast. P1-B, P1-C and P2-C keep type sizes as they are and change only boxes and padding, so T6 can retune the type later without conflicts.
- **E3 editor:** it owns `editor.css`; P1-B touches only `--ed-h`, and P2-A only `.ed-root` width and margins. Rebase on E3 if it merges first.
- **Q1, L1 and M1:** new boards only. N10's sheet change and the board-end row (N2) must hold for any board count.

## 3. Owner decisions
1. **The essay's one label and URL:** ESSAY [recommended], GUIDE, or HOW IT WORKS, at `/essay/` [recommended]. Add `/guide/` as an alias if you choose GUIDE.
2. **Where the essay lives in the chrome:**
   - [recommended]: an `ESSAY ↗` link after the desktop tabs, a band at the top of ABOUT on phones, a palette entry, the footer's first link, and a row at each board's end;
   - or a fifth phone tab instead of the ABOUT band.
3. **Desktop header:** always pinned [recommended], or hidden on scroll down and shown on scroll up.
4. **Essay and legal site bar with the section indicator and TOC menu:** yes [recommended].
5. **MAKE hides the site footer at every width:** yes [recommended].
6. **Unknown paths:** a toast and `replaceState('/')` [recommended], or a not-found band. Also `/about` as an alias of `?about` [recommended].
7. **The cut list:** approve, reject or amend each of C1–C14 (§1.6).
