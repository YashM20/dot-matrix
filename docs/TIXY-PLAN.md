# TIXY-PLAN: the tixy.land gallery as a Dot/480 board

Status (2026-11-06): **T2 built, the rest planned. Ports are blocked until permission comes through (T1, #52).** The `tixy()` adapter and the card `credit` field shipped in 0.14 (#53, PR #92), and `docs/CREDITS.md` is generated from the credits (PR #109). The `/tixy/` board (T3, #54) is in Backlog.

Tracking: GitHub issues labelled `area: tixy`:
- #51: tracking issue;
- #52: T1 permission;
- #53: T2 adapter and credits;
- #54: T3 board;
- #55 to #58: batches A to D;
- #59: T8 webcam;
- #60: T9 remix in CODE.

## What and why
[tixy.land](https://tixy.land/) is a creative code-golf toy by Martin Kleppe (GitHub `aemkei`). Each program is a one-line JavaScript expression of `(t, i, x, y)` that drives a 16×16 grid of dots:
- a positive value draws a white dot;
- a negative value draws a red dot;
- the size is `|v|`, clamped to 1.

Its [gallery](https://tixy.land/gallery/) collects 52 programs by about 30 contributors. Dot/480's essay already names tixy as a direct inspiration (`src/essay/Essay.tsx`), and the constraint fits this engine closely:
- a tixy program is a `Field`;
- the 16×16 grid is a lattice;
- red for negative values is exactly our one accent (`{colors.dotActive}`).

Goal: a lazy `/tixy/` board with every gallery program as a live card. Each card credits its author and links back to tixy.land.

## T1: permission first (blocks every port)
The tixy repository (`github.com/aemkei/tixy`) has **no license file**. Each gallery snippet is credited in the source with a comment (`// by @handle`, Twitter/X handles). Without a license, the code isn't ours to copy, even with credit. Before any expression lands in this public repo:
1. Ask the tixy maintainer for permission to reproduce the gallery programs with credit, or ask them to add a license. The owner sends the request; a draft is in the T1 issue.
2. Record the answer here and in the T1 issue.
3. If permission covers only the maintainer's own entries, ask the other contributors individually, or ship only what is cleared.
4. If there is no answer or the answer is no, ship nothing copied. The fallback is original programs written in the same spirit, credited as "after tixy.land", plus a link to the gallery.

Until T1 is cleared, the repo holds no tixy expressions: not in code, tests, docs or issues. This plan lists titles and credits only.

## Engine adapter (T2)
- **`tixy(program)`:** builds the card's layers from a typed TS function `(t, i, x, y) => number | boolean`.
  - The program is evaluated on a 16×16 lattice. `x` and `y` run 0..15 and `i = y * 16 + x`.
  - `t` is in seconds since the card's start, so a card's time is the card clock, as on every other board.
  - The result goes through tixy's own coercion: `true` → 1, `false`/`NaN` → 0, then clamped to [-1, 1].
- **Two layers, both inside the pipeline:** `max(v, 0)` with the default tone, and `max(-v, 0)` with the accent tone. Dot size follows `{grid.quantizeSteps}`. No hand-drawn dots.
- **No runtime `eval`:** the site's CSP has no `unsafe-eval`. Every program is a compiled TypeScript function in the board file, so there is no string evaluation and no dynamic code.
- **Scope:** programs get the `Math` names tixy exposes (`sin`, `cos`, `tan`, `atan2`, `hypot`, `abs`, `min`, `max`, `sqrt`, `acos`, …) as plain imports.
- **Stateful programs** (game of life, through tixy's globals) get a per-card state object, stepped per frame like the pond's `World`. Goldens start from a known state.
- **Credit metadata, new and shared by any card** (also useful for future attributed cards). On a preset: `credit?: { by: string[]; title: string; source: string; note?: string }`. Show it:
  - on the card, as a small `by …` line in the label row;
  - in X-ray / inspector;
  - on the widget page;
  - on an ABOUT › CREDITS list generated from the presets.

## Board (T3)
- **The board:** `/tixy/`, titled `TIXY — (t, i, x, y) ON 16 × 16 · THE TIXY.LAND GALLERY`. It is lazy (its own chunk), `dense` density, and in the `play` group.
- **Intro line:** credits tixy.land and Martin Kleppe, links the gallery, and says each card is shown with its author's permission (once T1 is cleared).
- **`docs/CREDITS.md`:** a new file listing each program with its title, authors and source link. The ABOUT credits list is generated from the same presets, so the two can't drift.

## Ports, in four batches (T4–T7), plus the webcam (T8)
Each batch is one PR-sized unit of work:
- cards plus goldens: 0 changed, N added;
- a pixel check against tixy's own output, by running the original expression in Node in the test only;
- the per-card frame budget (≤ 4 ms × load).

Credits below are as written in the gallery source; handles are Twitter/X. "No credit line" means the gallery source gives none, so the card credits the tixy.land gallery.

**Batch A: pure math (20)**

| # | Title | By |
|---|---|---|
| 1 | sin cos sin cos sin cos | `@inky` |
| 2 | fan | `@akella`, `@aemkei` |
| 3 | sticky blood | `@joeytwiddle` |
| 4 | fireworks | `@p_malin`, `@aemkei` |
| 5 | dialogue with an alien form of life | `@chiptune` |
| 6 | maze generator | `@xordev` |
| 7 | ripples | no credit line |
| 8 | sunset | `@jahndis` |
| 9 | flames | `@2DArray` |
| 10 | rotating rod | `@maettig` |
| 11 | stargate | `@sam_suite` |
| 12 | fractal | `@lukiss163` |
| 13 | bouncy ball | `@zozuar` |
| 15 | tunnel | `@xordev` |
| 16 | growing cells | `@bitnenfer` |
| 18 | blob | `@maettig` |
| 19 | stage blinders | `@ntsutae` |
| 22 | shady sphere | `@blu3_enjoy` |
| 23 | blood drops | `@ntsutae`, `@atesgoral`, `@aemkei` |
| 47 | spiral | `@akella` |

**Batch B: bitwise and multi-statement patterns (16)**

| # | Title | By |
|---|---|---|
| 14 | four in one | `@mgmalheiros` |
| 17 | roto zoomer | `@mzarcus` |
| 20 | us flag | no credit line |
| 21 | checkered floor | `@mzarcus` |
| 25 | matrix rain | `@P_Malin` |
| 26 | checker board | `@P_Malin` |
| 27 | fun with the & operator | `@v21` |
| 28 | 3d starfield | `@P_Malin` |
| 30 | hungry pac man | `@p_malin`, `@aemkei` |
| 31 | spectrum analyser | `@joeytwiddle` |
| 33 | train ride | `@ntsutae` |
| 35 | invaders | `@mgmalheiros` |
| 40 | ugly xmas sweater | `@ntsutae` |
| 41 | snow | `@ph` |
| 42 | christmas tree | `@veubeke` |
| 51 | meta balls | `@aemkei` |

**Batch C: bitmaps and packed data (8).** These hold packed strings and bitmask tables; copy them byte-exact from the source file, never from a rendered page.

| # | Title | By |
|---|---|---|
| 24 | scrolling "TIXY" font | `@atesgoral` |
| 29 | space invader | `@keithclarkcouk`, `@zozuar` |
| 32 | duo | `@cocopon` |
| 34 | world | `@aemkei`, `@xordev` |
| 38 | self portrait | `@xordev` |
| 39 | santa | `@pschwede` |
| 44 | super mario | `@sosowski` |
| 50 | timer | `@maettig` |

**Batch D: stateful or heavy (7)**

| # | Title | By | Note |
|---|---|---|---|
| 36 | pong | `@aemkei` | |
| 37 | color pong | `@aemkei` | |
| 45 | parallax hills | `@joeytwiddle` | |
| 46 | value noise | `@xordev` | |
| 48 | game of life | `@maettig`, `@aemkei`, `@mgmalheiros`, `@xen_the`, `@xordev` | needs per-card state |
| 49 | boing ball | `@mgmalheiros` | |
| 52 | mandelbrot zoom | `@pschwede`, `@aemkei` | recursion, up to 99 iterations per dot; check the budget |

**T8: webcam (1), an owner decision.**

| # | Title | By |
|---|---|---|
| 43 | webcam | `@frdmsr`, `@aemkei` |

The original asks for the camera from inside the program. Here it would read the existing camera source instead. It would be opt-in, like the other camera boards: never requested on load, and always behind a tap. The other option is to skip it and link to tixy.land.

Total: 20 + 16 + 8 + 7 + 1 = 52.

## Later (T9): remix in CODE
- **The button:** "Remix in CODE" on a tixy card opens the program in the editor's CODE mode as Field IR, so visitors can change it.
- **What it needs:** a tixy → Field IR translator, plus integer and bitwise ops (`^ & | << >>`) in the IR. Both are engine work under `src/engine/ir/`, and both need their own tests.
- **Out of scope:** charCode tables and stateful programs stay as TS-only cards.

## Gates (every port PR)
- **Goldens:** `pnpm golden --check` shows 0 changed and N added. Each card's golden time is chosen so the frame isn't blank (several programs are empty or infinite at `t = 0`).
- **First-load JS:** unchanged, within ±0.1 kB gz. The board is lazy and the adapter is not in the engine barrel.
- **Frame:** ≤ 4 ms × load per card.
- **Accent:** red appears only for negative values.
- **Credits:** every card has `credit`, and ABOUT › CREDITS lists it.
