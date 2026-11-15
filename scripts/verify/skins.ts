/**
 * Display skin list checks (#345): four skins in the order OLED, NIXIE, VFD, CRT, and a page whose saved
 * `dot480:skin` or `?skin=` link names a removed skin (LED, INK, FLIP, LCD, GROUT) opens on OLED with no error.
 * The store is loaded fresh in a fake browser per case, as a visitor's first load reads it. The palette and the
 * About page's URL table list the same four. On its own: `pnpm exec tsx scripts/verify/skins.ts`.
 */
import { pickSkin, SKIN_NAMES } from '../../src/engine/display/names'
import { paletteItems } from '../../src/components/palette/api'
import { URL_PARAMS } from '../../src/site/shortcuts'
import { checker, type Assert } from '../lib/check'

const REMOVED = ['led', 'eink', 'flipdisc', 'lcd', 'grout']

/** A fresh copy of the skin store in a fake browser with this address query and saved skin; returns the skin it opens on. */
async function firstSkin(search: string, saved: string | null): Promise<string> {
  const g = globalThis as Record<string, unknown>, keep = { window: g.window, localStorage: g.localStorage }
  const store = new Map<string, string>(saved === null ? [] : [['dot480:skin', saved]])
  g.window = { location: { search, href: `https://example.test/${search}` } }
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  try {
    const fresh = await import(`../../src/components/skins/store.ts?case=${encodeURIComponent(search)}-${saved}-${Math.random()}`) as typeof import('../../src/components/skins/store')
    return fresh.getSkin()
  } finally { for (const [k, v] of Object.entries(keep)) if (v === undefined) delete g[k]; else g[k] = v }
}

export async function skinChecks(assert: Assert) {
  assert('skins: OLED, NIXIE, VFD, CRT in that order', SKIN_NAMES.join() === 'oled,nixie,vfd,crt', SKIN_NAMES.join())
  assert('skins: pickSkin: a link naming a removed or unknown skin is OLED even over a saved skin; a saved removed skin is OLED',
    REMOVED.every(r => pickSkin(r, null) === 'oled' && pickSkin(null, r) === 'oled' && pickSkin(r, r) === 'oled' && pickSkin(r, 'vfd') === 'oled')
      && pickSkin('crt', 'nixie') === 'crt' && pickSkin(null, 'nixie') === 'nixie' && pickSkin('', 'vfd') === 'vfd' && pickSkin(undefined, 42) === 'oled')

  const bad: string[] = []
  for (const r of REMOVED) {
    for (const [search, saved] of [['', r], [`?skin=${r}`, null], [`?skin=${r}`, r], [`?skin=${r}`, 'crt']] as const) {
      try { const got = await firstSkin(search, saved); if (got !== 'oled') bad.push(`${search || '(no query)'} + saved ${saved}: ${got}`) }
      catch (e) { bad.push(`${search || '(no query)'} + saved ${saved}: threw ${(e as Error).message}`) }
    }
  }
  const linked = await firstSkin('?skin=nixie', 'flipdisc')
  assert('skins: a saved dot480:skin or a ?skin= link naming a removed skin opens on OLED, no error; a valid link still wins',
    !bad.length && linked === 'nixie', [...bad, `?skin=nixie + saved flipdisc: ${linked}`].join('; '))

  const palette = paletteItems().filter(i => i.id.startsWith('a:skin-')).map(i => i.id.slice(7))
  const url = URL_PARAMS.find(p => p.keys.startsWith('?skin='))?.keys
  assert('skins: the palette lists the four skins in order; the URL table names nixie, vfd and crt only',
    palette.join() === SKIN_NAMES.join() && url === '?skin=nixie|vfd|crt', `palette ${palette.join()}, url ${url}`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/skins.ts')) {
  const { assert, done } = checker('skins')
  await skinChecks(assert)
  done('skins: all checks passed')
}
