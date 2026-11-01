/**
 * Frame and document links (docs/EDITOR-PLAN.md §7.4, E5), without React. A link carries one frame, some
 * frames or the whole document as JSON, packed by the CODE link's codec (`packJSON` in `lib/share`: deflate-raw
 * + base64url, plain base64url when that is shorter) into `?make&d=<packed>`. Nothing is uploaded.
 *
 * - **Wire:** `{ v: 1, k: 'f' | 'd', n: name, f: frames, p?: parent }`. Frames go without their ids and
 *   `source`, placed relative to the top-left of their block. Decoding checks the frames like a document
 *   (`validateDoc`) and never evaluates anything: Field IR still goes through its parser and limits.
 * - **Id:** 8 hex digits, FNV-1a over the frames, kind and name with sorted keys (not the parent). Opening a
 *   link gives each frame `source: 'link:<id>'`, so a reload or Back re-selects those frames instead of adding
 *   copies, and sharing them again unchanged makes the same link.
 * - **Lineage:** a link made from frames a link opened carries that link's id as `p` (its parent); this
 *   browser keeps the links it made or opened (`dot480.editor.links`), so CODE can show the chain.
 * - **Cap:** `LINK_MAX_ENCODED` characters (under the host's 14 kB URL limit with the origin and path),
 *   `LINK_MAX_JSON` bytes inflated (stops a deflate bomb early). Bigger documents go out as DOWNLOAD JSON.
 */
import { hashText, isHash, packJSON, ShareError, unpackJSON } from '../../lib/share'
import { EDITOR_VERSION, frameSize, MAX_FRAMES, placeFor, validateDoc, type EditorDoc, type EditorFrame } from './doc'

export const LINK_PARAM = 'd'
/** Longest packed link (characters after `d=`). */
export const LINK_MAX_ENCODED = 12_000
/** Longest JSON a link may inflate to. */
export const LINK_MAX_JSON = 1_000_000
export type LinkKind = 'frame' | 'doc'
/** A frame as a link carries it: no id, no source, x / y from the top-left of the block. */
export type LinkFrame = Omit<EditorFrame, 'id' | 'source'>
export interface LinkPayload { kind: LinkKind; name: string; frames: LinkFrame[]; parent?: string; id: string }
export interface LinkRecord { id: string; parent?: string; name: string; kind: LinkKind; frames: number; at: number }

const LINK_SRC = 'link:'
/** A frame without its id and source (what a link carries). */
function bare(f: Partial<EditorFrame>): LinkFrame { const out = { ...f }; delete out.id; delete out.source; return out as LinkFrame }
/** The link a frame came from, if a link opened it. */
export const linkSource = (f: Pick<EditorFrame, 'source'> | undefined) => (f?.source?.startsWith(LINK_SRC) ? f.source.slice(LINK_SRC.length) : undefined)

