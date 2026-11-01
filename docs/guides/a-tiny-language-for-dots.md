# A tiny language for dots

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric wave rings radiate from the center from a single formula -->

For the foundation of fields, samplers and dot rendering, see [build-your-own-dot-engine.md](build-your-own-dot-engine.md).

A formula playground lets someone change a line and see what it does. When that code runs in an open browser tab, running user input safely is essential.

This guide explains how to design a domain-specific expression language for dot fields called Field IR. Following one concrete ripple formula, you will see how mathematical expressions turn into tokens and abstract syntax trees, how safe validation avoids arbitrary JavaScript execution, how code compiles to bytecode and GPU shaders, and how shared formulas pack into short URLs.

## Why a custom language beats evaluation

<!-- VISUAL: kind=card · what=ir-plasma · notice=interference contours calculated per dot from three added sine terms -->

Allowing users to type arbitrary JavaScript into an input field creates security and stability risks. If an application passes untrusted strings to `eval()` or `new Function()`, malicious users can inject script payloads or access browser storage APIs.

Modern web applications deploy a strict Content Security Policy header:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';
```

A strict policy bans `unsafe-eval`. Any call to `eval()` or `new Function()` throws an immediate security exception.

General-purpose JavaScript also permits unbounded loops and memory allocation. A visitor can accidentally type `while (true) {}` or construct large arrays, freezing the browser tab.

Dot/480 solves this by implementing Field IR (`dot` v0), a domain-specific expression language defined in `src/engine/ir/`. The language enforces strict boundaries:
- **No external state access.** Code cannot reference `window`, `document`, `fetch` or global objects.
- **Pure expressions.** The language computes numbers. It has no object allocation, no prototypes and no string manipulation.
- **Strict execution limits.** As defined in `src/engine/ir/ast.ts`, the validator rejects any program exceeding `IR_LIMITS`: 4,096 source characters, 2,000 AST nodes, expression nesting depth of 96, loop bounds of 64 iterations, and a total loop work product of 1,024 evaluations per dot. Because there is no `eval`, no arbitrary JavaScript runs.

## The compilation and execution pipeline

<!-- VISUAL: kind=steps · what=ir-pipeline · notice=source text transforms through tokens and AST into closures and stack bytecode -->

The Field IR system translates user formulas into executable code through three phases:

1. **Parsing.** The tokenizer and recursive-descent parser in `src/engine/ir/parse.ts` transform text into an Abstract Syntax Tree (AST). The grammar supports floating-point literals, variable declarations (`let x = ...;`), binary arithmetic operators (`+`, `-`, `*`, `/`, `%`, `^`), relational operators, and built-in functions (`sin`, `cos`, `atan`, `length`, `smoothstep`).
2. **Validation.** Before compilation, `validate()` in `src/engine/ir/ast.ts` checks identifier scope, node counts and literal bounds. If a formula exceeds `IR_LIMITS`, the validator rejects it with an informative error.
3. **Target compilation.** Once validated, the AST compiles to three independent backends:
   - **CPU closure tree (`src/engine/ir/compile.ts`).** Functions compile into a tree of pure JavaScript closures. For example, an addition node `a + b` compiles to `(env) => fnA(env) + fnB(env)`. The root closure accepts an environment containing coordinate inputs `u`, `v`, time `t`, pointer coordinates and custom uniform data.
   - **GPU fragment shader (`src/engine/ir/emit.ts`).** For high-density full-screen canvases, `emitGLSL()` translates the AST into a GLSL ES 3.0 fragment shader function. Functions like `sin`, `cos`, `fract` and `mix` map to hardware shader instructions, running across thousands of dots concurrently.
   - **Stack bytecode (`src/engine/ir/bytecode.ts`).** For embedded hardware like an ESP32 microcontroller, `compileBytecode()` outputs a buffer of 32-bit floating-point stack instructions (`BC_OP`). A compact C virtual machine at `targets/esp32/dotvm.c` executes these instructions directly on microcontrollers without needing a JavaScript runtime. The bytecode uses reverse Polish notation where operands push onto a fixed-size evaluation stack. Operations like addition or cosine pop values, compute results, and push back outputs. This architecture eliminates dynamic memory allocation during animation ticks.

The compiler also includes a static analyzer that estimates computational cost. If an expression performs excessive division operations or deep nesting, the compiler flags heavy performance demands before code runs on battery-powered hardware.

## Programs in URLs and remix lineage

<!-- VISUAL: kind=diagram · what=remix-lineage-graph · notice=parent hashes link forks into a tree of shared programs -->

Playgrounds thrive when users can share their work with a single link. Copying an entire program into a raw URL query parameter makes links brittle and long.

In `src/lib/share.ts`, Dot/480 packs code into compact, URL-safe links. The serialization pipeline operates as follows:

```
Program Object { src, grid, lattice, tone, parent? }
  -> JSON serialization
  -> Raw Deflate compression (via CompressionStream)
  -> Base64URL string encoding
  -> Prefixed with 'z' (or 'b' if uncompressed is smaller)
