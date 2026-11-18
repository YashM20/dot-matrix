import { sampleLayers } from '../engine/sampler/gridSampler'
import { splitGPULayers, type GPUPass } from '../engine/renderer/webgl/passes'
import type { DotInstance, DotStyle, GridConfig, Layer, ThemeTokens } from '../engine/types'
import type { WidgetContext } from '../widgets/types'

/**
 * A GPU card's still frame (reduced motion, paused, off screen): its GPU passes plus the CPU dots of the other layers,
 * sampled with the static frame's context, so WebGL2 draws the card at its own density instead of the CPU fallback
 * (#241). Null when the frame has no pass or throws (the caller draws its CPU frame).
 */
export function gpuStill(layers: (ctx: WidgetContext) => Layer[], ctx: WidgetContext, grid: GridConfig, style: DotStyle, theme: ThemeTokens): { dots: DotInstance[]; passes: GPUPass[] } | null {
  try {
    const { cpu, passes } = splitGPULayers(layers(ctx), grid, style, grid.pitch ?? theme.gridPx)
    return passes.length ? { dots: sampleLayers(cpu, grid, style, theme), passes } : null
  } catch { return null }
}
