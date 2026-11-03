/**
 * One check reporter for verify and the area scripts (#75, docs/CHECKPOINTS.md "Test tiers").
 * A timing check that misses prints a warning and doesn't fail, unless DOT_TIMING=strict: functionality gates
 * every run, frame budgets come back at a later checkpoint.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
export const strictTiming = env.DOT_TIMING === 'strict'
/**
 * A wall-clock check: a `≤ N ms` limit, or a `budget` measured in time (ms, × load, fastest of N runs). A step,
 * flicker or size budget is a correctness check and always fails. Keep any correctness condition out of a timing
 * check's assert (give it its own), so a miss there can't pass as a timing warning.
 */
export const isTiming = (name: string) =>
  /≤\s*[\d.]+\s*ms\b/.test(name) || (/\bbudget\b/i.test(name) && /\d\s*ms\b|×\s*(interleaved )?load|\bfastest\b/i.test(name))

export type Assert = (name: string, cond: boolean, detail?: string) => void

/** `assert` for the checks, `done()` prints the totals and exits 1 on a failure. `label` names them ("noise check(s)"). */
export function checker(label = '') {
  let failures = 0, timingMisses = 0
  const assert: Assert = (name, cond, detail = '') => {
    const d = detail ? ` — ${detail}` : ''
    if (cond) console.log(`✓ ${name}${d}`)
    else if (!strictTiming && isTiming(name)) { console.warn(`⚠ ${name} (timing, not enforced)${d}`); timingMisses++ }
    else { console.error(`✗ ${name}${d}`); failures++ }
  }
  const done = (ok = '') => {
    if (timingMisses) console.warn(`\n${timingMisses} timing budget(s) over (not enforced; DOT_TIMING=strict enforces them)`)
    if (failures) { console.error(`\n${failures} ${label ? label + ' ' : ''}check(s) failed`); (globalThis as { process?: { exit(code: number): void } }).process?.exit(1) }
    else if (ok) console.log(`\n${ok}`)
  }
  return { assert, done }
}

/**
 * Reported checks (docs/POLISH-PLAN.md §2 P0): every check has a short id (`sticky:home@1440:mid`). An id in `known`
 * is a failure we already know about: it prints as known and doesn't fail the run. A known id that passes is listed
 * at the end, so the fix that made it pass can delete it from the probe's list and turn the check into a gate. Any
 * other failure fails the run. An id checked more than once fails if any of its runs fails.
 */
export function knownChecker(known: readonly string[], label = 'probe') {
  const knownIds = new Set(known), failed = new Set<string>(), seen = new Set<string>()
  let pass = 0, knownFail = 0, newFail = 0
  const check = (id: string, ok: boolean, detail = '') => {
    const d = detail ? ` — ${detail}` : ''
    seen.add(id)
    if (ok) { pass++; console.log(`✓ ${id}${d}`); return }
    failed.add(id)
    if (knownIds.has(id)) { knownFail++; console.log(`◦ ${id} (known)${d}`) }
    else { newFail++; console.error(`✗ ${id}${d}`) }
  }
  /** Prints the counts and the known ids that pass now; exits 1 on a new failure. */
  const done = () => {
    const promote = known.filter(id => seen.has(id) && !failed.has(id)), unrun = known.filter(id => !seen.has(id))
    console.log(`\n${label}: ${pass} passed, ${knownFail} known failure(s), ${newFail} new failure(s)`)
    if (promote.length) console.log(`known ids that pass now (delete them from the list to gate them): ${promote.join(', ')}`)
    if (unrun.length) console.log(`known ids not checked in this run: ${unrun.join(', ')}`)
    if (newFail) (globalThis as { process?: { exit(code: number): void } }).process?.exit(1)
  }
  return { check, done }
}
