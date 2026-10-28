/**
 * Field IR source → AST: a hand-written lexer and recursive-descent parser.
 *
 *   program  := block
 *   block    := ('let' NAME '=' expr ';')* expr
 *   expr     := cmp ('?' expr ':' expr)?
 *   cmp      := add (('<' | '<=' | '>' | '>=' | '==' | '!=') add)?
 *   add      := mul (('+' | '-') mul)*
 *   mul      := unary (('*' | '/' | '%') unary)*
 *   unary    := '-' unary | '+' unary | pow
 *   pow      := atom ('^' unary)?                  right-assoc, binds tighter than unary minus
 *   atom     := NUMBER | NAME | NAME '(' args ')' | 'pointer' '.' ('x'|'y'|'down') | 'data' '.' NAME
 *             | '(' block ')' | 'for' NAME 'in' INT '..' INT 'with' NAME '=' expr '{' block '}'
 *
 * `//` starts a line comment. Every error is an `IRError` with the offending line:col.
 */
import { IR_CONSTANTS, IR_FUNCTIONS, IR_LIMITS, IR_RESERVED, IRError, isFn, validName, validate, type BinOp, type FnName, type Node } from './ast'

type Tok = { type: 'num'; v: number; pos: number } | { type: 'name'; v: string; pos: number } | { type: 'op'; v: string; pos: number } | { type: 'end'; v: ''; pos: number }
const OPS = ['<=', '>=', '==', '!=', '..', '+', '-', '*', '/', '%', '^', '<', '>', '?', ':', '(', ')', ',', '.', ';', '{', '}', '=']

function where(src: string, pos: number): [number, number] {
  let line = 1, col = 1
  for (let i = 0; i < pos && i < src.length; i++) { if (src[i] === '\n') { line++; col = 1 } else col++ }
  return [line, col]
}
const err = (src: string, msg: string, pos: number): never => { const [l, c] = where(src, pos); throw new IRError(msg, pos, l, c) }

function lex(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const digit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (digit(c) || (c === '.' && digit(src[i + 1]))) {
      const start = i
      while (digit(src[i])) i++
      if (src[i] === '.' && src[i + 1] !== '.') { i++; while (digit(src[i])) i++ }
      if (src[i] === 'e' || src[i] === 'E') {
        let j = i + 1
        if (src[j] === '+' || src[j] === '-') j++
        if (!digit(src[j])) err(src, 'malformed number exponent', i)
        i = j; while (digit(src[i])) i++
      }
      const v = Number(src.slice(start, i))
      if (!Number.isFinite(v)) err(src, 'number out of range', start)
      toks.push({ type: 'num', v, pos: start }); continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++
      toks.push({ type: 'name', v: src.slice(start, i), pos: start }); continue
    }
    const op = OPS.find(o => src.startsWith(o, i))
    if (!op) err(src, `unexpected character ${JSON.stringify(c)}`, i)
    toks.push({ type: 'op', v: op!, pos: i }); i += op!.length
  }
  toks.push({ type: 'end', v: '', pos: src.length })
  return toks
}

