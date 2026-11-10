/**
 * ALL (#315, was BROWSE #182): every card from every board in one grid, EXPLORE's view on `/`. This module is the
 * part the first load needs (the old path and the query keys); the grid, its data and the query parser load lazily
 * (`src/components/browse/`). Pure and DOM-free.
 */

/** BROWSE's old page: it redirects to `/` (vercel.json) and the app reads it as ALL (src/site/views.ts). */
export const BROWSE_PATH = '/browse/'
/** ALL's filters in the query: `tag` = a card tag, `q` = name search. ALL keeps them, other views drop them. BROWSE's
 * old `in=<board>` filter opens that board instead (src/site/views.ts). */
export const BROWSE_PARAMS = ['tag', 'q'] as const
