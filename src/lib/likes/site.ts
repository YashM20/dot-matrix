/**
 * What the likes functions need from the site (#169), framework-free: the program key and the widget uids.
 * The browser imports `programKey` from here; the functions get this module through the generated bundle
 * `api/_lib/gen/site.mjs` (`scripts/likes/bundle.ts`), since Vercel doesn't bundle function imports.
 *
 * A program's key is SHA-256 of its grid, lattice, tone and its parsed, validated AST, so two formattings of one
 * program share their likes and two programs with the same 8-hex FNV id don't.
 */
import '../../engine/noise/ir' // the noise builtins parse here as they do in MAKE · CODE
import { serialize, validate } from '../../engine/ir/ast'
import { parse } from '../../engine/ir/parse'
import { checkShared } from '../share'
import { catalog } from '../../widgets/catalog'

export const PROGRAM_KEY_RE = /^[0-9a-f]{64}$/

/** The 64-hex key of a program `{ src, grid, lattice, tone }`; throws on anything the share check or the parser refuses. */
export async function programKey(x: unknown): Promise<string> {
  const p = checkShared(x), ast = parse(p.src)
  validate(ast)
  const bytes = new TextEncoder().encode(`${p.grid}|${p.lattice}|${p.tone}|${serialize(ast)}`)
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Uids of the current widgets: the ones that can be liked. */
export const WIDGET_UIDS: ReadonlySet<string> = new Set(catalog.map(r => r[1]).filter(Boolean))
