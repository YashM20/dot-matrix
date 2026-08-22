import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { dotifyUpload } from '../../lib/photoDotify'
import { widgetById } from '../../widgets'
import { usePlayground } from './store'

export function PhotoUpload() {
  const setPhoto = usePlayground(s => s.setPhoto)
  const photoName = usePlayground(s => s.photoName)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'bayer' | 'floyd-steinberg'>('bayer')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setBusy(true)
    try {
      const grid = (widgetById('portrait-art') ?? widgetById('clock')!).grid
      const field = await dotifyUpload(file, { ...grid }, mode)
      setPhoto(field, file.name)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    void handleFile(event.dataTransfer.files[0])
  }

  return (
    <section className="pg-panel pg-photo">
      <h2>PHOTO</h2>
      <div className="pg-photo-modes"><button className={mode === 'bayer' ? 'selected' : ''} onClick={() => setMode('bayer')}>BAYER</button><button className={mode === 'floyd-steinberg' ? 'selected' : ''} onClick={() => setMode('floyd-steinberg')}>FLOYD</button></div>
      <div
        className={`pg-dropzone ${photoName ? 'active' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'PROCESSING…' : photoName ? `${photoName.toUpperCase()} LOADED` : 'DROP IMAGE / CLICK'}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && void handleFile(e.target.files[0])} />
      <p className="pg-note">100% client-side. Nothing leaves this device.</p>
      {photoName && <button onClick={() => setPhoto(undefined)}>CLEAR PHOTO</button>}
    </section>
  )
}
