# LAYOUT-THEME-PLAN: design language, layout and themes

> Status: **T0–T6 built and merged** (T0–T4 in PR #9; T3, T5 and T6 in round 2, PR #10, 2026-10-29; `docs/PROGRESS.md`). Planned and revised 2026-10-27.
> **Revision 2:** adds vite.dev's purple as the `vite` accent; ideas from award-winning product sites (§1c); a trimmed, gamut-safe accent list with neutrals tinted toward each accent (§4).
> **Revision 1:** vite.dev is a reference for *how a well-made product feels*, not a theme to copy. Everything below is our own dot-matrix design language. "Theme" now means **scheme × accent** (Tamagui-style): light, dark and system, crossed with an accent the visitor can change. Each accent is tuned per scheme so it works in both.
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

## 1c. Learned from the best (vite.dev and award-winning product sites)

We studied vite.dev, Linear, Vercel (Geist), Stripe, Raycast, Resend, Cursor, Nothing, rauno.me, paco.me, teenage.engineering and family.co, plus Awwwards 2024–26 product winners. Where we could, we read the real CSS:
- **Lidar Drone Scanning** (Site of the Day, Oct 2026): a real-time point cloud, which shows a dots-only medium can win.
- **Anime.js** (Site of the Month, May 2025): its 13×13 dot stagger.
- **Fauna Robotics** (Site of the Day, Jun 2026).

The ideas we adopt, each tied to a phase:

| # | Idea (from) | What it becomes here | Phase | Cost |
|---|---|---|---|---|
| 1 | **Hover in instantly, fade out over 150 ms** (Linear: `--speed-highlightFadeIn: 0s; …FadeOut: .15s`) | `--dur-in: 0ms; --dur-out: 150ms`; transitions only on the non-hover state. **No motion** on ⌘K, menus and context menus (rauno: high-frequency actions don't animate) | T1 | S |
| 2 | **A hero you can touch** (Vercel's drop-to-deploy, Raycast's keyboard) | Home hero card: drop or paste an image, or move the pointer, and it halftones live through the engine. The drop handler loads lazily | T2/T3 | M |
| 3 | **Dot type only for names** (Nothing: Ndot only for category and product names; body text at weight 100) | Board and widget titles drawn as engine dot text (`textAt` / `T.big`); prose in the display face, meta in mono | T6 | M |
| 4 | **Grid crosses** (Geist `GridCross`, vite's corner ticks) | Dotted cell rules plus a 5×5 dot "+" where rules meet; cards hide the rules behind them; `aria-hidden`, 3:1 contrast | T3 | M |
| 5 | **Type named by role and size** (Geist `label-13-mono` / `copy-14`; Linear tracking −.011em at ≥ 15 px) | `--fs-label-12-mono`, `--fs-copy-16`, …; labels at 1.2–1.4 line height, copy at 1.6; tabular numbers on every figure | T0 | S |
| 6 | **Warm paper** (Cursor: `#f7f7f4` / `#f2f1ed`; Linear's 2–3% L surface levels) | the `paper` neutral preset, not pure white | T4 | S |
| 7 | **Glass for `raised` only** (Raycast: `0 4px 40px 8px #0006, 0 0 0 .5px #000c, inset 0 .5px #fff4`) | menus, sheets and popovers; cards keep the single hairline | T1 | S |
| 8 | **CSS scroll edge fades** (Resend: `animation-timeline: scroll(self inline)`) | group tabs and board strip on phones; replaces the sticky ALL pill that covers "RT HERE" | T3 | S |
| 9 | **Scroll-snap sheet** (Stripe: snap container + scroll-timeline scrim) | phone TOOLS / THEME sheets dismiss by dragging with no gesture JS | T1 | M |
| 10 | **Hover intent and grouped tooltips** (Stripe 100 ms; Geist: first tooltip delayed, the next ones instant) | DISPLAY and THEME open after 100 ms; dock tooltips wait ≈ 400 ms then show instantly; keycaps drawn as 5×7 dot glyphs | T1/T5 | S |
| 11 | **No-flash, no-smear theme switch** (next-themes `disableTransitionOnChange`; Cursor `@view-transition` with 0 s root) | boot script plus a `.no-transition` class during non-animated switches; route changes cut, and only the opened card morphs | T4 | S |
| 12 | **Radial stagger moment** (Anime.js 13×13 dot stagger) | the theme and accent dither wipe is ordered by distance from the pressed control; cards re-sample in that order | T5 | S |
| 13 | **Live number band** (Stripe's GDP counter, Apple's big stats) | a footer band with one live engine stat (dots drawn this visit, frame ms) as a dot-text card; replaces the 64 px dead strip | T2 | S/M |
| 14 | **Figure captions** (Linear "Fig 0.1") | `FIG 03.2 · halftone · 4 px` legends on About and essay figures and under the widget-page card | T2/T6 | S |
| 15 | **Interaction hygiene** (Vercel guidelines) | hit areas 24 / 44 px, `touch-action: manipulation`, no `transition: all`, `text-wrap: balance/pretty`, delayed spinners (150–300 ms, then visible ≥ 300 ms) at the final size | T1/T6 | S |

**Optional:** an opt-in press "tick" that reuses the flip-disc clack (`src/media/clack.ts`), off by default. `navigator.vibrate(5)` works on Android but not iOS.

**Don't copy:**
- an accent per section (Linear) or coloured halos (Raycast): both are a second hue;
- gradient waves on chrome (Stripe);
- pixel webfonts (VT323, Ndot): they fake dots, and ours come from the engine;
- WebGL/Three.js heroes and scroll-scrubbed image sequences: new deps, the size budget, and scroll hijacking;
- grain overlays, logo marquees and auto-moving chrome;
- many font families (Cursor loads ~8), or a 10-hue scale system (Geist);
- a scroll reveal on every section: at most one, on the hero.

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
  accent   ∈ { signal (red, default), amber, phosphor, cyan, cobalt, vite (purple), magenta } ∪ { custom hue }
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

### Accent ramps (generated, clamped, a few hand-pinned)

**Generation.** Each accent is one OKLCH hue with a 12-step ramp per scheme (Radix/Tamagui roles):
- 1–2: washes;
- 3–5: component fills;
- 6–8: lines (8 is the focus ring);
- 9–10: the solid;
- 11–12: text.

One generator (`scripts/site/accents.ts`) writes a static table, so there is no runtime colour math. `scripts/site/contrast.ts` re-checks the table in CI.

**Rules** (the generator clamps until they pass; hand-pinned presets must pass them too):
- **Gamut:** every colour stays inside sRGB. Chroma is binary-searched per lightness and hue.
  - Yellows, greens and cyans lose chroma in light mode; blues and purples lose it at high lightness in dark.
  - Five of revision 1's starting values were out of gamut: light ember, amber, mint, cyan, and dark cobalt.
- **Dots:** `accent` ≥ 3:1 on `card` (WCAG 1.4.11).
- **Text:** `accent-text` ≥ 4.5:1, and ≥ APCA Lc 60 for 12–14 px chrome.
- **`on-accent`** is chosen by measured contrast, not fixed white: white if APCA ≥ 60, else a dark tint of the same hue, `oklch(.25 max(.08·C, .04) H)`. It must reach ≥ 4.5:1. (vite.dev's white on `#B39AFF` is only 2.34:1; we don't repeat that.)
- **Colour-blind safety:** each board has one accent against neutrals, so the risk is accent vs grey.
  - Under protan and deutan simulation, `accent` must differ from `value` and `dotMid` by ΔL ≥ .08 or a ΔE threshold, not by hue alone.
  - Example: `#FF3B30` drops from L .65 to .53 under protanopia.
- **Tone order:** the neutral dot tones keep their APCA order (faint < mid < idle < value).

```
gen(hue, cTarget, scheme, neutrals):
  bg, card = neutrals[scheme]
  ramp = L_STEPS[scheme].map((L, i) => gamutClamp(L, cTarget * C_CURVE[i], hue))  // C peaks at step 9
  solid = ramp[8];  while (wcag(solid, card) < 3)   nudge(solid.L toward contrast); gamutClamp(solid)
  text  = ramp[10]; while (wcag(text, card) < 4.5)  nudge(text.L);  text.C = min(text.C, solid.C)
  on    = apca(white, solid) >= 60 ? white : oklch(.25, max(.08*solid.C, .04), hue)
  line  = first of ramp[5..7] with wcag(step, card) >= 3
  dim   = scheme == dark ? ramp[6] : ramp[4]            // dark: dimmer; light: less ink
  assert protanDeutanDistinct(solid, value, dotMid); assert toneOrder(neutrals[scheme])
  return { solid, hover: ramp[9], press: ramp[7], text, soft: mix(solid, 12%), line,
           glow: mix(solid, 35%), on, dim, neutrals: tint(neutrals[scheme], hue, scheme) }
```

**Presets: 7 plus custom.**

Revision 1's `violet` is dropped because it is nearly identical to vite's `#B39AFF`; `vite` replaces it. `ember` (16° from signal) and `mint` (25° from phosphor) are dropped because they are hard to tell apart at dot size. Both remain reachable through the custom hue.

| Accent | Hue | Character | Notes |
|---|---|---|---|
| `signal` (default) | 29 | today's red | dark solid `#FF3B30` (golden); light text deepens to ≈ `#B8241A` |
| `amber` | 75 | VFD warm | light solid ≈ 3.75:1, so `accent-text` is darker; `on-accent` is dark |
| `phosphor` | 145 | green CRT | `on-accent` is dark |
| `cyan` | 210 | VFD cyan | chroma ≤ ~.094 at L .55 in light |
| `cobalt` | 260 | blue | dark chroma clamped to ≤ .169 at L .68 |
| `vite` | 285–294 | vite.dev's purple | **hand-pinned**, table below |
| `magenta` | 350 | pink | — |

**The `vite` preset.** Taken from `@voidzero-dev/vitepress-theme` tokens: `--color-electric #6C3BFF`, `--color-vite #B39AFF`, the vite docs' light brand `#6B1EB9`, and the hero panels `#370A7F`.

| Role | Dark (on card `#111315`) | Light (on white / paper) |
|---|---|---|
| `accent` (dots, solid) | `#B39AFF` (7.96:1) | `#6C3BFF` (5.66:1) |
| `accent-hover` / `-press` | `#C2AEFF` / `#A388F8` | `#602AE3` / `#6B1EB9` |
| `accent-text` | `#B39AFF` | `#6B1EB9` (8.36:1) |
| `accent-soft` | `#B39AFF` at 14% | `#6C3BFF` at 10–14% |
| `accent-line` | `#6C3BFF` (3.29:1) | `#8A63FE` (3.96:1) |
| `accent-glow` | radial `electric → vite` (9° apart, so it reads as one accent) | the same at lower alpha |
| `on-accent` | `#16171D` (7.65:1; white fails) | `#FFFFFF` (5.66:1) |
| `dotActiveDim` | `#6C3BFF` | `#B39AFF` (less ink) |
| `accent-surface` (hero insets only) | `#370A7F` | `#F0EBFF` with `#140033` text |

- **Gradient rule:** the two-stop `electric → vite` gradient is allowed **only** in chrome halos (glow, focus and live ring, swatch ring). It is never used on dots, text, lines or any engine tone, so `theme-parity` ("recolour only") holds.
- **vite's textured buttons:** the photo-texture JPG panned for 16 s is not copied. If we want that feel, it becomes an `electric → vite` **dither drawn in dots** through the engine (the hero card or the primary pill's press state).

**Neutrals tinted toward the accent** (Radix gray pairing, Linear's limited base chroma; vite.dev's own neutrals are mauve, e.g. `#0C0912`, `#14121A`, `#867E8E`). Each accent tints the neutral roles toward its hue by a little OKLCH chroma:

| Role | Chroma |
|---|---|
| surfaces (`bg`, `panel`, `card`, `raised`) | 0.004–0.006 |
| `line`, `text-3` | ≤ 0.012 |
| `text-1`, `value` | ≤ 0.004 |
| `vite` surfaces | up to 0.016, to echo VoidZero's mauve |

- Light gets about 70% of these amounts.
- Neutral dot tones stay untinted (at most 0.006 on `dotFaint`), so the accent still pops.
- `dark_signal` keeps today's neutrals exactly (`#111315` is already C .005 at hue 248), so **goldens don't move**.

**Extra roles:**
- `accent-surface` (hero insets only);
- `focus-ring = accent-line`;
- `selection = accent-soft at 30%` (`::selection`);
- `accent-color: var(--accent)` on `:root`, so native checkboxes, ranges and radios follow (Chrome 93, Firefox 92, Safari 26.2).

**Custom hue (T6).** A hue ring (lazy, ≈ 1 kB) runs the same generator in the browser; chroma and lightness are generated, so no illegible pick is possible. **"Match my OS accent" is dropped:** browsers return a fixed blue for `AccentColor` (Firefox 103+, Safari 16.5+, Chrome 149+ outside installed apps) to prevent fingerprinting.

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
   - Accent roles are set per `[data-scheme][data-accent]` from the generated table, about 7 × 2 × 14 declarations, including the tinted neutrals (≈ 2 kB CSS gz, which the JS budget doesn't count).
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
- **Desktop:** a THEME popover in the topbar, next to DISPLAY ▾. It opens after 100 ms of hover intent, or on click, and holds:
  - scheme as a three-way segmented control (System / Light / Dark);
  - the accents as a row of 7 dot swatches (arrow-key roving) (each a 7×7 dot glyph in its own colour on the current scheme, the selected one with the glow ring);
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
| **T0 tokens and cleanup** | spacing, type (named by role and size, §1c #5), radius, motion (`--dur-in 0` / `--dur-out 150ms`) and layout tokens (§3); delete the index.css starter rules (`#root` centring) and the shadcn block; one `.dot-card` definition (today 3: App.css:411/1020/3070); move raw colour literals into the neutral roles; the `css-tokens` lint | 1.5 | goldens 177/177, size unchanged, no visual change except the centring fix |
| **T1 design language in chrome** | surfaces (bg / panel / card / raised), dotted hairlines, the one glow effect for active / focus / live, the four-state rule for every control, dot-glyph icons; hover in instantly and out over 150 ms, no motion on menus and ⌘K; Raycast-style glass for `raised` only; hover intent and grouped tooltips with dot keycaps; scroll-snap sheets; interaction hygiene (§1c #1, 7, 9, 10, 15); one component per job (pill, segmented, sheet, menu, tooltip) | 2.5 | component inventory review; screenshot pass at 1440 and 390 |
| **T2 frame and rhythm** | the frame, one left edge, section bands, header rhythm on the three steps, intro as a measured block; About and widget page inside the frame; editor toolbar aligned; dock no longer over cards; footer as a band (no 64 px dead strip) with the live number band; the touchable hero card (drop or paste an image → live halftone); figure captions (§1c #2, 13, 14) | 3.5 | layout probe (§6) at 6 widths |
| **T3 grids and cards** | `density` per board, auto-fill grids, container queries, card cap at `62svh`, orphan rows, grid crosses where dotted rules meet (if the ruled style is chosen), CSS scroll edge fades on the strips; phone fixes (ALL pill overlap, intro + picker ≤ 120 px, square cards) | 2.5 | ≥ 6 cards above the fold at 1440 (standard boards), ≥ 2 (hero); no stretched orphan rows; components steps 5→4→3→2→1 |
| **T4 scheme × accent core** | accent generator + clamped table (7 accents × 2 schemes, with `vite` hand-pinned) and tinted neutrals; warm `paper` neutral preset (`#f7f7f4`-like); `.no-transition` during switches; `theme.ts` store; boot script + CSP hash; CSS roles per `[data-scheme][data-accent]`; `themeTokens()`; scoped `data-scheme` / `data-accent`; theme readers (Board, WidgetPage, editor, draw); the skin rules (emissive = dark + accent tint); polarity insets | 3.5 | theme-parity across all 14 themes; gamut, contrast and colour-blind checks pass; contrast checks pass; no flash (probe); size Δ ≤ +0.5 kB |
| **T5 picker and moment** | THEME popover (scheme + swatches + live preview), TOOLS section, ⌘K commands, URL params, the dither-wipe switch moment ordered by distance from the pressed control (Anime.js-style radial stagger), share-link opt-in | 1.5 | touch probe for the sheet; reduced-motion probe |
| **T6 type, contrast, more** | type scale everywhere (12 px chrome minimum), display face for headings and prose, board and widget **names in engine dot type** (§1c #3), `text-wrap`; `contrast: more`; custom-hue slider (lazy generator); docs (DESIGN.md colour, theme, layout and component tables, README, PROGRESS, CHANGELOG, `src/changelog.ts`) | 3 | < 10% chrome characters under 12 px; all text ≥ 4.5:1 in every theme; owner taste pass in 4 themes (dark_signal, light_signal, dark_vite, light_cobalt) |

Total ≈ 18.5 agent-days. Order:
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
2. **Accent set:** signal, amber, phosphor, cyan, cobalt, vite, magenta, plus custom. [Recommended: all 7 in T4.]
3. **Custom hue ring** (any hue, contrast- and gamut-clamped). [Recommended: yes, in T6.]
4. **Accent-tinted skins:** VFD and LED take the accent; Nixie stays orange. [Recommended.]
5. **"Live" follows the accent**, or a fixed red badge (a second hue on non-red themes). [Recommended: follow the accent.]
6. **Neutral tinting toward the accent:** on (subtle, per the table) or off. [Recommended: on; `dark_signal` unchanged.]
7. **vite's gradient glow:** the `electric → vite` halo on chrome only. [Recommended: yes; never on dots.]
8. **Polarity on paper:** photos and camera as dark insets; materials decided per card. [Recommended.]
9. **Exports and OG:** canonical `dark_signal` for OG; exports offer "current theme". [Recommended.]
10. **Card grid style:** tighter separated cards, or edge-to-edge cells with dotted rules and grid crosses. [Recommended: compare both in T3.]
11. **Touchable hero card** on the home page (drop or paste an image → live halftone). [Recommended: yes.]
12. **Names in dot type** (board and widget titles drawn by the engine). [Recommended: yes.]
13. **Live number band** in the footer. [Recommended: yes.]
14. **Press tick sound** (opt-in, reuses the flip-disc clack). [Recommended: off by default, toggle in TOOLS.]

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
- **Product sites (read from CSS where possible):** linear.app, vercel.com ([Geist guidelines](https://vercel.com/design/guidelines), [grid](https://vercel.com/geist/grid.md), [colors](https://vercel.com/geist/colors.md)), stripe.com, raycast.com, resend.com, cursor.com, nothing.tech, [rauno.me interaction design](https://rauno.me/craft/interaction-design), paco.me (cmdk, next-themes), teenage.engineering, family.co.
- **Awwwards:** [product winners](https://www.awwwards.com/websites/winner_category_product/), [Anime.js](https://www.awwwards.com/sites/anime-js), [Lidar Drone Scanning](https://www.awwwards.com/sites/lidar-drone-scanning), [Fauna Robotics](https://www.awwwards.com/sites/fauna-robotics).
- **Colour systems:**
  - vite: [`@voidzero-dev/vitepress-theme` tokens](https://unpkg.com/@voidzero-dev/vitepress-theme/src/styles/tokens.css), [vite docs styles](https://raw.githubusercontent.com/vitejs/vite/main/docs/.vitepress/theme/styles.css);
  - [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui);
  - [Radix Themes colour](https://www.radix-ui.com/themes/docs/theme/color), [Radix scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale);
  - [Primer colour usage](https://primer.style/product/getting-started/foundations/color-usage/), [GitHub colour-blind themes](https://github.blog/changelog/2022-04-19-protanopia-deuteranopia-colorblind-themes-beta/);
  - [MDN system colours](https://developer.mozilla.org/en-US/docs/Web/CSS/system-color), [CSSWG #10372 (AccentColor fingerprinting)](https://github.com/w3c/csswg-drafts/issues/10372);
  - [APCA](https://github.com/Myndex/apca-introduction).
- **Tamagui:** [themes](https://tamagui.dev/docs/core/theme) (base `light` / `dark`, nested names like `dark_pink`, semantic keys `background`, `border-color`, …) and the [theme builder](https://tamagui.dev/docs/guides/theme-builder) (`createThemes`, `light_accent`, palette ramps, relative levels).
