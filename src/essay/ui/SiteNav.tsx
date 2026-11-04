import { flag } from '../../site/flags'

/** The nav and footer shared by the blog and the lab (their own pages, outside the app shell). */
export function SiteNav({ here }: { here?: 'blog' | 'lab' }) {
  const cur = (p: 'blog' | 'lab') => (here === p ? 'page' : undefined)
  return (
    <nav className="site-nav" aria-label="Site">
      <span className="kicker"><i aria-hidden="true" /> MATRIX</span>
      <span><a href="/">EXPLORE</a>{flag('make') && <a href="/?make">MAKE</a>}{flag('lab') && <a href="/lab/" aria-current={cur('lab')}>LAB</a>}<a href="/blog/" aria-current={cur('blog')}>BLOG</a><a href="/?about">ABOUT</a></span>
    </nav>
  )
}

export const SiteFoot = ({ name }: { name: string }) => (
  <footer className="essay-foot"><span>MATRIX · {name}</span><span>FIELD → GRID SAMPLER → RENDERER</span><span><a href="/privacy">PRIVACY</a> · <a href="/terms">TERMS</a></span></footer>
)
