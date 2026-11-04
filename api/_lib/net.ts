/**
 * The visitor's network (#169): the IPv4 /24 or the IPv6 /64 of the client IP, read only from `x-real-ip`, the
 * header Vercel's proxy sets (the `@vercel/functions` `ipAddress` helper reads the same one). `x-forwarded-for`
 * and anything else a client can send are never read. The raw IP is never stored or logged: only
 * `HMAC(LIKE_HASH_KEY, prefix)` leaves this module (`./likes.ts`).
 */
export const IP_HEADER = 'x-real-ip'

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function v4(ip: string): string | null {
  const m = V4.exec(ip)
  if (!m || m.slice(1).some(o => Number(o) > 255 || (o.length > 1 && o[0] === '0'))) return null
  return `4:${m[1]}.${m[2]}.${m[3]}`
}

function v6(ip: string): string | null {
  if (!/^[0-9a-f:.]+$/i.test(ip) || ip.length > 45) return null
  const tail = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)
  if (tail) { // ::ffff:1.2.3.4 is an IPv4 client
    const head = ip.slice(0, -tail[1].length).toLowerCase()
    return head === '::ffff:' || head === '0:0:0:0:0:ffff:' ? v4(tail[1]) : null
  }
  const halves = ip.toLowerCase().split('::')
  if (halves.length > 2) return null
  const part = (s: string) => (s ? s.split(':') : [])
  const a = part(halves[0]), b = halves.length === 2 ? part(halves[1]) : []
  if (halves.length === 1 && a.length !== 8) return null
  if (a.length + b.length > (halves.length === 2 ? 7 : 8)) return null
  const groups = [...a, ...Array<string>(8 - a.length - b.length).fill('0'), ...b]
  if (!groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return null
  return `6:${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}`
}

/** `4:a.b.c` or `6:h:h:h:h`, or null for a missing or malformed address. */
export function networkPrefix(ip: string | null | undefined): string | null {
  const s = (ip ?? '').trim()
  return !s ? null : s.includes(':') ? v6(s) : v4(s)
}

export const clientNetwork = (req: Request): string | null => networkPrefix(req.headers.get(IP_HEADER))
