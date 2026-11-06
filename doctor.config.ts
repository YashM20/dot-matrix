// React Doctor (`pnpm react-doctor`): https://react.doctor/docs/configuration/config-files
// Plain object on purpose: react-doctor runs through a pinned `pnpm dlx`, so it isn't installed and its types
// aren't importable here. Every ignore says why. Findings still worth doing: #207, #208, #209.
export default {
  rules: {
    // the same check as oxlint's `react/only-export-components`, which `.oxlintrc.json` already runs (with
    // `allowConstantExport`): keep one copy so each finding counts once
    'react-doctor/only-export-components': 'off',
    // `includes`/`find` in a loop (#209): every flagged array is a handful of layers, frames, locks, tags or
    // history lines, walked on a click or a key, never per frame, per dot or per pointer move. A Set or Map there
    // costs more than the scan it saves, so fixes go where a profile shows a hot path instead
    'react-doctor/js-set-map-lookups': 'off',
  },
  ignore: {
    files: [
      // generated or vendored: card pixel pins, the bundled site module for the API, build output
      'goldens/**',
      'api/_lib/gen/**',
      'dist/**',
      'registry/r/**',
      // the MCP package has its own lockfile, tsconfig and CI job; it isn't part of the site's React tree
      'mcp/**',
      // Node tooling (checks, probes, device senders), not shipped to visitors: its awaits in loops are
      // sequential on purpose (one browser, one device), and tsc + oxlint already cover it
      'scripts/**',
      'packages/scripts/**',
      'targets/**',
    ],
    overrides: [
      {
        // These `message` handlers aren't cross-window: a BroadcastChannel only carries same-origin messages,
        // a WebSocket has no `event.origin` to check (the code chose the URL), and the sandbox listens to the
        // dedicated Worker it spawned itself.
        files: ['src/data/transports.ts', 'src/engine/ir/sandbox/remote.ts'],
        rules: ['react-doctor/postmessage-origin-risk'],
      },
      {
        // `buildFunction` only runs outside a browser (no `document`, no worker scope), on JS emitted from the
        // parsed IR AST that also passes a token allowlist; in a page the closure tree runs instead
        files: ['src/engine/ir/compile.ts'],
        rules: ['react-doctor/no-eval'],
      },
      {
        // both revoke the object URL in a `finally` right after the image decodes
        files: ['src/components/hero/HeroCard.tsx', 'src/lib/photoDotify.ts'],
        rules: ['react-doctor/no-create-object-url-without-revoke'],
      },
      {
        // the likes client never rejects: `api()` in client.ts turns every failure into `{ ok: false }`
        files: ['src/components/likes/LikeButton.tsx', 'src/components/likes/GalleryLikes.tsx'],
        rules: ['react-doctor/no-loading-flag-reset-outside-finally', 'react-doctor/no-floating-then-in-jsx-handler'],
      },
      {
        // the dock ghost is `inert` as well as `aria-hidden`, so none of its buttons can take focus (#198)
        files: ['src/App.tsx'],
        rules: ['react-doctor/no-focusable-content-in-aria-hidden'],
      },
      {
        // each of these effects returns its cleanup (or the ref callback releases the listener when the node
        // goes); the rule misses cleanup that a returned unsubscribe or a disconnect-all does
        files: [
          'src/components/editor/Editor.tsx',
          'src/components/hero/LiveBand.tsx',
          'src/components/xray/XRayOverlay.tsx',
          'src/data/useLiveData.ts',
          'src/essay/figures/FigIR.tsx',
          'src/hooks/useControlInput.ts',
          'src/hooks/useSwipeDown.ts',
        ],
        rules: ['react-doctor/effect-needs-cleanup'],
      },
      {
        // a card spec is a JSON format: the round trip is the point (it drops functions, undefined and non-finite
        // numbers the way a saved file would, where `structuredClone` throws on a function and keeps the rest), and
        // it runs once per card build or export, not per frame
        files: ['src/spec/build.ts', 'src/spec/export.ts'],
        rules: ['react-doctor/no-json-parse-stringify-clone'],
      },
      {
        // `Num` takes `Number()` only after it checks for an empty input and a non-finite result
        files: ['src/components/editor/ui.tsx'],
        rules: ['react-doctor/no-unguarded-numeric-input-parse'],
      },
      {
        // `Rename` mounts for one rename: its `value` prop is the starting text, edited locally until Enter or Escape
        files: ['src/components/editor/Panels.tsx'],
        rules: ['react-doctor/no-derived-useState'],
      },
      {
        // static, stateless lists that never reorder (parsed blog spans, changelog lines, snap guides, shell
        // line parts); the X-ray layer list is keyed by layer index, which is the layer's identity there
        files: [
          'src/blog/Doc.tsx',
          'src/components/Changelog.tsx',
          'src/components/editor/Canvas.tsx',
          'src/components/palette/Shell.tsx',
          'src/components/xray/Inspector.tsx',
        ],
        rules: ['react-doctor/no-array-index-as-key'],
      },
    ],
  },
}
