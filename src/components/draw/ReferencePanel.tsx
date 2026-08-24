import { useRef, useState } from 'react'
import { dotifyUpload } from '../../lib/photoDotify'

// ReferencePanel — overlay vs side-by-side trace helper
// Preview: grid centered on #000, 320 maxHeight, opacity only in overlay
// Toggle: segmented pills (red border active) replaces checkbox+range
// Empty: NO IMAGE — LOAD TO TRACE guidance, muted 9px mono

interface Props {
  refUrl: string | null
  overlay: boolean
  refOpacity: number
  cols: number
  rows: number
  onRefFile: (f: File) => void
  onOpacity: (n: number) => void
  onOverlay: (b: boolean) => void
  onAutoTrace: (m: number[][]) => void
}

const RED = '#FF3B30'

export function ReferencePanel({ refUrl, overlay, refOpacity, cols, rows, onRefFile, onOpacity, onOverlay, onAutoTrace }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const doAutoTrace = async () => {
    let file: File | null = inputRef.current?.files?.[0] ?? null
    if (!file && refUrl) {
      try { const res = await fetch(refUrl); const blob = await res.blob(); file = new File([blob], 'ref.png', { type: blob.type }) } catch { return }
    }
    if (!file) return
    setBusy(true)
    try {
      const field = await dotifyUpload(file, { cols, rows }, 'bayer')
      const mat: number[][] = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const u = cols === 1 ? 0.5 : c / (cols - 1)
          const v = rows === 1 ? 0.5 : r / (rows - 1)
          return Math.max(0, Math.min(1, field(u, v)))
        }),
      )
      onAutoTrace(mat)
    } finally { setBusy(false) }
  }

  const pillBtn: React.CSSProperties = { font: '500 9px var(--mono)', padding: '6px 12px', borderRadius: 99, border: '1px solid var(--line)', background: 'none', color: 'var(--value)', cursor: 'pointer', letterSpacing: '.08em', transition: 'all .12s' }
  const segActive: React.CSSProperties = { ...pillBtn, borderColor: RED, background: 'rgba(255,59,48,.12)', color: RED }
  const segIdle: React.CSSProperties = { ...pillBtn, borderColor: 'var(--line)', background: 'none', color: 'var(--mute)' }
  const badge: React.CSSProperties = { font: '500 8px var(--mono)', letterSpacing: '.12em', color: 'var(--mute)', border: '1px solid var(--line)', borderRadius: 99, padding: '3px 8px' }
  const badgeActive: React.CSSProperties = { ...badge, color: RED, borderColor: RED, background: 'rgba(255,59,48,.10)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, minHeight: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, font: '500 10px var(--mono)', letterSpacing: '.16em', color: 'var(--label)' }}>
          REFERENCE
        </h2>
        <button
          onClick={() => inputRef.current?.click()}
          style={{ font: '500 9px var(--mono)', padding: '6px 12px', borderRadius: 99, border: '1px solid var(--line)', background: 'none', color: 'var(--value)', cursor: 'pointer', letterSpacing: '.08em' }}
        >
          LOAD IMAGE
        </button>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && onRefFile(e.target.files[0])} />
      </div>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#000', borderRadius: 12, minHeight: 200, overflow: 'hidden', border: '1px solid var(--line)' }}>
        {refUrl ? (
          <img
            src={refUrl}
            alt="reference"
            style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', opacity: overlay ? refOpacity / 100 : 1 }}
          />
        ) : (
          <span style={{ font: '500 9px var(--mono)', color: 'var(--mute)', letterSpacing: '.12em', textAlign: 'center' as const }}>
            NO IMAGE — LOAD TO TRACE
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onOverlay(false)} style={overlay ? segIdle : segActive}>Side-by-side</button>
        <button onClick={() => onOverlay(true)} style={overlay ? segActive : segIdle}>Overlay</button>
      </div>

      {overlay && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', font: '500 9px var(--mono)', color: 'var(--mute)', letterSpacing: '.08em' }}>
          <span style={{ minWidth: 54 }}>OPACITY</span>
          <input type="range" min={5} max={80} value={refOpacity} onChange={e => onOpacity(+e.target.value)} style={{ flex: 1, accentColor: RED }} />
          <b style={{ color: 'var(--value)', minWidth: 32, textAlign: 'right' as const }}>{refOpacity}%</b>
        </label>
      )}

      <button
        onClick={doAutoTrace}
        disabled={!refUrl || busy}
        style={{
          width: '100%',
          font: '500 9px var(--mono)',
          padding: '9px 0',
          borderRadius: 99,
          border: '1px solid var(--line)',
          background: busy ? 'var(--raised)' : 'none',
          color: refUrl ? 'var(--value)' : 'var(--mute)',
          cursor: refUrl ? 'pointer' : 'default',
          letterSpacing: '.12em',
          opacity: !refUrl || busy ? 0.6 : 1,
        }}
      >
        {busy ? 'TRACING...' : 'AUTO-TRACE'}
      </button>

      <p style={{ margin: 0, font: '9px var(--mono)', color: 'var(--mute)', lineHeight: 1.5 }}>
        Side-by-side vs overlay at {refOpacity}%. Auto-trace uses halftone at current grid.
      </p>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <span style={overlay ? badgeActive : badge}>{overlay ? 'OVERLAY' : 'SIDE-BY-SIDE'}</span>
        <span style={badge}>{cols}×{rows}</span>
      </div>
    </div>
  )
}
