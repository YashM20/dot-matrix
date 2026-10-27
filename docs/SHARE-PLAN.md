# SHARE-PLAN: one card, its own page, every way out

> **Status (2026-10-26): S0 and S1 built on `feat/share-s0`, with the S2 copy helpers.** Decisions taken for the build: canonical `/widget/<slug>/`; uid 8 chars (decision 7); `/<uid>` and `/widget/<uid>/` resolve client-side with `replaceState` (the prebuilt copies carry the meta for crawlers); PNG copies where `ClipboardItem` works, else downloads; horizontal pill bars only (no vertical dock yet); no embed, oEmbed or `dot-card.js` yet.
> **Built:** `src/widgets/ids.json` + generated `catalog.ts` (`npx tsx scripts/widgets/ids.ts --assign` after adding cards; `--check` in verify), `cardAliases` / `resolveCardId`, `src/widgets/meta.ts` (173 authored blurbs + `deriveWidgetMeta`), `src/site/routes.ts` (route table, `@scope`, resolver), the lazy `src/components/widget/WidgetPage.tsx` + `PillBar.tsx`, `src/export/clipboard.ts` + `snippets.ts`, postbuild widget pages (519), JSON-LD, `dist/widgets.json` (99 KB, 17.8 KB gz) and `dist/og/widget/<uid>.png`.
> **Measured:** 173 widget OG images ≈ 2 min cold on a dev machine, so they are cached by renderer source + golden hash (`node_modules/.cache/dot480-og`); the widget page chunk is 17 kB gz; first load 145.9 kB gz.
> **Still open:** the state params (`t`, `d`, `theme`), swipe between cards, the bar shrinking on scroll, the vertical dock, Copy HTML tabs (iframe / element), clip downloads and camera opt-in in More, the `added` date, S3–S5.
> **Goal (from the owner):** "Add export / share support: copy as SVG, HTML, PNG, or a shareable single widget. Unique links/ids attached to every widget. A proper single-widget display page with actions, a new iOS kind of view: pills, horizontal, vertical, kinda iOS duo. And support for a shadcn registry."
> **Owner clarifications (2026-10-26):** the "iOS view" means **the action buttons**: iOS-style pills in the navbar and at the screen edges, nothing more (not widget sizes). Widget links are short and simple, **`/widget/<id>/`**, and the scheme must extend later (an org or workspace scope) without breaking any link. Every widget has **metadata**, and a URL works with **either its name or a short id**: `/widget/panel/` and `/widget/k7m2qx9a/` open the same widget.
> It sits next to `docs/UX-PLAN.md`. UX-PLAN covers how a visitor finds things; this doc covers how one card leaves the site.

## 1. Goal and what exists today

