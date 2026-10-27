# LAYOUT-THEME-PLAN: spacing, layout and a switchable theme

> Status: **planned** (2026-10-27). Nothing here is built yet.
> Sources, all from 2026-10-27:
> - a teardown of vite.dev, read from its CSS and theme source;
> - a measured audit of the live site: 6 pages × 6 widths, with screenshots in `D:\tmp\dot480-shots\layout-audit\` and raw numbers in `measure.json`;
> - a study of the theme architecture against the code.
>
> Invariants (AGENTS.md):
> - card pixels stay pinned by goldens on the default dark theme;
> - one accent per board;
> - first-load JS ≤ 150 kB gz (148.14 used; see the ledger in `LIVING-MATTER-PLAN.md` §6);
> - `src/engine` stays framework-free.

## 1. What vite.dev does that we should borrow

vite.dev now uses a custom VoidZero theme on Tailwind v4, not stock VitePress.

1. **One framed column.** `.wrapper` is centred with `max-width: 90rem` (1440 px) at ≥1440, and `calc(100vw − 2rem)` at ≥768 with 1 px side rails. Every section is its own band with a top rule, and 5 px corner ticks mark where a rule meets a rail. Extra width outside the frame is plain background; nothing stretches.
2. **Rules instead of cards.** Feature grids have **zero gap**: cells are split by 1 px rules (`divide-x divide-y`) with no radius and no shadow. The empty space inside a cell reads as intended, not dead.
3. **Three spacing steps.**
   - 12–20 px inside a group: heading → sub is 12, a title stack is 20;
   - 32 px before actions;
   - 56–120 px between sections (`py-14 sm:py-28`).
   - Mobile mostly halves these (40 → 20, 112 → 56) and drops the rails.
4. **Strict measure.** Every text block has a rem max-width whatever its cell width:
   - h1: 25rem;
   - tagline: 27rem;
   - h2: 42rem;
   - subtext: 28rem;
   - docs body: 688 px, about 80ch.
   - Wrapping uses `text-wrap: balance / pretty`.
5. **Small type system.**
   - One display face at weight 500 with negative tracking (h1 −.05em).
   - Body 16–18 px / 1.5–1.75.
   - One meta style: `.75rem` mono, uppercase, `tracking-wide`.
   - h1 goes 36 → 48 → 60 px and h2 30 → 48 px across breakpoints.
6. **Small palette, two layers.** Raw tokens (`--color-stroke`, `--color-nickel`, `--color-grey`, …) map to semantic ones (`--vp-c-bg`, `-bg-alt`, `-bg-soft`, `-text-1/2`, `-divider`, `-brand-1`), giving 2 backgrounds, 2 text tones, 1 rule colour and 1 brand colour. The brand colour is used sparingly.
7. **Theme.**
   - An inline head script reads `localStorage['vitepress-theme-appearance']` (or `auto` → `prefers-color-scheme`) and sets `.dark` before first paint.
   - The toggle is a 40×22 switch.
   - A `data-theme` attribute can force a theme on a page or on an island; vite.dev's footer is always dark.
   - vite.dev forces its home page dark and does not use a View Transition. **We won't copy either.**
8. **Calm motion.** Opacity changes plus a 105% scale on hover, 150 ms, with reduced motion respected.

Not to borrow:
- photo-gradient buttons and textures, which break one accent and the field pipeline;
- Rive and raster illustrations;
- the forced-dark home page;
- grey body text at 3.9:1 on light, which fails AA.

## 2. What is wrong today (measured)

| # | Problem | Evidence | Cause |
|---|---|---|---|
| 1 | **Cards are oversized; few fit above the fold** | Home cards are 468 px at 1920 and 452 at 1440; only 3 of 9 are fully visible. On 2-column boards cards are 687–711 px, and none is fully visible at 1280–1440 | `aspect-ratio: 1` (App.css:411) + the grid stretches to 1440 (App.css:948); no cap tied to viewport height |
| 2 | **Breakpoints ignore each board's column count** | Every board is forced to 2 columns ≤ 1100 px (App.css:958–963). Components goes 5 → 2, its page grows from 1467 to 4854 px, and its cards are *bigger* at 1024 (479) than at 1440 (264). There are 9 ad-hoc max-width breakpoints | one global media rule |
| 3 | **Orphaned last rows** | home at 1024: 1 card alone, 497 px of empty row; components at 1440: 2 of 5, 846 px empty | fixed column counts |
| 4 | **Three left edges; stray centring** | topbar x=216, title 222, grid 240 at 1920. Board title and blurb are centred by the leftover Vite starter `#root { text-align:center }` (index.css:122–126). About is an 880 px centred island (left edge 280 vs 24). The editor runs edge to edge while the topbar is inset | `.shell` 1488 vs `.board-view` 1476 vs `.board-grid` 1440 (App.css:31, 942–955) |
| 5 | **Tiny, low-contrast text** | 73–78% of characters on boards are under 12 px (93% on phones). Chrome text is 8–11 px. `#6E7278` on `#070809` is ≈ 4.1:1, used at 9–10 px | 19 font sizes, mostly 9 and 10 px |
| 6 | **No vertical rhythm** | topbar → grid gaps are 18 / 16 / 10 / 14 / 6 / 14 px (six values in 245 px). 64 px is reserved under the footer for the dock. The intro is one 166-character line at 1440 and wraps badly at 1024 | 42 distinct spacing values; only `--spacing-cardGap/cardPad` exist, and they disagree with DESIGN.md |
| 7 | **Phone defects** | the sticky ALL pill covers the first group tab ("RT HERE"); intro + picker take 184 px, so the grid starts at y=349; cards are 362×380 | mobile.css:593–604, App.css:965–975 |
| 8 | **Widget page has its own chrome** | no topbar or footer; at 1920 there are ≈ 180 px empty above and below the content | WidgetPage.css:106, 149, 154 |
| 9 | **Two type families mixed with no rule** | the changelog and widget title use Oxanium 13–15 px; everything else is mono | App.css ~1442, 1459 |
| 10 | **The desktop dock covers card corners** | e.g. the text-field card on `/components/` at 1440 | App.css:2280 |

