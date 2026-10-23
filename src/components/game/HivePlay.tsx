/**
 * HIVE play mode: a full-screen overlay running the game sim at a fixed 60 Hz and drawing every
 * display frame through the dot pipeline (game layers → sampler → buffer canvas renderer).
 * Juice: whole-cell screen shake, dither-burst hit flashes, Bayer / IGN dissolves between stages
 * and a dot migration into the boss (all off under reduced motion). Pauses on blur; Escape quits.
 * Idle on the title for 20 s (or `&demo=1`) and the autopilot plays an attract demo.
 * Dev hook for the headless screenshots: `window.__hive`.
 */
import { useEffect, useRef, useState } from 'react'
import type { DotInstance, ThemeTokens } from '../../engine/types'
import { dot480 } from '../../engine/theme/tokens'
import { toDots } from '../../engine/buffer/dotBuffer'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { ditherEdge, masks, transitionDots, type Mask } from '../../engine/motion'
import { migrate, type Migration } from '../../engine/migrate'
import { layer, layoutFor } from '../../widgets/types'
import { BTN } from '../../game/buttons'
import { GameInput } from '../../game/input'
import { startLoop } from '../../game/loop'
import { gameLayers, gameStyle, shakeOffset } from '../../game/render'
import { enter, newGame, step, type Game, type Stage } from '../../game/sim'
import { autopilot } from '../../game/bot'
import { loadScores, saveScores } from '../../game/scores'
import { sound } from '../../game/sound'
import { GAME } from '../../game/world'
import { paint, sampleInto, surfaceFor, type Surface } from './dots'

const G = layoutFor(GAME)
/** Stage dissolves: which mask carries you into each stage. */
const INTO: Partial<Record<Stage, Mask>> = {
  corridor: ditherEdge(masks.radial), maze: masks.bayer, surface: ditherEdge(masks.wipe), void: masks.scan,
  over: masks.ign, win: masks.ign, entry: masks.bayer, scores: ditherEdge(masks.diagonal), title: masks.bayer,
}
const DISSOLVE_MS = 620, MIGRATE_MS = 950

// ── on-screen touch pad, drawn in dots ──────────────────────────────────────────────────────────
const PAD = { cols: 120, rows: 34 }
const P = layoutFor(PAD)
const PAD_KEYS: { b: number; x: number; y: number; r: number; label?: string }[] = [
  { b: BTN.up, x: 18, y: 7, r: 6 }, { b: BTN.down, x: 18, y: 27, r: 6 }, { b: BTN.left, x: 8, y: 17, r: 6 }, { b: BTN.right, x: 28, y: 17, r: 6 },
  { b: BTN.start, x: 60, y: 17, r: 5, label: 'START' }, { b: BTN.b, x: 91, y: 21, r: 7, label: 'B' }, { b: BTN.a, x: 108, y: 13, r: 8, label: 'A' },
]
function padBits(pts: Iterable<[number, number]>): number {
  let b = 0
  for (const [x, y] of pts) {
    // the d-pad reads as a stick: direction from its centre, diagonals allowed
    const dx = x - 18, dy = y - 17
    if (Math.hypot(dx, dy) < 17 && Math.hypot(dx, dy) > 2.5) {
      const a = Math.atan2(dy, dx), s = Math.PI / 8
      if (Math.abs(a) < 3 * s) b |= BTN.right
      if (Math.abs(a) > 5 * s) b |= BTN.left
      if (a > s && a < 7 * s) b |= BTN.down
      if (a < -s && a > -7 * s) b |= BTN.up
      continue
    }
    for (const k of PAD_KEYS.slice(4)) if (Math.hypot(x - k.x, y - k.y) < k.r * 1.5) b |= k.b
  }
  return b
}
function padLayers(held: number) {
  return PAD_KEYS.flatMap(k => [
    layer(P.dotDisc(k.x, k.y, k.r, { spacing: 2, size: 1.6 }), held & k.b ? 'value' : 'faint'),
    ...(k.label ? [layer(P.big(k.label, k.x, k.y + k.r + 2 > PAD.rows - 6 ? k.y - 2 : k.y + k.r + 1, { lattice: .9, align: 'center' }), 'mid')] : []),
  ])
}

