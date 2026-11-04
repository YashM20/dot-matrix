# DEPLOY: shipping the site

The site is a static build: `pnpm build` → `dist/`. It is hosted on **Vercel**, connected to the GitHub repo:
- every push to `main` deploys production;
- every pull request gets a preview deployment, linked from the PR.

CI (`.github/workflows/ci.yml`) only checks and builds; it does not deploy. Host config lives in `vercel.json`.

## What the build produces
| Path | From | Notes |
|---|---|---|
| `dist/index.html`, `dist/assets/*` | `vite build` | Hashed chunks: one per board (`src/widgets/manifest.ts`), one per non-board view, plus the sample worker. |
| `dist/blog.html` | `vite build` (second entry) | The blog (`src/blog/`): the index and every post, the "Ditherpunk for UI" essay included. `vercel.json` rewrites `/blog/*` to it and redirects `/essay`, `/essay/` and `/essay.html` to `/blog/dot-matrix-essay/`. |
| `dist/blog/index.html`, `dist/blog/<slug>/index.html` | `scripts/site/postbuild.ts` | Copies of `blog.html` with each post's title, description, canonical, OG/Twitter tags (`og:type` article) and JSON-LD (BlogPosting, CollectionPage for the index). Images: `public/og/blog/<slug>-social.png`, else `/og/default.png`. |
| `dist/<board>/index.html` | `scripts/site/postbuild.ts` | A copy of `index.html` with that board's `<title>`, description, canonical and OG/Twitter tags (`src/site/meta.ts`). Crawlers get the right preview for `/light/`. The app opens the board from the path. |
| `dist/og/<board>.png`, `dist/og/default.png` | `scripts/site/postbuild.ts` → `scripts/og.ts` | 1200×630, one hero card per board (the first card without live media; override in `HERO`). |

The post-build step runs from the `site-postbuild` plugin in `vite.config.ts`. `SITE_POSTBUILD=0` skips it. `npx tsx scripts/site/postbuild.ts --no-og` reruns only the pages.

**Absolute OG URLs.** `og:url` and `og:image` are made absolute from an origin. Most link unfurlers (Slack, X, iMessage) need absolute image URLs. The origin is chosen in this order:
1. `SITE_URL`, if set. Use this for a custom domain: set it in Vercel → Project → Settings → Environment Variables.
2. Otherwise `https://$VERCEL_PROJECT_PRODUCTION_URL`, which Vercel provides during its builds.
3. Otherwise, as in local and CI builds, the tags stay root-relative.

## Deep links
- `/<board>/` (for example `/light/`) is the shareable form.
- MAKE is `?make=<tune|compose|code|draw>` and ABOUT is `?about`, on the current board's path, for example `/light/?make=compose`.
- The address bar follows every board and view, and each change is a history entry, so Back and Forward work. The URL forms live in the pure resolver `src/site/views.ts`; `syncUrl` in `src/site/meta.ts` writes them, and the first render only normalises the URL.
- Old forms resolve through the alias table in `views.ts` (checked by verify): `?board=<id>` folds into the path, and `?tab=workspace|studio|dots|draw|log|gallery` map to the new views. `?card=<id>`, `?make=code&p=…`, `?skin=`, `?pro=1` and `?worker=0` are kept.
- Old ids resolve through `boardAliases` (`/glyph/` opens `/lock/`).
- Links to the blog must be root-absolute (`/blog/`, `/blog/dot-matrix-essay/`): a relative link breaks under `/<board>/` paths. There is no sitemap yet.
- SPA fallback: `vercel.json` rewrites any path to `/index.html`. Vercel serves real files first, so board pages (`dist/<board>/index.html`), assets and OG images are unaffected.

## Headers (`vercel.json`)
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`. File names are content hashes.
- `/og/*`, `/images/*`: 1 day.
- HTML uses Vercel's default (revalidate), so a deploy shows up at once.
- Every path gets one header block, `/(.*)`. There are no exclusions: a lookahead in a `source` drops the headers for every path it matches, including deep paths the SPA fallback serves (issue #141). The block sets:
  - `Content-Security-Policy` (below);
  - `X-Frame-Options: SAMEORIGIN`, for browsers that predate `frame-ancestors`;
  - `Cross-Origin-Opener-Policy: same-origin`: a page this site opens, or one that opens it, gets no `window.opener` handle. Nothing here uses `window.opener` or a cross-origin popup, and outbound links already use `rel="noreferrer"`;
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` (two years);
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy`: camera, microphone, accelerometer and gyroscope allowed for `self` (the mirror board's camera, the audio cards, tilt), and `geolocation`, `payment`, `bluetooth`, `usb`, `serial`, `hid` and `display-capture` off.
- The CSP covers the Lab too. `/lab/motion-lab.html` loads its script from `/lab/motion-lab.js`, so it needs no inline grant.
  - `script-src 'self'` plus one sha256: the no-flash theme boot script (`src/site/theme/boot.ts`), inline in every HTML entry. `scripts/site/theme.ts --write` keeps the hash current. No other inline scripts and no eval. The IR `function` backend falls back to closures under this policy.
  - `worker-src 'self' blob:`: the sample worker and the audio scheduler's timer worker.
  - `style-src 'self' 'unsafe-inline'`: React style attributes.
  - `img-src`/`media-src` allow `data:`, `blob:` and `mediastream:` (exports, camera).
  - `connect-src`: `'self'` and the live board's APIs (Open-Meteo, GitHub, the contributions API). No WebSocket sources: the live board's now-playing card reads the page's Media Session and same-origin pushes, and no URL parameter can name a host (#147 removed `?np=`).
  - `frame-ancestors 'self'`: only this site can frame its pages. An embed route would need its own header block with its own `frame-ancestors`.
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
  - WebCodecs and `getUserMedia` need no CSP grant.
  - **Add any new external API to `connect-src`**, or the fetch is blocked in production only.
- Local tooling is unaffected: `vite` dev and `vite preview` don't apply `vercel.json`, so Vite's hot-reload socket keeps working. The theme probes (`scripts/site/theme-boot.ts`, `theme-picker.ts`) serve `dist/` with the CSP from `vercel.json` on `127.0.0.1`, and the page itself opens no socket. Under `npx vercel dev` the CSP applies and blocks the hot-reload socket, so reload by hand there.
- `scripts/site/headers.ts` (in `pnpm check`, and again in CI after the build) reads `vercel.json` and fails if any page, board, widget, blog, legal or Lab path (a deep `/lab/motion-lab/x` included), or any HTML file in the repo or in `dist/`, would miss one of these headers. It also checks the CSP and Permissions-Policy values above, and that every inline script in the HTML pages has its sha256 in `script-src` with no stale hash left over.
- No COEP: nothing uses `SharedArrayBuffer`, and COEP would block the cross-origin API responses. Add it only if a feature needs cross-origin isolation (for example threaded WASM).
- No CSP reporting yet: it needs an endpoint to receive the reports.

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
