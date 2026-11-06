/**
 * MATRIX shadcn registry (docs/REGISTRY.md). Writes `registry.json` at the repo root (the `shadcn build` input) and
 * the card wrappers in `registry/matrix/cards/`. Lib items point straight at `src/` files (engine modules, the card
 * runtime, board files) with a `target` under `lib/matrix/`, so the registry ships the code the site runs, unedited:
 *  - `matrix-core`: the card runtime (`src/widgets/mount.ts`) with its engine import closure, plus `<MatrixDotCard>`;
 *  - `matrix-board-<board>`: a board file and whatever it imports beyond core;
 *  - `matrix-<card>`: one `<Matrix…>` component per card, on core and its board;
 *  - `matrix-dot-text`: bitmap text on a dot grid.
 * `src/X` installs as `lib/matrix/X`, so relative imports between engine files keep working as they are.
 *
 *   pnpm exec tsx scripts/registry/generate.ts [--check] [--base <url>] [--out <registry.json>]
 * `--base` is the URL the items' `registryDependencies` point at (default https://matrix.reactopia.me/r);
 * the install test passes a local server. `--check` exits 1 when a committed file is stale.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { boardById } from '../../src/widgets'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const check = args.includes('--check')
const BASE = (opt('--base') ?? 'https://matrix.reactopia.me/r').replace(/\/$/, '')
const OUT = resolve(ROOT, opt('--out') ?? 'registry.json')
const PREFIX = 'matrix-'
const url = (name: string) => `${BASE}/${name}.json`

/** Cards shipped as items, by board. Each board names its file and its exported card array. */
const BOARDS: Record<string, { file: string; array: string; cards: string[]; needs?: string[] }> = {
  henry: { file: 'src/widgets/boards/henry.ts', array: 'henryBoard', cards: ['timer', 'home-clock', 'weather', 'music'] },
  components: {
    file: 'src/widgets/boards/components.ts', array: 'componentsBoard',
    cards: ['ui-segmented', 'ui-stepped-slider', 'ui-knob', 'ui-stepper', 'ui-check', 'ui-tabs', 'ui-progress', 'ui-loaders', 'ui-keypad', 'ui-text-field'],
  },
  audio: { file: 'src/widgets/boards/audio.ts', array: 'audioBoard', cards: ['audio-levels'] },
  heartbeat: { file: 'src/widgets/boards/heartbeat.ts', array: 'heartbeatBoard', cards: ['hb-agent'], needs: ['components'] },
}

// ── import closure (relative specifiers only; the engine has no package imports) ──
const posixRel = (abs: string) => relative(ROOT, abs).split('\\').join('/')
function resolveSpec(from: string, spec: string): string {
  const base = resolve(dirname(from), spec)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c
  throw new Error(`registry: cannot resolve "${spec}" from ${posixRel(from)}`)
}
function closure(entries: string[]): Set<string> {
  const seen = new Set<string>(), stack = entries.map(e => resolve(ROOT, e))
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      if (!fileName.startsWith('.')) throw new Error(`registry: ${posixRel(file)} imports a package ("${fileName}"); lib items must be self-contained`)
      stack.push(resolveSpec(file, fileName))
    }
  }
  return new Set([...seen].map(posixRel))
}
const libFile = (path: string) => {
  if (!path.startsWith('src/')) throw new Error(`registry: lib file outside src/: ${path}`)
  return { path, type: 'registry:lib', target: `lib/matrix/${path.slice(4)}` }
}

// ── items ──
type File = { path: string; type: string; target: string }
interface Item {
  name: string; type: string; title: string; description: string
  registryDependencies?: string[]; files: File[]; categories?: string[]; meta?: Record<string, unknown>
}
const stale: string[] = []
function write(path: string, text: string) {
  if (check) { const old = existsSync(path) ? readFileSync(path, 'utf8') : ''; if (old !== text) stale.push(posixRel(path)); return }
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text)
}

const coreSrc = closure(['src/widgets/mount.ts'])
const core: Item = {
  name: 'matrix-core', type: 'registry:lib', title: 'MATRIX core',
  description: 'The MATRIX dot-matrix engine subset and card runtime (Field → Grid Sampler → Renderer), plus the <MatrixDotCard> React host. Every MATRIX item installs on it.',
  files: [
    ...[...coreSrc].sort().map(libFile),
    { path: 'registry/matrix/core/dot-card.tsx', type: 'registry:component', target: 'components/matrix/dot-card.tsx' },
  ],
  categories: ['dot-matrix'],
}

