# Visual-Equivalence Harness — Minimal

## Today's harness (updated 2026-11-06)
- **Quick tier, while building:** `pnpm exec tsc -b`, `pnpm exec oxlint <changed files>`, the area's own script (`scripts/<area>.ts`), and `pnpm golden --check` when card pixels could move. Wall-clock checks only warn unless `DOT_TIMING=strict` (`scripts/lib/check.ts`). The tiers are in `docs/CHECKPOINTS.md`.
- **`pnpm check`** is `pnpm check:static` (tsc, oxlint, file size, credits, favicon, headers, URLs, prose lint, analytics) and then `pnpm verify`.
- **CI** (`.github/workflows/ci.yml`, #199) runs once per push as four parallel jobs: typecheck + lint, verify, build + site checks (`vite build`, size, theme, headers, SEO, `golden --check`) and mcp. The `check + build` job passes only when all four pass, and the `main` ruleset requires it by that name. Push to green takes about 2.5 minutes. The perf report (on `main` only) and React Doctor (#210) run beside the gate as reports. Details: `docs/DEPLOY.md` › CI.
- **Browser probes** run in the `probes` workflow (below) or locally, one at a time: `scripts/*-browser.ts` and `scripts/site/*-browser.ts`. The site's own are `browse-browser.ts` (the `/browse/` page, #205), `chunks-browser.ts` (a missing board chunk after a deploy, #211), `csp-browser.ts` (CSP and Trusted Types on every page), `analytics-browser.ts`, `layout.ts`, `mobile.ts`, `theme-boot.ts`, `theme-picker.ts` and `a11y.ts` (`pnpm a11y`, axe-core). `launch(w, h, { flags })` in `scripts/lib/cdp.ts` seeds release flags through `localStorage`; the URL never sets them.
- **Pixels:** `pnpm golden --check` against `goldens/<board>.json`, `pnpm snap` for PNGs, `pnpm fidelity` for the reference gates.

## Probes in CI
`.github/workflows/probes.yml` runs the browser probes and screenshots on GitHub's runners, so nobody queues for the laptop. One job builds `dist/`; the probe shards and the screenshot job reuse it. It is a report: it is not part of the `check + build` gate.
- **On a pull request** that touches `src/`, `scripts/`, `public/`, `index.html` or `vite.config.ts`, it runs every probe and captures a default set: home, `/browse/` and `/widget/timer/` at 1280 and 390, in both schemes.
- **The table** of probes and shards is `scripts/ci/probes.ts` (`--list` prints it). Add a new probe there. Each shard's run prints a timing table in the job summary; move probes between shards when one shard runs long.
- **Screenshots** are `route@width[@theme]` items for `scripts/ci/shots.ts`: widths up to 600 are a phone; theme is `dark`, `light` or a full name like `light_cobalt`.
- **On demand**, for agents. `gh run watch` is not allowed: list the runs and check back.
  ```bash
  git push
  gh workflow run probes --ref <branch> -f probes=browse -f shots=/browse/@1280,/@390@light
  gh run list --workflow probes --branch <branch> --limit 3   # status, conclusion and the run id
  gh run download <id> -n screenshots -D <dir>                # PNGs, once the run is done
  gh run download <id> -n probe-captures-3 -D <dir>           # a shard's own .snapshots/, to see a failure
  gh run view <id> --log-failed                               # the failing probe's output
  ```
  `probes=all` runs every probe, `probes=none` only the screenshots; an empty `shots` skips the screenshot job.

## The first harness (historical, 2026-08)
> The commands below are outdated (npm, module counts). Use the section above.


### Automated
```bash
npx tsc -b              # 0 errors required
npm run build           # vite build must succeed, ~103 modules, ~230KB
npx tsx scripts/verify.ts
# or Node 22+: node --experimental-strip-types scripts/verify.ts
```
`scripts/verify.ts` checks:
- `quantize` ladder (5 steps → 0 / 0.25 / 0.5 / 0.75 / 1, clip, steps<2 bypass)
- Poisson-disc `poissonDiscPoints(100,100,12,seed)` minDistance ≥12 and deterministic + `scatterField` near/far
- `sumOfSinesAmplitudes` vs `ecgAmplitudes` bounds, motion with `t`, variance separation, `traceField`/`amplitudeField` thin vs bar

### Manual visual — Board vs `public/images/*` at density 4

Open `/` → BOARDS tab. For each board below, open the matching reference in `public/images/` side-by-side at 100% zoom. Density 4 is the reference pitch (`dot480.gridPx`).

#### Henry (DOT/480 OLED) — `public/images/henry-example-interface-system.png`
- [ ] Clock card shows current time glyphs (re-renders on minute tick, not frozen at build)
- [ ] Album Art disc is dense (48×48, pitch 3) with visible spiral groove, not flat 4px
- [ ] Weather / Fitness / Messages cards match grey-scale tone bands (faint/mid/idle) at 5 quantize steps

#### Deerflow 12 (3×4) — `public/images/HQL*.jpg` (any Deerflow 12 screenshot)
- [ ] Grid is exactly 3 cols × 4 rows (12 cards), gap = `var(--spacing-cardGap)` (18px)
- [ ] Dense cards (albumArt 48×48) appear smaller pitch than clock/timer (check inspector: 3px vs 5px)
- [ ] ≥3 cards visually compared to reference screenshot (e.g., deviceOverviewDonut, ecgMonitor, moistureLeafRings) — ring thickness and trace linewidth within 1 dot of reference
- [ ] Warm theme path: switch WORKSPACE → `DEERFLOW MOSAIC` then BOARDS — boards adopt same theme (single accent `{colors.dotActive}`)

#### Mosaic / Metro / Ride — spot-check at least 1 board
- [ ] `deerflowMosaic` board title and dot color shift warm (dotIdle #9a958f vs #8A8F98) when theme toggled
- [ ] ≥3 additional cards vs any `public/images/HQ*.jpg` pass moiré/blur check (Bayer path uses `boxBlurField(lum,1)`; Floyd path sharp)
- [ ] Squircle: inspect `.dot-card` → `border-radius: calc(var(--card-corner-exp)*4px)` with `:root --card-corner-exp:4` (16px); not hard-coded `16px`

#### Fail = block
Typecheck failure, build failure, or any checklist box unchecked blocks merge. No screenshot diff tool required — human side-by-side at density 4 is the harness.
