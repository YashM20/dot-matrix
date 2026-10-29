/**
 * WebGL2 hook (`shapeExt.gl`, Q-squares §2.4.3, §3.2), loaded on demand through `shapeExt.glLoad` (set in DotCanvas) so the GLSL ships in
 * neither the worker nor the board chunk. One instanced draw for a frame's joined and rect cells, 36 B per instance:
 * `aDot` (x, y, s, opacity), `aShape` (palette index, joint slot), `aJoin` (the 12-bit mask, exact in f32; −1 = a
 * plain rect cell), `aRect` (half height, and for a plain rect its corner radius in px, or −n for a soft superellipse).
 *
 * Watertight edges: a joined side of the quad lies exactly on the cell boundary, computed from the integer cell
 * index (`ox + i·P` and `ox + (i + 1)·P` are the same expression on the same inputs in both neighbours), so the
 * rasterizer gives each pixel to exactly one quad: no crack, no overlap at any opacity. Unjoined sides are padded by
 * s + 1 px. The fragment shader is an exact SDF per quadrant, with the joined arms running past the quad (the
 * quad edge is the cut), and straight edges need no Steiner ink correction.
 */
import type { GLJoinApi } from '../renderer/ext'
import { BEZIER_MAX_N, cornerFraction, squircleExponent } from '../renderer/shapePath'
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
layout(location = 3) in vec2 aRect;
out vec2 vP;
flat out uint vMask;
flat out vec4 vGeom;
flat out vec2 vS;
flat out vec2 vH;
out vec4 vColor;
bool hasH(uint c) { return c == 1u || c == 3u || c == 4u; }
bool hasV(uint c) { return c == 2u || c == 3u || c == 4u; }
void main() {
  int slot = clamp(int(aShape.y + 0.5), 0, 14);
  vec4 J = uJoint[slot], O = uJointO[slot];
  bool plain = aJoin < 0.0;
  uint m = plain ? 0u : uint(aJoin + 0.5);
  vec2 c = aDot.xy, P = 2.0 * J.xy, S = vec2(aDot.z, aRect.x);
  vec2 ix = floor((c - O.xy) / P);
  vec2 lo = O.xy + ix * P, hi = O.xy + (ix + 1.0) * P;
  uint q0 = m & 7u, q1 = (m >> 3u) & 7u, q2 = (m >> 6u) & 7u;
  vec2 pad = S + 1.0 / uScale;
  float left = hasH(q0) ? lo.x : c.x - pad.x, right = hasH(q1) ? hi.x : c.x + pad.x;
  float top = hasV(q0) ? lo.y : c.y - pad.y, bottom = hasV(q2) ? hi.y : c.y + pad.y;
  vec2 pos = vec2((gl_VertexID & 1) == 1 ? right : left, (gl_VertexID >> 1) == 1 ? bottom : top);
  float seam = O.z * 0.5;
  vec2 hj = plain ? S : max(S, J.xy - seam);
  vP = (pos - c) * uScale;
  vMask = m;
  // ro, ri, seam flag (device px), and n (> 0: a plain rect cell of a soft superellipse, drawn stretched)
  float ro = plain ? max(aRect.y, 0.0) : clamp(J.z, 0.0, 1.0) * min(S.x, S.y), ri = plain ? 0.0 : max(0.0, min(J.w, min(hj.x - S.x, hj.y - S.y)));
  vGeom = vec4(ro * uScale, ri * uScale, !plain && seam > 0.0 ? 1.0 : 0.0, plain && aRect.y < 0.0 ? -aRect.y : 0.0);
  vS = S * uScale;
  vH = hj * uScale;
  vec4 col = uPalette[clamp(int(aShape.x + 0.5), 0, 63)];
  float a = col.a * clamp(aDot.w, 0.0, 1.0) * uAlpha;
  vColor = vec4(col.rgb * a, a);
  vec2 dev = pos * uScale;
  gl_Position = (S.x > 0.0 && S.y > 0.0 && a > 0.0) ? vec4(dev.x / uView.x * 2.0 - 1.0, 1.0 - dev.y / uView.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`
export const JOIN_FS = `${HEAD}
in vec2 vP;
flat in uint vMask;
flat in vec4 vGeom;
flat in vec2 vS;
flat in vec2 vH;
in vec4 vColor;
out vec4 o;
float sdBox(vec2 a, vec2 b) { vec2 d = a - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 a = abs(vP), S = vS;
  float ro = vGeom.x, ri = vGeom.y, n = vGeom.w, d;
  if (n > 0.0) {
    // a soft superellipse stretched to S: |x/Sx|^n + |y/Sy|^n = 1, distance from the field over its gradient
    vec2 q = max(a / S, vec2(1e-4)), qn = pow(q, vec2(n));
    float t = qn.x + qn.y;
    vec2 grad = qn / q / S * pow(t, 1.0 / n - 1.0);
    d = (pow(t, 1.0 / n) - 1.0) / max(length(grad), 1e-6);
  } else {
    uint q = vP.y < 0.0 ? (vP.x < 0.0 ? 0u : 1u) : (vP.x < 0.0 ? 3u : 2u);
    uint code = (vMask >> (3u * q)) & 7u;
    // fused: joined arms run 2 px past the quad, so the quad edge (on the cell boundary) is the only cut
    vec2 E = vGeom.z > 0.5 ? vH : vH + 2.0;
    if (code == 1u) d = sdBox(a, vec2(E.x, S.y));
    else if (code == 2u) d = sdBox(a, vec2(S.x, E.y));
    else if (code == 3u) d = sdBox(a, E);
    else if (code == 4u) {
      vec2 v = S + ri - a;
      float notch = length(max(v, 0.0)) + min(max(v.x, v.y), 0.0) - ri;
      d = max(sdBox(a, E), -notch);
    } else d = sdBox(a, S - ro) - ro;
  }
  float cov = clamp(0.5 - d, 0.0, 1.0);
  if (cov <= 0.0) discard;
  o = vColor * cov;
}
`

interface State { vao: WebGLVertexArrayObject; buf: WebGLBuffer; data: Float32Array }
const F = 9
const states = new WeakMap<WebGL2RenderingContext, State>()
const joint = new Float32Array(15 * 4), jointO = new Float32Array(15 * 4)

/** Draw `dots` (each joined, with `joint`, or a rect cell with `aspect`) after the classic dots. False: more than 15 joints or a shader failure. */
function draw(api: GLJoinApi, dots: DotInstance[], common: (p: { p: WebGLProgram }, alpha: number) => void, palette: { of(c: string): number }): boolean {
  const { gl } = api, prog = api.program('squares-join', JOIN_VS, JOIN_FS)
  if (!prog) return false
  let st = states.get(gl)
  // a restored context keeps the object but drops its GL names
  if (!st || !gl.isVertexArray(st.vao)) {
    const vao = gl.createVertexArray()!, buf = gl.createBuffer()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 4 * F, 0); gl.vertexAttribDivisor(0, 1)
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * F, 16); gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 4 * F, 24); gl.vertexAttribDivisor(2, 1)
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 4 * F, 28); gl.vertexAttribDivisor(3, 1)
    gl.bindVertexArray(null)
    states.set(gl, (st = { vao, buf, data: new Float32Array(0) }))
  }
  if (st.data.length < dots.length * F) st.data = new Float32Array(Math.max(dots.length * F, st.data.length * 2))
  const slots = new Map<JointGeom, number>(), data = st.data
  let m = 0
  for (const d of dots) {
    const g = d.join !== undefined ? d.joint : undefined
    let slot = 0
    if (g) {
      const known = slots.get(g)
      if (known === undefined) {
        if (slots.size >= 15) return false
        slots.set(g, (slot = slots.size))
        joint.set([g.hx, g.hy, g.ro, g.ri], slot * 4); jointO.set([g.ox ?? 0, g.oy ?? 0, g.seam, 0], slot * 4)
      } else slot = known
    }
    const b = m * F, hs = d.r * (d.aspect ?? 1)
    data[b] = d.x; data[b + 1] = d.y; data[b + 2] = d.r; data[b + 3] = Math.min(1, d.opacity)
    data[b + 4] = palette.of(d.color); data[b + 5] = slot; data[b + 6] = g ? d.join! : -1; data[b + 7] = hs
    // a plain rect cell: the corner of its rounded rect (px; 0 = the box), or −n for a soft superellipse (n ≤ 8)
    const n = d.shape === 'square' ? Infinity : d.shape === 'squircle' ? squircleExponent(d.roundness ?? 0) : 2
    data[b + 8] = g ? 0 : n > BEZIER_MAX_N ? (n === Infinity ? 0 : Math.min(d.r, hs) * cornerFraction(n)) : -n
    m++
  }
  common(prog, 1)
  gl.uniform4fv(api.loc(prog, 'uJoint'), joint)
  gl.uniform4fv(api.loc(prog, 'uJointO'), jointO)
  gl.bindVertexArray(st.vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, st.buf)
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, m * F), gl.STREAM_DRAW)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m)
  return true
}
export const glJoin = { draw }
