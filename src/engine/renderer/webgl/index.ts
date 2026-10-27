/**
 * WebGL2 renderer (P5): instanced superellipse quads, analytic AA, palette uniform; explicit dots
 * from an instance buffer, lattice passes from a value texture with positions derived from the
 * instance index; Field IR passes evaluated on the GPU (`emitGLSL`). See DESIGN.md › renderer rule.
 */
export { DotGL, renderWebGL, sharedDotGL, webglReady, parseColor, type RenderOptions as WebGLRenderOptions } from './dotgl'
export { gpuIR } from './gpuIR'
export { gpuValues, gpuTag, hasGPULayers, layerPass, passDots, passToDots, splitGPULayers, type GPUField, type GPUPass, type GPUTag } from './passes'