interface Trans { t0: number; prev: DotInstance[]; mask: Mask | null; mig: Migration | null; target?: DotInstance[] }
declare global { interface Window { __hive?: Record<string, unknown> } }

export default function HivePlay({ theme = dot480, onClose }: { theme?: ThemeTokens; onClose: () => void }) {
  const screen = useRef<HTMLCanvasElement>(null), pad = useRef<HTMLCanvasElement>(null)
  const [touch, setTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  /** Buttons held on the touch pad (written by the pad, read by the game every step). */
  const touchBits = useRef(0)

  useEffect(() => {
    const canvas = screen.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const input = new GameInput(), params = new URLSearchParams(window.location.search)
    let g: Game = newGame(loadScores()), demo = params.get('demo') === '1', idle = 0, paused = false, dirty = true
    let lastStage = g.stage, trans: Trans | null = null, s: Surface, style = gameStyle(4)
    const times: number[] = []
    const fit = () => {
      const padH = touch ? 190 : 0, avail = window.innerHeight - 70 - padH
      const pitch = Math.max(1.5, Math.min(8, Math.floor(Math.min((window.innerWidth * .96) / GAME.cols, avail / GAME.rows) * 4) / 4))
      s = surfaceFor(canvas, GAME.cols, GAME.rows, pitch); style = gameStyle(pitch); dirty = true
    }
    fit()
    const detach = input.attach(window, () => { if (document.pointerLockElement) document.exitPointerLock(); closeRef.current() })
    const pause = () => { paused = true; dirty = true }
    const onVis = () => { if (document.hidden) pause() }
    window.addEventListener('blur', pause)
    window.addEventListener('resize', fit)
    document.addEventListener('visibilitychange', onVis)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    canvas.focus()

    const doStep = () => {
      input.touch = touchBits.current
      let inp = input.read()
      if (demo) {
        if (inp.b) { demo = false; g = newGame(loadScores()); lastStage = g.stage }
        else inp = autopilot(g)
      } else if (g.stage === 'title') {
        idle = inp.b ? 0 : idle + 1
        if (idle > 20 * 60) { demo = true; idle = 0; g = newGame(loadScores()) }
      }
      step(g, inp)
      if (!demo) { sound(g.events); if (g.events.includes('save')) saveScores(g.table) }
      dirty = true
    }
    const draw = () => {
      const now = performance.now()
      if (paused) {
        input.touch = touchBits.current
        const b = input.read().b
        if (b & (BTN.start | BTN.a)) { paused = false; input.keys = 0; dirty = true }
      }
      if (!dirty && !trans) return
      dirty = false
      const layers = gameLayers(g, { reduced, paused })
      if (demo && !paused) layers.push(layer(G.big('DEMO  PRESS ANY KEY', GAME.cols / 2, 136, { lattice: .72, align: 'center' }), 'idle'))
      if (g.stage !== lastStage) {
        if (!reduced && s.buf.n) {
          const prev = toDots(s.buf)
          if (g.stage === 'queen') {
            sampleInto(s, layers, style, theme)
            const target = toDots(s.buf)
            trans = { t0: now, prev, mask: null, mig: migrate(prev, target, { stagger: .35, arc: .25 }), target }
          } else trans = { t0: now, prev, mask: INTO[g.stage] ?? masks.bayer, mig: null }
        }
        lastStage = g.stage
      }
      sampleInto(s, layers, style, theme)
      if (trans) {
        const p = (now - trans.t0) / (trans.mig ? MIGRATE_MS : DISSOLVE_MS)
        if (p >= 1) trans = null
        else {
          const dots = trans.mig ? trans.mig.dots(p) : transitionDots(trans.prev, toDots(s.buf), { p, mask: trans.mask!, cols: GAME.cols, rows: GAME.rows, pitch: s.pitch, edge: .06 })
          paint(s, theme, [0, 0], ctx => renderCanvas(ctx, dots))
        }
      }
      if (!trans) paint(s, theme, shakeOffset(g, reduced))
      times.push(performance.now() - now)
      if (times.length > 600) times.shift()
    }
    const stop = startLoop({ step: doStep, draw, paused: () => paused })
    const pct = (p: number) => { const a = [...times].sort((x, y) => x - y); return +(a[Math.floor(a.length * p)] ?? 0).toFixed(2) }
    window.__hive = {
      get game() { return g },
      get demo() { return demo }, set demo(on: boolean) { demo = !!on },
      get paused() { return paused }, set paused(on: boolean) { paused = !!on; dirty = true },
      enter: (stage: Stage) => { enter(g, stage); dirty = true },
      /** Fast-forward with the autopilot until `until` is entered (or `max` steps); returns the stage. */
      run: (until: Stage, max = 20000) => { for (let i = 0; i < max && g.stage !== until; i++) { step(g, autopilot(g)) } dirty = true; return g.stage },
      steps: (n: number) => { for (let i = 0; i < n; i++) step(g, autopilot(g)); dirty = true; return g.stage },
      stats: () => ({ n: times.length, p50: pct(.5), p95: pct(.95), pitch: s.pitch, dots: s.buf.n }),
    }
    return () => {
      stop(); detach()
      window.removeEventListener('blur', pause); window.removeEventListener('resize', fit)
      document.removeEventListener('visibilitychange', onVis)
      document.body.style.overflow = prevOverflow
      delete window.__hive
    }
  }, [theme, touch])

  // the touch pad: pointer positions in pad cells → buttons, redrawn when they change
  useEffect(() => {
    const canvas = pad.current
    if (!touch || !canvas) return
    const pitch = Math.max(2, Math.min(5, Math.floor(((window.innerWidth * .96) / PAD.cols) * 4) / 4))
    const s = surfaceFor(canvas, PAD.cols, PAD.rows, pitch), k = pitch / 2.25
    const style = { shape: 'squircle' as const, sizeMin: .2 * k, sizeMax: .95 * k, cornerRoundness: .1, opacityMode: 'fromValue' as const, quantizeSteps: 5 }
    const pts = new Map<number, [number, number]>()
    let held = -1
    const redraw = () => {
      const b = padBits(pts.values())
      touchBits.current = b
      if (b === held) return
      held = b
      sampleInto(s, padLayers(b), style, theme); paint(s, theme)
    }
    const at = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * PAD.cols, ((e.clientY - r.top) / r.height) * PAD.rows] }
    const down = (e: PointerEvent) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, at(e)); redraw() }
    const move = (e: PointerEvent) => { if (pts.has(e.pointerId)) { pts.set(e.pointerId, at(e)); redraw() } }
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); redraw() }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
    redraw()
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up)
      touchBits.current = 0
    }
  }, [touch, theme])

  const onScreenPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') { setTouch(true); return }
    const h = window.__hive as { paused?: boolean; game?: Game } | undefined
    if (h?.paused) { h.paused = false; return }
    // optional mouse-look in the corridor
    if (h?.game?.stage === 'corridor' && !document.pointerLockElement) e.currentTarget.requestPointerLock?.()
  }
  return (
    <div className="hive-play" role="dialog" aria-modal="true" aria-label="HIVE, playable. Arrows or WASD move, Space fires or jumps, Enter starts, Escape quits.">
      <canvas ref={screen} className="hive-screen" tabIndex={0} aria-hidden="true" onPointerDown={onScreenPointer} />
      {touch && <canvas ref={pad} className="hive-pad" aria-hidden="true" />}
      <div className="hive-bar">
        <span>ARROWS / WASD · SPACE · SHIFT · ENTER · Q/E STRAFE · CLICK = MOUSE-LOOK</span>
        <button type="button" onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); onClose() }}>ESC  QUIT</button>
      </div>
    </div>
  )
}
