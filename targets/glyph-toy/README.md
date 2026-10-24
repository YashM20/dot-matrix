# Dot/480 Glyph Toy template (Nothing Glyph Matrix)

> **Licence:** Nothing's GlyphMatrix SDK terms forbid commercial use without Nothing's written permission. This template is for personal and non-commercial use only. Get permission before you ship a toy commercially.

A Glyph Toy is an Android `Service` that the Glyph Toys manager binds. This template plays frames that Dot/480 exports. Source: [GlyphMatrix-Developer-Kit](https://github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit), checked 2026-10-23.

| Device | `register(...)` | Matrix |
|---|---|---|
| Phone (3) | `Glyph.DEVICE_23112` | 25×25 (round) |
| Phone (4a Pro) | `Glyph.DEVICE_25111p` | 13×13, AOD toys only |

## Build

1. Export the frames: `npx tsx targets/glyph-toy/export.ts --card home-clock --seconds 2 --fps 10`. Add `--size 13` for the Phone (4a Pro). For an IR program, use `--ir plasma` instead of `--card`. This writes `out/dot480_frames.json` (brightness 0–255 per LED, row by row, dark outside the round matrix) and `out/preview.png`.
2. Create an Android app (Kotlin, min SDK per the kit). Put the GDK `.aar` in `app/libs/` and add `implementation(files("libs/GlyphMatrixSDK.aar"))`.
3. Copy `DotToyService.kt` into your package. Merge `AndroidManifest.snippet.xml` into your manifest. Add the `toy_name` and `toy_summary` strings and a `toy_preview` drawable (the kit asks for an SVG preview that follows its icon spec).
4. Copy `dot480_frames.json` to `app/src/main/assets/`.
5. Install the app, then open Glyph Toys manager and enable the toy. Long press (Glyph Touch) pauses and resumes the toy. As the AOD toy, it draws the first frame about once a minute.

## Notes
- The SDK documents brightness 0–255 for `GlyphMatrixObject.setBrightness`. It does not document a range for the raw `int[]` of `setMatrixFrame`. For that reason the template draws through a 1:1 `Bitmap` → `GlyphMatrixObject` → `GlyphMatrixFrame.render()`.
- The round mask in `export.ts` (`onMatrix`) only approximates the physical LED layout. Use `Common.getDeviceMatrixLength()` at runtime if you generalise the template.
- Not tested on hardware: no Nothing phone was available. The Kotlin file is a template and was not compiled here.
