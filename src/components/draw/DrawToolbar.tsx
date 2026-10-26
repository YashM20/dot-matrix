import { useRef, useState } from 'react'
import { gridField } from '../../engine/fields/heatmapField'
import { fieldToSVG } from '../../lib/exportField'
import { DRAW_LIMITS, type DrawMatrix } from '../../lib/drawGrid'
import { dot480 } from '../../engine/theme/tokens'
import { More } from '../More'

interface Props {
  width: number; height: number; pitch: number; brush: number
  canUndo: boolean; canRedo: boolean
  matrix: DrawMatrix; cols: number; rows: number
  onResize: (w:number,h:number)=>void
  onPitch: (p:number)=>void
  onBrush: (n:number)=>void
  onClear: ()=>void; onUndo: ()=>void; onRedo: ()=>void
  eraseMode: boolean; onEraseMode: (b:boolean)=>void
  onLoadMatrix: (data:unknown,p:number)=>boolean
}

const RED = '#FF3B30'

/** Download a blob and release its object URL once the click has been dispatched. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Numeric input that edits a local draft and only commits on blur / Enter (Escape reverts),
 * so typing "640" never applies the intermediate 6 and 64.
 */
function DraftNumberInput({ value, onCommit, min, max, step, style, label }: { value: number; onCommit: (n: number) => void; min: number; max: number; step: number; style: React.CSSProperties; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const reverting = useRef(false)
  const commit = () => {
    if (reverting.current) { reverting.current = false; return }
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(Math.min(max, Math.max(min, Math.round(n))))
  }
  return (
    <input
      type="number" min={min} max={max} step={step} aria-label={label}
      value={draft ?? String(value)}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        else if (e.key === 'Escape') { e.preventDefault(); setDraft(null); reverting.current = true; e.currentTarget.blur(); reverting.current = false }
      }}
      style={style}
    />
  )
}

