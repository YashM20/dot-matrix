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

## Checkpoints

| # | Milestone | Ships | Status |
|---|---|---|---|
| CP1 | `CP1 · 0.13 · Round 3 to main` | Round 3: editor share and phone polish, squares Q2–Q3, glass and water, workshop, pond polish and depth, 0.12 release notes | **in progress**: the last steps are the workshop cold-frame fix, the full suite and the PR |
| CP2 | `CP2 · 0.14 · Engine foundations` | IQ1–IQ4 (2D SDFs, operators, shaping, filtered fields) | next (proposed) |
| later | Tixy gallery · Next phases · Polish pass · Follow-ups · Backlog | picked one at a time at each breather | waiting |
