/**
 * Run an async panel job: errors go to `fail`, and `settle` runs last either way (busy flags, abort handles).
 * A module function because the React Compiler can't yet compile a component with `finally`, or with a
 * conditional inside `try`, in its handlers.
 */
export async function attempt(job: () => Promise<void>, fail: (e: Error) => void, settle?: () => void): Promise<void> {
  try { await job() } catch (e) { fail(e as Error) } finally { settle?.() }
}
