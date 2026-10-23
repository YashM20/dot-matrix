/*
 * Host harness for dotvm: reads jobs from a file, writes raw float32 results to another.
 * Job: u16 code length, code, f32 t px py pd, u8 ndata, ndata × f32 (slot order), u16 n.
 * Output per job: i32 dv_load status, then n×n f32 values at u = col/(n-1), v = row/(n-1).
 * Usage: dvtest jobs.bin out.bin   (driven by targets/test/esp32.ts)
 */
#include <stdio.h>
#include <string.h>
#include "../dotvm.h"

static int rd(FILE *f, void *p, size_t n) { return fread(p, 1, n, f) == n; }

int main(int argc, char **argv) {
  static uint8_t code[DV_MAX_CODE];
  FILE *in, *out;
  uint16_t len, n, at;
  if (argc < 3 || !(in = fopen(argv[1], "rb")) || !(out = fopen(argv[2], "wb"))) { fprintf(stderr, "usage: dvtest jobs.bin out.bin\n"); return 2; }
  while (rd(in, &len, 2)) {
    dv_prog p; dv_env e; uint8_t nd, i; int32_t st; uint16_t r, c;
    if (len > DV_MAX_CODE || !rd(in, code, len)) return 3;
    dv_env_init(&e);
    if (!rd(in, &e.t, 4) || !rd(in, &e.px, 4) || !rd(in, &e.py, 4) || !rd(in, &e.pd, 4) || !rd(in, &nd, 1)) return 3;
    for (i = 0; i < nd; i++) if (!rd(in, &e.data[i], 4)) return 3;
    if (!rd(in, &n, 2)) return 3;
    st = dv_load(&p, code, len, &at);
    fwrite(&st, 4, 1, out);
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      float u = n == 1 ? .5f : (float)c / (float)(n - 1), v = n == 1 ? .5f : (float)r / (float)(n - 1);
      float x = st == DV_OK ? dv_eval(&p, &e, u, v) : 0.f;
      fwrite(&x, 4, 1, out);
    }
  }
  fclose(out);
  return 0;
}