```

The browser's native `CompressionStream('deflate-raw')` compresses typical formula source code by 50% to 70%. If the uncompressed Base64URL string is shorter than the compressed version, the compressor prefixes the output with `b` instead of `z`. The total encoded string length is capped at 8,192 characters (`SHARE_MAX_ENCODED`) to comply with browser URL limits.

When another user loads a shared link, the application computes an FNV-1a 32-bit hash of the code:

```typescript
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
```

This 8-character hexadecimal hash becomes the program's unique identifier. When a visitor edits an existing program and clicks share, the new link records `parent: <previous-hash>`.

The editor records every opened and created link in browser `localStorage` under `dot480.dots.gallery`. By tracking `parent` references, the editor links remixes together into a local lineage tree.

## Direction: code-golf culture and visual math

<!-- VISUAL: kind=card · what=ir-dial · notice=a rotary dial driven by one value with tick marks spaced around the circle -->

The design of Field IR is inspired by creative coding platforms like tixy.land (created by Tobias Schneider) and Dwitter (created by Frank Force).

Both projects showed that strict limits encourage creativity. In tixy.land, a 16×16 grid of dots is controlled by a single function `(t, i, x, y) => number`. In Dwitter, a canvas is animated using a 140-character JavaScript snippet `(t) => { ... }`.

Field IR brings this culture to dot matrices. When creators are restricted to a single scalar return value across a 144×144 grid, math becomes visual:
- **Trigonometry creates motion.** Adding two phase-shifted sine waves `sin(x * 5 + t) + sin(y * 5 - t)` creates dynamic wave interference.
- **Modular arithmetic creates structure.** Dividing an angle by $2\pi$ and taking `fract()` produces rotating compass needles and radar sweeps.
- **Distance fields create geometry.** The Euclidean norm `length(u - 0.5, v - 0.5)` generates concentric rings, circular lenses and drop shadows.

A formula like `smoothstep(0.4, 0.45, length(x, y))` immediately renders a glowing circular boundary on a matrix of physical dots. Changing a multiplier from 4 to 8 doubles the visible frequency instantly.

In community settings, character limits turn programming into an interactive puzzle. Coders compete to produce optical illusions, fluid vortices and clock displays within 140 or 256 characters. Each shared URL contains the entire creative artifact, allowing peers to fork, inspect and refine formulas directly in their browsers.

## Recreating the tiny language

<!-- VISUAL: kind=steps · what=ir-evaluator-flow · notice=source text turns into tokens then AST then dot numbers -->

The following three self-contained TypeScript snippets provide a complete tokenizer, parser, evaluator and URL compressor.

### 1. Minimal tokenizer, parser and evaluator

Save this file as `TinyIR.ts`. It parses expressions like `0.5 + 0.5 * sin(length(x, y) * 16 - t * 4)` into an executable closure tree. It uses precedence climbing with left associativity, rejects unknown characters, checks number syntax, and validates matching parentheses.

```typescript
export type Env = { x: number; y: number; u: number; v: number; t: number }
export type EvalFn = (env: Env) => number

