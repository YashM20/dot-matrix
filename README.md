# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

# Dot/480 — Field-based Dot-Matrix UI Engine

Field → Grid Sampler → Renderer. Every widget is a config of `Field(u,v)->[0,1]` sampled onto a dot grid and rendered as SVG/Canvas.

- **Engine:** `src/engine/` — zero deps, pure TS + Canvas/SVG. Fields: bitmapFont, polar, iconSDF (filled), halftone (Bayer/Floyd + blur+gamma), waveform (bars + trace), spline (Catmull-Rom tension 0.5), heatmap, scatter (Bridson), 3D corridor, warped (sin/cos modulated).
- **Widgets:** `src/widgets/` — 46 presets, one file per widget, `src/components/Board.tsx` composes 7 reference boards (3×3, 3×4).
- **Playground:** `src/components/playground/` — WidgetGallery (thumbnails), ControlsPanel (density/shape/size/roundness/jitter/quantize/theme/animated), PreviewCanvas (DotCanvas DRY), ExportPanel (PNG/SVG/React/HTML), PhotoUpload (100% client-side, Bayer/Floyd).
- **Docs:** `docs/` — DESIGN, AGENTS, BLOCK-INVENTORY, DOT-MATRIX-ENGINE-PLAN, ADVERSARIAL-REVIEW. Original specs in `public/docs/` (PRD, STEP-1/2 handoffs) untouched.
- **Run:** `npm run dev` → Boards + Workspace tabs. `npm run build` → production.

Tokens: `src/engine/theme/tokens.ts` (`dot480` mono, `deerflowMosaic` warm). Quantize default 5 (chunky LED), photos skip quantize. One accent `#FF3B30` per board.
