# DEPLOY: shipping the site

The site is a static build: `pnpm build` → `dist/`. Any static host that serves `dist/` works; Cloudflare Pages is the recommended one (docs/WEB-PLAN.md §1). Nothing is deployed until the secrets below exist.

## What the build produces
| Path | From | Notes |
|---|---|---|
| `dist/index.html`, `dist/assets/*` | `vite build` | Hashed chunks: one per board (`src/widgets/manifest.ts`), one per non-board view, plus the sample worker. |
| `dist/<board>/index.html` | `scripts/site/postbuild.ts` | A copy of `index.html` with that board's `<title>`, description, canonical and OG/Twitter tags (`src/site/meta.ts`). Crawlers get the right preview for `/light/`. The app opens the board from the path. |
| `dist/og/<board>.png`, `dist/og/default.png` | `scripts/site/postbuild.ts` → `scripts/og.ts` | 1200×630, one hero card per board (the first card without live media; override in `HERO`). |
| `dist/_headers`, `dist/_redirects` | `public/` | Cloudflare Pages / Netlify format. |

The post-build step runs from the `site-postbuild` plugin in `vite.config.ts`. `SITE_POSTBUILD=0` skips it. `npx tsx scripts/site/postbuild.ts --no-og` reruns only the pages.

**`SITE_URL`** (for example `https://dot480.pages.dev`) makes `og:url` / `og:image` absolute. Most link unfurlers (Slack, X, iMessage) need absolute image URLs. Without it, the tags are root-relative. In CI it comes from the repository variable `SITE_URL`.

## Deep links
- `/<board>/` (for example `/light/`) is the shareable form. The address bar follows the board you pick.
- `?board=<id>`, `?tab=<view>`, `?card=<id>` and `?tab=dots&p=…` still work as before.
- SPA fallback: on Cloudflare Pages it is built in, because there is no top-level `404.html`. `_redirects` adds `/* /index.html 200` for hosts that need it. Pages may log that rule as a loop and skip it, which is harmless.

## Headers (`public/_headers`)
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`. File names are content hashes.
- `/og/*`, `/images/*`: 1 day.
- HTML uses the host default (revalidate), so a deploy shows up at once.
- On every path:
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy`: camera, microphone, geolocation and motion sensors allowed for `self` (the mirror board's camera prompt still appears); payment and bluetooth off.
- CSP:
  - `script-src 'self'`: no inline scripts and no eval. The IR `function` backend falls back to closures under this policy.
  - `worker-src 'self' blob:`: the sample worker.
  - `style-src 'self' 'unsafe-inline'`: React style attributes.
  - `img-src`/`media-src` allow `data:`, `blob:` and `mediastream:` (exports, camera).
  - `connect-src`: the live board's APIs (Open-Meteo, GitHub, the contributions API), plus `wss:` and localhost `ws:` for the `?np=` now-playing socket.
  - WebCodecs and `getUserMedia` need no CSP grant.
  - Add any new external API to `connect-src`, or the fetch is blocked in production only.
- No COOP/COEP: nothing uses `SharedArrayBuffer`. COEP would also block the cross-origin API responses. Add them only if a feature needs cross-origin isolation (for example threaded WASM).
- `/lab/*` (a hand-written dev page with an inline script) has the CSP removed.

## CI (`.github/workflows/ci.yml`)
- The `check` job:
  1. runs typecheck, lint and verify;
  2. builds with `SITE_URL`;
  3. runs `golden --check`;
  4. checks the bundle budget (`scripts/site/size.ts --check`: first-load JS ≤ 150 kB gz);
  5. uploads `dist/` as the `site` artifact.
- The `deploy` job runs after `check`:
  - a push to `main` → the production deploy (`--branch=main`);
  - a pull request → a preview deploy at `<branch>.<project>.pages.dev`, linked from the PR as a GitHub deployment.
- Until both secrets exist, the job passes and writes "skipped" to the run summary. PRs from forks never get secrets, so they skip too.

## What you (the user) need to do once
1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Direct Upload**. Name the project `dot480`, or pick another name and set the repository variable `CLOUDFLARE_PROJECT_NAME`. Set the production branch to `main`.
   Do not connect the Git integration as well: CI already deploys, so Git integration would build twice.
2. Create an API token: My Profile → API Tokens → Create → template "Edit Cloudflare Workers", or a custom token with **Account › Cloudflare Pages › Edit**.
3. GitHub repo → Settings → Secrets and variables → Actions:
   - secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the ID is on the dashboard's right sidebar);
   - variable `SITE_URL` = `https://<project>.pages.dev`, or your custom domain.
4. Fix git push credentials (docs/PROGRESS.md › Resume here). Then push `main`; the deploy job does the rest.
5. Optional: add a custom domain in the Pages project, then update `SITE_URL`.

Local check without deploying: `pnpm build && pnpm preview`, then open `http://localhost:4173/light/`. `vite preview` does not apply `_headers`. To test the CSP, run `npx wrangler pages dev dist` (wrangler is not a dependency: npx fetches it).

## Other hosts
- **Netlify:** reads the same `_headers` / `_redirects`.
- **Vercel:** needs a `vercel.json` with a rewrite to `/index.html` and the headers.
- **GitHub Pages:** has no custom headers. Copy `index.html` to `404.html` for the SPA fallback. Board paths already work as real files.