type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof'
interface Token { type: TokenType; value: string }

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9]/.test(c) || (c === '.' && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
      let num = ''
      let dots = 0
      while (i < src.length && /[0-9.]/.test(src[i])) {
        if (src[i] === '.') dots++
        num += src[i++]
      }
      if (dots > 1 || num.endsWith('.')) throw new Error(`Malformed number: ${num}`)
      tokens.push({ type: 'num', value: num })
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let ident = ''
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) ident += src[i++]
      tokens.push({ type: 'ident', value: ident })
      continue
    }
    if ('+-*/%^'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue }
    if (c === '(') { tokens.push({ type: 'lparen', value: c }); i++; continue }
    if (c === ')') { tokens.push({ type: 'rparen', value: c }); i++; continue }
    if (c === ',') { tokens.push({ type: 'comma', value: c }); i++; continue }
    throw new Error(`Unknown character: ${c}`)
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

export function parse(src: string): EvalFn {
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function parsePrimary(): EvalFn {
    const tok = next()
    if (tok.type === 'num') {
      const v = parseFloat(tok.value)
      return () => v
    }
    if (tok.type === 'ident') {
      const name = tok.value
      if (peek().type === 'lparen') {
        next() // consume '('
        const args: EvalFn[] = []
        if (peek().type !== 'rparen') {
          args.push(parseExpr())
          while (peek().type === 'comma') { next(); args.push(parseExpr()) }
        }
        if (peek().type !== 'rparen') throw new Error('Expected closing parenthesis')
        next() // consume ')'
        if (name === 'sin') return env => Math.sin(args[0](env))
        if (name === 'cos') return env => Math.cos(args[0](env))
        if (name === 'length') return env => Math.hypot(args[0](env), args[1](env))
        if (name === 'floor') return env => Math.floor(args[0](env))
        if (name === 'fract') return env => { const val = args[0](env); return val - Math.floor(val) }
        if (name === 'min') return env => Math.min(args[0](env), args[1](env))
        if (name === 'max') return env => Math.max(args[0](env), args[1](env))
        if (name === 'abs') return env => Math.abs(args[0](env))
        if (name === 'sqrt') return env => Math.sqrt(args[0](env))
        throw new Error(`Unknown function: ${name}`)
      }
      if (name === 'x' || name === 'u') return env => env.x
      if (name === 'y' || name === 'v') return env => env.y
      if (name === 't') return env => env.t
      if (name === 'PI') return () => Math.PI
      if (name === 'TAU') return () => Math.PI * 2
      throw new Error(`Unknown identifier: ${name}`)
    }
    if (tok.type === 'lparen') {
      const expr = parseExpr()
      if (peek().type !== 'rparen') throw new Error('Expected closing parenthesis')
      next() // consume ')'
      return expr
    }
    throw new Error(`Unexpected token: ${tok.type}`)
  }

  function parseBinary(lhs: EvalFn, minPrec: number): EvalFn {
    const precMap: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }
    while (peek().type === 'op' && (precMap[peek().value] || 0) >= minPrec) {
      const op = next().value
      const prec = precMap[op]
      const nextMinPrec = op === '^' ? prec : prec + 1
      let rhs = parsePrimary()
      while (peek().type === 'op' && (precMap[peek().value] || 0) >= nextMinPrec) {
        rhs = parseBinary(rhs, precMap[peek().value])
      }
      const prevLhs = lhs
      if (op === '+') lhs = env => prevLhs(env) + rhs(env)
      else if (op === '-') lhs = env => prevLhs(env) - rhs(env)
      else if (op === '*') lhs = env => prevLhs(env) * rhs(env)
      else if (op === '/') lhs = env => prevLhs(env) / (rhs(env) || 1e-9)
      else if (op === '%') lhs = env => prevLhs(env) % (rhs(env) || 1e-9)
      else if (op === '^') lhs = env => Math.pow(prevLhs(env), rhs(env))
    }
    return lhs
  }

  function parseExpr(): EvalFn {
    return parseBinary(parsePrimary(), 0)
  }

  const result = parseExpr()
  if (peek().type !== 'eof') throw new Error('Unexpected input after expression')
  return result
}
```

### 2. URL compressor and decompressor

Save this as `URLCodec.ts`. It encodes program state into short links, implementing both compressed (`z`) and uncompressed (`b`) modes. It requires native `CompressionStream` and `DecompressionStream` support, available in modern browsers and Node 18+.

```typescript
export interface ShareState {
  code: string
  gridSize: number
  parentHash?: string
}

