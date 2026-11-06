# Use MATRIX components

MATRIX publishes its cards as a [shadcn registry](https://ui.shadcn.com/docs/registry) at `https://matrix.reactopia.me/r/<name>.json`.
Install them in any React project with the shadcn CLI. The code is copied into your project, so you own it.

It sits next to the reactopia registry (`https://yash.reactopia.me/r/<name>.json`) without conflicts:

- every item name starts with `matrix-`;
- files install under `lib/matrix/` and `components/matrix/` only, never over `lib/utils.ts` or `components/ui/`;
- no item ships `cn` or `utils`, adds npm packages, or edits your CSS, Tailwind config or theme;
- the only CSS classes are `matrix-*`, and the only CSS variables are `--matrix-*`. Tailwind is optional.

## Set up both registries
Add the namespaces to your `components.json`:

```json
{
  "registries": {
    "@reactopia": "https://yash.reactopia.me/r/{name}.json",
    "@matrix": "https://matrix.reactopia.me/r/{name}.json"
  }
}
```

Then install by name:

```sh
npx shadcn@latest add @matrix/matrix-home-clock
npx shadcn@latest add @matrix/matrix-ui-knob @matrix/matrix-dot-text @matrix/matrix-logo
npx shadcn@latest add @reactopia/theme-switcher
```

A full URL works without the namespace too: `npx shadcn@latest add https://matrix.reactopia.me/r/matrix-timer.json`.

## Use them

```tsx
import { MatrixHomeClock } from '@/components/matrix/matrix-home-clock'
import { MatrixKnob } from '@/components/matrix/matrix-ui-knob'
import { MatrixDotText } from '@/components/matrix/matrix-dot-text'
import { MatrixLogo } from '@/components/matrix/matrix-logo'

export function Panel() {
  return (
    <>
      <MatrixLogo size={32} />
      <MatrixHomeClock style={{ width: 320 }} />
      <MatrixKnob data={{ gain: 0.7 }} onInput={(patch, data) => console.log(patch, data)} />
      <MatrixDotText text="12:45" weight="bold" tone="active" pitch={6} />
    </>
  )
}
```

Every card takes the same props: `data` (merged over the card's defaults), `theme`, `renderer` (`auto`, `svg` or
`canvas`), `pitch` (dot spacing in px), `animated`, `reducedMotion`, `enter`, `onInput`, `className` and `style`. A card
fills the width you give it and keeps its aspect ratio. Interactive cards take pointer and keyboard input: Tab moves
between controls, the arrow keys change a value. Under reduced motion a card shows one still frame.

The components are client components (`'use client'`), so they work in the Next.js App Router as well as in Vite.

## Items

| Item | What |
|---|---|
| `matrix-core` | The engine subset and card runtime (`lib/matrix/`), and `<MatrixDotCard>` (`components/matrix/dot-card.tsx`). Every card installs it once. |
| `matrix-board-henry`, `-components`, `-audio`, `-heartbeat` | The card presets of one board (`lib/matrix/widgets/boards/`). Cards install the board they need. |
| `matrix-timer`, `matrix-home-clock`, `matrix-weather`, `matrix-music` | Widgets from the home board |
| `matrix-ui-segmented`, `-stepped-slider`, `-knob`, `-stepper`, `-check`, `-tabs`, `-progress`, `-loaders`, `-keypad`, `-text-field` | Interactive controls from the components board |
| `matrix-audio-levels`, `matrix-hb-agent` | An animated audio meter and the agent heartbeat |
| `matrix-dot-text` | `<MatrixDotText text>`: text in the 5×7 dot font, regular or bold, light or accent |
| `matrix-logo` | `<MatrixLogo size>`: the MATRIX mark as inline SVG. Recolour it with `--matrix-logo-on`, `--matrix-logo-off` and `--matrix-logo-accent`. |

The full index is at `https://matrix.reactopia.me/r/registry.json`.

## How it is built
`scripts/registry/generate.ts` writes `registry.json` (repo root) and the card wrappers in `registry/matrix/cards/`.
The lib items point at the files in `src/` as they are, each with a `target` under `lib/matrix/` that mirrors its
path, so the relative imports between engine files keep working and nothing is copied by hand. `pnpm build` runs
`pnpm registry:build` after the site build, which runs the pinned `shadcn build` into `dist/r/`. Nothing in `dist/r/`
is committed.

| Command | What |
|---|---|
| `pnpm registry:build` | Regenerate `registry.json` and build the items into `dist/r/` |
| `pnpm registry:check` | CI: `registry.json` is up to date, every item passes the shadcn schemas, names, paths, classes and variables are prefixed, lib files match `src/` |
| `pnpm registry:test` | Local only (slow): installs every item into a throwaway Vite + React + TS app, then typechecks and builds it. `--shot <png>` screenshots it. |

Commit `registry.json` after a change that moves an engine import: `pnpm registry:check` fails until you do.
Components import only from file names that are unique in the registry, because the shadcn CLI resolves `@/` imports
by file name. That is why `lib/matrix/widgets/mount.ts` re-exports the few types the components need.
