/* dotvm.c: see dotvm.h. Opcodes and semantics mirror src/engine/ir/bytecode.ts exactly. */
#include "dotvm.h"
#include <math.h>
#include <string.h>

enum {
  END = 0x00, PUSHF, PUSHI, U, V, T, PX, PY, PD, DATA, LOAD, STORE, NEG,
  ADD = 0x10, SUB, MUL, DIV, MOD, POW, POWI, LT, LE, GT, GE, EQ, NE,
  FSIN = 0x20, FCOS, FABS, FFLOOR, FFRACT, FSQRT, FEXP, FSIGN, FMIN, FMAX, FSTEP, FATAN, FLENGTH, FHASH,
  FCLAMP, FMIX, FSMOOTH, FSDCIRCLE, FSDBOX, FSDRING,
  JZ = 0x38, JMP, FOR, NEXT
};

#if DV_DOUBLE_MATH
#define M1(f, x) ((float)f((double)(x)))
#define DSIN(x) M1(sin, x)
#define DCOS(x) M1(cos, x)
#define DEXP(x) M1(exp, x)
#define DATAN2(y, x) ((float)atan2((double)(y), (double)(x)))
#define DPOW(x, y) ((float)pow((double)(x), (double)(y)))
#else
#define DSIN sinf
#define DCOS cosf
#define DEXP expf
#define DATAN2 atan2f
#define DPOW powf
#endif

/* operand bytes per opcode, -1 = invalid */
static int8_t operands(uint8_t op) {
  if (op <= NEG) return op == PUSHF ? 4 : (op == PUSHI || op == DATA || op == LOAD || op == STORE) ? 1 : 0;
  if (op >= ADD && op <= NE) return op == POWI ? 1 : 0;
  if (op >= FSIN && op <= FSDRING) return 0;
  if (op == JZ || op == JMP) return 2;
  if (op == FOR) return 3;
  if (op == NEXT) return 5;
  return -1;
}
static const uint8_t ARITY[20] = { 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4 };
static void effect(uint8_t op, int *pop, int *push) {
  *pop = 0; *push = 1;
  if (op >= FSIN && op <= FSDRING) *pop = ARITY[op - FSIN];
  else if (op >= ADD && op <= NE) *pop = op == POWI ? 1 : 2;
  else if (op == NEG) *pop = 1;
  else if (op == STORE || op == JZ || op == END) { *pop = 1; *push = 0; }
  else if (op == JMP || op == FOR || op == NEXT) *push = 0;
}
#define W16(b, i) ((uint16_t)((b)[i] | ((b)[(i) + 1] << 8)))

