/**
 * Generate the shadcn registry (https://ui.shadcn.com/docs/registry): one `registry:component` per card —
 * the Components v2 cards plus a few widgets — each a thin wrapper over `<DotCard>` from `@dot480/react`.
 * Writes `registry/registry.json` (source, `shadcn build`-compatible), the wrapper `.tsx` files, and the
 * built item JSONs with file content inlined in `registry/r/` (servable as-is: `npx shadcn add <host>/r/ui-knob.json`).
 *   npx tsx packages/scripts/registry.ts [--check]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { widgetById } from '../../src/widgets'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), REG = join(ROOT, 'registry')
const HOMEPAGE = 'https://github.com/YashM20/dot-matrix'
const COMPONENTS_V2 = ['ui-segmented', 'ui-stepped-slider', 'ui-knob', 'ui-stepper', 'ui-check', 'ui-tabs', 'ui-progress', 'ui-loaders', 'ui-keypad', 'ui-text-field']
const WIDGETS = ['timer', 'home-clock', 'weather', 'music', 'audio-levels', 'hb-agent']
const DEPS = ['@dot480/react@^0.1.0', '@dot480/core@^0.1.0']

const pascal = (id: string) => 'Dot' + id.replace(/^ui-/, '').split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const check = process.argv.includes('--check')
let stale = 0
function write(path: string, text: string) {
  if (check) { let old = ''; try { old = readFileSync(path, 'utf8') } catch { /* missing */ } if (old !== text) { console.error(`stale: ${path}`); stale++ } return }
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text)
}

const items = [...COMPONENTS_V2.map(id => ({ id, kind: 'component' })), ...WIDGETS.map(id => ({ id, kind: 'widget' }))].map(({ id, kind }) => {
  const p = widgetById(id)
  if (!p) throw new Error(`registry: no preset "${id}"`)
  const name = pascal(id), file = `registry/dot480/${id}/${id}.tsx`
  const interactive = !!p.controls?.length
  const source = `'use client'
/** ${p.name} — Dot/480 card \`${id}\`${interactive ? ' (interactive: pointer + keyboard edit its data)' : ''}. */
import { DotCard, type DotCardProps } from '@dot480/react'

export type ${name}Props = Omit<DotCardProps, 'preset' | 'spec'>

export function ${name}(props: ${name}Props) {
  return <DotCard preset="${id}" {...props} />
}
`
  write(join(ROOT, file), source)
  const controls = p.controls?.map(c => `${c.label} (${c.kind})`).join(', ')
  return {
    name: id, type: 'registry:component', title: `${p.name.replace(/^\d+\s+/, '')} (Dot/480)`,
    description: `${kind === 'component' ? 'Components v2' : 'Widget'} dot-matrix card \`${id}\`: Field → Sampler → Renderer, ${p.animated ? 'animated (Canvas)' : 'static (SVG under 2000 dots)'}.${controls ? ` Controls: ${controls}.` : ''} Props: data, theme, renderer, pitch, onInput.`,
    dependencies: DEPS,
    files: [{ path: file, type: 'registry:component' }],
    categories: ['dot-matrix', kind === 'component' ? 'components-v2' : 'widgets'],
    meta: { preset: id, controls: p.controls?.map(c => c.key) ?? [], grid: p.grid },
    source,
  }
})

const registry = {
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  name: 'dot480', homepage: HOMEPAGE,
  items: items.map(({ source: _s, ...item }) => item),
}
write(join(REG, 'registry.json'), JSON.stringify(registry, null, 2) + '\n')
for (const { source, ...item } of items) {
  const built = { $schema: 'https://ui.shadcn.com/schema/registry-item.json', ...item, files: item.files.map(f => ({ ...f, content: source })) }
  write(join(REG, 'r', `${item.name}.json`), JSON.stringify(built, null, 2) + '\n')
}
if (check && stale) { console.error(`${stale} registry file(s) stale: run npx tsx packages/scripts/registry.ts`); process.exit(1) }
console.log(check ? `registry up to date (${items.length} items)` : `wrote registry/registry.json + ${items.length} items`)
