/**
 * Programmatic acceptance harness — framework-free, runs headless.
 * Run: pnpm verify   (or: npx tsx scripts/verify.ts)
 * Covers the sampler, squircle geometry, text layout, waveform anchoring, halftone polarity,
 * spiral continuity, Poisson-disc, and a smoke render of every widget preset.
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome } from '../src/widgets'
import { liveChecks } from './live'
import { halftoneChecks } from './halftone'
import { visionChecks } from './vision'
import { deviceChecks } from './device'
import { exportChecks } from './export'
import { dotsChecks } from './dots'
import { studioChecks } from './studio'
import { specChecks } from './spec'
import { bytecodeChecks } from './bytecode'
import { esp32Checks } from '../targets/test/esp32'
import { targetsChecks } from '../targets/test/targets'
import { bufferChecks } from './buffer'
import { gameChecks } from './game'
import { displayChecks } from './display'
import { typeChecks } from './type'
import { physicsChecks } from './physics'
import { ncaChecks } from './nca/checks'
import { c10Checks } from './c10'
import { shareChecks } from './widgets/checks'
import { algorithmsChecks } from './algorithms'
import { noiseChecks } from './noise'
import { checker } from './lib/check'
import { coreChecks } from './verify/core'
import { engineChecks } from './verify/engine'
import { uxChecks } from './verify/ux'
import { flagChecks } from './verify/flags'

// timing checks warn unless DOT_TIMING=strict (scripts/lib/check.ts, docs/CHECKPOINTS.md, #75)
const { assert, done } = checker()

// 1) to 14b) core: sampler, geometry, text, fields, presets, motion, bounds, multi-tone (scripts/verify/core.ts)
coreChecks(assert)

// 15) to P4-D) input, IR, raster + light, materials, sims, describe, migration (scripts/verify/engine.ts)
await engineChecks(assert)

// 13) live data (P4-E): fixtures, backoff, caching, pause, transports — fake env, no network
await liveChecks(assert)
// live board inputs (#147): URL config, malformed and oversized API payloads, bad socket URLs, the cache (scripts/live-inputs.ts)
{
  const { liveInputChecks } = await import('./live-inputs')
  await liveInputChecks(assert)
}
// P4-F) halftone ladder + STBN temporal stability + live camera card timing (scripts/halftone.ts)
halftoneChecks(assert)
// C6) hand tracker on the synthetic camera: pointer error, pinch, cost, no ghost from a still face (scripts/vision.ts)
visionChecks(assert)
// P5-C) device profiles, toDevice, display simulators, cross-tab clock sync (scripts/device.ts)
deviceChecks(assert)
// P5-D) export: APNG / GIF encoders, WebM / MP4 muxers, plotter SVG (scripts/export.ts)
await exportChecks(assert)
// P6-C) DOTS tab: share links, limits, the 8 seed programs, remix gallery + graph (scripts/dots.ts)
await dotsChecks(assert)
// P6-A) card spec v1: schema ≡ validator, preset ↔ spec round-trip, migration, examples (scripts/spec.ts)
specChecks(assert)
// P5-E) IR bytecode VM + device targets: f32 VM parity, C VM vs TS VM when a C compiler is found, senders vs local fakes only
bytecodeChecks(assert)
esp32Checks(assert, { pathOnly: true })
await targetsChecks(assert)
// P5-B) struct-of-arrays DotBuffer, buffer canvas renderer, worker protocol (scripts/buffer.ts)
bufferChecks(assert)
displayChecks(assert)
// C8) dot type: stroke font, axes, kerning, SDF morph, marquee, CJK skip, the type board (scripts/type.ts)
typeChecks(assert)

// P5-A) WebGL2 renderer, CPU half: pass mapping ≡ sampler, routing, colours (GPU half: `npx tsx scripts/webgl.ts` in headless Chrome)
import { baseStyle } from '../src/widgets/types'
import { gpuTag, gpuValues, hasGPULayers, parseColor, passDots, passToDots, splitGPULayers, type GPUField } from '../src/engine/renderer/webgl'
import { evalFS } from '../src/engine/renderer/webgl/shaders'
import { gpuBoard } from '../src/widgets/boards/gpu'
{
  const key = (d: { x: number; y: number; r: number; opacity: number; color: string }) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`
  const atDensity = (l: Layer, density: number): Layer => { const g = gpuTag(l.field)!, f: GPUField = Object.assign((u: number, v: number) => l.field(u, v), { bounds: l.field.bounds, gpu: { ...g, density } }); return { ...l, field: f } }
  let same = true, detail = ''
  for (const p of gpuBoard) {
    const tagged = withChrome(p)({ t: 1.3, data: {} }).filter(l => hasGPULayers([l]))
    const cpu = sampleLayers(tagged, p.grid, p.style, dot480).map(key).sort()
    const gpu = splitGPULayers(tagged.map(l => atDensity(l, 1)), p.grid, p.style, p.grid.pitch!).passes.flatMap(q => passToDots(q, dot480)).map(key).sort()
    const ok = cpu.length === gpu.length && cpu.every((k, i) => k === gpu[i])
    same &&= ok; detail += `${p.id} ${cpu.length}${ok ? '' : `≠${gpu.length}`} `
  }
  assert('webgl: a GPU pass at density 1 draws exactly the CPU sampler\'s dots (gpu board, t = 1.3)', same, detail)
  const counts = gpuBoard.map(p => passDots(splitGPULayers(withChrome(p)({ t: 0, data: {} }), p.grid, p.style, p.grid.pitch!).passes))
  assert('webgl: gpu-plasma draws ≥ 500k GPU dots; every gpu card ≥ 250k', counts[0] >= 5e5 && counts.every(n => n >= 2.5e5), counts.join(' / '))
  const plain: Layer = { field: () => 1 }, sited: Layer = { field: gpuValues(() => 1), sites: [[1, 1]] }, grid = { cols: 8, rows: 8 }
  const r1 = splitGPULayers([plain, sited, { field: gpuValues(() => .5) }], grid, baseStyle, 4), r2 = splitGPULayers([{ field: gpuValues(() => 1) }], grid, { ...baseStyle, jitter: .5 }, 4)
  assert('webgl: routing — untagged, site and jittered layers stay on the CPU, tagged lattice layers become passes', r1.cpu.length === 2 && r1.passes.length === 1 && r2.passes.length === 0 && !hasGPULayers([plain]))
  const c = (s: string) => parseColor(s).map(x => Math.round(x * 255)).join(',')
  assert('webgl: colours parse (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba())', c('#FF3B30') === '255,59,48,255' && c('#fff') === '255,255,255,255' && c('#00000080') === '0,0,0,128' && c('rgba(255,255,255,0.08)') === '255,255,255,20' && c('rgb(10 20 30)') === '10,20,30,255')
  const fs = evalFS('float field(vec2 uv, float t, vec3 pointer, float data_a, float data_b) { return 0.0; }', 2)
  assert('webgl: IR eval shader passes data uniforms in key order and reads u/v from the CPU table', fs.includes('field(uv, uT, uPointer, uData[0], uData[1])') && fs.includes('uniform float uData[2]') && fs.includes('texelFetch(uUV'))
}
// P6-D) Dot Studio: document model, undo/redo, reference stacks, spec v1 / DOTS import, timeline (scripts/studio.ts)
studioChecks(assert)
// C10) X-ray probe ≡ sampler, time-machine seek, remix → Field IR, palette fuzzy rank (scripts/c10.ts)
c10Checks(assert)
// C2) physics: worlds, stable fluids, PBD cloth / jelly, particles + spatial hash, the physics board (scripts/physics.ts)
physicsChecks(assert)

// C4) HIVE game: autopilot reaches the boss, input replay is bit-identical, frame budget (scripts/game.ts)
gameChecks(assert)
// C3) Growing NCA: BPTT grad check, Int8 asset, regrowth gate, step cost, timeline purity, heal board (scripts/nca/checks.ts)
ncaChecks(assert)
// ALGORITHMS) stippling, attractor density, WFC, DLA: determinism, invariants, timing, the algorithms board (scripts/algorithms.ts)
algorithmsChecks(assert)
// F0 noise slot) dmath, gradient noise, Voronoi, curl, the IR noise pack, the determinism lint (scripts/noise.ts)
noiseChecks(assert)
// IQ5 noise (#66): analytic derivatives, the cell border, smooth Voronoi, Voronoise, fBm by H, nested warp (scripts/noise-iq.ts)
{
  const { noiseIqChecks } = await import('./noise-iq')
  noiseIqChecks(assert)
}

// editor (E1): MAKE editor document, paint encode, resize anchoring, hit tests, camera, gestures, entries, history; E2: selection sets, marquee, group resize, align / distribute, guides, groups, locks, clipboard, migration, undo per command; E3: sites handles, spec bounds, text carets, quick toggles, eyedropper, typing sessions (scripts/editor.ts)
{
  const { editorChecks, editorE3Checks } = await import('./editor')
  editorChecks(assert); editorE3Checks(assert)
}
// editor E5: frame / document links (round trip, open once, lineage, cap, corrupt links), ?make&d=, remix parents and graph, devices, scorecard (scripts/editor.ts)
{
  const { editorE5Checks } = await import('./editor')
  await editorE5Checks(assert)
}
// editor E6: phone layouts, sheet detent memory, the keyboard box, the snap cue, stack order and the long-press menu, the share sheet's fallbacks (scripts/editor.ts)
{
  const { editorE6Checks } = await import('./editor')
  await editorE6Checks(assert)
}
// editor imports (#143): crafted links, files and saved documents refused with a reason or recovered from (scripts/editor-imports.ts)
{
  const { editorImportChecks } = await import('./editor-imports')
  await editorImportChecks(assert)
}

// golden key (F0.5, F0.6, F0.10): dotKey + the style backfill, the square site cover, card fps (scripts/goldenkey.ts)
import { goldenKeyChecks } from './goldenkey'
goldenKeyChecks(assert)

// light (F0.7, F0.8): the light / tilt hub (docs/living-matter/F0-foundation.md §2.7): pure core under a fake clock, buckets,
// sceneLight precedence, the permission flow on a fake window, worker safety (scripts/light.ts)
{
  const { lightChecks } = await import('./light')
  await lightChecks(assert)
}

// MATERIALS) M1 (docs/living-matter/M-materials.md): relief + AO, anisotropic sheen, matcaps, weave / stitch, stone, and the
// materials board (one accent, no activeDim, light keys, frame budgets, per-card invariants) (scripts/materials.ts)
{
  const { materialsChecks } = await import('./materials')
  await materialsChecks(assert)
}

// life (L1): ripple, glyph tiles, chain, body, steering, the koi pond world, the pond-koi card and its interaction (scripts/life.ts)
{
  const { lifeChecks } = await import('./life')
  await lifeChecks(assert)
}

// theme (T4a): scheme × accent table, gamut / contrast / colour-blind rules, boot script ≡ store, CSP hash, generated files current (scripts/site/theme.ts)
{
  const { themeChecks } = await import('./site/theme')
  await themeChecks(assert)
}

// UX U1, U3) board picker groups, labels and old paths; views and canonical URLs (scripts/verify/ux.ts)
uxChecks(assert)
// FLAGS (#144, #145) every release flag documented; with xray off no palette, shell or shortcut entry (scripts/verify/flags.ts)
flagChecks(assert)
// LIKES (#169) the likes API on the in-memory store: limits, holds, bursts, cookies, forget, budget, the function bundle (scripts/likes/checks.ts)
{
  const { likesChecks } = await import('./likes/checks')
  await likesChecks(assert)
}


// SHARE S0) widget uids, metadata and URLs (docs/SHARE-PLAN.md §3, scripts/widgets/checks.ts)
shareChecks(assert)

// squares (Q1): join masks, joined-cell geometry, the join pass and hook points, DotBuffer channels, Canvas / SVG joins, the squares board (scripts/squares.ts)
{
  const { squaresChecks } = await import('./squares')
  squaresChecks(assert)
}

// aperiodic floors (XQ #20): hex and kite grid, hat substitution over 3 levels, Ammann–Beenker multigrid, the two cards (scripts/aperiodic.ts)
{
  const { aperiodicChecks } = await import('./aperiodic')
  aperiodicChecks(assert)
}

// arctic circle and sandpile (#36): domino shuffling covers the diamond, the circle, the sandpile identity, abelian toppling, the burn, the two cards (scripts/arctic.ts)
{
  const { arcticChecks } = await import('./arctic')
  arcticChecks(assert)
}

// ASCII glyph tiles (#36, Q3.10): the ramp rises in ink and is the 5 × 7 font, tiles hold ramp glyphs, the cursor writes one tile per step, the card (scripts/ascii.ts)
{
  const { asciiChecks } = await import('./ascii')
  asciiChecks(assert)
}

// kinetic type (#129): the word validator and ?word=, each effect's loop wraps and ends on the word, the cards stay on their lattice (scripts/kinetic.ts)
{
  const { kineticChecks } = await import('./kinetic')
  kineticChecks(assert)
}

// dot charts kit (#132): scales land on exact cells, the readout picks the nearest point, empty and single-point data, transitions end on the target (scripts/charts.ts)
{
  const { chartsChecks } = await import('./charts')
  chartsChecks(assert)
}

// watch faces (#126): moon phase on known new and full moons, sunrise before sunset all year, summer time, the tide model, the analog hands, one red per face (scripts/watch.ts)
{
  const { watchChecks } = await import('./watch')
  watchChecks(assert)
}

// blog syntax colouring (#84): code blocks round-trip, regex vs division, kinds (scripts/site/highlight.ts)
{
  const { highlightChecks } = await import('./site/highlight')
  highlightChecks(assert)
}

// shaping pack (IQ3, #64): remaps, smoothsteps and sigmoids against references, inverses, derivatives (scripts/shape.ts)
{
  const { shapeChecks } = await import('./shape')
  shapeChecks(assert)
}

// 2D SDF library and operators (IQ1 #62, IQ2 #63): primitives, gradients, smooth minimums, repetition, xor (scripts/sdf.ts)
{
  const { sdfChecks } = await import('./sdf')
  sdfChecks(assert)
}

// filtered fields (IQ4 #65): the sampler's footprint, the shimmer gate, each filter against brute force (scripts/filter.ts)
{
  const { filterChecks } = await import('./filter')
  filterChecks(assert)
}

// fractal pack and board (IQ7, #68): smooth count, orbit traps, density bakes pinned, Lyapunov, one red per card (scripts/fractal.ts)
{
  const { fractalChecks } = await import('./fractal')
  fractalChecks(assert)
}

// oldschool effects (IQ6 #67): deformations, dynamic clouds, feedback replay and the board (scripts/oldschool.ts)
{
  const { oldschoolChecks } = await import('./oldschool')
  oldschoolChecks(assert)
}

// 3D SDF scenes (IQ8 #69): primitives, operators, tracer, normals, soft shadows, fog, the light rig and the board (scripts/sdf3d.ts)
{
  const { sdf3dChecks } = await import('./sdf3d')
  sdf3dChecks(assert)
}

done('All acceptance checks passed')
