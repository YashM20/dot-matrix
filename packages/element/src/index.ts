/**
 * `<dot-card>`: a Dot/480 card as a custom element. No framework; shadow DOM; respects reduced motion.
 *   <dot-card card="timer"></dot-card>
 *   <dot-card card="ui-knob" data-value="0.7" theme="deerflowMosaic" renderer="canvas" pitch="3"></dot-card>
 *   <dot-card src="./spec.json"></dot-card>                       (JSON card spec, see `@dot480/core/spec`)
 *   <dot-card><script type="application/json">{ "grid": … }</script></dot-card>
 * `data-*` attributes become numeric data (`data-value="0.5"`, `data-on="true"` → 1).
 * Events: `dot-input` (detail: { patch, data }) when a control is edited.
 */
import { dot480, themes, type ThemeTokens } from '@dot480/core'
import { mountCard, type CardHandle, type RendererChoice } from '@dot480/core/card'
import { presetById, type CardPreset } from '@dot480/core/presets'
import { presetFromSpec, type DotSpec } from '@dot480/core/spec'

const CSS = `
:host { display: inline-block; box-sizing: border-box; vertical-align: top; width: var(--dot-card-width, 320px); color-scheme: dark }
:host([hidden]) { display: none }
.card { box-sizing: border-box; display: flex; flex-direction: column; background: var(--dot-card-surface); border-radius: var(--dot-card-radius);
  border: 1px solid var(--dot-card-line, rgba(255,255,255,.06)); padding: var(--dot-card-pad, 18px); }
.card.bleed { padding: 0 }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
  font: 500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .16em; color: var(--dot-card-label) }
header[hidden] { display: none }
header i { width: 6px; height: 6px; border-radius: 50%; background: var(--dot-card-accent) }
.body { position: relative; width: 100%; outline: none }
.body:focus-visible { outline: 1px dashed var(--dot-card-label); outline-offset: 3px }
.err { font: 11px ui-monospace, monospace; color: var(--dot-card-label); padding: 8px 0 }
`

const parseNum = (v: string): number | undefined => {
  if (v === 'true') return 1
  if (v === 'false') return 0
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined
}

/** Importable during SSR / in Node: the class only needs a real `HTMLElement` once it is constructed. */
const Base = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement

export class DotCardElement extends Base {
  static observedAttributes = ['card', 'src', 'theme', 'renderer', 'pitch', 'animated']
  private root: ShadowRoot
  private cardEl: HTMLDivElement
  private head: HTMLElement
  private body: HTMLDivElement
  private handle: CardHandle | null = null
  private preset: CardPreset | undefined
  private mo: MutationObserver | null = null
  private loadId = 0

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = CSS
    this.cardEl = document.createElement('div'); this.cardEl.className = 'card'; this.cardEl.part.add('card')
    this.head = document.createElement('header'); this.head.setAttribute('aria-hidden', 'true'); this.head.part.add('label')
    this.body = document.createElement('div'); this.body.className = 'body'; this.body.part.add('body')
    this.cardEl.append(this.head, this.body)
    this.root.append(style, this.cardEl)
  }

  /** The live card data (preset defaults + data-* + control edits). */
  get data(): Record<string, number> { return this.handle?.data ?? {} }
  /** The underlying runtime (render, update), once mounted. */
  get card(): CardHandle | null { return this.handle }

  connectedCallback() {
    this.mo = new MutationObserver(records => {
      if (records.some(r => r.attributeName?.startsWith('data-'))) this.handle?.update({ data: this.readData() })
      else if (records.some(r => r.type === 'childList' || r.type === 'characterData')) void this.load()
    })
    this.mo.observe(this, { attributes: true, childList: true, characterData: true, subtree: true })
    void this.load()
  }
  disconnectedCallback() {
    this.mo?.disconnect(); this.mo = null
    this.handle?.destroy(); this.handle = null
  }
  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (old === value || !this.isConnected) return
    if (name === 'card' || name === 'src') void this.load()
    else this.handle?.update(this.options())
  }

  private readData(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(this.dataset)) { const n = v === undefined ? undefined : parseNum(v); if (n !== undefined) out[k] = n }
    return out
  }
  private theme(): ThemeTokens {
    const name = this.getAttribute('theme')
    return (name && (themes as Record<string, ThemeTokens>)[name]) || dot480
  }
  private options() {
    const r = this.getAttribute('renderer'), pitch = parseNum(this.getAttribute('pitch') ?? ''), a = this.getAttribute('animated')
    return {
      data: this.readData(), theme: this.theme(),
      renderer: (r === 'svg' || r === 'canvas' ? r : 'auto') as RendererChoice,
      pitch: pitch && pitch > 0 ? pitch : undefined,
      animated: a === null ? undefined : a !== 'false',
    }
  }

  private async resolve(): Promise<CardPreset> {
    const id = this.getAttribute('card'), src = this.getAttribute('src')
    if (id) {
      const p = presetById(id)
      if (!p) throw new Error(`unknown card "${id}"`)
      return p
    }
    let spec: DotSpec | undefined
    if (src) {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`spec ${src}: HTTP ${res.status}`)
      spec = await res.json() as DotSpec
    } else {
      const json = this.querySelector('script[type="application/json"]')?.textContent
      if (json) spec = JSON.parse(json) as DotSpec
    }
    if (!spec) throw new Error('set card="<id>", src="<spec.json>" or an inline JSON spec')
    return presetFromSpec(spec)
  }

  private async load() {
    const id = ++this.loadId
    let preset: CardPreset
    try { preset = await this.resolve() } catch (e) { if (id === this.loadId) this.fail(e); return }
    if (id !== this.loadId || !this.isConnected) return
    this.preset = preset
    const theme = this.theme()
    this.style.setProperty('--dot-card-surface', theme.surface)
    this.style.setProperty('--dot-card-radius', `${theme.cornerRadiusCard}px`)
    this.style.setProperty('--dot-card-label', theme.dotIdle)
    this.style.setProperty('--dot-card-accent', theme.dotActive)
    this.cardEl.classList.toggle('bleed', !!preset.bleed)
    this.head.hidden = preset.chrome === 'dots'
    this.head.replaceChildren(preset.name.toUpperCase())
    if (preset.live) this.head.append(document.createElement('i'))
    this.body.querySelector('.err')?.remove()
    const opts = { preset, ...this.options(), onInput: (patch: Record<string, number>, data: Record<string, number>) => this.dispatchEvent(new CustomEvent('dot-input', { detail: { patch, data }, bubbles: true, composed: true })) }
    if (this.handle) this.handle.update(opts)
    else this.handle = mountCard(this.body, opts)
  }

  private fail(e: unknown) {
    this.handle?.destroy(); this.handle = null; this.preset = undefined
    this.head.hidden = true
    const msg = document.createElement('div')
    msg.className = 'err'; msg.textContent = `dot-card: ${e instanceof Error ? e.message : String(e)}`
    this.body.replaceChildren(msg)
  }

  /** The resolved preset (after load). */
  get resolvedPreset(): CardPreset | undefined { return this.preset }
}

/** Register `<dot-card>` (idempotent). Importing the package registers it; call this for a custom tag name. */
export function defineDotCard(tag = 'dot-card') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, tag === 'dot-card' ? DotCardElement : class extends DotCardElement {})
}
defineDotCard()

declare global { interface HTMLElementTagNameMap { 'dot-card': DotCardElement } }
