/**
 * REC: a real-time clip of the board with its sound. Each animation frame, the board's card canvases
 * are composited onto one canvas (cards at their on-screen positions, on the page and card colours);
 * that canvas's stream plus the engine's MediaStreamDestination track go into one `MediaRecorder`,
 * which muxes VP9/VP8 + Opus into a .webm. The offline WebCodecs path in `src/export/` is video-only
 * (frames rendered faster than real time), so a jam is recorded in real time here instead. Without
 * canvas capture or a video+audio mime, it falls back to audio-only .webm (`kind: 'audio'`).
 */
export interface Recording { blob: Blob; kind: 'video' | 'audio'; mime: string; seconds: number; name: string }
export interface Recorder { stop(): Promise<Recording | null>; readonly kind: 'video' | 'audio' }

const pick = (types: string[]) => types.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))

/** Composite every card canvas under `root` onto `out` (CSS px × `scale`). */
function compositor(root: HTMLElement, scale: number) {
  const out = document.createElement('canvas'), g = out.getContext('2d')!
  const page = getComputedStyle(document.body).backgroundColor || '#000'
  const draw = () => {
    const box = root.getBoundingClientRect(), W = Math.round(box.width * scale) & ~1, H = Math.round(box.height * scale) & ~1
    if (out.width !== W || out.height !== H) { out.width = W; out.height = H }
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = page; g.fillRect(0, 0, W, H)
    g.setTransform(scale, 0, 0, scale, -box.left * scale, -box.top * scale)
    for (const card of root.querySelectorAll<HTMLElement>('.dot-card')) {
      const r = card.getBoundingClientRect(), bg = getComputedStyle(card).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)') { g.fillStyle = bg; g.beginPath(); g.roundRect(r.left, r.top, r.width, r.height, 10); g.fill() }
    }
    for (const c of root.querySelectorAll<HTMLCanvasElement>('.dot-card canvas')) {
      const r = c.getBoundingClientRect()
      if (r.width && c.width) g.drawImage(c, r.left, r.top, r.width, r.height)
    }
  }
  return { out, draw }
}

/** Start recording `audio` (+ the board under `root`, when possible). */
export function startRecording(audio: MediaStream, root: HTMLElement | null, fps = 30): Recorder | null {
  if (typeof MediaRecorder === 'undefined') return null
  const av = pick(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
  const ao = pick(['audio/webm;codecs=opus', 'audio/webm'])
  let comp: ReturnType<typeof compositor> | null = null, video: MediaStream | null = null
  if (root && av) {
    try {
      const box = root.getBoundingClientRect()
      comp = compositor(root, Math.min(2, 1600 / Math.max(1, box.width)))
      comp.draw()
      video = comp.out.captureStream(fps)
    } catch { comp = null; video = null }
  }
  const kind: 'video' | 'audio' = video ? 'video' : 'audio'
  const mime = kind === 'video' ? av! : ao
  if (!mime) return null
  const stream = new MediaStream([...(video?.getVideoTracks() ?? []), ...audio.getAudioTracks()])
  const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 160_000, ...(kind === 'video' && { videoBitsPerSecond: 6_000_000 }) })
  const parts: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data) }
  let raf = 0
  const loop = () => { comp?.draw(); raf = requestAnimationFrame(loop) }
  if (comp) raf = requestAnimationFrame(loop)
  const t0 = performance.now()
  rec.start(250)
  return {
    kind,
    stop: () => new Promise(resolve => {
      cancelAnimationFrame(raf)
      if (rec.state === 'inactive') { resolve(null); return }
      rec.onstop = () => {
        video?.getTracks().forEach(t => t.stop())
        const seconds = (performance.now() - t0) / 1000, blob = new Blob(parts, { type: mime.split(';')[0] })
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        resolve(blob.size ? { blob, kind, mime, seconds, name: `dot480-jam-${stamp}${kind === 'audio' ? '-audio' : ''}.webm` } : null)
      }
      rec.stop()
    }),
  }
}

/** Save a recording through a temporary link. */
export function download(r: Recording) {
  const url = URL.createObjectURL(r.blob), a = document.createElement('a')
  a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
