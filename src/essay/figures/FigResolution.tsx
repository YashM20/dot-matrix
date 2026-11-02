import { useMemo, useState } from 'react'
import type { Layer } from '../../engine/types'
import { DotCanvas } from '../../components/DotCanvas'
import { useThemeTokens } from '../../site/theme/useTheme'
import { Controls, Panel, Range } from '../ui/kit'
import { figStyle } from '../ui/style'
import { sphere } from './fields'

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
