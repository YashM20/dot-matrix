import { useMemo, useState } from 'react'
import type { DotStyle, Field, Layer } from '../../engine/types'
import { squircleExponent } from '../../engine/renderer/shapePath'
import { DotCanvas } from '../../components/DotCanvas'
import { Controls, Panel, Range } from '../ui/kit'

/** A ramp across, a soft bump on top: every value 0..1 shows up somewhere. */
const ramp: Field = (u, v) => Math.min(1, .08 + .8 * u + .25 * Math.exp(-((u - .7) ** 2 + (v - .5) ** 2) / .03))
const LAYERS: Layer[] = [{ field: ramp, tone: 'auto' }]
const source = () => LAYERS
const GRID = { cols: 18, rows: 7, pitch: 12 }

/** Quantize steps and the squircle exponent: two numbers that carry the whole look. */
export default function FigQuantize() {
  const [steps, setSteps] = useState(5)
  const [round, setRound] = useState(.25)
  const style = useMemo<DotStyle>(() => ({ shape: 'squircle', sizeMin: 1.2, sizeMax: 5.6, cornerRoundness: round, opacityMode: 'fromValue', quantizeSteps: steps }), [steps, round])
  const n = squircleExponent(round)
  return (
    <>
      <Panel label={`${steps ? `${steps} STEPS` : 'UNQUANTIZED'} · n = 2 + 30r² = ${n.toFixed(1)}`}>
        <div className="stage stage--wide"><DotCanvas layers={source} grid={GRID} style={style} renderer="svg" change={false} /></div>
      </Panel>
      <Controls>
        <Range label="Quantize steps" name="steps" value={steps} min={0} max={9} onChange={setSteps} format={v => (v ? String(v) : 'off')} />
        <Range label="Corner roundness r" name="roundness" value={round} min={0} max={1} step={.01} onChange={setRound} format={v => `${v.toFixed(2)} → n ${squircleExponent(v).toFixed(1)}`} />
      </Controls>
    </>
  )
}
