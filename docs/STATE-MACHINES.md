# State machines

The app's state machines, explicit and implicit, with the invalid states and transitions found in an audit (CP6, November 2026). An explicit machine has a status enum or a reducer. An implicit one is a set of booleans, refs, timers, promises or storage keys that together act as state.

Each machine lists where it lives, its states and their invariants, a transition table, what persists, and its findings. A finding is **Confirmed** when a test reproduces it, **Likely** when the code path is clear but no test reproduces it yet, and **Not reachable** when the code rules it out (the reason is given). Fixed findings name their PR.

Two sections, each kept by one owner: A covers the app shell and data, B covers cards, input and the editor. Line numbers are from the commit that last touched a section.

## A. App shell and data

Findings at a glance, worst first. Severity: data loss, broken UI, wrong output, cosmetic. Besides the three statuses above, **By design** marks a finding that looks wrong but that an owner decision or a check pins.

| Id | Machine | Severity | Status | Issue | Fix |
|---|---|---|---|---|---|
| A2.1 | Chunk loading | Broken UI | Confirmed (`scripts/verify/appstate.ts`) | #300 | Fixed in #303: offline never reloads |
| A2.2 | Chunk loading | Broken UI | Confirmed (`chunks` probe) | #300 | Fixed in #303: each lazy part has a `LoadBoundary` |
| A5.1 | Likes client | Data loss (this browser's likes record) | Confirmed (`scripts/verify/appstate.ts`) | #301 | Fixed in #303: storage listener and read-modify-write |
| A5.2 | Likes client | Wrong output | Likely | #302 | Left: needs the server to say whether the caller's like is counted |
| A5.3 | Likes client | Wrong output | Likely | #302 | Left: heals on the next day's visit |
| A8.1 | Global keys | Broken UI (stuck input) | Confirmed (`c10` probe) | #302 | Fixed in #316: a window blur ends the hold |
| A9.1 | Widget page SHARE | Cosmetic | Confirmed (`c10` probe) | #302 | Fixed in #316: a keyboard SHARE makes a fresh PNG |
| A4.1 | Theme | n/a | By design | | `theme-picker` probe pins it |
| A5.4 | Likes client | n/a | Not reachable | | Entries are keyed by content |

### A1. Routing and history

Implicit. `App` (`src/App.tsx`) holds `view`, `mode`, `board` and `widget` in React state; the URL is a projection of
them. Pure parts: `viewFromUrl` and `urlForView` (`src/site/views.ts`), `widgetRoute` (`src/site/routes.ts`),
`syncUrl` (`src/site/meta.ts:128`). Every `pushState`, `replaceState`, `location.assign` and `location.replace` goes
through `src/site/safe-url.ts` (`scripts/site/urls.ts` fails on a raw call).

States: `EXPLORE(board)`, `BROWSE`, `ABOUT`, `MAKE(mode)` (only while the `make` flag is on), and `WIDGET(route)`
shown over any of them. Two hand-off states never render: `essay` and `legal` replace the page with a static entry
(`App.tsx:211`).

Invariants:
- The address bar names the shown place: after every commit, `urlForView(state)` equals the path and query, or the
  widget page's canonical `/widget/<slug>/`.
- MAKE is never shown while the flag is off: `urlView` maps it to EXPLORE (`App.tsx:137`), `go` refuses it.
- A board id in the URL is a known id; `resolveBoardId` and `boardAliases` map old ids, unknown ones fall back to
  the first board and the path is rewritten to `/`.

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| load | first render | `essay` or `legal` | static page | `location.replace` with the theme params kept |
| load | first render | | place from URL | `syncUrl(.., push = false)`: old forms normalised in place |
| any place | tab, palette, shell, board picker | target differs | new place | `syncUrl(.., push = true)`: one history entry |
| any place | `popstate` | | place from URL | `setView/setBoard/setWidget`, no push; a board ⇄ widget swap runs as a view transition |
| EXPLORE, BROWSE | card OPEN | not already on that widget | WIDGET | `pushUrl('/widget/<slug>/')`, BROWSE filters dropped |
| WIDGET | BACK, board link | | EXPLORE(board) | `pushUrl`, then a 3 s poll scrolls the card into view |
| WIDGET | widget loaded | address isn't canonical | WIDGET | `replaceUrl(canonical)`; a stale load is ignored (`live` flag) |
| EXPLORE(a) | board change | exit window open | EXPLORE(b) | `useExitSwap` shows `a` until the window ends, then the latest request |

Persists: only the URL (path, query, hash). Other params (`?skin`, `?worker`, `?day`, `?word`) ride along, or `urlForView`
drops them when the view no longer owns them.

Known invalid states:
- Scroll position on Back / Forward is the browser's default, and lazy views often mount after it restores, so Back
  can land at the top. Planned in #38 (N5); not a state bug.
- `leaveWidget` and `focusCard` poll for the card for 3 s with timers nobody cancels. Not reachable as a bug: the
  poll only scrolls, and it stops at 3 s.

### A2. Lazy chunks and the stale-deploy reload

Implicit, three layers:
1. The board loader (`src/widgets/manifest.ts:131`): one promise per board id; a failed import is tried three times
   (`RETRY_MS`), then the rejection is held for `FAILED_HOLD_MS` (30 s) so React's `use()` doesn't refetch on every
   render.
2. The reload (`src/site/stale-deploy.ts`): Vite fires `vite:preloadError` for every failed lazy import (its helper
   wraps the import as well as the preloads). The page reloads once, stamped in
   `sessionStorage['dot480:stale-reload']`, at most once per 5 min per tab.
3. Error boundaries: `LoadBoundary` (`src/components/LoadBoundary.tsx`) around each board, each BROWSE card, the card
   page, and since A2.2 every lazy view and idle part in `App`; `RootBoundary` around the whole page.

States per chunk: `idle`, `loading`, `loaded`, `failed-held` (board loader only), `reloading`.
Per tab: `stamp-free`, `stamp-used` (for 5 min).

Invariants:
- No reload loop: at most one reload per 5 min per tab.
- A failed chunk never blanks the page: the part that needed it shows `LoadFailed` (with RELOAD) and the rest keeps
  working.
- Offline, nothing reloads: the reload would only swap the page for the browser's offline screen.

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| idle | first use (open, hover prefetch, idle mount) | | loading | `import()` |
| loading | import resolves | | loaded | |
| loading | import rejects | online, stamp free | reloading | stamp written, `location.reload()` |
| loading | import rejects | offline, or stamp used | failed | nearest `LoadBoundary` shows `LoadFailed` |
| failed-held | 30 s pass | | idle | the next open tries again (board loader only) |
| failed | RELOAD pressed | | page reload | |

Persists: the stamp, per tab (sessionStorage; a duplicated tab copies it).

Findings:
- **A2.1, Confirmed, fixed.** A chunk that fails while the browser is offline (a phone in a tunnel opening a board,
  or the idle mount of the command layer, hero or live band) fired `vite:preloadError`, and `reloadForStaleChunk`
  reloaded the page. Offline, that lands on the browser's offline screen and the visitor loses the page. It also
  spent the stamp, so a real stale deploy within 5 min got no reload. Fix: return early when `navigator.onLine` is
  false (`stale-deploy.ts`). Check: `scripts/verify/appstate.ts`, which fails on the old code ("returned true, 1
  reloads").
- **A2.2, Confirmed, fixed.** `App` wrapped its lazy views (BROWSE, MAKE, ABOUT, the card page) and its idle parts
  (hero, live band, command layer, board sheet) in `Suspense` only. When the reload can't run (the stamp is used:
  two deploys inside 5 min, or offline after A2.1), the rejected `lazy()` reached `RootBoundary`, and the whole page
  turned into the "THIS PAGE STOPPED" screen for a part that wasn't even on screen. Fix: a `LoadBoundary` around each
  lazy part: the views show `LoadFailed` in place (keyed by the place, so moving to another view resets it), the
  optional parts show nothing. Probe: the `chunks` probe's "missing view chunk" cases (stamp used, and offline).
- `useBlurbs` imports the blurbs chunk with no `.catch` (#209); a failure there is an unhandled rejection with no
  visible effect. Left for #209.

### A3. Release flags

Explicit store, `src/site/flags.ts`; React reads it through `useFlag` (`useSyncExternalStore`).

State: one boolean per flag, resolved in order: the registry default, the build value `VITE_FLAG_<ID>`, the saved
override in `localStorage['dot480:flags']` (and a flag's older `dot480:<param>` key). `kill` at build time is
final. The URL never sets a flag (`scripts/verify/flags.ts`).

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| resolved | `setFlag(id, on)` | not killed | resolved | override saved, older key removed, subscribers told if the value changed |
| resolved | `storage` event for `dot480:flags` or a clear | | resolved again | subscribers told if any value changed |

Persists: `dot480:flags` (JSON of booleans). Missing or corrupt counts as no overrides; blocked storage gives the
defaults and a `setFlag` that lasts for the page.

Known invalid states: an older key (`dot480:worker`, `dot480:clack`) edited by hand in another tab doesn't notify
this tab (`onStorage` listens to `dot480:flags` only). Not reachable from the UI: only DevTools writes those keys.
Turning `analytics` off at runtime doesn't stop a running PostHog until the next load. Not reachable from the UI
either: no control sets that flag.

### A4. Persisted display settings

Each is a small module store with listeners, read before or at first paint:

| Setting | Where | Key | Sources, in order | Other tabs |
|---|---|---|---|---|
| Theme | `src/site/theme/theme.ts` + the inline boot script (`boot.ts`) | `dot480:theme` (JSON) | `?scheme= ?accent= ?theme= ?hue= ?contrast=`, storage, `system` + `signal` | next load |
| Card size | `src/site/cards.ts` + boot script | `dot480:cards` | storage, `l` | next load |
| Skin | `src/components/skins/store.ts` | `dot480:skin` | `?skin=`, storage, `oled` | next load |
| Pro | `src/site/pro.ts` | `dot480:pro` | `?pro=`, storage | live (`storage` event) |
| Share links carry the theme | `src/site/theme/share.ts` | `dot480:share-theme` | storage | next load |
| Intro line hidden | `App.tsx` `IntroLine` | `dot480:intro` | storage | next load |
| Pond memory | `src/site/pondMemory.ts` | `dot480:pond` (the record is the opt-in) | storage | next read |

Shared invariants: every read is wrapped in `try` and validated (a corrupt or old-schema entry counts as missing),
every write is wrapped too (blocked storage keeps the choice for this page). The theme's custom CSS is never read
back from storage; only the hue is, and the generator makes the CSS again (#149, `scripts/site/theme.ts`).

Theme transitions:

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| boot | inline script | | attributes set | `data-scheme`, `data-accent`, `data-cards`, metas; custom CSS painted only if it passes the shape test |
| boot | bundle runs | stored entry has CSS or a hue | repairing | lazy `custom.ts`; a stored copy that isn't the generator's is rewritten |
| any | `setTheme` | | picked | entry stored (a custom accent only with its CSS), `.no-transition` for the swap frame |
| `system` | OS scheme change | scheme is `system` | follows the OS | |

Findings:
- **A4.1, By design.** A visit opened from `?theme=light_amber` that then picks only DARK stores `{"scheme":"dark",
  "accent":"amber"}`: the link's accent becomes the visitor's. The theme store's comment says URL params are never
  stored, but that means "not without a pick". The `theme-picker` probe asserts that a pick drops the theme params
  from the URL and stores what was shown. Left as is.
- Theme, card size and skin don't follow another tab live; the next load reads the last write. Cosmetic, and both
  tabs stay internally consistent.

### A5. Likes, the client

Implicit, two layers in `src/components/likes/`:

1. `client.ts`, module state: `restUntil` and `failures` (the API's rest window: 15 s, doubling, at most 5 min; a
   404 or 429 doesn't count), one cached `widgets` count read per page view, one per program, the BotID loader, and
   this browser's record `localStorage['dot480:likes']` = `{ c: 'r' | 'o', d: day, mine: { item: countAtLike } }`.
2. `LikeButton.tsx`, per button: `state` (`loading`, `off`, `ready`, `paused`), `busy`, `asking` (the remember
   sheet), `note`, `count`.

Invariants:
- One request at a time per button (`busy` disables it); no request while the API rests.
- `mine` holds exactly the items this browser liked; the shown count is `max(count, mine[item] + 1)` while liked.
- `c` is set only after the visitor chose in the sheet (or GPC skips it: every like is "just this once").
- Two tabs never write over each other's record (since A5.1).

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| loading | count read ok | | ready | BotID loads, `dailyVisit` (once a day, remembered browsers) |
| loading | 404 | | off | button hidden |
| loading | other failure | | paused | API rests |
| ready | click | liked | busy | `POST /api/like {on: false}` |
| ready | click | GPC, or a choice stored | busy | `POST /api/like {on: true}` |
| ready | click | no choice | asking | remember sheet (modal) |
| asking | Remember | | busy | choice stored, `POST /api/visit`, then the like |
| asking | Just this once | | busy | choice stored, the like |
| asking | Escape, scrim | | ready | nothing sent |
| busy | like ok | | ready | `mine` updated (read-modify-write), note: counting soon or already liked |
| busy | 429 or failure | | ready | note: limit or paused |
| ready | Forget this browser | ok | ready | record removed, server drops this voter's likes |
| any | `storage` event for `dot480:likes` | | same | cached record dropped, buttons re-render |

Persists: the record (localStorage), the HttpOnly voter cookie (server), the server ledger (A6).

Findings:
- **A5.1, Confirmed, fixed.** `local()` cached the record for the page's life and every write spread that cached
  copy. Two tabs open: tab A likes X, tab B (its cache from before) likes Y and writes `{mine: {Y}}`, dropping X.
  X then shows as not liked in this browser, and a "just this once" browser can send it again. The same staleness
  undid "Forget this browser": tab B wrote its old `c: 'r'` back on its next like, so the browser looked remembered
  with no cookie behind it. Fix: a `storage` listener drops the cache and re-renders, and every write goes through
  `updateLocal`, which reads the stored record first. Check: `scripts/verify/appstate.ts`.
- **A5.2, Likely, left.** Unlike after a reload doesn't lower the count. Like X, wait until it is counted, reload:
  `count` (from the server) includes this like and `mine[X]` holds the count from before it, so the button shows
  `count`. Unlike: `mine[X]` is dropped and the button still shows `count` (`LikeButton.tsx`, `send`). The client
  can't tell whether its own like is in the public count (it may still be held as pending, and other visitors move
  the count too), so a fix needs the server to report it. Low impact: the next page view after the CDN cache (5 min)
  is right.
- **A5.3, Likely, left.** Remember stores `c: 'r'` before `POST /api/visit` answers, and ignores the answer
  (`LikeButton.tsx`, `choose`). If the visit fails (paused or timed out), the browser shows "Forget this browser"
  with no cookie, and the failure starts the rest window, so the like that follows comes back "Likes paused" at once.
  `dailyVisit` issues the cookie on the next day's visit, so it heals.
- **A5.4, Not reachable.** A `LikeButton` whose `program` prop changes would keep the old `item` until the new count
  loads. Gallery entries are keyed by their content hash (`programHash`), so a changed program is a new button.
- Double clicks: not reachable. `busy` re-renders before the next click (React flushes a discrete event's updates).

### A6. Likes, the server

Explicit per like: the ledger entry's `s` (`p` pending, `b` burst-held, `c` counted, `f` flagged, `r` removed) with
its tier `t` (`R` remembered, `N` new, `O` once), in Upstash (`api/_lib/likes.ts`, `api/_lib/ledger.ts`). Every flow
is one read pipeline and one atomic commit with guards (`eq` on the entry, `cap` on each limit), so going over any
limit writes nothing and a raced entry retries once (`busy`, then 409).

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| none | like | under every cap | `p` (or `b` past the burst cap, unless remembered) | pending set, burst and rate counters, voter set or once set |
| `r` | like | restore window, or it was flagged | its previous state | |
| `p`, `b` | hold over (any like, an uncached count read, the daily job) | | `c`, `f` | totals moved |
| active | unlike | | `r` | totals moved, pending entry removed |
| any | forget | | gone | every item of this voter recounted, cookie cleared |
| any | same idempotency key within 10 min | | same | the first answer again |

Persists: Upstash (ledger, totals, pending and once sets, rate keys with TTLs), the signed voter cookie. Covered by
`scripts/likes/checks.ts` (limits, holds, bursts, cookies, forget, budget). A client sees 409 `busy` as a failure:
"Likes paused" and a 15 s rest. No new findings here.

### A7. Analytics consent

Implicit, `src/site/analytics.ts` (the queue and sink) and `src/site/analytics/consent.ts` (`running`, `started`,
`closeBanner`, the stored choice).

States from `analyticsState()`: `unavailable` (no token, killed, or flag off), `blocked` (Global Privacy Control or
Do Not Track), `unset`, `on`, `off`. Before `start()` runs (page idle), events queue (at most 40).

Invariants:
- Nothing is sent before Allow; events from before a choice are dropped for good (`setSink(null)`).
- GPC or DNT keep it off, with no banner, whatever is stored.
- Off deletes PostHog's storage and its anonymous id (`posthog.ts`, `stop`).

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| unset | page idle | | unset | banner chunk loads; shown only if still unset |
| on | page idle | | on | PostHog loads, queued events flushed |
| unset, off | Allow (banner, TOOLS, palette) | not blocked | on | stored `on`, banner closed, PostHog starts |
| on | No thanks, switch off | | off | stored `off`, sink dropped, PostHog stopped and its storage cleared |
| any | `storage` event for the choice | | stored choice | banner closed if a choice exists, `apply` |

Races checked: Allow then off while PostHog loads (`apply` re-checks `running` after the await: nothing starts);
off then on quickly (both continuations wait on the same promise and run in order). No findings.

### A8. The command layer: ⌘K palette, the shell, global keys

Implicit. `CommandLayer` (`src/components/palette/CommandLayer.tsx`) holds `palette`, `shell`, `tools`, `boss`; the
wrapper in `App.tsx:111` mounts it once the page is idle or on the first key, and replays that key. On phones the
tab bar asks for it through `src/site/layer.ts` (`pending` request plus wakers), so a tap before the mount still
opens the sheet.

States: `closed`, `palette`, `shell`, `tools` (phones), `boss` (the Konami card, a modal dialog). At most one of
palette and shell is open: ⌘K closes the shell, the backtick opens the shell only with no overlay, a layer request
closes the shell.

| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| not mounted | first key, idle, tab bar tap | | mounted | layer chunk loads; the key is replayed, a tap request runs |
| closed | ⌘K / Ctrl-K | no modal dialog open | palette | focus to the input (touch: the sheet) |
| palette | ⌘K, Escape, scrim, run | | closed | focus back to where it was |
| closed | backtick | not typing, no overlay | shell | history loaded from `sessionStorage['dot480:shell-history']` |
| shell | Enter | | shell | command queued; one runs at a time |
| shell | Ctrl+C | a command runs | shell | its `AbortController` aborts, queue dropped |
| shell | Escape, backtick on an empty line | | closed | running command aborted |
| closed | hold T | not typing | frozen | the shared clock freezes; pointer moves scrub while T is held |
| frozen, T held | T let go, or the window loses focus | | frozen | the hold ends: pointer moves no longer scrub |

Persists: shell history per tab (sessionStorage, validated on read: strings only, at most 256 characters, at most
100 entries); nothing else.

Findings:
- **A8.1, Confirmed, fixed in #316.** Hold T, then switch windows (Alt+Tab) and let go of T there: the `keyup` never
  reaches the page, `tHeld` stayed true, and back on the page every pointer move scrubbed the frozen clock until T was
  pressed again. Fix: a window `blur` ends the hold (`CommandLayer.tsx:312`). Probe: the `c10` probe's `holdt` section
  holds T with no keyup, fires the window's `blur`, and moves the pointer. Without the fix the clock went from
  T = 3.19s to T = 6.19s; with it, it stays put. Headless Chrome can't switch windows, so the probe fires the `blur`
  event itself.
- Not reachable: two shell commands at once. `pump` returns while one runs, and the loop picks up what was queued.

### A9. Share, LINK, REMIX and export

Mostly stateless: each action reads the theme, the clock and the card's data in the click, then loads its export code
(`src/components/widget/cardExport.ts`, `src/export/clipboard.ts`). Clipboard writes happen inside the click with a
pending `Promise<Blob>` (Safari refuses a write after an `await`); a refused copy falls back to a download, a refused
text copy to showing the URL in a toast. Links go through `withTheme` (the share-theme opt-in) and `withPondDay` (a
pond link carries its day). REMIX pushes `?make=code&p=…` (MAKE flag on), or opens the card in the editor.

The one stateful piece: `sharePNG` (`WidgetPage.tsx:119`), a PNG started on `pointerdown` so the share sheet opens
inside the click with the file ready. Since A9.1 only the click that follows that press uses it; a keyboard click
(`detail` 0) makes a fresh one.

Findings:
- **A9.1, Confirmed, fixed in #316.** Press on SHARE, drag off and let go (no click), change the theme, then SHARE
  with the keyboard: the PNG from the first press was shared, in the old theme and at the old time. Fix: the press's
  PNG serves only a pointer click (`WidgetPage.tsx:131`). Probe: the `c10` probe's `share` section, with a Web
  Share stand-in that records each shared PNG, on `/widget/settings/` after switching the accent to cobalt. Without
  the fix the two shared PNGs differed (76925 and 76203 bytes); with it they match.
- Object URLs for downloads are revoked after 1 to 1.5 s; a slow save dialog doesn't need them (the download has
  started by then).

## B. Cards, input and editor

Findings at a glance:

| id | machine | severity | status | issue | PR |
|---|---|---|---|---|---|
| B7-1 | media: camera | stuck UI | Confirmed, fixed | #296 | #298 |
| B6-1 | editor and IR worker | wrong output | Confirmed, fixed | #297 | #298 |
| B6-3 | editor autosave | data loss (two tabs) | Likely, owner decision | | |
| B7-2 | media: mic | stuck UI | Likely | | |
| B7-3 | media: HAND mode | stuck UI | Likely | | |
| B4-1 | card input | stuck press | Likely | | |
| B4-2 | card input | stale state | Likely | | |
| B3-1 | transitions | cosmetic | Likely | | |
| B1-1 | card lifecycle | performance | Likely | | |
| B1-2 | card lifecycle | cosmetic | Likely | | |
| B2-1, B5-1, B6-2, B6-4, B7-4, B7-5 | | | Not reachable | | |

### B1. Card lifecycle (DotCanvas, DotWidget)

`src/components/DotCanvas.tsx:173`, `src/components/DotWidget.tsx:102`. Implicit: `ready` (entrance delay), `onScreen` (IntersectionObserver), `engaged` and `live` (derived), `transient`, `mode` (renderer), `gpuCard` (memo), and the live effect's clock subscription and remote sampler.

**States**
- **waiting**: `enter` was set and its delay has not passed (`ready` false, `:193`). Nothing is sampled. Invariant: no clock subscription, no worker request.
- **static**: `live` false. One sampled frame (`useDotField`), drawn as SVG when sparse and still, else on canvas (`:308`). An animated card is static under reduced motion or while off screen, at t 0. Invariant: no clock subscription unless a transient runs.
- **live**: `(motion && onScreen) || engaged` (`:189`). The live effect (`:410`) subscribes to the shared clock and draws every frame on canvas. A registered preset samples in the sample worker (`src/workers/client.ts`) unless a transient runs, the card is engaged, or WebGL draws it. Invariant: exactly one subscription and one remote sampler per mounted canvas.
- **transient**: an entrance, change, exit, burst, spring or migration runs (B3). Forces canvas; a static card gets a 30 fps subscription for it (`:389`).
- Renderer: `svg` for a sparse still frame, `canvas` above 2000 visible dots, when animated, live or in a transient, `webgl` when the card's first frame carries GPU passes and WebGL2 works (`gpuCard`, `:306`). The X-ray can force one.

**Transitions**

| from | event | guard | to | side effects |
|---|---|---|---|---|
| mount | first render | `enter` set, no reduced motion | waiting | timer for `enter.delay` |
| mount | first render | otherwise | static or live | |
| waiting | timer | | static or live, with the `enter` transient | first sample |
| static | IntersectionObserver: on screen | animated, no reduced motion | live | subscribe, first frame drawn before paint |
| live | IntersectionObserver: off screen | not engaged | static (t 0 frame) | unsubscribe, remote sampler disposed |
| static | pointer hover, press or focus on a control | interactive, no reduced motion | live | SVG swaps to canvas in a layout effect |
| live | data or style change | | live (re-subscribed) | old subscription and sampler disposed |
| any | reduced motion turns on | | static | |
| any | WebGL context lost | | same state, frames drawn on canvas 2D | `dotgl.ts:97`; a context still lost after 1.5 s is replaced (`dotgl.ts:346`) |
| any | unmount | | gone | subscription, sampler (in-flight reply closes its bitmap), timers and observers cleared |
| DotWidget | `findPreset` resolves after unmount | | | ignored (`live` flag, `DotWidget.tsx:77`) |

**Persists:** nothing per card. The display skin and theme live in their own stores.

**Findings**
- **B1-1, Likely, performance.** `gpuCard` is decided once per card and grid (`:306`) from `webglReady()`. A card mounted while the shared context is lost samples its GPU layers on the CPU until it remounts, even after the replacement context arrives. Output is correct.
- **B1-2, Likely, cosmetic.** A worker frame requested before the card became engaged can land after the engagement ends (`:421` draws it if no transient runs and the card is not engaged now), one frame older than the local frame already drawn. A single-frame step back.
- `useOnScreen` starts as on screen (`:111`), so an animated card mounted off screen subscribes and draws one frame before the observer reports. Intended (no blank first paint), noted for cost.

### B2. Shared clock and turn-taking

`src/engine/clock.ts:65` (`createMasterClock`), `sharedClock()` at `:126`. Implicit: `running`, `paused`, `handle` (a pending animation frame), `elapsed` and `last`, plus per subscriber `{ frame, dirty, group }`.

**States**
- **stopped**: no subscribers or not started. `T()` returns `elapsed`. Invariant: `handle` is 0 or a pending one-shot seek frame.
- **running**: subscribers, not paused. One rAF loop. Invariant: `handle` is the loop's frame.
- **paused**: `pause()` (tab hidden, X-ray frozen). Time stands still; subscribers keep their last frame.
- **one-shot**: a `seek` while stopped or paused draws one frame at the new time (`:118`).
- Per subscriber group (each frame): `-1` (draws on any frame change), `0` (on time) or `1` (half a frame behind). Only cards with `order`, `staggerable()` true, and more than `STAGGER.min` of them, take turns (`:78`). A card taking turns never steps back: after a group change it holds its frame (`:82`).

**Transitions**

| from | event | guard | to | side effects |
|---|---|---|---|---|
| stopped | `subscribe` | not paused | running | `last = now()`, a pending one-shot is cancelled |
| running | last unsubscribe | | stopped | `elapsed` banked |
| running | `visibilitychange` hidden, X-ray freeze | | paused | loop cancelled |
| paused | `visibilitychange` visible | X-ray not frozen | running | `last = now()`: hidden time is not counted |
| any | `seek(T)` | finite T | same | every subscriber dirty; a one-shot frame when not running |
| any | `invalidate(sub)` | | same | `sub` draws on the next frame |
| running | animation frame | | running | groups recomputed, each subscriber called when its quantized frame changed or it is dirty |

bfcache: the page goes hidden on `pagehide` and visible on `pageshow`, so the clock pauses and resumes through `visibilitychange`. Reduced motion is not a clock state: DotCanvas stops subscribing (B1).

**Persists:** nothing. Board time restarts at 0 on each load.

**Findings**
- **B2-1, Not reachable.** `invalidate` on a card in group 1 skips the hold rule (`:82`, `dirty`), so it could draw an earlier `t`. The input that invalidates a card also makes it not staggerable (`engagedNow` in `DotCanvas.tsx:422`) or changes its data, which re-subscribes it with a fresh state.
- The X-ray freeze survives a tab switch because its `visibilitychange` listener is added after the clock's (`src/components/xray/store.ts:127`), so it pauses again right after the clock resumes.

### B3. Transitions (enter, change, burst, spring, migrate, exit)

`src/components/DotCanvas.tsx:164` (`Transient`), started in layout effects (`:220` to `:298`), advanced and ended by `applyTransient` (`:350`). Explicit: `transientRef.current.kind` plus `t0`, mirrored in the `transient` state that keeps the canvas mounted.

**States:** none, `enter`, `change`, `exit`, `burst`, `spring`, `migrate` (forward or back). Invariants: at most one runs; `t0` is the clock time of its first frame; `exit` never ends on its own (the blank frame holds until unmount or the exit is cleared); forward `migrate` holds on the target.

**Transitions**

| from | event | guard | to |
|---|---|---|---|
| none | mount after the delay | `enter` set, no reduced motion | enter |
| enter | progress reaches 1 | | none |
| none or change | a new static frame (data edit, minute tick) | not live, not within 250 ms of input, `change` not false, no reduced motion | change (from the frame on screen) |
| none | `tick` bump | `burst` set, layers, not animated, no reduced motion, ready, not exiting | burst |
| any but exit | data change on a spring key | not live, ready, no reduced motion, not entering | spring |
| any | `exit` set | no reduced motion | exit |
| exit | `exit` cleared | | enter |
| any but exit | `migrate` set | | migrate forward (instant under reduced motion) |
| migrate | `migrate` cleared | | migrate back, then none |
| burst, change, spring, back migrate | elapsed or settled | | none |

**Persists:** nothing.

**Findings**
- **B3-1, Likely, cosmetic.** A burst samples with the `data`, `grid` and `style` of the render that started its subscription (`:357`; the effect at `:389` does not re-run on data). A data edit during a burst shows the old data until the burst ends, then cuts.

### B4. Card input

`src/hooks/useControlInput.ts:114`. Implicit: per pointer, the maps `pointers`, `candidates`, `drags`, `claimed`, `taps` and `lingers`; for the card, `live` (hover, pressed, focus), `engaged`, the keyboard press timer and the idle timer. Touch policy constants: `src/engine/interaction/gesture.ts:10` (`TOUCH`).

**States, per touch pointer**
- **candidate**: down on the card, not yet meant for it (`:317`). No value change, no pointer capture, the page may scroll.
- **shown**: a still candidate on a tap control after 110 ms shows its press (`:322`); a button goes down for real (held while the finger stays, not claimed).
- **claimed**: a horizontal drag on a drag control, or a 300 ms hold (`seize`, `:335`). Pointer captured, page scroll blocked by the card's non-passive `touchmove` (`:228`).
- **tap replay**: a lifted still tap replayed as a short press (`:346`), released after 90 ms, and on a live card not before it drew 3 frames (cap 500 ms, `:337`).
- **lingering**: a lifted touch stays in `pointers` as `up` for 520 ms so ripples finish (`:298`).

Mouse and pen skip the candidate: down on a control grabs and captures it (`:375`).

**States, per card:** idle, hovered, pressed, focused (visible focus only), **engaged** (a hold grabbed a drag control: its drag controls take every touch at once until a touch elsewhere, Escape, DONE or 8 s idle, `:199`).

**Transitions (touch)**

| from | event | guard | to | side effects |
|---|---|---|---|---|
| none | pointerdown | within 120 ms of a page scroll | none | the fling stop belongs to the page |
| none | pointerdown | engaged card, drag control | claimed | at once |
| none | pointerdown | otherwise | candidate | press or hold timer |
| candidate | move | vertical first, or past slop on a tap control | none | dropped, page scrolls |
| candidate | move | horizontal on a drag control | claimed | drag starts at the down point |
| candidate | 110 ms still | tap control | shown, or a held button | press shows |
| candidate | 300 ms still | drag control | claimed, card engaged | haptic tick |
| candidate | hold timer late (main thread busy) | | candidate, retried once after 30 ms | queued moves get in first (#273) |
| candidate | pointerup | still past 300 ms on a drag control | claimed, then released | the late hold (#273) |
| candidate | pointerup | a tap (`isTap`) | tap replay | |
| held button | move past slop | not claimed | none | press called off, value restored |
| claimed or held | pointerup | | lingering | release value |
| any | pointercancel | | none | value restored to before the drag |
| claimed (mouse) | lost pointer capture on the root | | none | release value |
| engaged | touch outside, Escape, DONE, 8 s idle | no claimed touch | not engaged | `onEngage(null)` |
| any | unmount | | | every timer cleared |

Keyboard: `press` holds a button down for 140 ms (`:432`); `set` applies a patch on the next frame. Every change is batched into one commit per animation frame (`flush`, `:153`).

**Persists:** nothing.

**Findings**
- **B4-1, Likely, stuck press.** No handler for window blur. A mouse drag on a card while the window loses focus (Alt+Tab) relies on the browser sending `pointercancel` or `lostpointercapture` (`:417`). Where it sends neither, the control stays pressed until the next pointerup on the card. Needs a browser to confirm.
- **B4-2, Likely, stale state.** When the card's controls change (a preset swap, `:454`), drags, claims and candidates are cleared, but tap replays, lingering pointers and the engaged state are kept. A replayed tap then finishes on a control that is gone (harmless: the patch is for an unknown key), and the card can stay engaged until idle.
- Multi-touch: two fingers on two drag controls both work, but `pressed` shows only the last one (`:195`). By design.

### B5. Live worlds

`src/engine/physics/world.ts:188` (`worldAt`). Explicit: `World.mode` (`pristine`, `live`, `heal`) with `liveT`, `liveN`, `lastInput`, `lastBusy`, `healLeft`.

**States**
- **pristine**: a pure function of `t` (`simView`), checkpointed, looped. Invariant: the live state is unused.
- **live**: copied from the pristine run at the first touching frame, stepped with input at the fixed `dt`, at most `maxLiveSteps` per frame (the rest dropped, never a bigger step).
- **heal**: after `idle` seconds without input or `busy`, each step blends onto the pristine state; at the end the world is pristine again.

**Transitions**

| from | event | guard | to |
|---|---|---|---|
| pristine | frame with input (a pointer down or moving, tilted gravity, a kick) | | live |
| live | idle time passes | not `busy` | heal |
| heal | input | | live |
| heal | last heal step | | pristine |
| live or heal | non-finite `t`, or a value goes non-finite | | pristine (`resets` counts the second) |
| live or heal | a touch more than 0.25 s before the live run (remount, scrub back) | | pristine |
| live or heal | a read before the live run with no input (`describe()` at t 0, a reduced-motion still) | | same: shows the pristine run there, keeps the live state (#273) |

**Persists:** nothing; a reload starts pristine.

**Findings**
- **B5-1, Not reachable.** A touch with a non-finite `t` copies the pristine state (`:192`) before the finite check (`:196`). Checked in Node: `worldAt(w, NaN | Infinity, touch)` returns the pristine view and leaves the world pristine.

### B6. Editor and the IR worker

The worker client: `src/engine/ir/sandbox/remote.ts:74` (`irRemote`). The worker: `src/engine/ir/sandbox/irWorker.ts`, batches run by `evaluateBatch` (`protocol.ts:108`). The editor's holds and autosave: `src/components/editor/store.ts:120` to `:351`. Compile per card: `src/components/studio/doc.ts:255` (`compileCard`).

**States, the worker**
- **none**: no worker yet.
- **loading**: spawned, waiting for `ready` (8 s limit, `:117`).
- **ready**: idle.
- **busy**: one batch in flight with a 250 ms watchdog (re-armed once if the page itself was late, `:142`).
- **failed**: never loaded, threw on spawn, or crashed more than 3 times. Every program samples on the main thread from then on.
- Invariants: at most one batch in flight; a reply is applied only if it is for the current worker generation and the in-flight batch id.

**States, per program slot:** cached values for up to 3 input signatures, `inflight` (the signature asked for), `waiters` (redraws to run when it lands), points version `pv` and what the current worker holds (`sent`).

**States, per batch item (worker):** `ok`, `paused` (past its own 50 ms budget), `skip` (the batch already ran past one budget: ask again), `points` (the worker lost the points), `error` (did not compile).

**Transitions, the worker**

| from | event | guard | to | side effects |
|---|---|---|---|---|
| none | a frame misses values | worker flag on | loading | |
| loading | `ready` | | ready | queued batch sent |
| loading | 8 s, or spawn throws | | failed | queued slots redraw on the main thread |
| ready | frame misses values | | busy | batch of up to 64 programs |
| busy | `done` | same id and generation | ready | values cached if count and `pv` match; `paused` and `error` pause the program's guard key; every slot in the batch redraws |
| busy | watchdog | | none (next pump spawns) | worker terminated, the program it had started is paused |
| busy | `error` or `messageerror` | crashes ≤ 3 | none | as the watchdog |
| busy | `error` | crashes > 3 | failed | |

**Editor holds and autosave**
- `held`: frames from a link, file, example or the gallery, with the guard keys of programs that have not drawn within budget yet (#142). `unseen`: frames that have not drawn once (#143). `openedDoc`: a document from a file that has not drawn yet. The autosave (500 ms debounce, `:333`) writes the document without held and unseen frames, and nothing while `openedDoc` is set. `resetting` stops it before a recovery reload.

| from | event | to |
|---|---|---|
| held | its programs report `ok` (`userPrograms.watch`, `:348`) | released, save scheduled |
| unseen | the canvas drew it (`drew`) | released, save scheduled |
| any | document edit | save scheduled |
| any | `resetEditorDoc` | no more saves; the seed is written |

**Persists:** `localStorage['dot480.editor.v1']` (the document), `localStorage['dot480.editor.clip']` (the clipboard, shared across tabs through the `storage` event), the asset library. The worker's point store and the program cache live per page.

**Findings**
- **B6-1, Confirmed, fixed (#297, PR #298). Wrong output.** A layer whose source no longer compiles keeps its last good program (`doc.ts:222`, `compileIR`), but its builders passed the broken source to the worker (`remote.field(prog, l.src, …)`). The worker failed to compile it, replied `error`, and `remote.ts:168` paused the program, so the canvas showed PROGRAM PAUSED for a typo while the main thread drew the last good frame. Reproduced by a new check in `scripts/ir-worker.ts` (628 vs 4234 dots, state paused). Fix: the editor sends the source the kept program was compiled from (`sourceOf`, `doc.ts:221`).
- **B6-2, Not reachable.** A reply for an older source in the same slot would be cached under an input signature that has no source in it (`remote.ts:157`). Slot keys carry the source (`guardKey`, `doc.ts:211`; `thumb|<src>` in the remix graph), and `slotFor` empties the cache when the source changes (`remote.ts:183`).
- **B6-3, Likely, data loss, owner decision.** Two tabs on MAKE each autosave their whole document to the same key (`store.ts:336`), and nothing listens for the other tab's save (`Editor.tsx:434` handles only the clipboard key). The last tab to save wins; the other tab's edits are gone on its next reload. MAKE is behind the `make` flag. Options: a `storage` listener that warns, or a per-tab lock.
- **B6-4, Not reachable.** The watchdog pauses the item the worker last announced (`remote.ts:144`), so a hang between two `start` messages would blame the previous program. The only work there is `compileUntrusted`, which is memoised and capped at 8192 characters.

### B7. Media: camera, mic and HAND mode

The shared camera stream: `src/media/stream.ts:28` (reference counted). A camera card's capture: `src/media/camera.ts:32` (explicit `CameraStatus`: `idle`, `starting`, `live`, `denied`, `error`), driven by `useCamera` (`src/media/useCamera.ts`). HAND mode: `src/vision/handPointer.ts:159`. The mic: `src/audio/engine.ts:247` (explicit `micState`: `idle`, `starting`, `live`, `denied`), driven by `useAudio`.

**States, the camera card**
- **idle**: no stream.
- **starting**: `acquireCamera` pending (the permission prompt).
- **live**: a stream with live tracks, frames grabbed per card frame.
- **denied**, **error**: shown as `camState` 3; a later start asks again.
- Invariants: `live` means the stream has a live track; a stopped capture holds no stream reference; the device light is on only while some consumer holds a reference.

**Transitions, the camera card**

| from | event | guard | to | side effects |
|---|---|---|---|---|
| idle | the card's `cam` control turns on | tab visible | starting | `acquireCamera` (prompt the first time) |
| starting | stream resolves | not stopped meanwhile | live | `<video>` plays |
| starting | stream resolves | stopped meanwhile (token changed) | idle | reference released at once |
| starting | `NotAllowedError` or `SecurityError` | | denied | |
| starting | any other error | | error | |
| live | `cam` off, tab hidden, unmount | | idle | reference released, tracks stop when it was the last |
| idle | tab shown | `cam` still on | starting | |
| live | every track ended (unplugged, permission revoked) | | error | reference released (B7-1 fix) |
| denied or error | `cam` off then on | | starting | |

**Transitions, the mic**

| from | event | guard | to |
|---|---|---|---|
| idle | `setMic(true)` | | starting |
| starting | stream resolves | still starting | live |
| starting | stream resolves | turned off meanwhile | idle (tracks stopped) |
| starting | any error | | denied |
| live or starting | `setMic(false)`, scope unmount | | idle |

**Persists:** nothing in storage. Browser permissions persist outside the page.

**Findings**
- **B7-1, Confirmed, fixed (#296, PR #298). Stuck UI.** Two parts. `acquireCamera` handed the shared stream to the next consumer even after every track ended, so with HAND mode holding it, toggling a camera card off and on got the dead stream again. And `grab()` never checked the tracks: an ended track stops new frames, `grab()` returned false forever, `status` stayed `live`, and the card showed its last frame as live. Reproduced by `scripts/media.ts` under a fake `getUserMedia` (`1 opened, same stream true`; `status live`). Fix: a dead stream is dropped on the next acquire (`stream.ts:31`), and a live capture whose tracks ended releases its reference and goes to `error` (`camera.ts:80`; the status change is heard after the frame, since a grab can run inside a React render).
- **B7-2, Likely, stuck UI.** The mic has no `ended` handler (`engine.ts:258`). Unplugging the mic or revoking its permission leaves `micState` at `live` with a silent analysis. Turning the mic off and on recovers.
- **B7-3, Likely, stuck UI.** HAND mode has no `ended` handler either. Its frame loop (`handPointer.ts:133`) waits for new video frames, which never come, and the status stays `live`. Turning HAND off and on recovers once no other consumer holds the dead stream (and with the B7-1 fix, a new acquire skips the dead one).
- **B7-4, Not reachable.** If every reference were released while the prompt is open and a new consumer then acquired, `acquireCamera` would open a second stream and the first would never stop. Consumers only release after their own acquire resolved (`camera.ts:60`, `handPointer.ts:164`), so the count cannot reach 0 while a stream is pending.
- **B7-5, Not reachable.** Mic on, off, on while `getUserMedia` is pending: the first stream to resolve while `starting` is kept, the other is stopped (`engine.ts:259`), so exactly one stream stays open.
