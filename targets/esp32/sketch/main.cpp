// Dot/480 on an ESP32 + WS2812 matrix: runs Field IR bytecode (dotvm.c) offline at device fps.
// Programs arrive over HTTP (POST /program, body = bytecode as hex text) or serial ("P <hex>\n"); data keys over
// HTTP (POST /data?key=value) or serial ("D <key> <value>\n"). The last program is kept in NVS.
// Brightness = clamp(value, 0, 1) × the one accent colour (Dot/480 dotActive by default).
#include <Arduino.h>
#include <FastLED.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
extern "C" {
#include "../dotvm.h"
}

#ifndef DOT_W
#define DOT_W 16
#endif
#ifndef DOT_H
#define DOT_H 16
#endif
#ifndef DOT_PIN
#define DOT_PIN 13
#endif
#ifndef DOT_SERPENTINE
#define DOT_SERPENTINE 1
#endif
#ifndef DOT_FPS
#define DOT_FPS 30
#endif
#ifndef DOT_BRIGHTNESS
#define DOT_BRIGHTNESS 48           // 0..255 global limit: a 16×16 panel at full white draws ~15 A
#endif
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASS
#define WIFI_PASS ""
#endif

static CRGB leds[DOT_W * DOT_H];
static const CRGB ACCENT(0xFF, 0x3B, 0x30);  // {colors.dotActive}
static uint8_t code[DV_MAX_CODE];
static uint16_t codeLen = 0;
static dv_prog prog;
static dv_env env;
static bool ready = false;
static WebServer http(80);
static Preferences nvs;

static bool load(const uint8_t *b, size_t n, bool persist) {
  if (n > sizeof code) return false;
  static uint8_t staging[DV_MAX_CODE];
  memcpy(staging, b, n);
  dv_prog p; uint16_t at = 0;
  int st = dv_load(&p, staging, (uint16_t)n, &at);
  if (st != DV_OK) { Serial.printf("dotvm: rejected (%d at byte %u)\n", st, at); return false; }
  memcpy(code, staging, n); codeLen = (uint16_t)n;
  dv_load(&prog, code, codeLen, &at);
  dv_env_init(&env);
  ready = true;
  if (persist) { nvs.putBytes("prog", code, codeLen); }
  Serial.printf("dotvm: program %u B, %u data keys\n", codeLen, prog.ndata);
  return true;
}

static void setData(const char *key, float v) {
  int s = ready ? dv_data_slot(&prog, key) : -1;
  if (s >= 0) env.data[s] = v;
}

static int hexval(char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1; }

// programs travel as hex text (WebServer's plain body is a C string, so raw bytes would stop at 0x00)
static bool loadHex(const char *h) {
  static uint8_t buf[DV_MAX_CODE]; size_t n = 0;
  for (; h[0] && h[1] && n < sizeof buf; h += 2) { int a = hexval(h[0]), b = hexval(h[1]); if (a < 0 || b < 0) break; buf[n++] = (uint8_t)(a << 4 | b); }
  return load(buf, n, true);
}

static void serialLine(char *line) {
  if (line[0] == 'P' && line[1] == ' ') Serial.println(loadHex(line + 2) ? "OK" : "ERR");
  else if (line[0] == 'D' && line[1] == ' ') {
    char key[33]; float v;
    if (sscanf(line + 2, "%32s %f", key, &v) == 2) { setData(key, v); Serial.println("OK"); } else Serial.println("ERR");
  }
}

static void pollSerial() {
  static char line[2 * DV_MAX_CODE + 8]; static size_t n = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') { if (n) { line[n] = 0; serialLine(line); n = 0; } }
    else if (n < sizeof line - 1) line[n++] = c;
  }
}

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<WS2812B, DOT_PIN, GRB>(leds, DOT_W * DOT_H);
  FastLED.setBrightness(DOT_BRIGHTNESS);
  nvs.begin("dot480", false);
  size_t n = nvs.getBytesLength("prog");
  if (n && n <= sizeof code) { static uint8_t b[DV_MAX_CODE]; nvs.getBytes("prog", b, n); load(b, n, false); }
  if (strlen(WIFI_SSID)) {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
    Serial.printf("wifi: %s\n", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline (serial only)");
  }
  http.on("/program", HTTP_POST, [] {
    bool ok = loadHex(http.arg("plain").c_str());
    http.send(ok ? 200 : 400, "text/plain", ok ? "OK\n" : "rejected\n");
  });
  http.on("/data", HTTP_POST, [] {
    for (int i = 0; i < http.args(); i++) if (http.argName(i) != "plain") setData(http.argName(i).c_str(), http.arg(i).toFloat());
    http.send(200, "text/plain", "OK\n");
  });
  http.on("/", HTTP_GET, [] {
    char s[96]; snprintf(s, sizeof s, "dot480 %dx%d program=%uB fps=%d\n", DOT_W, DOT_H, codeLen, DOT_FPS);
    http.send(200, "text/plain", s);
  });
  http.begin();
}

void loop() {
  static uint32_t next = 0;
  http.handleClient();
  pollSerial();
  uint32_t now = millis();
  if ((int32_t)(now - next) < 0) return;
  next = now + 1000 / DOT_FPS;
  env.t = now / 1000.f;
  for (int y = 0; y < DOT_H; y++) for (int x = 0; x < DOT_W; x++) {
    float u = DOT_W == 1 ? .5f : (float)x / (DOT_W - 1), v = DOT_H == 1 ? .5f : (float)y / (DOT_H - 1);
    float k = ready ? dv_eval(&prog, &env, u, v) : 0.f;
    k = k > 0.f ? (k < 1.f ? k : 1.f) : 0.f;   // NaN → 0
    int i = DOT_SERPENTINE && (y & 1) ? y * DOT_W + (DOT_W - 1 - x) : y * DOT_W + x;
    leds[i] = CRGB((uint8_t)(ACCENT.r * k), (uint8_t)(ACCENT.g * k), (uint8_t)(ACCENT.b * k));
  }
  FastLED.show();
}
