/**
 * Likes for gallery programs (#169), under the remix graph in MAKE · CODE: the 8 seeds and the program that is
 * open, each with a like button. Programs are liked by content (`src/lib/likes/site.ts`); counts are public,
 * the programs themselves are never sent to a list.
 */
import { useSyncExternalStore } from 'react'
import type { Entry } from '../dwitter/gallery'
import { local, sendForget, setLocal, subscribeLocal } from './client'
import LikeButton from './LikeButton'

export default function GalleryLikes({ entries }: { entries: readonly Entry[] }) {
  const l = useSyncExternalStore(subscribeLocal, local, local)
  return <div className="lk-gallery">
    <ul aria-label="Like a program">
      {entries.map(e => <li key={e.id}><span className="lk-name">{e.name}</span><LikeButton program={e} name={`the program ${e.name}`} compact /></li>)}
    </ul>
    {l.c === 'r' && <button type="button" className="lk-forget" onClick={() => void sendForget().then(r => { if (r.ok) setLocal(null) })}>Forget this browser</button>}
  </div>
}
