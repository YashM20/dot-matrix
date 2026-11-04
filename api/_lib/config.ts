/**
 * Likes configuration from env vars (#169). With any required one missing, or `LIKES=off`, `likesConfig` returns
 * null and every route answers a plain 404 without touching the store (local runs, CI, forks).
 *
 * Required: the Upstash REST URL and token (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the Vercel
 * Marketplace names `KV_REST_API_URL` / `KV_REST_API_TOKEN`), `LIKE_COOKIE_KEY` (signs the voter cookie; rotating
 * it revokes every cookie at once) and `LIKE_HASH_KEY` (voter and network hashes; never rotated).
 * Optional: `CRON_SECRET` (the daily job; without it the job route is a 404), `LIKE_BOTID=off` (skip the BotID
 * check, for when it misbehaves), and `LIKE_LIMITS` to override the limits below, as `name=value` pairs
 * (`vd=40,site=1000`), so the live numbers need not be the public defaults.
 */
export const DEFAULT_LIMITS = {
  /** New voter cookies per network per day. */
  nc: 3,
  /** Likes (and unlikes) per voter per minute and per day; a Once visitor counts as its network. */
  vm: 5,
  vd: 40,
  /** Likes per network per day, and how many of them may be Once. */
  nd: 30,
  no: 10,
  /** New and Once likes per network per item (30 days). */
  ni: 3,
  /** New and Once likes per item per hour before the rest are held and flagged (a burst). */
  burst: 20,
  /** Likes on the whole site per day. */
  site: 1000,
  /** Upstash commands per day (the free tier allows 500K a month, about 16,600 a day). */
  budget: 15000,
  /** Commands per day after which even count reads stop (reads keep working past `budget`). */
  hard: 16000,
} as const
export type Limits = { -readonly [K in keyof typeof DEFAULT_LIMITS]: number }

export interface LikesConfig {
  redis: { url: string; token: string }
  cookieKey: string
  hashKey: string
  cronSecret?: string
  botid: boolean
  limits: Limits
}

type Env = Record<string, string | undefined>

export function parseLimits(s: string | undefined): Limits {
  const out: Limits = { ...DEFAULT_LIMITS }
  for (const pair of (s ?? '').split(',')) {
    const [k, v] = pair.split('=').map(x => x?.trim())
    if (k && Object.prototype.hasOwnProperty.call(out, k) && /^\d{1,7}$/.test(v ?? '') && Number(v) > 0) out[k as keyof Limits] = Number(v)
  }
  return out
}

/** The config, or null when likes are off. Secrets shorter than 32 characters count as missing. */
export function likesConfig(env: Env = process.env): LikesConfig | null {
  if ((env.LIKES ?? '').trim().toLowerCase() === 'off') return null
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  const cookieKey = env.LIKE_COOKIE_KEY ?? '', hashKey = env.LIKE_HASH_KEY ?? ''
  if (!url || !/^https:\/\//.test(url) || !token || cookieKey.length < 32 || hashKey.length < 32) return null
  return {
    redis: { url, token }, cookieKey, hashKey,
    ...(env.CRON_SECRET && env.CRON_SECRET.length >= 16 && { cronSecret: env.CRON_SECRET }),
    botid: (env.LIKE_BOTID ?? '').trim().toLowerCase() !== 'off',
    limits: parseLimits(env.LIKE_LIMITS),
  }
}
