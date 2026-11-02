/** Built by the `blog-meta` plugin in vite.config.ts from docs/blog/*.md, the essay and public/og/blog/. */
declare module 'virtual:blog-meta' {
  const meta: {
    /** Prose words per post slug (code blocks and comments left out). */
    words: Record<string, number>
    /** Slugs whose hero image (`public/og/blog/<slug>-hero.png`) exists, with its alt text (`alt.json`) and size in px. */
    heroes: Record<string, { alt: string; w: number; h: number }>
  }
  export default meta
}
