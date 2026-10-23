/**
 * Browser-safe helpers shared by the instruments (no Node imports): the reference theme, card pitch,
 * the lit-dot test and centroid, and order statistics. `cards.ts` re-exports them; `fidelity.ts`
 * imports them from here so the Studio (P6-D) can run the same gates in the browser.
 */
import { dot480 } from '../../src/engine/theme/tokens'
import type { DotInstance, ThemeTokens } from '../../src/engine/types'
import type { WidgetPreset } from '../../src/widgets/types'

export const theme: ThemeTokens = dot480
export const pitchOf = (p: Pick<WidgetPreset, 'grid'>) => p.grid.pitch ?? theme.gridPx
export const visible = (d: DotInstance) => d.opacity > 0 && d.r > 0

/** Opacity·area-weighted centroid of lit dots, in card px (grid units). */
export function litCentroid(dots: DotInstance[]): [number, number] {
  let sx = 0, sy = 0, sw = 0
  for (const d of dots) if (visible(d)) { const w = d.opacity * d.r * d.r; sx += d.x * w; sy += d.y * w; sw += w }
  return sw ? [sx / sw, sy / sw] : [NaN, NaN]
}

export const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
export const quantile = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : NaN }
