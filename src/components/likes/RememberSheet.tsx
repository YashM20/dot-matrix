/**
 * "Remember this browser?" (#169), asked once, on the first like. Two equal buttons and nothing pre-selected:
 * focus goes to the sheet itself, not to either answer. Escape or a tap outside cancels the like. A modal
 * `<dialog>` (src/components/Modal.tsx): the page behind is inert and focus goes back to the like button.
 */
import { Modal } from '../Modal'

export function RememberSheet({ onChoose }: { onChoose: (c: 'r' | 'o' | null) => void }) {
  return <Modal className="lk-scrim" aria-labelledby="lk-sheet-title" aria-describedby="lk-sheet-body" onClose={() => onChoose(null)}>
    <div className="lk-sheet" tabIndex={-1} data-autofocus>
      <h2 id="lk-sheet-title">Remember this browser so your likes count fully?</h2>
      <p id="lk-sheet-body">Remember sets one cookie, used only for likes. Just this once sets none, and your like counts a little less. You can forget this browser at any time. <a href="/privacy/#likes">How likes work</a></p>
      <div className="lk-choices">
        <button type="button" onClick={() => onChoose('r')}>Remember</button>
        <button type="button" onClick={() => onChoose('o')}>Just this once</button>
      </div>
    </div>
  </Modal>
}
