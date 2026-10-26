# Dot/480: a field-based dot-matrix UI engine

**Live:** https://dot-matrix1.vercel.app. This is a personal project: a website, not a package. Anyone curious is welcome to poke around.

Every visual is `Layer[]` (a `Field(u,v) → [0,1]` plus a colour tone) → grid sampler → SVG, Canvas or WebGL2. Nothing is hand-drawn: clocks, photos, games, light, fluids and type are all fields sampled onto a quantized dot grid, with one accent colour per board.

## What's on the site
- **Boards:** 25 boards and 173 cards, grouped in the picker:
  - **START HERE**, a short tour;
  - **INTERFACES**, UI kits;
  - **DATA**, live weather, transit and agent state;
  - **PLAY**: physics, a synth, the HIVE game, camera halftone, a portrait that heals;
  - **ENGINE**: Field IR programs, simulations, raster light, half a million GPU dots, variable dot type.
- **Three places:**
  - EXPLORE: the boards;
  - MAKE, with four modes: TUNE (tune one preset and export it), COMPOSE (layer and animate a card), CODE (a Field IR editor with shareable links) and DRAW (paint dots). Each starts simple, with the rest in MORE folds; `?pro=1` opens them all;
  - ABOUT: what this is, keys and link options, and the changelog.
- **Explore any card:**
  - hover or focus a card (tap `⋯` on a phone) for **ⓘ / REMIX / LINK / PNG**;
  - **X-RAY** shows the field, layers and spec behind a card, starting with a plain-words SUMMARY;
  - **TIME** freezes and scrubs the clock;
  - **⌘K** opens a palette and **`** a dot shell;
  - the **DISPLAY ▾** menu re-renders everything as CRT, VFD, LED, e-ink, flip-disc or Nixie.
- **Essay:** "Ditherpunk for UI" at `/essay.html`, a hands-on tour of how the dots are made.

## Layout of the repo
| Path | What |
|---|---|
| `src/engine/` | The engine: plain TypeScript and browser Canvas/SVG/WebGL APIs, with no framework and no dependencies. Fields, sampler, renderers, layout, motion, interaction, Field IR, raster/light, sim, physics, NCA, halftone, display skins, devices. Module map: `docs/DOT-MATRIX-ENGINE-PLAN.md`. |
| `src/widgets/` | Cards (`boards/<board>.ts`), the board manifest (lazy chunks, picker groups and labels), descriptions (`blurbs.ts`) |
| `src/components/` | The React app: `DotCanvas`, `DotWidget`, `Board`, `BoardPicker`, playground, studio, dwitter (DOTS), draw, palette, X-ray, skins, game |
| `src/audio`, `src/data`, `src/media`, `src/vision`, `src/game`, `src/export`, `src/spec`, `src/essay`, `src/site` | Sound, live data sources, camera/hand input, the game, exports, card spec v1, the essay entry, page meta and URLs |
| `scripts/` | Verify, goldens, snapshots, fidelity, bench, the size budget, site post-build (OG images, crawler pages), headless-Chrome probes (`*-browser.ts`, `site/mobile.ts`) |
| `packages/`, `registry/`, `mcp/`, `targets/`, `examples/`, `schema/` | Kept but not published: core/element/react packages, shadcn registry, MCP app and authoring tools, device senders (WLED, AWTRIX, TRMNL, Tronbyt, the ESP32 bytecode VM), examples, the card spec JSON schema |

## Scripts
```bash
pnpm dev                     # Vite dev server
pnpm build                   # tsc -b && vite build (+ OG images and per-board pages; SITE_POSTBUILD=0 skips)
pnpm check                   # typecheck + oxlint + verify (acceptance checks)
pnpm golden --check          # every preset matches goldens/hashes.json
pnpm snap --board henry3     # headless PNG of a board (or card ids, or --all) into .snapshots/
npx tsx scripts/site/size.ts --check   # first-load JS budget: ≤ 150 kB gz
```
Browser probes run against a dev or preview server, e.g. `npx tsx scripts/c10-browser.ts http://localhost:5173/`. See each script's header.

## Links into the site
- `/<board>/`, for example `/light/`, opens a board.
- `?make=tune|compose|code|draw` opens MAKE in that mode; `?about` opens ABOUT.
- `?card=<id>` renders one card alone.
- `?make=code&p=…` opens a shared CODE program.
- `?skin=crt` picks a display skin; `?pro=1` opens every fold.

The address bar follows what you open, and Back and Forward work. Every old link still resolves (`?tab=…`, `?board=…`, the renamed `/glyph/` board) through the alias table in `src/site/views.ts`.

## Writing a card
```ts
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
export const myTimer: WidgetPreset = {
  id: 'my-timer', name: 'Timer', label: '01  TIMER', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { progress: .62 },                                   // → data sliders in WORKSPACE
  layers: ({ data }) => [
    layer(T.dotRing(72, 78, 46, { spacing: 4, size: 2 }), 'idle'),  // track: dots placed along the ring
    layer(T.dotRing(72, 78, 46, { spacing: 4, size: 2, sweep: Math.PI * 2 * data.progress }), 'active'),
    layer(T.big('12:48', 72, 70, { lattice: 2, align: 'center' })),  // hero text on a 2× lattice
  ],
}
```
Cards are 144×144 dots (`TILE`).
- Text goes through `T.text` / `T.big`, so glyph pixels land on whole dots.
- Bigger elements use a coarser `lattice` or dot `sites`, never clusters of small dots.
- `'active'` is the single accent. Use it for one element per card.

To add a board:
1. add an entry in `src/widgets/manifest.ts`, in both `boardManifest` and `boardGroups`;
2. add its contents in `src/widgets/index.ts`;
3. add a description in `src/widgets/blurbs.ts`.

`tsc` and `pnpm check` catch anything you miss.

## Docs
Start with **`AGENTS.md`** (invariants) and **`DESIGN.md`** (tokens, components, interaction). `docs/README.md` lists every doc and says which ones are current.
- `docs/PROGRESS.md` is the source of truth for what's done.
- `docs/WEB-PLAN.md` and `docs/UX-PLAN.md` are the active plans.
- `CHANGELOG.md` is the engineering history.

## Deploy
Vercel builds every push: `main` goes to production, and each branch or PR gets a preview. Config is in `vercel.json`, details in `docs/DEPLOY.md`.
