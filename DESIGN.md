## Overview

The Dot/480 system is built like firmware for a physical LED-matrix panel that learned interface design — every widget is a fixed grid of individually-addressable dots, rendered on a near-black surface, framed by a single hairline card border. There is exactly one accent color in the entire system, and it is doing all the work: **Signal Red** (`{colors.dotActive}` — `#FF3B30`), used for every active state, every recording/live indicator, every progress fill, and the one glowing dot that marks a widget as "on." Every other dot in the system sits in a narrow band of cool greys. Nothing else competes for attention.

The system's character comes from **quantization** — no gradients, no soft blends. Every visual (a clock digit, a heartbeat line, a photograph) is first reduced to a scalar field, then resampled onto a fixed dot grid, then posterized into a small number of discrete size/opacity steps (`{grid.quantizeSteps}` — default 5). This is what gives Dot/480 its "hardware, not software" feel: the eye reads dot-density the way it reads an old OLED segment display, not the way it reads a modern photographic UI.

Two surface tones do all the work: `{colors.bg}` (near-black canvas) behind everything, and `{colors.surface}` (a half-step lighter charcoal) for every card. Cards never use shadow for separation — only a 1px `{colors.hairline}` border at low opacity. Corner rounding is a single continuous knob (`{rounded.squircleExponent}`) rather than a fixed radius scale, letting every card interpolate between a sharp square and a soft squircle without a second token.

**Key Characteristics:**
- Single-accent system: `{colors.dotActive}` (Signal Red) carries every live/active/progress state. Everything else is monochrome grey-on-black.
- Field-first rendering: every widget — text, icon, chart, photo — is generated from a sampled scalar field, never hand-drawn per-pixel. This is what makes density, size, and shape globally tunable.
- Quantized dot sizing: `{grid.quantizeSteps}` posterizes continuous field values into discrete dot-radius steps, producing the signature "chunky LED" look rather than smooth photographic gradation.
- Bitmap dot-font at every text role, from `{typography.microDot}` (5×7 grid) up to `{typography.heroDot}` (large multi-line block glyphs) — no serif, no italic, no variable weight.
- Card library leans on a hairline `{colors.hairline}` border and `{colors.surface}` fill; there is no elevation/shadow system.
- Signature decorative element: the small `{component.statusDot}` (~4–6px solid red circle) anchored to the top-right corner of any card reporting a live/active state.
- Uniform 3×3 (or 3×N) card grid as the default composition — every reference board in the system follows this same rhythm.

## Colors

> **Source tokens:** derived from the `dot480` and `deerflowMosaic` theme presets defined in `src/engine/theme/tokens.ts`. Both presets share the same role structure; only the surface warmth and accent hue shift between them.

### Brand & Accent
- **Signal Red** (`{colors.dotActive}` — `#FF3B30`): the entire brand. Every progress fill, every "live/recording/listening" indicator, every active-state dot, every destructive action.
- **Signal Red Dim** (`{colors.dotActiveDim}` — `#B8241A`): pressed/dimmed state for active elements — one step deeper than the accent, used when a red dot needs to read as "was active" rather than "is active."
- **Amber Wash** (`{colors.accentAmber}` — `#D98A3D`): reserved for the `deerflowMosaic` hero-preset only (ambient background lighting behind photoreal mockups); never appears on flat `dot480` chrome.

### Surface
- **Base Canvas** (`{colors.bg}` — `#070809`): the page/app background behind every card. Effectively black.
- **Card Surface** (`{colors.surface}` — `#111315`): every widget card sits on this — one perceptible step lighter than `{colors.bg}`, never a shadow.
- **Surface Raised** (`{colors.surfaceRaised}` — `#1B1E21`): nested elements inside a card (list rows, settings items, chat bubbles).
- **Hairline** (`{colors.hairline}` — `rgba(255,255,255,0.08)`): 1px card border, divider between list rows, table rule.
- **Hairline Active** (`{colors.hairlineActive}` — `#FF3B30` at 60% opacity): border treatment for a selected/focused card (see `settings-row-selected` in Components).

### Dot Grey Scale (the actual "ink" of the system)
- **Dot Idle** (`{colors.dotIdle}` — `#8A8F98`): default dot color at full field value (1.0) — used for the brightest part of any static widget.
- **Dot Mid** (`{colors.dotMid}` — `#5B5F66`): mid-value field dots — most of a typical widget's dot population lands here.
- **Dot Faint** (`{colors.dotFaint}` — `#2E3033`): lowest non-zero field value — barely-there background texture (e.g. inactive settings icons, unselected list dots).

### Text
- **Label** (`{colors.label}` — `#C7CBD1`): card eyebrow labels ("HOME", "MUSIC", "SYSTEM") — always uppercase, always `{typography.caption}`.
- **Value** (`{colors.value}` — `#F2F3F5`): primary dot-font numerals/short strings (clock time, percentages, scores).
- **Mute** (`{colors.mute}` — `#6E7278`): secondary metadata under a primary value (date, sub-label, unit).
- **On Active** (`{colors.onActive}` — `#FFFFFF`): text/labels drawn directly on a `{colors.dotActive}` fill (destructive pill button label, selected settings row).

### Semantic
- **Success** (`{colors.success}` — `#3FBF63`): rare — only appears in "Great job!" word-game feedback and checklist-complete states. Never used for a primary CTA.
- **Warning** (`{colors.warning}` — `#E8A33D`): battery-low, alert-count badges.
- **Charging/Positive Delta** (`{colors.deltaPositive}` — `#7BC96F`): retail/analytics up-arrow figures (e.g. "+$23%").

### CSS colour roles (chrome)
The page chrome reads these custom properties (`src/tokens.css`), never a hex. Values are today's dark palette (`dark_signal`); the theme CSS (`src/site/theme/themes.css`, generated; see Theme below) sets the same names per scheme and accent, plus the accent family (`--red-text`, `--on-red`, `--red-line`, ...). An alpha variant is written where it is used, `color-mix(in srgb, var(--role) N%, transparent)`, so it follows the role. `scripts/site/css-tokens.ts` fails on a colour literal anywhere else (the two token files excepted).

