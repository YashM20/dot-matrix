/**
 * A small JSON Schema 2020-12 evaluator (test-only, no dependency): the keyword subset the card spec
 * schema uses — $ref (local), type, enum, const, properties, required, additionalProperties,
 * propertyNames, maxProperties, items, prefixItems, min/maxItems, minimum, maximum, exclusiveMinimum,
 * min/maxLength, pattern, allOf, anyOf, oneOf, not, if/then/else. Any other keyword throws, so the
 * schema cannot silently use something this checker ignores.
 */
type Schema = boolean | Record<string, unknown>
const KNOWN = new Set(['$schema', '$id', '$defs', '$comment', 'title', 'description', 'default', 'examples', '$ref', 'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'propertyNames', 'maxProperties', 'items', 'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'minLength', 'maxLength', 'pattern', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else'])

const typeOf = (x: unknown) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x)
const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

export function schemaValidator(root: Record<string, unknown>) {
  const patterns = new Map<string, RegExp>()
  const re = (p: string) => { let r = patterns.get(p); if (!r) patterns.set(p, (r = new RegExp(p, 'u'))); return r }
  const resolve = (ref: string): Schema => {
    if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`)
    let node: unknown = root
    for (const part of ref.slice(2).split('/')) node = (node as Record<string, unknown>)[part]
    if (node === undefined) throw new Error(`dangling $ref ${ref}`)
    return node as Schema
  }
  /** First failing path, or null when `x` is valid. */
  const check = (s: Schema, x: unknown, path: string): string | null => {
    if (s === true) return null
    if (s === false) return `${path}: false schema`
    for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`schema keyword "${k}" not supported by the test evaluator`)
    if (typeof s.$ref === 'string') { const e = check(resolve(s.$ref), x, path); if (e) return e }
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type], t = typeOf(x)
      if (!types.some(want => want === t || (want === 'integer' && t === 'number' && Number.isInteger(x)))) return `${path}: type ${t}, want ${types.join('|')}`
    }
    if (Array.isArray(s.enum) && !s.enum.some(v => deepEqual(v, x))) return `${path}: not in enum`
    if ('const' in s && !deepEqual(s.const, x)) return `${path}: not const`
    if (typeof x === 'number') {
      if (typeof s.minimum === 'number' && x < s.minimum) return `${path}: < minimum`
      if (typeof s.maximum === 'number' && x > s.maximum) return `${path}: > maximum`
      if (typeof s.exclusiveMinimum === 'number' && x <= s.exclusiveMinimum) return `${path}: ≤ exclusiveMinimum`
    }
    if (typeof x === 'string') {
      const n = [...x].length
      if (typeof s.minLength === 'number' && n < s.minLength) return `${path}: too short`
      if (typeof s.maxLength === 'number' && n > s.maxLength) return `${path}: too long`
      if (typeof s.pattern === 'string' && !re(s.pattern).test(x)) return `${path}: pattern`
    }
    if (Array.isArray(x)) {
      if (typeof s.minItems === 'number' && x.length < s.minItems) return `${path}: minItems`
      if (typeof s.maxItems === 'number' && x.length > s.maxItems) return `${path}: maxItems`
      const prefix = Array.isArray(s.prefixItems) ? s.prefixItems as Schema[] : []
      for (let i = 0; i < x.length; i++) {
        const sub = i < prefix.length ? prefix[i] : s.items as Schema | undefined
        if (sub !== undefined) { const e = check(sub, x[i], `${path}[${i}]`); if (e) return e }
      }
    }
    if (isObj(x)) {
      const props = (isObj(s.properties) ? s.properties : {}) as Record<string, Schema>
      if (Array.isArray(s.required)) for (const k of s.required as string[]) if (!(k in x)) return `${path}.${k}: required`
      if (typeof s.maxProperties === 'number' && Object.keys(x).length > s.maxProperties) return `${path}: maxProperties`
      for (const [k, v] of Object.entries(x)) {
        if (s.propertyNames !== undefined) { const e = check(s.propertyNames as Schema, k, `${path}.${k}(name)`); if (e) return e }
        if (k in props) { const e = check(props[k], v, `${path}.${k}`); if (e) return e }
        else if (s.additionalProperties !== undefined) { const e = check(s.additionalProperties as Schema, v, `${path}.${k}`); if (e) return e }
      }
    }
    if (Array.isArray(s.allOf)) for (const sub of s.allOf as Schema[]) { const e = check(sub, x, path); if (e) return e }
    if (Array.isArray(s.anyOf) && !(s.anyOf as Schema[]).some(sub => check(sub, x, path) === null)) return `${path}: anyOf`
    if (Array.isArray(s.oneOf)) { const n = (s.oneOf as Schema[]).filter(sub => check(sub, x, path) === null).length; if (n !== 1) return `${path}: oneOf matched ${n}` }
    if (s.not !== undefined && check(s.not as Schema, x, path) === null) return `${path}: not`
    if (s.if !== undefined) {
      const branch = check(s.if as Schema, x, path) === null ? s.then : s.else
      if (branch !== undefined) { const e = check(branch as Schema, x, path); if (e) return e }
    }
    return null
  }
  return (x: unknown) => check(root, x, '$')
}
