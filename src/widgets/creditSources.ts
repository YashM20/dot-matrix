/**
 * Credits that more than one card carries (`credit` on a preset, DESIGN.md "Credit line"). A card's single-use credit
 * sits on the card itself. `scripts/site/credits.ts` turns all of them into docs/CREDITS.md.
 */
import type { WidgetCredit } from './types'

/** The concept screens the first seven boards rebuild; later boards grew from two of their cards. */
const HENRY_POST = 'https://x.com/henry19840301/status/2090273665669874050'
export const HENRY_AFTERLIGHT: WidgetCredit = { by: ['Henry Li'], title: 'ESP-Mosaico concept screens', source: HENRY_POST, note: 'grown from his Afterlight face' }
export const HENRY_LEVEL: WidgetCredit = { by: ['Henry Li'], title: 'ESP-Mosaico concept screens', source: HENRY_POST, note: 'grown from his LEVEL 03 screen' }

export const GRAY_SCOTT: WidgetCredit = {
  by: ['John E. Pearson', 'Peter Gray', 'Stephen K. Scott'], title: 'Complex patterns in a simple system (1993)',
  source: 'https://doi.org/10.1126/science.261.5118.189', note: 'the Gray-Scott model and its pattern map',
}
export const DLA: WidgetCredit = {
  by: ['Thomas A. Witten', 'Leonard M. Sander'], title: 'Diffusion-limited aggregation, a kinetic critical phenomenon (1981)',
  source: 'https://doi.org/10.1103/PhysRevLett.47.1400', note: 'the growth model',
}
export const STABLE_FLUIDS: WidgetCredit = { by: ['Jos Stam'], title: 'Stable fluids (1999)', source: 'https://doi.org/10.1145/311535.311548', note: 'the fluid solver' }
export const PBD: WidgetCredit = {
  by: ['Matthias Müller', 'Bruno Heidelberger', 'Marcus Hennix', 'John Ratcliff'], title: 'Position based dynamics (2007)',
  source: 'https://doi.org/10.1016/j.jvcir.2007.01.005', note: 'the solver',
}
export const KAJIYA_KAY: WidgetCredit = {
  by: ['James T. Kajiya', 'Timothy L. Kay'], title: 'Rendering fur with three dimensional textures (1989)',
  source: 'https://doi.org/10.1145/74334.74361', note: 'the sheen along the fibres',
}
export const ELIAS_WATER: WidgetCredit = {
  by: ['Hugo Elias'], title: '2D water', source: 'https://web.archive.org/web/2016/http://freespace.virgin.net/hugo.elias/graphics/x_water.htm',
  note: 'the ripple scheme',
}
export const SPLIT_FLAP: WidgetCredit = { by: ['Solari di Udine'], title: 'Split-flap display', source: 'https://en.wikipedia.org/wiki/Split-flap_display', note: 'the flap boards this mimics' }
export const TEENAGE_ENGINEERING: WidgetCredit = { by: ['Teenage Engineering'], title: 'OP-1 and pocket operator industrial design', source: 'https://teenage.engineering/', note: 'the device style the board follows' }
/** The two code-golf sites the Field IR cards (and MAKE · CODE) take their idea from. The programs are our own. */
export const TINY_PROGRAMS: readonly WidgetCredit[] = [
  { by: ['Martin Kleppe'], title: 'tixy.land', source: 'https://tixy.land/', note: 'one small program drives the whole card; this program is our own' },
  { by: ['lionleaf'], title: 'Dwitter', source: 'https://www.dwitter.net/', note: 'demos in 140 characters' },
]
