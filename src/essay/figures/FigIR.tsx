import { useEffect, useMemo, useState } from 'react'
import type { Layer } from '../../engine/types'
import type { Control } from '../../engine/context'
import { compileUntrusted, contextEnv, IRError, irGuard, type IRProgram } from '../../engine/ir'
import { encodeShare, shareUrl, SHARE_GRIDS } from '../../lib/share'
import { tileStyle, type WidgetContext } from '../../widgets/types'
import { DotCanvas } from '../../components/DotCanvas'
import { useThemeTokens } from '../../site/theme/useTheme'
import { Panel } from '../ui/kit'
import { flag } from '../../site/flags'

const START = `// sun: follows your pointer, rays turning
let on = step(.001, pointer.x + pointer.y);
let x = u - mix(.5, pointer.x, on);
let y = v - mix(.5, pointer.y, on);
let d = length(x, y);
let rays = .5 + .5 * sin(atan(y, x) * 9 + t * 1.5 - d * 12);
smoothstep(.2, .17, d) + rays * smoothstep(.48, .2, d) * .6`
const GRID = SHARE_GRIDS.square, LATTICE = 3
/** The whole card is a pointer pad (programs read `pointer.*`; no data key is kept). */
const POINTER: Control[] = [{ key: 'px', keyY: 'py', kind: 'xy', box: [0, 0, 144, 144], label: 'Pointer for the program' }]
const ignore = () => {}
/** The visitor's program runs under a time budget per frame; one too slow for this device is paused, not frozen. */
const guard = irGuard()

function compile(src: string): { program?: IRProgram; error?: string } {
  try { return { program: compileUntrusted(src) } }
  catch (e) { return { error: e instanceof IRError ? e.message : String(e) } }
}

/** Field IR: edit the program, the card follows; the same source opens in MAKE · CODE. */
export default function FigIR() {
  const theme = useThemeTokens()
  const [src, setSrc] = useState(START)
  const compiled = useMemo(() => compile(src), [src])
  // keep drawing the last program that compiled while the source is broken
  const [good, setGood] = useState<{ program: IRProgram; src: string }>(() => ({ program: compile(START).program!, src: START }))
  const edit = (next: string) => { setSrc(next); const c = compile(next); const p = c.program; if (p) setGood({ program: p, src: next }) }
  const [paused, setPaused] = useState('')
  useEffect(() => guard.watch((key, state) => { if (state === 'paused') setPaused(key) }), [])
  const layers = useMemo(() => (ctx: WidgetContext): Layer[] => {
    guard.begin()
    if (guard.state(good.src) === 'paused') return []
    return [{ field: guard.field(good.src, good.program.info.cost, good.program(contextEnv(ctx, GRID))), tone: 'auto', lattice: LATTICE }]
  }, [good])
  const [href, setHref] = useState('./?make=code')
  useEffect(() => {
    let live = true
    if (compiled.program) encodeShare({ src, grid: 'square', lattice: LATTICE, tone: 'auto' }).then(e => { if (live) setHref(shareUrl(e, new URL('./', location.href).href)) }).catch(() => {})
    return () => { live = false }
  }, [src, compiled.program])
  const info = good.program.info, stopped = paused === good.src
  return (
    <div className="ir">
      <label className="ir-code">
        <span className="ctl-label">Field IR source ({new TextEncoder().encode(src).length} B)</span>
        <textarea value={src} spellCheck={false} rows={9} onChange={e => edit(e.target.value)} aria-describedby="ir-status" />
        <span id="ir-status" className={compiled.error || stopped ? 'ir-status ir-status--err' : 'ir-status'} role="status">
          {compiled.error ? `ERROR ${compiled.error}` : stopped ? 'PAUSED · TOO SLOW TO DRAW ON THIS DEVICE · EDIT TO TRY AGAIN' : `OK · ${info?.nodes ?? 0} NODES · LATTICE ${LATTICE}×`}
        </span>
        {flag('make') && <a className="ctl-link" href={href}>Open in MAKE · CODE →</a>}
      </label>
      <Panel label="THE PROGRAM, SAMPLED">
        <div className="stage stage--sq"><DotCanvas theme={theme} layers={layers} grid={GRID} style={tileStyle} animated controls={POINTER} onInput={ignore} change={false} /></div>
      </Panel>
    </div>
  )
}
