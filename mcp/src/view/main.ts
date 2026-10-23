/**
 * `ui://dot-card/heartbeat`: the live Agent Heartbeat card inside an MCP Apps host. The agent only
 * sends `{ state, label? }` (tool input / tool result); the card is the engine's own pipeline
 * (preset layers → sampleLayers → renderCanvas) on a canvas. No network, no eval, no framework.
 */
import { dot480 } from '../../../src/engine/theme/tokens'
import { sampleLayers } from '../../../src/engine/sampler/gridSampler'
import { renderCanvas } from '../../../src/engine/renderer/canvasRenderer'
import { DataSprings } from '../../../src/engine/motion/spring'
import { describe } from '../../../src/engine/describe'
import { withChrome } from '../../../src/widgets/types'
import { heartbeatCard, HEARTBEAT_STATES, type HeartbeatState } from '../../../src/widgets/boards/heartbeat'
import { connectBridge } from './bridge'

const theme = dot480, PAD = 14, FPS = 30, HALFLIFE = .12
const canvas = document.getElementById('card') as HTMLCanvasElement
const live = document.getElementById('live') as HTMLElement
const g = canvas.getContext('2d')!
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

let state: HeartbeatState = 'thinking', label: string | undefined
const springs = new DataSprings(HALFLIFE)
const t0 = performance.now()
const now = () => (performance.now() - t0) / 1000
springs.set({ state: 0 }, 0)

/** Test/automation hook: what the card currently shows (read by `mcp/test/headless.ts`). */
const probe: { state: HeartbeatState; label?: string; frames: number; lit: number; summary: string; initialized: boolean; host: string } = { state, label, frames: 0, lit: 0, summary: '', initialized: false, host: '' }
;(window as unknown as { __dotCard: typeof probe }).__dotCard = probe

function apply(args: Record<string, unknown>) {
  const st = String(args.state ?? '') as HeartbeatState
  if (HEARTBEAT_STATES.includes(st)) state = st
  if (typeof args.label === 'string') label = args.label.slice(0, 64) || undefined
  else if ('state' in args) label = undefined
  const index = HEARTBEAT_STATES.indexOf(state)
  // reduced motion: re-target "long ago" so the spring is already at its goal (a cut, no glide)
  springs.set({ state: index }, reducedMotion ? -1e3 : now())
  const d = describe(heartbeatCard(label), { state, data: { state: index } })
  probe.state = state; probe.label = label; probe.summary = d.summary
  canvas.setAttribute('aria-label', d.summary)
  live.textContent = d.summary
}

function size() {
  const p = heartbeatCard(label), pitch = p.grid.pitch ?? theme.gridPx
  const cardW = p.grid.cols * pitch + PAD * 2, cardH = p.grid.rows * pitch + PAD * 2
  const cssW = Math.min(cardW, Math.max(200, document.documentElement.clientWidth || cardW)), k = cssW / cardW
  const dpr = Math.min(3, devicePixelRatio || 1)
  canvas.style.width = `${cssW}px`; canvas.style.height = `${cardH * k}px`
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cardH * k * dpr)
  return { k: k * dpr, cardW, cardH }
}
let geo = size()
addEventListener('resize', () => { geo = size(); draw(now()) })

function draw(tSec: number) {
  const t = reducedMotion ? 0 : Math.floor(tSec * FPS) / FPS
  const p = heartbeatCard(label), data = { ...p.defaults, ...springs.at(tSec) }
  const dots = sampleLayers(withChrome(p)({ t, data, state, reducedMotion }), p.grid, p.style, theme)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = theme.bg; g.fillRect(0, 0, canvas.width, canvas.height)
  g.setTransform(geo.k, 0, 0, geo.k, 0, 0)
  g.fillStyle = theme.surface; g.beginPath(); g.roundRect(0, 0, geo.cardW, geo.cardH, theme.cornerRadiusCard); g.fill()
  g.translate(PAD, PAD)
  renderCanvas(g, dots)
  probe.frames++; probe.lit = dots.filter(d => d.r > 0 && d.opacity > 0).length
}
function loop() { draw(now()); if (!reducedMotion || !springs.settled(now())) requestAnimationFrame(loop) }

const bridge = connectBridge({
  onToolInput: (args, partial) => { if (!partial) apply(args); if (reducedMotion) requestAnimationFrame(loop) },
  onToolResult: result => {
    const sc = result.structuredContent as Record<string, unknown> | undefined
    if (sc) apply(sc)
    if (reducedMotion) requestAnimationFrame(loop)
  },
})
bridge.ready.then(r => {
  probe.initialized = true
  probe.host = String((r.hostInfo as { name?: string } | undefined)?.name ?? '')
  bridge.sizeChanged(Math.ceil(parseFloat(canvas.style.width)), Math.ceil(parseFloat(canvas.style.height)))
}, () => { /* not inside a host (opened directly): the card still runs */ })
apply({ state })
requestAnimationFrame(loop)
