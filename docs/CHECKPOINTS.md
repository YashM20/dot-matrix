# CHECKPOINTS: how work moves forward

One checkpoint at a time. A checkpoint is a GitHub milestone with a fixed list of issues and one tracking issue that orders them. We build toward it, publish it, take a breather, and only then start the next one. No loops, and no new work in the middle.

GitHub is the source of truth: the milestones, the labels, the tracking issue and the issue comments. This file holds the process and the plan; the live order of work is the tracking issue.

## The cycle
1. **Scope.** The milestone's issues are the whole job. A new idea or request that comes up mid-checkpoint becomes an issue in a later milestone or in Backlog. It does not join the current one unless the owner says so.
2. **Build.** Four to six lanes at once, one agent per line of the tracking issue, each working only on issues in this milestone. Each lane opens its own PR to `main`. It merges once `check + build` is green, and once the owner has OK'd the before and after shots for anything visitors can see.
   - **Changelog fragment.** Each PR adds one `changes/<branch>.md` (or `changes/<pr>.md`) with a `visitor:` line (one plain sentence for the LOG tab, or `none`) and an `engineering:` line (one sentence with the issue and PR numbers). Lanes don't edit `CHANGELOG.md` or `src/changelog.ts`. `scripts/site/changes.ts` in `pnpm check` warns when a PR changes `src/` without one. Format: `changes/README.md`.
3. **Gate.** One full CI run with every browser probe on the last PR of the checkpoint (label the PR `full-probes`). Goldens change only where a lane meant to change them, and first load stays at or under 150 kB gz.
   - `pnpm check` (and so CI) runs `scripts/site/prose-lint.ts` on visitor prose (`docs/WRITING.md`): 0 errors before publish. Read its warnings at the gate.
4. **Publish.**
   - Turn the shipped `upcoming` rows into a released version in `src/changelog.ts` and `CHANGELOG.md`.
   - Fold the fragments in `changes/` into that version: the engineering lines into `CHANGELOG.md`, the visitor lines that aren't `none` into `src/changelog.ts`. Delete the fragments in the same PR and keep `changes/README.md`.
   - Close the milestone's issues, the tracking issue and the milestone itself.
5. **Breather (mandatory, nothing new starts):**
   - **Clean up:** remove finished worktrees (junction-safe), scratch dirs and merged branches.
   - **Docs:** `docs/PROGRESS.md` (trim the run state to the next checkpoint), `docs/README.md` statuses, and the plan docs' status blocks.
   - **Issues:**
     - Every closed issue is really done, with the PR that did it.
     - Open issues are still accurate. Triage them against `main` and say what's left in a comment.
     - Follow-ups found during the checkpoint are filed in the right milestone.
     - Decisions are recorded on the issue they affect, and on #12 if they shape planned work.
   - **Owner review:** a taste pass on what shipped.
6. **Pick the next checkpoint.** The owner confirms it, and its tracking issue becomes the queue.

## Labels
- **Priority:** every open issue has exactly one. `priority: high` is the current checkpoint's close list. `priority: medium` is planned: the next checkpoints, and Backlog items picked at the next breather. `priority: low` is nice to have.
- **Area:** at least one `area:` label. Board and card work is `area: cards`; site chrome is `area: site-ux`.
- **Status:** `status: in progress` only while a lane has a PR open. `status: blocked` names the blocking issue in a comment. `status: needs decision` only where the owner must choose, with the choice stated in one line. Small look and consistency calls don't need the owner: decide them with the COMPONENTS board as the reference and record them on the issue.

## Speed rules
**Big, few checkpoints.** Batch related work into one milestone, and publish it about once per round, not per feature.

**No local builds.** The coordinator's machine has 2 cores. Agents run quick checks locally and push; CI runs the builds, goldens, probes and screenshots (`docs/HARNESS.md`).

