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

> **Source tokens:** derived from the `dot480` and `deerflowMosaic` theme presets defined in `theme/presets.ts`. Both presets share the same role structure; only the surface warmth and accent hue shift between them.

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

## Typography

### Font System
Dot/480 has **no conventional font family** — every text role is a precomputed bitmap dot-grid glyph set (see `bitmapFont.ts`), not a rasterized TTF. Latin letters, digits, and punctuation use a hand-authored 5×7 base grid; larger display sizes reuse the same glyph proportions scaled to 7×9 or 9×13 grids rather than switching typeface. CJK and any glyph outside the curated set fall back to a live-rasterized SDF pass over **Noto Sans SC**, sampled onto the same dot grid so it never visually breaks continuity with the bitmap font.

There is no italic, no variable weight, and no letter-spacing tuning — hierarchy is built entirely from **grid size** (how many dots tall a glyph is) and **color** (`{colors.value}` vs `{colors.label}` vs `{colors.mute}`), never from a second typeface.

### Hierarchy

| Token | Glyph Grid | Approx. px (density 4) | Use |
|---|---|---|---|
| `{typography.heroDot}` | 13×17 | 96px | Full-bleed hero numerals (rare — used only on splash/marketing boards) |
| `{typography.displayDot}` | 9×13 | 64px | Primary card value: clock time, "14A", "247W", timer countdown |
| `{typography.headingDot}` | 7×9 | 40px | Section headline blocks ("THE MOON BLINKED", "SHIP THE IDEA") |
| `{typography.valueDot}` | 5×7 | 28px | Standard in-card numeral/short-string ("A-07", "P2", "98%") |
| `{typography.bodyDot}` | 5×7 | 16px | Sub-labels, list item copy, chat bubble text |
| `{typography.caption}` | 4×6 (condensed) | 11px | Card eyebrow label, uppercase, always `{colors.label}` |
| `{typography.micro}` | 3×5 | 9px | Units suffix ("W", "%", "km/h"), fine-print, timestamp |

### Principles
Every size in the hierarchy is a strict multiple of the base grid unit — there is no arbitrary in-between size. Weight is simulated by dot density, not a bold-font variant: a "heavier" numeral is achieved by widening `{grid.pitch}` or increasing `{dotStyle.sizeMax}` for that glyph's field, never by swapping a font file. This keeps every text role rendering through the exact same `Field → Sampler → Renderer` pipeline as every icon, chart, and photo in the system.

### Note on Substitutes
There is no substitute typeface — the bitmap dot-font *is* the typography system and ships as static data (`bitmapFont.ts`, ~2KB). Any environment that cannot run the sampler falls back to rendering plain system-monospace text at equivalent sizes, which is treated as a degraded/non-brand state, not a real substitute.

## Layout

