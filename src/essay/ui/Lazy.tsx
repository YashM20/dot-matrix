import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'

/** Mounted figure ids, for the headless check (`scripts/essay-browser.ts`). */
declare global { interface Window { essayMounted?: string[] } }

type Loader = () => Promise<{ default: ComponentType }>
const bodies = new Map<Loader, LazyExoticComponent<ComponentType>>()
/** One lazy component per loader, made once (never during a render pass that could repeat). */
const bodyOf = (load: Loader) => { let b = bodies.get(load); if (!b) bodies.set(load, (b = lazy(load))); return b }

/**
 * A figure that loads its own chunk and mounts only when it scrolls near the viewport, so the
 * first view ships prose and the title and nothing else. The placeholder keeps the figure's box
 * (no layout shift). Once mounted it stays mounted; off-screen animated cards pause themselves.
 */
export function Figure({ id, load, caption, wide, minHeight = 320 }: {
  id: string
  load: Loader
  caption?: ReactNode
  wide?: boolean
  minHeight?: number
}) {
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setNear(true) }, { rootMargin: '240px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  useEffect(() => { if (near) (window.essayMounted ??= []).push(id) }, [near, id])
  return (
    <figure ref={ref} id={`fig-${id}`} className={`fig${wide ? ' fig--wide' : ''}`} data-fig={id} data-mounted={near ? '1' : '0'}>
      <div className="fig-body" style={near ? undefined : { minHeight }}>
        {near ? <Suspense fallback={<div className="fig-wait" style={{ minHeight }} aria-hidden="true" />}><Lazy load={load} /></Suspense> : <div className="fig-wait" aria-hidden="true" />}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** Renders the figure's lazily loaded body (a stable component per loader). */
function Lazy({ load }: { load: Loader }) {
  const Body = bodyOf(load)
  return <Body />
}
