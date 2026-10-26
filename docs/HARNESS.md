# Visual-Equivalence Harness — Minimal

> **Historical.** The commands below are outdated (npm, module counts). Use `pnpm check`, `pnpm golden --check`, `pnpm snap` and `pnpm fidelity`: see README › Scripts and `docs/README.md`.


## Automated
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

## Manual visual — Board vs `public/images/*` at density 4

Open `/` → BOARDS tab. For each board below, open the matching reference in `public/images/` side-by-side at 100% zoom. Density 4 is the reference pitch (`dot480.gridPx`).

### Henry (DOT/480 OLED) — `public/images/henry-example-interface-system.png`
- [ ] Clock card shows current time glyphs (re-renders on minute tick, not frozen at build)
- [ ] Album Art disc is dense (48×48, pitch 3) with visible spiral groove, not flat 4px
- [ ] Weather / Fitness / Messages cards match grey-scale tone bands (faint/mid/idle) at 5 quantize steps

### Deerflow 12 (3×4) — `public/images/HQL*.jpg` (any Deerflow 12 screenshot)
- [ ] Grid is exactly 3 cols × 4 rows (12 cards), gap = `var(--spacing-cardGap)` (18px)
- [ ] Dense cards (albumArt 48×48) appear smaller pitch than clock/timer (check inspector: 3px vs 5px)
- [ ] ≥3 cards visually compared to reference screenshot (e.g., deviceOverviewDonut, ecgMonitor, moistureLeafRings) — ring thickness and trace linewidth within 1 dot of reference
- [ ] Warm theme path: switch WORKSPACE → `DEERFLOW MOSAIC` then BOARDS — boards adopt same theme (single accent `{colors.dotActive}`)

### Mosaic / Metro / Ride — spot-check at least 1 board
- [ ] `deerflowMosaic` board title and dot color shift warm (dotIdle #9a958f vs #8A8F98) when theme toggled
- [ ] ≥3 additional cards vs any `public/images/HQ*.jpg` pass moiré/blur check (Bayer path uses `boxBlurField(lum,1)`; Floyd path sharp)
- [ ] Squircle: inspect `.dot-card` → `border-radius: calc(var(--card-corner-exp)*4px)` with `:root --card-corner-exp:4` (16px); not hard-coded `16px`

### Fail = block
Typecheck failure, build failure, or any checklist box unchecked blocks merge. No screenshot diff tool required — human side-by-side at density 4 is the harness.
