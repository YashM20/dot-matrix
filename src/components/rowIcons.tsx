/**
 * The card row's icons (CardRow.tsx): open, link, copied and more, as inline SVG at 16 px with a 1.5 stroke in
 * `currentColor`. The phone tab bar's 5 × 5 dot glyphs can't draw a chain link that reads at this size, so these
 * use Lucide's paths.
 * Paths from Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors.
 */
import type { ReactNode } from 'react'

const Svg = ({ children }: { children: ReactNode }) => <svg className="dot-card-row-icon" viewBox="0 0 24 24" width="16" height="16" fill="none"
  stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>

/** lucide: arrow-up-right */
export const OpenIcon = () => <Svg><path d="M7 7h10v10" /><path d="M7 17 17 7" /></Svg>
/** lucide: link */
export const LinkIcon = () => <Svg><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Svg>
/** lucide: check (LINK's icon for a moment after a copy) */
export const CopiedIcon = () => <Svg><path d="M20 6 9 17l-5-5" /></Svg>
/** lucide: ellipsis */
export const MoreIcon = () => <Svg><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></Svg>
