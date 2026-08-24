import { useRef, useState } from 'react'
import { gridField } from '../../engine/fields/heatmapField'
import { fieldToSVG } from '../../lib/exportField'
import type { DrawMatrix } from '../../lib/drawGrid'
import { dot480 } from '../../engine/theme/tokens'

interface Props {
  width: number; height: number; pitch: number; brush: number
  canUndo: boolean; canRedo: boolean
  matrix: DrawMatrix; cols: number; rows: number
  onResize: (w:number,h:number,p:number)=>void
  onBrush: (n:number)=>void
  onClear: ()=>void; onUndo: ()=>void; onRedo: ()=>void
  eraseMode: boolean; onEraseMode: (b:boolean)=>void
  onLoadMatrix: (m:DrawMatrix,p:number)=>void
}

const RED = '#FF3B30'

export function DrawToolbar({ width, height, pitch, brush, canUndo, canRedo, matrix, cols, rows, onResize, onBrush, onClear, onUndo, onRedo, eraseMode, onEraseMode, onLoadMatrix }: Props) {
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
      const blob = new Blob([svg], {type:'image/svg+xml'})
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='draw.svg'; a.click()
    } else if (kind === 'png') {
      const m = svg.match(/width="(\d+)" height="(\d+)"/); const w=m?+m[1]:cols*pitch, h=m?+m[2]:rows*pitch
      const img=new Image(); img.onload=()=>{const c=document.createElement('canvas'); c.width=w*3; c.height=h*3; c.getContext('2d')!.drawImage(img,0,0,c.width,c.height); c.toBlob(b=>{ if(b){const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='draw.png'; a.click()}})}
      img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)))
    } else {
      const html='<!doctype html><html><body style="background:#070809;display:grid;place-items:center;min-height:100vh;margin:0">'+svg+'</body></html>'
      const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='draw.html'; a.click()
    }
  }

  const saveJSON = () => {
    const blob=new Blob([JSON.stringify({cols,rows,pitch,data:matrix},null,2)],{type:'application/json'})
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='draw.json'; a.click()
  }

  const loadJSON = (f: File) => {
    const r=new FileReader(); r.onload=()=>{ try{ const j=JSON.parse(r.result as string); if(j.data&&j.cols&&j.rows) onLoadMatrix(j.data, j.pitch??pitch)}catch{}}; r.readAsText(f)
  }

  const baseBtn: React.CSSProperties = { font: '500 9px var(--mono)', padding: '7px 14px', borderRadius: 99, border: '1px solid var(--line)', background: 'none', color: 'var(--value)', cursor: 'pointer', letterSpacing: '.08em', transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 6 }
  const baseInput: React.CSSProperties = { background: 'var(--raised)', border: '1px solid var(--line)', color: 'var(--value)', borderRadius: 8, padding: '7px 10px', font: '11px var(--mono)', width: 64, textAlign: 'center' as const }
  const labelStyle: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', font: '500 9px var(--mono)', color: 'var(--mute)', letterSpacing: '.08em' }
  const sectionGap: React.CSSProperties = { width: 1, height: 28, background: 'var(--line)', margin: '0 8px' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>CANVAS</span>
          <div style={sectionGap} />
          <label style={labelStyle}>W <input type="number" min={80} max={2000} step={8} value={width} onChange={e=>onResize(+e.target.value,height,pitch)} style={baseInput} /></label>
          <label style={labelStyle}>H <input type="number" min={80} max={2000} step={8} value={height} onChange={e=>onResize(width,+e.target.value,pitch)} style={baseInput} /></label>
        </div>
        <div style={sectionGap} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>GRID</span>
          <div style={sectionGap} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ font: '500 9px var(--mono)', color: 'var(--mute)' }}>PITCH</span>
            <input type="range" min={2} max={8} step={1} value={pitch} onChange={e=>onResize(width,height,+e.target.value)} style={{ width: 100, accentColor: RED }} />
            <b style={{ color: 'var(--value)', fontSize: 11, minWidth: 28, textAlign: 'right' as const }}>{pitch}px</b>
            <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', minWidth: 60 }}>{cols}×{rows}</span>
          </label>
        </div>
        <div style={sectionGap} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>BRUSH</span>
          <div style={sectionGap} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={1} max={8} step={1} value={brush} onChange={e=>onBrush(+e.target.value)} style={{ width: 100, accentColor: RED }} />
            <b style={{ color: 'var(--value)', fontSize: 11, minWidth: 16 }}>{brush}</b>
            <button onClick={()=>onEraseMode(!eraseMode)} style={{ ...baseBtn, borderColor: eraseMode ? RED : 'var(--line)', background: eraseMode ? 'rgba(255,59,48,.12)' : 'none', color: eraseMode ? RED : 'var(--value)' }}>{eraseMode ? 'ERASER' : 'BRUSH'}</button>
          </label>
        </div>
        <div style={sectionGap} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: '500 8px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>HISTORY</span>
          <div style={sectionGap} />
          <button onClick={onUndo} disabled={!canUndo} style={{ ...baseBtn, opacity: canUndo ? 1 : .35, cursor: canUndo ? 'pointer' : 'default', color: canUndo ? 'var(--value)' : 'var(--mute)' }}><span style={{display:'inline-block',transform:'rotate(90deg)'}}>⏎</span> UNDO</button>
          <button onClick={onRedo} disabled={!canRedo} style={{ ...baseBtn, opacity: canRedo ? 1 : .35, cursor: canRedo ? 'pointer' : 'default', color: canRedo ? 'var(--value)' : 'var(--mute)' }}>REDO <span style={{display:'inline-block',transform:'rotate(-90deg)'}}>⏎</span></button>
          <button onClick={onClear} style={{ ...baseBtn, borderColor: 'rgba(255,59,48,.4)', color: 'rgba(255,59,48,.9)' }}>CLEAR</button>
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
          <input ref={jsonRef} type="file" accept="application/json" hidden onChange={e=>e.target.files?.[0]&&loadJSON(e.target.files[0])} />
        </div>
        <button onClick={()=>setExpanded(!expanded)} style={{ ...baseBtn, padding: '7px 14px' }} aria-label="shortcuts">
          <span style={{display:'inline-block',transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s'}}>⏎</span>
        </button>
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
