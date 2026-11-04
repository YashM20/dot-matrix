/**
 * The voter cookie (#169), set only by the server after "Remember" (Safari caps cookies set from JavaScript at 7
 * days). `HttpOnly; Secure; SameSite=Lax; Path=/api`, one year. The value is
 * `1.<kid>.<id>.<issue day>.<days>.<last visit hour>.<sig>`: a random id, the key id, the UTC day it was issued, the
 * number of separate visit days (each at least 20 h after the last), and an HMAC over the rest. The key id is
 * derived from `LIKE_COOKIE_KEY`, so a new key turns every old cookie into a wrong-key one (counted as Once).
 */
import { hmac, randomId, sameString } from './crypto.js'

export const COOKIE = 'dot480_lk'
const RE = /^1\.([A-Za-z0-9_-]{6})\.([A-Za-z0-9_-]{22})\.(\d{1,6})\.(\d{1,3})\.(\d{1,7})\.([A-Za-z0-9_-]{43})$/
/** Hours between two visits for them to count as separate days. */
export const VISIT_GAP_H = 20
const YEAR_S = 365 * 86400

export interface Voter { id: string; issued: number; days: number; last: number }

export const keyId = (secret: string) => hmac(secret, 'dot480 likes key id', 6)

async function sign(secret: string, v: Voter): Promise<string> {
  const body = `1.${await keyId(secret)}.${v.id}.${v.issued}.${v.days}.${v.last}`
  return `${body}.${await hmac(secret, body)}`
}

/** The cookie's voter, or null when it is missing, malformed, signed with another key or edited. */
export async function readVoter(req: Request, secret: string): Promise<Voter | null> {
  const raw = (req.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  const m = raw ? RE.exec(raw) : null
  if (!m) return null
  const [, kid, id, issued, days, last, sig] = m
  if (!sameString(kid, await keyId(secret))) return null
  if (!sameString(sig, await hmac(secret, raw!.slice(0, raw!.length - 44)))) return null
  return { id, issued: Number(issued), days: Number(days), last: Number(last) }
}

const attrs = `Path=/api; HttpOnly; Secure; SameSite=Lax`
export const setCookie = async (secret: string, v: Voter) => `${COOKIE}=${await sign(secret, v)}; Max-Age=${YEAR_S}; ${attrs}`
export const clearCookie = () => `${COOKIE}=; Max-Age=0; ${attrs}`

export const newVoter = (nowMs: number): Voter => ({ id: randomId(16), issued: Math.floor(nowMs / 864e5), days: 1, last: Math.floor(nowMs / 36e5) })

/** A visit: one more day when the last counted one was at least 20 h ago, else null (nothing to re-sign). */
export function visit(v: Voter, nowMs: number): Voter | null {
  const h = Math.floor(nowMs / 36e5)
  return h - v.last >= VISIT_GAP_H ? { ...v, days: Math.min(999, v.days + 1), last: h } : null
}
