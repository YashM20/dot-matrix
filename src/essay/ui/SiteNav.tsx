/** The nav and footer shared by the blog and the lab (their own pages, outside the app shell). */
export function SiteNav({ here }: { here?: 'blog' | 'lab' }) {
  const cur = (p: 'blog' | 'lab') => (here === p ? 'page' : undefined)
  return (
    <nav className="site-nav" aria-label="Site">
      <span className="kicker"><i aria-hidden="true" /> DOT/480</span>
      <span><a href="/">EXPLORE</a><a href="/?make">MAKE</a><a href="/lab/" aria-current={cur('lab')}>LAB</a><a href="/blog/" aria-current={cur('blog')}>BLOG</a><a href="/?about">ABOUT</a></span>
    </nav>
  )
}

export const SiteFoot = ({ name }: { name: string }) => (
  <footer className="essay-foot"><span>DOT/480 · {name}</span><span>FIELD → GRID SAMPLER → RENDERER</span><span><a href="/privacy">PRIVACY</a> · <a href="/terms">TERMS</a></span></footer>
)
