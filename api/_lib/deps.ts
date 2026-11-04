/**
 * Production wiring for the likes routes (#169): the config from env, the Upstash store, the BotID check and the
 * site data (program keys, widget uids, seed keys) from the generated bundle `./gen/site.mjs`. Vercel compiles each
 * function file with tsc and no bundler, so the functions can't import `src/` (extensionless and directory imports
 * fail under Node ESM): `scripts/likes/bundle.ts` bundles what they need from `src/lib/likes/site.ts`, and the
 * likes checks fail when that bundle is stale.
 */
import { likesConfig } from './config.js'
import type { Deps } from './likes.js'
import { handle, type Route } from './routes.js'
import { UpstashStore } from './upstash.js'
import { SEED_KEYS, WIDGET_UIDS, programKey } from './gen/site.mjs'

/**
 * BotID (`botid/server`): true when the request looks automated. It reads the request from Vercel's request
 * context, so it only works when deployed (locally it says human). Any error counts as a bot, so a broken setup
 * fails closed; `LIKE_BOTID=off` turns the check off.
 */
export async function botid(): Promise<boolean> {
  try {
    const { checkBotId } = await import('botid/server')
    return (await checkBotId()).isBot
  } catch { return true }
}

let cached: { key: string; deps: Deps | null } | undefined

/** The deps for this instance, rebuilt only if the env changed; null when likes are off. */
export function productionDeps(): Deps | null {
  const cfg = likesConfig(), key = cfg ? JSON.stringify(cfg) : ''
  if (cached?.key === key) return cached.deps
  const deps: Deps | null = cfg && {
    store: new UpstashStore(cfg.redis.url, cfg.redis.token),
    cfg, now: Date.now, bot: botid,
    site: { programKey, widgetUids: WIDGET_UIDS, seedKeys: SEED_KEYS },
    memo: { write: -1, read: -1 },
  }
  cached = { key, deps }
  return deps
}

/** A Vercel function's default export for route `r`. */
export const entry = (r: Route) => ({ fetch: (req: Request) => handle(r, req, productionDeps()) })