| CSS token | Value | Design token | Role |
|---|---|---|---|
| `--red` | `#FF3B30` | `{colors.dotActive}` | the one accent: active, live, selected (the theme's accent, whatever its hue) |
| `--bg` | `#070809` | `{colors.bg}` | the room behind everything |
| `--panel` | `#0D0F11` | — | the bezel: editor chrome, docked bars |
| `--surface` | `#111315` | `{colors.surface}` | the card glass |
| `--raised` | `#1B1E21` | `{colors.surfaceRaised}` | menus, rows, fields |
| `--line` | `rgba(255,255,255,.08)` | `{colors.hairline}` | 1 px borders and rules |
| `--line-strong` | `#3A3D42` | — | solid quiet ink: grab handles, grips, off glyphs |
| `--tint` / `--shade` | `#FFF` / `#000` | — | the light and the dark mixed into washes, lines, scrims, shadows, masks |
| `--well` | `#000` | — | the recess below the surface: code wells (light: the brightest paper) |
| `--scrim` | `rgba(0,0,0,.55)` | — | backdrop behind sheets and dialogs |
| `--value` | `#F2F3F5` | `{colors.value}` | primary text |
| `--label` | `#C7CBD1` | `{colors.label}` | labels, secondary text |
| `--dot-idle` | `#8A8F98` | `{colors.dotIdle}` | native controls (`accent-color`), the essay's meta grey |
| `--mute` | `#6E7278` | `{colors.mute}` | meta |
| `--dot-mid` | `#5B5F66` | `{colors.dotMid}` | quiet bars |
| `--dim` | `#4A4E54` | — | the dimmest text: units and sub-labels in the editor |
| `--dot-faint` | `#2E3033` | `{colors.dotFaint}` | off switches |

**Chrome materials** (T1, docs/LAYOUT-THEME-PLAN.md §1b). Built from the roles above, so a theme swap carries them.

| CSS token | Built from | Use |
|---|---|---|
| `--line-dot` | `--tint` at 24% | the ink of a dotted hairline |
| `--hair-x` / `--hair-y` | a 1 px `--line-dot` dot every `--hair-pitch` | rules and dividers: `border-bottom: 1px solid var(--line); border-image: var(--hair-x) 1` (`--hair-y` for a vertical divider). Card and panel *edges* stay the solid `--line` |
| `--line-hover` | `--tint` at 28% | the outline of a hovered or focused outlined control |
| `--card-edge` | inset 1 px `--tint` at 4% | the card's top-edge highlight (with its single hairline) |
| `--wash-hover` / `--wash-press` | `--tint` at 5% / 9% | hover is a lightness lift, press one step more; never a colour change |
| `--glow`, `--glow-halo`, `--glow-wash` | `--red`: a 1 px ring + 16 px halo at 30%; the halo alone; a 12% wash | **the one signature effect**, only on active, focus and live selectors (the lint enforces it) |
| `--glass` / `--glass-blur` | `--raised` at 84% / `blur(16px) saturate(140%)`; phones and coarse pointers 92% / `blur(8px)` | raised layers only: menus, popovers, sheets, ⌘K |
| `--shadow-raised` | `--shade` 40% spread, a .5 px `--shade` ring, an inset .5 px `--tint` top | every raised layer, toasts and tooltips |

## Typography

### Font System
Dot/480 has **no conventional font family** — every text role is a precomputed bitmap dot-grid glyph set (see `bitmapFont.ts`), not a rasterized TTF. Latin letters, digits, and punctuation use a hand-authored 5×7 base grid; larger display sizes reuse the same glyph proportions scaled to 7×9 or 9×13 grids rather than switching typeface. CJK and any glyph outside the curated set fall back to a live-rasterized SDF pass over **Noto Sans SC**, sampled onto the same dot grid so it never visually breaks continuity with the bitmap font.

The bitmap tiers have no italic, no variable weight, and no letter-spacing tuning (the opt-in dot type below has all three) — hierarchy is built entirely from **grid size** (how many dots tall a glyph is) and **color** (`{colors.value}` vs `{colors.label}` vs `{colors.mute}`), never from a second typeface.

### Hierarchy — TILE cards (the reference-fidelity standard)

Cards are `TILE` rasters: **144×144 dots at 2.25px** (`src/widgets/types.ts`), label row included (`chrome: 'dots'`), style `tileStyle`. The references mix dot pitches inside one card — tiny dots for labels and grids, big dots for hero numerals — so every tier above body text sits on its own coarser **lattice** (`Layer.lattice`): a 5×7 pixel is one *bigger* dot, never a cluster of small ones.

| Token | Helper | Lattice | Glyph | Use |
|---|---|---|---|---|
| `{typography.label}` | chrome / `T.text` | 1 | 5×7 (advance 6 cells ≈ 4% of card) | Card label, captions, units, grid ticks |
| `{typography.body}` | `T.big(s, col, row, { lattice: 1.25–1.3 })` | 1.25–1.3 | 5×7 | Sub-lines ("SFO — LHR", "03 AHEAD", "LISTENING") |
| `{typography.value}` | `T.big(..., { lattice: 1.6–2 })` | 1.6–2 | 5×7 | Stat values, units beside heroes ("H", "M", "W") |
| `{typography.hero}` | `T.big(..., { lattice: 2.5–3, smooth: true })` | 2.5–3 | 10×14 Scale2x | Clock/stat heroes ("7H 42M", "247", "A-07") |
| `{typography.display}` | `T.big(..., { lattice: 3.5–4, smooth: true })` | 3.5–4 | 10×14 Scale2x | One-word posters ("14A") |

`smooth` upsamples a glyph 2× with Scale2x: strokes two dots thick, diagonals stepping one dot — the reference numeral weight. Rings, arcs, rays and dot sliders use **dot sites** (`T.dotRing` / `T.dotLine` / `T.dotDisc` / `T.dotBars` / `T.dots`): evenly spaced dots along the curve, never square-grid rasters. A red marker or status dot is a single site dot (`T.dots([[x, y]], 7–9)`).

Legacy `CARD` (80×74 @ 4px) cards still render, with whole-dot `scale` text (`L.text(..., { scale: [2, 3] })`) and the CSS card header; new cards should be TILE.

### Dot type (variable stroke font, C8)
A second, opt-in face for display and kinetic type: `src/engine/type` (`typeField` / `typeLayers` / `typeFrame`). Glyphs (A–Z, 0–9, punctuation) are hand-authored **centrelines** in a 10-unit cap box; the outline is the signed distance to them, so one field gives every size and four axes: `weight` (stroke 0.7–3.1 units), `width` (×0.6–1.4), `roundness` (curves and stroke ends are superellipses, n = 2 + 10(1 − r)²: 1 round, 0 squarish) and `slant` (shear). Upright static text is **hinted**: cap line, baseline, stems and arc boxes snap to the lattice and strokes round to whole dots. Moving or slanted text is unhinted, and its edge dots take part values that the sampler quantizes. Spacing is proportional, with kerning from side profiles (AV, LT, TA tuck in). Big type sits on a coarser `lattice` through `typeFrame`, like `T.big`. Kinetic helpers: `typeMorph` (SDF blend, letter-by-letter `sweep`), `typeMigration` (dot flight word to word), `marqueeField` (offset in 1/`sub` cell steps), `waveGlyphs` / `bounceGlyphs` / `weightWave` / `breathe`. CJK and emoji go through an offscreen-canvas luma raster **in the browser only**. Node and goldens skip them. The 5×7 bitmap font stays the label/body face, and `textAt` output is unchanged. Board: `?board=type`.

### Principles
Every size in the hierarchy is a strict multiple of the base grid unit — there is no arbitrary in-between size. Weight is simulated by dot density, not a bold-font variant: a "heavier" numeral is achieved by widening `{grid.pitch}` or increasing `{dotStyle.sizeMax}` for that glyph's field, never by swapping a font file. This keeps every text role rendering through the exact same `Field → Sampler → Renderer` pipeline as every icon, chart, and photo in the system.

### Chrome type (CSS)
The page chrome around the cards (topbar, pickers, editor, sheets, essay) is real text. Sizes are tokens named by **role and size** (`src/tokens.css`, rem on a 16 px root); the family is set separately (`--mono` for UI, labels, numbers and meta; `--sans` = Oxanium for headings and prose). Weights 400 / 500 / 600. `scripts/site/css-tokens.ts` fails on a raw px or rem in `font-size` or the `font` shorthand.

| Token | Size | Use |
|---|---|---|
| `--fs-tag-8` | 8 px | in-card hints, tiny badges |
| `--fs-tag-9` | 9 px | card labels, keycaps, chips |
| `--fs-label-10` | 10 px | chrome labels, tabs, buttons |
| `--fs-label-11` | 11 px | editor UI, menus |
| `--fs-label-12` | 12 px | meta: 12 px uppercase mono, +.06em (the plan's one label size) |
| `--fs-copy-14` | 14 px | short prose, intro lines |
| `--fs-copy-16` | 16 px | body copy; phone form fields (no iOS focus zoom) |
| `--fs-lead-18` | 18 px | the page's inherited size; essay prose |
| `--fs-title-20` / `-24` / `-28` | 20 / 24 / 28 px | titles (28: the widget page) |
| `--fs-h1-page` | `clamp(30px, 6vw, 44px)` | legal page title |
| `--fs-h1-hero` | `clamp(38px, 5vw, 72px)` | hero heading |
| `--lh-tight` / `--lh-body` | 1.1 / 1.6 | headings / copy (adopted in T6) |

The 8–11 px tokens carry today's chrome; T6 (docs/LAYOUT-THEME-PLAN.md) lifts chrome text to a 12 px minimum and retires them.

### Note on Substitutes
There is no substitute typeface — the bitmap dot-font *is* the typography system and ships as static data (`bitmapFont.ts`, ~2KB). Any environment that cannot run the sampler falls back to rendering plain system-monospace text at equivalent sizes, which is treated as a degraded/non-brand state, not a real substitute.

## Layout

### Spacing System
- **Base unit:** `{grid.pitch}` — the px distance between adjacent dot centers, default 4px (matches the reference sheet's "4PX GRID" label).
- **CSS tokens** live in one block, `src/tokens.css` (loaded by the app and the essay). Chrome spacing uses only these; `scripts/site/css-tokens.ts` fails on a raw px in margin, padding or gap (1 px hairline overlaps excepted). Gaps between blocks use only the three rhythm steps; there are no off-scale `calc(var(--space-1) * n)` values left (T2).

| Token | Value | Use |
|---|---|---|
| `--space-1` … `--space-5` | 4 · 8 · 12 · 16 · 24 px | inside controls and groups |
| `--space-6` … `--space-10` | 32 · 48 · 64 · 96 · 128 px | between blocks and sections |
| `--gap-group` | `--space-3` (12 px) | rhythm: inside a group |
| `--gap-action` | `--space-6` (32 px); `--space-5` (24 px) ≤ 760 px | rhythm: before actions, and between the top bar and a view |
| `--gap-section` | `clamp(--space-8, 8vw, --space-10)` | rhythm: between sections (the last board and the footer band, ABOUT's bands) |
| `--spacing-cardGap` (`{spacing.cardGap}`) | `--space-4` (16 px) | gutter between cards on a board |
| `--spacing-cardPad` (`{spacing.cardPad}`) | `--space-4` (16 px) | `dot-card` padding |

- **Universal grid rhythm:** every board in the reference set composes as a 3-column card grid with equal `{spacing.cardGap}` gutters — this is the default composition, not one option among many.
- **Card internal padding:** `{spacing.cardPad}` on all sides, with the eyebrow label sitting flush to the top-left and any `{component.statusDot}` flush to the top-right.

### Layout tokens

| Token | Value | Use |
|---|---|---|
| `--frame-max` | 90rem (1440 px) | the frame (`.shell`), its side padding included |
| `--frame-pad` | `clamp(16px, 3vw, 40px)` | the frame's side padding |
| `--frame-inset` | `max(0, (100vw − --frame-max) / 2) + --frame-pad` | the frame's content edge from the viewport edge, for fixed or full-bleed things (the editor bar, the widget page's pinned pills) |
| `--card-max` | `min(62svh, 520px)` | the widest (so, for square cards, the tallest) a board column gets |
| `--measure` / `--measure-head` | 68ch / 42rem | longest line of body text / of a heading |
| `--hair-dot` / `--hair-pitch` | 1 px / 4 px | dotted hairline: a 1 px dot every 4 px |

### Frame and rhythm (T2, docs/LAYOUT-THEME-PLAN.md §3)
- **One frame, one left edge.** Every page is one centred column (`.shell`: `--frame-max` wide with `--frame-pad` inside it), with a dotted hairline down each side from 768 px. The top bar, the intro, the board picker, the board title, the grid, ABOUT's bands, the widget page's top row and card, the footer band and the editor's first tool all start on its content edge (`scripts/site/layout.ts` checks ±1 px at six widths).
- **Rhythm.** Each block owns its top margin only, and every vertical gap between blocks is one of the three steps: top bar → view `--gap-action`; intro → picker → board title → grid `--gap-group` each; last block → footer band `--gap-section`. The probe fails on any other gap.
- **Measure.** Prose keeps `--measure` (the intro line, the ABOUT lede, the changelog); the intro's link and close sit beside the measured text, not under it.
- **Cards.** Board columns are `minmax(0, --card-max)`: a card is never taller than 62svh, and on a wide screen a two-column board leaves room at the right rather than leaving the frame's edge (density-driven grids are T3).
- **Home hero.** The touchable card (`src/components/hero/`) floats right of the header from 1280 px (it is no taller than the header, so the grid does not move) and comes after the board below that: on a phone the cards come first.
- **Footer band.** One band a section below the last block: the live number (dots drawn this visit, in dot type) over the site line. No dead strip under it: the tool dock lives in the top bar on desktop and in TOOLS on a phone.
- **Figure legends.** One mono meta line under a figure: `FIG 03 · <subject> · <grid> · <pitch>` (`.fig-cap`, and the essay's `figcaption[data-fig]`).

### Grid & Container
- **Default board size:** 3×3 card grid at 1:1 aspect per card (matches every reference board). A 3×4 variant is supported for taller compositions (DeerFlow Mosaic hero board).
- **Card aspect:** square by default; wide cards (2 columns) permitted for content that needs horizontal room (waveforms, message lists, chat input).
- **Widget internal grid:** each widget declares its own `{grid.cols} × {grid.rows}` independent of card px size — density (`{grid.pitch}`) is what reconciles "how many dots" with "how many pixels," so the same widget config renders correctly at any card size.

### Whitespace Philosophy
Whitespace in Dot/480 is *dot absence*, not empty px. A "quiet" card (e.g. the `home-quiet` occupancy widget) achieves visual calm by having most grid cells return a near-zero field value — sparse dots on black — rather than by adding padding. Card-to-card spacing stays fixed at `{spacing.cardGap}` regardless of a widget's internal density; the grid rhythm never adapts to content.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No border | Base canvas, full-bleed photoreal hero backgrounds (`deerflowMosaic` preset only) |
| 1 — Hairline | 1px `{colors.hairline}` | Every standard card, list-row divider, table rule |
| 2 — Hairline Active | 1px `{colors.hairlineActive}` | Selected/focused card or settings row (e.g. "BRIGHTNESS" highlighted red outline) |
| 3 — Ambient Glow | Soft radial `{colors.dotActive}` blur, 12px, 15% opacity | Reserved for the `deerflowMosaic` hero preset's ambient lighting behind cards — never used in flat `dot480` |

Dot/480 has effectively no drop-shadow elevation. Depth, where it exists at all, comes from the **halftone/photo field** (real depth-of-field photography rasterized into dots) rather than from CSS effects — see `haltoneField.ts`. Cards are flat rectangles with a hairline border; nothing lifts, nothing casts a shadow.

### Decorative Depth
- **Halftone photography:** real photos (thermal mug, portrait, silhouette, album art) run through the halftone generator become the system's only source of "photographic" depth — everything else is flat vector/field.
- **Status dot:** the `{component.statusDot}` (4–6px solid red circle, top-right of a card) is the system's one consistent ornamental/state marker — equivalent role to a corner-square motif in other systems.
- **Radial rings:** concentric polar-field rings (activity rings, breathing circles, gauges) are the closest thing Dot/480 has to a "hero" decorative device — used prominently but always in the same grey/red palette, never a separate accent.

### Light (Raster light stack, P3)
Relief and light are fields too: a signed distance becomes a cached height and normal raster (`heightRaster`, `normalRaster`), and per frame only the light moves (`lambert`, `phong`, `illuminate`). Rules:
- Lit surfaces sit on a coarser lattice (2× on the `light` board) and are split into tone bands (`faint` → `mid` → `idle`), never one grey ramp.
- **Gloss** = the specular highlight drawn two quantize steps (+0.5) above the diffuse dot under it, in `value`.
- **Torch** = the primary pointer as a point light (`torch(x, y)`); without a pointer the light drifts slowly.
- **Emissive** = the accent shape plus a `bloom` halo in `{colors.dotActiveDim}`, with a one-dot moat between the two. The halo is never `dotActive`.

#### Materials
A material is a dot vocabulary, not a shader: given one normal raster and one light it decides which dots exist, how many quantize steps they take and which tone carries them (`src/engine/light/material.ts`, each returns `Layer[]`). No new color tokens; materials only use the existing tones.

| Material | Function | Dot rule |
|---|---|---|
| Matte | `matte` | Lambert split into `faint` → `mid` → `idle` bands |
| Gloss | `gloss` | Body capped at 1 − 2 steps (`faint`/`mid`/`idle`); highlight exactly +1 step on its rim, +2 at its core, in `value` |
| Glass | `glass` | The layer behind, offset toward the centre by the normal in whole cells; a one-band fresnel rim in `mid`; highlight in `value` |
| Emissive | `emissive` | The shape plus its `bloom` halo behind a one-dot moat; `active` + `activeDim` by default, white (`value` + `mid`/`faint`) when the board's red is taken |
| Metal | `metal` | No diffuse: hard studio stripes read off the normal (sky, glow strip, black horizon, ground, lit floor) plus the light's own reflection |
| Fabric | `fabric` | Lambert ordered-dithered between adjacent size steps (Bayer 4×4), capped at 3 steps, one tone per step |

**Board-wide light:** a board shares one light direction, the sun of the wall-clock hour (`sunAt(hourOf(date))`: rises on the left at 6, highest at noon, sets on the right at 18, a lower moon at night). Over a card the pointer replaces it as a torch.

#### Light and tilt input
The phone's orientation reaches cards as plain numbers from the light hub (`src/site/light.ts`, a `Source`); the engine half is `src/engine/light/input.ts`, imported by path (not through `engine/light`). There is no `data.light` object: card data is numbers only.

| Key | Range | Meaning | Read by |
|---|---|---|---|
| `lightSrc` | 0, 1 | 0 = the clock's sun, 1 = tilt (`lightAz` / `lightEl` valid) | lit cards, via `sceneLight()` |
| `lightAz` | 0..63 | azimuth bucket, clockwise from 12 o'clock | `sceneLight()` / `lightOfBucket` |
| `lightEl` | 0..7 | elevation band over 10°..80° | `sceneLight()` / `lightOfBucket` |
| `gx`, `gy` | unit vector, 1/32 steps | gravity direction on the screen; exactly (0, 1) when the phone is held normally (roll < 8°) or lies flat | physics worlds |
| `tx`, `ty` | −1..1, 1/16 steps | tilt from the rest pose: (0, 0) at rest and inside 2°, ±1 at 24°; `tx` > 0 when the right edge tips down | parallax, sloshing, highlights (never derived from `gx`/`gy`) |
| `tilt` | 0..4 | tilt state: unsupported, prompt, granted, denied, insecure | UI hints only |

Fixture (goldens, snapshots, no sensor): `{ lightSrc: 0, lightAz: 0, lightEl: 7, gx: 0, gy: 1, tx: 0, ty: 0, tilt: 0 }`.
- **Precedence** (`sceneLight`): a pointer inside the card (torch) → tilt (`lightSrc` 1) → the sun of the hour.
- **Opt-in:** a card declares every key it reads in `defaults`, with the fixture values (undeclared keys never arrive), and its board lists `sources: [lightSource]` both in the manifest entry's `load()` and in the eager registry (`src/widgets/index.ts`). The physics board is the first consumer.
- **Calm by default:** a still phone emits nothing; at most 15 updates/s (4 under reduced motion); listeners only while a consumer board is mounted and the tab is visible.
- **TILT button:** in the phone TOOLS sheet, shown only where tilt can work (orientation events, a coarse pointer, a secure context); `aria-pressed` while tilt is on. It is the one place that asks iOS for permission (`requestTilt()`, first thing in the tap); cards never ask. Tilt never starts by itself under reduced motion.
- **Not a touch:** tilt never engages a card, sets pointers or blocks scroll (UX-PLAN §10).

## Shapes

### Dot Roundness Scale

`DotStyle.cornerRoundness` (0..1) maps to the superellipse exponent with `n = 2 + 30·r²` (`squircleExponent()` in `shapePath.ts`).

| Token | `cornerRoundness` | Exponent (`n`) | Use |
|---|---|---|---|
| `{rounded.sharp}` | 1 | 32 (visually square) | Dense data grids (sleep-stage blocks) — or `shape: 'square'` |
| `{rounded.default}` | 0.25 | ≈3.9 | Standard dot shape across nearly every widget — `baseStyle` |
| `{rounded.soft}` | 0.12 | 2.4 | Slightly softened dots for photo halftones |
| `{rounded.circle}` | 0 | 2 (true circle) | Status dots, avatar circles, radial-ring markers, PIN dots |

Individual dot shape is controlled by one continuous parameter (the superellipse exponent) rather than a discrete shape enum — sliding from `{rounded.sharp}` to `{rounded.circle}` smoothly passes through every intermediate "squircle" state. Card container corners are the chrome radius `{rounded.cardCorner}` (`--radius-card`, 12 px) so card chrome and dot chrome always read as the same geometric family.

### Chrome radius (CSS)
Dots and in-card shapes use the squircle exponent above. The HTML chrome around them (card containers, controls, menus) uses a short radius scale in `src/tokens.css`; `scripts/site/css-tokens.ts` fails on a raw px radius (percentages, for circles and CRT glass, are fine).

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4 px | small marks: kbd, chips, swatches, inline code |
| `--radius-ctl` | 8 px | controls: fields, buttons, tiles |
| `--radius-panel` | 12 px | raised surfaces: menus, popovers, dialogs |
| `--radius-card` | 12 px | `dot-card`, sheets (`{rounded.cardCorner}`). Cards 12, controls 8, pills full: nothing else |
| `--radius-pill` | 999 px | pills, round buttons |

A surface that wraps a rounded child with padding takes the child's radius plus the padding (`calc(var(--radius-panel) + var(--space-2))`), so the corners stay concentric.

### Photography / Field Geometry
- **Halftone photo grid:** default 48×48 to 96×96 cells depending on card size; below ~32 cells, detail recognizability drops sharply (see Caveats in the engineering plan).
- **Icon SDF canvas:** icons rasterize at 4× target grid resolution before distance-transform, then downsample — keeps edges clean at any density.
- **Status dot:** one site dot about 7 card dots across, top-right of the label row — drawn by `cardChrome()` for `live` TILE cards.

## Components

> **Interactive states.** Hover, press, focus, drag and long-press follow the grammar and tokens in [Interaction](#interaction); the variants below cover Default, Active/Selected and Disabled.

### Buttons & Controls

**`toggle-switch`**
- Off: track `{colors.surfaceRaised}`, thumb `{colors.dotIdle}`, `{rounded.circle}` thumb, pill track `{rounded.default}`.
- On: track `{colors.dotActive}` at 30% fill, thumb `{colors.dotActive}` solid.
- The universal on/off control across every settings-style card (Wi-Fi, Bluetooth, Sound).

**`pill-button`** + **`pill-button-destructive`**
- Default: transparent fill, 1px `{colors.hairline}` border, text `{colors.value}`, `{typography.bodyDot}`, `{rounded.default}` pill radius.
- Destructive: border and text both `{colors.dotActive}` — the only case where the accent color appears as an outline rather than a fill.
- Used for "ACTION" / "DESTRUCTIVE" affordances in the primitives row and for in-widget action buttons (recorder stop, timer stop).

**`icon-button`**
- Circle container (`{rounded.circle}`), 1px `{colors.hairline}` border, centered Font-Awesome-equivalent dot-rasterized icon at `{typography.bodyDot}` scale.
- Used for compact actions (+, heart, more) in list rows and toolbars.

**`slider`**
- Track: horizontal dotted line, `{colors.dotFaint}` for the unfilled segment, `{colors.dotIdle}` or `{colors.dotActive}` for the filled segment depending on context.
- Thumb: solid circle, `{colors.dotIdle}` default / `{colors.dotActive}` when the value represents a "live" quantity (e.g. mic level).

### Status & Indicators

**`statusDot`**
- 4–6px solid `{colors.dotActive}` circle, fixed top-right corner offset of `{spacing.dot}` × 2.
- Present on any card reporting a live state: recording, boarding, listening, alert, unread — Dot/480's single most-repeated component after the dot-font itself.

**`progress-ring`**
- Polar field, `rInner`/`rOuter` sweep from 0 to `progress × 2π`, unfilled arc in `{colors.dotFaint}`, filled arc in `{colors.dotActive}` or `{colors.dotIdle}` depending on whether the metric is "urgent" (timer countdown → red) or "informational" (battery, speed → grey).
- Powers: timer, battery %, gauge speedometer, fitness activity rings, oxygen/moisture rings.

**`waveform`**
- Vertical dot-bars sampled from an amplitude field, scrub-position marked by a single `{colors.dotActive}` dot along a baseline.
- Powers: audio player, voice recorder, "listening" agent state, interpreter dual-waveform, EKG monitor (Gaussian-composite variant).

**Agent presence** (`src/widgets/boards/heartbeat.ts`, board `heartbeat`)
- One organism (a lobed metaball cluster on a 3-cell lattice: mid body, highlight up-left) whose behaviour is a closed token set. Agents write `data.state` and never draw; `heartbeatState(name)` returns the parameters, and `blendStates` mixes two of them while a sprung `data.state` (`springKeys`) moves between stops (~0.4 s).
- Cards carry an eyebrow label naming the state plus a 1× status line (`mid` text, `value` metric); the organism is the hero, so the state is never spelled out twice.

| State | Motion | Accent |
|---|---|---|
| `thinking` | big, lobed, slow breath (0.2 Hz), lobes drift and the body wanders | none |
| `tool-running` | condensed; ring of sites with a comet sweeping (8 s/rev), the highlight turns to face it | none |
| `awaiting-approval` | lub-dub pulse at 0.85 Hz with a neutral ripple ring | the organism in `{colors.dotActive}`; text stays neutral |
| `error` | still body; 0.5 s bursts of whole-lattice-cell row offsets and band dropouts at 12 steps/s | none |
| `done` | condenses into a dot check mark | none |

- Red is spent once per board: a card that can switch into `awaiting-approval` (the `hb-agent` demo) pulses in `value` instead.

### Cards

**`dot-card`** (base container for every widget)
- Container: `{colors.surface}` fill, 1px `{colors.hairline}` border, `{rounded.cardCorner}`, padding `{spacing.cardPad}`.
- Header: `{typography.caption}` eyebrow label top-left, optional `{component.statusDot}` top-right.
- Body: any single generator output (text/ring/waveform/halftone/etc.), vertically centered.
- Footer (optional): `{typography.micro}` secondary metadata.

**`list-card`**
- Container: `{component.dot-card}` base with stacked `{colors.surfaceRaised}` rows inside, 1px `{colors.hairline}` row dividers.
- Row content: avatar-circle (initial letter, dot-rasterized), `{typography.bodyDot}` primary text, `{typography.micro}` timestamp/meta at row end.
- Powers: messages list, settings list, shopping-list checklist, AI-assistant suggestion list.

**`settings-row`** + **`settings-row-selected`**
- Default: icon + label in `{colors.value}`, chevron or toggle at row end.
- Selected: full row outlined in `{colors.hairlineActive}`, label recolored to `{colors.dotActive}` (the "BRIGHTNESS" reference state).

**`chat-bubble`**
- AI/system message: left-aligned, `{colors.surfaceRaised}` fill, `{rounded.cardCorner}` at n=3 (slightly softer than standard cards).
- Suggestion chip row: pill-shaped tappable rows beneath the greeting, same treatment as `{component.pill-button}` but full-width.

### Grids & Charts

**`heatmap-grid`**
- Fixed matrix of square dots (`{rounded.sharp}`), each cell's opacity/color driven directly by a data value — no interpolation between cells.
- Powers: sleep-stage chart, floor-plan occupancy, notification-count grid, CPU/system usage bars.

**`spline-chart`**
- Catmull-Rom curve sampled to dots, `{colors.dotIdle}` line with a single `{colors.dotActive}` marker at the current/peak data point.
- Powers: lap-time delta, retail analytics line, sales sparkline.

**`icon-grid`**
- Uniform NxN grid of icon-SDF glyphs, each cell a `{component.icon-button}`-equivalent without the border — the home-screen "APPS" launcher pattern.

### Photo / Camera

**`halftone-photo`**
- Any uploaded or source image run through `haltoneField.ts`, rendered at card-appropriate density.
- Powers: portrait/silhouette art cards, album art, thermal-style stylized photos.

**`camera-viewfinder`**
- Four corner-bracket glyphs (`⌐ ¬ L J` style, dot-rasterized) framing a live/static photo field, optional bounding-box labels (`{typography.micro}` in a bordered pill) for vision-AI object detection.
- `REC`/status text pairs with `{component.statusDot}` when actively capturing.

**Halftone ladder (live media)**
- Camera and video go through `halftone` / `halftoneStream` (`src/engine/halftone/`), never a raw threshold: step 1 = ordered multi-level threshold, step 2 = structure-aware (edge-preserving, local contrast, crisp edges) for faces.
- Live input uses the stream (STBN slices + hysteresis): a still scene must not shimmer (verify: ≤ 10% of plain thresholding's dot changes per frame).
- 6 levels; level → size (.3–1 of `sizeMax`) and tone (`faint` → `mid` → `idle` → `value`). Photo exemption: `quantizeSteps: 0`.
- Before the user starts the camera (and in snapshots), show a deterministic stand-in (test portrait) and a prompt; the camera is requested only from a control. Red only for `REC` while live.

## Interaction

Interaction is a state the card's *data* is in, not a CSS layer on top. The input layer (pointer, touch, keyboard) edits `data[key]` for each declared `Control` and fills `hover` / `pressed` / `focus` in the frame context; the card redraws through the same `Field → Sampler → Renderer` pipeline. Feedback is therefore always made of dots: a glow is a field, a press is a size step, a focus ring is a row of sites. No state introduces a new colour.

### Interaction tokens

| Token | Value | Applies to |
|---|---|---|
| `{interaction.hoverGlowRadius}` | 6 cells (falloff to 0 at the radius, soft ramp about 1 cell wide per the organic-edge rule) | Soft light pool under the pointer, drawn behind the hovered control |
| `{interaction.hoverGlowTone}` | `value` at the centre, `mid` at the rim. **Never `{colors.dotActive}`** | Hover glow layer tone |
| `{interaction.pressStep}` | 1 `{grid.quantizeSteps}` step down (`1 / quantizeSteps`: 0.2 at the default 5); **0.25** on unquantized styles | Dot size (radius value) of a pressed control, relative to its resting value |
| `{interaction.springHalfLife.data}` | 0.12 s, critically damped | Data keys that glide to a new value (`springKeys`): sliders, knobs, scrub position |
| `{interaction.springHalfLife.release}` | 0.08 s, under-damped (damping ratio 0.5, one visible overshoot) | Press release: the dot size springs back past rest once, then settles |
| `{interaction.focusDash}` | 3 dots lit, 2 dots dark (one 5-site period) along the control's dotted outline | Keyboard focus ring (marching dots) |
| `{interaction.focusSpeed}` | 8 cells per second (at most 1 cell per frame at the card's fps, 12 by default), linear, stepped by time, not by frame | Marching speed of the focus dash; held still under reduced motion |
| `{interaction.hitPad}` | Pad each target by whole cells until it is at least 24 px square (`ceil(24 / pxPerCell)` cells per axis); **44 px** when the pointer is touch | Hit-test rectangle around every control; never changes what is drawn |
| `{interaction.touchSlop}` | 10 px of finger travel | Below it a touch can still be a tap or a hold; past it, a vertical move is the page's scroll and a horizontal one claims a drag control (`TOUCH.slop`, `src/engine/interaction/gesture.ts`) |
| `{interaction.pressDelay}` | 110 ms still | A touched tap control shows its press (a button goes down) only after this, so a swipe that starts on it never flashes it |
| `{interaction.holdEngage}` | 300 ms still | Press-and-hold on a drag control grabs it in any direction and engages the card (hairline-active border, DONE in the bar) until a touch elsewhere, Escape, DONE or 8 s idle |

### Chrome motion tokens (CSS)
The HTML chrome (sheets, menus, pills, tabs) animates with these durations only (`src/tokens.css`); `scripts/site/css-tokens.ts` fails on a raw duration. Card motion stays the engine's own (masks, dissolves, springs above).

| Token | Value | Use |
|---|---|---|
| `--dur-in` | 0 ms | hover and press in: instant (the resting state carries the transition) |
| `--dur-out` | 150 ms | hover out, press, small fades |
| `--dur-move` | 220 ms | a sheet or panel following a drag or snapping to a stop |
| `--dur-enter` | 280 ms | a sheet arriving; a display powering off |
| `--ease` | `cubic-bezier(.2, .8, .2, 1)` | chrome easing |
| `--dur-tip` | 400 ms | the first tooltip in a group waits this long; the next ones show at once |

Allowlisted exceptions (effects, not chrome): the X-RAY flash (1.2 s), the nixie flicker loop (5.3 s), and the 1 ms reduced-motion end-state trick.

### Chrome states (CSS)
Every HTML control in the chrome has the same four states plus disabled, from the same tokens (`src/App.css` › chrome states). `scripts/site/css-tokens.ts` checks that every `:hover` selector has its `:active` and `:focus-visible` twin, that `--glow*` appears only on active / focus / live selectors, that no `outline: none` lacks a replacement, and that nothing uses `transition: all`.

| State | Look | Motion |
|---|---|---|
| rest | neutral text (`--mute` / `--label`) on its surface | carries the transition: `color, background-color, border-color, box-shadow, opacity, transform` over `--dur-out` |
| hover | `--wash-hover` or `--line-hover`, text one step up | in at once (`--dur-in`), out over `--dur-out` |
| press (`:active`) | `--wash-press` | in at once; on touch, chrome also sinks to `scale(.96)` |
| focus (`:focus-visible`) | the accent ring: `outline: 1px solid --red`, offset 2 px (inside, -2 px, for rows that fill their container), plus `--glow-halo` | none |
| active / selected / on / live | the accent at full strength with `--glow-wash` or `--glow-halo` | none |
| disabled | 40% opacity, no pointer | — |

No state changes a size, so nothing shifts. On coarse pointers every chrome target is at least 40 px (44 px on phones). Menus, popovers and ⌘K open with no animation; only sheets slide in (`--dur-enter`). `prefers-reduced-motion` removes all of it. In-card controls are different: they draw hover, press and focus in dots (below).

### Grammar rules

- **Hover glow** is `value`/`mid`, never the accent. Red keeps its meaning (live, hot, primary); hover and focus inside a card never use it. (The HTML chrome's keyboard focus ring is the accent, per Chrome states above: it marks "here", outside the card's dots.)
- **Press** is one quantize step *down* in dot size, so the control visibly sinks. On release it springs back with `{interaction.springHalfLife.release}`. It is never a colour change.
- **Data motion** uses `{interaction.springHalfLife.data}`: the value glides on a critically damped spring and snaps to the next integer cell or lattice step each frame.
- **Focus** is marching dots: the control's own outline sites light in the `{interaction.focusDash}` pattern and travel at `{interaction.focusSpeed}`. It replaces the `{colors.hairlineActive}` card border for in-card controls; the hairline treatment stays for whole-card selection.
- **Drag scrubs whole dot columns.** A horizontal drag moves a value one whole column (or lattice step) at a time, never a fractional position. Bars, sliders and playheads quantize to site columns, so the control always sits exactly on dots.
- **Long-press is a radial-reveal progress.** Holding a control reveals a ring of sites clockwise from 12 o'clock around the press point; the action fires when the ring closes. Releasing early un-reveals it on the release spring.
- **Hit pad** is invisible. Targets below 24 px (44 px on touch) grow their hit rectangle, not their dots.
- **Touch is scroll-first.** A vertical swipe over any card scrolls the page and leaves the card untouched. Taps act on lift. A drag control is taken by a horizontal drag or by `{interaction.holdEngage}`; a card you push around in every direction marks its control `gesture: 'surface'`. Details: docs/UX-PLAN.md › Touch policy.

## Do's and Don'ts

### Do
- Reserve `{colors.dotActive}` for genuinely live/active/urgent states — recording, live progress, alerts, destructive actions. Treat it as a scarce resource, exactly one accent per card.
- Route every visual (text, icon, chart, photo) through the `Field → Sampler → Renderer` pipeline. If a new widget can't be expressed as a field, reconsider the widget before adding a one-off rendering path.
- Default to `{grid.quantizeSteps} = 5` for UI widgets to preserve the chunky LED look; only disable quantization for photo halftones where smooth gradation reads better.
- Anchor a `{component.statusDot}` to any card reporting a live state. It is the system's identity tag, equivalent in role to a signature ornamental motif in any other design system.
- Keep card composition to a 3-column grid with equal `{spacing.cardGap}` gutters as the default — deviate only for genuinely wide content (waveforms, chat).
- Build all hierarchy from **grid size** and **color role**, never from a second typeface or italic/bold variant — there isn't one.
- Auto-select Canvas rendering for any widget exceeding ~2,000 dots or requiring animation; keep SVG for static, sparse, copy-paste-friendly widgets.
- Animate on the shared clock at 12 fps by default (30 while a card is engaged or under reduced motion). A card that needs more declares `fps` on its preset; on a phone (coarse pointer, save-data, or ≤ 4 cores) it runs at max(12, round(fps / 2)) and never above its own rate (`cardFps`, `src/widgets/fps.ts`). Step motion by time, not by frame, so it reads the same at any rate; goldens sample fixed t and never see `fps`.
- Choose WebGL2 only by content, never by convenience: a card gets it when a layer is tagged for the GPU (`gpuIR` for a Field IR program evaluated per dot on the GPU, `gpuValues` for a CPU field sampled straight into a value texture) and WebGL2 works; `renderer: 'webgl'` forces it. Tag a layer only when its fine dot count is out of Canvas reach (≳ 100k dots, or a pitch below ~1 card px). The tagged field is still an ordinary `Field` at the card's lattice, which is what goldens, SVG export, `describe()` and the Canvas fallback (no WebGL2, context lost, shader failure) draw. One WebGL2 context per page, which is shared by every card and copied into each card's own canvas. Squircles are exact superellipses (n = 2 + 30r²) with analytic AA, so WebGL ink matches the true dot area. Canvas (Skia) under-covers sub-pixel dots: it draws 79% of a 0.6 px dot. A card of sub-2px dots therefore reads up to ~7% heavier on WebGL (parity gate: mean Δ ≤ 2/255, ≤ 2.5% of pixels off by > 16, PSNR ≥ 32 dB; `scripts/webgl.ts`). The GPU path does not do `sizeCurve`, `jitter` or `sites`; such layers stay on the CPU. A GPU layer does not suppress CPU card cells under its dots, so keep chrome outside its window.

### Don't
- Don't introduce a second accent hue. `{colors.accentAmber}` exists only inside the `deerflowMosaic` hero preset's ambient lighting — never on flat `dot480` chrome, never on a CTA.
- Don't add drop shadows to cards. The only allowed depth effect is the ambient glow reserved for hero presets, and even that is a soft blur, not a directional shadow.
- Don't render text with a rasterized TTF when the bitmap dot-font covers the glyph — the CJK/SDF fallback exists only for characters outside the curated set.
- Don't skip quantization on UI widgets "for smoothness." Smooth gradients read as a bug in this system, not a feature — the chunkiness is the brand.
- Don't force SVG rendering on a widget with thousands of animated dots (waveforms, games, dense photos) — this is the single most likely performance foot-gun in the system.
- Don't use a fixed border-radius token where the squircle exponent can be used instead — the continuous roundness slider is a deliberate replacement for a discrete radius scale.
- Don't let card-to-card spacing shrink to fit denser widget content — `{spacing.cardGap}` stays constant; density is absorbed inside the card via `{grid.pitch}`, never at the layout level.

### Chrome components (one per job)
The HTML chrome has one component per job; a new control reuses one of these instead of adding a look.

| Component | Class(es) | Used by |
|---|---|---|
| **pill** | outlined pill: `.board-tabs button`, `.skin-menu-btn`, `.intro-line button`, `.ed-textbtn`, `.ed-row-btns button`; capsule pill: `.pill` + `.pill-btn` (`PillBar`) | board picker, DISPLAY ▾, the widget page bars, editor actions |
| **segmented** | `.ed-seg` (`role=radio` items); text tabs `.view-tabs`, `.board-groups`, `.ed-tabs` | editor options; views, groups and panels |
| **sheet** | `Sheet` (`.sheet` › `.sheet-rest` + `.sheet-panel` › `.sheet-grab`, `.sheet-head`, `.sheet-body`): a scroll-snap sheet; the five-dot grab handle is shared with `.pal-grab`, `.ed-sheet-grab`, `.xr-grip` | BOARDS, TOOLS; the phone ⌘K, the editor and X-ray sheets reuse its handle and surface |
| **menu** | the raised layer (`.skin-menu`, `.ed-menu`, `.wp-more`, `.pal`, `.sheet-panel`) with rows (`.skin-menu button`, `.ed-menu button`, `.wp-more button`, `.pal-item`, sheet rows): `--radius-panel` outside, `--radius-ctl` rows, `--wash-hover` / `--wash-press` | DISPLAY ▾, editor menus, widget MORE, ⌘K, sheets |
| **tooltip** | `[data-tip]` (+ `[data-kbd]` for the keycap) inside a group (`.pal-dock`, `.pill-bar`) | the dock; the widget page pill bars |
| **keycap** | `kbd` in `.pal`, `.pal-shell`, `.pal-boss`, `.xr-time`, and the tooltip keycap: a dotted edge on a dot-matrix fill | ⌘K footer and hints, the shell, the time machine |

**Tooltip rules.** One at a time (the hovered control). The first in a group waits `--dur-tip`; moving to a neighbour shows its tooltip at once, until the pointer leaves the group (a registered `--tip-on` custom property that switches on after the delay and off at once, no JS). Keyboard focus shows it without the wait; a press hides it. No motion.

**Hover intent.** DISPLAY ▾ opens after the mouse rests on it for 100 ms (without taking focus) and closes 150 ms after the mouse leaves it; a click or the keyboard opens it as before.

## Responsive Behavior

### Breakpoints

| Name | Grid Behavior | Key Changes |
|---|---|---|
| desktop-wide | 3-column board, `{grid.pitch}` = 4px | Default reference-board rendering, full dot density |
| desktop | 3-column board, `{grid.pitch}` = 4px | Same composition, card px shrinks slightly, dot count per widget auto-reduces to hold visual density constant |
| tablet | 2-column board | Cards reflow 3-up → 2-up; wide widgets (waveform, chat) span both columns |
| mobile | 1-column board | Full stack; `{typography.displayDot}` steps down one tier to `{typography.headingDot}` to preserve legibility at narrow width |
| led-panel (physical) | Fixed native resolution | `{grid.pitch}` locked to the panel's real dot pitch; `{grid.quantizeSteps}` reduced to match the panel's actual bit-depth per LED |

### Density Scaling
Unlike a typical responsive system that reflows layout, Dot/480's primary responsive lever is **`{grid.pitch}`** — the same widget config renders at native fidelity on a physical LED panel and at high dot-density on a retina display simply by changing one number. Card *composition* (3-column, 2-column, 1-column) follows standard breakpoints; dot *density within* a card is decoupled from viewport size entirely.

### Collapsing Strategy
- **Board grid:** 3-up → 2-up → 1-up at standard tablet/mobile breakpoints; gutters (`{spacing.cardGap}`) hold constant, cards simply get taller in the single-column stack.
- **Wide widgets:** waveform, chat, and message-list cards span 2 columns at desktop/tablet, collapse to full-width single-column at mobile without changing internal dot density.
- **Phone shell (≤ 760 px, `src/site/mobile.css`):** the site chrome becomes an app shell. A compact sticky top bar names the place (on EXPLORE it opens the board sheet) and holds search; a bottom tab bar (EXPLORE / MAKE / ABOUT / TOOLS) sits over the home indicator; the board groups and boards are sideways thumb strips; the dock, the DISPLAY ▾ menu and the ⌘K palette become bottom sheets (grab handle, swipe down, backdrop, Escape). Every chrome target is ≥ 44 px; the accent marks only the active tab, board and live state. Layout vars `--app-top` and `--tabbar-h` (both include the safe-area insets) let fixed or pinned UI sit clear of the bars.
- **Renderer fallback:** below a device-performance threshold (detected via a quick canvas-fill-rate probe), all widgets fall back to Canvas rendering regardless of dot count, trading copy-paste-ability for guaranteed frame rate.

### Image Behavior
- Halftone photo cards resample at the target grid resolution on load — there is no "responsive crop," since the dot grid itself is the resolution; a smaller card simply requests fewer grid cells from the same source image.
- Camera-viewfinder and vision-AI cards keep a fixed aspect ratio (4:3) and letterbox rather than crop, so corner-bracket and bounding-box overlays stay geometrically correct at any card size.

## Iteration Guide

1. Focus on ONE generator or widget preset at a time. Pull its config object from `widgets/index.ts` and verify every field/style/theme reference resolves against the token tables above.
2. Reference tokens directly (`{colors.dotActive}`, `{component.progress-ring}`, `{rounded.default}`) — do not paraphrase or invent parallel names.
3. Run `pnpm verify` after edits — it checks sampler/squircle/text geometry and smoke-renders every preset (dot count, finite radii, unique ids).
4. Add new interactive states as separate component entries (`-selected`, `-disabled`, `-active`) — do not bury them inside a single widget's prose description.
5. Default text to `{typography.bodyDot}`; reach for `{typography.displayDot}` only for a card's single primary value; reserve `{typography.heroDot}` strictly for splash/marketing boards.
6. Keep `{colors.dotActive}` scarce per board — if more than one card shows a solid red fill/ring in the same 3×3 grid, ask whether one of them is actually "informational" rather than "live," and recolor it to `{colors.dotIdle}`.
7. Before adding a new generator type, check whether the need can be expressed as a new `Field` function feeding the existing sampler/renderer/theme pipeline — new generators should be rare; new widget *presets* (a new config on top of existing generators) should be common.

## Devices

One card, many physical surfaces (P5, `src/engine/device/`). `toDevice(spec, profile, { ctx })` samples the card (or its curated `variants['CxR']` when the device grid has one), splats each dot's light (area × opacity × colour luminance; `{colors.dotActive}` = full light, monochrome panels have no red) onto the device grid area-weighted, then applies the profile's tone map. Simulators are pure in t: `createEinkSim`, `createFlipSim`, `ledGlow`, `plotPaths` / `plotAt` / `penPlanSVG`. Board `surfaces` shows the same timer on all five.

| Profile | Grid | Mask | Bits / tone map | Pitch | Dot | Refresh (demo) | Physics |
|---|---|---|---|---|---|---|---|
| `browser` | 144×144 | — | 8 / linear | .6 mm | circle | 60 Hz | — (the card itself) |
| `glyph-matrix-25` | 25×25 | round, 489 LEDs | 8 / linear (PWM), γ 2.2 | 1.5 mm | circle | 60 Hz | LED bloom .14 to 8 neighbours, off-lens glow .05 |
| `trmnl-800x480` | 800×480 | — | 1 / blue-noise dither (STBN slice 0, static) | .2 mm | square | 1 Hz | e-ink: full refresh every 10 (.9 s flash), partial .32 s, ghost .3 × .8 per partial |
| `flipdisc-28x14` | 28×14 | — | 1 / threshold .5 | 10 mm | disc | 1 Hz | column scan 20 ms, rotation ω 60 rad/s, ζ .32 (overshoot 1.35, settle .24 s) |
| `plotter` | 48×48 | — | 2 / blue-noise | 2 mm | pen | — | level k = k loops (r .42 cells), draw 90 / travel 260 cells/s, NN travel order |

- **Variants vs resampling:** grids under ~32 cells (`25x25`, `28x14`) get a curated layout (MASTER-PLAN §3.9); bigger ones resample the authored TILE card. Previews of big panels use `previewProfile(p, k)` (the TRMNL card shows 1/6: 133×80, one pixel per card cell).
- **Card look:** e-ink paper = `{colors.dotIdle}` dots, ink = no dot, ghost = one tone step down; LEDs and discs are dot sites in size/tone bands; flip-disc black faces stay visible in `faint`.
- **Time:** device cards read board time `t + data.clockOffset`; `createClockSync` (`src/engine/clockSync.ts`) keeps tabs on one epoch over BroadcastChannel. Flip-disc clack is app-side (`src/media/clack.ts`), off unless `?clack=1`.

## Display skins

One global switch (header control, `?skin=`, localStorage `dot480:skin`, `setSkin(name)`) shows every board on a different physical display (C7, `src/engine/display/`, `src/components/skins/`). A skin is a **post-raster stage**: the card is sampled and rasterized exactly as on OLED, then an overlay canvas redraws that raster with the display's physics. Skins change physics, never palette roles: neutrals may take a phosphor's colour, the board's one `{colors.dotActive}` stays the only hue. **VFD and LED take the theme accent** (owner decision 4): the app passes the card theme's `dotActive` into the stage (`StageOptions.accent`), neutrals glow in the accent's hue at full drive lifted towards white (`white` .3 VFD, .12 LED), and the colour matrix `[accent phosphor]·pinv([accent 1])` passes the accent itself unchanged; a theme switch rebuilds the VFD / LED stages live. The CRT's phosphor stays white (every colour passes) and Nixie's neon stays orange (its matrix passes only the red column, so under a non-red accent the tube is all neon); reflective skins keep the cell's own hue as pigment. Every dark accent × VFD / LED stays inside sRGB with lit dots ≥ 3:1 on the stage (`scripts/display.ts`). Goldens are untouched (browser only).

| Skin | Physics | Refresh drawn on switch |
|---|---|---|
| `oled` | none: the card as sampled (default, no overlay, `display: contents` wrapper) | overlay wipes off top → bottom |
| `crt` | afterglow v′ = max(v, old·e^(−Δt/τ)), τ .085 s; 2-level mip bloom; scanlines; barrel glass k .05; rounded vignette | beam line, then the raster opens vertically |
| `vfd` | neutrals → the accent's phosphor (accent kept), glow, diamond wire mesh + filament wires | filament warm-up stutter |
| `led` | cell light (area × opacity) in the accent's die colour (accent kept) → round lens per cell; unlit lenses visible, accent-tinted; ~1-cell diffuser bleed (Glyph Matrix physics) | rows scan in top → bottom |
| `eink` | 1-bit blue-noise ink on paper; partial refresh .32 s with ghosts (.3 × .8); every 10th refresh full (TRMNL physics) | full-refresh flash (also on board change) |
| `flipdisc` | 2-tone discs (`value` face, `dotFaint` back, accent pigment), column sweep .34 s, underdamped flips (ω 60, ζ .32); clack muted by default | discs sweep from black |
| `nixie` | neutrals → warm neon, 3-level glow, hex anode mesh, slow flicker | ignition stutter |

- **Cost:** emissive skins are GPU-side 2D ops (drawImage, composites, mips, one SVG colour-matrix filter). E-ink and flip-disc read back one `cols × rows` image a few times a second at most. A static card is re-skinned from its existing frame (no re-sample); a running card's canvas is copied once per its own tick.
- **Reduced motion:** no power-on animation, no e-ink flash (partials only), no nixie flicker.
- Not yet: split-flap skin (the split-flap text motion already exists per card), real-hardware calibration.

## Theme

A theme is **scheme × accent** (docs/LAYOUT-THEME-PLAN.md §4), named `${scheme}_${accent}` (`dark_signal`, `light_cobalt`). `dark_signal` is the canonical theme: goldens, OG images and the no-JS fallback use it, and it equals the colours above exactly. A visitor picks *which* hue is the accent; a board still shows only one (`{colors.dotActive}` = the theme's `--red`).

- **Schemes:** `dark` (today's neutrals, `dot480`) and `light` (the warm `paper` preset: room `#F1F0EC`, card `#F8F8F5`, ink dots). `system` resolves to one of them from `prefers-color-scheme`. Default: `system` + `signal`, so a visitor whose OS is light gets `light_signal`.
- **Accents (7):** `signal` (h 29, today's red), `amber` (75), `phosphor` (145), `cyan` (210), `cobalt` (260), `vite` (vite.dev's purple, hand-pinned), `magenta` (350). Hues ≥ 25° apart. Custom hue: T6.
- **Source:** `src/site/theme/accents.ts` (generator, pure) → `npx tsx scripts/site/theme.ts --write` → `table.ts` (all roles), `dots.ts` (engine tokens), `themes.css` (CSS variables). The site runs no colour math. `scripts/site/theme.ts` checks the table (also in `pnpm verify`).

### Roles
Components and cards read roles, never hues. Same keys in every theme. **One set of names:** the roles are the CSS custom properties of `src/tokens.css` (the table under "CSS colour roles" above); `src/tokens.css` keeps their `dark_signal` values (also the essay and legal pages, which have no theme) and `themes.css` sets them per theme. `--red` is `{colors.dotActive}` whatever hue the theme gives it: the name is kept, never aliased (`--accent`, `--primary` do not exist).

| Group | Roles (CSS `--name`) |
|---|---|
| Neutral | `bg`, `panel`, `surface`, `raised`, `line`, `line-strong`, `tint`, `shade`, `well`, `scrim`, `value`, `label`, `mute`, `dim` |
| Dot tones | `dot-faint`, `dot-mid`, `dot-idle`, plus `value` (the brightest tone) |
| Accent | `red` ({colors.dotActive}), `red-dim` ({colors.dotActiveDim}), `red-hover`, `red-press`, `red-text` (the accent as text, ≥ 4.5:1), `red-line` (active border, focus ring, ≥ 3:1), `on-red` ({colors.onActive}, text on a solid fill), `red-surface` + `red-surface-text` (hero insets only), `red-halo` (chrome halos only), `selection` (`::selection`, the accent at 30%) |

The 12% wash and the glow are built from `--red` in `src/tokens.css` (`--glow-wash`, `--glow-halo`, `--glow`); they and the other chrome materials (`--line-dot`, `--hair-x`/`-y`, `--wash-*`, `--glass`, `--shadow-raised`) are declared on `:root, [data-scheme]`, so a pinned subtree draws its own lines and glow.

In `light`, `--tint` is the ink (washes and dotted lines darken the paper) and `--shade` a deep ink (shadows, scrims). Text roles in light: `value` ≈ L .22, `label` .38, `mute` .50, `dim` .62.

| Theme | `--red` | `--red-text` | `--on-red` | `--red-dim` |
|---|---|---|---|---|
| `dark_signal` | `#FF3B30` | `#FFA193` | `#FFFFFF` | `#B8241A` |
| `light_signal` | `#E43226` | `#B42219` | `#190403` | `#FF9687` |
| `dark_vite` | `#B39AFF` | `#C2AEFF` | `#16171D` | `#6C3BFF` |
| `light_cobalt` | `#105FD9` | `#0145A7` | `#FFFFFF` | `#8DB8FF` |

The other ten are in `src/site/theme/table.ts` (`npx tsx scripts/site/theme.ts` prints them all).

Engine side: `themeTokens(scheme, accent)` (`src/site/theme/theme.ts`) returns a `ThemeTokens`: `dot480` (dark) or `PAPER` (light) with the theme's accent, dim, value and surfaces. On the site it reads them from the theme CSS (so the first load carries no colour table); `tokensOf()` (`src/site/theme/tokens.ts`) gives the same from the generated table for scripts. Both return `dot480` itself for `dark_signal`, and memoise per name. The browser probe checks they agree in all 14 themes.

### Generator rules
Each accent is one OKLCH hue with a 12-step ramp per scheme (1–2 washes, 3–5 fills, 6–8 lines, 9–10 solid, 11–12 text). The generator clamps or nudges until every rule passes, and hand-pinned values must pass them too.
- **Gamut:** every colour is inside sRGB. Chroma is binary-searched at fixed L and h. Cut today: dark cobalt −11%, dark magenta −34% (its L rose to stay clear of the idle grey for protans), light amber −16%, light cyan −14%.
- **Dots:** `red` and `red-line` are ≥ 3:1 on `surface` and `bg`.
- **Text:** `value`, `label`, `mute` and `red-text` are ≥ 4.5:1 on all four surfaces. `red-text` is also ≥ APCA Lc 60 on `surface`. `dim` is not held to it (units and sub-labels; T6).
- **`on-red`:** white if it reaches APCA 60 and 4.5:1 on the solid. Otherwise a dark tint of the hue (`oklch(.25 max(.08·C, .04) h)`), darkened until it reaches 4.5:1.
- **Colour-blind safety:** in normal vision and under simulated protanopia, deuteranopia and tritanopia (Machado 2009), `red` differs from `value`, `dot-idle` and `dot-mid` by ΔL ≥ .08 or ΔE_OK ≥ .10. If needed, the solid's L is searched ±.15 to get there.
- **Tone order:** APCA on `surface` gives faint < mid < idle < value, and `red-dim` < `red`.
- **`red-dim`:** dark uses step 7 (a dimmer accent). Light uses step 7 too, a lighter tint (less ink), which matches vite's pinned `#B39AFF`.
- **Tinted neutrals:** surfaces lean toward the hue by C .005 (vite .014), `line`, `line-strong`, `mute` and `dim` by .010, `label` by .006, and `value` by .003. Light gets 70% of these. L is kept. Neutral dot tones stay untinted, and `dark_signal` is not tinted at all.
- **Pins:** `dark_signal` keeps `#FF3B30` / `#B8241A` / `#FFFFFF`. `vite` dark is `#B39AFF` (line and dim `#6C3BFF`, on-red `#16171D`, surface `#370A7F`). `vite` light is `#6C3BFF` (text `#6B1EB9`, line `#8A63FE`, dim `#B39AFF`, surface `#F0EBFF` / `#140033`). Dark vite's `red-text` is `#C2AEFF`, because `#B39AFF` reaches only Lc 55.
- **Waivers:** two of today's values fail a rule and are kept on `dark_signal` only, until T6: `mute` `#6E7278` (3.85:1 on the surface) and `on-red` white on `#FF3B30` (3.55:1). The check lists them.
- **Gradient rule:** `red-halo` (vite: electric `#6C3BFF` → vite `#B39AFF`) is for chrome halos only: glow, focus and live ring, swatch ring. Never use it on dots, text or lines.

### Runtime
- `<html data-scheme data-accent>` is set before first paint by the inline boot script in `index.html` (`src/site/theme/boot.ts`, sha256 in the CSP in `vercel.json`). It also rewrites the `color-scheme` meta and the `theme-color` meta (the scheme's `bg`), which sit above it.
- After that, `theme.ts` maintains the attributes and the metas (`theme-color` = the theme's exact `--bg`). Resolution, per field: `?scheme=` / `?accent=`, then `?theme=<scheme>_<accent>`, then localStorage `dot480:theme`, then the defaults. URL params are never persisted; `setTheme()` persists.
- `src/index.css` imports `themes.css` right after `tokens.css`: `[data-scheme]` has the same specificity as `:root`, so the later file wins. `color-scheme` comes from `themes.css` (dark when there is no attribute).
- `.no-transition` is on `<html>` for the frame of a switch. Cards re-sample once per switch (their tokens object changes); switching back is a cache hit.
- **Scoping:** a subtree pins a theme by carrying **both** attributes (`data-scheme` and `data-accent`); its descendants inherit. (A subtree with only one attribute is not supported: the CSS has one compound selector per theme, which keeps nested scopes unambiguous.)
- **Switching, for now:** ⌘K "Theme: `<scheme>_<accent>`" (14 commands) and "Theme: system"; TOOLS (phones) has a LIGHT / DARK row; `?theme=light_cobalt` in the URL; `dot480.setTheme({ scheme, accent })` in the console. The THEME popover is T5.

### Theme readers and the display skin
- **Cards** (`DotWidget`): without a `theme` prop they take the site theme (`useTheme()` + `themeTokens()`), so the boards, the widget page and the ⌘K preview follow it. Exports (PNG, SVG, the card's actions) use the card's tokens at that moment: what the visitor sees. OG images (`scripts/site/postbuild.ts`) and goldens stay on `dark_signal`.
- **Polarity insets** (`src/site/theme/polarity.ts`): on a light page a card renders as a dark inset (`data-scheme="dark"` + the page's accent on `.dot-card`, dark tokens) when it is a photo or halftone (`group: 'photo'`), the live camera (`media: 'camera'`), or when the display skin is emissive (CRT, VFD, LED, Nixie: dark glass). Reflective skins (e-ink, flip-disc) and every other card follow the page. On that dark glass VFD and LED glow in the accent (`DotCanvas` passes `theme.dotActive` to the stage); Nixie's neon stays orange (skin physics).
- **Editor:** the asset thumbnails and dot icons are chrome and follow the site theme; the frames on the canvas keep their own theme (`dot480` / `deerflowMosaic`), which belongs to the artwork.
- **Theme parity:** `pnpm golden --theme-parity` samples all 177 presets in all 14 themes and maps every dot's colour back to its tone role through `paletteOf`: the `(x, y, r, opacity, role)` hashes must equal `dark_signal`'s, so a theme only recolours. It reads and writes nothing (`goldens/hashes.json` stays `dark_signal`).
- **Not themed yet:** the essay and legal pages (static, `dark_signal`), the X-ray overlay's guide lines (white), the reflective skins' physics colours (`STAGE_COLORS` in `src/engine/display/stage.ts`: flip-disc faces and panel, e-ink paper and ink stay `dot480`).

## Known Gaps

- **Physical LED-panel calibration not yet measured** — the `led-panel` breakpoint's pitch-locking behavior is specified but not validated against real hardware bit-depth/gamma response.
- **Interaction tokens are specified, not yet measured** — `{interaction.*}` values (glow radius, spring half-lives, focus dash, hit pad) are design targets until tuned against real pointer/touch latency.
- **Superformula (N-fold decorative dot shapes)** deferred per the engineering plan — only the squircle exponent range is currently implemented.
- **Low-density halftone legibility** below ~32×32 grid cells is a known hard limit, not yet mitigated beyond the gamma-boost + pre-blur tweaks documented in the engineering plan.
- **Modal / dialog styling** not present in any captured reference board — no `dot-modal` component exists yet.
- **Full multi-language dot-font coverage** beyond the curated Latin set + system CJK font fallback (`cjkFallback.ts`, no web font is fetched) is unverified for right-to-left scripts.
