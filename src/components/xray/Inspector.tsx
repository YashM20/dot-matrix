/**
 * X-ray inspector: a docked panel for the X-ray card under the pointer (or the last one). Runtime
 * (renderer, fps, dots, t), the layer list with solo / mute, live data keys, `describe()` and the
 * card's spec (`presetToSpec`), plus Open in DOTS and a deep link. It opens on SUMMARY (UX U2): the same card in
 * plain words, with tap / hover definitions from the glossary.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Layer } from '../../engine'
import { describe, type CardDescription } from '../../engine/describe'
import { presetToSpec } from '../../spec'
import { GLOSSARY, GLOSSARY_TERMS, type GlossaryTerm } from '../glossary'
import { fmt, layerKind, layerName, layerIR } from './probe'
import { cardElement, muteLayer, probes, setXR, soloLayer, toggleCard, toggleGlobal, useXR, xrState, type CardProbe } from './store'

/** At this width the inspector is a bottom sheet (App.css): a grip, swipe down to close, swipe up for more. */
const SHEET = '(max-width: 760px)'
const isSheet = () => typeof matchMedia === 'function' && matchMedia(SHEET).matches
/** Close the sheet for real: X-ray off for the card it shows (the desktop panel's "hover a card" state means nothing on touch). */
function dismiss(key: string | null) {
  if (xrState().global) toggleGlobal(false)
  else if (key) toggleCard(key)
  else setXR({ active: null })
}
/**
 * Bottom-sheet drag on the grip and header: the sheet follows the finger down; let go past 80 px (or a quick
 * flick) and it steps down (full → half → closed); a pull up past 40 px opens it full. Buttons keep their taps.
 */
function useSheetDrag(onClose: () => void) {
  const [full, setFull] = useState(false)
  const [dy, setDy] = useState(0)
  const drag = useRef<{ id: number; y0: number; t0: number; moving: boolean } | null>(null)
  const end = (e: ReactPointerEvent<HTMLElement>, cancel: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null; setDy(0)
    if (cancel || !d.moving) return
    const dist = e.clientY - d.y0, v = dist / Math.max(1, e.timeStamp - d.t0)
    if (dist > 80 || v > .6) { if (full) setFull(false); else onClose() }
    else if (dist < -40 || v < -.6) setFull(true)
  }
  const grip = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (!isSheet() || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as HTMLElement).closest('button:not(.xr-grip)')) return
      drag.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp, moving: false }
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      // capture only once it moves, so a tap on the grip stays a click on the grip
      if (!d.moving && Math.abs(e.clientY - d.y0) > 6) {
        d.moving = true
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* gone */ }
      }
      if (d.moving) setDy(e.clientY - d.y0)
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) { end(e, false) },
    onPointerCancel(e: ReactPointerEvent<HTMLElement>) { end(e, true) },
  }
  // down follows the finger; up gives a little (rubber band) before it snaps open
  const style = dy ? { transform: `translateY(${dy > 0 ? dy : dy / 4}px)`, transition: 'none' } : undefined
  return { full, setFull, grip, style }
}

