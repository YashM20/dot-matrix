## What

<!-- What this PR changes, in a few lines. Link the issue if there is one. -->

## Why

<!-- The problem it solves or the reason for the change. -->

## How I tested it

<!-- The commands you ran and what they printed, or what you checked by hand. -->

## Screenshots

<!-- For visual changes: before and after. Delete this section if nothing on screen changed. -->

## Checklist

- [ ] `npx tsc -b` and `npx oxlint` pass on the changed files
- [ ] `pnpm golden --check` shows 0 changed, or the changed cards are listed above and intended
- [ ] The area's own script passes (`npx tsx scripts/<area>.ts`)
- [ ] First-load size checked if first-load imports changed (`npx tsx scripts/site/size.ts --check` after a build)
- [ ] `DESIGN.md` updated if a token was added or renamed
- [ ] No new dependency under `src/engine/`
