/**
 * The dotted outline of the chrome's pills and switches (DISPLAY ▾, THEME ▾, CLACK, CONTRAST: MORE, the shared-link
 * switch): a stadium of 1 px dots on the pixel grid. The browser's own `dotted` border spaces its dots along the
 * curve, so the round ends land between pixels and look ragged. Here the outline is rasterised first (the edge
 * pixels of the filled stadium) and every other pixel round the loop is lit, so the ends read as clean as the
 * straight runs and every dot is a whole pixel.
 *
 * `dotRing` is a ref callback: it watches the element's size and sets `--ring` (an SVG mask, cached per size); the
 * CSS (`.dot-ring`, src/site/app/ring.css) paints it in `--ring-c`. The check is in scripts/verify/ux.ts.
 */

/** The lit pixels `[x, y]` of a `w` × `h` stadium outline (ends of radius h / 2), in order round the loop. */
export function ringDots(w: number, h: number): [number, number][] {
  if (w < h || h < 4) return []
  const r = h / 2, L = w - h
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    const dx = x + .5 - Math.min(Math.max(x + .5, r), w - r), dy = y + .5 - r
    return dx * dx + dy * dy <= r * r
  }
  const edge: [number, number][] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) edge.push([x, y])
  // the distance round the loop, clockwise from the top run's left end
  const along = ([px, py]: [number, number]) => {
    const x = px + .5, y = py + .5
    if (x > r && x < w - r) return y < r ? x - r : L + Math.PI * r + (w - r - x)
    if (x >= w - r) return L + (Math.atan2(y - r, x - (w - r)) + Math.PI / 2) * r
    const a = Math.atan2(y - r, x - r)
    return 2 * L + Math.PI * r + ((a < 0 ? a + 2 * Math.PI : a) - Math.PI / 2) * r
  }
  edge.sort((a, b) => along(a) - along(b))
  return edge.filter((_, i) => i % 2 === 0)
}

const masks = new Map<string, string>()
/** `ringDots` as a CSS `url()`: an SVG of 1 px squares, `w` × `h` px. */
export function ringMask(w: number, h: number): string {
  const k = `${w}x${h}`
  let m = masks.get(k)
  if (!m) {
    const d = ringDots(w, h).map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')
    m = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges"><path d="${d}"/></svg>`)}")`
    masks.set(k, m)
  }
  return m
}

let watch: ResizeObserver | undefined
/** Ref callback for a `.dot-ring` element: keeps its `--ring` in step with its size. */
export function dotRing(el: HTMLElement | null) {
  if (!el || typeof ResizeObserver === 'undefined') return
  watch ??= new ResizeObserver(entries => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0], t = e.target as HTMLElement
      if (box) t.style.setProperty('--ring', ringMask(Math.floor(box.inlineSize + .01), Math.round(box.blockSize)))
    }
  })
  watch.observe(el, { box: 'border-box' })
  return () => watch?.unobserve(el)
}
