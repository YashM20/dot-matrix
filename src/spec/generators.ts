/**
 * Param signatures of the layout generators a spec may name (`layoutFor(grid)[name](...params)`).
 * One code per position: `n` number, `N` number[], `pts` [x, y][], `rows` sprite rows, `s` string,
 * `icon` icon name, `ringOpts` / `iconOpts` option objects. Mirrored in the JSON Schema.
 */
import type { LayoutGenerator } from '../widgets/types'

export type ParamType = 'n' | 'N' | 'pts' | 'rows' | 's' | 'icon' | 'ringOpts' | 'iconOpts'
export interface Signature { req: ParamType[]; opt: ParamType[] }
const n = (k: number): ParamType[] => Array(k).fill('n')
export const GENERATOR_PARAMS: Record<LayoutGenerator, Signature> = {
  dot: { req: n(2), opt: n(1) },
  rect: { req: n(4), opt: n(1) },
  hrule: { req: n(3), opt: n(2) },
  vrule: { req: n(3), opt: n(2) },
  disc: { req: n(3), opt: n(1) },
  ring: { req: n(3), opt: ['ringOpts'] },
  box: { req: n(4), opt: n(2) },
  sprite: { req: ['rows', 'n', 'n'], opt: n(1) },
  bars: { req: ['N', ...n(3)], opt: n(3) },
  cbars: { req: ['N', ...n(3)], opt: n(2) },
  line: { req: ['pts'], opt: n(2) },
  icon: { req: ['icon', ...n(3)], opt: ['iconOpts'] },
  cjk: { req: ['s', ...n(3)], opt: [] },
}
export const RING_OPTS = ['thickness', 'start', 'sweep', 'value', 'every'] as const
export const ICON_OPTS = { fill: 'boolean', stroke: 'number' } as const
