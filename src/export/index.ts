/** Export outputs (app-level, not engine): APNG / GIF / WebM / MP4 clips and plotter SVG. */
export { APNGWriter, encodePNG } from './apng'
export { GIFWriter, paletteFromTones, lzwEncode } from './gif'
export { muxWebM, type VideoChunk } from './webm'
export { muxMP4 } from './mp4'
export { plotterSVG, tour, type PlotResult, type PlotterOptions } from './plotter'
export { recordClip, type Clip, type ClipFormat, type ClipOptions, type ClipSource } from './record'
export { layerSource, presetSource, themeTones, type Sweep } from './source'
