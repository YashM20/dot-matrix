/**
 * Blog syntax colouring checks (#84, src/blog/highlight.ts): every code block in docs/blog round-trips exactly, and
 * the tricky cases (regex vs division, comments in strings, JSON keys, unknown languages) land in the right kind.
 * Called from verify.ts; alone: `npx tsx scripts/site/highlight.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { highlight, type Kind } from '../../src/blog/highlight'
import type { Assert } from '../lib/check'

const kinds = (src: string, lang: string) => highlight(src, lang).filter(t => t.k).map(t => `${t.k}:${t.s}`)
const HTTP_MSG = 'Content-Type: text/plain\n\nstatus: ready'
const has = (src: string, lang: string, k: Kind, s: string) => kinds(src, lang).includes(`${k}:${s}`)

export function highlightChecks(assert: Assert) {
  const dir = new URL('../../docs/blog/', import.meta.url)
  let blocks = 0, bad: string[] = []
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)) {
      blocks++
      if (highlight(m[2], m[1]).map(t => t.s).join('') !== m[2]) bad.push(`${f} ${m[1] || 'text'}`)
    }
  }
  assert('highlight: every docs/blog code block round-trips exactly', blocks > 0 && !bad.length, bad.length ? bad.join(', ') : `${blocks} blocks`)
  assert('highlight: unknown, empty or Object-prototype language names stay one plain token', ['', 'brainfuck', 'constructor', '__proto__', 'toString'].every(l => { const t = highlight('a / b(1)', l); return t.length === 1 && t[0].k === '' }))
  assert('highlight: regex after ( or = is a string, division after a name or ) is not',
    has(String.raw`if (/\s/.test(c)) x = a / b / c`, 'ts', 's', String.raw`/\s/`) && !kinds('x = a / b / c', 'ts').some(k => k.startsWith('s:')) && !kinds('(a) / 2 / 3', 'ts').some(k => k.startsWith('s:')))
  assert("highlight: // inside a string stays a string; a quote inside a regex class doesn't open one",
    has("const u = 'https://x.y' // note", 'ts', 's', "'https://x.y'") && has("const u = 'https://x.y' // note", 'ts', 'c', '// note') && has("s.replace(/['\"]/g, '')", 'ts', 's', "/['\"]/g"))
  assert('highlight: keywords, calls, types, numbers and literals',
    has('export function f(n: number): Env { return g(0x1f, 1.5e3, true) }', 'ts', 'k', 'export') && has('export function f(n: number): Env {}', 'ts', 'f', 'f') &&
    has('let e: Env', 'ts', 't', 'Env') && has('let n: number', 'ts', 't', 'number') && has('g(0x1f)', 'ts', 'n', '0x1f') && has('g(1.5e3)', 'ts', 'n', '1.5e3') && has('g(true)', 'ts', 'l', 'true'))
  assert('highlight: a method after a dot is a call, a digit inside a name is not a number', has('a.toString(16)', 'ts', 'f', 'toString') && !has('vec2 x2', 'glsl', 'n', '2'))
  assert('highlight: a regex after an if / while condition, division after a grouped expression',
    has(String.raw`if (ready) /x\d/.test(v)`, 'ts', 's', String.raw`/x\d/`) && has('while (f(a)) /y/.exec(s)', 'ts', 's', '/y/') && !kinds('g(a) / 2 / 3', 'ts').some(k => k.startsWith('s:')))
  assert('highlight: a JSON key with any whitespace before its colon; HTTP body lines stay plain',
    has('{ "a"          : 1 }', 'json', 't', '"a"') && !has(HTTP_MSG, 'http', 'k', 'status') && has(HTTP_MSG, 'http', 'k', 'Content-Type'))
  assert('highlight: JSON keys, GLSL types, shell comments, HTTP header names',
    has('{ "a": 1 }', 'json', 't', '"a"') && has('vec3 c = vec3(1.)', 'glsl', 'k', 'vec3') && has('pnpm dev # run', 'sh', 'c', '# run') && has('Content-Type: text/html', 'http', 'k', 'Content-Type'))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('../lib/check')).checker('highlight')
  highlightChecks(assert)
  done()
}
