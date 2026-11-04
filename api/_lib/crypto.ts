/** HMAC, hashes and random ids on Web Crypto (Node 22 and the Vercel runtime have it as a global). */
const enc = new TextEncoder()
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>
const keys = new Map<string, Promise<Key>>()

export const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function key(secret: string): Promise<Key> {
  let k = keys.get(secret)
  if (!k) { k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); keys.set(secret, k) }
  return k
}

/** HMAC-SHA-256 of `msg`, base64url (43 characters), or its first `len` characters. */
export async function hmac(secret: string, msg: string, len = 43): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(msg))).slice(0, len)
}

/** Compares two strings in time that depends only on their length. */
export function sameString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/** `n` random bytes, base64url. */
export const randomId = (n = 16): string => b64url(crypto.getRandomValues(new Uint8Array(n)))
