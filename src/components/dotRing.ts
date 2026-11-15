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
  const r = h / 2, edge: [number, number][] = []
  const inside = (x: number, y: number) => {
    const dx = x + .5 - Math.min(Math.max(x + .5, r), w - r), dy = y + .5 - r
    return x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= r * r
  }
  if (w >= h && h > 3) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) edge.push([x, y])
  // the shape is convex, so the angle from its centre orders the outline round the loop; its pixel count is even
  // (two mirrored ends, two runs of one length), so lighting every other one never puts two dots side by side
  const at = ([x, y]: [number, number]) => Math.atan2(y + .5 - r, x + .5 - w / 2)
  return edge.sort((p, q) => at(p) - at(q)).filter((_, i) => i % 2 === 0)
}

const masks = new Map<string, string>()
/** `ringDots` as a CSS `url()`: an SVG of 1 px squares, `w` × `h` px (cached per size). */
const ringMask = (w: number, h: number) => masks.get(`${w} ${h}`) ?? masks.set(`${w} ${h}`, `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${ringDots(w, h).map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')}"/></svg>`)}")`).get(`${w} ${h}`)!

let watch: ResizeObserver | undefined
/** Ref callback for a `.dot-ring` element: keeps its `--ring` in step with its size. */
export function dotRing(el: HTMLElement | null) {
  if (!el) return
  watch ??= new ResizeObserver(entries => {
    for (const e of entries) {
      const box = e.borderBoxSize[0]
      ;(e.target as HTMLElement).style.setProperty('--ring', ringMask(Math.floor(box.inlineSize + .01), Math.round(box.blockSize)))
    }
  })
  watch.observe(el, { box: 'border-box' })
  return () => watch?.unobserve(el)
}

/** The header's dotted pills (DISPLAY ▾, THEME ▾, CLACK) are first-load code, which keeps this module out: the idle
 * command layer rings them, and again when the skin changes (CLACK comes and goes). Until then they keep the browser's
 * dotted border (ring.css). */
export function ringHeader() {
  document.querySelectorAll<HTMLElement>('.topbar .dot-ring').forEach(el => { dotRing(el) })
}