**Colour today has three overlapping token systems:**
- App.css:1–12: `--red --surface --raised --line --label --mute --value`, 323 uses;
- shadcn/starter tokens in index.css, with a `.dark` that is never applied;
- raw literals: 19 hex + 47 rgba in App.css, 37 in editor.css, 13 in mobile.css, and more.

There is no light theme. The engine's `ThemeTokens` presets (`dot480`, `deerflowMosaic`) are both dark, and CSS duplicates their values by hand.

## 3. Design direction

**A ruled dot-matrix frame.** This is vite.dev's frame in our own material.
- **The frame:** a centred 1440 px column with 1 px rails at ≥768, and section bands with top rules. The rails and rules are drawn as **dot rows on the 4 px grid** (a CSS `radial-gradient` dot pattern, not an engine field: it is chrome), with corner ticks as 3×3 dot crosses.
- **Boards:** each board is a band, and its cards sit in a **zero-gap, ruled grid**. Each card is a cell that keeps a small inset radius only inside on hover.
- **Pages:** About and the widget page are bands in the same frame, not islands.
- **Text:** has a measure (≤ 68ch body, ≤ 42rem headings) and aligns to one left edge.

### Tokens (one scale; replaces the 42 spacing and 19 type values)

```css
/* spacing (4 px grid) */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px; --space-5: 24px;
--space-6: 32px; --space-7: 48px; --space-8: 64px; --space-9: 96px; --space-10: 128px;
/* rhythm: inside a group / before actions / between sections */
--gap-group: var(--space-3); --gap-action: var(--space-6); --gap-section: clamp(var(--space-8), 8vw, var(--space-10));
/* layout */
--frame-max: 90rem; --frame-pad: clamp(16px, 3vw, 40px); --measure: 68ch; --measure-head: 42rem;
--rail: 1px; --tick: 5px;
/* type (rem, root 16px) */
--fs-meta: .75rem;   /* 12 px mono uppercase, +.06em: the only label style */
--fs-small: .875rem; --fs-body: 1rem; --fs-lead: 1.125rem;
--fs-h3: 1.25rem; --fs-h2: clamp(1.5rem, 1rem + 2vw, 2.25rem); --fs-h1: clamp(2rem, 1rem + 4vw, 3.75rem);
--lh-tight: 1.1; --lh-body: 1.6;
```

