/**
 * Exact xor of two SDFs (#63, docs/IQ-PLAN.md IQ2): the parts of `a` and `b` that don't overlap. Unlike union,
 * subtraction and intersection (min and max), it gives a true distance everywhere, inside and out, as long as `a`
 * and `b` are exact. In each sign case it comes down to the min of two positive (exterior) distances, with the
 * sign put back after.
 */

// after Inigo Quilez, https://iquilezles.org/articles/sdfxor/ (MIT); the operator is Shadertoy user jt's
// (Jakob Thomsen), and the shorter argument for its exactness is Boris The Brave's
/** Xor: inside where exactly one of `a`, `b` is inside. max(min(a, b), −max(a, b)). */
export const opXor = (a: number, b: number) => Math.max(Math.min(a, b), -Math.max(a, b))
