import { DotCanvas } from '../DotCanvas'
import { gridField } from '../../engine/fields/heatmapField'
import { dot480 } from '../../engine/theme/tokens'
import { useDrawBoard } from '../../hooks/useDrawBoard'
import { DrawCanvas } from './DrawCanvas'
import { DrawToolbar } from './DrawToolbar'
import { ReferencePanel } from './ReferencePanel'

export function DrawBoard() {
  const b = useDrawBoard(80, 80, 4)
  const style = { shape: 'squircle' as const, sizeMin: 0.3, sizeMax: 1.6, cornerRoundness: 0.72, quantizeSteps: 0 }
  const field = gridField(b.matrix)
  const grid = { cols: b.cols, rows: b.rows, pitch: b.pitch }
  const dotCount = b.matrix.flat().filter(v => v > 0).length
  const onAutoTrace = (m: number[][]) => {
    const stroke = m.flatMap((row, r) => row.map((v, c) => ({ idx: r * b.cols + c, prev: b.matrix[r]?.[c] ?? 0, next: v })).filter(d => d.prev !== d.next))
    b.setMatrix(m)
    if (stroke.length) b.pushStroke(stroke)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
      <DrawToolbar width={b.width} height={b.height} pitch={b.pitch} brush={b.brush} canUndo={b.canUndo} canRedo={b.canRedo} matrix={b.matrix} cols={b.cols} rows={b.rows} onResize={b.resize} onBrush={b.setBrush} onClear={b.clear} onUndo={b.undo} onRedo={b.redo} eraseMode={b.eraseMode} onEraseMode={b.setEraseMode} onLoadMatrix={b.loadMatrix} />
      <div className="draw-main" style={{ display: 'flex', gap: 16, alignItems: 'start', flexWrap: 'wrap' as const }}>
        <div className="draw-canvas-card" style={{ flex: '1 1 360px', minWidth: 320, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ font: '500 9px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em' }}>CANVAS — {b.cols}×{b.rows} @ {b.pitch}px · left paint / right erase</div>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <DrawCanvas matrix={b.matrix} cols={b.cols} rows={b.rows} pitch={b.pitch} brush={b.brush} eraseMode={b.eraseMode} refUrl={b.refUrl} overlay={b.overlay} refOpacity={b.refOpacity} onMatrixChange={b.setMatrix} pushStroke={b.pushStroke} />
          </div>
        </div>
        <div className="draw-ref" style={{ width: 340, flexShrink: 0 }}>
          <ReferencePanel refUrl={b.refUrl} overlay={b.overlay} refOpacity={b.refOpacity} cols={b.cols} rows={b.rows} onRefFile={b.setRefFromFile} onOpacity={b.setRefOpacity} onOverlay={b.setOverlay} onAutoTrace={onAutoTrace} />
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16 }}>
        <div style={{ font: '500 9px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', marginBottom: 12 }}>PREVIEW · gridField → Sampler → Renderer</div>
        <div style={{ background: '#000', borderRadius: 12, padding: 16, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            <DotCanvas field={field} grid={grid} style={style} theme={dot480} />
          </div>
        </div>
        <div style={{ marginTop: 8, font: '9px var(--mono)', color: 'var(--mute)' }}>{b.cols}×{b.rows} @ {b.pitch}px · {dotCount} dots</div>
      </div>
      <style>{`@media(max-width:900px){.draw-main{flex-direction:column}.draw-ref{width:100%!important}.draw-canvas-card{min-width:0!important}}`}</style>
    </div>
  )
}
