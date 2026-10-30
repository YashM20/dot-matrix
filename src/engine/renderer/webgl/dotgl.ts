/**
 * WebGL2 dot renderer (P5). One context per page (so at most one per board, far under the browser's
 * ~16-context cap however many GPU cards a board mounts): a detached canvas that grows to the largest
 * card drawn, each card rendered into its top-left viewport and copied into the card's own 2D canvas
 * with one `drawImage` (GPU→GPU in Chromium/Firefox/Safari). Cards draw one after another from the
 * shared clock, so the shared drawing buffer is never needed across tasks. Context loss: every
 * GPU object is dropped, `render()` reports false (the caller draws on canvas 2D), and the next frame
 * after `webglcontextrestored` rebuilds programs and buffers lazily.
 */
import type { DotInstance, ThemeTokens } from '../../types'
import { colorFor, toneColor } from '../../sampler/gridSampler'
import { squircleExponent } from '../shapePath'
import { shapeExt, type GLJoinApi } from '../ext'
import type { GPUPass } from './passes'
import { DOTS_VS, DOT_FS, EVAL_VS, LATTICE_VS, PALETTE_SIZE, evalFS } from './shaders'

type RGBA = [number, number, number, number]
const colors = new Map<string, RGBA>()
let probe: CanvasRenderingContext2D | null | undefined
/** CSS colour → straight RGBA 0..1. Hex and rgb()/rgba() parsed directly, anything else via a 2D context. */
export function parseColor(c: string): RGBA {
  let out = colors.get(c)
  if (out) return out
  const s = c.trim().toLowerCase(), hex = /^#([0-9a-f]{3,8})$/.exec(s), fn = /^rgba?\(([^)]*)\)$/.exec(s)
  if (hex && [3, 4, 6, 8].includes(hex[1].length)) {
    const h = hex[1], short = h.length <= 4, n = short ? h.length : h.length / 2
    const at = (i: number) => (short ? parseInt(h[i] + h[i], 16) : parseInt(h.slice(i * 2, i * 2 + 2), 16)) / 255
    out = [at(0), at(1), at(2), n === 4 ? at(3) : 1]
  } else if (fn) {
    const p = fn[1].split(/[\s,/]+/).filter(Boolean).map((x, i) => (x.endsWith('%') ? (parseFloat(x) / 100) * (i < 3 ? 255 : 1) : parseFloat(x)))
    out = [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1]
  } else {
    if (probe === undefined) probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    if (probe) { probe.fillStyle = '#000'; probe.fillStyle = c }
    const norm = probe?.fillStyle
    out = typeof norm === 'string' && norm !== c && (norm.startsWith('#') || norm.startsWith('rgb')) ? parseColor(norm) : [0, 0, 0, 0]
  }
  out = out.map(x => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)) as RGBA
  colors.set(c, out)
  return out
}

/** Per-frame colour table: theme tones first (passes index them), then every distinct dot colour. */
class Palette {
  readonly list: string[] = []
  private index = new Map<string, number>()
  readonly data = new Float32Array(PALETTE_SIZE * 4)
  of(c: string): number {
    let i = this.index.get(c)
    if (i === undefined) {
      i = this.list.length
      if (i >= PALETTE_SIZE) return -1
      this.index.set(c, i); this.list.push(c); this.data.set(parseColor(c), i * 4)
    }
    return i
  }
}

interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }
interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer | null; w: number; h: number }
export interface RenderOptions {
  /** Card size in card px and backing px per card px. */
  width: number; height: number; scale: number
  dots?: DotInstance[]
  passes?: GPUPass[]
  theme: ThemeTokens
  /** Opacity multiplier for the passes (entrance/exit fades). */
  passAlpha?: number
}

const shapeN = (d: DotInstance) => (d.shape === 'square' ? 0 : d.shape === 'squircle' ? squircleExponent(d.roundness ?? 0) : 2)
const safe = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