const boardItems: Item[] = []
const owned = new Map<string, Set<string>>([['core', coreSrc]])
for (const [board, def] of Object.entries(BOARDS)) {
  const below = new Set([...coreSrc, ...(def.needs ?? []).flatMap(b => [...(owned.get(b) ?? [])])])
  const own = new Set([...closure([def.file])].filter(f => !below.has(f)))
  owned.set(board, own)
  boardItems.push({
    name: `matrix-board-${board}`, type: 'registry:lib', title: `MATRIX board: ${board}`,
    description: `Card presets of the MATRIX "${board}" board, for the matrix-* card components.`,
    registryDependencies: [url('matrix-core'), ...(def.needs ?? []).map(b => url(`matrix-board-${b}`))],
    files: [...own].sort().map(libFile),
    categories: ['dot-matrix'],
  })
}

const pascal = (id: string) => 'Matrix' + id.replace(/^ui-/, '').split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const cardItems: Item[] = []
for (const [board, def] of Object.entries(BOARDS)) {
  const presets = boardById(board)?.items ?? []
  for (const id of def.cards) {
    const p = presets.find(q => q.id === id)
    if (!p) throw new Error(`registry: no card "${id}" on board "${board}"`)
    const name = `${PREFIX}${id}`, comp = pascal(id), file = `registry/matrix/cards/${name}.tsx`
    const title = p.name.replace(/^\d+\s+/, '')
    write(join(ROOT, file), `'use client'
/** ${title}: the MATRIX card \`${id}\`${p.controls?.length ? ' (interactive: pointer and keyboard edit its data)' : ''}. Generated by scripts/registry/generate.ts. */
import { MatrixDotCard, type MatrixDotCardProps } from '@/components/matrix/dot-card'
import { ${def.array} } from '@/lib/matrix/widgets/boards/${board}'

const preset = ${def.array}.find(p => p.id === '${id}')!

export type ${comp}Props = Omit<MatrixDotCardProps, 'preset'>

export function ${comp}(props: ${comp}Props) {
  return <MatrixDotCard preset={preset} {...props} />
}
`)
    const controls = p.controls?.map(c => `${c.label} (${c.kind})`).join(', ')
    cardItems.push({
      name, type: 'registry:component', title: `${title} (MATRIX)`,
      description: `MATRIX dot-matrix card \`${id}\` as <${comp}>, ${p.animated ? 'animated (Canvas)' : 'static (SVG under 2000 dots)'}.${controls ? ` Controls: ${controls}.` : ''} Props: data, theme, renderer, pitch, onInput.`,
      registryDependencies: [url('matrix-core'), url(`matrix-board-${board}`)],
      files: [{ path: file, type: 'registry:component', target: `components/matrix/${name}.tsx` }],
      categories: ['dot-matrix', board === 'components' ? 'components' : 'widgets'],
      meta: { card: id, board, controls: p.controls?.map(c => c.key) ?? [], grid: p.grid },
    })
  }
}

const dotText: Item = {
  name: 'matrix-dot-text', type: 'registry:component', title: 'Dot text (MATRIX)',
  description: 'Text drawn on a dot grid with the MATRIX bitmap font: <MatrixDotText text="12:45" />. Regular 5×7 or bold two-dot strokes, light or accent tone.',
  registryDependencies: [url('matrix-core')],
  files: [{ path: 'registry/matrix/dot-text/dot-text.tsx', type: 'registry:component', target: 'components/matrix/matrix-dot-text.tsx' }],
  categories: ['dot-matrix', 'text'],
}

const items: Item[] = [core, ...boardItems, ...cardItems, dotText]
const registry = {
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  name: 'matrix', homepage: 'https://matrix.reactopia.me',
  items,
}
write(OUT, JSON.stringify(registry, null, 2) + '\n')

if (check && stale.length) {
  console.error(`registry: stale ${stale.join(', ')}\n  run: pnpm exec tsx scripts/registry/generate.ts`)
  process.exit(1)
}
console.log(`${check ? 'registry up to date' : `wrote ${posixRel(OUT)}`}: ${items.length} items (${cardItems.length} cards, core ${coreSrc.size} lib files)`)
