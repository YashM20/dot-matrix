import type { DotStyle } from '../../engine/types'

/** UI dots (quantized, the default squircle) for figure canvases. */
export const figStyle: DotStyle = { shape: 'squircle', sizeMin: .3, sizeMax: 1.55, cornerRoundness: .25, opacityMode: 'fromValue', quantizeSteps: 5 }
