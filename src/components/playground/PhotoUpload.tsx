import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { dotifyUpload } from '../../lib/photoDotify'
import { widgetById, widgetPresets } from '../../widgets'
import { More } from '../More'
import { usePlayground } from './store'

export function PhotoUpload() {
  return <More id="tune-photo" label="Your photo as dots" tech="photo dither" className="more--panel"><PhotoPanel /></More>
}

function PhotoPanel() {
  const setPhoto = usePlayground(s => s.setPhoto)
  const photoName = usePlayground(s => s.photoName)
  const presetId = usePlayground(s => s.presetId)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'bayer' | 'floyd-steinberg'>('bayer')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    try {
      // Dither at the grid the preview will display, so the photo is never stretched afterwards.
      const grid = { ...(widgetById(presetId) ?? widgetPresets[0]).grid }
      const field = await dotifyUpload(file, grid, mode)
      setPhoto(field, file.name, grid)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (event: DragEvent) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]) }

  return (
    <section className="pg-panel pg-photo">
      <h2>PHOTO</h2>
      <div className="pg-photo-modes"><button className={mode === 'bayer' ? 'selected' : ''} onClick={() => setMode('bayer')}>BAYER</button><button className={mode === 'floyd-steinberg' ? 'selected' : ''} onClick={() => setMode('floyd-steinberg')}>FLOYD</button></div>
      <div className={`pg-dropzone ${photoName ? 'active' : ''}`} onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
        {busy ? 'PROCESSING…' : photoName ? `${photoName.toUpperCase()} LOADED` : 'DROP IMAGE / CLICK'}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => void handleFile(e.target.files?.[0])} />
      <p className="pg-note">100% client-side. Nothing leaves this device.</p>
      {photoName && <button onClick={() => setPhoto(undefined)}>CLEAR PHOTO</button>}
    </section>
  )
}
