/** Built by the `blog-meta` plugin in vite.config.ts from docs/blog/*.md, the essay and public/og/blog/. */
declare module 'virtual:blog-meta' {
  const meta: {
    /** Prose words per post slug (code blocks and comments left out). */
    words: Record<string, number>
    /** Slugs whose hero image (`public/og/blog/<slug>-hero.webp`) exists, with its alt text (`alt.json`). */
    heroes: Record<string, string>
  }
  export default meta
}
