# SHARE-PLAN: one card, its own page, every way out

> **Status: plan only (2026-10-26).** Nothing here is built. It assumes UX U2 (card action strip) and U3 (EXPLORE / MAKE / ABOUT, `src/site/views.ts`) are merged first; both are now on `feat/ux-u0-u1` (not yet on `main`).
> **Goal (from the owner):** "Add export / share support: copy as SVG, HTML, PNG, or a shareable single widget. Unique links/ids attached to every widget. A proper single-widget display page with actions, a new iOS kind of view: pills, horizontal, vertical, kinda iOS duo. And support for a shadcn registry."
> It sits next to `docs/UX-PLAN.md`. UX-PLAN covers how a visitor finds things; this doc covers how one card leaves the site.

## 1. Goal and what exists today

**Goal:**
- Every card has a stable id and its own URL.
- That URL opens a single-card page with actions: copy PNG / SVG / HTML / link, embed, share, remix, and add via shadcn.
- The page has a size control that shows the card in iOS widget shapes.
- The cards install as a hosted shadcn registry.

**What already exists.** Build on this; don't rebuild it.

| Area | What exists | Files |
|---|---|---|
| Card ids | **173 presets, 173 unique ids**, all kebab-case, ≤ 20 chars, all on a 144×144 `TILE` grid (checked 2026-10-26). Of these, 103 are animated, 39 interactive, 14 live and 2 use the camera. Three card ids are also board ids: `metro`, `ride`, `departures`. There is one old-id alias: `glyph-*` → `lock-*` in `widgetById`. | `src/widgets/index.ts`, `src/widgets/boards/*.ts`, `goldens/hashes.json` (`presets`, 173 keys) |
| One-card URL | `?card=<id>` renders one `DotWidget` in a bare gallery shell. It calls `findPreset`, which loads **every** board chunk. It has no meta tags, no OG image and no actions. `scripts/skins-browser.ts` uses it. | `src/App.tsx`; `src/widgets/manifest.ts` (`findPreset`) |
| Card actions (U2, branch) | A strip with ⓘ / REMIX / LINK / PNG, plus `⋯` on touch. LINK copies `?card=<id>` with `writeText`. PNG downloads `stillPNG()` at 2×. | `src/components/DotWidget.tsx`, `src/components/xray/store.ts` (`cardAction`), `src/components/palette/CommandLayer.tsx` (`copyLink`), `src/export/still.ts` |
| Canonical URLs (U3, branch) | Board pages are `/<board>/`; MAKE is `?make=<mode>`; ABOUT is `?about`. `viewFromUrl` already returns `card`. An alias table covers every old `?tab=`. | `src/site/views.ts`, `src/site/meta.ts` |
| Exports | **PNG / SVG / HTML download** and a "React snippet" (of the internal `DotWidget`) in TUNE. Clips as APNG / GIF / WebM / MP4 (timer, 2 s: 65 / 32 / 92 / 87 KB). Plotter SVG. SVG costs about 39 B per dot (`<defs>` + `<use>`), and every board is under 512 KB. | `src/components/playground/ExportPanel.tsx`, `render.ts`; `src/export/*` |
| Share codec | `?make=code&p=<z…>` holds a DOTS IR program: deflate-raw + base64url, ≤ 8192 chars, FNV-1a parent hash. | `src/lib/share.ts` |
| Card spec v1 | Cards as JSON. `presetToSpec` bakes bespoke TS fields to rasters **at one frame**, so animation in baked layers is lost. | `src/spec/*`, `schema/card.v1.schema.json` |
| Per-page meta and OG | `postbuild` writes `dist/<board>/index.html` with that board's meta, plus 26 OG PNGs (`ogImage(cardId)` already takes a **card** id). | `scripts/site/postbuild.ts`, `scripts/og.ts`, `src/site/meta.ts` |
| Curated layouts per grid | `toDevice` reads `variants['CxR']` on a card (the timer has `25x25` and `28x14`). This is the mechanism for other shapes. | `src/engine/device/toDevice.ts`, `src/widgets/boards/surfaces.ts` |
| Packages | `@dot480/core` (zero deps; `./card` `mountCard` is 20.2 kB gz), `@dot480/react` `<DotCard>`, and the `<dot-card>` element (the standalone build is 114.8 kB gz with every preset). None are published, and WEB-PLAN §1 dropped publishing. | `packages/*`, `packages/README.md` |
| shadcn registry | 16 `registry:component` items (10 Components v2 cards plus 6 widgets). Each is a 6-line `<DotCard preset>` wrapper. They depend on **unpublished npm packages**, so `shadcn add` fails today. It isn't hosted. `--check` exists. | `registry/`, `packages/scripts/registry.ts` |
| Headers | The SPA rewrite `/(.*)` → `index.html` (real files win). CSP `script-src 'self'` applies to everything except `lab/`. There is no `frame-ancestors` and no `X-Frame-Options`, so the site can be framed anywhere today. | `vercel.json` |

