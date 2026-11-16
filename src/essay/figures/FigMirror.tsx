import { Card } from '../ui/Card'
import { Cards, Controls } from '../ui/kit'
import { mirrorHeals, scratchMirror } from './mirrorHeals'

/** The mirror that heals (its ladder panel went with the mirror-ladder card, #364). */
export default function FigMirror() {
  return (
    <>
      <Cards n={2}>
        <Card preset={mirrorHeals} />
      </Cards>
      <Controls>
        <button type="button" className="ctl-toggle" onClick={() => scratchMirror()}>Scratch it for me</button>
        <a className="ctl-link" href="./?board=mirror">Try it on your webcam →</a>
      </Controls>
    </>
  )
}
