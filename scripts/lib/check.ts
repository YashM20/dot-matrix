/**
 * One check reporter for verify and the area scripts (#75, docs/CHECKPOINTS.md "Test tiers").
 * A timing check (named with "≤ N ms" or "budget") that misses prints a warning and doesn't fail, unless
 * DOT_TIMING=strict: functionality gates every run, frame budgets come back at a later checkpoint.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
export const strictTiming = env.DOT_TIMING === 'strict'
export const isTiming = (name: string) => /≤\s*[\d.]+\s*ms|\bbudget\b/i.test(name)

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
