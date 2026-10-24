/** Run only the C3 NCA checks (the same section scripts/verify.ts runs).  npx tsx scripts/nca/run-checks.ts */
import { ncaChecks } from './checks'

let failures = 0
ncaChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) })
if (failures) process.exit(1)
