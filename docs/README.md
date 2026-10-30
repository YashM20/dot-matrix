# Docs index

Which doc to read for what, and how current each one is (checked 2026-10-29, after round 2: `main` at `bcacd5a`, PR #10 and #11). Files stay where they are, because code comments cite them by path.

**Start here:** `AGENTS.md` (invariants that must not break) → `DESIGN.md` (tokens, components, interaction) → `docs/PROGRESS.md` (what's done and what's next).

## Current: kept in sync with the code
| Doc | What it's for |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Non-negotiables: Field → Sampler → Renderer, one accent per board, quantized dots, a framework-free engine with no new deps |
| [`../DESIGN.md`](../DESIGN.md) | Design tokens, typography, components, interaction grammar, responsive rules, display skins, devices |
| [`../README.md`](../README.md) | What the site is, repo layout, scripts, deep links, writing a card |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Engineering history by date and PR. The visitor-facing notes are `src/changelog.ts` (LOG tab). |
| [`PROGRESS.md`](PROGRESS.md) | **Source of truth** for what is done, in progress, skipped and next, plus the "Resume here" notes for the next session |
| [`WEB-PLAN.md`](WEB-PLAN.md) | The active product plan: a personal website, with tracks C1–C10 |
| [`UX-PLAN.md`](UX-PLAN.md) | The active UX plan: low floor, high ceiling. Phases U0–U6 plus the build log (§9). U0–U4 and the U5 DISPLAY slice are built and merged (PR #6); the rest of U5, and U6, are planned. |
| [`SHARE-PLAN.md`](SHARE-PLAN.md) | S0–S1 and the S2 copy helpers built (2026-10-26) and merged (PR #7); the rest of S2, and S3–S5, planned: metadata, a slug and a short permanent id per widget, a page at `/widget/<slug or id>/`, copy as PNG / SVG / HTML, share and embed, iOS-style pill action bars, the shadcn registry. Phases S0–S5 and the open decisions. |
| [`LAYOUT-THEME-PLAN.md`](LAYOUT-THEME-PLAN.md) | T0–T6 built and merged (T0–T4 in the foundation round, PR #9; T3, T5 and T6 in round 2, PR #10). Planned 2026-10-27: our own dot-matrix design language (principles taken from vite.dev, not its look), layout and spacing fixes, and Tamagui-style themes: scheme (system / dark / light) × a changeable accent (7 presets incl. vite purple + custom hue, neutrals tinted toward it) that works in both; ideas from award-winning product sites. Phases T0–T6. |
| [`POLISH-PLAN.md`](POLISH-PLAN.md) | Planned (2026-10-28), not started; queued after round 2 (C1, the ⌘K theme rows, shipped with T5): an audit of the site (probe at 4 widths, screenshots) with findings on navigation (a direct `/essay/` route and a place for it in the header, footer, home and ⌘K), sticky header and footer, overflow, spacing tokens, wrapping and options to cut; phases P0 (probes) to P3, with file ownership per task and owner decisions. |
| [`LIVING-MATTER-PLAN.md`](LIVING-MATTER-PLAN.md) | F0 done (PR #9); L1 pond, Q1 squares and M1 materials built and merged in round 2 (PR #10); L2, Q2 and M2 in progress (round 3). Planned 2026-10-27: a living koi pond and ecosystems in glyph tiles (after daoho.dev), spaced and joined squares, physical-material cards (stone, glass, metal, fabric, thread). Overview, schedule, first-load ledger and owner decisions; the step-by-step track plans are in `living-matter/` (F0 foundation: done; L pond, Q squares, M materials: phase 1 built, each doc's status line lists its deviations; X advanced: planned). |
| [`EDITOR-PLAN.md`](EDITOR-PLAN.md) | The one MAKE editor (`src/components/editor/`): research, the document model, desktop and phone layouts, phases E0–E6. E0–E3 built and merged (E3 in round 2, PR #10); E5 (share) in progress (round 3); E4 and E6 planned. |
| [`DOT-MATRIX-ENGINE-PLAN.md`](DOT-MATRIX-ENGINE-PLAN.md) | Architecture: module map, pipeline, lattices and sites, subsystems |
| [`ALGORITHMS.md`](ALGORITHMS.md) | The niche algorithms (`src/engine/algo`, the `algorithms` board): weighted Voronoi stippling, strange-attractor density, Wave Function Collapse, DLA. Papers, pipeline mapping, parameters, cost. |
| [`LIFE.md`](LIFE.md) | Current for L1, L2 and L3. Living scenes (`src/engine/life`, the `pond` board): wave-equation water, dot micro-glyph tiles, koi spines, bodies and steering, the koi pond world. Modules, the body-style ruling, parameters and deviations from the L plan, checks. |
| [`STYLE-BIBLE.md`](STYLE-BIBLE.md) | Taste: what makes a card good, taken from the four liked cards |
| [`DEPLOY.md`](DEPLOY.md) | Vercel deploy, build outputs, headers, CSP, CI |
| [`MCP-APP.md`](MCP-APP.md) | The MCP app (agent heartbeat) and the authoring tools, for personal use |

## Reference: finished or superseded plans, still useful context
| Doc | Status |
|---|---|
| [`MASTER-PLAN.md`](MASTER-PLAN.md) | The v2 plan for phases P0–P6, all now built (see PROGRESS). Its gates (§2) and open decisions (§11) are still cited. |
| [`NEXT-PLAN.md`](NEXT-PLAN.md) | The post-P6 plan. §3 (launch, hosting, plugins) is superseded by WEB-PLAN; §1, §2, §4 and §6 still apply. |
| [`MOTION-INTERACTION-DEPTH.md`](MOTION-INTERACTION-DEPTH.md) | Motion, interaction and depth research (2026-10-14). It became phases P1–P3. |
| [`ADVANCED-PLAN.md`](ADVANCED-PLAN.md) | Audit and research snapshot (2026-10-14, 71 presets, 8 boards). Its numbers are historical. |
| [`MARKET-RESEARCH.md`](MARKET-RESEARCH.md) | Competitors and prior art. Reference only: there is no release or marketing. |

## Historical: snapshots from August 2026; don't trust them about today's code
| Doc | What it was |
|---|---|
| [`ADVERSARIAL-REVIEW.md`](ADVERSARIAL-REVIEW.md) | Review of the first build (2026-08-22) |
| [`VERIFICATION-16POINT.md`](VERIFICATION-16POINT.md) | 16-point verification of that review's fixes (2026-08-22) |
| [`BLOCK-INVENTORY.md`](BLOCK-INVENTORY.md) | Inventory of every widget type in the 7 original reference boards |
| [`HARNESS.md`](HARNESS.md) | The first visual-equivalence harness. Its commands are outdated: use `pnpm check`, `pnpm golden --check`, `pnpm snap` and `pnpm fidelity` (README › Scripts). |

The original specs are in `public/docs/` (`PRD.md`, `STEP-1-HANDOFF.md`, `STEP-2-HANDOFF.md`).

## Keeping this tidy
- When a phase lands, update `PROGRESS.md` and the plan's own status in the same commit. Add a `CHANGELOG.md` entry, and a `src/changelog.ts` entry if visitors would notice.
- When a plan is finished or replaced, give it a status line at the top and move its row here. Don't delete it: code comments cite these paths.
