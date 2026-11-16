/**
 * The chrome's icons, one module (DESIGN.md › Chrome components): the toolbar (PillBar.tsx: the widget page, NEXT
 * BOARD), the card row (CardRow.tsx) and the board picker. Inline SVG at 16 px with a 1.5 stroke in `currentColor`,
 * class `icon` (src/site/controls.css). Each icon is its own export, so a chunk carries only the paths it uses.
 * Small actions take an icon, never an arrow character or a bare word; the icon stays muted with its control.
 * Paths from Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors.
 */
import type { ReactNode } from 'react'

const Svg = ({ children }: { children: ReactNode }) => <svg className="icon" viewBox="0 0 24 24" width="16" height="16" fill="none"
  stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>

/** lucide: arrow-up-right (open a card's page) */
export const OpenIcon = () => <Svg><path d="M7 7h10v10" /><path d="M7 17 17 7" /></Svg>
/** lucide: link */
export const LinkIcon = () => <Svg><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Svg>
/** lucide: check (LINK's icon for a moment after a copy) */
export const CopiedIcon = () => <Svg><path d="M20 6 9 17l-5-5" /></Svg>
/** lucide: ellipsis (MORE) */
export const MoreIcon = () => <Svg><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></Svg>
/** lucide: pencil (REMIX) */
export const RemixIcon = () => <Svg><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></Svg>
/** lucide: share (SHARE: the system share sheet) */
export const ShareIcon = () => <Svg><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></Svg>
/** lucide: play */
export const PlayIcon = () => <Svg><path d="M6 3v18l14-9z" /></Svg>
/** lucide: scan-eye (X-RAY) */
export const XrayIcon = () => <Svg><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="1" /><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0" /></Svg>
/** lucide: chevron-left (back to a board) */
export const BackIcon = () => <Svg><path d="m15 18-6-6 6-6" /></Svg>
/** lucide: arrow-left (previous card) */
export const PrevIcon = () => <Svg><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Svg>
/** lucide: arrow-right (next card, next board) */
export const NextIcon = () => <Svg><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Svg>
