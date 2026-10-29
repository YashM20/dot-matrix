/**
 * WebGL2 hook (`shapeExt.gl`, Q-squares §2.4.3), loaded on demand through `shapeExt.glLoad` (set in DotCanvas) so the GLSL ships in neither
 * the worker nor the board chunk. One instanced draw for a frame's joined cells, 28 B per instance:
 * `aDot` (x, y, s, opacity), `aShape` (palette index, joint slot), `aJoin` (the 12-bit mask, exact in f32).
 *
 * Watertight edges: a joined side of the quad lies exactly on the cell boundary, computed from the integer cell
 * index (`ox + i·P` and `ox + (i + 1)·P` are the same expression on the same inputs in both neighbours), so the
 * rasterizer gives each pixel to exactly one quad: no crack, no overlap at any opacity. Unjoined sides are padded by
 * s + 1 px. The fragment shader is an exact SDF per quadrant, with the joined arms running past the quad (the
 * quad edge is the cut), and straight edges need no Steiner ink correction.
 */
import type { GLJoinApi } from '../renderer/ext'
import type { DotInstance, JointGeom } from '../types'

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n'
export const JOIN_VS = `${HEAD}
uniform vec2 uView;
uniform float uScale;
uniform float uAlpha;
uniform vec4 uPalette[64];
uniform vec4 uJoint[15];
uniform vec4 uJointO[15];
layout(location = 0) in vec4 aDot;
layout(location = 1) in vec2 aShape;
layout(location = 2) in float aJoin;
out vec2 vP;
flat out uint vMask;
flat out vec4 vGeom;
flat out vec2 vH;
out vec4 vColor;
bool hasH(uint c) { return c == 1u || c == 3u || c == 4u; }
bool hasV(uint c) { return c == 2u || c == 3u || c == 4u; }
void main() {
  int slot = clamp(int(aShape.y + 0.5), 0, 14);
  vec4 J = uJoint[slot], O = uJointO[slot];
  uint m = uint(aJoin + 0.5);
  vec2 c = aDot.xy, P = 2.0 * J.xy;
  float s = aDot.z;
  vec2 ix = floor((c - O.xy) / P);
  vec2 lo = O.xy + ix * P, hi = O.xy + (ix + 1.0) * P;
  uint q0 = m & 7u, q1 = (m >> 3u) & 7u, q2 = (m >> 6u) & 7u;
  float pad = s + 1.0 / uScale;
  float left = hasH(q0) ? lo.x : c.x - pad, right = hasH(q1) ? hi.x : c.x + pad;
  float top = hasV(q0) ? lo.y : c.y - pad, bottom = hasV(q2) ? hi.y : c.y + pad;
  vec2 pos = vec2((gl_VertexID & 1) == 1 ? right : left, (gl_VertexID >> 1) == 1 ? bottom : top);
  float seam = O.z * 0.5;
  vec2 hj = max(vec2(s), J.xy - seam);
  vP = (pos - c) * uScale;
  vMask = m;
  // s, ro, ri, seam flag (device px)
  vGeom = vec4(s, clamp(J.z, 0.0, 1.0) * s, max(0.0, min(J.w, min(hj.x, hj.y) - s)), seam > 0.0 ? 1.0 : 0.0) * vec4(uScale, uScale, uScale, 1.0);
  vH = hj * uScale;
  vec4 col = uPalette[clamp(int(aShape.x + 0.5), 0, 63)];
  float a = col.a * clamp(aDot.w, 0.0, 1.0) * uAlpha;
  vColor = vec4(col.rgb * a, a);
  vec2 dev = pos * uScale;
  gl_Position = (s > 0.0 && a > 0.0) ? vec4(dev.x / uView.x * 2.0 - 1.0, 1.0 - dev.y / uView.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`
export const JOIN_FS = `${HEAD}
in vec2 vP;
flat in uint vMask;
flat in vec4 vGeom;
flat in vec2 vH;
in vec4 vColor;
out vec4 o;
float sdBox(vec2 a, vec2 b) { vec2 d = a - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 a = abs(vP);
  uint q = vP.y < 0.0 ? (vP.x < 0.0 ? 0u : 1u) : (vP.x < 0.0 ? 3u : 2u);
  uint code = (vMask >> (3u * q)) & 7u;
  float s = vGeom.x, ro = vGeom.y, ri = vGeom.z;
  // fused: joined arms run 2 px past the quad, so the quad edge (on the cell boundary) is the only cut
  vec2 E = vGeom.w > 0.5 ? vH : vH + 2.0;
  float d;
  if (code == 1u) d = sdBox(a, vec2(E.x, s));
  else if (code == 2u) d = sdBox(a, vec2(s, E.y));
  else if (code == 3u) d = sdBox(a, E);
  else if (code == 4u) {
    vec2 v = vec2(s + ri) - a;
    float notch = length(max(v, 0.0)) + min(max(v.x, v.y), 0.0) - ri;
    d = max(sdBox(a, E), -notch);
  } else d = sdBox(a, vec2(s - ro)) - ro;
  float cov = clamp(0.5 - d, 0.0, 1.0);
  if (cov <= 0.0) discard;
  o = vColor * cov;
}
`

interface State { vao: WebGLVertexArrayObject; buf: WebGLBuffer; data: Float32Array }
const states = new WeakMap<WebGL2RenderingContext, State>()
const joint = new Float32Array(15 * 4), jointO = new Float32Array(15 * 4)

/** Draw `dots` (all with `join` and `joint`) after the classic dots. False: more than 15 joints or a shader failure. */
function draw(api: GLJoinApi, dots: DotInstance[], common: (p: { p: WebGLProgram }, alpha: number) => void, palette: { of(c: string): number }): boolean {
  const { gl } = api, prog = api.program('squares-join', JOIN_VS, JOIN_FS)
  if (!prog) return false
  let st = states.get(gl)
  // a restored context keeps the object but drops its GL names
  if (!st || !gl.isVertexArray(st.vao)) {
    const vao = gl.createVertexArray()!, buf = gl.createBuffer()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(0, 1)
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 16); gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24); gl.vertexAttribDivisor(2, 1)
    gl.bindVertexArray(null)
    states.set(gl, (st = { vao, buf, data: new Float32Array(0) }))
  }
  if (st.data.length < dots.length * 7) st.data = new Float32Array(Math.max(dots.length * 7, st.data.length * 2))
  const slots = new Map<JointGeom, number>(), data = st.data
  let m = 0
  for (const d of dots) {
    const g = d.joint!
    let slot = slots.get(g)
    if (slot === undefined) {
      if (slots.size >= 15) return false
      slots.set(g, (slot = slots.size))
      joint.set([g.hx, g.hy, g.ro, g.ri], slot * 4); jointO.set([g.ox ?? 0, g.oy ?? 0, g.seam, 0], slot * 4)
    }
    const b = m * 7
    data[b] = d.x; data[b + 1] = d.y; data[b + 2] = d.r; data[b + 3] = Math.min(1, d.opacity)
    data[b + 4] = palette.of(d.color); data[b + 5] = slot; data[b + 6] = d.join!
    m++
  }
  common(prog, 1)
  gl.uniform4fv(api.loc(prog, 'uJoint'), joint)
  gl.uniform4fv(api.loc(prog, 'uJointO'), jointO)
  gl.bindVertexArray(st.vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, st.buf)
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, m * 7), gl.STREAM_DRAW)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m)
  return true
}
export const glJoin = { draw }
