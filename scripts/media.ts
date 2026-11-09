/**
 * Media state checks (docs/STATE-MACHINES.md B7): the shared camera stream (`src/media/stream.ts`) and a camera card's
 * capture (`src/media/camera.ts`) under a fake `getUserMedia`, so no browser or device is needed. The checks:
 *  - a stream whose device went away (unplugged, permission revoked: every track `ended`) is never handed to the next
 *    consumer, even while another one (HAND mode) still holds it;
 *  - a live capture whose track ended leaves `live` (the card stops showing a frozen frame as live), and the next
 *    start opens a fresh stream.
 *
 *   npx tsx scripts/media.ts     # also run by `pnpm verify` through `mediaChecks()`
 */
import { pathToFileURL } from 'node:url'
import type { Assert } from './lib/check'

interface FakeTrack { kind: string; readyState: 'live' | 'ended'; stop(): void }
const opened: { tracks: FakeTrack[] }[] = []
function fakeStream() {
  const track: FakeTrack = { kind: 'video', readyState: 'live', stop() { this.readyState = 'ended' } }
  const s = { tracks: [track], getTracks: () => [track], getVideoTracks: () => [track] }
  opened.push(s)
  return s
}
/** What a browser does when the camera is unplugged or its permission revoked: the track ends on its own. */
const unplug = (s: { tracks: FakeTrack[] }) => { for (const t of s.tracks) t.readyState = 'ended' }

/** Stub the browser bits the media modules read; returns the undo (verify runs every check in one process). */
function stubBrowser(): () => void {
  const g = globalThis as Record<string, unknown>, nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), hadDoc = 'document' in g
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => fakeStream() } } })
  if (!hadDoc) g.document = {
    hidden: false,
    createElement: () => ({ muted: true, playsInline: true, srcObject: null, readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 0, play: async () => {}, pause() {}, getContext: () => null }),
  }
  return () => {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete g.navigator
    if (!hadDoc) delete g.document
  }
}

export async function mediaChecks(assert: Assert) {
  const restore = stubBrowser()
  try { await checks(assert) } finally { restore() }
}
async function checks(assert: Assert) {
  const { acquireCamera, releaseCamera } = await import('../src/media/stream')
  const { createCamera } = await import('../src/media/camera')

  // ── the shared stream: a dead one is not handed out again ──
  opened.length = 0
  const held = await acquireCamera() // HAND mode holds it
  unplug(opened[0])
  const next = await acquireCamera()
  assert('media: a camera stream whose tracks ended (unplugged, permission revoked) is not handed to the next consumer; it gets a fresh one',
    next !== held && opened.length === 2 && next.getTracks().every(t => t.readyState === 'live'), `${opened.length} opened, same stream ${next === held}`)
  releaseCamera(); releaseCamera()
  assert('media: the fresh stream stops once every holder let go', !!opened[1]?.tracks.every(t => t.readyState === 'ended'))

  // ── a camera card: live → the device goes away → not live any more → a tap starts it again ──
  opened.length = 0
  const seen: string[] = []
  const cam = createCamera({ cols: 8, rows: 6 }, undefined, { onStatus: s => seen.push(s) })
  await cam.start()
  const wasLive = cam.status === 'live'
  unplug(opened[0])
  cam.grab()
  await Promise.resolve()
  assert('media: a live camera card whose track ended leaves `live` (no frozen frame shown as live)', wasLive && cam.status === 'error' && seen.at(-1) === 'error', `status ${cam.status}, heard ${seen.join(' → ')}`)
  await cam.start()
  assert('media: the next start after the device went away opens a fresh stream and goes live', cam.status === 'live' && opened.length === 2 && opened[1]?.tracks[0].readyState === 'live', `status ${cam.status}, ${opened.length} opened`)
  cam.stop()
  assert('media: stopping the card releases the fresh stream (the device light goes out)', opened[1]?.tracks[0].readyState === 'ended')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('./lib/check')).checker('media')
  await mediaChecks(assert)
  done()
}
