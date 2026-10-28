import { useMemo, useState } from 'react'
import type { Field, Layer } from '../../engine/types'
import { DotCanvas } from '../../components/DotCanvas'
import { useThemeTokens } from '../../site/theme/useTheme'
import { Controls, Panel, Range } from '../ui/kit'
import { figStyle } from '../ui/style'

/** A lit sphere over a floor: a field in u/v, so it has no resolution of its own. */
const sphere: Field = (u, v) => {
  const x = (u - .5) / .34, y = (v - .44) / .34, q = x * x + y * y
  if (q < 1) {
    const z = Math.sqrt(1 - q), l = Math.max(0, -.5 * x - .55 * y + .67 * z)
    return .12 + .88 * l ** 1.4
  }
  const fy = (v - .86) / .05, fx = (u - .53) / .3, f = fx * fx + fy * fy
  return f < 1 ? .35 * (1 - f) : 0
}
const LAYERS: Layer[] = [{ field: sphere, tone: 'auto' }]
const source = () => LAYERS

/** Why dots: the same field at any dot count. The constraint is the look. */
export default function FigResolution() {
  const theme = useThemeTokens()
  const [n, setN] = useState(24)
  const grid = useMemo(() => ({ cols: n, rows: n, pitch: 4 }), [n])
  return (
    <>
      <Panel label={`${n} × ${n} DOTS · ${n * n} SAMPLES`}>
        <div className="stage stage--sq"><DotCanvas theme={theme} layers={source} grid={grid} style={figStyle} change={false} /></div>
      </Panel>
      <Controls>
        <Range label="Dots per side" name="dots" value={n} min={8} max={72} onChange={setN} />
      </Controls>
    </>
  )
}