export class DotGL {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  gl: WebGL2RenderingContext | null = null
  lost = false
  /** Called after a context loss (the shared instance uses it to schedule a replacement context). */
  onLost?: () => void
  /** EXT_color_buffer_float: IR values are computed on the GPU into an RG32F target (else on the CPU). */
  floatTargets = false
  /** Instances drawn by the last `render()` (passes + dots). */
  lastInstances = 0
  private progs = new Map<string, Prog | null>()
  private buf: WebGLBuffer | null = null
  private vao: WebGLVertexArrayObject | null = null
  private emptyVao: WebGLVertexArrayObject | null = null
  private inst = new Float32Array(0)
  private cpuValues = new Float32Array(0)
  private targets = new Map<string, Target[]>()
  private uv = new Map<string, WebGLTexture>()
  private w = 0; private h = 0

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas
    const target = canvas as HTMLCanvasElement
    target.addEventListener?.('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.drop(); this.onLost?.() })
    target.addEventListener?.('webglcontextrestored', () => { this.lost = false; this.init() })
    this.init()
  }
  private init() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null
    this.gl = gl
    if (!gl) return
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float')
  }
  private drop() { this.progs.clear(); this.targets.clear(); this.uv.clear(); this.buf = null; this.vao = null; this.emptyVao = null }
  get ok(): boolean { return !!this.gl && !this.lost && !this.gl.isContextLost() }

  private program(key: string, vs: string, fs: string): Prog | null {
    if (this.progs.has(key)) return this.progs.get(key)!
    const gl = this.gl!
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs), p = gl.createProgram()!
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p)
    let prog: Prog | null = { p, u: new Map() }
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = [gl.getShaderInfoLog(v), gl.getShaderInfoLog(f), gl.getProgramInfoLog(p)].filter(Boolean).join('\n')
      console.error(`DotGL: program "${key.slice(0, 40)}" failed\n${log}`)
      this.lastError = log
      prog = null
    }
    gl.deleteShader(v); gl.deleteShader(f)
    this.progs.set(key, prog)
    return prog
  }
  /** Last shader compile/link log (null = none failed). */
  lastError: string | null = null
  private loc(p: Prog, name: string) {
    if (!p.u.has(name)) p.u.set(name, this.gl!.getUniformLocation(p.p, name))
    return p.u.get(name)!
  }
  /** A reusable RG32F texture (+ framebuffer when float targets work) of size w×h; `slot` keeps one per pass. */
  private target(w: number, h: number, slot: number): Target {
    const gl = this.gl!, key = `${w}x${h}`, list = this.targets.get(key) ?? []
    this.targets.set(key, list)
    if (list[slot]) return list[slot]
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32F, w, h)
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
    let fbo: WebGLFramebuffer | null = null
    if (this.floatTargets) {
      fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.deleteFramebuffer(fbo); fbo = null; this.floatTargets = false }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    return (list[slot] = { tex, fbo, w, h })
  }

  /** Fill a pass's value texture: GPU evaluation for IR (when float targets work), else CPU sampling. */
  private values(pass: GPUPass, slot: number, palette: Palette, theme: ThemeTokens): Target | null {
    const gl = this.gl!, t = this.target(pass.cols, pass.rows, slot), ir = pass.tag.ir
    if (ir && t.fbo) {
      const prog = this.program(`eval\n${ir.glsl}\n${ir.data.length}`, EVAL_VS, evalFS(ir.glsl, ir.data.length))
      if (!prog) return null
      gl.useProgram(prog.p)
      const env = ir.env, ptr = env.pointer
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.uvTable(pass))
      gl.uniform1i(this.loc(prog, 'uUV'), 1)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1f(this.loc(prog, 'uT'), env.t ?? 0)
      gl.uniform3f(this.loc(prog, 'uPointer'), ptr ? ptr.x : -1, ptr ? ptr.y : -1, ptr?.down ? 1 : 0)
      if (ir.data.length) gl.uniform1fv(this.loc(prog, 'uData'), ir.data.map(k => { const x = env.data && Object.prototype.hasOwnProperty.call(env.data, k) ? env.data[k] : 0; return typeof x === 'number' ? x : 0 }))
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
      gl.viewport(0, 0, t.w, t.h)
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST)
      gl.bindVertexArray(this.emptyVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return t
    }
    // CPU: the same u/v the shader would compute, in double precision (≡ the CPU sampler at density 1)
    const n = pass.cols * pass.rows
    if (this.cpuValues.length < n * 2) this.cpuValues = new Float32Array(n * 2)
    const out = this.cpuValues, [ax, bx, ay, by] = pass.map, [dx, dy] = pass.den, f = pass.field, toneOf = pass.toneOf
    for (let i = 0, o = 0; i < pass.rows; i++) {
      const r = ay + i * by, v = dy > 0 ? r / dy : .5
      for (let j = 0; j < pass.cols; j++, o += 2) {
        const c = ax + j * bx, u = dx > 0 ? c / dx : .5, value = safe(f(u, v))
        out[o] = value
        out[o + 1] = toneOf ? (() => { const tone = toneOf(value, u, v); return tone === undefined ? -1 : palette.of(toneColor(tone, value, theme)) })() : -1
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pass.cols, pass.rows, gl.RG, gl.FLOAT, out, 0)
    return t
  }

  /** The pass's u per column (row 0) and v per row (row 1) as an R32F table, computed like the CPU sampler. */
  private uvTable(pass: GPUPass): WebGLTexture {
    const key = `${pass.cols}|${pass.rows}|${pass.map}|${pass.den}`
    let tex = this.uv.get(key)
    if (tex) return tex
    const gl = this.gl!, w = Math.max(pass.cols, pass.rows), data = new Float32Array(w * 2), [ax, bx, ay, by] = pass.map, [dx, dy] = pass.den
    for (let j = 0; j < pass.cols; j++) data[j] = dx > 0 ? (ax + j * bx) / dx : .5
    for (let i = 0; i < pass.rows; i++) data[w + i] = dy > 0 ? (ay + i * by) / dy : .5
    if (this.uv.size > 32) { for (const t of this.uv.values()) gl.deleteTexture(t); this.uv.clear() }
    tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, w, 2)
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, 2, gl.RED, gl.FLOAT, data)
    this.uv.set(key, tex)
    return tex
  }

  /** Raw IR values of a pass (unclamped), read back from the GPU: the parity instrument. Null without float targets. */
  readPass(pass: GPUPass): Float32Array | null {
    if (!this.ok || !pass.tag.ir || !this.floatTargets) return null
    this.ensure()
    const t = this.values(pass, 99, new Palette(), {} as ThemeTokens)
    if (!t?.fbo) return null
    const gl = this.gl!, px = new Float32Array(t.w * t.h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.FLOAT, px)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const out = new Float32Array(t.w * t.h)
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4]
    return out
  }

  private ensure() {
    const gl = this.gl!
    if (!this.emptyVao) this.emptyVao = gl.createVertexArray()
    if (!this.vao) {
      this.buf = gl.createBuffer()
      this.vao = gl.createVertexArray()
      gl.bindVertexArray(this.vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1)
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(1, 1)
      gl.bindVertexArray(null)
    }
  }

  /** Draw one card into the shared canvas's top-left W×H region. False = not possible (lost, no WebGL2, > 64 colours, shader failure). */
  render(o: RenderOptions): boolean {
    if (!this.ok) return false
    const gl = this.gl!, W = Math.max(1, Math.round(o.width * o.scale)), H = Math.max(1, Math.round(o.height * o.scale))
    this.ensure()
    const palette = new Palette(), theme = o.theme
    const auto: [number, number, number] = [palette.of(colorFor(0, theme)), palette.of(colorFor(.5, theme)), palette.of(colorFor(1, theme))]
    const dots = o.dots ?? [], passes = o.passes ?? [], joined: DotInstance[] = []
    // explicit dots → instance buffer (colour → palette index); joined and rect cells go to the squares GL hook
    const n = dots.length
    if (this.inst.length < n * 6) this.inst = new Float32Array(Math.max(n * 6, this.inst.length * 2))
    let m = 0
    for (const d of dots) {
      if (!(d.r > 0) || !(d.opacity > 0)) continue
      const c = palette.of(d.color)
      if (c < 0) return false
      if (d.join !== undefined || d.aspect) { joined.push(d); continue }
      const b = m * 6
      this.inst[b] = d.x; this.inst[b + 1] = d.y; this.inst[b + 2] = d.r; this.inst[b + 3] = Math.min(1, d.opacity); this.inst[b + 4] = shapeN(d); this.inst[b + 5] = c
      m++
    }
    // join frames need the lazy GL hook: until it has loaded, Canvas draws them (false)
    if (joined.length && !shapeExt.gl) { shapeExt.glLoad?.(); return false }
    // value textures first (they switch framebuffers and viewports)
    const lattice = this.program('lattice', LATTICE_VS, DOT_FS), dotProg = this.program('dots', DOTS_VS, DOT_FS)
    if (!lattice || !dotProg) return false
    const tones = passes.map(p => (p.tone && p.tone !== 'auto' ? palette.of(toneColor(p.tone, .5, theme)) : -1))
    const tex: (Target | null)[] = passes.map((p, i) => this.values(p, i, palette, theme))
    if (tex.some(t => !t) || palette.list.length > PALETTE_SIZE) return false
    if (this.canvas.width < W || this.canvas.height < H) {
      this.canvas.width = Math.max(this.canvas.width, W); this.canvas.height = Math.max(this.canvas.height, H)
    }
    this.w = W; this.h = H
    const y0 = this.canvas.height - H
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, y0, W, H)
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, W, H)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const common = (p: Prog, alpha: number) => {
      gl.useProgram(p.p)
      gl.uniform2f(this.loc(p, 'uView'), W, H)
      gl.uniform1f(this.loc(p, 'uScale'), o.scale)
      gl.uniform1f(this.loc(p, 'uAlpha'), alpha)
      gl.uniform4fv(this.loc(p, 'uPalette'), palette.data)
    }
    let instances = 0
    if (passes.length) {
      common(lattice, o.passAlpha ?? 1)
      gl.bindVertexArray(this.emptyVao)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1i(this.loc(lattice, 'uValues'), 0)
      gl.uniform3i(this.loc(lattice, 'uAuto'), auto[0], auto[1], auto[2])
      passes.forEach((p, i) => {
        const s = p.style
        gl.bindTexture(gl.TEXTURE_2D, tex[i]!.tex)
        gl.uniform2i(this.loc(lattice, 'uGrid'), p.cols, p.rows)
        gl.uniform4fv(this.loc(lattice, 'uMap'), p.map)
        gl.uniform4f(this.loc(lattice, 'uPlace'), p.origin[0], p.origin[1], p.k, p.pitch)
        gl.uniform4f(this.loc(lattice, 'uStyle'), s.sizeMin, s.sizeMax, s.quantizeSteps ?? 0, s.opacityMode === 'constant' ? 1 : 0)
        gl.uniform1f(this.loc(lattice, 'uSizeScale'), p.sizeScale)
        gl.uniform1f(this.loc(lattice, 'uN'), s.shape === 'square' ? 0 : s.shape === 'squircle' ? squircleExponent(s.cornerRoundness ?? 0) : 2)
        gl.uniform1i(this.loc(lattice, 'uTone'), tones[i])
        gl.uniform1i(this.loc(lattice, 'uBackground'), p.background ? 1 : 0)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, p.cols * p.rows)
        instances += p.cols * p.rows
      })
    }
    if (m) {
      common(dotProg, 1)
      gl.bindVertexArray(this.vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
      gl.bufferData(gl.ARRAY_BUFFER, this.inst.subarray(0, m * 6), gl.STREAM_DRAW)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m)
      instances += m
    }
    if (joined.length) {
      // the hook reads gl / program / loc off this DotGL, and gets the frame's uniforms setter and palette
      if (!shapeExt.gl!.draw(this as unknown as GLJoinApi, joined, (p, a) => common(p as Prog, a), palette)) { gl.disable(gl.SCISSOR_TEST); return false }
      instances += joined.length
    }
    gl.bindVertexArray(null)
    gl.disable(gl.SCISSOR_TEST)
    this.lastInstances = instances
    return !gl.isContextLost()
  }

  /** Copy the last rendered card into a 2D context at backing-px (0, 0). */
  blit(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.canvas, 0, 0, this.w, this.h, 0, 0, this.w, this.h)
    ctx.restore()
  }
}