Rules:
- **Minimum chrome text is 12 px.** 11 px is allowed only for numeric tabular meta inside a card bar.
- **Secondary text is ≥ 4.5:1** on its surface in every theme.
- **One display face plus one mono.** Mono is for meta and UI; the display face is for headings, prose and the widget title. Oxanium is no longer used for body lists.

### Card sizing and grids
- Cards are capped by viewport height: `--card-max: min(100%, 62svh, 520px)`. A board never shows a card taller than about 62% of the screen.
- Boards declare **intent, not columns**: `density: 'hero' | 'standard' | 'dense'`. CSS turns that into `grid-template-columns: repeat(auto-fill, minmax(var(--card-min), 1fr))`, with `--card-min` of 420 / 300 / 220 px and container queries on the band. Column counts then step 5 → 4 → 3 → 2 → 1 smoothly, and components never jumps from 5 to 2.
- **Orphans:** a last row that is less than half full centres its cards (`justify-content` via a `:has()`/subgrid trick, or JS-free `grid-auto-flow: dense` plus a span on the last item for hero boards). Every orphan case is tested.
- Square stays the default aspect, but cards may declare `aspect` (already in their grid spec) so wide cards don't get letterboxed.

## 4. Theme system

### Theme versus skin
- A **theme** is the palette roles for the page and the cards.
- A **skin** is the physics of the display (CRT, VFD, LED, e-ink, flip-disc, Nixie).
- They are independent and layer: theme first, then skin.
- **Rule:** with a non-OLED skin, the card samples with that skin's own palette. Emissive skins use `dot480`, so a CRT card on a paper page is a dark tube set into the page. Reflective skins take their panel colours from the theme. This avoids black dots on a black tube.

### Theme set
| Id | What | Engine tokens | Status |
|---|---|---|---|
| `system` (default) | resolves to `dark` or `light` from `prefers-color-scheme` | — | T3 |
| `dark` | today's look | `dot480`, **unchanged**: goldens stay valid | T3 |
| `light` (paper) | ink on paper: more signal means more ink | new `paper` preset | T3 |
| `contrast` | stronger greys and rules; auto-picked with `prefers-contrast: more` | `dot480Contrast` / `paperContrast` | T5 |
| `mosaic` | warm dark (the existing `deerflowMosaic`) | existing | T5 |

"Amber terminal" and "blueprint" are skipped: they tint everything, and the Nixie and VFD skins already cover those looks.

**Paper starting values** (to be verified by script):

| Token | Value |
|---|---|
| `bg` | `#ECEBE6` |
| `surface` | `#F7F6F2` |
| `surfaceRaised` | `#EFEEE9` |
| `hairline` | `rgba(0,0,0,.09)` |
| `dotFaint` | `#D6D5CF` |
| `dotMid` | `#9C9C97` |
| `dotIdle` | `#626368` |
| `value` | `#141516` |
| `dotActive` | `#F0362B` |
| `dotActiveDim` | `#F2A19B` |

Two invariants are checked per theme:
- APCA Lc from `surface` rises strictly from faint to mid to idle to value, with mid at ≥ Lc 15;
- red dots are ≥ 3:1 (WCAG 1.4.11).

**Small red text** needs a deeper `--accent-text` (≈ `#B8241A`, 6.4:1) in light. That is the same hue at a different lightness, which is an **owner decision** under the one-accent rule.

### Chrome tokens
These sit on `:root[data-theme]`. Today's names stay as aliases, so 323 uses keep working.

| Token | Replaces / role |
|---|---|
| `--bg` | `body #070809` (hard-coded at App.css:19) |
| `--surface` | `--surface` |
| `--raised` | `--raised` |
| `--overlay` | the `rgba(17,19,21,.9x)` panels |
| `--line` | `--line` |
| `--line-strong` | stronger borders and dividers |
| `--text-1` | `--value` |
| `--text-2` | `--label` |
| `--text-3` | `--mute` |
| `--accent` | `--red` |
| `--accent-text` | red for small text, ≥ 4.5:1 |
| `--accent-soft` | the red washes |
| `--on-accent` | text on a red fill |
| `--scrim` | dimming layers |
| `--shadow` | shadows |

Each theme also sets `color-scheme`, so form controls and scrollbars follow.

