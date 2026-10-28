/**
 * Which scheme a card renders in (docs/LAYOUT-THEME-PLAN.md §4 "Theme versus display skin", Runtime path step 7).
 * A dark page shows every card dark. On a light page a card stays dark, as a pinned inset
 * (`data-scheme="dark"` + the page's accent on the card), when light would make it a negative or a lie:
 *  - photos and halftones (`group: 'photo'`) and the live camera (`media: 'camera'`) would print as negatives on paper;
 *  - an emissive display skin (CRT, VFD, LED, Nixie: the skins that add light) is dark glass, so its cards are
 *    dark with the accent's dots; Nixie's neon stays orange (skin physics).
 * Reflective skins (e-ink, flip-disc) and every other card follow the page.
 */
import { SKINS, type SkinName } from '../../engine/display/names'
import type { WidgetPreset } from '../../widgets/types'
import type { Scheme } from './names'

export const darkInset = (p: Pick<WidgetPreset, 'group' | 'media'>, skin: SkinName): boolean =>
  p.group === 'photo' || p.media === 'camera' || SKINS[skin].blend === 'screen'
export const cardScheme = (p: Pick<WidgetPreset, 'group' | 'media'>, page: Scheme, skin: SkinName): Scheme =>
  page === 'light' && !darkInset(p, skin) ? 'light' : 'dark'
