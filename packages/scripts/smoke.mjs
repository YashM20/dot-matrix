// Install smoke test: copied into a fresh dir where the packed tarballs were `npm i`-ed, then run with node.
// Imports every public entry and samples fields through the real pipeline (no DOM needed).
import { dot480, ringField, sampleField, sampleLayers, renderSVG, textField, ir } from '@dot480/core'
import { irProgram } from '@dot480/core/ir'
import { presetById, cardPresets, withChrome } from '@dot480/core/presets'
import { presetFromSpec } from '@dot480/core/spec'
import { mountCard } from '@dot480/core/card'
import { DotCardElement, defineDotCard } from '@dot480/element'

const ok = (cond, msg) => { if (!cond) { console.error(`FAIL ${msg}`); process.exit(1) } console.log(`ok   ${msg}`) }
const style = { shape: 'squircle', sizeMin: .3, sizeMax: 1.55, cornerRoundness: .25, opacityMode: 'fromValue', quantizeSteps: 5 }
const grid = { cols: 32, rows: 32, pitch: 4 }

const ring = sampleField(ringField(.5, .5, .3, .45, 0, Math.PI * 1.4), grid, style, dot480)
ok(ring.length > 0, `ringField sampled: ${ring.length} dots`)
const svg = renderSVG(ring, 128, 128)
ok(svg.startsWith('<svg') && svg.includes('</svg>'), `renderSVG: ${svg.length} chars`)
const text = sampleField(textField('480'), { cols: 20, rows: 8, pitch: 4 }, style, dot480)
ok(text.some(d => d.opacity > 0), 'textField lit')
const field = irProgram('smoothstep(.5, .1, length(u - .5, v - .5))')({ t: 0, data: {} })
ok(sampleField(field, grid, style, dot480).length > 0 && typeof ir.parse === 'function', 'IR → field sampled')
const timer = presetById('timer')
const dots = sampleLayers(withChrome(timer)({ t: 0, data: timer.defaults ?? {} }), timer.grid, timer.style, dot480)
ok(dots.length > 0, `preset timer sampled: ${dots.length} dots (${cardPresets.length} presets)`)
const spec = presetFromSpec({ grid: { cols: 16, rows: 16 }, layers: [{ ir: 'u * v' }] })
ok(sampleLayers(spec.layers({ t: 0, data: {} }), spec.grid, spec.style, dot480).length > 0, 'JSON spec → preset sampled')
ok(typeof mountCard === 'function' && typeof DotCardElement === 'function' && typeof defineDotCard === 'function', 'card runtime + element import in Node (no DOM)')
try {
  const { DotCard, useDotField } = await import('@dot480/react')
  ok(typeof DotCard === 'function' && typeof useDotField === 'function', '@dot480/react imports')
} catch (e) { console.log(`skip @dot480/react (${e.code ?? e.message})`) }
console.log('SMOKE PASS')
