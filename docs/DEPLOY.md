# DEPLOY: shipping the site

The site is a static build: `pnpm build` → `dist/`. It is hosted on **Vercel**, connected to the GitHub repo:
- every push to `main` deploys production;
- every pull request gets a preview deployment, linked from the PR.

CI (`.github/workflows/ci.yml`) only checks and builds; it does not deploy. Host config lives in `vercel.json`.

## What the build produces
| Path | From | Notes |
|---|---|---|
| `dist/index.html`, `dist/assets/*` | `vite build` | Hashed chunks: one per board (`src/widgets/manifest.ts`), one per non-board view, plus the sample worker. |
| `dist/essay.html` | `vite build` (second entry) | The "Ditherpunk for UI" essay. |
| `dist/<board>/index.html` | `scripts/site/postbuild.ts` | A copy of `index.html` with that board's `<title>`, description, canonical and OG/Twitter tags (`src/site/meta.ts`). Crawlers get the right preview for `/light/`. The app opens the board from the path. |
| `dist/og/<board>.png`, `dist/og/default.png` | `scripts/site/postbuild.ts` → `scripts/og.ts` | 1200×630, one hero card per board (the first card without live media; override in `HERO`). |

The post-build step runs from the `site-postbuild` plugin in `vite.config.ts`. `SITE_POSTBUILD=0` skips it. `npx tsx scripts/site/postbuild.ts --no-og` reruns only the pages.

**Absolute OG URLs.** `og:url` and `og:image` are made absolute from an origin. Most link unfurlers (Slack, X, iMessage) need absolute image URLs. The origin is chosen in this order:
1. `SITE_URL`, if set. Use this for a custom domain: set it in Vercel → Project → Settings → Environment Variables.
2. Otherwise `https://$VERCEL_PROJECT_PRODUCTION_URL`, which Vercel provides during its builds.
3. Otherwise, as in local and CI builds, the tags stay root-relative.

## Deep links
- `/<board>/` (for example `/light/`) is the shareable form.
- Other views are `?tab=<view>` on the current board's path, for example `/light/?tab=studio`.
- The address bar follows every board and view, and each change is a history entry, so Back and Forward work. This is `syncUrl` in `src/site/meta.ts`; the first render only normalises the URL.
- `?board=<id>` folds into the path. `?card=<id>`, `?tab=dots&p=…`, `?skin=` and `?worker=0` still work and are kept.
- Old ids resolve through `boardAliases` (`/glyph/` opens `/lock/`).
- Links to `essay.html` must be root-absolute (`/essay.html`): a relative link breaks under `/<board>/` paths.
- SPA fallback: `vercel.json` rewrites any path to `/index.html`. Vercel serves real files first, so board pages (`dist/<board>/index.html`), assets and OG images are unaffected.

## Headers (`vercel.json`)
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`. File names are content hashes.
- `/og/*`, `/images/*`: 1 day.
- HTML uses Vercel's default (revalidate), so a deploy shows up at once.
- On every path:
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy`: camera, microphone, geolocation and motion sensors allowed for `self` (the mirror board's camera prompt still appears); payment and bluetooth off.
- CSP, on every path except `/lab/*` (a hand-written dev page with an inline script):
  - `script-src 'self'`: no inline scripts and no eval. The IR `function` backend falls back to closures under this policy.
  - `worker-src 'self' blob:`: the sample worker.
  - `style-src 'self' 'unsafe-inline'`: React style attributes.
  - `img-src`/`media-src` allow `data:`, `blob:` and `mediastream:` (exports, camera).
  - `connect-src`: the live board's APIs (Open-Meteo, GitHub, the contributions API), plus `wss:` and localhost `ws:` for the `?np=` now-playing socket.
  - WebCodecs and `getUserMedia` need no CSP grant.
  - **Add any new external API to `connect-src`**, or the fetch is blocked in production only.
- No COOP/COEP: nothing uses `SharedArrayBuffer`, and COEP would block the cross-origin API responses. Add them only if a feature needs cross-origin isolation (for example threaded WASM).

## CI (`.github/workflows/ci.yml`)
The `check` job:
1. runs typecheck, lint and verify;
2. builds;
3. runs `golden --check`;
4. checks the bundle budget (`scripts/site/size.ts --check`: first-load JS ≤ 150 kB gz);
5. uploads `dist/` as the `site` artifact;
6. reports perf (report-only).

## Vercel project settings
- **Framework:** Vite.
- **Build command:** `pnpm build`.
- **Output:** `dist`.
- **Install command:** Vercel's default, which uses pnpm because `pnpm-lock.yaml` is present.

Local check: `pnpm build && pnpm preview`, then open `http://localhost:4173/light/`. `vite preview` does not apply the `vercel.json` headers. To test those locally, run `npx vercel dev` (the Vercel CLI is not a dependency: npx fetches it).
