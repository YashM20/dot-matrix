/**
 * The WebGL2 dot renderer (engine/renderer/webgl/dotgl + its shaders) loads only when a card needs it: a card whose
 * layers carry GPU passes (the GPU board, MATERIALS glass) or one forced to `webgl` from the X-ray. Every other card
 * draws on Canvas or SVG, so first load leaves it out. DotCanvas starts the fetch when such a card mounts, during its
 * entrance delay, and holds the card's first frame until it is settled.
 */
type DotGLModule = typeof import('../engine/renderer/webgl/dotgl')

/** null while not asked for or loading; `false` when the fetch failed (the card then draws on Canvas, as without WebGL2) */
let state: DotGLModule | false | null = null, loading: Promise<void> | null = null
const subs = new Set<() => void>()
const settle = (s: DotGLModule | false) => { state = s; subs.forEach(f => f()) }

/** The renderer once loaded, `false` if it failed to load, else null (a `useSyncExternalStore` snapshot). */
export const dotGL = (): DotGLModule | false | null => state
export function subscribeDotGL(f: () => void): () => void { subs.add(f); return () => { subs.delete(f) } }
/** Fetch the renderer, once. */
export function loadDotGL(): void {
  loading ??= import('../engine/renderer/webgl/dotgl').then(settle, (error: unknown) => {
    console.error('DotCanvas: the WebGL renderer failed to load, drawing on Canvas', error)
    settle(false)
  })
}