## 2. Research findings

| Topic | Finding | Source |
|---|---|---|
| Clipboard: types | `ClipboardItem.supports()` is always true for `text/plain`, `text/html` and `image/png`. `image/svg+xml` and `"web …"` custom types are optional and must be feature-checked. | [MDN supports()](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/supports_static) |
| Clipboard: browsers | `ClipboardItem` shipped in Chrome 76, Safari 13.1 and **Firefox 127**. `supports()` shipped in Chrome 121, Firefox 127 and Safari 18.4, so check it with `typeof` first. | [caniuse ClipboardItem](https://caniuse.com/mdn-api_clipboarditem), [caniuse supports](https://caniuse.com/mdn-api_clipboarditem_supports_static) |
| Clipboard: SVG | `image/svg+xml` works in **Chrome/Edge 124+ only** (not Firefox, not released Safari). Chrome sanitizes on read. Web custom formats (`web image/svg+xml`) are Chromium 104+ and only help when we control both ends. | [caniuse svg](https://caniuse.com/mdn-api_clipboarditem_type_image_svg_xml), [Chrome blog: SVG](https://developer.chrome.com/blog/svg-support-for-async-clipboard-api), [Chrome blog: custom formats](https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api) |
| Clipboard: Safari | `write()` must run **inside the user gesture**. Any `await` before it throws `NotAllowedError`. The fix is to call `write()` synchronously and pass a **Promise<Blob>** as the item value. Chrome accepts the same pattern. | [WebKit blog](https://webkit.org/blog/10855/async-clipboard-api/), [WebKit bug 222262](https://bugs.webkit.org/show_bug.cgi?id=222262), [web.dev](https://web.dev/articles/async-clipboard) |
| Web Share L2 | `navigator.share({ files })` needs transient activation and HTTPS. Use `canShare({ files })`. Supported on Safari macOS 12.1+ / iOS 12.2+, Chrome Android, Chrome desktop 128+ and Edge 95+; **not Firefox desktop**. An iframe needs `allow="web-share"`. Errors: `AbortError` (the user cancelled) and `InvalidStateError`. | [MDN share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share), [caniuse web-share](https://caniuse.com/web-share) |
| oEmbed | `type: "rich"` needs `html`, `width`, `height` and `version: "1.0"`. Discovery is `<link rel="alternate" type="application/json+oembed" href=…>`. Consumers fetch that href as given, so a **static JSON file per card works with no server**. The spec says rich HTML should be an iframe on another origin. Notion embeds through Iframely. | [oembed.com](https://oembed.com/), [Iframely/Notion](https://iframely.com/domains/notion) |
| Framing | `frame-ancestors` must be an HTTP header (a meta tag doesn't work) and has no `default-src` fallback. Set it per route. | [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors) |
| shadcn: files | `registry.json` has `name`, `homepage` and `items[]`. Items have `type`, `dependencies`, `registryDependencies`, `files[]{path,type,target}`, `cssVars`, `docs`, `categories` and `meta`. `shadcn build` writes `public/r/<name>.json`. Install with `npx shadcn add https://host/r/x.json`. Types: `registry:base` / `block` / `component` / `ui` / `lib` / `hook` / `page` / `file` / `style` / `theme` / `item` / `font`. | [getting started](https://ui.shadcn.com/docs/registry/getting-started), [registry-item.json](https://ui.shadcn.com/docs/registry/registry-item-json) |
| shadcn: namespaces | `components.json` → `"registries": { "@dot480": "https://host/r/{name}.json" }`, then `shadcn add @dot480/timer`. There are also `shadcn view` and `shadcn search`. MCP needs `/r/registry.json` at the root. | [namespaces](https://ui.shadcn.com/docs/registry/namespace), [MCP](https://ui.shadcn.com/docs/registry/mcp) |
| shadcn: directory | Listing is a PR to `apps/v4/registry/directory.json` that must pass `pnpm validate:registries`. Requirements: public, a flat `/r/` layout and no `content` in the index. | [registry index](https://ui.shadcn.com/docs/registry/registry-index), [directory](https://ui.shadcn.com/docs/directory) |
| Open in v0 | `https://v0.dev/chat/api/open?url=<item json>`. The item must be public. It does **not** support `cssVars`, `css`, `envVars` or namespaces. | [open-in-v0](https://ui.shadcn.com/docs/registry/open-in-v0) |
| shadcn changelog | 2025: CLI 3.0 with namespaces and MCP; directory listing in Oct 2025. 2026: GitHub registries, include and validate, and items import `cn` from the `cn` package (Sep 2026). | [changelog](https://ui.shadcn.com/docs/changelog) |
| iOS families (pt) | On 393/390-pt iPhones, **small 158×158, medium 338×158, large 338×354**, accessoryCircular 72×72, accessoryRectangular 160×72 and accessoryInline 234×26 (Pro Max: 170 / 364×170 / 364×382). systemExtraLarge is iPad only (748×356 on 13″). Margins are 16 pt (11 pt tight). Corners use `ContainerRelativeShape`. | [HIG Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets) |
| iOS rendering | `fullColor` / `accented` (`widgetAccentable`) / `vibrant` (Lock Screen, desaturated). iOS 26 Home Screen appearances are light, dark, clear (Liquid Glass) and tinted. StandBy shows two smalls, scaled up, with a red tint at night. | [HIG Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets) |
| Live Activities | Dynamic Island **compact = leading + trailing**, each about 52×37 pt around the camera (this is the "duo"). Minimal is about 37–45×37. Expanded and Lock Screen are 371 wide × 84–160 tall. StandBy shows the Lock Screen view at 2×. | [HIG Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities) |
| Prior art | **ray.so:** all state in the URL, plus copy image, PNG/SVG export and copy link. **shadcn blocks:** Preview/Code tabs, copy CLI command, Open in v0. **CodePen:** prefill POST and iframe embeds. **Dwitter:** the permalink is the program, and remix is a fork. **iOS "Add widget" sheet:** swipe through the sizes with a page-dot indicator. | [ray-so repo](https://github.com/raycast/ray-so), [shadcn blocks](https://ui.shadcn.com/blocks), [CodePen prefill](https://blog.codepen.io/documentation/prefill/) |
| Build | Vercel builds have a 45-min limit and no output-file cap; 100k+ files get slow. Our OG images use the in-repo raster (`scripts/og.ts`), not Satori. That's the right call: Satori is flexbox-only and couldn't match the dots. | [Vercel build limits](https://vercel.com/kb/guide/troubleshooting-build-error-build-step-did-not-complete-within-45-minutes) |

## 3. Per-widget identity and URLs

**Ids.**
- The preset id **is** the widget id.
  - It is already unique (173/173), kebab-case and pinned by `goldens/hashes.json`.
  - Don't add a second id scheme. A content hash is only needed for user-made cards (§3, "Remixed cards").
- **Freeze rule.** Once a card id ships, it never disappears. A rename adds an entry to a new `cardAliases` table (`src/widgets/manifest.ts`, next to `boardAliases`), and the `glyph-*` → `lock-*` rule moves into that table.
- **Verify check (`scripts/verify.ts`).** Every id in `goldens/hashes.json` resolves through presets plus `cardAliases`, ids stay kebab-case and ≤ 32 chars, and no board id uses a reserved segment.
  - Reserved segments: `card`, `embed`, `r`, `og`, `oembed`, `assets`, `images`, `lab`, `docs`.

**URL scheme.** It fits U3's canonical URLs: a path names a thing, and the query names a view or state.

| URL | Opens | Notes |
|---|---|---|
| `/card/<id>/` | **Single-card page (canonical)** | Prebuilt `dist/card/<id>/index.html` with per-card meta and OG. It needs its own namespace because `metro`, `ride` and `departures` are both board ids and card ids. |
| `/card/<id>/?size=m&skin=crt&t=12.5&d=progress:.8,mode:2` | Same card in a given state | Every param is optional; see the state table below |
| `?card=<id>` (any path) | Old link | Kept forever: `replaceState` to `/card/<id>/` and keep the other params. The skins probe keeps working. |
| `/embed/<id>?size=…` | Bare card for iframes | A Vercel rewrite to `embed.html` (no files per card); §5.1 |
| `/r/<name>.json`, `/r/registry.json` | shadcn registry | Static files; §6 |
| `/og/card/<id>.png`, `/oembed/<id>.json` | OG image, oEmbed | Built at deploy |

**Board context.** `/card/<id>/` must not load all 25 board chunks the way `findPreset` does today.
- The prebuilt page carries `<meta name="dot480:card" content="<id>" data-board="<board>">`. The app reads it and loads only that board's chunk.
- If the meta tag is missing (an old `?card=` link, or a dev server), it falls back to a lazy `cards-index` chunk (a postbuild-generated `{ id: board }` map, about 1.5 kB gz, never in first load), then to `findPreset`.

**State encoding.** It is query-string based, so links survive copy/paste and the prebuilt page and OG image still apply.

| Param | Meaning | Validation |
|---|---|---|
| `size` | Frame family (§4.3): `card` (default), `s`, `m`, `l`, `xl`, `circ`, `rect`, `inline`, `island`, `min`, `exp`, `lock`, `standby` | Unknown → `card` |
| `skin` | The existing display skin (`?skin=`) | `SKIN_NAMES` |
| `t` | Frozen board time in seconds (time machine), for animated cards | Finite, 0–86400, 2 dp |
| `d` | Data overrides `key:value,…` (numbers only, like `<dot-card data-*>`) | Keys must be in `defaults` or `controls`; ≤ 32 keys; clamped to control ranges; no eval |
| `theme` | `dot480` / `deerflowMosaic` (parity with `<dot-card theme>`) | Known presets only |

- On the card page, control edits and time scrubs update `d` and `t` with a debounced `replaceState`. Copy Link then always captures what you see.
- **Remixed cards** (not presets) are out of scope here. DOTS programs keep `?make=code&p=`. A later phase could carry a card spec v1 in `#s=<z…>` with the `share.ts` codec (hash, so a large spec never reaches a server log). `programHash` (FNV-1a) would give it an id.

## 4. The single-card page

### 4.1 Layout (a lazy `CardPage` view inside the SPA, under EXPLORE)
- **Header row:**
  - a breadcrumb `EXPLORE › MOSAIC › <CARD NAME>` (the board label from `boardLabel`);
  - `← →` to the previous and next card on that board (also the arrow keys);
  - `✕` back to the board, scrolled to this card.
- **Stage:**
  - the card at 2× pitch (≈ 648 px), centred on `{colors.bg}`;
  - the size pills directly under it (§4.3);
  - the card is live: controls, X-ray, time scrub.
- **Side rail on desktop, below the stage on mobile:**
  - the name and blurb;
  - grey chips: hint verb (U2), ANIMATED, LIVE DATA, CAMERA;
  - facts: grid, visible dots, renderer, layer kinds (from `describe()` and the X-ray SUMMARY);
  - "Seen on: <board>".
- **Action bar:**

| Primary (always visible) | More ▾ (sheet) |
|---|---|
| **COPY PNG** · **COPY SVG** · **COPY LINK** · **SHARE** (only where `canShare` works) · **REMIX** · **ⓘ HOW** | Copy HTML (3 tabs: static SVG / iframe / `<dot-card>`) · Embed code + oEmbed note · Download PNG / SVG / GIF / WebM / MP4 (reuses `src/export`) · **Add via shadcn** (`npx shadcn add …` with a copy button, the `@dot480` namespace snippet, and Open in v0) · Card spec JSON (`presetToSpec`; says when layers were baked) |

- **The board card strip (U2) changes:**
  - LINK copies `/card/<id>/` instead of `?card=`;
  - the card name in the header links to the card page;
  - PNG stays a download (decision 10).

### 4.2 Mobile (≤ 760 px)
- The card is full width (pitch scales, never the grid).
- The size pills sit in one horizontal scroll row with a fade edge.
- A sticky bottom bar holds **SHARE** (or COPY LINK where share isn't available), **COPY PNG** and **⋯** (a bottom sheet with everything else).
- Swiping left and right moves to the previous and next card. This uses a pointer-type check, so it doesn't fight the card's own drag controls: no swipe starts on a control hit box.
- Tap targets are ≥ 44 px on this page (fixing the skin segments' 20 px problem here at least).

### 4.3 Size and shape pills (the "iOS view")
The interpretation, **to be confirmed (decision 1):** "pills / horizontal / vertical / duo" means showing one card in the iOS widget **size families and shapes**:
- small (square), medium (horizontal) and large (vertical);
- the Lock Screen accessories (circular, rectangular, and the inline *pill*);
- the Dynamic Island compact *duo* (leading + trailing), plus minimal and expanded.

**Control.** A `role="radiogroup"` row of grey pills, grouped as **HOME · LOCK · LIVE**, with CARD as the default. The pill shape itself borrows the iOS look. Arrow keys move the selection, and it writes `?size=`.

**Dot grids.** One rule keeps density constant: **1 dot ≈ 1.1 pt** (small 158 pt = 144 dots, the native card), `cells = round(pt × 144/158)`.

| Pill | iOS family (393-pt iPhone) | pt | Dot grid | v1 behaviour (all 173 cards) | Curated (S5) |
|---|---|---|---|---|---|
| CARD | (none) | (none) | 144×144 | As today | (none) |
| S | systemSmall | 158×158 | 144×144 | Card inside a squircle frame mask | (none) |
| M | systemMedium | 338×158 | 308×144 | Card left-aligned in the frame, plus a **glance panel** on the right if the card has `glance` metadata, otherwise centred (letterbox) | `variants['308x144']` |
| L | systemLarge | 338×354 | 308×322 | Card centred, with name and glance text below (dot text via `textAt`) | `variants['308x322']` |
| XL | systemExtraLarge (iPad) | 748×356 | 302×144 (ratio 2.1) | Like M; hidden behind "More sizes" | rare |
| ◯ CIRC | accessoryCircular | 72×72 | 66×66 | Needs `glance`: a ring of the primary value plus a 5×7 value (vibrant: no accent) | (none) |
| ▭ RECT | accessoryRectangular | 160×72 | 146×66 | Needs `glance`: label, value and a bar | (none) |
| INLINE (pill) | accessoryInline | 234×26 | 213×24 | Needs `glance`: one line of 5×7 text in a capsule mask | (none) |
| ISLAND (duo) | DI compact leading + trailing | 2 × 52×37 | 2 × 48×33 around a black capsule | Needs `glance`: leading = icon or glyph on a coarse lattice, trailing = value | per card |
| MIN | DI minimal | 37×37 | 33×33 | Needs `glance`: icon only | (none) |
| EXP | DI expanded / Lock Screen Live Activity | 371×160 | 338×146 | Like M | `variants['338x146']` |
| STANDBY | StandBy (2 × small, scaled up) | (none) | 2 × 144×144, landscape | Card plus its glance in a second small; night red tint **off** (decision 8) | (none) |

**Rendering rules.** They keep AGENTS.md intact.
- **Re-layout, never stretch.**
  - Fields live in cell space, so sampling a 144×144 card onto 308×144 would distort text.
  - Wide and tall frames place the authored 144² card with `place` / `bounded` from `src/engine/layout.ts`, and add dot-text and ring layers for the glance.
  - Curated layouts use the existing `variants['CxR']` mechanism (`toDevice`). It moves from `DeviceSpec` onto `WidgetPreset` as an optional field (widgets layer only; no engine change).
- **Frame shapes are field masks.** Squircle, circle and capsule SDFs multiply into the layers, so dots outside the shape are absent rather than CSS-clipped mid-dot. Corners use the existing squircle exponent (`n = 2 + 30r²`), not a radius enum.
- **The bezel and island capsule are dot sites** (like `bezel()` in `boards/surfaces.ts`), in `faint`.
- **One accent:**
  - the glance ring uses the card's own `active` tone;
  - "vibrant" (Lock Screen) maps the accent to `value` (fewer accents is allowed).
- **`glance` metadata** (new, optional, per preset): `{ key, label, format, icon? }`, the card's primary value.
  - Pills that need it are disabled, with the reason "no glance layout for this card yet".
  - Target: about 40 cards in S5, starting with the liked cards (level-03, afterlight, mosaic, components) and the widgets (timer, home-clock, weather, music, fitness-rings, hb-agent, ui-progress).
- **Renderer by dot count, as usual.** Large is about 99k cells, which means Canvas or WebGL under the DESIGN.md rules; it's never hardcoded.

### 4.4 A11y and OG
- `<h1>` holds the card name.
- The card body is `role="img"` with the `describe()` label (or `group` when it's interactive, as in U2).
- Each action button has a text label. Results go to the existing toast, which gets `role="status"`.
- Copy fallbacks are announced, for example "Copy isn't available here: downloaded instead".
- Reduced motion shows one still frame, and the size pills don't animate.
- Nothing is hover-only.
- **OG and crawler pages:** postbuild writes, per card:
  - `dist/card/<id>/index.html`, with title `<Card name> · DOT/480`, a description from the blurb or `describe()`, a canonical link, and `og:image` = `/og/card/<id>.png` from the existing `ogImage(id)`;
  - the oEmbed discovery link.
- `?size=` states share the default OG image, because static pages can't vary by query.

## 5. Export and share formats

All of this lives in `src/export/clipboard.ts` (pure helpers plus one DOM wrapper) and `src/export/snippets.ts` (pure string builders, testable in Node). Both are lazy and imported only by the card page and the strip actions.

| Action | Exact behaviour | Clipboard / API | Fallback | Size (estimate; measure in S2) |
|---|---|---|---|---|
| **Copy PNG** | Current frame (`t` from the time machine if frozen) at 2×, 14 px padding, on `{colors.bg}`, through `stillPNG` (U2) | `clipboard.write([new ClipboardItem({ 'image/png': pngPromise })])`, **called synchronously in the click**, so Safari works | No `ClipboardItem`, or rejected → download `<id>.png` + toast | ≈ 30–80 KB |
| **Copy SVG** | `renderSVG` of the current frame, with a `<title>` and a `<!-- dot480 card <id> · /card/<id>/ -->` comment | `{ 'text/plain': svg }`, plus `'image/svg+xml'` when `ClipboardItem.supports?.('image/svg+xml')` (Chrome 124+). Pasting the text into Figma gives vectors (unverified; check in S2). | `writeText(svg)` → download `<id>.svg` | ≈ 20–60 KB raw (39 B/dot), 5–12 KB gz |
| **Copy HTML** | Three tabs: **static** (inline SVG in a `<div style="background:#000">`, no JS, works in email); **iframe** (`<iframe src="…/embed/<id>?size=…" width height loading="lazy" title>`); **web component** (`<script type="module" src="…/dot-card.js">` + `<dot-card card="<id>">`, only if decision 7 hosts it) | `writeText(code)`, text/plain only (it's code, not rich paste) | A selectable `<textarea>` | Static ≈ SVG; iframe ≈ 200 B; element ≈ 250 B + 115 kB gz script |
| **Copy link** | Canonical `/card/<id>/` plus the state params (§3) | `writeText(url)` | A selectable input in the toast | (none) |
| **Share** | `navigator.share({ files: [png], title, text: url })`. The URL goes in `text` too, because some targets drop `url` when files are attached (unverified). | Shown only when `navigator.canShare?.({ files: [probe] })`; the PNG promise starts on pointerdown | `share({ title, url })` → hidden (Firefox desktop) | PNG as above |
| **Embed** | §5.1 | (none) | (none) | (none) |
| **Download clip** | Existing `recordClip` (APNG / GIF / WebM / MP4) for the 103 animated cards | (none) | WebM via MediaRecorder (existing) | GIF ≈ 32 KB / 2 s |
| **Add via shadcn** | Shows `npx shadcn@latest add https://dot-matrix1.vercel.app/r/<id>.json`, the `@dot480` registries snippet, and Open in v0 | `writeText` | (none) | (none) |

**Rules:**
- Live cards (14) copy what is on screen.
- **Camera cards (2) export the no-camera idle frame** unless the visitor confirms "include camera image", so a face never leaves by accident.
- **Lazy:**
  - the clipboard and snippet helpers, `CardPage`, the size families, the glance templates and the registry panel are all `import()` chunks;
  - the board strip's eager code stays the U2 buttons.

### 5.1 Embed and oEmbed
- **`embed.html`** is a separate Vite entry, like `essay.html`.
  - It has no app shell. It mounts the card with `@dot480/core/card` `mountCard` (≈ 20 kB gz) and the card's board chunk.
  - It reads `size`, `skin`, `t`, `d` and `theme`. A tiny dot-text "DOT/480 ↗" link opens `/card/<id>/` in a new tab.
  - It has no copy buttons, so no `clipboard-write` permission is needed.
  - Budget: ≤ 40 kB gz plus the board chunk, checked by `size.ts --entry embed` (new flag).
- **`vercel.json`:**
  - rewrite `/embed/(.*)` → `/embed.html`;
  - exclude `embed/` from the main CSP rule's regex, and give `/embed/(.*)` its own CSP: the same directives plus **`frame-ancestors *`**;
  - optionally add `frame-ancestors 'self'` to every other page (decision 6);
  - verify with `curl -I` on a preview, rather than relying on header precedence.
- **oEmbed:** postbuild writes `dist/oembed/<id>.json` with `{ version: "1.0", type: "rich", html: <iframe>, width, height, title, provider_name: "DOT/480", provider_url, thumbnail_url: og image }`, and the card page links to it.
  - `maxwidth` / `maxheight` are ignored (static file). The iframe is responsive (`width:100%; aspect-ratio`).
  - Notion needs Iframely to pick the domain up; it isn't guaranteed (decision 6).

## 6. shadcn registry

**The problem today.** All 16 items depend on `@dot480/react` and `@dot480/core` from npm. Those were never published, and WEB-PLAN §1 says not to publish. So `npx shadcn add` fails at install.

**Proposal: copy-in, no npm.** Ship the engine as files, which is shadcn's own model. `src/engine` stays untouched and dependency-free, because bundling happens in `packages/scripts/`.

| Item | Type | Files (target) | Deps |
|---|---|---|---|
| `dot480-runtime` | `registry:lib` | `lib/dot480/runtime.js` + `runtime.d.ts`: a single-file ESM build of `@dot480/core/card` (`mountCard`, sampler, renderers), unminified, with a licence header | none |
| `dot480-card` | `registry:component` | `components/dot480/dot-card.tsx`: the `@dot480/react` wrapper (85 lines) importing `@/lib/dot480/runtime` | `registryDependencies: ["@dot480/dot480-runtime"]`; peer react |
| `dot480-board-<board>` (25) | `registry:lib` | `lib/dot480/boards/<board>.js` + `.d.ts`: one ESM bundle per board module (board files export arrays, so a single card can't be tree-shaken out yet) | runtime |
| `<card-id>` (173) | `registry:component` | `components/dot480/<id>.tsx`: today's 6-line wrapper, with `preset` taken from its board lib | `dot480-card`, `dot480-board-<board>` |
| `dot480-board-view-<board>` (later) | `registry:block` | A grid of the board's cards | its cards |

- **Build.** `packages/scripts/registry.ts` grows from 16 items to every card.
  - It reuses `packages/scripts/build.ts` (Vite library mode) to emit the runtime and board bundles, then writes `registry/registry.json` plus `registry/r/*.json` with `content` inlined.
  - Postbuild copies `registry/r/` to `dist/r/` (with `registry.json` at `/r/registry.json`, which MCP and directories need).
  - `vercel.json` gives `/r/(.*)` the headers `Access-Control-Allow-Origin: *` and `Cache-Control: max-age=3600`.
- **Hosting and namespace:**
  - `https://dot-matrix1.vercel.app/r/<name>.json`;
  - the docs snippet `"registries": { "@dot480": "https://dot-matrix1.vercel.app/r/{name}.json" }`, then `npx shadcn add @dot480/timer`;
  - Open in v0 works, because the items use no `cssVars`, `css` or namespaces in the URL form.
- **Versioning:**
  - `meta.version` (the engine package version plus the card's golden hash) goes in every item;
  - `/r/` always serves the latest;
  - a breaking change to a card's props gets a new item name and never mutates the meaning of an old one;
  - card ids follow the §3 freeze rule.
- **Checks:**
  - `registry.ts --check` (exists) goes into `pnpm check`;
  - new: validate every item against the cached registry-item schema with `scripts/lib/jsonschema.ts` (no network in CI);
  - new: each item's `registryDependencies` resolve inside the registry;
  - the runtime bundle stays ≤ 25 kB gz;
  - **install smoke (manual, before merge):** a temporary Vite + React app outside the repo, `npx shadcn add http://localhost:4173/r/timer.json` against `vite preview`, then `tsc` plus headless render. This is the P10 gate "shadcn add works in a fresh app".
- **Docs drift:** `packages/README.md` says "146-card library". There are 173 presets now; fix that in the same PR.

## 7. Guardrails
- **Card pixels:** the card page, actions and frames are chrome or new layouts. `pnpm golden --check` stays 173/173. Curated `variants` and glance layouts get **new** golden keys (`<id>@308x144`, `<id>@glance-circ`), added as an intended change. Existing keys never move.
- **Budget:** first load stays ≤ 150 kB gz (142.9 today, and U2 / U3 take some of the rest). Everything in this plan is lazy. Run `size.ts --check`, `size.ts --board <b>` for card deep links, and the new `--entry embed` check.
- **One accent:** pills, actions, bezels and the island capsule are grey (`value` / `mid` / `faint`). Only the card's own `active` tone is red. Vibrant mode drops it, and StandBy night tint is off.
- **Engine framework-free:**
  - no change under `src/engine/` is required;
  - mask SDFs come from existing field primitives (a squircle SDF exists for dots; if a frame-mask field is needed, it is a `Field` in `src/engine/fields/` with no dependency);
  - the bundlers and shadcn tooling live in `packages/scripts/` and run through `npx`, with no new dependency anywhere unless one is truly needed (and then app-level only).
- **Links never break:**
  - `?card=` redirects to `/card/<id>/`;
  - `cardAliases` handles renames;
  - the reserved-segment check runs;
  - U3's alias table keeps working;
  - `/r/` item names are permanent;
  - a verify check confirms every golden id has a card page, an OG image and an oEmbed file after postbuild.
- **Build time:** this adds 173 HTML, 173 OG PNG and 173 JSON files.
  - Measure the postbuild seconds in S0. The current 26 OG images are the baseline.
  - If 173 images add more than about 60 s on Vercel, cache them by golden hash plus `og.ts` version under `node_modules/.cache/og` (Vercel keeps the build cache, unverified for this path) or render with a `worker_threads` pool.
- **Security:**
  - `d` and `t` are numbers only, clamped, and never evaluated;
  - the embed is the only frameable route;
  - the SVG export contains only our markup;
  - camera frames are opt-in.

## 8. Phases

| Phase | Scope | Size | Depends on | Checks while building (module level) |
|---|---|---|---|---|
| **S0 · Ids and URLs** | `cardAliases`, the reserved-segment and frozen-id verify checks; `/card/<id>/` route in `views.ts`; `?card=` → canonical; `dot480:card` meta; postbuild card pages, `og/card/*.png` and `oembed/*.json`; build-time measurement | 1 day | U3 merged | `verify` (new `share:` checks), `postbuild.ts --no-og` then a timed full run, `skins-browser.ts` (uses `?card=`) |
| **S1 · Card page** | Lazy `CardPage`: breadcrumb, prev/next, stage, side rail, primary actions wired to the existing U2 actions; strip LINK → `/card/<id>/`; mobile sticky bar and sheet; a11y | 2 days | U2 + S0 | `tsc`, oxlint, a new `scripts/site/card-browser.ts` probe at 1440 and 375 (no console errors, keyboard path, `size.ts --board`) |
| **S2 · Copy and share** | `src/export/clipboard.ts` and `snippets.ts`; Copy PNG/SVG/HTML/link, Share, downloads; camera opt-in; measured sizes written back into §5 | 1–1.5 days | S1 | Node checks for the snippet builders and the `d` parser; CDP probe with clipboard permission granted (read back PNG, SVG and text); manual Safari / iOS / Firefox pass |
| **S3 · Embed** | `embed.html` entry, rewrite, per-route CSP with `frame-ancestors`, oEmbed discovery, `size.ts --entry embed` | 1–1.5 days | S0 | `curl -I` on a preview; the embed rendered inside a cross-origin test page; budget |
| **S4 · Size pills, generic** | `src/site/families.ts` (pt sizes → dot grids, pure data); radiogroup pills; frame masks and dot-site bezels; S / M / L / XL / STANDBY for all cards; `?size=` | 2 days | S1 | `golden --check` unchanged; a new `verify` check that each family grid matches the 1.1 pt rule; probe screenshots of each family |
| **S5 · Glance and curated** | `glance` metadata on about 40 cards; CIRC / RECT / INLINE / ISLAND duo / MIN / EXP templates; `variants` for about 12 hero cards (M / L / EXP); new golden keys | 3–4 days (taste work) | S4 | `pnpm snap` per card against the liked cards; `golden` for the new keys only; fidelity |
| **S6 · Registry v1** | Copy-in items (runtime, card wrapper, board libs, 173 cards); hosting at `/r/`; headers; schema and dependency checks; install smoke; card page "Add via shadcn" panel | 2 days | None for packaging (can start now; it's in `packages/`). The panel needs S1. | `registry.ts --check`, the schema check, the bundle size check, the manual `shadcn add` smoke |
| **S7 · Docs and polish** | ABOUT › "Share & embed" (URL params, registry snippet); `DESIGN.md` › a frames/glance section plus any token; README deep links; `CHANGELOG.md` and `src/changelog.ts`; `PROGRESS.md` | ½ day | All | (none) |

- **Order:** S6 can start now. Then S0 → S1 → S2 → S3 → S4 → S5 → S7, once U2 and U3 merge, because they own `App.tsx`, `views.ts` and `DotWidget.tsx`.
- **Total:** about 12–14 days.
- **Every phase is its own PR.** Each one runs the full suite before merge: `pnpm check`, `pnpm golden --check`, a build, `size.ts --check`, and the mobile / C10 / skins probes.

## 9. Decisions for the owner
1. **The iOS reading.** Is "pills / horizontal / vertical / duo" the iOS widget size families plus Lock Screen accessories (inline = pill) plus the Dynamic Island compact duo, as in §4.3? Or did you mean pill-shaped buttons, or two cards side by side?
2. **Family scope.** iPhone Home and Lock Screen plus the Dynamic Island (recommended), or also iPad XL, StandBy and Apple Watch?
3. **Small-shape strategy.** Generic fit for every card, plus `glance` and curated layouts for about 40 cards (recommended)? Or curated only, with the unsupported pills hidden?
4. **URL.** `/card/<id>/` (recommended), `/<board>/<card>/` (breaks if a card moves boards), or `?card=` only (no OG)?
5. **shadcn.** Copy-in bundles with no npm (recommended, and it respects "no publishing")? Or publish `@dot480/*` after all? And should it be listed in the shadcn directory? WEB-PLAN §5 said no listings.
6. **Embeds.** Allow anyone to iframe `/embed/*`, and lock every other page to `frame-ancestors 'self'`? Ask Iframely to allow the domain for Notion?
7. **Host `/dot-card.js`.** The `<dot-card>` standalone is 115 kB gz with every preset. Host it now, or wait for a per-board split?
8. **StandBy night mode.** It would turn the whole card red (the accent colour). The proposal is to leave it out.
9. **Hero cards.** Which roughly 12 cards get curated M / L layouts first? The proposal: the four liked cards (level-03, afterlight, mosaic, components) plus timer, home-clock, weather, music, fitness-rings, hb-agent, ui-progress and ui-knob.
10. **The strip's PNG button.** Keep it as a download (U2 as built), or make it copy to the clipboard, with download moving into More?
