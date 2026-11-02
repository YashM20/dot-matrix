/**
 * Board · FRACTALS (#68, docs/IQ-PLAN.md IQ7): six fractals ported from Inigo Quilez's articles
 * (`src/engine/fractal`, imported by path), each an original framing.
 *
 *   escape time  JULIA (smooth count, c walking the cardioid, the Mandelbrot set as its map) · ORBIT TRAP
 *   density      POPCORN (after Pickover) · FLAME (chaos game + twist) · ICON (after Field and Golubitsky) ·
 *                LYAPUNOV (after Markus)
 *
 * Chrome as on the algorithms board: the label top-left, the source as a faint caption top-right, a footer with
 * one counter left and one stat right. One red on the board, always the live element: c on the map, the orbit
 * point nearest the trap, the grain, the chaos game's hop, the icon's orbit, the Lyapunov probe. Density pictures
 * are baked once (fixed seeded step counts) and cached; the escape-time Julia is the only per-frame field.
 */
import { frJulia, frTrap } from './fractals-escape'
import { frFlame, frIcon, frLyapunov, frPopcorn } from './fractals-density'

export const fractalsBoard = [frJulia, frTrap, frPopcorn, frFlame, frIcon, frLyapunov]
