import { lazy, type ComponentType } from 'react'
import { Card } from '../essay/ui/Card'
import { pick, useLiveData } from '../data/useLiveData'
import { loadCard, type PostCard } from './cards'

/** A real card, as the essay's figures show them, with its board's live data when the board has any. */
function LiveCard({ card }: { card: PostCard }) {
  const live = useLiveData(card.sources)
  return <div className="stage stage--card"><Card preset={card.preset} data={card.sources ? pick(live, card.preset.defaults) : undefined} /></div>
}
const Missing = ({ id }: { id: string }) => <div className="post-todo" role="img" aria-label={`Card ${id}`}><span className="post-todo-kind">CARD</span><span className="post-todo-what">{id}</span></div>

/** One lazy component per card id (module-level, so its identity is stable across renders). */
const bodies = new Map<string, ComponentType>()
export function cardBody(id: string): ComponentType {
  let body = bodies.get(id)
  if (!body) {
    body = lazy(() => loadCard(id).then(card => ({ default: () => (card ? <LiveCard card={card} /> : <Missing id={id} />) })))
    bodies.set(id, body)
  }
  return body
}
