/** Print the shipped model growing (ASCII) and its evaluation.  npx tsx scripts/nca/show.ts [steps...] */
import { ncaGrid, ncaModel, ncaSeed, ncaStep, type NcaGrid } from '../../src/engine/nca'
import { lizardNca } from '../../src/assets/nca/lizard'
import { lizardTarget } from './target'
import { evaluate, iou } from './eval'

const m = ncaModel(lizardNca), target = lizardTarget()
const marks = process.argv.slice(2).map(Number).filter(n => n > 0)
const at = marks.length ? marks : [20, 40, 80, 200]
const ascii = (g: NcaGrid) => {
  const rows: string[] = []
  for (let y = 0; y < g.h; y++) {
    let r = ''
    for (let x = 0; x < g.w; x++) {
      const o = ((y + 1) * (g.w + 2) + x + 1) * g.channels, a = g.cells[o], t = g.cells[o + 1]
      r += a <= .1 ? '.' : a < .5 ? ':' : t < .75 ? '+' : '#'
    }
    rows.push(r)
  }
  return rows
}
const g = ncaGrid(m.w, m.h, m.channels)
let s = new Float32Array(g.cells.length)
ncaSeed(g, m.seedAt[0], m.seedAt[1])
const frames: string[][] = []
for (let n = 0; n < Math.max(...at); n++) {
  ncaStep(m, g.cells, s, g.w, g.h, 1, n); const t = g.cells; g.cells = s; s = t
  if (at.includes(n + 1)) frames.push([`step ${n + 1} IoU ${iou(g, target).toFixed(2)}`.padEnd(m.w), ...ascii(g)])
}
for (let r = 0; r < frames[0].length; r++) console.log(frames.map(f => f[r].padEnd(m.w)).join('  '))
console.log(lizardNca.meta)
const ev = evaluate(m, target)
console.log(`grown IoU .9 at step ${ev.grownStep}; IoU ${ev.grownIou.toFixed(3)} at 200; +400 steps ${ev.longIou.toFixed(3)}`)
for (const c of ev.cuts) console.log(`  ${c.name.padEnd(12)} removed ${(c.removed * 100).toFixed(0)}%  back in ${c.steps} steps (${(c.steps / 24).toFixed(2)} s), IoU ${c.iou.toFixed(3)}`)
