/** Vercel `source` patterns as RegExps, shared by the header checks (scripts/site/headers.ts) and the likes checks. */
/**
 * A Vercel `source` (path-to-regexp syntax) as a RegExp: `(…)` groups are raw regex, `:name` is one segment,
 * `:name*` / `:name+` / `:name?` take their leading `/` with them. Case-insensitive, optional trailing slash.
 */
export function sourceRegex(source: string): RegExp {
  let re = '', i = 0
  const group = () => {
    let depth = 0, s = ''
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '\\') { s += c + source[++i]; continue }
      if (c === '(') depth++
      if (c === ')') depth--
      s += c
      if (depth === 0) { i++; return s }
    }
    throw new Error(`unbalanced group in ${source}`)
  }
  while (i < source.length) {
    const c = source[i]
    if (c === '(') { re += group(); continue }
    if (c === ':') {
      const name = /^:\w+/.exec(source.slice(i))![0]; i += name.length
      const pat = source[i] === '(' ? group() : '([^\\/]+?)'
      const mod = /[*+?]/.test(source[i] ?? '') ? source[i++] : ''
      if (mod && re.endsWith('\\/')) { re = re.slice(0, -2) + `(?:\\/${pat})${mod}`; continue }
      re += pat + mod
      continue
    }
    re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    i++
  }
  return new RegExp(`^${re}\\/?$`, 'i')
}
