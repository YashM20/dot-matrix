# Changelog fragments

Every PR adds one file here, so the changelog keeps up as work lands. Lanes don't edit `CHANGELOG.md` or `src/changelog.ts`. The release lane does that at publish.

## The file
- Name it after the branch, with `/` turned into `-`: branch `chore/pond-focus` writes `changes/chore-pond-focus.md`. A PR number works too (`changes/400.md`).
- It holds two lines:
  - `visitor:` one plain sentence for the LOG tab, or `none` when visitors won't notice.
  - `engineering:` one sentence for `CHANGELOG.md`, with the issue and PR numbers.
- Follow `docs/WRITING.md`. The visitor line is what the LOG tab will show.

## Example
`changes/chore-pond-card-focus-rings.md`:

```
visitor: Pond cards you can tap show a focus line under their label when you reach them with Tab.
engineering: surfaceFocus() in pond/shared.ts marches a focus line on the eight whole-surface pond buttons (#393, #400).
```

## At publish
The release lane folds every fragment into the new version in `CHANGELOG.md` (the engineering lines, grouped) and `src/changelog.ts` (the visitor lines that aren't `none`), then deletes the fragments in the same PR. This README stays.

## The check
`scripts/site/changes.ts` runs in `pnpm check`. It warns, and never fails, when a branch changes `src/` against `origin/main` and adds no fragment, or when a fragment lacks one of its two lines. It skips `main` and the release branch, which edits `CHANGELOG.md`.