int dv_load(dv_prog *p, const uint8_t *b, uint16_t len, uint16_t *err_at) {
  static uint8_t starts[DV_MAX_CODE / 8];
  struct { uint16_t at; int8_t depth; } pend[DV_STACK], loops[DV_STACK];
  int npend = 0, nloops = 0, depth = 0, live = 1, ended = 0, i;
  uint16_t q;
#define FAIL(code, at) do { if (err_at) *err_at = (uint16_t)(at); return code; } while (0)
  if (len < 7 || b[0] != 0x64 || b[1] != 0x76) FAIL(DV_EMAGIC, 0);
  if (b[2] != 1) FAIL(DV_EVERSION, 2);
  if (len > DV_MAX_CODE || b[3] > DV_LOCALS || b[4] > DV_STACK || b[5] > DV_MAX_DATA) FAIL(DV_ELIMIT, 3);
  q = 6;
  for (i = 0; i < b[5]; i++) { q = (uint16_t)(q + 1 + b[q]); if (q >= len) FAIL(DV_ETRUNC, q); }
  p->code = b; p->len = len; p->start = q; p->nlocals = b[3]; p->nstack = b[4]; p->ndata = b[5];
  memset(starts, 0, sizeof starts);
  while (q < len) {
    uint8_t op = b[q], a; int n = operands(op), pop, push, k; uint16_t next;
    if (n < 0) FAIL(DV_EOPCODE, q);
    if (q + 1 + n > len) FAIL(DV_ETRUNC, q);
    for (k = 0; k < npend; k++) if (pend[k].at == q) {
      if (live && pend[k].depth != depth) FAIL(DV_ESTACK, q);
      depth = pend[k].depth; live = 1; pend[k] = pend[--npend]; k--;
    }
    if (!live) FAIL(DV_EJUMP, q);
    starts[q >> 3] |= (uint8_t)(1 << (q & 7));
    effect(op, &pop, &push);
    if (depth < pop) FAIL(DV_ESTACK, q);
    depth += push - pop;
    if (depth > p->nstack) FAIL(DV_ESTACK, q);
    a = b[q + 1]; next = (uint16_t)(q + 1 + n);
    if ((op == LOAD || op == STORE || op == FOR || op == NEXT) && a >= p->nlocals) FAIL(DV_ESLOT, q);
    if (op == DATA && a >= p->ndata) FAIL(DV_ESLOT, q);
    if (op == FOR) { if (nloops == DV_STACK) FAIL(DV_ELIMIT, q); loops[nloops].at = next; loops[nloops++].depth = (int8_t)depth; }
    if (op == JZ || op == JMP) {
      uint32_t to = (uint32_t)next + W16(b, q + 1);
      if (to >= len) FAIL(DV_EJUMP, q);
      for (k = 0; k < npend; k++) if (pend[k].at == to) { if (pend[k].depth != depth) FAIL(DV_ESTACK, q); break; }
      if (k == npend) { if (npend == DV_STACK) FAIL(DV_ELIMIT, q); pend[npend].at = (uint16_t)to; pend[npend++].depth = (int8_t)depth; }
      if (op == JMP) live = 0;
    }
    if (op == NEXT) {
      int to = (int)next - W16(b, q + 4);
      if (to < 4 || to > q || !(starts[to >> 3] & (1 << (to & 7))) || b[to - 4] != FOR || b[to - 3] != a) FAIL(DV_EJUMP, q);
      /* loops nest: NEXT closes the innermost open FOR */
      if (!nloops || loops[nloops - 1].at != to || loops[nloops - 1].depth != depth) FAIL(DV_ESTACK, q);
      nloops--;
    }
    if (op == END) { if (depth != 0) FAIL(DV_EEND, q); ended = 1; live = 0; }
    q = next;
  }
  if (!ended || npend) FAIL(DV_EEND, len);
  return DV_OK;
#undef FAIL
}

int dv_data_slot(const dv_prog *p, const char *key) {
  uint16_t q = 6; int i; size_t n = strlen(key);
  for (i = 0; i < p->ndata; i++) {
    if (p->code[q] == n && memcmp(p->code + q + 1, key, n) == 0) return i;
    q = (uint16_t)(q + 1 + p->code[q]);
  }
  return -1;
}

void dv_env_init(dv_env *e) { memset(e, 0, sizeof *e); e->px = e->py = -1.f; }

