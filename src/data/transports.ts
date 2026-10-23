/**
 * Transports: how payloads reach a `Source`. Each one owns its retry loop and honours pause/resume
 * (the source pauses everything while the tab is hidden).
 *
 * - `poll(request, intervalMs)`: request now, then every `intervalMs`; a failure retries on
 *   exponential backoff (or the rate-limit wait if longer). Hidden → no requests; visible again →
 *   request at once if a poll came due meanwhile.
 * - `broadcast(name)`: webhook-style push. Any same-origin tab, worker or devtools can
 *   `new BroadcastChannel('dot480:<name>').postMessage(payload)`; `Source.push` is the in-page entry.
 *   (A real webhook can't reach a browser: relay it through a websocket or SSE bridge.)
 * - `websocket(url)`: one JSON payload per message; reconnects on backoff; closed while hidden.
 * - `mediaSession()`: reads this page's own `navigator.mediaSession` (browsers never expose other
 *   apps' playback), for pages that play their own media.
 */
import { backoff, HttpError, type BackoffOptions, type SourceEnv, type Transport } from './source'

export function poll<P>(request: (env: SourceEnv) => Promise<P>, intervalMs: number, opts: BackoffOptions = {}): Transport<P> {
  return {
    kind: 'poll',
    open(link) {
      const env = link.env
      let timer: unknown = null, attempt = 0, due = env.now(), paused = false, closed = false, inFlight = false
      const schedule = (ms: number) => {
        if (timer !== null) env.clearTimeout(timer)
        due = env.now() + ms
        timer = paused || closed ? null : env.setTimeout(run, ms)
      }
      const run = async () => {
        timer = null
        if (paused || closed || inFlight) return
        inFlight = true
        try {
          const payload = await request(env)
          inFlight = false
          if (closed) return
          attempt = 0
          link.emit(payload)
          schedule(intervalMs)
        } catch (err) {
          inFlight = false
          if (closed) return
          const wait = Math.max(backoff(attempt++, env.random(), opts), err instanceof HttpError ? err.retryAfterMs : 0)
          link.fail(err, wait)
          schedule(wait)
        }
      }
      schedule(0)
      return {
        close() { closed = true; if (timer !== null) env.clearTimeout(timer); timer = null },
        pause() { paused = true; if (timer !== null) env.clearTimeout(timer); timer = null },
        resume() { if (!paused) return; paused = false; schedule(Math.max(0, due - env.now())) },
      }
    },
  }
}

export function broadcast<P>(name: string, parse: (data: unknown) => P = d => d as P): Transport<P> {
  return {
    kind: 'push',
    open(link) {
      const BC = link.env.BroadcastChannel
      if (!BC) return { close() {} }
      const ch = new BC(`dot480:${name}`)
      ch.onmessage = e => { try { link.emit(parse(e.data)) } catch (err) { link.fail(err, 0) } }
      return { close: () => ch.close() }
    },
  }
}

export function websocket<P>(url: string, parse: (data: unknown) => P = d => JSON.parse(String(d)) as P, opts: BackoffOptions = { baseMs: 2_000, maxMs: 5 * 60_000 }): Transport<P> {
  return {
    kind: 'websocket',
    open(link) {
      const env = link.env, WS = env.WebSocket
      if (!WS) return { close() {} }
      let socket: InstanceType<typeof WS> | null = null, timer: unknown = null, attempt = 0, paused = false, closed = false
      const connect = () => {
        timer = null
        if (paused || closed) return
        const s = socket = new WS(url)
        s.onopen = () => { attempt = 0 }
        s.onmessage = e => { try { link.emit(parse(e.data)) } catch (err) { link.fail(err, 0) } }
        s.onerror = () => {}
        s.onclose = () => {
          if (socket !== s) return
          socket = null
          if (paused || closed) return
          const wait = backoff(attempt++, env.random(), opts)
          link.fail(new Error('socket closed'), wait)
          timer = env.setTimeout(connect, wait)
        }
      }
      const drop = () => { if (timer !== null) env.clearTimeout(timer); timer = null; const s = socket; socket = null; s?.close() }
      connect()
      return {
        close() { closed = true; drop() },
        pause() { paused = true; drop() },
        resume() { if (!paused) return; paused = false; connect() },
      }
    },
  }
}

/** This page's Media Session (metadata + playback state), polled; emits only while metadata is set. */
export interface MediaSessionPayload { title: string; artist: string; album: string; playing: boolean }
export function mediaSession(intervalMs = 2_000): Transport<MediaSessionPayload> {
  return {
    kind: 'media',
    open(link) {
      const env = link.env, ms = (globalThis as { navigator?: { mediaSession?: MediaSession } }).navigator?.mediaSession
      if (!ms) return { close() {} }
      let timer: unknown = null, last = ''
      const tick = () => {
        const m = ms.metadata
        if (m) {
          const p = { title: m.title, artist: m.artist, album: m.album, playing: ms.playbackState === 'playing' }, key = JSON.stringify(p)
          if (key !== last) { last = key; link.emit(p) }
        }
        timer = env.setTimeout(tick, intervalMs)
      }
      const stop = () => { if (timer !== null) env.clearTimeout(timer); timer = null }
      tick()
      return { close: stop, pause: stop, resume: () => { if (timer === null) tick() } }
    },
  }
}