The shadcn/starter token block and the `#root` starter rules in index.css are deleted. A stylelint-style check in verify (`scripts/site/css-tokens.ts`) rejects new raw hex or `rgba` literals outside the token file.

### Runtime path
1. **`src/site/theme.ts`** (≈ 0.3 kB, a copy of the `skins/store.ts` pattern). It reads `?theme=`, then localStorage `dot480:theme`, then `system`. It sets `<html data-theme>`, `color-scheme` and the `theme-color` content, and listens to `matchMedia` while on `system`. It exposes `useTheme()` through `useSyncExternalStore`.
2. **No-flash boot.** A ≈ 200 B inline head script resolves the theme before first paint. Its `'sha256-…'` is added to `script-src` in `vercel.json` (the CSP is `script-src 'self'` today), and a check (`scripts/site/csp-hash.ts`) fails if the script and the hash drift apart. The fallback is a synchronous `/theme-boot.js`.
3. **Head tags.** `index.html` and `manifest.webmanifest` get `<meta name="color-scheme" content="dark light">` and two `media`-qualified `theme-color` tags.
4. **Cards follow the site theme.** `Board` reads `useTheme()` instead of `usePlayground(s => s.theme)` (Board.tsx:69–81). The playground's own "theme" select is renamed "palette". Hard-coded `dot480` in `WidgetPage.tsx:49,76,81,86`, `DrawBoard.tsx:61`, `editor/Panels.tsx:121` and `studio/StudioCanvas.tsx:61` switch to the site theme. Editor frames keep their own theme, because it belongs to the artwork.
   - **Cost:** a switch re-samples each card once. `DotCanvas` already depends on `theme` (DotCanvas.tsx:419) and `useDotField` caches per theme, so switching back is free.
5. **Polarity.** Halftone photos, camera cards and lit-material cards carry luminance in dot size, so they would become negatives on paper. They get `polarity: 'luma'` (light samples `1 − luma`) or keep a dark inset, decided per board. This is listed in the T3 checklist.
6. **The switch itself.** An optional circular reveal: `document.startViewTransition` with `clip-path: circle()` from the click point. Cards re-sample inside the callback. It is skipped when the API is missing or under reduced motion; same-document view transitions are Baseline since Firefox 144.

### Picker
- **Topbar:** a sun/moon button next to DISPLAY ▾ that cycles system → light → dark. It is a 44 px target on touch, and its glyph is drawn as dots.
- **Phones:** a THEME row in the TOOLS sheet.
- **Search:** commands in the ⌘K palette (`palette/api.ts`).
- **Links:** `?theme=light` in links, kept by `syncUrl` like `?skin=`.

### Goldens, OG, budget
- **Goldens** stay on `dark`. A new `golden --theme-parity` samples every preset in each theme, maps each colour back to its role through `paletteOf`, and requires identical `(x,y,r,opacity,role)` hashes. A theme can only recolour, never move or resize a dot.
- **OG images** and exports stay dark: one canonical look for social previews.
- **First load:** about +0.45 kB JS (store + paper palette); light chrome variables are CSS, which the budget doesn't count. Extra themes and the transition code load lazily. Enter this in the ledger.

## 5. Phases

