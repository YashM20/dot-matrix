# Matrix

A website where every interface is drawn in dots: clocks, dashboards, games, photos and type, all rendered live on a dot grid.

**Live:** https://matrix.reactopia.me

This is a personal project. It's a website to look at and play with, not a package you install.

**Credit:** the project started from Henry Li's (`@henry19840301`) ESP-Mosaico concept screens for a 480 × 480 OLED device, posted on X on 20 Aug 2026 ([first post](https://x.com/henry19840301/status/2090273665669874050), [second post](https://x.com/henry19840301/status/2090454612126146948)). The first seven boards rebuild his sheets, and the 480 in Dot/480 comes from his device. Every other credit is in [docs/CREDITS.md](docs/CREDITS.md).

| | |
|---|---|
| ![The components board: buttons, sliders, knobs and tabs drawn in dots](docs/readme/components.png) | ![The dash board: car and EV instruments drawn in dots](docs/readme/dash.png) |
| ![The watch board: smartwatch faces drawn in dots](docs/readme/watch.png) | ![The pond board: koi and ripples in glyph tiles](docs/readme/pond.png) |

## What you can do there
- **Look through over 40 boards** of cards: UI kits, car instruments, watch faces, live weather and GitHub data, charts, physics toys, a synth, a game, camera halftone, simulations and GPU light.
- **See every card at once** on `/browse/`, filtered by board, tag or name.
- **Change the look** of everything at once: light or dark, seven accents or any hue, and display skins like CRT, VFD, LED, e-ink, flip-disc and Nixie.
- **Save any card** as PNG or SVG, copy a link to it, or open it on its own page.
- **Read how it works** in the blog: the essay "Ditherpunk for UI" and three tutorials with live cards and code.

## Run it locally
You need Node 22 and pnpm.

```bash
pnpm install
pnpm dev        # dev server at http://localhost:5173
pnpm check      # typecheck, lint and the acceptance checks
```

MAKE (the card editor), the Lab and X-ray are behind release flags and off by default. To turn them on in one browser, run `localStorage.setItem('dot480:flags', JSON.stringify({ make: true, lab: true, xray: true }))` in the DevTools console and reload. Flags are never read from the URL. The flag table is in [docs/DEPLOY.md](docs/DEPLOY.md).

Other useful scripts:

```bash
pnpm build                   # production build into dist/ (plus OG images and per-board pages)
pnpm golden --check          # every card still matches its pinned pixels in goldens/
pnpm snap --board components # a headless PNG of a board (or card ids) into .snapshots/
```

## How the engine works
Every card is a list of fields. A field is a function that says how bright each point is.
A grid sampler reads the fields onto a quantized grid of dots, and a renderer draws them with SVG, Canvas or WebGL2.
The engine (codename Dot/480) is plain TypeScript with no framework and no dependencies. Tokens and components are in [DESIGN.md](DESIGN.md), the modules and algorithms in [docs/DOT-MATRIX-ENGINE-PLAN.md](docs/DOT-MATRIX-ENGINE-PLAN.md).

## Links into the site
- `/<board>/` opens a board, for example `/light/` or `/components/`.
- `/widget/<card>/` opens one card on its own page.
- `/browse/` shows every card; `?in=<board>`, `?tag=<tag>` and `?q=<words>` filter it.
- `?about` opens ABOUT.
- `?skin=crt` picks a display skin, and `?pro=1` opens every fold.
- `?theme=light_cobalt` (or `?scheme=` and `?accent=`) shows a theme for the visit without saving it.

Old links keep working: renamed boards resolve through `boardAliases` in `src/widgets/manifest.ts`.

## Layout of the repo
| Path | What |
|---|---|
| `src/engine/` | The engine: fields, sampler, renderers, layout, motion, Field IR, light, simulations, halftone, display skins. No framework, no dependencies. |
| `src/widgets/` | The cards (`boards/<board>.ts`), the board manifest and the card descriptions |
| `src/components/` | The React app: boards, browse, the picker, the MAKE editor, the palette, the shell and the skins |
| `src/site/`, `src/data/`, `src/blog/`, `src/essay/` | Page meta and URLs, themes, live data sources, the blog and the essay |
| `api/` | Vercel Functions for likes (`docs/DEPLOY.md` › Likes) |
| `scripts/` | Checks, goldens, snapshots, the size budget, the post-build step and the headless browser probes |
| `packages/`, `registry/`, `mcp/`, `targets/` | Kept but not published: the core, element and React packages, a shadcn registry, an MCP app and device senders |

## Writing a card
```ts
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
export const myTimer: WidgetPreset = {
  id: 'my-timer', name: 'Timer', label: '01  TIMER', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { progress: .62 },
  layers: ({ data }) => [
    layer(T.dotRing(72, 78, 46, { spacing: 4, size: 2 }), 'idle'),
    layer(T.dotRing(72, 78, 46, { spacing: 4, size: 2, sweep: Math.PI * 2 * data.progress }), 'active'),
    layer(T.big('12:48', 72, 70, { lattice: 2, align: 'center' })),
  ],
}
```
Cards are 144×144 dots. Text goes through `T.text` or `T.big` so glyphs land on whole dots, bigger elements use a coarser `lattice`, and `'active'` is the one accent colour, used for one element per card. To add a board, add it to `src/widgets/manifest.ts` and `src/widgets/index.ts` and give it a description in `src/widgets/blurbs.ts`.

## Docs
- [DESIGN.md](DESIGN.md): tokens, colours, type and components.
- [docs/DOT-MATRIX-ENGINE-PLAN.md](docs/DOT-MATRIX-ENGINE-PLAN.md): the engine's modules and algorithms.
- [docs/README.md](docs/README.md): every other doc, and which ones are current.
- [CHANGELOG.md](CHANGELOG.md): the history.
- [AGENTS.md](AGENTS.md): notes for coding agents.

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up, test and send a change, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for the code of conduct.

## Security
To report a security problem, see [SECURITY.md](SECURITY.md).

## License
The code is under the MIT license: see [LICENSE](LICENSE). Parts that come from other projects keep their own licenses, listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
