# Visual-Equivalence Harness — Minimal

## Today's harness (updated 2026-11-06)
- **Quick tier, while building:** `pnpm exec tsc -b`, `pnpm exec oxlint <changed files>`, the area's own script (`scripts/<area>.ts`), and `pnpm golden --check` when card pixels could move. Wall-clock checks only warn unless `DOT_TIMING=strict` (`scripts/lib/check.ts`). The tiers are in `docs/CHECKPOINTS.md`.
- **`pnpm check`** is `pnpm check:static` (tsc, oxlint, file size, credits, favicon, headers, URLs, prose lint, analytics) and then `pnpm verify`.
- **CI** (`.github/workflows/ci.yml`, #199) runs once per push as four parallel jobs: typecheck + lint, verify, build + site checks (`vite build`, size, theme, headers, SEO, `golden --check`) and mcp. The `check + build` job passes only when all four pass, and the `main` ruleset requires it by that name. Push to green takes about 2.5 minutes. The perf report (on `main` only) and React Doctor (#210) run beside the gate as reports. Details: `docs/DEPLOY.md` › CI.
- **Browser probes** run in the `probes` workflow (below) or locally, one at a time: `scripts/*-browser.ts` and `scripts/site/*-browser.ts`. The site's own are `browse-browser.ts` (the `/browse/` page, #205), `chunks-browser.ts` (a missing board chunk after a deploy, #211), `csp-browser.ts` (CSP and Trusted Types on every page), `analytics-browser.ts`, `layout.ts`, `mobile.ts`, `theme-boot.ts`, `theme-picker.ts` and `a11y.ts` (`pnpm a11y`, axe-core). `launch(w, h, { flags })` in `scripts/lib/cdp.ts` seeds release flags through `localStorage`; the URL never sets them.
- **Pixels:** `pnpm golden --check` against `goldens/<board>.json`, `pnpm snap` for PNGs, `pnpm fidelity` for the reference gates.

## Probes in CI
`.github/workflows/probes.yml` runs the browser probes and screenshots on GitHub's runners, so nobody queues for the laptop. One job builds `dist/`; the probe shards and the screenshot job reuse it. It is a report: it is not part of the `check + build` gate.
- **On a pull request** that touches `src/`, `scripts/`, `public/`, `index.html` or `vite.config.ts`, it runs the probes the PR's changes reach, plus the smoke set (`chunks`, `a11y`, `theme-boot`), and captures a default set of screenshots: home, `/browse/` and `/widget/timer/` at 1280 and 390, in both schemes. The build job log and the run summary list the picked probes and the file behind each.
- **Which probes:** `scripts/ci/affected.ts` maps path globs to probes for `git diff --name-only <base>...HEAD`. A probe's own script picks that probe. Shared code (`src/engine/`, `src/hooks/`, `src/widgets/types*` and `manifest*`, `DotCanvas`, `DotWidget`, `scripts/lib/`, `scripts/ci/`, `vite.config.ts`, `index.html`, `package.json`, the lockfile, this workflow) runs every probe, and so does any path with no row. Try a table change with `pnpm exec tsx scripts/ci/affected.ts --files <path,path>`.
- **Every probe** runs on a push to `main`, on a dispatch with `probes=all`, and on a PR with the `full-probes` label (adding the label starts the run).
- **The table** of probes is `scripts/ci/probe-list.ts` (`scripts/ci/probes.ts --list` prints it). Add a new probe there, with its usual seconds, and give it a row in `affected.ts`. A full run uses each probe's `shard`; each shard's run prints a timing table in the job summary, so move probes between shards when one runs long. A partial run packs the picked probes into as few shards as their seconds allow: three short probes share one runner.
- **Lighthouse** (`scripts/ci/lighthouse.ts`, the `lighthouse` job): the one way Lighthouse runs here, also used by the SEO audit below. The PageSpeed Insights engine, with no API key, on the SEO routes (home, `/browse/`, three boards, two widget pages, the blog, two posts, `/about/`, `/privacy`, `/terms`), mobile and desktop. A build is served the way Vercel serves it (`scripts/site/serve.ts`: `vercel.json` redirects and headers, compression, real 404s). It writes the Performance, Accessibility, SEO and Best practices scores, LCP, CLS, TBT and every audit that lost points to the run summary and the `lighthouse-<target>` artifact. It runs on this build for every run: the full set on a push to `main` and on a dispatch, and on a PR push only `/`, `/henry/` and `/mosaic/` on mobile, once each, with a 90 s limit per audit; a dispatch with `-f lighthouse=live` (or `both`) audits the production site instead. To measure a perf change, aim it: `-f lighthouse_routes=/,/mosaic/ -f lighthouse_runs=3` audits only those routes, three times each, reports the run with the median TBT (every run's TBT in brackets) and keeps the traces in the artifact for the Performance panel. A report: runner timings are noisy. `scripts/site/perf-check.ts` in CI pins what it found, without a browser.
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
  `probes=all` runs every probe, `probes=none` only the screenshots; an empty `shots` skips the screenshot job. In Git Bash on Windows, prefix the command with `MSYS_NO_PATHCONV=1` (or drop the leading `/` of each route): Git Bash rewrites `/browse/` into a Windows path.

## Goldens in CI
Regenerate `goldens/<board>.json` on a runner instead of a laptop, after an intended card change:
```bash
gh workflow run goldens -f branch=<branch>
```
The `goldens` workflow runs `pnpm golden` on that branch and commits the changed files back as `Regenerate goldens`, only when one changed. It refuses `main` and does nothing in a fork. A push made by the workflow starts no pull_request run, so the workflow dispatches CI on the branch to give the new head its `check + build` result. Merge the new commit before you push again: `git pull` on the branch.

## SEO audit
An on-demand audit with free tools, on a runner (`.github/workflows/seo-audit.yml`):
```bash
gh workflow run seo-audit --ref <branch> [-f live=true]
```
It builds the branch and serves `dist/` with `vercel.json`'s redirects, rewrites, headers and 404 page (`scripts/site/serve.ts`, so a broken link gets a real 404 instead of the home page). Then it runs Lighthouse through the same `scripts/ci/lighthouse.ts` as the probes job, the W3C Nu checker on the built pages, and lychee on every link of every sitemap page. `live=true` adds Lighthouse on the production site. The run summary has the tables (`lighthouse.ts` and `scripts/site/seo-audit.ts`) and the raw reports are the `seo-audit` artifact. It is a report, not a gate: `scripts/site/seo-check.ts` in CI holds the fixes in place.

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
