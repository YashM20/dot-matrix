/**
 * The page's last line of defence (#148): a React error boundary around each entry point's root (the app
 * `src/main.tsx`, the blog `src/blog/main.tsx`, the Lab `src/lab/main.tsx`). A render error anywhere below shows a
 * short recovery screen with RELOAD and a link home instead of a blank page. Parts with their own boundary (the
 * editor's `EditorBoundary`) catch first; this one only sees what nothing else caught.
 * Styles: `.root-crash` in root-boundary.css, matched to the editor's `.ed-crash`; each page's stylesheet
 * `@import`s it (src/index.css, src/blog/blog.css), so it never rides in a shared chunk's extra stylesheet.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface RootBoundaryProps {
  children?: ReactNode
  /** Which page this wraps (`app`, `blog`, `lab`): in the console line and on the screen's `data-page`. */
  page: string
}
interface State { error?: Error }

const messageOf = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200) || 'unknown error'

export class RootBoundary extends Component<RootBoundaryProps, State> {
  state: State = {}
  static getDerivedStateFromError(error: unknown): State { return { error: error instanceof Error ? error : new Error(messageOf(error)) } }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error(`${this.props.page} stopped:`, error, info.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main className="root-crash" role="alert" data-page={this.props.page}>
        <b>THIS PAGE STOPPED</b>
        <p>Something went wrong while drawing it: <code>{messageOf(error)}</code></p>
        <p>Reload to try again. If it keeps happening, the home page still works.</p>
        <div className="root-crash-btns">
          <button type="button" onClick={() => location.reload()}>RELOAD</button>
          <a href="/">GO HOME</a>
        </div>
      </main>
    )
  }
}
