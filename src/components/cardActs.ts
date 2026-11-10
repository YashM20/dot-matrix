/**
 * The mounted cards' actions, by X-ray key (`data-xr-key`, one per card instance). A card's strip (DotWidgetBar)
 * registers what its actions need; the row under the card (CardRow) sits outside the card's tree, finds its card's key
 * in the DOM and runs the action here. A row whose card isn't mounted yet (ALL's windowed slots) finds nothing.
 */
import type { CardAction } from './xray/store'

export interface CardActs {
  act: (a: CardAction) => void
  /** X-ray is on for this card (the menu's X-ray item is a checkbox). */
  xrOn: boolean
  /** The `xray` and `make` flags: the X-ray and REMIX items show only while they are on. */
  xray: boolean
  make: boolean
}

const live = new Map<string, CardActs>()

/** Register a card's actions; the returned cleanup removes them unless a newer render replaced them. */
export function setCardActs(key: string, acts: CardActs): () => void {
  live.set(key, acts)
  return () => { if (live.get(key) === acts) live.delete(key) }
}

export const cardActs = (key: string | undefined): CardActs | undefined => (key ? live.get(key) : undefined)
