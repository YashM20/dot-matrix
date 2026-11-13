/**
 * The blog: every long-form piece, in one format (GitHub #77; #12 "essay name and URL"). Pure data, so the ⌘K
 * palette and the site's links can name posts without loading the blog. Order is deliberate: the essay first (the
 * tour of the whole engine), then the tutorials in reading order.
 *
 * A post is either the essay (`src/essay/Essay.tsx`, a TSX page with its own live figures) or a markdown file in
 * `docs/blog/<slug>.md`. `thumb` is the live card on the index (a preset id that `./cards.ts` can load);
 * `reader` is who it is for, when the post has one in mind. Reading times come from `virtual:blog-words`
 * (vite.config.ts counts the words at build time).
 */
export interface PostInfo { slug: string; title: string; dek: string; reader?: string; thumb: string; kind: 'essay' | 'md'; date: string }

export const ESSAY_SLUG = 'dot-matrix-essay'
export const POSTS: readonly PostInfo[] = [
  { slug: ESSAY_SLUG, title: 'Ditherpunk for UI', dek: 'How the Dot/480 engine turns fields into dots, with every figure running live in the page.', thumb: 'level-03', kind: 'essay', date: '2026-10-24' },
  { slug: 'build-your-own-dot-engine', title: 'Build your own dot engine', dek: 'Write a field, a sampler and a canvas renderer, then build a dot clock with them.', reader: 'Front-end developers', thumb: 'home-clock', kind: 'md', date: '2026-11-01' },
  { slug: 'a-tiny-language-for-dots', title: 'A tiny language for dots', dek: 'Parse a safe formula language and share programs as links.', reader: 'Tool makers and creative coders', thumb: 'ir-plasma', kind: 'md', date: '2026-11-01' },
  { slug: 'living-matter', title: 'Living matter', dek: 'Make ripples, swimming koi and lit materials that run for hours.', reader: 'Generative artists', thumb: 'pond-koi', kind: 'md', date: '2026-11-01' },
]
/** The index page's own meta (title, description; its images are `public/og/blog/blog-*`). */
export const BLOG = { slug: 'blog', title: 'Blog · Matrix', dek: 'Long reads on how the Dot/480 engine draws interfaces in dots: the essay and three tutorials with live cards and code you can copy.' }
/** Images by convention (`scripts/og-blog.ts` draws them): the hero at the top of a post and on the index, the social card. */
export const heroImage = (slug: string): string => `/og/blog/${slug}-hero.png`
export const socialImage = (slug: string): string => `/og/blog/${slug}-social.png`

/** The page path of a post, or of the index. */
export const postPath = (slug?: string): string => (slug ? `/blog/${slug}/` : '/blog/')
/** The essay's old addresses (`/essay`, `/essay/`, `/essay.html`): they open the essay's post. */
export const isEssayAlias = (pathname: string): boolean => /^\/essay(\/|\.html)?$/.test(pathname)
/** The post a path names (`/blog/<slug>/`, or an essay alias); undefined on the index or an unknown slug. */
export function postFromPath(pathname: string): PostInfo | undefined {
  if (isEssayAlias(pathname)) return POSTS[0]
  const slug = /^\/blog\/([a-z0-9-]+)\/?$/.exec(pathname)?.[1]
  return POSTS.find(p => p.slug === slug)
}
