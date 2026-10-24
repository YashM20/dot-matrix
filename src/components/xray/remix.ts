/**
 * Remix in DOTS: turn any card into a Field IR program the DOTS tab can open. An IR-based card hands
 * over its own program (the biggest IR layer). Any other card gets a describe()-based stub: the card's
 * description as comments, its data as `let`s, and a small program that hints at its shape (ring,
 * text, bars …) so there is something moving to start from.
 */
import { describe } from '../../engine/describe'
import { encodeShare, type SharedProgram } from '../../lib/share'
import type { WidgetPreset } from '../../widgets/types'
import { layerIR } from './probe'

/** The card's own IR program, if it has one. */
export function cardIR(preset: WidgetPreset, data?: Record<string, number>): string | undefined {
  let layers
  try { layers = preset.layers({ t: 0, frame: 0, data: { ...preset.defaults, ...data }, grid: preset.grid }) } catch { return undefined }
  let best: string | undefined
  for (const l of layers) { const src = layerIR(l); if (src && (!best || src.length > best.length)) best = src }
  return best
}

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/
/** A stub program for a card without IR, seeded by its description. */
export function stubProgram(preset: WidgetPreset, data?: Record<string, number>): string {
  const d = describe(preset, { data: { ...preset.defaults, ...data } })
  const wrap = (s: string) => s.match(/.{1,72}(\s|$)/g)?.map(l => `// ${l.trim()}`) ?? []
  const lines = [`// remix of ${preset.name} (${preset.id}) — a stub: this card is not Field IR yet`, ...wrap(d.summary)]
  const keys = Object.keys(d.data).filter(k => KEY.test(k)).slice(0, 6)
  const v = keys[0] ? `clamp(data.${keys[0]}, 0, 1)` : '.5 + .5 * sin(t)'
  if (keys.length) lines.push(`// data: ${keys.map(k => `data.${k} = ${+d.data[k].toFixed(3)}`).join(', ')}`)
  const body = preset.group === 'polar'
    ? [`let x = u - .5; let y = v - .5;`, `let a = (atan(y, x) / TAU + .75) % 1;`, `let r = length(x, y);`, `let ring = smoothstep(.04, 0, abs(r - .36));`, `ring * (a < ${v} ? 1 : .3)`]
    : preset.group === 'chart'
      ? [`let bar = floor(u * 16);`, `let h = .5 + .4 * sin(bar * 1.7 + t * 2) * ${v};`, `(1 - v < h ? 1 : 0) * (u * 16 % 1 < .7 ? 1 : 0)`]
      : [`let x = u - .5; let y = v - .5;`, `let d = length(x, y);`, `let w = .5 + .5 * sin(d * 30 - t * 4);`, `w * smoothstep(.5, .1, d) * (.4 + .6 * ${v})`]
  return [...lines, ...body].join('\n')
}

/** The DOTS program for a card: its IR, else a stub. */
export function remixProgram(preset: WidgetPreset, data?: Record<string, number>): SharedProgram & { stub: boolean } {
  const ir = cardIR(preset, data)
  const wide = preset.grid.cols > preset.grid.rows * 1.4, tall = preset.grid.rows > preset.grid.cols * 1.4
  return { src: ir ?? stubProgram(preset, data), grid: wide ? 'wide' : tall ? 'tall' : 'square', lattice: ir ? 2 : 3, tone: 'auto', stub: !ir }
}

/** Encode a card's program into a `?tab=dots&p=…` query (the caller switches tabs). */
export async function remixQuery(preset: WidgetPreset, data?: Record<string, number>): Promise<{ query: string; stub: boolean }> {
  const { stub, ...p } = remixProgram(preset, data)
  let enc: string
  try { enc = await encodeShare(p) } catch { enc = await encodeShare({ ...p, src: p.src.slice(0, 4000) }) }
  return { query: `?tab=dots&p=${enc}`, stub }
}
