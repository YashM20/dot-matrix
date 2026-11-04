/**
 * Where pages mount likes (#169): behind the `likes` flag (off by default), loaded lazily so neither the button
 * nor BotID is in any first load. `VITE_FLAG_LIKES=kill` leaves the chunks out of the build.
 */
import { lazy, Suspense } from 'react'
import { useFlag } from '../../site/useFlag'
import type { Entry } from '../dwitter/gallery'

const Button = import.meta.env.VITE_FLAG_LIKES === 'kill' ? null : lazy(() => import('./LikeButton'))
const Gallery = import.meta.env.VITE_FLAG_LIKES === 'kill' ? null : lazy(() => import('./GalleryLikes'))

/** The like button for widget `uid`, by its stable id (renames keep their likes). */
export function WidgetLike({ uid, name }: { uid: string; name: string }) {
  const on = useFlag('likes')
  return on && Button ? <Suspense fallback={null}><Button item={`w:${uid}`} name={name} /></Suspense> : null
}

/** Like buttons for gallery programs. */
export function ProgramLikes({ entries }: { entries: readonly Entry[] }) {
  const on = useFlag('likes')
  return on && Gallery && entries.length ? <Suspense fallback={null}><Gallery entries={entries} /></Suspense> : null
}
