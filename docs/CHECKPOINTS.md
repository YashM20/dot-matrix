# CHECKPOINTS: how work moves forward

One checkpoint at a time. A checkpoint is a GitHub milestone with a fixed list of issues. We build toward it, publish it, take a breather, and only then start the next one. No loops, and no new work in the middle.

## The cycle
1. **Scope.** The milestone's issues are the whole job. A new idea or request that comes up mid-checkpoint becomes an issue in a later milestone, or in Backlog or ideation. It does not join the current one unless the owner says so.
2. **Build.** At most 4 agents, each working only on issues in this milestone. Merge each one into the checkpoint branch as it finishes.
3. **Gate.** The full suite is green on the checkpoint branch (`dmdocs/full3.sh`, run detached, summary in `dmdocs/full-r3/summary.txt`). Known timing flakes are listed and pass on CI.
4. **Publish.**
   - Open a PR from the checkpoint branch to main. Wait for CI and Vercel to pass, then merge.
   - Turn the shipped `upcoming` rows into a released version in `src/changelog.ts` and `CHANGELOG.md`.
   - Close the milestone's issues and the milestone itself.
5. **Breather (mandatory, nothing new starts):**
   - **Clean up:** remove finished worktrees (junction-safe), scratch dirs, merged branches, and stale locks or tickets.
   - **Docs:** `docs/PROGRESS.md` (trim the run state to the next checkpoint), `docs/README.md` statuses, and the plan docs' status blocks.
   - **Issues:**
     - Every closed issue is really done.
     - Open issues are still accurate.
     - Follow-ups found during the checkpoint are filed in the right milestone.
     - Decisions are added to #12.
   - **Owner review:** a taste pass on what shipped, and answers to the open decisions.
6. **Pick the next checkpoint.** The owner confirms it, then a new checkpoint branch is cut from main.

## Speed rules (from the round-3 review: same quality, much less time and fewer tokens)

**Big, few checkpoints.** Batch related work into one milestone, and publish it about once per round, not per feature.

**At most 3 agents at once.** The box has 2 cores and one heavy lock, and more agents only queue: round 3 saw 5–8 jobs waiting 30–60 min each.

**Two test tiers:**

| Tier | When | What |
|---|---|---|
| Quick (agents) | while building | `npx tsc -b`, `npx oxlint <changed>`, the area script with timing off (`--quick` where it exists), `pnpm golden --check`, and size only if first-load imports changed. **No** browser probes, screenshots or timing runs. |
| Gate (coordinator) | once per checkpoint, idle machine, no agents running | the full suite (`dmdocs/full3.sh`): timing budgets, every browser probe, size, theme, CSS and goldens, then CI. Screenshots are taken once here. |

**Shared and lean:**
- One shared base build per checkpoint for size deltas (`dmdocs/base-cpN/`). Agents compare against it instead of building their own.
- Agent reports stay under 300 words: SHA, check results, sizes, anything open.
- No always-on watchdog. Run it only for long unattended runs, such as overnight.
- Merging append-only registry files (`ids.json`, `goldens/hashes.json`, `catalog.ts`, `manifest.ts`, DESIGN tables) uses the union-merge helper (`dmdocs/merge-unions.py`), not hand edits.

## Checkpoints

| # | Milestone | Ships | Status |
|---|---|---|---|
| CP1 | `CP1 · 0.13 · Round 3 to main` | Round 3: editor share and phone polish, squares Q2–Q3, glass and water, workshop, pond polish and depth, 0.12 release notes | **in progress**: the last steps are the workshop cold-frame fix, the full suite and the PR |
| CP2 | `CP2 · 0.14 · Foundations and fixes` | IQ1–IQ4 (2D SDFs, operators, shaping, filtered fields), the tixy adapter, card credits and an empty `/tixy/` board (#53, #54), the quick/gate test tiers (#75), flaky timing gates (#28), X-ray rect cells (#74), and the editor follow-ups (#31–#33) | next (proposed) |
| CP3 | `CP3 · 0.15 · Polish and new boards` | the polish pass (#37–#47), the IQ card sets (#66–#68), tixy ports if permission arrives (#55–#58) | after CP2 (proposed) |
| later | Next phases (E4, E7, X) · Backlog | picked at a breather | waiting |
