/**
 * The no-flash boot script (docs/LAYOUT-THEME-PLAN.md §4 Runtime path, step 4). Inlined into the `<head>` of
 * `index.html` between `<!-- theme-boot -->` markers by `scripts/site/theme.ts --write`; its sha256 sits in
 * `script-src` of the CSP in `vercel.json`, and `--check` fails when the script, the HTML or the hash drift.
 *
 * Same resolution as `resolvePrefs` / `resolveScheme` in `theme.ts` (the check runs both on the same inputs):
 * per field, `?scheme=` / `?accent=`, then `?theme=<scheme>_<accent>` (both halves valid), then localStorage
 * `dot480:theme` (`{"scheme","accent","hue","css"}`), then `system` + `signal`; `system` follows `prefers-color-scheme`.
 * The custom accent (T6) counts only while its generated CSS is stored; the script then writes that CSS into
 * `<style id="theme-custom">` (style-src allows inline styles), so a custom hue paints without a flash too.
 * It sets `data-scheme` (always `dark` or `light`) and `data-accent` on `<html>` before first paint, and rewrites
 * the `color-scheme` meta (the canvas and native controls before the CSS arrives) and the `theme-color` meta (the
 * browser bar: the scheme's untinted `bg`; the store refines it to the theme's exact `--bg` once the bundle runs).
 * Both metas therefore sit above the script in index.html (`scripts/site/theme.ts --check` asserts it).
 * Last, the CARD SIZE (`src/site/cards.ts`): `data-cards` from localStorage `dot480:cards` (`m` or `s`, else `l`),
 * so a board's columns are right on first paint. It runs after the theme on purpose: a storage that throws here
 * has already cost the theme nothing, and the CSS reads a missing `data-cards` as LARGE.
 *
 * ES5 on purpose (it runs before any bundle) and wrapped in try: a blocked storage or an old browser
 * leaves the attributes unset, and the CSS falls back to `dark_signal`.
 */
import { NEUTRALS } from './accents'
import { ACCENTS } from './names'

export const BOOT_SCRIPT = `(function(){try{var D=document,d=D.documentElement,q=new URLSearchParams(location.search),S=/^(system|dark|light)$/,A=/^(${ACCENTS.join('|')}|custom)$/,t=(q.get('theme')||'').split('_'),j,s,a,c,m,f;if(!(S.test(t[0])&&A.test(t[1])))t=[];try{j=JSON.parse(localStorage.getItem('dot480:theme'))}catch(e){}j=j||{};c=typeof j.css=='string';f=function(l,r,o){return l.filter(function(x){return r.test(x)&&(x!='custom'||c)})[0]||o};s=f([q.get('scheme'),t[0],j.scheme],S,'system');a=f([q.get('accent'),t[1],j.accent],A,'signal');if(s=='system')s=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.dataset.scheme=s;d.dataset.accent=a;if(a=='custom')D.head.appendChild(m=D.createElement('style')).id='theme-custom',m.textContent=j.css;m=D.querySelector('meta[name=color-scheme]');if(m)m.content=s;m=D.querySelector('meta[name=theme-color]');if(m)m.content=s=='light'?'${NEUTRALS.light.bg}':'${NEUTRALS.dark.bg}';d.dataset.cards=/^[ms]$/.test(m=localStorage.getItem('dot480:cards'))?m:'l'}catch(e){}})()`

export const BOOT_START = '<!-- theme-boot -->', BOOT_END = '<!-- /theme-boot -->'
/** The exact `<script>` element written into index.html (the CSP hash covers only the text between the tags). */
export const bootTag = () => `<script>${BOOT_SCRIPT}</script>`
