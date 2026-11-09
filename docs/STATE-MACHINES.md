# State machines

The app's explicit and implicit state machines: what states each one has, what moves it between them, what it keeps
across reloads and tabs, and which invalid states the code can reach. Written for the CP6 stabilise round. Line
numbers are from the PR that last touched a section; search for the named function if they drift.

Each machine lists where it lives, its kind (explicit: a status enum or reducer; implicit: booleans, refs, timers,
promises and storage keys that together act as state), its states and their invariants, a transition table, what
persists, and its known invalid states. A finding counts only with a code path and a sequence that reaches it:

- **Confirmed**: a check or probe reproduces it.
- **Likely**: a clear code path that no check reproduces yet.
- **Not reachable**: the path exists on paper, and the reason it can't happen is given.
- **By design**: looks wrong, but an owner decision or a check pins it.

Two sections, each kept by its own owner: A covers the app shell and data, B the cards, input and the editor.

## A. App shell and data

Findings at a glance, worst first. Severity: data loss, broken UI, wrong output, cosmetic.

| Id | Machine | Severity | Status | Issue | Fix |
|---|---|---|---|---|---|
| A2.1 | Chunk loading | Broken UI | Confirmed (`scripts/verify/appstate.ts`) | #300 | Fixed: offline never reloads |
| A2.2 | Chunk loading | Broken UI | Confirmed (`chunks` probe) | #300 | Fixed: each lazy part has a `LoadBoundary` |
| A5.1 | Likes client | Data loss (this browser's likes record) | Confirmed (`scripts/verify/appstate.ts`) | #301 | Fixed: storage listener and read-modify-write |
| A5.2 | Likes client | Wrong output | Likely | #302 | Left: needs the server to say whether the caller's like is counted |
| A5.3 | Likes client | Wrong output | Likely | #302 | Left: heals on the next day's visit |
| A8.1 | Global keys | Broken UI (stuck input) | Likely | #302 | Left: needs real input to confirm |
| A9.1 | Widget page SHARE | Cosmetic | Likely | #302 | Left |
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

Persists: shell history per tab (sessionStorage, validated on read: strings only, at most 256 characters, at most
100 entries); nothing else.

Findings:
- **A8.1, Likely, left.** Hold T, then switch windows (Alt+Tab) and let go of T there: the `keyup` never reaches the
  page, `tHeld` stays true (`CommandLayer.tsx:310`), and back on the page every pointer move scrubs the frozen clock
  until T is pressed again. A `blur` listener that clears `tHeld` would fix it; it needs real input to confirm.
- Not reachable: two shell commands at once. `pump` returns while one runs, and the loop picks up what was queued.

### A9. Share, LINK, REMIX and export

Mostly stateless: each action reads the theme, the clock and the card's data in the click, then loads its export code
(`src/components/widget/cardExport.ts`, `src/export/clipboard.ts`). Clipboard writes happen inside the click with a
pending `Promise<Blob>` (Safari refuses a write after an `await`); a refused copy falls back to a download, a refused
text copy to showing the URL in a toast. Links go through `withTheme` (the share-theme opt-in) and `withPondDay` (a
pond link carries its day). REMIX pushes `?make=code&p=…` (MAKE flag on), or opens the card in the editor.

The one stateful piece: `sharePNG` (`WidgetPage.tsx:119`), a PNG started on `pointerdown` so the share sheet opens
inside the click with the file ready.

Findings:
- **A9.1, Likely, left.** Press on SHARE, drag off and let go (no click), change the theme, then SHARE with the
  keyboard: the PNG from the first press is shared, in the old theme and at the old time. Cosmetic.
- Object URLs for downloads are revoked after 1 to 1.5 s; a slow save dialog doesn't need them (the download has
  started by then).

## B. Cards, input and editor

Owned by the cards, input and editor audit.
