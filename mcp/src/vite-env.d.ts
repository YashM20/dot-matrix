// The MCP package type-checks site modules (src/site/flags.ts and friends) that read Vite's `import.meta.env`.
// Vite isn't a dependency here, so declare the one field they use. Under tsx/Node the value is undefined,
// and the site code already falls back with `?? {}`.
interface ImportMeta {
  readonly env?: Readonly<Record<string, string | boolean | undefined>>
}