/** JSON with sorted object keys (the id must not depend on the order a key was set in). */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().filter(k => (x as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(x) ?? 'null'
}
export const linkId = (kind: LinkKind, name: string, frames: LinkFrame[]) => hashText(stable({ k: kind, n: name, f: frames }))

/**
 * What a link of `ids` holds (no ids: every frame of the document). One frame is a frame link named after
 * its card; several, or the whole document, a document link named after the document. Its parent is the
 * link the frames came from (all from the same one), or, shared again unchanged, that link's own parent.
 */
export function linkPayload(d: EditorDoc, ids: string[] = [], links: LinkRecord[] = []): LinkPayload | string {
  const fs = ids.length ? d.frames.filter(f => ids.includes(f.id)) : d.frames
  if (!fs.length) return 'there is nothing to share: the document has no frames'
  const kind: LinkKind = ids.length === 1 ? 'frame' : 'doc', name = kind === 'frame' ? fs[0].card.name : d.name
  const x0 = Math.min(...fs.map(f => f.x)), y0 = Math.min(...fs.map(f => f.y))
  const frames = fs.map(f => ({ ...bare(f), x: f.x - x0, y: f.y - y0 }))
  const id = linkId(kind, name, frames)
  const from = new Set(fs.map(linkSource)), only = from.size === 1 ? [...from][0] : undefined
  const parent = only === undefined ? undefined : only !== id ? only : links.find(r => r.id === id)?.parent
  return { kind, name, frames, id, ...(parent && { parent }) }
}

const wire = (p: LinkPayload) => JSON.stringify({ v: 1, k: p.kind === 'frame' ? 'f' : 'd', n: p.name, f: p.frames, ...(p.parent && { p: p.parent }) })
/** A payload → the packed string after `d=`. Throws `ShareError` past the cap. */
export const encodeLink = (p: LinkPayload, opts: { compress?: boolean } = {}) => packJSON(wire(p), LINK_MAX_ENCODED, opts)

/** The packed string → a checked payload. Throws `ShareError` (malformed, oversized) or `Error` (a bad frame). */
export async function decodeLink(s: string): Promise<LinkPayload> {
  const x = await unpackJSON(s, LINK_MAX_ENCODED, LINK_MAX_JSON) as Record<string, unknown> | null
  if (!x || typeof x !== 'object' || x.v !== 1 || (x.k !== 'f' && x.k !== 'd')) throw new ShareError('not a v1 editor link')
  const { n, f, p } = x
  if (typeof n !== 'string' || n.length > 64) throw new ShareError('link: bad name')
  if (!Array.isArray(f) || !f.length || f.length > MAX_FRAMES || (x.k === 'f' && f.length !== 1)) throw new ShareError(`link: needs 1…${MAX_FRAMES} frames`)
  if (p !== undefined && !isHash(p)) throw new ShareError('link: bad parent id')
  if (f.some(fr => !fr || typeof fr !== 'object' || Array.isArray(fr))) throw new ShareError('link: bad frame')
  const kind: LinkKind = x.k === 'f' ? 'frame' : 'doc', raw = f as LinkFrame[]
  const id = linkId(kind, n, raw)
  // checked like a document (cards, themes, groups, locks); ids are only for the check
  const checked = validateDoc({ kind: 'dot480.editor', v: EDITOR_VERSION, name: n, frames: raw.map((fr, i) => ({ ...bare(fr), id: `f${i}` })) })
  const frames = checked.frames.map(bare)
  return { kind, name: n, frames, id, ...(p !== undefined && { parent: p as string }) }
}

/** `?make&d=<packed>` on the current origin and path. */
export const linkUrl = (packed: string, base: string = `${location.origin}${location.pathname}`) => `${base}?make&${LINK_PARAM}=${packed}`

/** Frames a link already made in this document (a reload, Back, the same link opened again). */
export const linkedFrames = (d: EditorDoc, id: string) => d.frames.filter(f => linkSource(f) === id).map(f => f.id)

/**
 * Open a link in a document: its frames come in as one block in a free spot (each with a new id and
 * `source: 'link:<id>'`), or, when the document has them already, nothing changes and those are returned.
 */
export function openLinkIn(d: EditorDoc, p: LinkPayload, newId: () => string): { doc: EditorDoc; ids: string[]; opened: boolean } | string {
  const had = linkedFrames(d, p.id)
  if (had.length) return { doc: d, ids: had, opened: false }
  if (d.frames.length + p.frames.length > MAX_FRAMES) return `a document holds at most ${MAX_FRAMES} frames; this link has ${p.frames.length}`
  const w = Math.max(...p.frames.map(f => f.x + frameSize(f as EditorFrame).w)), h = Math.max(...p.frames.map(f => f.y + frameSize(f as EditorFrame).h))
  const at = placeFor(d, w, h)
  const frames: EditorFrame[] = p.frames.map(f => ({ ...structuredClone(f), id: newId(), x: f.x + at.x, y: f.y + at.y, source: `${LINK_SRC}${p.id}` }))
  return { doc: { ...d, frames: [...d.frames, ...frames] }, ids: frames.map(f => f.id), opened: true }
}

// ── lineage: the links this browser made or opened ─────────────────────────
export const LINKS_KEY = 'dot480.editor.links'
const MAX_LINKS = 40
type KV = Pick<Storage, 'getItem' | 'setItem'>
const kvOf = (): KV | undefined => { try { return globalThis.localStorage } catch { return undefined } }
export function loadLinks(kv = kvOf()): LinkRecord[] {
  try {
    const raw = JSON.parse(kv?.getItem(LINKS_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((r): r is LinkRecord => !!r && isHash(r.id) && (r.parent === undefined || isHash(r.parent)) && typeof r.name === 'string' && (r.kind === 'frame' || r.kind === 'doc'))
      .map(r => ({ id: r.id, ...(r.parent && { parent: r.parent }), name: r.name.slice(0, 64), kind: r.kind, frames: Number(r.frames) || 1, at: Number(r.at) || 0 }))
  } catch { return [] }
}
/** Remember a link (made or opened); the newest 40 are kept. Returns the list. */
export function recordLink(p: Pick<LinkPayload, 'id' | 'parent' | 'name' | 'kind' | 'frames'>, kv = kvOf(), at = Date.now()): LinkRecord[] {
  const rec: LinkRecord = { id: p.id, ...(p.parent && { parent: p.parent }), name: p.name, kind: p.kind, frames: p.frames.length, at }
  const list = [...loadLinks(kv).filter(r => r.id !== p.id), rec].slice(-MAX_LINKS)
  try { kv?.setItem(LINKS_KEY, JSON.stringify(list)) } catch { /* private mode / full: the link still works */ }
  return list
}
/** A link and its known ancestors, newest first (ids this browser never saw end the chain as a bare id). */
export function lineage(id: string, links: LinkRecord[]): (LinkRecord | { id: string })[] {
  const by = new Map(links.map(r => [r.id, r] as const)), out: (LinkRecord | { id: string })[] = [], seen = new Set<string>()
  for (let at: string | undefined = id; at && !seen.has(at) && out.length < 32; at = by.get(at)?.parent) { seen.add(at); out.push(by.get(at) ?? { id: at }) }
  return out
}