### Spacing System
- **Base unit:** `{grid.pitch}` — the px distance between adjacent dot centers, default 4px (matches the reference sheet's "4PX GRID" label).
- **Tokens (derived from grid units, not raw px):** `{spacing.dot}` (1 grid pitch) · `{spacing.cell}` (4 pitches, ~16px) · `{spacing.cardPad}` (8 pitches, ~32px) · `{spacing.cardGap}` (6 pitches, ~24px) · `{spacing.section}` (16 pitches, ~64px).
- **Universal grid rhythm:** every board in the reference set composes as a 3-column card grid with equal `{spacing.cardGap}` gutters — this is the default composition, not one option among many.
- **Card internal padding:** `{spacing.cardPad}` on all sides, with the eyebrow label sitting flush to the top-left and any `{component.statusDot}` flush to the top-right.

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

## Shapes

### Dot Roundness Scale

| Token | Squircle Exponent (`n`) | Use |
|---|---|---|
| `{rounded.sharp}` | n → ∞ (square) | Dense data grids (heatmap/sleep-stage blocks, notification-dot grid) where alignment matters more than softness |
| `{rounded.default}` | n = 4 | Standard dot shape across nearly every widget — the system default |
| `{rounded.soft}` | n = 2.4 | Slightly softened dots for photo halftones, giving a gentler photographic feel |
| `{rounded.circle}` | n = 2 (true circle) | Status dots, avatar circles, radial-ring markers, password/PIN dots |

Individual dot shape is controlled by one continuous parameter (the superellipse exponent) rather than a discrete shape enum — sliding from `{rounded.sharp}` to `{rounded.circle}` smoothly passes through every intermediate "squircle" state. Card container corners use the same exponent at a larger scale (`{rounded.cardCorner}`, default n=4, ≈16px effective radius) so card chrome and dot chrome always read as the same geometric family.

### Photography / Field Geometry
- **Halftone photo grid:** default 48×48 to 96×96 cells depending on card size; below ~32 cells, detail recognizability drops sharply (see Caveats in the engineering plan).
- **Icon SDF canvas:** icons rasterize at 4× target grid resolution before distance-transform, then downsample — keeps edges clean at any density.
- **Status dot:** fixed 4–6px regardless of card size — the one element that does **not** scale with `{grid.pitch}`, so it stays legible as a state marker even on the densest widgets.

## Components

> **No hover states documented.** Dot/480 widgets are designed primarily for display surfaces (LED panels, kiosk screens) where hover is not a meaningful input; interactive variants below cover Default, Active/Selected, and Disabled only.

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

## Do's and Don'ts

### Do
- Reserve `{colors.dotActive}` for genuinely live/active/urgent states — recording, live progress, alerts, destructive actions. Treat it as a scarce resource, exactly one accent per card.
- Route every visual (text, icon, chart, photo) through the `Field → Sampler → Renderer` pipeline. If a new widget can't be expressed as a field, reconsider the widget before adding a one-off rendering path.
- Default to `{grid.quantizeSteps} = 5` for UI widgets to preserve the chunky LED look; only disable quantization for photo halftones where smooth gradation reads better.
- Anchor a `{component.statusDot}` to any card reporting a live state. It is the system's identity tag, equivalent in role to a signature ornamental motif in any other design system.
- Keep card composition to a 3-column grid with equal `{spacing.cardGap}` gutters as the default — deviate only for genuinely wide content (waveforms, chat).
- Build all hierarchy from **grid size** and **color role**, never from a second typeface or italic/bold variant — there isn't one.
- Auto-select Canvas rendering for any widget exceeding ~2,000 dots or requiring animation; keep SVG for static, sparse, copy-paste-friendly widgets.

### Don't
- Don't introduce a second accent hue. `{colors.accentAmber}` exists only inside the `deerflowMosaic` hero preset's ambient lighting — never on flat `dot480` chrome, never on a CTA.
- Don't add drop shadows to cards. The only allowed depth effect is the ambient glow reserved for hero presets, and even that is a soft blur, not a directional shadow.
- Don't render text with a rasterized TTF when the bitmap dot-font covers the glyph — the CJK/SDF fallback exists only for characters outside the curated set.
- Don't skip quantization on UI widgets "for smoothness." Smooth gradients read as a bug in this system, not a feature — the chunkiness is the brand.
- Don't force SVG rendering on a widget with thousands of animated dots (waveforms, games, dense photos) — this is the single most likely performance foot-gun in the system.
- Don't use a fixed border-radius token where the squircle exponent can be used instead — the continuous roundness slider is a deliberate replacement for a discrete radius scale.
- Don't let card-to-card spacing shrink to fit denser widget content — `{spacing.cardGap}` stays constant; density is absorbed inside the card via `{grid.pitch}`, never at the layout level.

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
- **Renderer fallback:** below a device-performance threshold (detected via a quick canvas-fill-rate probe), all widgets fall back to Canvas rendering regardless of dot count, trading copy-paste-ability for guaranteed frame rate.

### Image Behavior
- Halftone photo cards resample at the target grid resolution on load — there is no "responsive crop," since the dot grid itself is the resolution; a smaller card simply requests fewer grid cells from the same source image.
- Camera-viewfinder and vision-AI cards keep a fixed aspect ratio (4:3) and letterbox rather than crop, so corner-bracket and bounding-box overlays stay geometrically correct at any card size.

## Iteration Guide

1. Focus on ONE generator or widget preset at a time. Pull its config object from `widgets/index.ts` and verify every field/style/theme reference resolves against the token tables above.
2. Reference tokens directly (`{colors.dotActive}`, `{component.progress-ring}`, `{rounded.default}`) — do not paraphrase or invent parallel names.
3. Run the playground's built-in validation pass after edits — it flags `unresolved-token`, `dot-count-exceeded`, and `orphaned-field` warnings automatically before export.
4. Add new interactive states as separate component entries (`-selected`, `-disabled`, `-active`) — do not bury them inside a single widget's prose description.
5. Default text to `{typography.bodyDot}`; reach for `{typography.displayDot}` only for a card's single primary value; reserve `{typography.heroDot}` strictly for splash/marketing boards.
6. Keep `{colors.dotActive}` scarce per board — if more than one card shows a solid red fill/ring in the same 3×3 grid, ask whether one of them is actually "informational" rather than "live," and recolor it to `{colors.dotIdle}`.
7. Before adding a new generator type, check whether the need can be expressed as a new `Field` function feeding the existing sampler/renderer/theme pipeline — new generators should be rare; new widget *presets* (a new config on top of existing generators) should be common.

## Known Gaps

- **Physical LED-panel calibration not yet measured** — the `led-panel` breakpoint's pitch-locking behavior is specified but not validated against real hardware bit-depth/gamma response.
- **Hover states not documented** by system policy — Dot/480 targets primarily non-hover display surfaces.
- **Superformula (N-fold decorative dot shapes)** deferred per the engineering plan — only the squircle exponent range is currently implemented.
- **Low-density halftone legibility** below ~32×32 grid cells is a known hard limit, not yet mitigated beyond the gamma-boost + pre-blur tweaks documented in the engineering plan.
- **Modal / dialog styling** not present in any captured reference board — no `dot-modal` component exists yet.
- **Full multi-language dot-font coverage** beyond the curated Latin set + Noto Sans SC fallback is unverified for right-to-left scripts.