export async function packToURL(state: ShareState): Promise<string> {
  const json = JSON.stringify(state)
  const bytes = new TextEncoder().encode(json)

  const toB64url = (b: Uint8Array) => {
    let bin = ''
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const plainB64 = toB64url(bytes)

  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const compressedBuffer = await new Response(stream).arrayBuffer()
    const compressedBytes = new Uint8Array(compressedBuffer)
    const compressedB64 = toB64url(compressedBytes)
    if (compressedB64.length < plainB64.length) {
      return `z${compressedB64}`
    }
  }

  return `b${plainB64}`
}

export async function unpackFromURL(token: string): Promise<ShareState> {
  if (!token || token.length < 2) throw new Error('Token is too short')
  const mode = token[0]
  if (mode !== 'z' && mode !== 'b') throw new Error(`Unknown prefix: ${mode}`)
  const payload = token.slice(1)
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  if (mode === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const text = await new Response(stream).text()
    return JSON.parse(text)
  }
  const text = new TextDecoder().decode(bytes)
  return JSON.parse(text)
}
```

### 3. Five formula recipes

Here are five standard recipes from `src/components/dwitter/examples.ts`, with their mathematical principles:

#### Recipe 1: Ripple
```typescript
// ripple: circular wavefronts radiating from centre
let d = length(x, y);
0.5 + 0.5 * sin(d * 32 - t * 4)
```
The Euclidean distance `d = sqrt(x^2 + y^2)` measures radial distance from the origin. Multiplying `d` by 32 increases wave spatial frequency. Subtracting `t * 4` pushes wavefronts outward over time. Scaling and biasing the sine wave maps the output from `[-1, 1]` to `[0, 1]`.

#### Recipe 2: Plasma
```typescript
// plasma: interfering sinusoidal waveforms
0.5 + 0.5 * sin(sin(x * 6 + t) + sin(y * 6 - t) + sin((x + y) * 4 + t * 0.5))
```
Superposition combines three harmonic sine components along horizontal, vertical and diagonal axes. Because trigonometric additions produce non-linear interference boundaries, the resulting surface generates organic flowing contours.

#### Recipe 3: Rings
```typescript
// rings: discrete concentric bands
let r = length(x, y) * 8;
fract(r) * (1 - fract(r)) * 4
```
Scaling radial distance by 8 creates eight concentric units. The `fract()` function extracts the fractional part of the distance, repeating a ramp from 0 to 1 across each ring. The parabola `f * (1 - f) * 4` peaks at 0.5, rounding each band into a bright torus.

#### Recipe 4: Spatial noise and dust
```typescript
// noise: deterministic pseudo-random hash
let seed = floor((x + 1) * 32) + floor((y + 1) * 32) * 57;
fract(sin(seed + floor(t * 8)) * 43758.5453)
```
Cell coordinates are quantized into integer grid buckets. Multiplying coordinates by a large prime factor generates unique seed values. Taking the sine of that seed and multiplying by a large irrational scalar (`43758.5453`) scrambles the mantissa bits, producing uniform pseudo-random noise.

#### Recipe 5: Circular vignette mask
```typescript
// mask: smooth edge falloff vignette
let d = length(x, y);
let pattern = sin(x * 20) * cos(y * 20);
pattern * max(0, min(1, (0.5 - d) / 0.1))
```
The mask calculates distance `d` from the centre. When `d` is less than 0.4, the falloff factor equals 1.0. Between 0.4 and 0.5, the value decreases linearly to 0.0. Multiplying this boundary by any inner pattern clips the graphic within a circular boundary.

### Try this

In Recipe 1, change `d * 32` to `d * 64` to double the wave crest count. Then replace `- t * 4` with `+ t * 4` to reverse the wave motion so crests collapse inward toward the centre.

### Next experiment

Extend `TinyIR.ts` with a `clamp(x, min, max)` built-in function, or evaluate `parse('0.5 + 0.5 * sin(length(x, y) * 16 - t * 4)')` across a 32×32 grid of dots in a canvas loop.
