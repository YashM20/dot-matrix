# Blog

The posts at `/blog/` on the site. Every long piece is a post, in one layout: the essay's measure, type, theme and figures. The list, its order, the deks and the thumbnails live in `src/blog/posts.ts`. The page code is `src/blog/`.

## Posts

The order is deliberate: the essay first, because it tours the whole engine, then the tutorials in reading order.

| Post | URL | Source | Reader |
|---|---|---|---|
| Ditherpunk for UI | `/blog/dot-matrix-essay/` | `src/essay/Essay.tsx` (a TSX page with its own live figures) | anyone |
| Build your own dot engine | `/blog/build-your-own-dot-engine/` | [`build-your-own-dot-engine.md`](build-your-own-dot-engine.md) | front-end developers |
| A tiny language for dots | `/blog/a-tiny-language-for-dots/` | [`a-tiny-language-for-dots.md`](a-tiny-language-for-dots.md) | tool makers and creative coders |
| Living matter | `/blog/living-matter/` | [`living-matter.md`](living-matter.md) | generative artists |

The essay's old addresses (`/essay`, `/essay/`, `/essay.html`, `?tab=essay`) redirect to its post.

## Writing a markdown post

1. Add `docs/blog/<slug>.md` and a row in `src/blog/posts.ts` (slug, title, dek, reader, thumbnail card, date).
2. Plan each section's visual first (`docs/WRITING.md`). Write it as a note: `<!-- VISUAL: kind=card · what=<card id> · notice=<what to look at> -->`. A `card` note shows that live card, and its board must be in `src/blog/cards.ts`. A `diagram`, `steps` or `interactive` note shows a placeholder until its figure is drawn.
3. The renderer (`src/blog/markdown.ts`) reads headings, paragraphs, lists, fenced code (shown with COPY), links, bold, italics, inline code and `$…$` maths. Links to another post's `.md` file open that post.
4. Run `npx tsx scripts/site/prose-lint.ts docs/blog/<slug>.md`: 0 errors.

## Images

Each post can have two images in `public/og/blog/`, named by slug (`blog` is the index):
- `<slug>-hero.webp`, 1600×900: the top of the post and its thumbnail on the index. The alt text is in `alt.json`, keyed by slug.
- `<slug>-social.png`, 1200×630: `og:image` and `twitter:image`.

Until a file exists, the post shows its live card and shares `/og/default.png`. The build picks the files up on its own.
