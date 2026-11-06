/**
 * The MATRIX mark: the M of the 5×7 dot font folded onto a 5×5 grid, the one accent at its centre. Generated from
 * the site's src/site/brand/mark.svg by scripts/registry/generate.ts. It follows the light or dark colour scheme; set
 * `--matrix-logo-on`, `--matrix-logo-off` or `--matrix-logo-accent` to recolour it.
 */
import type { SVGProps } from 'react'

const DOTS: [tone: string, cx: number, cy: number, r: number][] = [
  ['on', 2, 2, 1], ['off', 5, 2, 0.5], ['off', 8, 2, 0.5], ['off', 11, 2, 0.5], ['on', 14, 2, 1],
  ['on', 2, 5, 1], ['on', 5, 5, 1], ['off', 8, 5, 0.5], ['on', 11, 5, 1], ['on', 14, 5, 1],
  ['on', 2, 8, 1], ['off', 5, 8, 0.5], ['accent', 8, 8, 1.25], ['off', 11, 8, 0.5], ['on', 14, 8, 1],
  ['on', 2, 11, 1], ['off', 5, 11, 0.5], ['off', 8, 11, 0.5], ['off', 11, 11, 0.5], ['on', 14, 11, 1],
  ['on', 2, 14, 1], ['off', 5, 14, 0.5], ['off', 8, 14, 0.5], ['off', 11, 14, 0.5], ['on', 14, 14, 1],
]
const CSS = '.matrix-logo-on{fill:var(--matrix-logo-on,#F2F3F5)}.matrix-logo-off{fill:var(--matrix-logo-off,#2E3033)}.matrix-logo-accent{fill:var(--matrix-logo-accent,#FF3B30)}@media (prefers-color-scheme:light){.matrix-logo-on{fill:var(--matrix-logo-on,#1B1B19)}.matrix-logo-off{fill:var(--matrix-logo-off,#D1D1CF)}.matrix-logo-accent{fill:var(--matrix-logo-accent,#E43226)}}'

export interface MatrixLogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Width and height in px. Default 16 (the dots land on whole pixels at 16, 32, 48…). */
  size?: number
  /** Accessible name. Default "MATRIX"; pass `''` when a visible label sits next to it. */
  title?: string
}

export function MatrixLogo({ size = 16, title = 'MATRIX', className, ...svg }: MatrixLogoProps) {
  return (
    <svg
      viewBox="0 0 16 16" width={size} height={size} role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}
      className={className ? `matrix-logo ${className}` : 'matrix-logo'} {...svg}
    >
      <style>{CSS}</style>
      {DOTS.map(([tone, cx, cy, r]) => <circle key={`${cx},${cy}`} className={`matrix-logo-${tone}`} cx={cx} cy={cy} r={r} />)}
    </svg>
  )
}
