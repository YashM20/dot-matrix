import { useEffect, useState } from 'react'

type Blurbs = typeof import('../widgets/blurbs')
let blurbs: Blurbs | undefined
const loadBlurbs = () => import('../widgets/blurbs').then(m => (blurbs = m))

/** The one-line board and group descriptions (`widgets/blurbs`): their own chunk, so `undefined` until it lands. */
export function useBlurbs(): Blurbs | undefined {
  const [m, setM] = useState(blurbs)
  useEffect(() => { if (!m) void loadBlurbs().then(setM) }, [m])
  return m
}
