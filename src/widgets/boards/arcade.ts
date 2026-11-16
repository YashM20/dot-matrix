/**
 * Board: ARCADE, three small original games played on cards (issue #131). Each one learns in a few seconds, plays
 * in about thirty and restarts on a tap; best scores stay on the device.
 * - KNOCK: a rhythm memory game. Listen to a bar of knocks round a ring, then knock it back.
 * - HOPLINE: a one-button runner on two rails. Hop between them past breaks and posts.
 * - POISE: a turn-based balance puzzle. Put each weight on the left or right pan; three alike vanish.
 * The sims are pure and seeded (src/game/mini, checked by scripts/arcade.ts); `./arcade-kit.ts` runs them on the board
 * clock. Until the first press each card plays its own attract loop, a pure function of `t`. Red is the board's one
 * accent: the thing you control (the cursor, the runner, the weight in hand).
 */
import type { WidgetPreset } from '../types'
import { hoplineCard } from './arcade-hopline'
import { knockCard } from './arcade-knock'
import { poiseCard } from './arcade-poise'

export const arcadeBoard: WidgetPreset[] = [knockCard, hoplineCard, poiseCard]
