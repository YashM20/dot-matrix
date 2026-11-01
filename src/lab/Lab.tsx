/**
 * The lab page (`/lab/`): every piece from `./experiments.ts` in order, each with its title, a line on what to try and
 * its figure. A figure loads its own chunk when it scrolls near (the essay's `Figure`), so the page opens on text.
 */
import { lazy, useEffect, type ComponentType, type ReactNode } from 'react'
import { DotTitle } from '../essay/ui/DotTitle'
import { Figure } from '../essay/ui/Lazy'
import { SiteFoot, SiteNav } from '../essay/ui/SiteNav'
import { EXPERIMENTS } from './experiments'

/** Each piece's figure, keyed by slug: its chunk, the box it holds before it mounts, and its caption. */
const FIGS: Record<string, { body: ComponentType; minHeight: number; caption: ReactNode }> = {
  pipeline: {
    body: lazy(() => import('../essay/figures/FigPipeline')),
    minHeight: 440,
    caption: <>Drag either panel, or use the arrow keys, to move the third blob. The slider sets how many dots fit across the right panel.</>,
  },
}

const pad = (n: number) => String(n).padStart(2, '0')

export function Lab() {
  // a link to one piece (`/lab/#pipeline`): the sections exist on first render, the figure mounts once it is near
  useEffect(() => { if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView() }, [])
  return (
    <main className="essay lab">
      <header className="hero">
        <SiteNav here="lab" />
        <DotTitle text="Lab" level={1} max={10} smooth />
        <p className="lede">
          Interactive pieces that sit outside the boards. Each one takes a single part of the engine and lets you play with
          it. More are on the way, and some will draw with things other than dots.
        </p>
        <nav className="toc" aria-label="Pieces">
          <ol>{EXPERIMENTS.map((x, k) => <li key={x.slug}><a href={`#${x.slug}`}><span>{pad(k + 1)}</span>{x.title}</a></li>)}</ol>
        </nav>
      </header>
      {EXPERIMENTS.map((x, k) => {
        const f = FIGS[x.slug]
        return (
          <section key={x.slug} className="sec" id={x.slug} aria-labelledby={`${x.slug}-h`}>
            <DotTitle text={x.title} num={pad(k + 1)} id={`${x.slug}-h`} />
            <p>{x.dek}</p>
            {f && <Figure id={x.slug} body={f.body} minHeight={f.minHeight} caption={f.caption} wide />}
          </section>
        )
      })}
      <SiteFoot name="LAB" />
    </main>
  )
}
