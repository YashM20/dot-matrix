/**
 * X-ray inspector: a docked panel for the X-ray card under the pointer (or the last one). Runtime
 * (renderer, fps, dots, t), the layer list with solo / mute, live data keys, `describe()` and the
 * card's spec (`presetToSpec`), plus Open in DOTS and a deep link. It opens on SUMMARY (UX U2): the same card in
 * plain words, with tap / hover definitions from the glossary.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Layer } from '../../engine'
import { describe, type CardDescription } from '../../engine/describe'
import { presetToSpec } from '../../spec'
import { GLOSSARY, GLOSSARY_TERMS, type GlossaryTerm } from '../glossary'
import { fmt, layerKind, layerName, layerIR } from './probe'
import { muteLayer, probes, setXR, soloLayer, toggleGlobal, useXR, type CardProbe } from './store'

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
    <aside className="xr-panel" aria-label={`X-ray inspector: ${probe.preset.name}`}>
      <header className="xr-panel-head">
        <div><b>{probe.preset.name.toUpperCase()}</b><small>{probe.preset.id} · {probe.preset.group}</small></div>
        <button aria-label="Close inspector" onClick={() => setXR({ active: null })}>×</button>
      </header>
      <dl className="xr-runtime">
        <div><dt>RENDERER</dt><dd>{mode}{worker ? ' + worker' : ''}</dd></div>
        <div><dt>FPS</dt><dd>{probe.animated && probe.fps ? `${probe.stats.fps} / ${probe.fps}` : 'static'}</dd></div>
        <div><dt>DOTS</dt><dd>{probe.stats.dots.toLocaleString('en-US')}</dd></div>
        <div><dt>GRID</dt><dd>{probe.grid.cols}×{probe.grid.rows} @{probe.grid.pitch ?? probe.theme.gridPx}px</dd></div>
        <div><dt>T</dt><dd>{probe.stats.t.toFixed(2)}s</dd></div>
        <div><dt>STEPS</dt><dd>{probe.style.quantizeSteps ?? '—'}</dd></div>
      </dl>
      <div className="xr-actions">
        <button onClick={() => onRemix(probe.preset.id, probe.data)}>OPEN IN DOTS</button>
        <button onClick={() => onStudio(probe.preset.id)}>OPEN IN STUDIO</button>
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
