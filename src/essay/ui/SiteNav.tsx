import { flag } from '../../site/flags'
import '../../site/brand/mark.css'

/** The nav and footer shared by the blog and the lab (their own pages, outside the app shell). Plain links: the brand
 * goes home and each item is the canonical URL of its place (`urlForView` in src/site/views.ts). */
export function SiteNav({ here }: { here?: 'blog' | 'lab' }) {
  const cur = (p: 'blog' | 'lab') => (here === p ? 'page' : undefined)
  return (
    <nav className="site-nav" aria-label="Site">
      <a className="kicker" href="/" aria-label="MATRIX home"><i className="mark" aria-hidden="true" />MATRIX</a>
      <span><a href="/">EXPLORE</a>{flag('make') && <a href="/?make">MAKE</a>}{flag('lab') && <a href="/lab/" aria-current={cur('lab')}>LAB</a>}<a href="/blog/" aria-current={cur('blog')}>BLOG</a><a href="/?about">ABOUT</a></span>
    </nav>
  )
}

export const SiteFoot = ({ name }: { name: string }) => (
  <footer className="essay-foot"><span>MATRIX · {name}</span><span>FIELD → GRID SAMPLER → RENDERER</span><span><a href="/privacy">PRIVACY</a> · <a href="/terms">TERMS</a></span></footer>
)
