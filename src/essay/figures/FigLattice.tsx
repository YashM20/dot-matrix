import { useMemo, useState } from 'react'
import type { GridConfig, Layer } from '../../engine/types'
import { DotCanvas } from '../../components/DotCanvas'
import { layer, layoutFor, tileStyle } from '../../widgets/types'
import { Choice, Controls, Panel } from '../ui/kit'

const GRID: GridConfig = { cols: 112, rows: 60, pitch: 4 }
const T = layoutFor(GRID)
const STYLE = { ...tileStyle, sizeMin: .4, sizeMax: 1.7 }

/** The same "42" and the same ring: as clusters of small dots, or as fewer, bigger dots on their own lattice. */
const scenes: Record<'cluster' | 'lattice', Layer[]> = {
  cluster: [
    layer(T.text('42', 4, 14, { scale: 4 }), 'value'),
    layer(T.ring(84, 30, 20, { thickness: 3.2 }), 'mid'),
    layer(T.ring(84, 30, 20, { thickness: 3.2, sweep: Math.PI * 1.3 }), 'value'),
    layer(T.text('SCALE 4: 4×4 CLUSTERS', 4, 52), 'idle'),
  ],
  lattice: [
    layer(T.big('42', 4, 14, { lattice: 4 }), 'value'),
    layer(T.dotRing(84, 30, 20, { spacing: 4.4, size: 3.2 }), 'mid'),
    layer(T.dotRing(84, 30, 20, { spacing: 4.4, size: 3.2, sweep: Math.PI * 1.3 }), 'value'),
    layer(T.text('LATTICE 4 + RING SITES', 4, 52), 'idle'),
  ],
}

export default function FigLattice() {
  const [mode, setMode] = useState<'cluster' | 'lattice'>('cluster')
  const source = useMemo(() => () => scenes[mode], [mode])
  return (
    <>
      <Panel label={mode === 'cluster' ? 'CLUSTERS OF SMALL DOTS (WRONG)' : 'ONE BIGGER DOT PER FONT PIXEL (RIGHT)'}>
        <div className="stage stage--wide"><DotCanvas layers={source} grid={GRID} style={STYLE} renderer="svg" change="bayer" /></div>
      </Panel>
      <Controls>
        <Choice label="Bigger elements as" options={['cluster', 'lattice'] as const} value={mode} onChange={setMode} names={{ cluster: 'Clusters', lattice: 'Lattice + sites' }} />
      </Controls>
    </>
  )
}
