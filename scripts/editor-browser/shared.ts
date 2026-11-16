/**
 * Shared state and page helpers for the editor browser probe (scripts/editor-browser.ts and its passes in this
 * folder): the run's base URL and output folder, the check tally, the page helpers and the modifier bits.
 */
import { resolve } from 'node:path'
import { sleep, type Page } from '../lib/cdp'

export const out = resolve('.snapshots', 'editor')
/** The site under test. The entry sets it once, before any pass runs. */
export let base = ''
export const setBase = (url: string) => { base = url }

export let failures = 0, passes = 0
export const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (ok) passes++; else failures++ }
export type Rect = { x: number; y: number; w: number; h: number; r: number; b: number }

export const PROGRAM = `// blobs: three metaballs orbiting the centre
let a = .08 / length(u - .5 - .22 * cos(t), v - .5 - .22 * sin(t * 1.3));
let b = .07 / length(u - .5 - .2 * cos(t * .7 + 2), v - .5 - .25 * sin(t + 1));
let c = .06 / length(u - .5 + .18 * sin(t * 1.1), v - .5 + .2 * cos(t * .8));
smoothstep(.9, 1.6, a + b + c)`

/** Page helpers shared by both passes. */
export function helpers(p: Page) {
  const q = JSON.stringify
  const rect = (sel: string) => p.js<Rect | null>(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom } })()`)
  const frameRect = (id: string) => rect(`.ed-frame[data-frame="${id}"]`)
  /** Lit pixels of a frame's canvas (default: the selected one) and a cheap signature of them. */
  const lit = (id?: string) => p.js<{ n: number; sig: number }>(`(() => { const id = ${id ? q(id) : 'window.__editor?.sel'}; const c = id && document.querySelector('.ed-frame[data-frame="' + id + '"]'); if (!c) return { n: -1, sig: 0 }; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sig = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) { n++; sig = (sig * 31 + i) % 1000003 } return { n, sig } })()`)
  const sel = () => p.js<string | undefined>(`window.__editor?.sel`)
  const frameIds = () => p.js<string[]>(`[...document.querySelectorAll('.ed-frame')].map(c => c.dataset.frame)`)
  const tool = () => p.js<string>(`document.querySelector('.ed-tool[aria-pressed="true"]')?.getAttribute('aria-label') ?? ''`)
  const tab = (scope: string) => p.js<string>(`document.querySelector(${q(scope)} + ' [role=tab][aria-selected="true"]')?.textContent ?? ''`)
  const sizeOf = (id: string) => p.js<string>(`document.querySelector('[data-frame-label="${id}"] small')?.textContent ?? ''`)
  const text = (s: string) => p.js<string>(`document.querySelector(${q(s)})?.textContent ?? ''`)
  const clickText = (s: string, label: string) => p.js(`(() => { const b = [...document.querySelectorAll(${q(s)})].find(b => b.textContent.trim().startsWith(${q(label)})); if (!b) throw new Error('no ' + ${q(label)}); b.click() })()`)
  const setValue = (s: string, v: string | number, event = 'input') => p.js(`(() => { const el = document.querySelector(${q(s)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(v))}); el.dispatchEvent(new Event(${q(event)}, { bubbles: true })) })()`)
  const setLabeled = (label: string, v: string | number, event = 'input') => p.js(`(() => { const l = [...document.querySelectorAll('.ed-insp .ed-field')].find(x => x.querySelector('span')?.textContent.trim() === ${q(label)}); const el = l.querySelector('input, select'); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(v))}); el.dispatchEvent(new Event(${q(event)}, { bubbles: true })) })()`)
  const typeIR = async (src: string) => { await p.js(`(() => { const a = document.querySelector('.ed-insp .dw-code textarea'); a.focus(); a.select() })()`); await p.cdp('Input.insertText', { text: src }); await sleep(500) }
  const blur = () => p.js(`document.activeElement?.blur()`)
  /** The element at a rect's centre is that element (or inside it): nothing covers it. A disabled control is not hit-tested, so its own ancestor there counts as uncovered. */
  const uncovered = (s: string) => p.js<boolean>(`[...document.querySelectorAll(${q(s)})].every(e => { const r = e.getBoundingClientRect(); if (!r.width) return false; const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && (hit === e || e.contains(hit) || (e.disabled && hit.contains(e))) })`)
  const layerRows = () => p.js<string[]>(`[...document.querySelectorAll('.ed-tree-frame.within .ed-row--layer .ed-row-name')].map(b => b.textContent)`)
  /** Wait until a finished download matches. */
  const downloaded = async (ok: (d: { name: string; bytes: number }) => boolean, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (p.downloads.some(ok)) return true; await sleep(100) } return false }
  const fresh = async (url: string) => {
    await p.cdp('Page.navigate', { url }); await p.waitFor(`!!document.querySelector('.ed-frame')`, 60000)
    await p.js(`localStorage.removeItem('dot480.editor.v1')`); await p.cdp('Page.reload')
    return p.waitFor(`!!document.querySelector('.ed-frame') && document.querySelectorAll('.ed-frame').length >= 3`, 60000)
  }
  /** Leave time for the debounced autosave before the next navigation. */
  const go = async (url: string, ready = `!!document.querySelector('.ed-frame')`) => { await sleep(700); await p.cdp('Page.navigate', { url }); const ok = await p.waitFor(ready, 30000); await sleep(600); return ok }
  /** A link that adds something (#143): the editor asks first. Waits for the prompt (optionally shot), presses KEEP, then waits for `ready`. */
  const keep = async (url: string, ready = `!!document.querySelector('.ed-frame')`, shot?: string) => {
    await sleep(700); await p.cdp('Page.navigate', { url })
    const asked = await p.waitFor(`!!document.querySelector('.ed-confirm .ed-confirm-keep')`, 30000)
    if (shot) await p.shot(shot)
    await p.js(`document.querySelector('.ed-confirm .ed-confirm-keep')?.click()`)
    const ok = await p.waitFor(ready, 30000); await sleep(600); return asked && ok
  }
  return { rect, frameRect, lit, sel, frameIds, tool, tab, sizeOf, text, clickText, setValue, setLabeled, typeIR, blur, uncovered, layerRows, downloaded, fresh, go, keep }
}
export const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol
export const mid = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const
export type Helpers = ReturnType<typeof helpers>

export const ALT = 1, CTRL = 2, SHIFT = 8
