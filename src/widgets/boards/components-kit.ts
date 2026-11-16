/**
 * The components board's drawing primitives, shared by the boards that borrow them (charts, dash, heartbeat,
 * motion, watch): dotted outlines, press and hover states, the marching focus ring. Their own module, so a board
 * that uses them loads this and not the whole components board (#214).
 */
/** The outline sites live in the engine's layout (`src/engine/layout.ts`); the state grammar in `../dot-controls.ts` (#358). */
export { rrect, stadium } from '../../engine/layout'
export { OUTLINE, PRESS, at, circle, clear, clock, dimmed, glow, marching, rr, states, ui, type Shape, type UiState } from '../dot-controls'
