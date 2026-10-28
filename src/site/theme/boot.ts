/**
 * The no-flash boot script (docs/LAYOUT-THEME-PLAN.md §4 Runtime path, step 4). Inlined into the `<head>` of
 * `index.html` between `<!-- theme-boot -->` markers by `scripts/site/theme.ts --write`; its sha256 sits in
 * `script-src` of the CSP in `vercel.json`, and `--check` fails when the script, the HTML or the hash drift.
 *
 * Same resolution as `resolvePrefs` / `resolveScheme` in `theme.ts` (the check runs both on the same inputs):
 * per field, `?scheme=` / `?accent=`, then `?theme=<scheme>_<accent>` (both halves valid), then localStorage
 * `dot480:theme` (`{"scheme","accent"}`), then `system` + `signal`; `system` follows `prefers-color-scheme`.
 * It sets `data-scheme` (always `dark` or `light`) and `data-accent` on `<html>` before first paint, and rewrites
 * the `color-scheme` meta (the canvas and native controls before the CSS arrives) and the `theme-color` meta (the
 * browser bar: the scheme's untinted `bg`; the store refines it to the theme's exact `--bg` once the bundle runs).
 * Both metas therefore sit above the script in index.html (`scripts/site/theme.ts --check` asserts it).
 *
 * ES5 on purpose (it runs before any bundle) and wrapped in try: a blocked storage or an old browser
 * leaves the attributes unset, and the CSS falls back to `dark_signal`.
 */
import { NEUTRALS } from './accents'
import { ACCENTS } from './names'

export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search),S=/^(system|dark|light)$/,A=/^(${ACCENTS.join('|')})$/,t=(q.get('theme')||'').split('_'),j=null,s,a;if(!(S.test(t[0])&&A.test(t[1])))t=[];try{j=JSON.parse(localStorage.getItem('dot480:theme'))}catch(e){}j=j||{};s=[q.get('scheme'),t[0],j.scheme].filter(function(x){return S.test(x)})[0]||'system';a=[q.get('accent'),t[1],j.accent].filter(function(x){return A.test(x)})[0]||'signal';if(s=='system')s=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.setAttribute('data-scheme',s);d.setAttribute('data-accent',a);var m=document.querySelector('meta[name=color-scheme]');if(m)m.content=s;m=document.querySelector('meta[name=theme-color]');if(m)m.content=s=='light'?'${NEUTRALS.light.bg}':'${NEUTRALS.dark.bg}'}catch(e){}})()`

export const BOOT_START = '<!-- theme-boot -->', BOOT_END = '<!-- /theme-boot -->'
/** The exact `<script>` element written into index.html (the CSP hash covers only the text between the tags). */
export const bootTag = () => `<script>${BOOT_SCRIPT}</script>`
