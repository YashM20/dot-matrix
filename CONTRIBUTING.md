# Contributing

Thanks for taking a look. Dot/480 is a personal website, so the scope is whatever the owner wants the site to be,
but bug reports, fixes and ideas are welcome. Open an issue first for anything bigger than a small fix, so we can
agree on the shape before you spend time on it.

Before you change code, read [AGENTS.md](AGENTS.md) (the rules that keep the project working) and
[DESIGN.md](DESIGN.md) (tokens, colors, type, components). The architecture is in
[docs/DOT-MATRIX-ENGINE-PLAN.md](docs/DOT-MATRIX-ENGINE-PLAN.md).

## Setup

You need Node 22 or newer (`.nvmrc` says 22) and pnpm 10.

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts Vite. Open the URL it prints. Board pages live at `/<board>/`.

## Testing

Run what your change touches while you work. The full suite is slow, so save it for the end.

While iterating:

- `npx tsc -b` for types.
- `npx oxlint <changed files>` for lint.
- The area's own script, `npx tsx scripts/<area>.ts`. Each script's header says what it checks.
- `pnpm golden --check` if card pixels could move.
- `npx vite build` and then `npx tsx scripts/site/size.ts --check` if you changed what the first page load imports.
- Only the browser probe for the area you touched.

Before you open a PR for a big or cross-cutting change, or after a change to the core (sampler, renderers, layout,
fields, `src/widgets/types.ts`, the manifest), run the full set: `pnpm check`, `pnpm golden --check`, the size check
after a build, and the browser probes.

### Goldens

Every card's dots are pinned by a hash in `goldens/<board>.json`. UI and chrome work must keep
`pnpm golden --check` at 0 changed. Run `pnpm golden` to regenerate only when you meant to change a card, and say
which cards changed and why in the PR.

### Browser probes

The probes (`scripts/*-browser.ts`, `scripts/site/mobile.ts` and others) drive headless Chrome. They look for Chrome,
Edge or Chromium in the usual install paths. If yours is somewhere else, point `CHROME` at it:

```sh
CHROME=/path/to/chrome npx tsx scripts/editor-browser.ts
```

Most probes print a skip line and exit when they find no browser.

## Rules worth knowing up front

- One accent color per board, `{colors.dotActive}`. See [DESIGN.md](DESIGN.md) and [AGENTS.md](AGENTS.md).
- Hand-written files aim for 300 lines or less and never pass 800. See [AGENTS.md](AGENTS.md); `scripts/site/file-size.ts` checks it.
- `src/engine/` stays framework-free with no npm dependencies.
- First-load JS stays at or under 150 kB gzipped. New views load lazily.

## Pull requests

- [ ] The PR says what changed, why, and how you tested it.
- [ ] Visual changes include screenshots.
- [ ] `npx tsc -b` and `npx oxlint` pass on the changed files.
- [ ] `pnpm golden --check` shows 0 changed, or the changed cards are listed and intended.
- [ ] `DESIGN.md` is updated in the same PR if you added or renamed a token.
- [ ] No new dependency under `src/engine/`.

## Security

Please don't open a public issue for a security problem. See [SECURITY.md](SECURITY.md), or report it privately
through [GitHub's private vulnerability reporting](https://github.com/YashM20/dot-matrix/security/advisories/new).

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

The project is under the [MIT License](LICENSE). By contributing, you agree that your contributions are licensed
under it too.
