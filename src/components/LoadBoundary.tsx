/**
 * Catches a chunk that failed to load (a board, a card's board in BROWSE) and shows `fallback` in its place, so one
 * missing chunk doesn't stop the whole page (`RootBoundary`). The board loader (`widgets/manifest.ts`) already
 * retried and keeps the failure for a while, so nothing here refetches; RELOAD (`LoadFailed`) is the way to retry.
 */
import { Component, type ReactNode } from 'react'

interface Props { children?: ReactNode; fallback: ReactNode }
export class LoadBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('a chunk failed to load:', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** The error state: what failed, a likely reason and RELOAD. Styles: `.load-failed` (src/site/root-boundary.css). */
export const LoadFailed = ({ what, className = '' }: { what: string; className?: string }) => (
  <div className={`load-failed ${className}`.trim()}>
    <p>{what} didn’t load. The site may have just updated.</p>
    <button type="button" onClick={() => location.reload()}>RELOAD</button>
  </div>
)
