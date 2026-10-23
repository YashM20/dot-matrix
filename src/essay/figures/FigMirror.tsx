import { mirrorLadder } from '../../widgets/boards/mirror'
import { Card } from '../ui/Card'
import { Cards, Controls } from '../ui/kit'
import { mirrorHeals, scratchMirror } from './mirrorHeals'

/** The halftone ladder (step 1 vs step 2) and the mirror that heals. */
export default function FigMirror() {
  return (
    <>
      <Cards n={2}>
        <Card preset={mirrorHeals} />
        <Card preset={mirrorLadder} />
      </Cards>
      <Controls>
        <button type="button" className="ctl-toggle" onClick={() => scratchMirror()}>Scratch it for me</button>
        <a className="ctl-link" href="./?board=mirror">Try it on your webcam →</a>
      </Controls>
    </>
  )
}
