import { useEffect, useMemo, useRef, useState } from 'react'
import type { Layer } from '../../engine/types'
import { contextEnv, IRError, irProgram, type IRProgram } from '../../engine/ir'
import { encodeShare, shareUrl, SHARE_GRIDS } from '../../lib/share'
import { tileStyle, type WidgetContext } from '../../widgets/types'
import { DotCanvas } from '../../components/DotCanvas'
import { Panel } from '../ui/kit'

const START = `// sun: follows your pointer, rays turning
let on = step(.001, pointer.x + pointer.y);
let x = u - mix(.5, pointer.x, on);
let y = v - mix(.5, pointer.y, on);
let d = length(x, y);
let rays = .5 + .5 * sin(atan(y, x) * 9 + t * 1.5 - d * 12);
smoothstep(.2, .17, d) + rays * smoothstep(.48, .2, d) * .6`
const GRID = SHARE_GRIDS.square, LATTICE = 3

function compile(src: string): { program?: IRProgram; error?: string } {
  try { return { program: irProgram(src, { mode: 'function' }) } }
  catch (e) { return { error: e instanceof IRError ? e.message : String(e) } }
}

/** Field IR: edit the program, the card follows; the same source opens in the DOTS tab. */
export default function FigIR() {
  const [src, setSrc] = useState(START)
  const compiled = useMemo(() => compile(src), [src])
  // keep drawing the last program that compiled while the source is broken
  const good = useRef<IRProgram>(compiled.program!)
  if (compiled.program) good.current = compiled.program
  const layers = useMemo(() => (ctx: WidgetContext): Layer[] => [{ field: good.current(contextEnv(ctx, GRID)), tone: 'auto', lattice: LATTICE }], [])
  const [href, setHref] = useState('./?tab=dots')
  useEffect(() => {
    let live = true
    if (compiled.program) encodeShare({ src, grid: 'square', lattice: LATTICE, tone: 'auto' }).then(e => { if (live) setHref(shareUrl(e, new URL('./', location.href).href)) }).catch(() => {})
    return () => { live = false }
  }, [src, compiled.program])
  const info = good.current?.info
  return (
    <div className="ir">
      <label className="ir-code">
        <span className="ctl-label">Field IR source ({new TextEncoder().encode(src).length} B)</span>
        <textarea value={src} spellCheck={false} rows={9} onChange={e => setSrc(e.target.value)} aria-describedby="ir-status" />
        <span id="ir-status" className={compiled.error ? 'ir-status ir-status--err' : 'ir-status'} role="status">
          {compiled.error ? `ERROR ${compiled.error}` : `OK · ${info?.nodes ?? 0} NODES · LATTICE ${LATTICE}×`}
        </span>
        <a className="ctl-link" href={href}>Open in the DOTS tab →</a>
      </label>
      <Panel label="THE PROGRAM, SAMPLED">
        <div className="stage stage--sq"><DotCanvas layers={layers} data={{ v: src.length }} grid={GRID} style={tileStyle} animated controls={[{ key: 'px', keyY: 'py', kind: 'xy', box: [0, 0, 144, 144], label: 'Pointer for the program' }]} onInput={() => {}} change={false} /></div>
      </Panel>
    </div>
  )
}
