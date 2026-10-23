/**
 * One shared webcam stream for every consumer on the page (camera cards, HAND mode): reference counted,
 * so a card stopping its mirror does not cut the hand tracker off, and the device light goes out when the
 * last consumer releases it. Frames never leave the page: they go to a `<video>`, a small canvas, and
 * typed arrays.
 *
 * Test hook: if `globalThis.__dotTestCamera` is a function returning a `MediaStream` (or a promise of one; e.g. a canvas
 * `captureStream()`), it is used instead of `getUserMedia` — headless tests feed a synthetic video.
 */
let shared: Promise<MediaStream> | null = null, refs = 0, live: MediaStream | null = null

type TestHook = { __dotTestCamera?: () => MediaStream | Promise<MediaStream> }

async function open(): Promise<MediaStream> {
  const hook = (globalThis as TestHook).__dotTestCamera
  if (typeof hook === 'function') return hook()
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera API'), { name: 'NotSupportedError' })
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
}

/** Take a reference on the shared camera stream (the permission prompt, the first time). Pair with `releaseCamera`. */
export async function acquireCamera(): Promise<MediaStream> {
  refs++
  shared ??= open().then(s => {
    live = s
    // everyone let go while the prompt was open
    if (refs === 0) { live = null; shared = null; s.getTracks().forEach(t => t.stop()) }
    return s
  }, e => { shared = null; throw e })
  try { return await shared } catch (e) { refs--; throw e }
}

/** Drop a reference; the tracks stop when nobody holds the stream any more. */
export function releaseCamera(): void {
  if (refs <= 0) return
  if (--refs === 0) {
    const s = live
    live = null; shared = null
    s?.getTracks().forEach(t => t.stop())
  }
}
