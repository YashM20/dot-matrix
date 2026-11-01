# WRITING: how visitor text should sound

For everything a visitor reads: the essay (`src/essay/Essay.tsx`), the LOG rows (`src/changelog.ts`), the legal pages (`privacy.html`, `terms.html`), card help text and blog posts (`docs/blog/*.md`; the essay is a post too). Engineering docs can be terser, but the "never" list still applies.

`npx tsx scripts/site/prose-lint.ts` checks the mechanical part (see its header). It catches the tells. It can't make the writing good; this page is for that.

## The voice

You are the owner, sitting at a desk with a friend, showing them something you built. You point at the screen and say what it does.

- **Short, active sentences in everyday words.** "The sampler rounds each value", not "values are subjected to quantization".
- **One idea per sentence.** If a sentence has a semicolon and two ideas, make it two sentences.
- **Concrete nouns and real numbers.** "25×25 LED panel", "0.12 s", "2,000 dots". Not "small displays", "quickly", "lots of dots".
- **Start with the thing you can see or try**, then explain it. "Drag the slider." before "A field has no resolution."
- **Second person when the reader does something.** "Drag the blob." "You can feel both in the next section."
- **Name a thing after you have shown it.** Show the clumped "42", then call the fix a lattice.

Never:
- **Flourish:** "a love letter to", "the charm drains out", "a square in all but name".
- **Stacked metaphors:** one image per paragraph at most, and only if it is concrete ("shimmers like a shower door").
- **Clever puns or wordplay.**
- **Throat-clearing:** "It's easier to show than to argue.", "One last experiment.", "Here's where X pays off."

## The structure (the essay is the model)

The essay's sections are the pattern for any long page or guide:

1. **Show something live.** Each section has a figure: a running card, an interactive diagram, or a step shot.
2. **Explain it.** Two or three short paragraphs on how it works, with the real numbers.
3. **Let the reader try it.** The caption says what to do ("Drag", "Toggle", "Pick a mask") and what to notice.

### Plan the visual first

Before writing a section of a guide, write down its visual and what the reader should notice in it:

| Section | Visual | Notice |
|---|---|---|
| Lattices and sites | live figure `FigLattice` | the clumped "42" looks like a mosaic; the lattice one looks like hardware |
| Halftone and time | live figure `FigFlicker` | the dot-change counter under each panel |
| Five surfaces | live figure `FigSurfaces` (one board clock, five devices) | the red arc turns into plain light on one-colour devices |

A visual is one of: a live card id, a diagram (a figure component), or a step shot (a screenshot from `scripts/site/shots.ts`). If a section has no visual, ask whether it needs to exist.

## Before → after, from the essay

These were real sentences in the essay before the prose pass (#77).

| Before | After |
|---|---|
| That sounds like a handicap. It is the point. A constraint you can't negotiate with makes decisions for you. | That sounds limiting, and it helps. A hard limit makes decisions for you. |
| Below is a lit sphere. It isn't a bitmap. It's a function of two numbers, and the slider only changes how many times we ask it for a value. | Below is a lit sphere. It is a function of two numbers. The slider sets how many times we ask that function for a value. |
| Why insist on one continuous knob? Because presets multiply. | One continuous knob beats presets, because presets multiply. |

## The tells, and what to write instead

Every row below is an `error` in `prose-lint` unless it says warn. The "good" column is in this project's voice.

### Punctuation

| Tell | Bad | Good |
|---|---|---|
| Em dash (any) | Three new boards — materials, a pond and squares — plus editing. | Three new boards (materials, a pond and squares), plus editing. |
| En dash outside a number range | Field–sampler–renderer | Field → sampler → renderer. Keep `2–4×`, `12–120`, `Q2–Q3`. |
| Emoji | Ship it 🚀 | (Cut it.) |
| Mixed straight and curly quotes (warn) | the phone’s share sheet, the card's label | Pick straight quotes: the phone's share sheet. |
| Bold inside running prose (warn) | The rule is **always** use a lattice. | Bold only a run-in lead: **Masks.** An entrance is a threshold map. |

### Contrast frames

Say what the thing is. Don't set up a wrong idea to knock it down.

| Tell | Bad | Good |
|---|---|---|
| it's not X, it's Y | It's not a filter, it's a sampler. | It is a sampler: it asks a function for one value per cell. |
| not just X, but Y | Not just clocks, but sliders too. | Clocks, sliders, timers and status cards. |
| X isn't Y. It's Z. | Interaction isn't a CSS layer. It's state. | Interaction is state in the card's data, and the card draws it in dots. |
| X isn't about Y | This isn't about pixels. | (State what it is about, or cut it.) |
| less X, more Y | Less chrome, more dots. | The chrome uses the same squircle curve as the dots. |
| not because X, but because Y | Not because it's pretty, but because it reads. | It reads at 25×25. |
| Rather than X, Y (as an opener) | Rather than draw, we sample. | Every dot is a sample of a function. |
| not X but Y | Some fields aren't formulas but state. | Some fields have state: sand that piles up. |
| X, not Y (warn) | It looks like a mosaic, not a display. | The clumps look like a mosaic. |

### Sentence shapes

| Tell | Bad | Good |
|---|---|---|
| No X. No Y. Just Z. | No accounts. No cookies. Just dots. | There are no accounts and no cookies. |
| Set-up, then reveal | Here's the thing: it rounds. / The catch? Flicker. | The sampler rounds. / Video flickers. |
| Rhetorical question, answered | What if it had a body instead? The heartbeat is… | This last experiment gives it a body. The heartbeat is… |
| From X to Y, (opener) | From clocks to cameras, everything is a field. | Every visual is a field, from a clock digit to a webcam frame. |
| X meets Y | Hardware meets the browser. | The card runs on a 25×25 LED panel and in a browser tab. |
| It turns out / Think of it as / Imagine | Think of it as a tiny GPU. | It compiles to GLSL and runs on the GPU. |
| One-line moral to close | And that's the point. | (End on the last fact.) |
| Moreover / Furthermore / Additionally / Ultimately | Additionally, it saves as JSON. | It also saves as JSON. |
| Stock phrases | Let's dive in. / plays a crucial role / serves as a | (Cut, or say the fact: "The sampler sets the dot size.") |
| Title Case headings (warn) | One Field Five Surfaces | One field, five surfaces |
| 3+ "X, Y and Z" lists in a paragraph (warn) | fast, light and simple … | Keep the one list that carries facts. |
| Hedging pile-up (warn) | It may potentially help somewhat. | It helps on phones. |

### Vocabulary

Banned in visitor prose (fine in code comments): delve, tapestry, testament, intricate, pivotal, seamless, robust, leverage, elevate, unlock, realm, landscape (the abstract one; "landscape mode" is fine), vibrant, showcase, underscore, boasts, nestled, crucial, foster, embark, journey, meticulous, bolster, garner, interplay, multifaceted, groundbreaking, renowned, cutting-edge, game-changer, empower, holistic, transformative.

| Bad | Good |
|---|---|
| A robust pipeline that seamlessly elevates your UI. | One pipeline draws every card: field, sampler, renderer. |
| The board showcases a vibrant tapestry of materials. | The board has a loom, a metal knob, a speaker grille and a marble clock. |

## Checking

```
npx tsx scripts/site/prose-lint.ts                    # essay, LOG rows, legal pages, docs/blog
npx tsx scripts/site/prose-lint.ts docs/blog/x.md     # one file
```

Errors must be 0 before a checkpoint ships. Read the warnings and fix the ones that are real. Sources: Wikipedia, "Signs of AI writing", and the owner's list in #77.
