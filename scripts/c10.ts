/**
 * C10 checks in Node (no browser): the X-ray probe agrees with the sampler, the time machine clock
 * seeks while paused, every card's remix program compiles as Field IR, and the palette's fuzzy rank.
 * `pnpm verify` runs them through `c10Checks()`; standalone:
 *   npx tsx scripts/c10.ts
 */
import { freezeWallClock } from './lib/freeze'
import { theme, uniquePresets } from './lib/cards'
import { createMasterClock } from '../src/engine/clock'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { withChrome } from '../src/widgets'
import { probeDot } from '../src/components/xray/probe'
import { remixProgram } from '../src/components/xray/remix'
import { compileSource } from '../src/components/dwitter/program'
import { rank } from '../src/components/palette/fuzzy'

type Assert = (name: string, cond: boolean, detail?: string) => void

export function c10Checks(check: Assert) {
  freezeWallClock()

  // 1. probe ≡ sampler: at sampled points, the probed dot is the dot the sampler drew there
  {
    let points = 0, bad = 0, cards = 0
    const misses: string[] = []
    for (const p of uniquePresets()) {
      if (p.style.jitter || p.media) continue
      const layers = withChrome(p)({ t: 0, frame: 0, data: { ...p.defaults }, grid: p.grid })
      const pitch = p.grid.pitch ?? theme.gridPx, dots = sampleLayers(layers, p.grid, p.style, theme)
      // the dot drawn at card-cell point (x, y), within float noise (fractional lattices land on x.xx5)
      const at = (x: number, y: number) => dots.find(d => Math.abs(d.x / pitch - x) < .02 && Math.abs(d.y / pitch - y) < .02)?.r
      cards++
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < 60; i++) {
        const c = Math.floor(rnd() * p.grid.cols), r = Math.floor(rnd() * p.grid.rows)
        const probe = probeDot(layers, p.grid, p.style, c + .5, r + .5)
        if (probe.kind === 'empty' || probe.shown <= 0) continue
        const [bx, by, bw, bh] = probe.box
        const drawn = at(bx + bw / 2, by + bh / 2)
        points++
        if (drawn === undefined || Math.abs(drawn - probe.r) > 1e-3) { bad++; if (misses.length < 6) misses.push(`${p.id} c${c} r${r} ${probe.kind} r=${probe.r.toFixed(3)} drawn=${drawn?.toFixed(3)}`) }
      }
    }
    check('x-ray probe finds the dot the sampler drew (position + radius)', bad <= points * .01, `${points - bad}/${points} points on ${cards} cards${misses.length ? `; ${misses.join(' | ')}` : ''}`)
  }

  // 2. time machine: seek while paused draws one frame at the new time; resume continues from there
  {
    let now = 0
    const queue: ((t: number) => void)[] = []
    const clock = createMasterClock({ now: () => now, raf: cb => { queue.push(cb); return queue.length }, caf: () => {} })
    const seen: number[] = []
    const flush = () => { const q = queue.splice(0); for (const f of q) f(now) }
    clock.subscribe({ fps: 12, onFrame: t => seen.push(t) })
    flush(); now += 500; flush()
    clock.pause()
    const before = seen.length
    clock.seek(10); flush()
    check('seek while paused redraws once at the new time', seen.length === before + 1 && Math.abs(seen.at(-1)! - 10) < 1e-9 && clock.isPaused(), `frames ${seen.slice(-2).join(', ')}`)
    now += 2000; flush()
    check('a paused clock stays at the seeked time', Math.abs(clock.time() - 10) < 1e-9 && seen.length === before + 1)
    clock.resume(); now += 1000; flush()
    check('resume continues from the seeked time', Math.abs(clock.time() - 11) < 1e-9 && seen.at(-1)! > 10.9, `t ${clock.time()}`)
  }

  // 3. remix: every card opens in DOTS as a program that compiles (own IR or a describe() stub)
  {
    let ir = 0, stub = 0
    const broken: string[] = []
    for (const p of uniquePresets()) {
      const prog = remixProgram(p)
      if (prog.stub) stub++; else ir++
      const c = compileSource(prog.src)
      if (!c.program) broken.push(`${p.id}: ${c.error.message}`)
    }
    check('every card remixes into a compiling Field IR program', !broken.length, `${ir} own IR, ${stub} stubs${broken.length ? `; ${broken.slice(0, 3).join(' | ')}` : ''}`)
  }

  // 4. palette fuzzy rank
  {
    const items = [{ text: 'LEVELS — HIVE, NINE WORLDS' }, { text: 'Level 07 · lv-queen' }, { text: 'Toggle X-ray on every card' }, { text: 'METRO / OXYGEN / QUIET' }]
    check('fuzzy: substring first', rank(items, 'queen')[0]?.item.text === 'Level 07 · lv-queen')
    check('fuzzy: scattered subsequence', rank(items, 'tgxr')[0]?.item.text === 'Toggle X-ray on every card')
    check('fuzzy: no match → empty', rank(items, 'zzzq').length === 0)
  }
}

if (/c10\.ts$/.test(process.argv[1] ?? '')) {
  let failures = 0
  c10Checks((name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ })
  console.log(failures ? `\n${failures} C10 check(s) failed` : '\nC10 checks pass')
  process.exit(failures ? 1 : 0)
}
