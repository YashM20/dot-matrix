/**
 * App events for analytics (#151), from the command layer: board, theme and skin changes, sent through `track()`.
 * Ids and names only; `src/site/analytics/sanitize.ts` drops anything else.
 */
import { useEffect, useRef } from 'react'
import { track } from '../../site/analytics'
import { getTheme, subscribeTheme } from '../../site/theme/theme'
import { getSkin, subscribeSkin } from '../skins/store'

/** Board, theme and skin changes as events (not the first value: that is the page view's). */
export function useTrackEvents(board: string) {
  const last = useRef(board)
  useEffect(() => {
    if (board === last.current) return
    last.current = board
    track('board_changed', { board })
  }, [board])
  useEffect(() => {
    let t = getTheme()
    return subscribeTheme(() => {
      const n = getTheme()
      if (n.scheme !== t.scheme || n.accent !== t.accent || n.contrast !== t.contrast) track('theme_changed', { scheme: n.scheme, accent: n.accent, contrast: n.contrast ?? 'system' })
      t = n
    })
  }, [])
  useEffect(() => {
    let s = getSkin()
    return subscribeSkin(() => { const n = getSkin(); if (n !== s) { s = n; track('skin_changed', { skin: n }) } })
  }, [])
}