export function DrawToolbar({ width, height, pitch, brush, canUndo, canRedo, matrix, cols, rows, onResize, onPitch, onBrush, onClear, onUndo, onRedo, eraseMode, onEraseMode, onLoadMatrix }: Props) {
  const jsonRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)

  const toSVG = () => {
    const style = { shape: 'squircle' as const, sizeMin: 0.3, sizeMax: 1.6, cornerRoundness: 0.72, quantizeSteps: 0 }
    const grid = { cols, rows, pitch }
    const field = gridField(matrix)
    return fieldToSVG(field, grid, style, dot480)
  }

  const doExport = (kind: 'png'|'svg'|'html') => {
    const svg = toSVG()
    if (kind === 'svg') {
      download(new Blob([svg], {type:'image/svg+xml'}), 'draw.svg')
    } else if (kind === 'png') {
      const m = svg.match(/width="(\d+)" height="(\d+)"/); const w=m?+m[1]:cols*pitch, h=m?+m[2]:rows*pitch
      const img=new Image(); img.onload=()=>{const c=document.createElement('canvas'); c.width=w*3; c.height=h*3; c.getContext('2d')!.drawImage(img,0,0,c.width,c.height); c.toBlob(b=>{ if(b) download(b, 'draw.png') })}
      img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)))
    } else {
      const html='<!doctype html><html><body style="background:#070809;display:grid;place-items:center;min-height:100vh;margin:0">'+svg+'</body></html>'
      download(new Blob([html],{type:'text/html'}), 'draw.html')
    }
  }

  const saveJSON = () => {
    download(new Blob([JSON.stringify({cols,rows,pitch,data:matrix},null,2)],{type:'application/json'}), 'draw.json')
  }

  const loadJSON = (f: File) => {
    const r=new FileReader(); r.onload=()=>{ try{ const j=JSON.parse(r.result as string); if(j&&j.data) onLoadMatrix(j.data, typeof j.pitch === 'number' ? j.pitch : pitch)}catch{ /* ignore malformed JSON */ }}; r.readAsText(f)
  }

  const baseBtn: React.CSSProperties = { font: '500 9px var(--mono)', padding: '7px 14px', borderRadius: 99, border: '1px solid var(--line)', background: 'none', color: 'var(--value)', cursor: 'pointer', letterSpacing: '.08em', transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 6 }
  const baseInput: React.CSSProperties = { background: 'var(--raised)', border: '1px solid var(--line)', color: 'var(--value)', borderRadius: 8, padding: '7px 10px', font: '11px var(--mono)', width: 64, textAlign: 'center' as const }
  const labelStyle: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', font: '500 9px var(--mono)', color: 'var(--mute)', letterSpacing: '.08em' }
  const sectionGap: React.CSSProperties = { width: 1, height: 28, background: 'var(--line)', margin: '0 8px' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>BRUSH</span>
          <div style={sectionGap} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={1} max={8} step={1} value={brush} onChange={e=>onBrush(+e.target.value)} style={{ width: 100, accentColor: RED }} />
            <b style={{ color: 'var(--value)', fontSize: 11, minWidth: 16 }}>{brush}</b>
            <button onClick={()=>onEraseMode(!eraseMode)} style={{ ...baseBtn, borderColor: eraseMode ? RED : 'var(--line)', background: eraseMode ? 'rgba(255,59,48,.12)' : 'none', color: eraseMode ? RED : 'var(--value)' }}>{eraseMode ? 'ERASER' : 'BRUSH'}</button>
          </label>
        </div>
        <div style={{ flex: 1, minWidth: 200 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>EXPORT</span>
          <div style={sectionGap} />
          <button onClick={()=>doExport('png')} style={baseBtn}>PNG</button>
          <button onClick={()=>doExport('svg')} style={baseBtn}>SVG</button>
          <button onClick={()=>doExport('html')} style={baseBtn}>HTML</button>
          <button onClick={saveJSON} style={baseBtn}>SAVE JSON</button>
          <button onClick={()=>jsonRef.current?.click()} style={baseBtn}>LOAD JSON</button>
          <input ref={jsonRef} type="file" accept="application/json" hidden onChange={e=>{ const f=e.target.files?.[0]; if(f) loadJSON(f); e.target.value='' }} />
        </div>
        <button onClick={()=>setExpanded(!expanded)} style={{ ...baseBtn, padding: '7px 14px' }} aria-label="shortcuts">
          <span style={{display:'inline-block',transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s'}}>⏎</span>
        </button>
      </div>
      {/* UX U4: size, pitch and history fold under "More" (keys B / E / [ ] / Ctrl+Z keep working) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'start', padding: '0 14px 10px' }}>
        <More id="draw-size" label="Canvas size & dot spacing" tech="pitch">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>CANVAS</span>
              <div style={sectionGap} />
              <label style={labelStyle} title="Canvas width in px — Enter or blur to apply, Esc to revert">W <DraftNumberInput label="canvas width" value={width} min={DRAW_LIMITS.minPx} max={DRAW_LIMITS.maxPx} step={8} onCommit={w=>onResize(w,height)} style={baseInput} /></label>
              <label style={labelStyle} title="Canvas height in px — Enter or blur to apply, Esc to revert">H <DraftNumberInput label="canvas height" value={height} min={DRAW_LIMITS.minPx} max={DRAW_LIMITS.maxPx} step={8} onCommit={h=>onResize(width,h)} style={baseInput} /></label>
            </div>
            <div style={sectionGap} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>GRID</span>
              <div style={sectionGap} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: '500 9px var(--mono)', color: 'var(--mute)' }}>PITCH</span>
                <input type="range" min={DRAW_LIMITS.minPitch} max={DRAW_LIMITS.maxPitch} step={1} value={pitch} onChange={e=>onPitch(+e.target.value)} style={{ width: 100, accentColor: RED }} />
                <b style={{ color: 'var(--value)', fontSize: 11, minWidth: 28, textAlign: 'right' as const }}>{pitch}px</b>
                <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', minWidth: 60 }}>{cols}×{rows}</span>
              </label>
            </div>
          </div>
        </More>
        <More id="draw-history" label="History" tech="undo, redo, clear">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>HISTORY</span>
            <div style={sectionGap} />
            <button onClick={onUndo} disabled={!canUndo} style={{ ...baseBtn, opacity: canUndo ? 1 : .35, cursor: canUndo ? 'pointer' : 'default', color: canUndo ? 'var(--value)' : 'var(--mute)' }}><span style={{display:'inline-block',transform:'rotate(90deg)'}}>⏎</span> UNDO</button>
            <button onClick={onRedo} disabled={!canRedo} style={{ ...baseBtn, opacity: canRedo ? 1 : .35, cursor: canRedo ? 'pointer' : 'default', color: canRedo ? 'var(--value)' : 'var(--mute)' }}>REDO <span style={{display:'inline-block',transform:'rotate(-90deg)'}}>⏎</span></button>
            <button onClick={onClear} style={{ ...baseBtn, borderColor: 'rgba(255,59,48,.4)', color: 'rgba(255,59,48,.9)' }}>CLEAR</button>
          </div>
        </More>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'var(--raised)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, font:'500 9px var(--mono)', color:'var(--mute)' }}><kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>B</kbd> BRUSH <kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>E</kbd> ERASER</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, font:'500 9px var(--mono)', color:'var(--mute)' }}><kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>Ctrl</kbd>+<kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>Z</kbd> UNDO</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, font:'500 9px var(--mono)', color:'var(--mute)' }}><kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>[</kbd>/<kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>]</kbd> BRUSH SIZE</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, font:'500 9px var(--mono)', color:'var(--mute)' }}><kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>Ctrl</kbd>+<kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>Shift</kbd>+<kbd style={{ font:'600 9px var(--mono)', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px', color:'var(--value)' }}>Z</kbd> REDO</div>
        </div>
      )}
    </div>
  )
}
