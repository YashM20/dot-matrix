/**
 * Board · OLDSCHOOL: demo effects from the late 1990s, after three of Inigo Quilez's articles (src/engine/oldschool):
 * plane deformations (a tunnel, a flower, a floor, a star), 2D dynamic clouds and the feedback effect. Every card is an
 * original composition and a pure function of t; the feedback card replays a fixed-dt texture from a known start.
 * One red, at most one element a card: a lit brick, the sun on the horizon, the sun over the clouds, the source in the
 * feedback border.
 */
import type { WidgetPreset } from '../types'
import { osBloom, osFloor, osStar, osTunnel } from './oldschool-deform'
import { osEcho } from './oldschool-echo'
import { osSky } from './oldschool-sky'

export const oldschoolBoard: WidgetPreset[] = [osTunnel, osBloom, osFloor, osSky, osEcho, osStar]
