import { DotCanvas } from '../DotCanvas'
import { usePlayground } from './store'
import { getTheme, resolveCurrent } from './render'

export function PreviewCanvas() {
  const presetId = usePlayground(s => s.presetId)
  const pitch = usePlayground(s => s.pitch)
  const shape = usePlayground(s => s.shape)
  const sizeMin = usePlayground(s => s.sizeMin)
  const sizeMax = usePlayground(s => s.sizeMax)
  const cornerRoundness = usePlayground(s => s.cornerRoundness)
  const jitter = usePlayground(s => s.jitter)
  const quantizeSteps = usePlayground(s => s.quantizeSteps)
  const themeName = usePlayground(s => s.theme)
  const animated = usePlayground(s => s.animated)
  const photoField = usePlayground(s => s.photoField)
  const state = { presetId, pitch, shape, sizeMin, sizeMax, cornerRoundness, jitter, quantizeSteps, theme: themeName, animated, photoField } as Parameters<typeof resolveCurrent>[0]
  const widget = resolveCurrent(state)
  const theme = getTheme(state)
  return (
    <section className="pg-panel pg-preview">
      <h2>PREVIEW — {widget.name.toUpperCase()}</h2>
      <div id="pg-svg-host" className="pg-stage">
        <DotCanvas field={widget.field()} grid={widget.grid} style={widget.style} theme={theme} paint={widget.paint} animated={animated} />
      </div>
    </section>
  )
}