**Goal:**
- Every card has metadata, a readable name (slug), a permanent short id, and its own URL that accepts either.
- That URL opens a single-card page with actions: copy PNG / SVG / HTML / link, embed, share, remix, and add via shadcn.
- Its actions sit in iOS-style pill bars: one in the navbar, one at the bottom edge.
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
| iOS toolbars (iOS 26, Liquid Glass) | Toolbars and tab bars float above content as **capsules**, inset from the screen edges, instead of edge-to-edge bars. Related actions share one capsule; a toolbar usually has a leading group and a trailing group. Bars shrink while scrolling and return on scroll-up. Prefer symbols plus short labels and keep few actions in the bar; the rest go in a "More" menu. | [HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [HIG Materials (Liquid Glass)](https://developer.apple.com/design/human-interface-guidelines/materials), [Apple newsroom, Liquid Glass](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/) |
| Tap targets | 44×44 pt minimum for touch controls on iOS; WCAG 2.2 2.5.8 asks for at least 24×24 CSS px. | [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| Prior art | **ray.so:** all state in the URL, plus copy image, PNG/SVG export and copy link. **shadcn blocks:** Preview/Code tabs, copy CLI command, Open in v0. **CodePen:** prefill POST and iframe embeds. **Dwitter:** the permalink is the program, and remix is a fork. | [ray-so repo](https://github.com/raycast/ray-so), [shadcn blocks](https://ui.shadcn.com/blocks), [CodePen prefill](https://blog.codepen.io/documentation/prefill/) |
| Build | Vercel builds have a 45-min limit and no output-file cap; 100k+ files get slow. Our OG images use the in-repo raster (`scripts/og.ts`), not Satori. That's the right call: Satori is flexbox-only and couldn't match the dots. | [Vercel build limits](https://vercel.com/kb/guide/troubleshooting-build-error-build-step-did-not-complete-within-45-minutes) |

## 3. Per-widget identity and URLs

**Two keys per widget; both work everywhere.**

| Key | Example | What it is | Can it change? |
|---|---|---|---|
| **slug** | `panel`, `timer`, `hb-agent` | Today's preset id: kebab-case, readable, already unique (173/173) and pinned by `goldens/hashes.json` | It can be renamed. The old slug goes into a `cardAliases` table (`src/widgets/manifest.ts`, beside `boardAliases`) and keeps working forever. The `glyph-*` → `lock-*` rule moves there too. |
| **uid** | `k7m2qx9a` | A short permanent id: 8 characters from the lowercase Crockford base-32 alphabet `0123456789abcdefghjkmnpqrstvwxyz` (no `i l o u`, so it reads aloud and survives handwriting). 32⁸ ≈ 10¹² values. | Never. Never reused, even if the widget is deleted. |

- **Telling them apart.** A uid is exactly 8 characters and always has at least two digits and one letter. Slugs and board ids may never match that pattern (verify check), so any URL segment is unambiguous: try uid → slug → `cardAliases`.
- **No new dependency.** A nanoid-style generator is about 10 lines on `crypto.getRandomValues`, in `scripts/widgets/ids.ts`. Its `--assign` mode adds uids only for presets that don't have one yet, appending to the committed **`src/widgets/ids.json`** (`{ "<slug>": "<uid>" }`); it never rewrites an entry. Random rather than a hash of the slug, so a rename can never tempt anyone to "recompute" it.
- **Verify checks (`scripts/verify.ts`):**
  - every preset has a uid, and uids are unique and match the pattern;
  - every golden id still resolves through presets plus `cardAliases`, so nothing silently disappears;
  - slugs stay kebab-case, ≤ 32 characters, and never match the uid pattern;
  - board ids avoid the uid pattern and the reserved segments: `widget`, `w`, `embed`, `r`, `og`, `oembed`, `assets`, `images`, `lab`, `docs`, and anything starting with `@` (kept for scopes, below).

**Metadata for every widget.** One `WidgetMeta` record per widget, in two layers so nothing is typed twice or drifts:

| Layer | Fields | Where |
|---|---|---|
| **Authored** (a person writes it) | `blurb` (one line, required), `tags` (topic words: clock, health, music…), `keywords` (search), `added` (date, filled once by `--assign` from git) | `src/widgets/meta.ts`, a lazy chunk like `blurbs.ts` (board blurbs already live there) |
| **Derived** (computed at build, never hand-edited) | `uid`, `slug`, `name`, `label`, `board`, `group`, `scope` (empty today), `grid`, `animated`, `interactive` and the control kinds, `hint` (the U2 verb), `live`, `media` (camera / mic), `dots` (visible count), `layers` (field kinds), `ir` (has a Field IR program), `version` (its golden hash), `aliases` | `scripts/widgets/meta.ts`, run by postbuild |

- **Outputs:**
  - `dist/widgets.json`: the full index (about 25 kB gz). It is fetched lazily by the widget page, search and the palette, and read by oEmbed, the registry and the MCP tools. It is never in first load.
  - On each widget page: title, description, canonical link, `og:*`, `<meta name="dot480:widget" content="<uid>" data-slug data-board>`, and schema.org JSON-LD (`CreativeWork`: name, description, identifier = uid, url, image, dateModified).
  - The registry items (§6) carry the same fields in `meta`, so `shadcn` users see them too.
- **Verify:** every preset has a `blurb`, and the derived layer builds without errors for all 173 widgets.

**URL scheme.** Short and plain, and it fits U3's canonical URLs: a path names a thing, and the query names a view or state.

| URL | Opens | Notes |
|---|---|---|
| `/widget/<slug>/` | **Widget page (canonical)** | Prebuilt `dist/widget/<slug>/index.html` with per-widget meta and OG. It needs its own namespace because `metro`, `ride` and `departures` are both board ids and card ids. |
| `/widget/<uid>/` | The same page | Prebuilt copy (so chat-app previews work), `rel=canonical` → the slug URL; the app keeps the uid form in the address bar |
| `/<uid>` | The same page (the shortest share link) | Also a prebuilt copy. Safe at the root because a uid can never be a board id (the pattern check) |
| `/widget/<old-slug>/` | The renamed widget | Via `cardAliases`, then `replaceState` to the current slug |
| `/widget/<key>/?skin=crt&t=12.5&d=progress:.8,mode:2` | Same widget in a given state | Every param is optional; see the state table below |
| `?card=<slug>` (any path) | Old link | Kept forever: `replaceState` to `/widget/<slug>/`, keeping the other params. The skins probe keeps working. |
| `/embed/<slug or uid>` | Bare card for iframes | A Vercel rewrite to `embed.html` (no files per card); §5.1 |
| `/r/<slug>.json`, `/r/registry.json` | shadcn registry | Static files; §6 |
| `/og/widget/<uid>.png`, `/oembed/<uid>.json` | OG image, oEmbed | Built at deploy, keyed by uid so a rename doesn't break cached previews |

- **Copy Link** copies the readable `/widget/<slug>/`; the More sheet adds **Copy short link** (`/<uid>`). Both open the same thing forever (decision 6).
- Static pages: three small HTML files per widget (slug, `widget/<uid>`, root `<uid>`), about 3 KB each, so 519 files in all. Postbuild writes them from one template.

**Extensible later (orgs, workspaces).** One route table, not ad-hoc parsing:
- `src/site/views.ts` gets a small ordered `routes` list, e.g. `{ path: 'widget/:key', view: 'widget' }`, and both `viewFromUrl` and `urlForView` read it. A new kind of page is one line.
- The grammar keeps one optional **scope** in front: `[/@<scope>]/widget/<slug or uid>/`. Today the scope is always empty (the site's own widgets). Later, `/@acme/widget/timer/` or `/@acme/w/<workspace>/widget/<key>/` can name an org's or workspace's widget without touching existing links.
- **Slugs are unique within a scope; uids are unique everywhere.** So `/<uid>` keeps working with no scope even when orgs exist, and two orgs can both have a `timer`. Internally a widget's full key is `<scope>/<slug>`, and its uid is the stable foreign key for storage, exports, analytics and the registry (`@dot480/<slug>` today, `@<scope>/<slug>` later).
- When widgets come from a database instead of `ids.json`, only the lookup behind the route changes; the URL forms above stay identical.

**Board context.** `/widget/<key>/` must not load all 25 board chunks the way `findPreset` does today.
- The prebuilt page carries the `dot480:widget` meta (uid, slug, board). The app reads it and loads only that board's chunk.
- If the meta tag is missing (an old `?card=` link, or a dev server), it falls back to a lazy `widgets-index` chunk (a postbuild-generated `{ uid, slug, board }` list, about 2 kB gz, never in first load), then to `findPreset`.

**State encoding.** It is query-string based, so links survive copy/paste and the prebuilt page and OG image still apply.

| Param | Meaning | Validation |
|---|---|---|
| `skin` | The existing display skin (`?skin=`) | `SKIN_NAMES` |
| `t` | Frozen board time in seconds (time machine), for animated cards | Finite, 0–86400, 2 dp |
| `d` | Data overrides `key:value,…` (numbers only, like `<dot-card data-*>`) | Keys must be in `defaults` or `controls`; ≤ 32 keys; clamped to control ranges; no eval |
| `theme` | `dot480` / `deerflowMosaic` (parity with `<dot-card theme>`) | Known presets only |

- On the card page, control edits and time scrubs update `d` and `t` with a debounced `replaceState`. Copy Link then always captures what you see.
- **Remixed cards** (not presets) are out of scope here. DOTS programs keep `?make=code&p=`. A later phase could carry a card spec v1 in `#s=<z…>` with the `share.ts` codec (hash, so a large spec never reaches a server log). `programHash` (FNV-1a) would give it an id.

## 4. The single-card page

### 4.1 Layout (a lazy `WidgetPage` view inside the SPA, under EXPLORE)
- **Top pill bar (navbar, §4.3):**
  - leading pill: `‹ MOSAIC` back to the board, scrolled to this card (the board label from `boardLabel`);
  - centre: the card name;
  - trailing pill: `← →` to the previous and next card on that board (also the arrow keys).
- **Stage:**
  - the card at 2× pitch (≈ 648 px), centred on `{colors.bg}`;
  - the card is live: controls, X-ray, time scrub.
- **Side rail on desktop, below the stage on mobile:**
  - the name and blurb;
  - grey chips: hint verb (U2), ANIMATED, LIVE DATA, CAMERA;
  - facts: grid, visible dots, renderer, layer kinds (from `describe()` and the X-ray SUMMARY);
  - "Seen on: <board>".
- **Bottom pill bar (§4.3):**

| In the pill bar | More ▾ (sheet) |
|---|---|
| **COPY PNG** · **COPY SVG** · **COPY LINK** · **SHARE** (only where `canShare` works) · **REMIX** · **ⓘ HOW** | Copy HTML (3 tabs: static SVG / iframe / `<dot-card>`) · Embed code + oEmbed note · Download PNG / SVG / GIF / WebM / MP4 (reuses `src/export`) · **Add via shadcn** (`npx shadcn add …` with a copy button, the `@dot480` namespace snippet, and Open in v0) · Card spec JSON (`presetToSpec`; says when layers were baked) |

- **The board card strip (U2) changes:**
  - LINK copies `/widget/<slug>/` instead of `?card=`;
  - the card name in the header links to the card page;
  - PNG stays a download (decision 4).

### 4.2 Mobile (≤ 760 px)
- The card is full width (pitch scales, never the grid).
- The bottom pill bar is one capsule: **SHARE** (or COPY LINK where share isn't available), **COPY PNG**, **REMIX** and **⋯** (a bottom sheet with everything else), above the home indicator (`env(safe-area-inset-bottom)`).
- Swiping left and right moves to the previous and next card. This uses a pointer-type check, so it doesn't fight the card's own drag controls: no swipe starts on a control hit box.
- Tap targets are ≥ 44 px on this page (fixing the skin segments' 20 px problem here at least).

### 4.3 Action pills (the "iOS view")
What the owner meant: the page's buttons look and sit like iOS 26 toolbars. Small, nothing more.
- **Floating capsules, inset from the edges** (12–16 px), over the page, not full-width bars:
  - **top (navbar):** leading `‹ BOARD`, trailing `← →`;
  - **bottom:** a leading group `COPY PNG · COPY SVG · COPY LINK` and a trailing group `SHARE · REMIX · ⓘ · ⋯`, each its own capsule (the "duo"). On a phone it becomes one capsule (§4.2).
- **Horizontal by default; vertical on wide screens.** At ≥ 1100 px the bottom groups can dock as one vertical capsule on the right edge beside the stage, so the card stays centred (decision 5). Same buttons, same order; only CSS changes.
- **Look:** grey chrome (`raised` fill, `line` border, `value` text), fully rounded, a light `backdrop-filter: blur()` where supported with a solid fallback. Glyph plus a short label; labels hide at ≤ 760 px but stay as `aria-label`. No accent red: the card keeps the only accent.
- **Behaviour:** the bottom capsule shrinks to icons while scrolling down and expands on scroll-up or focus (reduced motion: it never shrinks). Targets are ≥ 44 px on touch and ≥ 24 px with a mouse.
- **Reuse:** one small `PillBar` component (`role="toolbar"`, arrow keys move between buttons), usable later for the board card strip (U2) and MAKE.

### 4.4 A11y and OG
- `<h1>` holds the card name.
- The card body is `role="img"` with the `describe()` label (or `group` when it's interactive, as in U2).
- Each action button has a text label. Results go to the existing toast, which gets `role="status"`.
- Copy fallbacks are announced, for example "Copy isn't available here: downloaded instead".
- Reduced motion shows one still frame, and the pill bars don't animate.
- Nothing is hover-only.
- **OG and crawler pages:** postbuild writes, per card:
  - `dist/widget/<slug>/index.html`, with title `<Card name> · DOT/480`, a description from the blurb or `describe()`, a canonical link, and `og:image` = `/og/widget/<uid>.png` from the existing `ogImage(id)`;
  - the oEmbed discovery link.
- State params (`?skin`, `?t`, `?d`) share the default OG image, because static pages can't vary by query.

## 5. Export and share formats

All of this lives in `src/export/clipboard.ts` (pure helpers plus one DOM wrapper) and `src/export/snippets.ts` (pure string builders, testable in Node). Both are lazy and imported only by the card page and the strip actions.

| Action | Exact behaviour | Clipboard / API | Fallback | Size (estimate; measure in S2) |
|---|---|---|---|---|
| **Copy PNG** | Current frame (`t` from the time machine if frozen) at 2×, 14 px padding, on `{colors.bg}`, through `stillPNG` (U2) | `clipboard.write([new ClipboardItem({ 'image/png': pngPromise })])`, **called synchronously in the click**, so Safari works | No `ClipboardItem`, or rejected → download `<id>.png` + toast | ≈ 30–80 KB |
| **Copy SVG** | `renderSVG` of the current frame, with a `<title>` and a `<!-- dot480 card <id> · /widget/<slug>/ -->` comment | `{ 'text/plain': svg }`, plus `'image/svg+xml'` when `ClipboardItem.supports?.('image/svg+xml')` (Chrome 124+). Pasting the text into Figma gives vectors (unverified; check in S2). | `writeText(svg)` → download `<id>.svg` | ≈ 20–60 KB raw (39 B/dot), 5–12 KB gz |
| **Copy HTML** | Three tabs: **static** (inline SVG in a `<div style="background:#000">`, no JS, works in email); **iframe** (`<iframe src="…/embed/<id>" width height loading="lazy" title>`); **web component** (`<script type="module" src="…/dot-card.js">` + `<dot-card card="<id>">`, only if decision 3 hosts it) | `writeText(code)`, text/plain only (it's code, not rich paste) | A selectable `<textarea>` | Static ≈ SVG; iframe ≈ 200 B; element ≈ 250 B + 115 kB gz script |
| **Copy link** | Canonical `/widget/<slug>/` plus the state params (§3) | `writeText(url)` | A selectable input in the toast | (none) |
| **Share** | `navigator.share({ files: [png], title, text: url })`. The URL goes in `text` too, because some targets drop `url` when files are attached (unverified). | Shown only when `navigator.canShare?.({ files: [probe] })`; the PNG promise starts on pointerdown | `share({ title, url })` → hidden (Firefox desktop) | PNG as above |
| **Embed** | §5.1 | (none) | (none) | (none) |
| **Download clip** | Existing `recordClip` (APNG / GIF / WebM / MP4) for the 103 animated cards | (none) | WebM via MediaRecorder (existing) | GIF ≈ 32 KB / 2 s |
| **Add via shadcn** | Shows `npx shadcn@latest add https://dot-matrix1.vercel.app/r/<id>.json`, the `@dot480` registries snippet, and Open in v0 | `writeText` | (none) | (none) |

**Rules:**
- Live cards (14) copy what is on screen.
- **Camera cards (2) export the no-camera idle frame** unless the visitor confirms "include camera image", so a face never leaves by accident.
- **Lazy:**
  - the clipboard and snippet helpers, `WidgetPage`, `PillBar` and the registry panel are all `import()` chunks;
  - the board strip's eager code stays the U2 buttons.

### 5.1 Embed and oEmbed
- **`embed.html`** is a separate Vite entry, like `essay.html`.
  - It has no app shell. It mounts the card with `@dot480/core/card` `mountCard` (≈ 20 kB gz) and the card's board chunk.
  - It reads `skin`, `t`, `d` and `theme`. A tiny dot-text "DOT/480 ↗" link opens `/widget/<slug>/` in a new tab.
  - It has no copy buttons, so no `clipboard-write` permission is needed.
  - Budget: ≤ 40 kB gz plus the board chunk, checked by `size.ts --entry embed` (new flag).
- **`vercel.json`:**
  - rewrite `/embed/(.*)` → `/embed.html`;
  - exclude `embed/` from the main CSP rule's regex, and give `/embed/(.*)` its own CSP: the same directives plus **`frame-ancestors *`**;
  - optionally add `frame-ancestors 'self'` to every other page (decision 2);
  - verify with `curl -I` on a preview, rather than relying on header precedence.
- **oEmbed:** postbuild writes `dist/oembed/<uid>.json` with `{ version: "1.0", type: "rich", html: <iframe>, width, height, title, provider_name: "DOT/480", provider_url, thumbnail_url: og image }`, and the card page links to it.
  - `maxwidth` / `maxheight` are ignored (static file). The iframe is responsive (`width:100%; aspect-ratio`).
  - Notion needs Iframely to pick the domain up; it isn't guaranteed (decision 2).

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
- **Card pixels:** the widget page and its pill bars are HTML chrome. `pnpm golden --check` stays 173/173.
- **Budget:** first load stays ≤ 150 kB gz (142.9 today, and U2 / U3 take some of the rest). Everything in this plan is lazy. Run `size.ts --check`, `size.ts --board <b>` for card deep links, and the new `--entry embed` check.
- **One accent:** pill bars and actions are grey (`value` / `mid` / `faint`). Only the card's own `active` tone is red.
- **Engine framework-free:**
  - no change under `src/engine/` is required;
  - the bundlers and shadcn tooling live in `packages/scripts/` and run through `npx`, with no new dependency anywhere unless one is truly needed (and then app-level only).
- **Links never break:**
  - `?card=` redirects to `/widget/<slug>/`;
  - the `routes` table and the reserved `@` scope prefix keep later org / workspace URLs from colliding with today's;
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
| **S0 · Ids, metadata and URLs** | `scripts/widgets/ids.ts --assign` and `src/widgets/ids.json` (173 uids); `cardAliases`; authored `meta.ts` (blurbs for 173 widgets) and the derived `widgets.json`; the uid-pattern, reserved-segment and frozen-id verify checks; the `routes` table in `views.ts` resolving slug, uid and aliases; `?card=` → canonical; postbuild widget pages (3 per widget), JSON-LD, `og/widget/*.png` and `oembed/*.json`; build-time measurement | 1.5–2 days (the 173 blurbs are most of it) | U3 merged | `verify` (new `share:` checks), `postbuild.ts --no-og` then a timed full run, `skins-browser.ts` (uses `?card=`) |
| **S1 · Widget page + pill bars** | Lazy `WidgetPage`: top and bottom pill bars (`PillBar`), prev/next, stage, side rail, actions wired to the existing U2 actions; strip LINK → `/widget/<slug>/`; one capsule and a sheet on phones; vertical dock on wide screens; a11y | 2 days | U2 + S0 | `tsc`, oxlint, a new `scripts/site/widget-browser.ts` probe at 1440 and 375 (no console errors, keyboard path through both toolbars, `size.ts --board`) |
| **S2 · Copy and share** | `src/export/clipboard.ts` and `snippets.ts`; Copy PNG/SVG/HTML/link, Share, downloads; camera opt-in; measured sizes written back into §5 | 1–1.5 days | S1 | Node checks for the snippet builders and the `d` parser; CDP probe with clipboard permission granted (read back PNG, SVG and text); manual Safari / iOS / Firefox pass |
| **S3 · Embed** | `embed.html` entry, rewrite, per-route CSP with `frame-ancestors`, oEmbed discovery, `size.ts --entry embed` | 1–1.5 days | S0 | `curl -I` on a preview; the embed rendered inside a cross-origin test page; budget |
| **S4 · Registry v1** | Copy-in items (runtime, card wrapper, board libs, 173 cards); hosting at `/r/`; headers; schema and dependency checks; install smoke; widget page "Add via shadcn" panel | 2 days | None for packaging (can start now; it's in `packages/`). The panel needs S1. | `registry.ts --check`, the schema check, the bundle size check, the manual `shadcn add` smoke |
| **S5 · Docs and polish** | ABOUT › "Share & embed" (URL params, registry snippet); README deep links; `CHANGELOG.md` and `src/changelog.ts`; `PROGRESS.md` | ½ day | All | (none) |

- **Order:** S4 packaging can start now. Then S0 → S1 → S2 → S3 → S5, once U2 and U3 are on `main`, because they own `App.tsx`, `views.ts` and `DotWidget.tsx`.
- **Total:** about 9–10 days.
- **Every phase is its own PR.** Each one runs the full suite before merge: `pnpm check`, `pnpm golden --check`, a build, `size.ts --check`, and the mobile / C10 / skins probes.

## 9. Decisions for the owner
Decided 2026-10-26: the "iOS view" is pill-style action bars (§4.3), not widget sizes; links are `/widget/<key>/` with room for a scope, and the key can be the name (slug) or a short permanent id (uid), with metadata for every widget (§3).

1. **shadcn.** Copy-in bundles with no npm (recommended, and it respects "no publishing")? Or publish `@dot480/*` after all? And should it be listed in the shadcn directory? WEB-PLAN §5 said no listings.
2. **Embeds.** Allow anyone to iframe `/embed/*`, and lock every other page to `frame-ancestors 'self'`? Ask Iframely to allow the domain for Notion?
3. **Host `/dot-card.js`.** The `<dot-card>` standalone is 115 kB gz with every preset. Host it now, or wait for a per-board split?
4. **The strip's PNG button.** Keep it as a download (U2 as built), or make it copy to the clipboard, with download moving into More?
5. **Vertical dock.** On wide screens, dock the bottom pill group vertically on the right edge (proposed), or keep it horizontal everywhere?
6. **Canonical form.** Readable slug as canonical with the uid as the short link (proposed), or the uid everywhere?
7. **uid shape.** 8 characters of Crockford base-32 (proposed; ~10¹² values), or shorter (6 characters ≈ 10⁹, still plenty for a personal site, but less room if orgs come)?