const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`
/** SUMMARY: what the card is made of, how many dots, what the controls change; glossary words are buttons. */
function Summary({ probe, layers, d }: { probe: CardProbe; layers: Layer[]; d: CardDescription }) {
  const [word, setWord] = useState<GlossaryTerm | null>(null)
  const term = (k: GlossaryTerm, label: string = k): ReactNode => <button type="button" className="xr-term" title={GLOSSARY[k]} aria-expanded={word === k} onClick={() => setWord(w => (w === k ? null : k))}>{label}</button>
  const coarse = layers.filter(l => !l.sites && (l.lattice ?? 1) > 1).length, sited = layers.filter(l => l.sites).length, ir = layers.some(l => layerIR(l))
  const names = [...new Set(layers.map(layerName))], steps = probe.style.quantizeSteps
  return <div className="xr-summary">
    <p>{probe.preset.name} is {plural(layers.length, 'layer')} of {term('field', 'fields')} ({names.slice(0, 4).join(', ')}{names.length > 4 ? ', …' : ''}), sampled into <b>{plural(probe.stats.dots, 'dot')}</b> on a {probe.grid.cols}×{probe.grid.rows} grid.</p>
    {(coarse > 0 || sited > 0) && <p>{coarse > 0 && <>{plural(coarse, 'layer')} {coarse === 1 ? 'sits' : 'sit'} on a coarser {term('lattice')} for bigger dots. </>}{sited > 0 && <>{plural(sited, 'layer')} {sited === 1 ? 'places' : 'place'} dots at exact {term('site', 'sites')}.</>}</p>}
    <p>Each dot's size is the field's value{steps ? <>, snapped to {steps} steps ({term('quantize')})</> : ' (not quantized)'}; its colour is its {term('tone')}.{ir && <> Part of it is written in {term('IR')}, so REMIX opens its own program.</>}</p>
    {d.controls.length ? <ul>{d.controls.map(c => <li key={c.key}><b>{c.label}</b> ({c.kind}) sets <code>{c.key}</code>, now {c.valueText}</li>)}</ul>
      : <p>No controls: {probe.animated ? 'it moves on its own clock' : 'it is a still picture'}.</p>}
    <p className="xr-note">Hover any dot to see its value, size step, tone and layer.</p>
    <p className="xr-words">{GLOSSARY_TERMS.map(k => <span key={k}>{term(k)}</span>)}</p>
    {word && <p className="xr-def" role="note"><b>{word}</b> {GLOSSARY[word]}</p>}
  </div>
}

export function Inspector({ onRemix, onStudio, onCopyLink }: { onRemix: (cardId: string, data: Record<string, number>) => void; onStudio: (cardId: string) => void; onCopyLink: (cardId?: string) => void }) {
  const active = useXR(s => s.active)
  const anyOn = useXR(s => s.global || s.on.size > 0)
  const solo = useXR(s => (active ? s.solo[active] : undefined))
  const muted = useXR(s => (active ? s.muted[active] : undefined))
  const [, setRev] = useState(0)
  // live values: re-read the active card's probe a few times a second
  useEffect(() => {
    if (!anyOn || !active) return
    const id = window.setInterval(() => setRev(r => r + 1), 250)
    return () => clearInterval(id)
  }, [anyOn, active])
  const [tab, setTab] = useState<'summary' | 'layers' | 'data' | 'describe' | 'spec'>('summary')
  const sheet = useSheetDrag(() => dismiss(active))
  // sheet: keep the inspected card in view above the half-height sheet (it covers the lower part of the screen)
  useEffect(() => {
    if (!active || !isSheet()) return
    const el = cardElement(active)
    if (!el) return
    const r = el.getBoundingClientRect(), sheetTop = window.innerHeight * .58
    if (r.bottom > sheetTop && r.top > 64) window.scrollBy({ top: Math.min(r.top - 64, r.bottom - sheetTop), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [active])
  const probe = active ? probes.get(active) : undefined
  const presetId = probe?.preset.id
  const layers = useMemo(() => { try { return probe ? probe.layers({ t: probe.stats.t, frame: 0, data: probe.data, grid: probe.grid }) : [] } catch { return [] } }, [probe, probe?.stats.t, probe?.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const spec = useMemo(() => {
    if (tab !== 'spec' || !probe) return ''
    try { return JSON.stringify(presetToSpec(probe.preset), null, 1) } catch (e) { return `// presetToSpec failed: ${(e as Error).message}` }
  }, [tab, presetId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!anyOn) return null
  if (!probe) return <aside className="xr-panel xr-panel--empty" aria-label="X-ray inspector"><p>Hover an X-ray card to inspect it.</p><button onClick={() => toggleGlobal(false)}>X-RAY OFF</button></aside>
  const d = describe(probe.preset, { t: probe.stats.t, data: probe.data })
  const keys = Object.keys(probe.data).sort()
  const mode = probe.mode(), worker = probe.worker()
  return (
    <aside className={`xr-panel${sheet.full ? ' xr-panel--full' : ''}`} style={sheet.style} aria-label={`X-ray inspector: ${probe.preset.name}`}>
      <div className="xr-sheet-top" {...sheet.grip}>
        <button type="button" className="xr-grip" aria-label={sheet.full ? 'Show less of the inspector' : 'Show more of the inspector'} aria-expanded={sheet.full} onClick={() => sheet.setFull(f => !f)} />
        <header className="xr-panel-head">
          <div><b>{probe.preset.name.toUpperCase()}</b><small>{probe.preset.id} · {probe.preset.group}</small></div>
          <button aria-label="Close inspector" onClick={() => (isSheet() ? dismiss(active) : setXR({ active: null }))}>×</button>
        </header>
      </div>
      <dl className="xr-runtime">
        <div><dt>RENDERER</dt><dd>{mode}{worker ? ' + worker' : ''}</dd></div>
        <div><dt>FPS</dt><dd>{probe.animated && probe.fps ? `${probe.stats.fps} / ${probe.fps}` : 'static'}</dd></div>
        <div><dt>DOTS</dt><dd>{probe.stats.dots.toLocaleString('en-US')}</dd></div>
        <div><dt>GRID</dt><dd>{probe.grid.cols}×{probe.grid.rows} @{probe.grid.pitch ?? probe.theme.gridPx}px</dd></div>
        <div><dt>T</dt><dd>{probe.stats.t.toFixed(2)}s</dd></div>
        <div><dt>STEPS</dt><dd>{probe.style.quantizeSteps ?? '—'}</dd></div>
      </dl>
      <div className="xr-actions">
        <button onClick={() => onRemix(probe.preset.id, probe.data)}>OPEN IN CODE</button>
        <button onClick={() => onStudio(probe.preset.id)}>OPEN IN COMPOSE</button>
        <button onClick={() => onCopyLink(probe.preset.id)}>LINK</button>
      </div>
      <div className="xr-tabs" role="tablist" aria-label="Inspector sections">
        {(['summary', 'layers', 'data', 'describe', 'spec'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
      </div>
      <div className="xr-tabpanel" role="tabpanel">
        {tab === 'summary' && <Summary probe={probe} layers={layers} d={d} />}
        {tab === 'layers' && <ol className="xr-layers">
          {layers.map((l, i) => {
            const off = solo !== undefined ? solo !== i : !!muted?.includes(i)
            return <li key={i} className={off ? 'xr-off' : ''}>
              <span className="xr-idx">{String(i).padStart(2, '0')}</span>
              <span className="xr-lname" title={layerIR(l) ?? undefined}>{layerName(l)}<small>{layerKind(l)} · {l.toneOf ? 'multi-tone' : l.tone ?? 'auto'}{l.field.bounds ? ` · [${l.field.bounds.map(b => Math.round(b)).join(',')}]` : ''}</small></span>
              <button aria-pressed={solo === i} aria-label={`Solo layer ${i}`} onClick={() => soloLayer(probe.key, i)}>S</button>
              <button aria-pressed={!!muted?.includes(i)} aria-label={`Mute layer ${i}`} onClick={() => muteLayer(probe.key, i)}>M</button>
            </li>
          })}
        </ol>}
        {tab === 'data' && (keys.length ? <table className="xr-data"><tbody>{keys.map(k => <tr key={k}><th>{k}</th><td>{Number.isInteger(probe.data[k]) ? probe.data[k] : fmt(probe.data[k], 3)}</td></tr>)}</tbody></table> : <p className="xr-note">No data keys: this card is pure in t.</p>)}
        {tab === 'describe' && <div className="xr-describe"><p>{d.summary}</p>{d.text.length > 0 && <p className="xr-note">text: {d.text.map(s => `"${s}"`).join(' ')}</p>}</div>}
        {tab === 'spec' && <pre className="xr-spec">{spec}</pre>}
      </div>
    </aside>
  )
}
