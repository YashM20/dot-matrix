/**
 * Niche algorithms as dot sources (docs/ALGORITHMS.md): weighted Voronoi stippling (sites), strange-attractor
 * density (a histogram field), Wave Function Collapse (a tile history) and diffusion-limited aggregation
 * (a growth order). Each is plain, seeded TypeScript that returns arrays; cards turn them into `Layer`s.
 */
export * from './stipple'
export * from './attractor'
export * from './wfc'
export * from './dla'
