/**
 * Board · SCENES (#69, docs/IQ-PLAN.md IQ8): small 3D scenes sphere-traced onto big dots, after Inigo Quilez's
 * articles on 3D distance functions, numerical normals, soft shadows, fog and outdoors lighting (src/engine/sdf3d,
 * imported by path). Every card is an original composition, a pure function of t, drawn on the CPU at card pitch.
 * One red a card, always one object: the inside of the vase, the ring on the column, the sun over the posts, the
 * bob on the chain.
 */
import type { WidgetPreset } from '../types'
import { scLathe, scTwist } from './scenes-objects'
import { scPosts, scChain } from './scenes-rooms'

export const scenesBoard: WidgetPreset[] = [scLathe, scTwist, scPosts, scChain]