| Phase | What | Days | Gate |
|---|---|---|---|
| **T0 tokens and cleanup** | spacing/type/layout tokens (§3); delete the index.css starter rules (`#root` centring) and the shadcn block; one `.dot-card` definition (today 3, App.css:411/1020/3070); move raw colour literals into chrome tokens; the `css-tokens` lint | 1.5 | goldens 177/177, size unchanged, no visual change except the centring fix |
| **T1 frame and rhythm** | `.frame` with rails and ticks as dot rows; one left edge (shell/board-view/grid widths unified); section bands with `--gap-section`; header rhythm on the 3 steps; intro as a measured block (≤ 68ch, wraps cleanly); About and widget page moved into the frame (widget keeps its pill bars at the edges); editor keeps full-bleed but its toolbar aligns to the frame; dock no longer overlaps cards (it reserves a gutter or tucks into the frame edge); footer as a band (no 64 px dead strip) | 2.5 | layout probe (§6) passes at 6 widths; screenshots reviewed |
| **T2 grids and cards** | `density` per board + auto-fill grids + container queries; card cap `62svh`; zero-gap ruled grid style; orphan-row handling; phone fixes (ALL pill overlap, intro + picker height ≤ 120 px, square cards) | 2 | ≥ 6 cards above the fold at 1440 on standard boards, ≥ 2 on hero boards; no last row < 50% full and stretched; components steps 5→4→3→2→1 |
| **T3 theme core** | `theme.ts` store, boot script + CSP hash + check, chrome tokens in dark and light, `paper` engine preset, Board / WidgetPage / editor / draw read the site theme, skin palette rule, polarity flags, topbar toggle + TOOLS row + palette commands, `?theme=`, view-transition reveal | 3 | theme-parity 177/177; contrast checks pass; no flash with cache off (probe); size delta ≤ +0.5 kB |
| **T4 type and contrast** | apply the type scale everywhere (12 px chrome minimum), the display face for headings and prose, `text-wrap: balance/pretty`, focus rings in both themes | 1.5 | probe: < 10% of chrome characters under 12 px; all text ≥ 4.5:1 |
| **T5 more themes and polish** | `contrast` (auto on `prefers-contrast: more`), `mosaic`; bloom and halo review on paper; e-ink and flip-disc skins on light; docs (DESIGN.md colour and layout tables, README, PROGRESS, CHANGELOG, `src/changelog.ts`) | 1.5 | owner taste pass in both themes |

Total ≈ 12 agent-days. T0 must land first.

After T0:
- T1 and T3 can run in parallel: T1 owns layout CSS and the board, About and widget components; T3 owns tokens, `theme.ts`, `index.html` and the theme readers.
- T2 follows T1.
- T4 follows T1 + T3.

## 6. Checks to add
- **`scripts/site/layout.ts`** (browser probe, 1920 / 1440 / 1280 / 1024 / 768 / 390), with pass criteria:
  - one left edge (±1 px) for topbar, picker, title and grid;
  - no horizontal overflow;
  - cards above the fold as in T2;
  - card height ≤ 62svh;
  - no orphan row stretched;
  - section gaps drawn only from the token set;
  - share of chrome characters under 12 px.
- **`scripts/site/css-tokens.ts`:** no raw colour or spacing literals outside the token files (an allowlist while migrating).
- **`golden --theme-parity`** and a **contrast** check per theme (APCA order for dot tones; WCAG 4.5:1 for text tokens; 3:1 for accent dots).
- **`scripts/site/theme-boot.ts`:** loads each page with cache disabled under `prefers-color-scheme: light` and `dark` and a stored choice, and asserts the first frame already has the right `data-theme` (no flash). It also checks the CSP hash.

## 7. Owner decisions
1. **Default theme:** `system` (follow the OS), or dark first with light opt-in. [Recommended: `system`.]
2. **Light accent:** may red text use a deeper `--accent-text` (same hue, lower lightness) in light? Red dots and fills stay `#F0362B`/`#FF3B30`. [Recommended: yes.]
3. **Polarity on paper:** invert photo, camera and material cards, or keep them as dark insets? [Recommended: dark insets for camera and photo; per-card for materials.]
4. **Ruled zero-gap grid** (vite-like) or keep separated rounded cards with a tighter gap? [Recommended: ruled, with an option to compare both in T2.]
5. **Extra themes:** ship `contrast` and `mosaic` in T5, or stop at light and dark. [Recommended: ship `contrast`; `mosaic` optional.]

## Sources
- **vite.dev:**
  - its CSS (`/assets/style.*.css`);
  - `vitejs/vite` `docs/.vitepress/theme/*`;
  - `@voidzero-dev/vitepress-theme` 5.0.7 (`styles/tokens.css`, `oss/Header.vue`, `VPSwitchAppearance`);
  - VitePress `theme-default/styles/vars.css`.
- **Theme practice:**
  - [MDN `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) and [MDN `theme-color`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color);
  - [VitePress extending (view-transition toggle)](https://vitepress.dev/guide/extending-default-theme);
  - [same-document view transitions Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available);
  - [Radix palette composition](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette);
  - [Primer token names](https://primer.style/product/primitives/token-names/);
  - APCA levels ([summary](https://steve-frenzel.statichost.eu/posts/learning-about-perceptual-contrast)).
