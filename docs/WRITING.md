# WRITING: how visitor text should sound

This page is for anything a visitor reads. That means the essay (`src/essay/Essay.tsx`), the blog posts and guides (`docs/blog/`, `docs/guides/`), both changelogs, the legal pages, `README.md`, `CONTRIBUTING.md`, the board blurbs and the About text. Commit messages, PR bodies and issue comments follow it too.

`scripts/site/prose-lint.ts` checks the mechanical part and runs in `pnpm check`. It catches the tells. It can't make a sentence good, so read this page as well.

## Tone

Write like you're at a desk with a friend, pointing at the screen and saying what the thing does.

- **Short, active sentences in everyday words.** Write "The sampler rounds each value." Avoid "Values are subjected to quantization."
- **One idea per sentence.** A sentence with a semicolon and two ideas becomes two sentences.
- **Concrete nouns and real numbers.** "A 25×25 LED panel", "0.12 s", "2,000 dots". Vague words like "small displays", "quickly" and "lots of dots" tell the reader nothing.
- **Start with what the reader can see or try.** "Drag the slider." comes before "A field has no resolution."
- **Say "you" when the reader does something.** "Drag the blob."
- **Name a thing after you show it.** Show the clumped "42" first, then call the fix a lattice.
- **One image per paragraph at most,** and only a concrete one ("shimmers like a shower door"). Skip puns, flourishes ("a love letter to") and throat-clearing ("One last experiment.").

## Habits to avoid

Each row is a lint rule. The bad line is the tell, and the fixed line is how this project says it. Rules marked **fail** stop `pnpm check`. Rules marked **warn** only print, so read each one and fix it when it's real.

### Fail

| Rule | Bad | Fixed |
|---|---|---|
| `em-dash` | Three new boards — materials, a pond and squares — plus editing. | Three new boards (materials, a pond and squares), plus editing. |
| `en-dash` | Field–sampler–renderer | Field → sampler → renderer. Ranges like `2–4×` and `Q2–Q3` and name pairs like `Gray–Scott` are fine. |
| `its-not-x-its-y` | It's not a filter, it's a sampler. | It's a sampler. It asks a function for one value per cell. |
| `not-just` | Not just clocks, but sliders too. | Clocks, sliders, timers and status cards. |
| `isnt-x-its-y` | Interaction isn't a CSS layer. It's state. | Interaction is state in the card's data, and the card draws it in dots. |
| `not-x-but-y` | Some fields aren't formulas but state. | Some fields have state, like sand that piles up. |
| `not-about` | This isn't about pixels. | Say what it is about, or cut it. |
| `less-x-more-y` | Less chrome, more dots. | The chrome uses the same squircle curve as the dots. |
| `not-because` | Not because it's pretty, but because it reads. | It reads at 25×25. |
| `rather-than-reveal` | Rather than draw, we sample. | Every dot is a sample of a function. |
| `no-no-just` | No accounts. No cookies. Just dots. | There are no accounts and no cookies. |
| `setup-reveal` | Here's the thing: it rounds. / The result? Crisp digits. | The sampler rounds, so the digits stay crisp. |
| `filler-opener` | Additionally, it saves as JSON. | It also saves as JSON. |
| `stock-phrase` | Let's dive in. / It plays a crucial role. | Cut it, or say the fact: "The sampler sets the dot size." |
| `banned-word` | A robust pipeline that seamlessly elevates your UI. | One pipeline draws every card: field, sampler, renderer. |
| `emoji` | Ship it 🚀 | Cut it. |

The banned words are in `VOCAB` in `scripts/site/prose-rules.ts`: delve, seamless, robust, leverage, elevate, unlock, crucial, tapestry, testament, pivotal, showcase, vibrant, journey, empower, utilize, streamline and about thirty more. Literal senses stay allowed: "landscape mode" and "a long-press unlock" on a lock screen.

### Warn

| Rule | Bad | Fixed |
|---|---|---|
| `rhetorical-q` | Why use a lattice? Because clumps look like a mosaic. | Clumped dots look like a mosaic, so big digits use a coarser lattice. |
| `cliche-opener` | Think of it as a tiny GPU. / It turns out it's fast. / Imagine a wall of light. | It compiles to GLSL and runs on the GPU. |
| `from-x-to-y` | From clocks to cameras, everything is a field. | Every visual is a field, whether it's a clock digit or a webcam frame. |
| `moral-close` | The sampler reads one value per cell. And that's the point. | End on the last fact: "The sampler reads one value per cell." |
| `x-meets-y` | Hardware meets the browser. | The card runs on a 25×25 LED panel and in a browser tab. |
| `comma-not` | It looks like a mosaic, not a display. | The clumps look like a mosaic. |
| `triplets` | Three "fast, light and simple" lists in one paragraph | Keep the one list that carries facts. |
| `hedging` | It may potentially help somewhat. | It helps on phones. |
| `bold-in-prose` | The rule is **always** use a lattice. | Bold only a run-in lead: **Masks.** An entrance is a threshold map. |
| `title-case` | One Field Five Surfaces | One field, five surfaces |
| `quote-mix` | the phone’s share sheet, the card's label | Pick one kind of quote per file. |

### From the essay

These were real sentences in the essay before the plain-voice pass.

| Before | After |
|---|---|
| That sounds like a handicap. It is the point. A constraint you can't negotiate with makes decisions for you. | That sounds limiting, and it helps. A hard limit makes decisions for you. |
| Below is a lit sphere. It isn't a bitmap. It's a function of two numbers, and the slider only changes how many times we ask it for a value. | Below is a lit sphere. It is a function of two numbers. The slider sets how many times we ask that function for a value. |
| Why insist on one continuous knob? Because presets multiply. | One continuous knob beats presets, because presets multiply. |

## Plan the visuals

The essay's structure is the model for any long page or guide. Copy its structure and leave its sentences alone. Each section does three things:

1. **Show something live.** A running card, an interactive diagram, or a step shot.
2. **Explain it.** Two or three short paragraphs on how it works, with the real numbers.
3. **Let the reader try it.** The caption says what to do ("Drag", "Toggle", "Pick a mask") and what to look for.

Pick the visual before you write the section. Write down what it is and what the reader should notice:

| Section | Visual | Notice |
|---|---|---|
| Lattices and sites | live figure `FigLattice` | the clumped "42" looks like a mosaic, and the lattice one looks like hardware |
| Halftone and time | live figure `FigFlicker` | the dot-change counter under each panel |
| Five surfaces | live figure `FigSurfaces` (one board clock, five devices) | the red arc turns into plain light on one-colour devices |

A visual is a live card id, a diagram (a figure component), or a step shot (a screenshot from `scripts/site/shots.ts`). In a markdown post, write it as a note (see `docs/blog/README.md`). If a section has no visual, ask whether it needs to exist.

## Checking

```
npx tsx scripts/site/prose-lint.ts                  # every visitor file (the list is DEFAULT_FILES in the script)
npx tsx scripts/site/prose-lint.ts docs/blog/x.md   # one file
npx tsx scripts/site/prose-lint.ts --warn-only      # print everything, exit 0
```

Each finding prints the file, line, rule and excerpt, with a `fix:` hint under it. Code spans, fenced code and `<code>` are skipped.

Quoted text from someone else, like a credit line or a licence, can break these rules. Add it to `scripts/site/prose-allow.json` with the file, the rule, a snippet of the quote and why it's there. An entry that stops matching fails the lint, so remove it when the quote goes.

Sources: Wikipedia's "Signs of AI writing" and the owner's list in #77.
