import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

/** Mounted figure ids, for the headless check (`scripts/essay-browser.ts`). */
declare global { interface Window { essayMounted?: string[] } }

/**
 * A figure that loads its own chunk and mounts only when it scrolls near the viewport, so the
 * first view ships prose and the title and nothing else. The placeholder keeps the figure's box
 * (no layout shift). Once mounted it stays mounted; off-screen animated cards pause themselves.
 */
export function Figure({ id, body: Body, caption, wide, minHeight = 320 }: {
  id: string
  /** A `React.lazy` component made at module level (its chunk is fetched on first render). */
  body: ComponentType
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
        {near ? <Suspense fallback={<div className="fig-wait" style={{ minHeight }} aria-hidden="true" />}><Body /></Suspense> : <div className="fig-wait" aria-hidden="true" />}
      </div>
      {caption && <figcaption data-fig={id}>{caption}</figcaption>}
    </figure>
  )
}

