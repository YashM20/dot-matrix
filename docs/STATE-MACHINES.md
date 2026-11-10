# State machines

The app's state machines, explicit and implicit, with the invalid states and transitions found in an audit (CP6, November 2026). An explicit machine has a status enum or a reducer. An implicit one is a set of booleans, refs, timers, promises or storage keys that together act as state.

Each machine lists where it lives, its states and their invariants, a transition table, what persists, and its findings. A finding is **Confirmed** when a test reproduces it, **Likely** when the code path is clear but no test reproduces it yet, and **Not reachable** when the code rules it out (the reason is given). Fixed findings name their PR.

Two sections, each kept by one owner: A covers the app shell and data, B covers cards, input and the editor. Line numbers are from the commit that last touched a section.

## A. App shell and data

(Written by the app shell audit.)

## B. Cards, input and editor

Findings at a glance:

| id | machine | severity | status | issue | PR |
|---|---|---|---|---|---|
| B7-1 | media: camera | stuck UI | Confirmed, fixed | #296 | #298 |
| B6-1 | editor and IR worker | wrong output | Confirmed, fixed | #297 | #298 |
| B6-3 | editor autosave | data loss (two tabs) | Confirmed, fixed | #304 | #PRNUM |
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

**Two tabs** (`src/components/editor/otherTab.ts`, since #304). Explicit: `useOtherTab.incoming`, the JSON another tab saved, or null. Nothing is locked or merged; each tab still autosaves its own document.

| from | event | guard | to | side effects |
|---|---|---|---|---|
| quiet | `storage` event on `dot480.editor.v1` | the value differs from what this tab would save now | changed | "Changed in another tab." with RELOAD and KEEP MINE, in a polite status region |
| quiet | the same event | an echo of this tab's own document, or the key cleared | quiet | |
| changed | RELOAD | the other version opens | quiet | this tab takes it with a fresh undo history; saving it back is an echo, so the other tab stays quiet |
| changed | RELOAD | it doesn't open | quiet | this tab keeps its document and says why |
| changed | KEEP MINE | | quiet | nothing else: this tab's next autosave replaces the other version |
| changed | another save from the other tab | | changed | RELOAD opens the newest one |

**Persists:** `localStorage['dot480.editor.v1']` (the document), `localStorage['dot480.editor.clip']` (the clipboard, shared across tabs through the `storage` event), the asset library. The worker's point store and the program cache live per page.

**Findings**
- **B6-1, Confirmed, fixed (#297, PR #298). Wrong output.** A layer whose source no longer compiles keeps its last good program (`doc.ts:222`, `compileIR`), but its builders passed the broken source to the worker (`remote.field(prog, l.src, …)`). The worker failed to compile it, replied `error`, and `remote.ts:168` paused the program, so the canvas showed PROGRAM PAUSED for a typo while the main thread drew the last good frame. Reproduced by a new check in `scripts/ir-worker.ts` (628 vs 4234 dots, state paused). Fix: the editor sends the source the kept program was compiled from (`sourceOf`, `doc.ts:221`).
- **B6-2, Not reachable.** A reply for an older source in the same slot would be cached under an input signature that has no source in it (`remote.ts:157`). Slot keys carry the source (`guardKey`, `doc.ts:211`; `thumb|<src>` in the remix graph), and `slotFor` empties the cache when the source changes (`remote.ts:183`).
- **B6-3, Confirmed, fixed (#304, PR #PRNUM). Data loss.** Two tabs on MAKE each autosave their whole document to the same key (`store.ts:336`), and nothing listened for the other tab's save (`Editor.tsx:434` handled only the clipboard key). The last tab to save won; the other tab's edits were gone on its next reload, without a word. The owner chose a warning over a lock: the two-tab machine above. `scripts/editor-tabs.ts` (new, run by verify) plays the second tab through `storage` events in Node.
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
