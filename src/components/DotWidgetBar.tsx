/**
 * A card's strip in its top padding (split from DotWidget.tsx): the touch hint on a dots-only card and DONE while a
 * hold has the card. The card's actions sit in the row under the card (CardRow); the strip hands them over through
 * `setCardActs`, keyed by the card's X-ray key.
 */
import { useEffect } from 'react'
import type { CardAction } from './xray/store'
import { setCardActs } from './cardActs'

export interface DotWidgetBarProps {
  name: string
  /** The card's X-ray key (`data-xr-key`): the row under the card finds its actions by it. */
  cardKey: string
  /** The hint shown in the strip (a dots-only card has no header to hold it), and its touch wording. */
  hint?: string
  touchHint?: string
  /** A hold has the card: DONE lets go. */
  letGo: (() => void) | null
  /** X-ray is on for this card (the HOW item is a checkbox); `xray` / `make`: those items show at all. */
  xrOn: boolean
  xray: boolean
  make: boolean
  onAct: (a: CardAction) => void
}

export function DotWidgetBar({ name, cardKey, hint, touchHint, letGo, xrOn, xray, make, onAct }: DotWidgetBarProps) {
  // the row's actions run the card's latest closure (its data, layers and theme at the moment of the action)
  useEffect(() => setCardActs(cardKey, { act: onAct, xrOn, xray, make }), [cardKey, onAct, xrOn, xray, make])
  if (!hint && !letGo) return null
  return <div className="dot-card-bar">
    {hint && <small className="dot-card-hint" data-touch={touchHint} aria-hidden="true">{hint}</small>}
    {letGo && <button type="button" className="dot-card-done" aria-label={`${name}: let go of the card`} onClick={letGo}>DONE</button>}
  </div>
}
