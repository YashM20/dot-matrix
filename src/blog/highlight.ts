/**
 * Syntax colouring for the blog's code blocks (#84). DOM-free and dependency-free: one pass of sticky regexes turns a
 * snippet into tokens, and the CSS (`.hl-*` in blog.css) maps each kind to a theme token. The joined token text is
 * always the input, so nothing is lost or reordered. Unknown languages come back as one plain token.
 */
export type Kind = 'c' | 's' | 'n' | 'k' | 'l' | 't' | 'f' | 'p' | ''
export interface Token { k: Kind; s: string }

const words = (s: string) => new Set(s.split(' '))
const TS_KW = words('as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface keyof let new of private protected public readonly return satisfies set static super switch throw try type typeof var void while yield')
const GLSL_KW = words('attribute break const continue discard do else for highp if in inout int lowp mediump out precision return struct uniform varying void while bool float vec2 vec3 vec4 mat2 mat3 mat4 ivec2 ivec3 sampler2D layout')
const SH_KW = words('if then else elif fi for in do done while case esac function export local return')
const LITERALS = words('true false null undefined this NaN Infinity')
const PRIMS = words('number string boolean any unknown never object bigint symbol')

type Lang = 'ts' | 'glsl' | 'json' | 'sh' | 'http'
const LANG: Record<string, Lang> = {
  ts: 'ts', typescript: 'ts', tsx: 'ts', js: 'ts', javascript: 'ts', jsx: 'ts', mjs: 'ts',
  glsl: 'glsl', frag: 'glsl', vert: 'glsl', json: 'json', sh: 'sh', bash: 'sh', shell: 'sh', http: 'http',
}

const COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y
const HASH_COMMENT = /#[^\n]*/y
const STRING = /'(?:\\[\s\S]|[^'\\\n])*'?|"(?:\\[\s\S]|[^"\\\n])*"?|`(?:\\[\s\S]|[^`\\])*`?/y
const REGEX = /\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuvy]*/y
const NUMBER = /(?:0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y
const WORD = /[A-Za-z_$][\w$]*/y
const SPACE = /\s+/y
const PUNCT = /[^\sA-Za-z0-9_$'"`]/y
const HEADER = /^[\w-]+(?=:)/gm

function at(re: RegExp, src: string, i: number): string | null {
  re.lastIndex = i
  const m = re.exec(src)
  return m && m[0] ? m[0] : null
}

/** A `/` starts a regex literal when the last real token can't end an expression (`=`, `(`, `return`, …). */
const regexOk = (prev: Token | undefined) => !prev || (prev.k === 'p' ? !/[)\]}]$/.test(prev.s) : prev.k === 'k')

function code(src: string, lang: Lang): Token[] {
  const out: Token[] = [], kw = lang === 'glsl' ? GLSL_KW : lang === 'sh' ? SH_KW : TS_KW
  let prev: Token | undefined
  const push = (k: Kind, s: string) => {
    const last = out[out.length - 1]
    if (last && last.k === k && (k === '' || k === 'p')) last.s += s
    else out.push({ k, s })
    if (k !== '' || s.trim()) prev = out[out.length - 1]
  }
  for (let i = 0; i < src.length;) {
    let m: string | null
    if ((m = at(SPACE, src, i))) push('', m)
    else if ((m = lang === 'sh' ? at(HASH_COMMENT, src, i) : lang !== 'json' ? at(COMMENT, src, i) : null)) push('c', m)
    else if ((m = at(STRING, src, i))) push(lang === 'json' && /^\s*:/.test(src.slice(i + m.length, i + m.length + 8)) ? 't' : 's', m)
    else if (lang === 'ts' && src[i] === '/' && regexOk(prev) && (m = at(REGEX, src, i))) push('s', m)
    else if ((m = at(NUMBER, src, i)) && !/[\w$]/.test(src[i - 1] ?? '')) push('n', m)
    else if ((m = at(WORD, src, i))) {
      const next = src.slice(i + m.length).match(/^\s*(.)/)?.[1]
      push(LITERALS.has(m) ? 'l' : kw.has(m) ? 'k' : next === '(' ? 'f' : (lang === 'ts' && PRIMS.has(m)) || (lang !== 'sh' && /^[A-Z]/.test(m)) ? 't' : '', m)
    }
    else push('p', (m = at(PUNCT, src, i) ?? src[i]))
    i += m.length
  }
  return out
}

/** HTTP: header names stand out, values stay plain. */
function http(src: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of src.matchAll(HEADER)) {
    if (m.index > last) out.push({ k: '', s: src.slice(last, m.index) })
    out.push({ k: 'k', s: m[0] })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ k: '', s: src.slice(last) })
  return out
}

export function highlight(src: string, lang: string): Token[] {
  const l = LANG[lang.toLowerCase()]
  return !l ? [{ k: '', s: src }] : l === 'http' ? http(src) : code(src, l)
}
