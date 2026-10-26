/**
 * The few words the X-ray (and later ABOUT) needs, in plain language (UX U2, docs/UX-PLAN.md §5.3).
 * Only lazy panels import this, so it stays out of the first load.
 */
export const GLOSSARY = {
  field: 'A function that gives every point of the card a value from 0 to 1. Every card is one or more fields, stacked as layers.',
  lattice: 'The grid of dot positions a field is sampled on. A coarser lattice (2×, 4×) gives fewer, bigger dots, for hero numbers and art.',
  site: 'A dot placed at an exact spot instead of on the grid, so dots can follow a ring or a path.',
  tone: 'Which colour a dot takes: idle, mid, faint, or the one accent. "auto" picks it from the value.',
  quantize: 'Snapping dot sizes to a few steps, so the card reads like a real display instead of a blur. Photos skip it.',
  IR: 'Field IR: a tiny expression language for fields. A card written in it opens as an editable program when you remix it.',
} as const
export type GlossaryTerm = keyof typeof GLOSSARY
export const GLOSSARY_TERMS = Object.keys(GLOSSARY) as GlossaryTerm[]
