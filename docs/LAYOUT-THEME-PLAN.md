# LAYOUT-THEME-PLAN: design language, layout and themes

> Status: **planned, revised** (2026-10-27).
> **Revision:** vite.dev is a reference for *how a well-made product feels*, not a theme to copy. Everything below is our own dot-matrix design language. "Theme" now means **scheme × accent** (Tamagui-style): light, dark and system, crossed with an accent the visitor can change. Each accent is tuned per scheme so it works in both.
> Sources (2026-10-27):
> - a teardown of vite.dev's CSS and theme source;
> - a measured audit of the live site (6 pages × 6 widths; screenshots in `D:\tmp\dot480-shots\layout-audit\`);
> - a study of the theme architecture against our code;
> - Tamagui's theme docs (`/docs/core/theme`, `/docs/guides/theme-builder`).
>
> Invariants (AGENTS.md):
> - goldens stay pinned on the default theme (dark + red);
> - **one accent per board still holds**: the visitor picks *which* hue, and a board never shows two;
> - first-load JS ≤ 150 kB gz (148.14 used; ledger in `LIVING-MATTER-PLAN.md` §6);
> - `src/engine` stays framework-free.

## 1. What we take from vite.dev: principles, not its look

We don't adopt its frame, its rails, its fonts, its purple or its components. What we take is what makes a good product feel considered:

1. **Restraint.** A tiny palette (two surfaces, two or three text tones, one rule colour, one brand colour) with the brand colour used *rarely*, so it means something when it appears.
2. **One rhythm.** Three spacing steps (inside a group, before actions, between sections) used everywhere. Mobile scales the same rhythm down instead of inventing new values.
3. **Measure and alignment.** Text has a maximum width; every block shares one left edge; nothing stretches on a wide screen.
4. **Structure that carries the layout.** Space and quiet dividers do the work, not decoration.
5. **Calm, answering motion.** Short (≈150 ms) transitions on hover and press, nothing that moves on its own; reduced motion respected.
6. **Two-layer tokens.** Raw palette → semantic roles, so themes are swaps, not rewrites.
7. **Theme without flash.** The theme resolves before first paint and can be forced on any subtree.

**What doesn't carry over:**
- its photographic gradients, Rive art and raster illustrations;
- its forced-dark home page;
- its 3.9:1 grey body text on light;
- its default-dark override that can flash.

## 1b. Our design language (what Dot/480 should feel like)

*An instrument, not a web page.* The cards are live displays; the chrome is the bezel and the panel around them. Everything is drawn from the same grid and the same few materials.

**Grid.**
- All chrome snaps to the 4 px dot pitch: spacing, rule positions, icon glyphs.
- Icons are 5×5 or 7×7 dot glyphs (as the phone tab bar already does), never mixed icon fonts.

**Surfaces (four, no more).**
- `bg`: the room;
- `panel`: the bezel the cards sit in;
- `card`: the display glass;
- `raised`: menus and sheets.

Each step is one small lightness change. A dark `card` reads as a screen, a light `card` reads as paper.

**Edges.**
- Dividers are **dotted hairlines**: a 1 px dot every 4 px, drawn in CSS, so the chrome speaks the same language as the cards.
- Card edges are a single hairline plus a 1 px inner highlight on the top edge only. It is a hint of glass, not a shadow stack.
- Radii: cards 12, controls 8, pills full; nothing else.

**Light and effect.** One signature effect, used consistently: the **accent glow**.
- Active things (selected tab, live badge, focus ring, pressed pill, the engaged card's border) get the accent at full strength plus a soft accent halo: `0 0 0 1px accent`, `0 0 16px accent-soft`.
- Nothing else glows.
- Hover is a lightness lift of the surface (+3% L), never a colour change.
- Press is one quantize step smaller, as the cards already do.
- Focus is the accent ring in every theme.

**Colour use.**
- Neutrals carry 95% of the page.
- The accent marks *now and here*: the active state, the live data, the current selection, the one red dot a card wants you to see.
- There are no secondary brand colours, no gradients on chrome, no coloured backgrounds except `accent-soft` washes behind active items.

**Type.**
- One mono for UI, labels, numbers and meta. One display face for headings, prose and widget titles.
- Weights 400 and 600 only.
- Meta is 12 px uppercase mono with +.06em tracking: the one label style, used sparingly. No label above every block.

**Motion.**
- 150 ms `cubic-bezier(.2,.8,.2,1)` for chrome. Card transitions stay the engine's own (masks, dissolves).
- The theme and accent switch is one orchestrated moment: a dot-dither wipe from the control you pressed, made with the existing Bayer mask, or a circle reveal. Skipped under reduced motion.

**Consistency rules (enforced, §6).**
- Only token values are used for spacing, type, radius, colour and shadow.
- One component per job: one pill, one segmented control, one sheet, one menu, one tooltip.
- Every interactive element has the same four states (rest, hover, press, focus) built from the same tokens.

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

## 3. Layout direction

- **The frame:** a centred column (`--frame-max` 1440 px) with a quiet panel edge (dotted hairline) at ≥768 px. Outside the frame is the plain room colour.
- **Bands:** each board is a band (title, one-line blurb, grid) separated by `--gap-section` and a dotted rule.
- **Pages:** About and the widget page are bands in the same frame, not islands.
- **Alignment:** one left edge for everything inside the frame; text has a measure (≤ 68ch body, ≤ 42rem headings).
- **Cards:** grids are sized to the screen (§3, card sizing), and the space inside a card is the display's own.

### Tokens (one scale; replaces the 42 spacing and 19 type values)

```css
/* spacing (4 px grid) */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px; --space-5: 24px;
--space-6: 32px; --space-7: 48px; --space-8: 64px; --space-9: 96px; --space-10: 128px;
/* rhythm: inside a group / before actions / between sections */
--gap-group: var(--space-3); --gap-action: var(--space-6); --gap-section: clamp(var(--space-8), 8vw, var(--space-10));
/* layout */
--frame-max: 90rem; --frame-pad: clamp(16px, 3vw, 40px); --measure: 68ch; --measure-head: 42rem;
--hair-dot: 1px; --hair-pitch: 4px;  /* dotted hairline: a 1 px dot every 4 px */
--radius-card: 12px; --radius-ctl: 8px; --radius-pill: 999px; --dur: 150ms; --ease: cubic-bezier(.2,.8,.2,1);
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

## 4. Theme system: scheme × accent (Tamagui-style)

### Model
Tamagui themes are a tree: base `light` and `dark`, with children such as `light_accent` or `dark_red` resolved by name. A nested `<Theme name="red">` under dark resolves to `dark_red`. Each theme supplies the same semantic keys (`background`, `background-hover`, `border-color`, `color`, …), so components never know which theme they are in.

We take the same model, in CSS and engine tokens:

```
theme = scheme × accent [× contrast]
  scheme   ∈ { dark, light }            ← 'system' resolves to one of these
  accent   ∈ { signal (red, default), ember, amber, phosphor, mint, cyan, cobalt, violet, magenta } ∪ { custom hue }
  contrast ∈ { normal, more }           ← auto from prefers-contrast: more
name: `${scheme}_${accent}` (e.g. dark_signal, light_cobalt), as Tamagui resolves light_red
```

**Semantic keys** are identical in every theme. Components and cards read roles, never hues.
- **Neutral roles** (from the scheme): `bg`, `panel`, `card`, `raised`, `overlay`, `line`, `line-strong`, `text-1`, `text-2`, `text-3`, `scrim`, `shadow`.
- **Accent roles** (from the accent ramp *for this scheme*):

| Role | Use |
|---|---|
| `accent` | dots, fills, the solid |
| `accent-hover` / `accent-press` | the same hue, ±1 step |
| `accent-text` | accent used as text, ≥ 4.5:1 on `card` |
| `accent-soft` | washes behind active items, ≈ 12% |
| `accent-line` | the active border |
| `accent-glow` | the halo |
| `on-accent` | text on a solid accent fill |

- **Engine roles:**
  - `dotActive = accent`;
  - `dotActiveDim` = the ramp's dim step for this scheme. In dark it is a dimmer accent; in light it is less ink, a lighter tint;
  - neutral dot roles (`dotFaint`, `dotMid`, `dotIdle`, `value`, `surface`) come from the scheme.

### Accent ramps (generated, then tuned)
- **Generation:** each accent is one OKLCH hue with a 12-step ramp per scheme, like Radix/Tamagui scales. Steps 1–2 are washes, 3–5 component fills, 6–8 lines, 9–10 the solid, 11–12 text. One generator (`scripts/site/accents.ts`) produces both schemes from `{ hue, chroma }`.
- **Contrast clamping:** the generator clamps lightness until every rule passes, then writes a static table (no runtime colour math). The rules:
  - `accent` dots ≥ 3:1 on `card` (WCAG 1.4.11) in both schemes;
  - `accent-text` ≥ 4.5:1;
  - `on-accent` ≥ 4.5:1 on `accent`;
  - the APCA order of the neutral dot tones is preserved;
  - the accent is distinguishable from `value` at dot size (ΔL or ΔE threshold).
- **Hand-tuning:** each preset is tuned by eye after generation and stored with its numbers.
- **Custom hue (later, T6):** a hue slider runs the same generator in the browser (≈ 1 kB, lazy, loaded only when the slider opens). Its output is clamped by the same rules, so any hue the visitor picks stays legible in both schemes.

| Accent | Character | Dark solid (start) | Light solid (start) |
|---|---|---|---|
| `signal` (default) | today's red | `#FF3B30` | `#E5352B` (text `#B8241A`) |
| `ember` | orange | OKLCH 0.70 0.19 45 | 0.60 0.19 45 |
| `amber` | VFD-warm | 0.80 0.16 80 | 0.62 0.15 70 (text darker) |
| `phosphor` | green CRT | 0.82 0.20 145 | 0.55 0.17 145 |
| `mint` | soft green-cyan | 0.82 0.12 170 | 0.55 0.11 170 |
| `cyan` | VFD cyan | 0.80 0.12 210 | 0.55 0.11 220 |
| `cobalt` | blue | 0.68 0.17 260 | 0.52 0.19 260 |
| `violet` | purple | 0.70 0.17 300 | 0.52 0.19 300 |
| `magenta` | pink | 0.70 0.21 350 | 0.55 0.21 350 |

These values are starting points; the generator's clamped output is the source of truth.

### Scoping (Tamagui's nested `<Theme>`)
- **`data-scheme` and `data-accent`** can sit on `<html>` (the visitor's choice) or on any subtree, just as Tamagui nests themes.
  - A subtree can pin a scheme: an always-dark camera inset on a light page.
  - A widget embed can carry `?accent=` and `?scheme=`.
  - The editor's frames keep their own theme, which belongs to the artwork.
- **`useTheme()` composition.** It merges the nearest scoped attributes, so `DotWidget` resolves card colours from the same scope as its CSS.
- **Semantic colours that must not follow the accent:** none today. The "LIVE DATA" badge uses the accent too ("red means live" becomes "accent means live"), which keeps one accent per board. Error states use neutral emphasis plus an icon, not a second hue.

### Theme versus display skin
- A theme is the palette roles; a skin is the display physics. They layer: theme first, then skin.
- **Emissive skins** (CRT, VFD, LED, Nixie) render the card with a dark scheme even on a light page, because a tube is dark glass. They are tinted by the accent: VFD phosphor and LED colour come from `accent`, so a `cyan` accent gives a cyan VFD.
- **Nixie** stays neon orange by physics unless the owner prefers accent-tinted tubes (decision).
- **Reflective skins** (e-ink, flip-disc) take their panel colours from the scheme and their "ink" from the theme.
- This avoids black dots on a black tube.

### Runtime path
1. **`src/site/theme.ts`** (≈ 0.4 kB, the `skins/store.ts` pattern).
   - **State:** `{ scheme: 'system'|'dark'|'light', accent: AccentId|'custom', hue?: number, contrast: 'auto'|'more' }`.
   - **Sources:** `?scheme=` / `?accent=` (and the shorthand `?theme=light_cobalt`), then localStorage `dot480:theme`, then defaults (`system`, `signal`).
   - **Writes:** `<html data-scheme data-accent>`, `color-scheme`, and the `theme-color` content.
   - Listens to `matchMedia` while on `system` and `auto` contrast, and exposes `useTheme()` via `useSyncExternalStore`.
2. **Tokens in CSS.**
   - Neutral roles are set per `[data-scheme]`.
   - Accent roles are set per `[data-scheme][data-accent]` from the generated table, about 9 × 2 × 10 declarations (≈ 2 kB CSS gz, which the JS budget doesn't count).
   - A custom hue writes the 10 accent variables inline on `<html>`.
3. **Engine tokens.** `themeTokens(scheme, accent)` builds a `ThemeTokens` from the same generated table: the neutral preset (`dot480` for dark, `paper` for light) with `dotActive` / `dotActiveDim` replaced. The result is memoised per name, so `useDotField`'s per-theme cache keys stay stable.
   - **Cost:** cards re-sample once per switch. `DotCanvas` already depends on `theme` (`DotCanvas.tsx:419`), and switching back is a cache hit.
   - **Faster path:** the canvas `DotBuffer` path could swap only `buf.palette` (`dotBuffer.ts:27-35`), because colour is a per-dot tone index. This is an optional optimisation for accent-only switches.
4. **No-flash boot.** A ≈ 250 B inline head script resolves scheme + accent before first paint and sets the attributes. Its `sha256` goes into `script-src` in `vercel.json` (`script-src 'self'` today), and `scripts/site/csp-hash.ts` fails if the script and the hash drift apart.
5. **Head tags.** `index.html` and the manifest get `<meta name="color-scheme" content="dark light">` and media-qualified `theme-color` tags. The boot script rewrites `theme-color` to the chosen `bg`.
6. **Theme readers.**
   - `Board` reads `useTheme()` instead of `usePlayground(s => s.theme)` (`Board.tsx:69-81`).
   - Hard-coded `dot480` in `WidgetPage.tsx:49,76,81,86`, `DrawBoard.tsx:61`, `editor/Panels.tsx:121` and `studio/StudioCanvas.tsx:61` switches to the scoped theme.
   - The playground's own "theme" select becomes "palette".
7. **Polarity.** Halftone photos, camera and lit-material cards would become negatives on paper. They render inside a pinned `data-scheme="dark"` inset, or declare `polarity: 'luma'` (decided per board).
8. **Switch moment.** `document.startViewTransition` with a Bayer dot-dither wipe or circle reveal from the pressed control. Cards re-sample inside the callback. Skipped without the API or under reduced motion.

### Picker
- **Desktop:** a THEME popover in the topbar, next to DISPLAY ▾. It holds:
  - scheme as a three-way segmented control (System / Light / Dark);
  - the accents as a row of 9 dot swatches (each a 7×7 dot glyph in its own colour on the current scheme, the selected one with the glow ring);
  - a "custom" swatch that opens the hue slider (T6);
  - a live preview: the popover's own controls re-tint as you hover a swatch.
- **Phones:** the same content as a THEME section in the TOOLS sheet. Swatches are 44 px targets.
- **⌘K:** commands such as `theme light`, `accent cobalt`, `accent next`.
- **Links:** `?theme=light_cobalt` (or `?scheme=` and `?accent=`). Share links and widget-page copy-link can include the visitor's theme as an opt-in toggle.

### Goldens, OG, budget
- **Goldens** stay on `dark_signal`.
- **`golden --theme-parity`** samples every preset in every `scheme × accent` and maps colours back to roles through `paletteOf`. It requires identical `(x,y,r,opacity,role)` hashes: a theme may only recolour, never move or resize a dot.
- **A contrast check** runs per generated theme, using the generator's rules.
- **OG images** and exports default to `dark_signal`. Widget-page exports can use the current theme (owner decision).
- **First load:** ≈ +0.5 kB JS (store + boot + the `paper` neutral preset + the accent table index). Accent CSS isn't JS. The custom-hue generator and the transition code are lazy.

## 5. Phases

| Phase | What | Days | Gate |
|---|---|---|---|
| **T0 tokens and cleanup** | spacing, type, radius, motion and layout tokens (§3); delete the index.css starter rules (`#root` centring) and the shadcn block; one `.dot-card` definition (today 3: App.css:411/1020/3070); move raw colour literals into the neutral roles; the `css-tokens` lint | 1.5 | goldens 177/177, size unchanged, no visual change except the centring fix |
| **T1 design language in chrome** | surfaces (bg / panel / card / raised), dotted hairlines, the one glow effect for active / focus / live, the four-state rule for every control, dot-glyph icons, 150 ms motion; one component per job (pill, segmented, sheet, menu, tooltip) | 2 | component inventory review; screenshot pass at 1440 and 390 |
| **T2 frame and rhythm** | the frame, one left edge, section bands, header rhythm on the three steps, intro as a measured block; About and widget page inside the frame; editor toolbar aligned; dock no longer over cards; footer as a band (no 64 px dead strip) | 2.5 | layout probe (§6) at 6 widths |
| **T3 grids and cards** | `density` per board, auto-fill grids, container queries, card cap at `62svh`, orphan rows, phone fixes (ALL pill overlap, intro + picker ≤ 120 px, square cards) | 2 | ≥ 6 cards above the fold at 1440 (standard boards), ≥ 2 (hero); no stretched orphan rows; components steps 5→4→3→2→1 |
| **T4 scheme × accent core** | accent generator + clamped table (9 accents × 2 schemes); `paper` neutral preset; `theme.ts` store; boot script + CSP hash; CSS roles per `[data-scheme][data-accent]`; `themeTokens()`; scoped `data-scheme` / `data-accent`; theme readers (Board, WidgetPage, editor, draw); the skin rules (emissive = dark + accent tint); polarity insets | 3.5 | theme-parity across all 18 themes; contrast checks pass; no flash (probe); size Δ ≤ +0.5 kB |
| **T5 picker and moment** | THEME popover (scheme + swatches + live preview), TOOLS section, ⌘K commands, URL params, the dither-wipe switch moment, share-link opt-in | 1.5 | touch probe for the sheet; reduced-motion probe |
| **T6 type, contrast, more** | type scale everywhere (12 px chrome minimum), display face for headings and prose, `text-wrap`; `contrast: more`; custom-hue slider (lazy generator); docs (DESIGN.md colour, theme, layout and component tables, README, PROGRESS, CHANGELOG, `src/changelog.ts`) | 2.5 | < 10% chrome characters under 12 px; all text ≥ 4.5:1 in every theme; owner taste pass in 4 themes (dark_signal, light_signal, dark_cyan, light_cobalt) |

Total ≈ 15.5 agent-days. Order:
1. T0 first.
2. T1 and T4 in parallel: T1 owns component CSS; T4 owns tokens, `theme.ts`, `index.html` and the readers.
3. T2 after T1, then T3.
4. T5 after T4.
5. T6 last.

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
- **`golden --theme-parity`** across all `scheme × accent` themes, and a **contrast** check per generated theme: APCA order for the dot tones, WCAG 4.5:1 for text roles and `accent-text`, 3:1 for accent dots, and accent distinct from `value`.
- **Consistency lint** (`scripts/site/css-tokens.ts`):
  - only tokens for spacing, type, radius, colour, shadow and duration;
  - no hue literals outside the generated accent table;
  - every `:hover` has a matching `:active` and `:focus-visible`;
  - `glow` is used only on active, focus and live selectors.
- **`scripts/site/theme-boot.ts`:** loads each page with cache disabled under `prefers-color-scheme: light` and `dark` and a stored choice, and asserts the first frame already has the right `data-theme` (no flash). It also checks the CSP hash.

## 7. Owner decisions
1. **Default scheme:** `system` (follow the OS), or dark first. [Recommended: `system`.]
2. **Accent set:** the 9 listed (signal, ember, amber, phosphor, mint, cyan, cobalt, violet, magenta), or fewer. [Recommended: ship 6 first (signal, amber, phosphor, cyan, cobalt, magenta), then the rest.]
3. **Custom hue slider** (any hue, contrast-clamped). [Recommended: yes, in T6.]
4. **Accent-tinted skins:** VFD and LED take the accent; Nixie stays orange. [Recommended: yes for VFD and LED, Nixie physical.]
5. **"Live" follows the accent:** ("accent means live"), or keep a fixed red live badge. A fixed red would be a second hue on non-red themes. [Recommended: follow the accent.]
6. **Polarity on paper:** photos and camera as dark insets, materials decided per card. [Recommended.]
7. **Exports and OG:** canonical `dark_signal`, or the visitor's theme for widget-page exports. [Recommended: OG canonical; exports offer "current theme".]
8. **Card grid style:** tighter separated cards, or edge-to-edge cells with dotted rules. [Recommended: compare both in T3.]

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
- **Tamagui:** [themes](https://tamagui.dev/docs/core/theme) (base `light` / `dark`, nested names like `dark_pink`, semantic keys `background`, `border-color`, …) and the [theme builder](https://tamagui.dev/docs/guides/theme-builder) (`createThemes`, `light_accent`, palette ramps, relative levels).
