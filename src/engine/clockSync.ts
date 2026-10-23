/**
 * Cross-tab clock sync over BroadcastChannel: every open tab agrees on one board epoch (the wall-clock
 * ms at which board time 0 was), so cards in two tabs show the same time phase. Framework-free; the
 * master clock (`clock.ts`) is untouched — this only computes an `offset()` to add to its time.
 *
 * Protocol (`dot480:clock`): a tab joins with its provisional epoch (`now − clock.time()`), posts
 * `hello`, and every tab answers with its epoch. Each tab keeps the *earliest* epoch it has heard, so
 * all tabs converge on the first tab's without electing anyone. Board time is then
 * `(now − epoch) / 1000`, and `offset() = that − clock.time()` (it also absorbs the time a hidden tab's
 * clock was paused).
 *
 * Test by hand: open `?board=surfaces` in two windows side by side; the timers (and the e-ink full
 * refresh flash, the flip-disc sweep) run in lockstep. Hide one tab for a few seconds and come back:
 * it jumps to the shared phase.
 */
export interface ChannelPort { postMessage(msg: unknown): void; onmessage: ((e: { data: unknown }) => void) | null; close(): void }
export interface ClockSyncOptions {
  /** Local board seconds (the master clock's `time()`). */
  time: () => number
  /** Wall clock in ms shared by all tabs (the host passes Date.now; the engine never reads the clock itself). */
  now: () => number
  /** Channel factory (BroadcastChannel in the browser; a fake in tests). Absent → single-tab, offset 0. */
  channel?: (name: string) => ChannelPort
  name?: string
}
export interface ClockSync {
  /** Seconds to add to the local clock's time to get the shared board time. */
  offset(): number
  /** The shared epoch (wall-clock ms of board time 0). */
  epoch(): number
  /** Called whenever the epoch moves (a peer with an earlier epoch was heard). */
  onChange(cb: () => void): () => void
  close(): void
}
interface Msg { type: 'hello' | 'epoch'; epoch: number }
const isMsg = (m: unknown): m is Msg => !!m && typeof m === 'object' && ((m as Msg).type === 'hello' || (m as Msg).type === 'epoch') && Number.isFinite((m as Msg).epoch)

export function createClockSync(opts: ClockSyncOptions): ClockSync {
  const now = opts.now
  let epoch = now() - opts.time() * 1000
  const listeners = new Set<() => void>()
  const port = opts.channel?.(opts.name ?? 'dot480:clock')
  const adopt = (e: number) => {
    if (!(e < epoch - .5)) return false
    epoch = e
    for (const l of listeners) l()
    return true
  }
  if (port) {
    port.onmessage = ev => {
      if (!isMsg(ev.data)) return
      const theirs = ev.data.epoch
      if (adopt(theirs)) port.postMessage({ type: 'epoch', epoch } satisfies Msg)
      // answer a newcomer (or a later epoch) with ours, so it converges on the earliest
      else if (ev.data.type === 'hello' || theirs > epoch + .5) port.postMessage({ type: 'epoch', epoch } satisfies Msg)
    }
    port.postMessage({ type: 'hello', epoch } satisfies Msg)
  }
  return {
    offset: () => (now() - epoch) / 1000 - opts.time(),
    epoch: () => epoch,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    close() { if (port) { port.onmessage = null; port.close() } listeners.clear() },
  }
}

/** The browser BroadcastChannel as a `ChannelPort` factory, or undefined where it doesn't exist. */
export function browserChannel(): ((name: string) => ChannelPort) | undefined {
  const BC = (globalThis as { BroadcastChannel?: new (name: string) => ChannelPort }).BroadcastChannel
  return BC ? name => new BC(name) : undefined
}
