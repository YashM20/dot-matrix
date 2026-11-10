/**
 * BROWSE (#182): every card from every board in one grid, at `/browse/`. This module is the part the first load
 * needs (the path, the query keys and the page meta); the view, its data and the query parser load lazily
 * (`src/components/browse/`). Pure and DOM-free: `scripts/site/postbuild.ts` builds `dist/browse/index.html` from it.
 */
// types only: the BROWSE chunk must not pull `./meta` at run time (it would split it out of the first-load entry)
import type { PageMeta } from './meta'

export const BROWSE_PATH = '/browse/'
/** The filters in the query: `in` = a board id, `tag` = a card tag, `q` = name search. BROWSE keeps them, other views drop them. */
export const BROWSE_PARAMS = ['in', 'tag', 'q'] as const

export const BROWSE_META: PageMeta = {
  title: 'Browse every card · Matrix', // `searchTitle(…, SITE_NAME)` (scripts/verify/ux.ts checks they agree)
  description: 'Every dot-matrix card from every MATRIX board on one page. Filter by board or tag, or search by name, then open a card or its board.',
  path: BROWSE_PATH,
  image: '/og/default.png',
}
