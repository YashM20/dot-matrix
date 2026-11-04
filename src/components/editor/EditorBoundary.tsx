/**
 * The editor's recovery screen (#143): a React error boundary around what the editor draws from its document.
 * A render crash (a document that passed its checks and still breaks a panel) shows what broke and a RESET
 * EDITOR DOCUMENT action instead of a blank page. Reset replaces the saved document (`dot480.editor.v1`) with
 * the first one a visitor sees and reloads; UNDO AND TRY AGAIN steps back one edit and renders again.
 * Styles: `.ed-crash` in editor.css.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { resetEditorDoc, useEditor } from './store'

export interface BoundaryProps {
  children?: ReactNode
  /** Which part of the editor this wraps (shown on the screen, and in the console line). */
  area?: string
  /** Called by RESET EDITOR DOCUMENT after the saved document is replaced (default: reload the page). */
  onReset?: () => void
}
interface State { error?: Error }

export const RESET_LABEL = 'RESET EDITOR DOCUMENT'
const messageOf = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200) || 'unknown error'

export class EditorBoundary extends Component<BoundaryProps, State> {
  state: State = {}
  static getDerivedStateFromError(error: unknown): State { return { error: error instanceof Error ? error : new Error(messageOf(error)) } }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error(`editor (${this.props.area ?? 'content'}) stopped:`, error, info.componentStack) }
  private reset = () => { resetEditorDoc(); (this.props.onReset ?? (() => location.reload()))() }
  private retry = () => this.setState({ error: undefined })
  private undo = () => { useEditor.getState().undo(); this.retry() }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="ed-crash" role="alert" data-area={this.props.area}>
        <b>THE EDITOR STOPPED{this.props.area ? ` · ${this.props.area.toUpperCase()}` : ''}</b>
        <p>Something in this document broke it: <code>{messageOf(error)}</code></p>
        <p>Undo the last change and try again, or reset. Reset replaces the saved document with a fresh one, so download the document first if you want to keep it.</p>
        <div className="ed-crash-btns">
          <button type="button" onClick={this.undo}>UNDO AND TRY AGAIN</button>
          <button type="button" className="ed-crash-reset" onClick={this.reset}>{RESET_LABEL}</button>
        </div>
      </div>
    )
  }
}