/** Parse IR source into a validated AST. Throws `IRError` (with line:col) on any problem. */
export function parse(src: string): Node {
  if (typeof src !== 'string') throw new IRError('source must be a string')
  if (src.length > IR_LIMITS.source) throw new IRError(`source is ${src.length} characters, more than ${IR_LIMITS.source}`, IR_LIMITS.source, ...where(src, IR_LIMITS.source))
  const toks = lex(src)
  let p = 0, nodes = 0, depth = 0, work = 1
  const scope: string[] = []
  const peek = () => toks[p]
  const fail = (msg: string, tok: Tok = toks[p]): never => err(src, msg, tok.pos)
  const isOp = (v: string) => { const t = toks[p]; return t.type === 'op' && t.v === v }
  const isName = (v: string) => { const t = toks[p]; return t.type === 'name' && t.v === v }
  const describe = (t: Tok) => (t.type === 'end' ? 'end of input' : `"${t.v}"`)
  const expect = (v: string) => { if (!isOp(v)) fail(`expected "${v}" but found ${describe(peek())}`); p++ }
  const keyword = (v: string) => { if (!isName(v)) fail(`expected "${v}" but found ${describe(peek())}`); p++ }
  const node = <N extends Node>(n: N, at: Tok): N => { if (++nodes > IR_LIMITS.nodes) fail(`program has more than ${IR_LIMITS.nodes} nodes`, at); return n }
  const bindName = (): [string, Tok] => {
    const t = peek()
    if (t.type !== 'name') return fail(`expected a name but found ${describe(t)}`)
    if (IR_RESERVED.has(t.v)) fail(`"${t.v}" is reserved and cannot be bound`, t)
    if (!validName(t.v)) fail(`invalid name "${t.v}" (letters, digits, single "_"; no leading "_")`, t)
    p++; return [t.v, t]
  }
  const int = () => { const t = peek(); if (t.type !== 'num' || !Number.isInteger(t.v)) fail(`loop bounds must be integer literals, found ${describe(t)}`); p++; return t.v as number }
  const nest = <T>(f: () => T): T => { if (++depth > IR_LIMITS.depth) fail(`nesting deeper than ${IR_LIMITS.depth}`); try { return f() } finally { depth-- } }

  function block(): Node {
    const t = peek()
    if (!isName('let')) return expr()
    p++
    const [name] = bindName()
    expect('=')
    const value = expr()
    expect(';')
    scope.push(name)
    const body = nest(block)
    scope.pop()
    return node({ k: 'let', name, value, body }, t)
  }
  function expr(): Node {
    return nest(() => {
      const c = cmp()
      if (!isOp('?')) return c
      const t = peek(); p++
      const a = expr()
      expect(':')
      return node({ k: 'cond', c, a, b: expr() }, t)
    })
  }
  function cmp(): Node {
    const a = add(), t = peek()
    if (t.type === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(t.v)) {
      p++
      const b = add(), n = peek()
      if (n.type === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(n.v)) fail('comparisons do not chain; use parentheses', n)
      return node({ k: 'bin', op: t.v as BinOp, a, b }, t)
    }
    return a
  }
  function add(): Node {
    let a = mul()
    for (let t = peek(); t.type === 'op' && (t.v === '+' || t.v === '-'); t = peek()) { p++; a = node({ k: 'bin', op: t.v, a, b: mul() }, t) }
    return a
  }
  function mul(): Node {
    let a = unary()
    for (let t = peek(); t.type === 'op' && (t.v === '*' || t.v === '/' || t.v === '%'); t = peek()) { p++; a = node({ k: 'bin', op: t.v, a, b: unary() }, t) }
    return a
  }
  function unary(): Node {
    return nest(() => {
      const t = peek()
      if (isOp('-')) { p++; return node({ k: 'neg', a: unary() }, t) }
      if (isOp('+')) { p++; return unary() }
      const base = atom()
      if (!isOp('^')) return base
      const c = peek(); p++
      return node({ k: 'bin', op: '^', a: base, b: unary() }, c)
    })
  }
  function atom(): Node {
    const t = peek()
    if (t.type === 'num') { p++; return node({ k: 'num', v: t.v }, t) }
    if (isOp('(')) { p++; const e = nest(block); expect(')'); return e }
    if (t.type !== 'name') return fail(`expected a value but found ${describe(t)}`)
    p++
    const name = t.v
    if (name === 'for') return loop(t)
    if (name === 'pointer' || name === 'data') {
      expect('.')
      const f = peek()
      if (f.type !== 'name') return fail(`expected a field name after "${name}."`)
      p++
      if (name === 'data') { if (!validName(f.v)) fail(`invalid data key "${f.v}"`, f); return node({ k: 'data', key: f.v }, t) }
      if (f.v !== 'x' && f.v !== 'y' && f.v !== 'down') fail(`pointer has .x, .y and .down, not .${f.v}`, f)
      return node({ k: 'in', name: `pointer.${f.v as 'x' | 'y' | 'down'}` }, t)
    }
    if (isOp('(')) {
      if (!isFn(name)) fail(`unknown function "${name}"`, t)
      p++
      const args: Node[] = []
      if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()) } }
      expect(')')
      const want = (IR_FUNCTIONS as Record<string, number>)[name]
      if (args.length !== want) fail(`${name}() takes ${want} argument(s), got ${args.length}`, t)
      return node({ k: 'call', fn: name as FnName, args }, t)
    }
    if (name === 'u' || name === 'v' || name === 't') return node({ k: 'in', name }, t)
    if (name in IR_CONSTANTS && Object.prototype.hasOwnProperty.call(IR_CONSTANTS, name)) return node({ k: 'num', v: IR_CONSTANTS[name] }, t)
    if (scope.includes(name)) return node({ k: 'ref', name }, t)
    if (isFn(name)) return fail(`"${name}" is a function; call it as ${name}(…)`, t)
    return fail(`unknown identifier "${name}"`, t)
  }
  function loop(t: Tok): Node {
    const [i, it] = bindName()
    keyword('in')
    const from = int()
    expect('..')
    const to = int()
    if (from < 0 || to <= from) fail('loop range must be 0 ≤ from < to', it)
    if (to - from > IR_LIMITS.loop) fail(`loop runs ${to - from} times, more than ${IR_LIMITS.loop}`, it)
    keyword('with')
    const [acc, at] = bindName()
    if (acc === i) fail('loop index and accumulator need different names', at)
    expect('=')
    const init = expr()
    expect('{')
    const outer = work
    work *= to - from
    if (work > IR_LIMITS.work) fail(`nested loops run ${work} times per dot, more than ${IR_LIMITS.work}`, it)
    scope.push(i, acc)
    const body = nest(block)
    scope.length -= 2
    work = outer
    expect('}')
    return node({ k: 'for', i, from, to, acc, init, body }, t)
  }

  const ast = block()
  if (peek().type !== 'end') fail(`unexpected ${describe(peek())}`)
  validate(ast)
  return ast
}