**Frame budgets wait (owner, 2026-11-01): functionality first.** `pnpm verify` and every area script (`pnpm exec tsx scripts/<area>.ts`) report wall-clock checks (a `≤ N ms` limit, or a `budget` measured in ms, × load or fastest-of-N) as warnings. Step, flicker and size budgets are correctness checks and always fail. Only `DOT_TIMING=strict` enforces them. The rule lives in one place, `scripts/lib/check.ts`. From CP6 on, the board budget is read on the buffer path the site draws (#339).

**Two test tiers:**

| Tier | When | What |
|---|---|---|
| Quick (agents, local) | while building | `pnpm exec tsc -b`, `pnpm exec oxlint <changed>`, small Node scripts (the area script where it is pure Node). **No** builds, goldens, browser probes or screenshots. |
| CI (every PR push) | on push | `check + build` (`pnpm check`, the build, size, header, SEO and theme checks, `pnpm golden --check`), plus the browser probes the change affects (`scripts/ci/affected.ts`). Goldens for an intended card change: `gh workflow run goldens -f branch=<branch>`. |
| Gate (once per checkpoint) | the last PR | every probe (`full-probes`), screenshots for the owner, then publish. |

**Shared and lean:**
- Agent reports stay under 400 words: what was built, the choices made, what was skipped, and the PR line.
- Merging append-only registry files (`ids.json`, `catalog.ts`, `manifest.ts`, DESIGN tables) uses a union merge, not hand edits.
- Goldens are one file per board (`goldens/<board>.json`), so a board lane touches only its own file. When two branches change the same board's file, merge the code and regenerate; don't merge the hashes by hand.

## Checkpoints

| # | Milestone | Ships | Status |
|---|---|---|---|
| CP1 | `CP1 · 0.13 · Round 3 to main` | Round 3: editor share and phone polish, squares Q2 and Q3, glass and water, workshop, pond polish and depth, 0.12 release notes | **published** 2026-11-01 (PR #78); closed |
| CP2 | `CP2 · 0.14 · Foundations and fixes` | IQ1 to IQ4, the tixy adapter and card credits (#53), the test tiers (#75), the blog, the lab, goldens per board and the file-size rule | **published** by 2026-11-03 (`CHANGELOG.md` 0.14); closed |
| CP3 | `CP3 · 0.15 · Kits and new boards` | the car dash, faces, kinetic type, micro motion, charts and watch faces (#125 to #129, #132), the IQ card sets, the P0 probes and token sweep | **published** 2026-11-02 to 11-04 (`CHANGELOG.md` 0.15); closed |
| CP4 | `CP4 · 0.16 · Flags, SEO, analytics, shell and security` | feature flags and X-ray off, SEO, analytics, the shell, likes (#169, #176), security fixes | **published** 2026-11-04 (`CHANGELOG.md` 0.16); closed 2026-11-16 |
| CP5 | `CP5 · 0.17 · UI hill climb` | UI polish before new features (#178 to #188, tracker #189), CI, flags from localStorage only, the SEO checkup | **published**; closed 2026-11-16. #186 waits in Backlog for MAKE |
| CP6 | `CP6 · 0.18 · Stabilise` | bugs, flaky gates, accessibility, the design system audit (#361), card cuts and the first board refines | **published** 2026-11-16 (PR #417, `CHANGELOG.md` 0.18); closed 2026-11-16 |
| CP7 | `CP7 · 0.19 · Board refinement` | the remaining #221 cuts, then twenty boards brought up to the bar | **published** 2026-11-24 (PR #448, `CHANGELOG.md` 0.19); the milestone closes after the breather |
| CP8 | `CP8 · 0.20 · Play, live data and guides` | games, a live world board, a wallpaper maker, the guides on the blog, and the chrome they need | **next**; queue #402 |
| later | Backlog | picked at a breather, highest priority first | waiting |

### CP6 · 0.18 · Stabilise (published 2026-11-16, PR #417)
- **Goal:** fix what exists before building anything new: bugs, flaky checks, accessibility, the design system audit, and the cards below the bar.
- **Close list:** #28 flaky gates, #43 home hero and focus order, #355 type rhythm tokens, #393 POND focus rings, #261 COMPONENTS status dot labels, #341 desktop press, #339 buffer-path bench, #340 SQUARES frame cost, #103 goldens index, #361 (design system tracker), #379 branches at the breather.
- **Exit criterion:** every issue in the milestone is closed, CI is green with every probe, goldens changed only on purpose, first load at or under 150 kB gz, and 0.18 is published.

### CP7 · 0.19 · Board refinement (published 2026-11-24, PR #448)
- **Goal:** every board that stays meets the bar of `level-03`, the afterlight face, MOSAIC and COMPONENTS. No new boards or features.
- **Issues:** #221 first (the owner's remaining cuts), then HEAL #244, MIRROR #242, MICRO MOTION #238, DEPARTURES #228, LEVELS #233, SCOPE #240, FRACTALS #248, CINEMA #245, 500K DOTS #241, MOSAIC #253, RIDE #258 and POND #246, with #225 as the tracker.
- **Exit criterion:** every CP7 issue is closed, removed cards keep their links, each lane changes only its own board's goldens and on purpose, the owner has OK'd the shots, CI is green, and 0.19 is published.
- **Joined during CP7:** LIGHT #236, KINETIC TYPE #252, SCENES #254 and FACES #255 once the #221 picks unblocked them, PROGRAMS #227, PHYSICS #235, MICRO UI #247 and LOCK #260 from Backlog, and #408, #412, #413 and #416. All of them shipped in 0.19.

### CP8 · 0.20 · Play, live data and guides
- **Goal:** new things to do on the site, built to the same bar: original games, a live world board, a wallpaper maker, and the guides published on the blog. The chrome those pages lean on comes first.
- **Issues:** site first: #38 Back and scroll, #40 the blog and legal bar, #34 the theme control in it, #39 footer and board end, #41 wayfinding and cuts, #44 desktop hit targets. Then #131 three games, #311 the hill-driving game, #130 the world board, #133 the wallpaper maker and #77 the guides.
- **Exit criterion:** every CP8 issue is closed, games and the world board work with mouse, touch and keyboard and respect reduced motion, the world board has loading, cached and offline states with goldens on fixed data, the guides are live, first load is at or under 150 kB gz with every new view lazy, CI is green, and 0.20 is published.

### Parked theme milestones
Two milestones hold future bodies of work that no checkpoint has picked yet. The owner reopened both on Nov 16.
- **Tixy gallery:** #51, #52, #54 to #58 and #60. The ports wait on the permission request in #52.
- **Next phases:** editor and advanced work: #71, #73, #18, #19, #31, #33, #186, #22 and #24, plus the parked ideas #23, #25 and #32.

A parked milestone stays open even when it looks empty or blocked. A checkpoint takes issues from it when the owner chooses, and they move to that checkpoint's milestone. Close a parked milestone only when its work is done or the owner drops it.

### Backlog
Ordered by priority. Medium: the polish tracker #72 and the decisions tracker #12. Low: MAKE's return as one batch (#186, #18, #19, #31, #33; MAKE is off by default), the tixy gallery (#51 to #58, #60, blocked on the permission request in #52), pond senses (#22), WebGPU (#24, ideation), the power layer (#35), sessions with people (#47, after CP8), X-ray rect cells (#74), Speculation Rules (#347) and the IQ ideation list (#70).
