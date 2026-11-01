/**
 * Short-URL sharing for Field IR programs ("Dwitter for dots"): `{src, grid, lattice, tone, parent?}`
 * packed into one URL-safe string. `z…` = deflate-raw (CompressionStream) + base64url, `b…` = plain
 * base64url (no CompressionStream, or when it is shorter). Decoding only parses and checks shape and
 * size — the program itself still goes through the IR parser and its limits; nothing is evaluated here.
 */
import { IR_LIMITS } from '../engine/ir'
import type { GridConfig, Tone } from '../engine/types'

export const SHARE_GRIDS = {
  square: { cols: 144, rows: 144, pitch: 2.25 },
  wide: { cols: 216, rows: 108, pitch: 2.25 },
  tall: { cols: 108, rows: 162, pitch: 2.25 },
} as const satisfies Record<string, GridConfig>
export type ShareGrid = keyof typeof SHARE_GRIDS
export const SHARE_LATTICES = [1, 2, 3, 4, 6] as const
export const SHARE_TONES = ['auto', 'value', 'mid', 'idle', 'active'] as const satisfies readonly Tone[]
export type ShareTone = typeof SHARE_TONES[number]

export interface SharedProgram { src: string; grid: ShareGrid; lattice: number; tone: ShareTone; parent?: string }

/** Longest encoded string a link may carry (a 4 kB program of incompressible text, base64url'd, fits). */
export const SHARE_MAX_ENCODED = 8192
/** Longest decoded JSON accepted (stops a deflate bomb early; JSON escapes can grow the source ~6×). */
const MAX_JSON = IR_LIMITS.source * 6 + 256
const HASH = /^[0-9a-f]{8}$/

export class ShareError extends Error { constructor(message: string) { super(message); this.name = 'ShareError' } }

/** FNV-1a of a string as 8 hex digits (program and editor link ids). */
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}
/** Stable 8-hex id of a program (what `parent` points at): FNV-1a over the canonical fields. */
export const programHash = (p: Pick<SharedProgram, 'src' | 'grid' | 'lattice' | 'tone'>): string => hashText(`${p.grid}|${p.lattice}|${p.tone}|${p.src}`)
export const isHash = (s: unknown): s is string => typeof s === 'string' && HASH.test(s)

const toB64url = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new ShareError('link is not base64url')
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, max: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader()
  const parts: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.length
    if (n > max) { await reader.cancel(); throw new ShareError('link inflates past the size limit') }
    parts.push(value)
  }
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** Check a program's fields; throws `ShareError`. The source is checked for size only (the IR parser does the rest). */
export function checkShared(x: unknown): SharedProgram {
  const o = x as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ShareError('link holds no program')
  const { src, grid, lattice, tone, parent } = o
  if (typeof src !== 'string') throw new ShareError('program source missing')
  if (src.length > IR_LIMITS.source) throw new ShareError(`program is ${src.length} characters, more than ${IR_LIMITS.source}`)
  if (typeof grid !== 'string' || !Object.prototype.hasOwnProperty.call(SHARE_GRIDS, grid)) throw new ShareError(`unknown grid ${JSON.stringify(grid)}`)
  if (!SHARE_LATTICES.includes(lattice as 1)) throw new ShareError(`unknown lattice ${JSON.stringify(lattice)}`)
  if (!SHARE_TONES.includes(tone as 'auto')) throw new ShareError(`unknown tone ${JSON.stringify(tone)}`)
  if (parent !== undefined && (typeof parent !== 'string' || !HASH.test(parent))) throw new ShareError('bad parent hash')
  return { src, grid: grid as ShareGrid, lattice: lattice as number, tone: tone as ShareTone, ...(parent !== undefined && { parent: parent as string }) }
}

/**
 * JSON text → URL-safe string: `z…` deflate-raw + base64url when that is available and shorter, else `b…`
 * plain base64url. Throws `ShareError` past `maxEncoded` characters. Shared by program links and the editor's
 * frame / document links (`src/components/editor/link.ts`).
 */
export async function packJSON(json: string, maxEncoded: number, opts: { compress?: boolean } = {}): Promise<string> {
  const bytes = new TextEncoder().encode(json)
  const plain = 'b' + toB64url(bytes)
  let out = plain
  if (opts.compress !== false && canCompress()) {
    try {
      const z = 'z' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw'), bytes.length * 2 + 1024))
      if (z.length < plain.length) out = z
    } catch { /* keep plain */ }
  }
  if (out.length > maxEncoded) throw new ShareError(`link would be ${out.length} characters, more than ${maxEncoded}`)
  return out
}
/** URL-safe string → parsed JSON. Throws `ShareError` on anything malformed, over `maxEncoded` characters or inflating past `maxJson` bytes. */
export async function unpackJSON(s: string, maxEncoded: number, maxJson: number): Promise<unknown> {
  if (typeof s !== 'string' || s.length < 2) throw new ShareError('empty link')
  if (s.length > maxEncoded) throw new ShareError(`link is ${s.length} characters, more than ${maxEncoded}`)
  const kind = s[0], body = fromB64url(s.slice(1))
  let bytes: Uint8Array
  if (kind === 'b') bytes = body
  else if (kind === 'z') {
    if (!canCompress()) throw new ShareError('this browser cannot inflate compressed links')
    try { bytes = await pipe(body, new DecompressionStream('deflate-raw'), maxJson) }
    catch (e) { throw e instanceof ShareError ? e : new ShareError('link is corrupt (inflate failed)') }
  } else throw new ShareError(`unknown link format "${kind}"`)
  if (bytes.length > maxJson) throw new ShareError('link is over the size limit')
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new ShareError('link is corrupt (not JSON)') }
}

/** Program → URL-safe string (deflated when that is available and shorter). */
export async function encodeShare(p: SharedProgram, opts: { compress?: boolean } = {}): Promise<string> {
  const ok = checkShared(p)
  return packJSON(JSON.stringify({ v: 1, s: ok.src, g: ok.grid, l: ok.lattice, o: ok.tone, ...(ok.parent && { p: ok.parent }) }), SHARE_MAX_ENCODED, opts)
}

/** URL-safe string → program. Throws `ShareError` on anything malformed or oversized; never evaluates. */
export async function decodeShare(s: string): Promise<SharedProgram> {
  const d = await unpackJSON(s, SHARE_MAX_ENCODED, MAX_JSON) as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || d.v !== 1) throw new ShareError('not a v1 dot link')
  return checkShared({ src: d.s, grid: d.g, lattice: d.l, tone: d.o, parent: d.p })
}

/** `?make=code&p=<encoded>` (MAKE · CODE) on the current origin and path; the older `?tab=dots&p=` still opens. */
export const shareUrl = (encoded: string, base: string = `${location.origin}${location.pathname}`) => `${base}?make=code&p=${encoded}`
