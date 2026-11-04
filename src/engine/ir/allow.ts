/**
 * Token allowlist for emitted JS (#158). Before `new Function` builds a program, every token of the body must be
 * one the JS emitter (`emit.ts`) writes: numbers, the inputs `u v t px py pd`, `D[n]` for data, `M.<builtin>(`,
 * the emitter's own variable names (declared before use), operators, parentheses, `let`, `for`, `return`, `;`, `{`
 * and `}`. Anything else means the emitter or the validator has a bug, and the program runs on the closure tree.
 *
 * Without strings, `.` (other than `M.<builtin>(`) or `[` (other than `D[n]`), a body can't reach a property, and a
 * `(` right after a value is refused, so the only calls it can make are the builtins in `irMath`.
 */
import { IR_FUNCTIONS } from './ast'
import { irMath } from './runtime'

const INPUTS = new Set(['u', 'v', 't', 'px', 'py', 'pd'])
const KEYWORDS = new Set(['let', 'for', 'return'])
/** Names `fresh()` in emit.ts makes: `tmp<n>`, `k<n>`, and `l<n>` or `l<n>_<IR name>`. */
const GENERATED = /^(?:tmp\d+|k\d+|l\d+(?:_[A-Za-z][A-Za-z0-9_]*)?)$/
const OPERATORS = ['===', '!==', '<=', '>=', '++', '+', '-', '*', '/', '<', '>', '=', '?', ':', '(', ')', ',', ';', '{', '}']
const NUM = /\d+(?:\.\d+)?(?:e[+-]?\d+)?/y, DATA = /D\[(\d+)\]/y, CALL = /M\.([A-Za-z]\w*)\(/y, NAME = /[A-Za-z_$][\w$]*/y
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
/** A builtin the body may call: an IR function or a runtime helper (`mod`, `pow`) that `irMath` holds. */
const callable = (fn: string) => (own(IR_FUNCTIONS, fn) || fn === 'mod' || fn === 'pow') && own(irMath, fn) && typeof (irMath as Record<string, unknown>)[fn] === 'function'

/** Does `body` (the body of `function (u, v, t, px, py, pd, D, M)`, reading `dataCount` data values) keep to the allowlist? */
export function allowedBody(body: string, dataCount: number): boolean {
  const declared = new Set<string>()
  let i = 0, value = false, declaring = false
  const at = (re: RegExp) => { re.lastIndex = i; const m = re.exec(body); if (m) i = re.lastIndex; return m }
  while (i < body.length) {
    const c = body[i]
    if (c === ' ' || c === '\n') { i++; continue }
    let m: RegExpExecArray | null
    if (declaring) {
      // `let` declares one of the emitter's names, once
      if (!(m = at(NAME)) || !GENERATED.test(m[0]) || declared.has(m[0])) return false
      declared.add(m[0]); declaring = false; value = true; continue
    }
    if ((m = at(DATA))) { if (Number(m[1]) >= dataCount) return false; value = true; continue }
    if ((m = at(CALL))) { if (value || !callable(m[1])) return false; continue }
    if ((m = at(NAME))) {
      const w = m[0]
      if (KEYWORDS.has(w)) { declaring = w === 'let'; value = false; continue }
      if (!INPUTS.has(w) && !declared.has(w)) return false
      value = true; continue
    }
    if (c >= '0' && c <= '9') { at(NUM); if (/[\w$.]/.test(body[i] ?? '')) return false; value = true; continue }
    if (c === '/' && (body[i + 1] === '/' || body[i + 1] === '*')) return false
    const op = OPERATORS.find(o => body.startsWith(o, i))
    if (!op || (op === '(' && value)) return false
    i += op.length
    value = op === ')' || op === '++'
  }
  return !declaring
}
