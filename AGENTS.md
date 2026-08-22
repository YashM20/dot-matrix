# AGENTS.md

## What this is
Dot/480 — a field-based dot-matrix UI engine. Full spec lives in two docs, always read them first, don't duplicate their content here:
- `DOT-MATRIX-ENGINE-PLAN.md` — architecture, modules, algorithms
- `DESIGN.md` — tokens, colors, typography, components

This file only holds things that would break the project if an agent guessed wrong, and that don't change as models get smarter.

## Non-negotiables
- Every visual = `Field → Grid Sampler → Renderer`. Never hand-draw a widget outside this pipeline.
- One accent color per board (`{colors.dotActive}`). If you're about to add a second, stop and ask.
- Quantize UI dot sizes (`{grid.quantizeSteps}`); only photos skip quantization.
- Core engine (`packages/core`) stays zero-dependency. New deps go in `apps/playground` only, and only if justified in a commit message.
- Corner roundness = squircle exponent, not a radius enum. Don't reintroduce `border-radius: Npx` presets.
- Renderer choice (`svg` vs `canvas`) is decided by dot-count/animation, not by convenience — check the rule in `DESIGN.md` before hardcoding one.

## Before changing a generator or token
1. Check if it's already covered by an existing `Field` function — new generators should be rare.
2. Update `DESIGN.md` token tables in the same PR if you add/rename a token. Stale tokens are worse than missing docs.
3. Don't invent new token names that shadow existing ones (`{colors.dotActive}` not `{colors.accent}` / `{colors.primary}` / etc).

## Keeping this file from going stale
- This file describes *invariants*, not current model capabilities, current library versions, or current best practices — those change and don't belong here.
- If you (the agent) notice an instruction here contradicts what's actually in the code or in `DESIGN.md`/`PLAN.md`, the code and those two docs win — fix this file to match them, don't fix the code to match this file.
- Re-verify this file's claims against the actual repo state at the start of any nontrivial task; don't assume it's been kept in sync.
- Keep this file under ~60 lines. If it's growing, the content probably belongs in `DESIGN.md`/`PLAN.md` instead — link to it, don't inline it.