/**
 * GLSL ES 3.0 sources for the WebGL2 dot renderer. Every dot is an instanced quad (4-vertex strip,
 * corner from `gl_VertexID`, no vertex buffer) shaded by a superellipse SDF: |x/r|^n + |y/r|^n = 1
 * with n = 2 + 30·roundness² (`squircleExponent`), n = 2 a circle, n = 0 the box. Edges are
 * anti-aliased analytically: coverage = clamp(0.5 − f/|∇f|) in device px. That ramp integrates to the
 * shape's area + π/12 px² for any round outline, so the drawn radius is √(r² − 1/12); dots under
 * ~0.76 px are drawn at 0.71 px with alpha scaled to the same ink (the canvas rasterizer's exact area
 * coverage), so tiny dots neither bloat nor flicker in and out.
 */

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n'
export const PALETTE_SIZE = 64

/** Shared vertex tail: one dot centre (card px), radius (card px), exponent, palette index, opacity. */
const EMIT = `
uniform vec2 uView;
uniform float uScale;
uniform float uAlpha;
uniform vec4 uPalette[${PALETTE_SIZE}];
out vec2 vP;
out float vR;
out float vN;
out vec4 vColor;
void emitDot(vec2 c, float r, float n, int color, float opacity) {
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  // ink: a 1 px coverage ramp around any round outline adds pi/12 px^2 (Steiner), the box SDF adds none
  float rb = r * uScale, k = n < 1.0 ? 0.0 : 0.083333, re = sqrt(max(rb * rb - k, 0.5)), pad = re + 1.0;
  vec4 col = uPalette[clamp(color, 0, ${PALETTE_SIZE - 1})];
  float a = col.a * clamp(opacity, 0.0, 1.0) * uAlpha * (rb * rb) / (re * re + k);
  vP = q * pad; vR = re; vN = n; vColor = vec4(col.rgb * a, a);
  vec2 pos = c * uScale + vP;
  gl_Position = (r > 0.0 && a > 0.0) ? vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

/** Explicit dots (any DotInstance[]): per-instance (x, y, r, opacity) + (exponent, palette index). */
export const DOTS_VS = `${HEAD}${EMIT}
layout(location = 0) in vec4 aDot;
layout(location = 1) in vec2 aShape;
void main() { emitDot(aDot.xy, aDot.z, aShape.x, int(aShape.y + 0.5), aDot.w); }
`

/**
 * Lattice dots: position from the instance index, value (r) and optional palette index (g, < 0 = by
 * value) from an RG32F texture. Mirrors `gridSampler`: clamp, quantize, size ramp, opacity, colorFor.
 */
export const LATTICE_VS = `${HEAD}${EMIT}
uniform highp sampler2D uValues;
uniform ivec2 uGrid;
uniform vec4 uMap;
uniform vec4 uPlace;
uniform vec4 uStyle;
uniform float uSizeScale;
uniform float uN;
uniform int uTone;
uniform ivec3 uAuto;
uniform int uBackground;
void main() {
  ivec2 cell = ivec2(gl_InstanceID % uGrid.x, gl_InstanceID / uGrid.x);
  vec2 tv = texelFetch(uValues, cell, 0).rg;
  float raw = tv.r;
  float value = raw > 0.0 ? min(raw, 1.0) : 0.0;
  float steps = uStyle.z;
  float q = steps >= 2.0 ? floor(value * (steps - 1.0) + 0.5) / (steps - 1.0) : value;
  vec2 lc = vec2(uMap.x + float(cell.x) * uMap.y, uMap.z + float(cell.y) * uMap.w);
  vec2 c = (uPlace.xy + (lc + 0.5) * uPlace.z) * uPlace.w;
  float r = (uStyle.x + (uStyle.y - uStyle.x) * q) * uSizeScale;
  bool skip = (value <= 0.0 || q <= 0.0) && uBackground == 0;
  int tone = uTone >= 0 ? uTone : tv.g >= 0.0 ? int(tv.g + 0.5) : value <= 0.34 ? uAuto.x : value <= 0.67 ? uAuto.y : uAuto.z;
  emitDot(c, skip ? 0.0 : r, uN, tone, uStyle.w > 0.5 ? 1.0 : q);
}
`

export const DOT_FS = `${HEAD}
in vec2 vP;
in float vR;
in float vN;
in vec4 vColor;
out vec4 o;
void main() {
  float d;
  if (vN < 1.0) d = max(abs(vP.x), abs(vP.y)) - vR;
  else if (vN <= 2.0001) d = length(vP) - vR;
  else {
    vec2 a = max(abs(vP) / vR, vec2(1e-4));
    vec2 an = pow(a, vec2(vN));
    float s = an.x + an.y;
    vec2 grad = an / a * pow(s, 1.0 / vN - 1.0);
    d = (pow(s, 1.0 / vN) - 1.0) * vR / max(length(grad), 1e-4);
  }
  float cov = clamp(0.5 - d, 0.0, 1.0);
  if (cov <= 0.0) discard;
  o = vColor * cov;
}
`

/** Full-target triangle; the IR evaluation pass shades one texel per dot. */
export const EVAL_VS = `${HEAD}
void main() { vec2 p = vec2(float((gl_VertexID & 1) * 4) - 1.0, float((gl_VertexID & 2) * 2) - 1.0); gl_Position = vec4(p, 0.0, 1.0); }
`

/**
 * IR evaluation: texel (j, i) = the raw (unclamped) field value of fine dot (j, i), written to an
 * RG32F target (g = -1: colour by value). `glsl` is `emitGLSL` output defining `field(...)`. u/v come
 * from a table the CPU fills in double precision (row 0: u per column, row 1: v per row), not from a
 * GPU division: GLSL ES allows 2.5 ulp for `/`, and D3D's a*rcp(b) gives 47/47 = 0.99999994, which
 * flips every floor()/fract() that lands on an integer.
 */
export function evalFS(glsl: string, dataCount: number): string {
  const data = Array.from({ length: dataCount }, (_, i) => `, uData[${i}]`).join('')
  return `${HEAD}
uniform highp sampler2D uUV;
uniform float uT;
uniform vec3 uPointer;
uniform float uData[${Math.max(1, dataCount)}];
out vec4 o;
${glsl}
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 uv = vec2(texelFetch(uUV, ivec2(cell.x, 0), 0).r, texelFetch(uUV, ivec2(cell.y, 1), 0).r);
  o = vec4(field(uv, uT, uPointer${data}), -1.0, 0.0, 1.0);
}
`
}
