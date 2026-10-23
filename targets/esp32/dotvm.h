/*
 * dotvm: portable C99 interpreter for Dot/480 Field IR bytecode (src/engine/ir/bytecode.ts).
 * No malloc, no globals written after dv_load, float32 math. One program = one scalar field
 * f(u, v, t, pointer, data) -> value (clamp to [0, 1] for brightness).
 *
 * Build flags that matter for bit parity with the TS VM: no -ffast-math, and -ffp-contract=off
 * (GCC contracts a*b+c into an FMA on Xtensa/RISC-V otherwise). DV_DOUBLE_MATH=1 evaluates
 * sin/cos/exp/atan2/pow in double then rounds (host parity tests); the default uses the f32 libm.
 */
#ifndef DOTVM_H
#define DOTVM_H
#include <stdint.h>

#ifndef DV_STACK
#define DV_STACK 32          /* must match BC_STACK */
#endif
#ifndef DV_LOCALS
#define DV_LOCALS 32
#endif
#ifndef DV_MAX_DATA
#define DV_MAX_DATA 16
#endif
#ifndef DV_MAX_CODE
#define DV_MAX_CODE 1024     /* bytes per program */
#endif
#ifndef DV_MAX_STEPS
#define DV_MAX_STEPS 65536L  /* must match BC_MAX_STEPS */
#endif

enum { DV_OK = 0, DV_EMAGIC = -1, DV_EVERSION = -2, DV_ELIMIT = -3, DV_EOPCODE = -4, DV_ETRUNC = -5,
       DV_ESLOT = -6, DV_EJUMP = -7, DV_ESTACK = -8, DV_EEND = -9 };

typedef struct {
  const uint8_t *code;   /* the caller keeps the buffer alive */
  uint16_t len, start;   /* start = first instruction */
  uint8_t nlocals, nstack, ndata;
} dv_prog;

typedef struct {
  float t, px, py, pd;   /* pointer absent: px = py = -1, pd = 0 */
  float data[DV_MAX_DATA];
} dv_env;

/* Verify and bind `code`. Returns DV_OK or a negative DV_E* code; *err_at = byte offset. */
int dv_load(dv_prog *p, const uint8_t *code, uint16_t len, uint16_t *err_at);
/* Slot of data key `key` (NUL-terminated), or -1. Write env.data[slot]. */
int dv_data_slot(const dv_prog *p, const char *key);
/* Default env: t = 0, pointer absent, data = 0. */
void dv_env_init(dv_env *e);
/* Raw value at (u, v); NaN if the step budget ran out. */
float dv_eval(const dv_prog *p, const dv_env *e, float u, float v);

#endif
