# Dot/480 device targets (P5-E)

These Node scripts and firmware sources push Dot/480 cards and Field IR programs to real displays. They use only Node built-ins (`dgram`, `net`, `http`, `zlib`) and add no npm dependencies. Nothing under `src/engine/` depends on this folder.

Every frame still goes through **Field → Grid Sampler → dots**. There are two kinds of output:
- a card rasterised on black and box-filtered to the device resolution (`lib/frame.ts`, `cardFrame`), or
- a Field IR program evaluated per device pixel by the bytecode VM (`irFrame`). The ESP32 runs the same VM.

Shared flags: `--card <preset id>` or `--ir <ripple|plasma|dial|sparkle|IR source>`, plus `--data '{"value":0.6}'`.

## Status: what was tested and how

| Target | Tested against | Real hardware |
|---|---|---|
| IR bytecode (`src/engine/ir/bytecode.ts`) | 20 IR test fields × 3 envs, 48×48: matches the float32 reference bit for bit | n/a |
| ESP32 C VM (`esp32/dotvm.c`) | compiled on the host with MSVC x64 (`targets/test/esp32.ts`): matches the TS VM 100% bit for bit | **not tested** (no board) |
| ESP32 sketch (`esp32/sketch/main.cpp`) | HTTP/serial protocol, against a fake HTTP endpoint | **not compiled, not tested** |
| WLED DDP | fake UDP receiver | **not tested** |
| AWTRIX NG / AWTRIX 3 | fake HTTP endpoint + fake MQTT broker | **not tested** |
| TRMNL BYOS + plugin | fake device polling the server | **not tested** |
| Tronbyt / Tidbyt WebP | fake push endpoint; WebP decoded by ffmpeg (still) and Pillow (animated), both bit-exact | **not tested** |
| Glyph Toy | frame export checks only; Kotlin template not compiled | **not tested** |

Run all checks: `npx tsx targets/test/targets.ts` and `npx tsx targets/test/esp32.ts`. `pnpm verify` runs them too. Inside verify, the C check uses a compiler on PATH, or an MSVC environment that was already cached. The check never sends to a real device or service.

## ESP32 + WS2812 matrix: IR bytecode running offline
`esp32/dotvm.{c,h}` is a C99 interpreter with no malloc, f32 math, a static verifier and a step budget per dot. `sketch/main.cpp` drives a WS2812 matrix through FastLED. It receives programs over HTTP or serial, keeps the last program in NVS, and renders at `DOT_FPS`. Brightness is the value × the single accent colour (`{colors.dotActive}`).

1. Install PlatformIO. Set `DOT_W`, `DOT_H`, `DOT_PIN`, `DOT_SERPENTINE`, `WIFI_SSID` and `WIFI_PASS` in `esp32/platformio.ini`. Keep `-ffp-contract=off`: without it, results stop matching the TS VM bit for bit.
2. Flash with `pio run -d targets/esp32 -t upload`. In the Arduino IDE instead, copy `dotvm.c`, `dotvm.h` and `sketch/main.cpp` into one sketch folder and fix the include path.
3. Send a program:
   - over Wi-Fi: `npx tsx targets/esp32/send.ts --host <ip> --ir plasma`
   - over serial: `npx tsx targets/esp32/send.ts --serial COM5 --ir ripple --data '{"value":.6}'`. Set the port to 115200 first.
4. Power: `DOT_BRIGHTNESS` defaults to 48 of 255. A 16×16 panel at full white draws about 15 A.

Format: the magic `dv`, a version, the locals / stack / data-key table, then the code. Jumps go forward only, and `NEXT` is the only backward edge. The 20 test programs are 30–99 B (median 60 B).

## WLED: DDP realtime
`npx tsx targets/wled/ddp.ts --host <wled ip> --w 32 --h 8 --card home-clock --fps 30`

The sender uses UDP 4048 and packets of up to 480 RGB pixels, with the push flag on the last packet of each frame. In WLED, set the 2D matrix layout under *Config → 2D*. Add `--serpentine` only if WLED is not doing the mapping itself. WLED leaves realtime mode about 2.5 s after the last packet.

## AWTRIX NG (default) / AWTRIX 3 (`--api 3`)
`npx tsx targets/awtrix/awtrix.ts --host <clock ip> --card home-clock --fps 4`, or over MQTT: `--mqtt <broker> --prefix <clock prefix> [--user --pass]`.

- **NG:** `PUT /api/v1/apps/pushed/<app>`, or MQTT `<prefix>/cmd/apps/pushed/<app>`. The body is `{"draw":[["bitmap",0,0,32,8,"<base64 RGB888>"]],"lifetimeMs":30000,"durationMs":10000}`, about 1.1 kB, under the 8192 B limit.
- **AWTRIX 3:** `POST /api/custom?name=<app>`, or MQTT `<prefix>/custom/<app>`, with a `db` draw command.

**Licence:** AWTRIX 3 is discontinued and archived. Its successor **AWTRIX NG is under the PolyForm Noncommercial License 1.0.0**: free for non-commercial use, and commercial use needs a separate agreement with the author (Blueforcer). Keep this target personal or non-commercial unless you have that agreement.

## TRMNL: 800×480 1-bit e-paper
`npx tsx targets/trmnl/server.ts --card home-clock --public http://<this-ip>:2300 --token <secret> [--refresh 900]`

- **BYOS:** in the device's Wi-Fi portal, set the custom server URL to `--public`. The device calls `/api/setup` and then `/api/display` with the `ID` / `Access-Token` headers. It gets a 1-bit BMP of 48 062 B (the OG limit is 90 kB). `filename` changes only when the image changes.
- **Private Plugin (hosted TRMNL):** choose the Polling strategy with URL `<public>/plugin.json`. Paste `trmnl/plugin/full.liquid` (or `half_horizontal.liquid`) as the markup. The server must be reachable from TRMNL's servers.
- Rendering: the card is inverted (dark dots on white paper) and blue-noise dithered with the engine's 64² void-and-cluster mask.

## Tronbyt / Tidbyt: 64×32 WebP
`npx tsx targets/tronbyt/tronbyt.ts --card home-clock --out clock.webp` or `--base http://<tronbyt server> --device <id> --key <api key>`

- The animated, lossless WebP comes from a hand-written VP8L encoder (`lib/image.ts`). It uses no transforms or LZ77, so files are about 3 bytes per pixel per frame. That is fine for 64×32.
- The push uses the Tidbyt-style API (`POST /v0/devices/<id>/push`), which Tronbyt server also serves.
- **Tidbyt was acquihired by Modal, and no new hardware is coming.** Treat Tidbyt devices as a frozen installed base. Tronbyt (open firmware and server) is the live path.

## Nothing Glyph Matrix: Glyph Toy
See `glyph-toy/README.md`. `npx tsx targets/glyph-toy/export.ts --card home-clock` writes 25×25 frames for the Kotlin `DotToyService` template. **Nothing's GlyphMatrix SDK terms forbid commercial use without Nothing's written permission.**