/* ── builtins, float32 with the same rounding points as the TS VM ── */
static float mn(float x, float y) { return y < x ? y : x; }
static float mx(float x, float y) { return x < y ? y : x; }
static float len2(float x, float y) { float a = x * x, b = y * y, s = a + b; return sqrtf(s); }
static uint32_t fmix(uint32_t h) { h ^= h >> 16; h *= 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; return h ^ (h >> 16); }
/* JS: u32(Math.floor(x * 256 + .5) | 0), 0 for NaN/inf */
static uint32_t fixed(float x) {
  double y, m;
  if (!(x == x) || x - x != 0.f) return 0;
  y = floor((double)x * 256.0 + 0.5);
  m = fmod(y, 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return (uint32_t)m;
}
static float hash2(float a, float b) {
  uint32_t h = fmix(fixed(a) + 0x9e3779b9u);
  h = fmix((h ^ fixed(b)) + 0x7f4a7c15u);
  h = fmix(h + 0x165667b1u);
  return (float)(h >> 8) * (1.f / 16777216.f);
}

float dv_eval(const dv_prog *p, const dv_env *e, float u, float v) {
  float s[DV_STACK], loc[DV_LOCALS], x, y, z, w, r;
  const uint8_t *b = p->code;
  uint16_t q = p->start;
  int sp = 0, k;
  long steps = 0;
  for (;;) {
    uint8_t op;
    if (++steps > DV_MAX_STEPS) return NAN;
    op = b[q++];
    switch (op) {
      case END: return s[sp - 1];
      case PUSHF: { uint32_t bits = (uint32_t)b[q] | (uint32_t)b[q + 1] << 8 | (uint32_t)b[q + 2] << 16 | (uint32_t)b[q + 3] << 24; memcpy(&x, &bits, 4); s[sp++] = x; q += 4; break; }
      case PUSHI: s[sp++] = (float)(int8_t)b[q++]; break;
      case U: s[sp++] = u; break;
      case V: s[sp++] = v; break;
      case T: s[sp++] = e->t; break;
      case PX: s[sp++] = e->px; break;
      case PY: s[sp++] = e->py; break;
      case PD: s[sp++] = e->pd; break;
      case DATA: s[sp++] = e->data[b[q++]]; break;
      case LOAD: s[sp++] = loc[b[q++]]; break;
      case STORE: loc[b[q++]] = s[--sp]; break;
      case NEG: s[sp - 1] = -s[sp - 1]; break;
      case POWI: k = b[q++]; x = s[sp - 1]; r = k ? x : 1.f; while (--k > 0) r = r * x; s[sp - 1] = r; break;
      case JZ: { uint16_t off = W16(b, q); q += 2; if (s[--sp] == 0.f) q = (uint16_t)(q + off); break; }
      case JMP: q = (uint16_t)(q + 2 + W16(b, q)); break;
      case FOR: loc[b[q]] = (float)W16(b, q + 1); q += 3; break;
      case NEXT: { uint8_t i = b[q]; uint16_t to = W16(b, q + 1), back = W16(b, q + 3); q += 5; loc[i] = loc[i] + 1.f; if (loc[i] < (float)to) q = (uint16_t)(q - back); break; }
      /* 1-argument builtins */
      case FSIN: s[sp - 1] = DSIN(s[sp - 1]); break;
      case FCOS: s[sp - 1] = DCOS(s[sp - 1]); break;
      case FABS: s[sp - 1] = fabsf(s[sp - 1]); break;
      case FFLOOR: s[sp - 1] = floorf(s[sp - 1]); break;
      case FFRACT: x = s[sp - 1]; s[sp - 1] = x - floorf(x); break;
      case FSQRT: s[sp - 1] = sqrtf(s[sp - 1]); break;
      case FEXP: s[sp - 1] = DEXP(s[sp - 1]); break;
      case FSIGN: x = s[sp - 1]; s[sp - 1] = x > 0.f ? 1.f : x < 0.f ? -1.f : 0.f; break;
      default:
        if (op >= FSIN && op <= FSDRING) {
          k = ARITY[op - FSIN]; sp -= k;
          x = s[sp]; y = s[sp + 1]; z = k > 2 ? s[sp + 2] : 0.f; w = k > 3 ? s[sp + 3] : 0.f;
          switch (op) {
            case FMIN: r = mn(x, y); break;
            case FMAX: r = mx(x, y); break;
            case FSTEP: r = y < x ? 0.f : 1.f; break;
            case FATAN: r = DATAN2(x, y); break;
            case FLENGTH: r = len2(x, y); break;
            case FHASH: r = hash2(x, y); break;
            case FCLAMP: r = mn(mx(x, y), z); break;
            case FMIX: { float c = 1.f - z, a = x * c, d = y * z; r = a + d; break; }
            case FSMOOTH: { float a = z - x, d = y - x, t = mn(mx(a / d, 0.f), 1.f), t2 = t * t, h = 2.f * t; h = 3.f - h; r = t2 * h; break; }
            case FSDCIRCLE: r = len2(x, y) - z; break;
            case FSDBOX: { float dx = fabsf(x) - z, dy = fabsf(y) - w, l = len2(mx(dx, 0.f), mx(dy, 0.f)); r = l + mn(mx(dx, dy), 0.f); break; }
            default: { float d = len2(x, y) - z; r = fabsf(d) - w; break; } /* FSDRING */
          }
          s[sp++] = r;
          break;
        }
        y = s[--sp]; x = s[sp - 1];
        switch (op) {
          case ADD: r = x + y; break;
          case SUB: r = x - y; break;
          case MUL: r = x * y; break;
          case DIV: r = x / y; break;
          case MOD: { float d = x / y, f = floorf(d), m = y * f; r = x - m; break; }
          case POW: r = DPOW(fabsf(x), y); break;
          case LT: r = x < y; break;
          case LE: r = x <= y; break;
          case GT: r = x > y; break;
          case GE: r = x >= y; break;
          case EQ: r = x == y; break;
          default: r = x != y; break; /* NE */
        }
        s[sp - 1] = r;
    }
  }
}