let shared: DotGL | null | undefined
/** A lost context that is not restored within this long is replaced by a fresh canvas + context. */
const REPLACE_MS = 1500
function createShared(): DotGL | null {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null
  const gl = canvas ? new DotGL(canvas) : null
  if (!gl?.gl) return null
  // restore normally arrives as `webglcontextrestored`; Chromium does not always restore a detached canvas
  // (and a real GPU reset may never restore), so a context still lost after REPLACE_MS is replaced
  gl.onLost = () => setTimeout(() => { if (shared === gl && gl.lost) { const next = createShared(); if (next) shared = next } }, REPLACE_MS)
  return gl
}
/** The page's one WebGL2 dot renderer, or null when WebGL2 is unavailable (then always null). */
export function sharedDotGL(): DotGL | null {
  if (shared === undefined) shared = createShared()
  return shared
}
/** WebGL2 usable right now (available and not lost). */
export const webglReady = (): boolean => !!sharedDotGL()?.ok

/**
 * Draw a card's dots (and GPU passes) into its 2D canvas through the shared WebGL2 context. The card
 * size and backing scale are read from the context (canvas size and its current transform). Returns
 * false when the frame could not be drawn on the GPU — draw it with `renderCanvas` instead.
 */
export function renderWebGL(ctx: CanvasRenderingContext2D, dots: DotInstance[], passes: GPUPass[], theme: ThemeTokens, passAlpha = 1): boolean {
  const gl = sharedDotGL()
  if (!gl) return false
  const scale = ctx.getTransform().a || 1
  if (!gl.render({ width: ctx.canvas.width / scale, height: ctx.canvas.height / scale, scale, dots, passes, theme, passAlpha })) return false
  gl.blit(ctx)
  return true
}
