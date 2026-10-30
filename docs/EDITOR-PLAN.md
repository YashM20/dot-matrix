# EDITOR-PLAN: one editor for MAKE

> **Status (2026-10-29):** E0 (the vertical slice, §8), E1 (tests + cleanup, §8.1), E2 (selection, §8.2), E3 (editing on
> canvas, §4.2, §8.3) and E5 (share, §7.4, §8.4) are built. MAKE is one
> editor in `src/components/editor/`. The four old tabs (TUNE · COMPOSE · CODE · DRAW) are gone, and so are
> their screens. Their URLs still work and open the editor on the matching tool. What the editor still uses
> from the old code is listed in §7.3.
>
> **Why:** the owner's verdict on the four-tab MAKE: "changing layout/workspace and draw tabs isn't the proper
> way — make it a full Figma-like editor, not the current experience." It must also work natively on a phone.

## 1. Research, short

| Editor | What we take | What we leave |
|---|---|---|
| **Figma** (desktop) | A tool bar of a few modal tools: Move V, Frame F, Pen P, Text T, Hand H / hold Space. Pages and layers on the left (with Assets as a second tab), an infinite canvas, and a contextual right panel: Design / Prototype / Dev Mode. Frames are top-level containers. Clicking a child of a top-level frame selects the child. Enter goes into a frame, ⇧Enter back out. ⇧1 fits, ⇧2 zooms to the selection, ⇧0 is 100 %. Ctrl/⌘+wheel and pinch zoom, the wheel pans. Undo is one step per gesture. | Components and instances, constraints, auto layout: our cards are fields, not boxes (§9). |
| **Penpot** | The same frame / layer / inspector split, and the document as open data (SVG / JSON). The inspector has a code view of the selection. | — |
| **tldraw / Excalidraw** | Only a few tools, each with a single-letter key. A floating tool bar. One finger uses the tool and two fingers pan or zoom. The camera is a plain `{x, y, z}` with zoom about the pointer. Tools return to Select after one use. | Freehand vector strokes: our "pen" paints whole dots on a lattice. |
| **Framer** | Code as a first-class layer: the code panel sits beside the canvas and you share a link to it. | — |
| **Figma for iOS / Android**, iPad editors (Procreate, Linearity) | A full-screen canvas. A small top bar (back, title, undo / redo, share). A floating bottom tool bar. Panels are bottom sheets with detents (peek / half / full) and a drag handle. Every target is 44 px, nothing works only on hover, and pinch-zoom applies to the canvas only. | Long-press menus (roadmap §10). |

**Synthesis:** a few modal tools, a canvas of frames, a selection-driven inspector. On a phone the same model
becomes a full-bleed canvas, a dock and sheets. Each old MAKE tab becomes a *tool* or a *panel* of the one
editor, not a separate place.

## 2. Wireframes

Desktop (1440×900), under the site bar:

```
┌ DOT/480 · EXPLORE  MAKE  ABOUT ··························· DISPLAY ▾ ┐
├──────────────────────────────────────────────────────────────────────┤
│ [▶V][✋H][#F][✎B][T T][</>C] │ [↶][↷] │     UNTITLED     │ ? │ − 69% + │ SHARE │ EXPORT │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ LAYERS│ASSETS │ · · · · · · · · · · · · · · · · · ·  │ DESIGN ANIMATE CODE EXPORT
│ ▾ # level 03  │ · level 03 ·  afterlight ·  ripple · │ FRAME         │
│   REF #11 …●  │ ·┌────────┐ ┌────────┐ ┌────────┐ · │  NAME  X  Y   │
│   REF #10 …●  │ ·│ dots   │ │ dots   │ │ dots   │ · │  SIZE COLS ROWS
│ ▸ # afterlight│ ·│ (engine│ │        │ │        │ · │ DOTS          │
│ ▸ # ripple    │ ·└────────┘ └────────┘ └────────┘ · │  roundness ─○─│
│               │ · · · · (pasteboard: a dot field) · │  size, density│
│               │ · ┌──────┐◉ selection: 1px red 60% │ DATA (sliders)│
│               │ · │frame │  corner handles = dots   │ LAYERS · ARRANGE
│               │ · └──────┘◉                         │               │
└───────────────┴──────────────────────────────────────┴───────────────┘
```

Phone (390×844, touch), full screen over the site:

```
┌──────────────────────────────┐
│ ← UNTITLED    ↶ ↷  31% ⇪  +  │  top bar: leave, undo/redo, zoom menu, share, assets
│ · · · · · · · · · · · · · ·  │
│ ·  level 03                  │
│ · ┌──────────────┐ ·  ·  · · │  full-bleed canvas
│ · │  frame       │           │  1 finger: tool / pan empty canvas / tap selects
│ · └──────────────┘ ·  ·  · · │  2 fingers: pinch zoom + pan
│ · · · · · · · · · · · · · ·  │
│  ╭──────────────────────────╮│
│  │ ≡ │ ▶  #  ✎  T  </> │ ☰  ││  floating dock: layers │ tools │ inspector
│  ╰──────────────────────────╯│
└──────────────────────────────┘
        ┌──────── ═══ ────────┐   bottom sheet (drag handle; detents 36 / 60 / 90 %)
        │ DESIGN ANIMATE CODE EXPORT  × │  the selection is kept in view above it
        │ …the same inspector…          │
        └───────────────────────────────┘
```

## 3. Document model

```ts
EditorDoc  { kind: 'dot480.editor', v: 2, name, frames: EditorFrame[] }          // src/components/editor/doc.ts
EditorFrame { id, x, y /* world px at 100 % */, theme: 'dot480' | 'deerflowMosaic', hidden?, source?, card: StudioCard,
              locked?, locks?: layerId[], groups?: LayerGroup[] }                   // v2 (E2)
LayerGroup { id, name, layers: layerId[] /* adjacent in the stack, top → bottom */ }
StudioCard  (unchanged, src/components/studio/doc.ts): grid, style, layers, data, controls, bindings,
            states, machine, transitions, timeline, reference?, animated
StudioLayer = ir | text | sites | preset-layer | spec | paint (new)
PaintLayer  { kind: 'paint', lattice, cols, rows, cells /* base64 u8, one per lattice cell */ }
```

- **A frame is a Studio card.** The layered document from COMPOSE is the frame model unchanged. Its compile,
  playback, adapters (spec v1 / v0), validation and library all work as before, and every frame renders through
  `compileCard → sampleLayers → renderCanvas` (Field → Sampler → Renderer).
- **`paint` is the one new layer kind.** It holds DRAW's matrix as a layer: whole cells on the layer's lattice.
  A resized frame crops or pads the cells and never stretches them. While a stroke is in progress the field reads
  `PAINT_LIVE` (a module map), and the finished stroke becomes one undo step.
- **History** is the Studio's `commit / undo / redo`, now generic (`History<T>`), over the whole document.
  Typing and sliders coalesce by tag. Gestures (drag, resize, stroke) use `begin / live / end`, so each gesture
  is one undo step.
- **Groups and locks (v2)** live on the frame, not in the card: a card stays a flat stack of fields, so compile,
  export and the adapters never see them. A layer is in one group at most (no nesting). `tidyGroups` runs after
  every card edit: members stay adjacent at the place of the topmost one, ids of removed layers go, empty
  groups go.
- **Persistence:** autosave to `localStorage['dot480.editor.v1']` (the slot keeps its name; it now holds v2).
  `migrateDoc` loads a v1 document (a file, the autosave) as v2: v1 frames have no groups or locks, so only
  the version changes. A newer version, or malformed groups / locks, are rejected with a reason. The first visit is seeded with level-03,
  afterlight and the ripple program, plus the last Studio card if there was one. DOWNLOAD JSON and OPEN FILE
  read and write documents. OPEN FILE also takes a Studio card or a card spec v1, and adds it as a frame.
  Ctrl+S saves the selected frame to the Studio library (ASSETS · SAVED).

## 4. Tools

| Tool | Key | Does |
|---|---|---|
| Move | V | Click selects the layer under the pointer (its lit dots, sampled alone). Empty frame area selects the frame. Drag moves the frame, or a text / sites layer in whole cells. Corner handles resize the frame in cells (text, sites and paint stay put). A mouse drag on empty canvas draws a marquee (touch: pans; see §4.1). |
| Hand | H, hold Space, middle button | Pan. |
| Frame | F | Drag out a new card (cells at 2.25 px, the TILE pitch). A click makes a 144² tile. |
| Draw | B (E = eraser, `[` `]` = size, I = eyedropper) | Paints into the selected or topmost paint layer. Makes one if needed (lattice 2 on TILE frames), or makes a drawing frame on empty canvas. Right-drag erases. INK sets the dot value; I (or Alt-click, or PICK) takes it from a painted dot. |
| Text | T | Click a frame: a text layer at that cell (5×7 on a 2× lattice), typed into on the canvas at once (§4.2). |
| Code | C | Click a frame: a Field IR layer, and the CODE tab opens. Empty canvas: a new code frame from the first example. |

Also: Enter / ⇧Enter (into the frame's layers / back up), Esc (back to Move, then up, then deselect),
Delete, Ctrl+D, Ctrl+] / [ (layer order), Ctrl+⇧H (hide), arrows (nudge, ⇧ ×10), ⇧1 / ⇧2 / ⇧0, Ctrl+± / wheel,
and `?` for the list (§4.1 has the E2 keys). The editor's keys are caught in the capture phase so they don't also trigger the board's
global keys (hold T = time machine). `X`, `` ` `` and ⌘K still reach the command layer.

### 4.1 Selecting many (E2)

- **The selection** is frames, or layers of one frame, never both (`Sel { frame, layer?, more? }`: the primary
  is what the inspector shows; `more` holds the rest at the same level). ⇧-click (LAYERS: ⇧ / ⌘ / Ctrl-click)
  adds or takes out. A layer of another frame turns the selection into frames.
- **Marquee:** a drag on empty canvas selects the frames it touches (not hidden, not locked); ⇧ adds.
  Ctrl/⌘-drag on a frame marquees its layers by their lit dots; Ctrl/⌘-click picks a layer even inside a
  group. Ctrl+A: every frame, or every layer of the frame whose layers are selected.
- **Many at once:** a drag on any selected frame moves them all; the dashed box around many frames has corner
  handles that resize them together about the opposite corner (whole cells, 8…512 a side; reference frames
  have no handles). Text / sites layers move together in whole cells. Arrows nudge all of them.
- **Alt-drag** moves a copy (made in place when the drag starts); Ctrl+D duplicates beside the selection.
- **Smart guides:** a dragged frame (or group of frames) snaps its edges and centre to the other frames' and
  to equal spacing between two neighbours, within 6 screen px; the guides and the gaps to the nearest
  neighbours show while dragging. Ctrl/⌘ held: no snapping. ⇧: 1 px steps.
- **Align / distribute** (DESIGN with many selected, or Alt+A / D / W / S / H / V, Alt+⇧H / V): frames by
  their boxes, layers by their lit dots in whole cells (one layer aligns to its frame). Distribute needs 3.
- **Groups** (Ctrl+G / Ctrl+⇧G) are layers of one frame. A click on a member selects the group; a second
  click drills in to the layer. Enter goes in, ⇧Enter / Esc go up (layer → group → frame). LAYERS shows a
  group row (fold it, rename it, hide or lock all of it) with its layers under it. Ctrl+] / [ move a group
  as one unit.
- **Lock** (Ctrl+⇧L, the ◆ in a LAYERS row, LOCK in DESIGN): a locked frame lets clicks, marquees and Ctrl+A
  through and is not dragged or resized; a locked layer is not hit. LAYERS (and the frame's label) still
  select it.
- **Copy / cut / paste** (Ctrl+C / X / V): the clip (`dot480.clip`, JSON) goes to memory, to
  `localStorage['dot480.editor.clip']` (any tab of this browser, a later visit) and to the system clipboard
  as text (the copy event, else `navigator.clipboard` when the page may). A paste takes a dot480 clip from
  the system clipboard first, else this browser's last copy. Frames paste where they were, stepped 24 px
  down-right until none sits exactly on a frame (a cut pastes back in place). Layers paste on top of the
  selected frame (else the frame they came from, else a new frame like it), text / sites stepped 2 cells the
  same way; their groups come with them. Every id is new.
- **One undo step** per command (duplicate, delete, paste, cut, group, ungroup, lock, align, distribute) and
  per gesture (a group move, an Alt-drag with its copies, a group resize). A run of nudges coalesces.
- **Phone:** a selection bar above the dock: SELECT · ALL · DUP · GROUP (UNGRP) · COPY · PASTE · DEL. SELECT is
  a mode rather than a long press, so it never competes with a pan (UX-PLAN §10, *scroll first*): while it
  is on, a tap adds to the selection or takes out, a one-finger drag on empty canvas draws a marquee, and
  two fingers still pan and zoom; LAYERS rows add too. Off, one finger pans as before.

### 4.2 Editing on canvas (E3)

- **Handles of a layer.** One selected sites layer shows its own handles: a ring has a radius handle on the ring
  and a sweep handle where its arc ends (red); a disc a radius handle; a line one at each end. Radii and ends
  land on whole cells (1…512). The sweep snaps to the ring's own site step (`2π / n`, `n` = `dotRing`'s count),
  so an arc always ends on a dot of its full-ring track, from one step to the full ring. START ° / SWEEP ° are
  also in DESIGN.
- **Spec layers have a place.** A card spec v1 layer with a place of its own moves in whole card cells (drag,
  arrows, align): sites move their points, text its anchor (on a lattice: its origin), a generator or an IR
  field placed into `bounds` its origin. A full-card field and a raster don't move. A spec IR field's selection
  box is its declared bounds (its whole lattice grid when it has none), with four corners that resize the bounds
  in whole layer cells (≥ 1×1; the opposite corner stays). DESIGN · PLACE has COL ROW W H, the origin and WHOLE
  CARD (drop the bounds); the JSON follows every change made elsewhere. Resizing the frame still leaves spec
  layers to the card (only text, sites and paint keep their place on screen).
- **Text in place.** A double-click on a text layer, Enter on the selected one, or (touch) a tap on the selected
  one types into it on the canvas; so does the Text tool. A text layer or a spec text with literal `text`
  qualifies (a bound number does not). One input, always mounted and invisible, takes the keys (a tap focuses it
  in its own handler, so a phone opens its keyboard); the letters are the frame's own dots, redrawn through
  `textAt` / `T.big` as you type, upper case, ≤ 64. The caret and the selected range are drawn over the frame in
  the middle of a glyph gap (never across a glyph); a press in the text moves the caret. Enter, DONE, a press
  elsewhere or a blur commit the session as **one undo step**; Esc cancels it. A text typed empty is removed; a
  text the Text tool just made and left empty leaves no layer and no undo step. On a phone the text being typed
  pans into the top third, above the keyboard. Locked layers and frames are not typed into.
- **The quick bar** floats over the one selected layer (above it, below when there is no room, inside the canvas;
  on a phone above the selection bar, 44 px targets). It holds the kind, TONE (a tap steps through the tones, ⇧
  back; spec and reference layers also have OWN), LATTICE − / + on the ladder for code, text and spec IR / text /
  generator layers (a spec text anchor or IR bounds are rescaled so the layer keeps its place on the card),
  SIZE − / + for sites (`SITE_SIZES`), EDIT / DONE for text, and INK − / + with PICK for paint. Each toggle is one
  undo step. Its buttons never take focus, so DONE works while typing. No bar on locked layers and frames.
- **The eyedropper** (I, PICK in the quick bar and in DESIGN · BRUSH, Alt-click while drawing): the next press
  takes the ink of the painted cell under it (the selected paint layer first, else the topmost one lit there) and
  rounds it onto the INK ladder (.2 … 1); an empty cell leaves the ink as it was. It never paints and is not a
  document edit. Esc stops it.

## 5. Panels

- **LAYERS:** frames (top of the canvas first), each with its layers top to bottom. Each row has an eye, a kind
  badge and an `ERR` flag. Double-click or F2 renames a row. To reorder, drag the grip (pointer events, so
  touch works too) or press Alt+↑/↓.
- **ASSETS:** search; START (blank tile / wide / legacy card, a drawing, a photo dithered into a paint layer);
  CODE (the eight examples); SAVED (the Studio library); then every board, folded except the first.
  Thumbnails are sampled once by the engine, when they scroll into view. Clicking an asset adds a new frame,
  selects it and brings it into view.
- **DESIGN:**
  - Nothing selected: the document (name, fit, shortcuts, file).
  - A frame: name / position / size, DOTS (roundness as the squircle exponent, size, density; jitter and
    quantize under *More*), theme, ANIMATED, DATA sliders (the card's bindings), its layers, and ARRANGE.
    A reference frame (a preset) offers MAKE EDITABLE, which re-imports it through card spec v1.
  - A layer: name / tone / blend / lattice / visible, then fields for its kind: text, sites, paint (brush, ink,
    invert, clear, TRACE A PICTURE) or spec JSON.
- **ANIMATE:** the selected frame's timeline (play, scrub, length), the enter / change / exit tracks (mask,
  ease, ms, each drawn as small dot cards), and states (preview one, add one, edit its data). While this tab is
  open, that frame previews the timeline at *t*. Everywhere else frames run live.
- **CODE:**
  - A code layer: the Field IR editor (line:col errors; the last good program keeps drawing), START FROM AN
    EXAMPLE, the share link (`?make=code&p=…`, COPY LINK, its length and codec), and `data.*` sliders.
  - A frame: its code layers, + CODE LAYER, the frame as card spec v1 (read-only), a little like Dev Mode, and
    its LINK LINEAGE (E5, §7.4).
  - Both, and nothing selected: REMIX, the remix graph (E5): the examples and the programs this browser shared or
    opened, in dots, each under the program it came from; a click on a node opens it.
- **EXPORT** (the selected frame): PNG / SVG / HTML at the current *t*; a clip of the timeline
  (APNG / GIF / WebM / MP4, fps, scale, cancel); plotter SVG, Studio JSON, card spec v1, spec v0. E5 adds LINK
  (a frame, the selected frames or the document as a link, §7.4; with nothing selected EXPORT shows only this),
  and two folds that load only when opened: DEVICES (the frame through `toDevice` on every device profile;
  EXPORT ALL DEVICES writes a PNG per profile at its own resolution and the plotter's pen plan) and QUALITY (the
  scorecard: gates G1–G3, G5 and the metrics, as `pnpm fidelity`; and the bar sheet, as `pnpm snap --bar`).

## 6. How each old tab maps in

| Old tab | Now | Entry (`mode`) |
|---|---|---|
| TUNE: preset gallery, preview, style controls, data, photo, exports | ASSETS (presets per board, search) → a frame. DESIGN for a frame (roundness / size / density / jitter / quantize / theme / animated / DATA). Photo → ASSETS · Photo (a dithered paint layer, unquantized like every photo). EXPORT. | left = ASSETS, right = DESIGN, Move |
| COMPOSE: layered card, layers, inspector, timeline, states, export | Each frame *is* a Studio card. LAYERS, DESIGN for the layer, ANIMATE, EXPORT. X-ray "Open in compose" adds the card as a frame. | left = LAYERS, right = DESIGN |
| CODE: Field IR editor, share links, examples, data sliders | The Code tool and the CODE tab. A shared link (`?make=code&p=…`) imports as a frame. A reload re-selects that frame instead of adding a copy (frames remember `program:<hash>`). Bad links show a banner, and an invalid program shows its error and is not run. | Code tab open (the inspector sheet on a phone) |
| DRAW: paint dots, eraser, brush size, undo, trace, JSON | The Draw tool on a paint layer (brush, ink, eraser, `[` `]`, undo per stroke). Trace → the paint layer's TRACE A PICTURE. Export → EXPORT. | Draw tool; selects a paint layer if there is one |

## 7. URLs and links

### 7.1 Scheme
- MAKE is `?make` (canonical) and opens the editor as it was left.
- `?make=compose|code|draw` open it on that tool or panel. `?make=tune` is now written as plain `?make`.
- `?make=code&p=<program>` imports the program as a frame and selects its code layer.
- Every old link still resolves through `TAB_ALIASES` (`src/site/views.ts`), checked by `scripts/verify.ts`
  (ux:*):
  - `?tab=workspace|studio|dots|draw`, any case;
  - `?tab=dots&p=…` and a bare `?p=…`;
  - `/<board>/?tab=studio`.

- `?make&d=<link>` (E5) opens a frame or document link (§7.4) on any tool; `urlForView` drops `d` when leaving MAKE.

### 7.2 Hand-offs
- The command layer's *Open in compose* / x-ray card action calls `useEditor.insertPreset(id)` (lazy import)
  and then opens MAKE · COMPOSE.
- *Remix* still pushes `?make=code&p=…`, which the editor imports.

### 7.3 Old code
The old screens were deleted in E1: `studio/` (`Studio`, `StudioCanvas`, `Inspector`, `LayerList`,
`Machine`, `SidePanel`, `Timeline`, its store and the scorecard sheet), `draw/` with `hooks/useDrawBoard`, and
the playground panels. What stays, because the editor (or the site) uses it:
- `studio/doc.ts` (the frame model: card document, compile, `paint` layers, history, library),
  `studio/adapter.ts` (card spec v1 / v0) and `studio/playback.ts` (timeline, states). Every frame and every
  CODE layer compiles through `compileCard` in `studio/doc.ts`; the editor has no compile entry of its own;
- `dwitter/`: `CodeEditor`, `EXAMPLES`, `program.ts` and `gallery.ts` (with `scripts/dots.ts`, `scripts/c10.ts`);
- (`playground/store.ts`, whose only use was the boards' `theme`, went in T4b: the site theme is `src/site/theme/`);
- `lib/share`, `dotifyUpload`, and the export module (`recordClip`, `plotterSVG`, `stillPNG`).

`dwitter/DotsRepl.tsx` (the old CODE screen) and `dwitter/RemixGraph.tsx` were deleted in the round-2 cleanup
(nothing imported them). E5 restored the remix graph as `editor/Lineage.tsx` (its helpers `graphLayers`, `layoutGraph`,
`nodeAt` live in `dwitter/gallery.ts`) and the scorecard sheet as `editor/quality.ts`. The Studio's machine panel (E4)
can be recovered from git at `c619dae`.

### 7.4 Frame and document links (E5)
- **SHARE** (top bar, both layouts): a selected code layer on a share grid → its program link (`?make=code&p=`);
  selected frames → a frame link (one) or a link of them; nothing selected → the whole document. Copied when the
  page may, else EXPORT · LINK opens with the link in a field to copy by hand. EXPORT · LINK has FRAME LINK /
  LINK n FRAMES and DOCUMENT LINK.
- **Format** (`src/components/editor/link.ts`): `{ v: 1, k: 'f' | 'd', n: name, f: frames, p?: parent }`, packed by the
  CODE link's codec (`packJSON` / `unpackJSON` in `lib/share`: deflate-raw + base64url, `b…` plain when shorter).
  Frames go without ids and `source`, placed from the top-left of their block. Decoding checks them as a document
  (`validateDoc`) and evaluates nothing.
- **Cap:** 12,000 characters packed (under the host's 14 kB URL limit with the origin and path) and 1 MB inflated.
  Past it, the reason (its length) and DOWNLOAD JSON.
- **Opening:** the frames come in as one block in a free spot, one undo step, selected and in view. Each gets
  `source: 'link:<id>'` (the id: FNV-1a over the frames, kind and name, keys sorted), so a reload, Back or the
  same link again re-selects them instead of adding copies; shared again unchanged they make the same link. A bad
  link shows the banner and adds nothing.
- **Lineage:** frames a link opened and then changed make a link whose `p` is that link's id. This browser keeps
  the links it made or opened (`localStorage['dot480.editor.links']`, the newest 40), and CODE · LINK LINEAGE shows
  the chain. Programs work the same way through `parent` (`shareable` reads the frame's `program:<hash>`), and
  every program link made or opened goes into the remix gallery (`dot480.dots.gallery`) that CODE · REMIX draws.

## 8. What E0 built (this branch)

`src/components/editor/`:
- `doc.ts`: the model, edits, paint, hit tests, share, validation and storage.
- `store.ts`: zustand; history, gestures, camera, panels.
- `render.ts`: frame and pasteboard drawing.
- `Canvas.tsx`: pan / zoom / pinch, tools, selection, handles, the rAF loop.
- `Panels.tsx`: LAYERS and ASSETS.
- `Inspector.tsx`: DESIGN / ANIMATE / CODE / EXPORT.
- `exporters.ts`, `ui.tsx` (dot-drawn tool icons, fields) and `editor.css`.

Also:
- `paint` layers and the generic history in `studio/doc.ts`;
- the MAKE section of `App.tsx`;
- `MODE_LINES` / canonical `?make` in `views.ts`;
- the command layer hand-off.

**Render rules held:** every frame, thumbnail, tool icon, ease curve and even the pasteboard grid is a field
sampled by the engine and drawn by the Canvas renderer. Frames use Canvas because they are > 2,000 dots and
animate (DESIGN.md). The rAF loop only redraws frames that changed, animate (≤ 30 fps) or are being
previewed. It skips frames that are off screen and carries over to the next tick after ~24 ms of work.
Resolution follows zoom in power-of-two steps, so panning and pinching are pure CSS transforms.

**Phone audit fixes:** these come from the audit of the old MAKE modes, and are checked in E0:
- every editor target on a phone is ≥ 44 px, and no editor text is under 10 px;
- fields are 16 px at `(pointer: coarse)`, so iOS does not zoom on focus;
- the full-screen editor uses `dvh` (with a `vh` fallback) and an absolutely filled canvas, so it does not
  jump with the iOS toolbar;
- ASSETS shows names at once, and thumbnails draw only when they scroll into view, from a queue at ≤ 6 ms
  per frame (boards stay folded except the first);
- the editor chunk has its own loading fallback.

**Accent:** red appears on the active tool, the selection ({colors.hairlineActive}), resize handles, RECORD,
DELETE and errors. Hover is grey.

### 8.1 What E1 added

- `src/components/editor/input.ts`: the input logic without React, moved out of `Canvas.tsx`, `Editor.tsx`
  and `store.ts` unchanged: tool keys (`KEY_TOOL`), where each old mode lands (`MODE_ENTRY`, `paintTarget`,
  `codeTarget`), camera maths (`zoomCam`, `pinchCam`, `fitCam`) and gesture geometry (`resizeByHandle`,
  `dragFramePos`, `dragCells`, `draftFrame`).
- `scripts/editor.ts` (Node, in `pnpm verify`): doc edits, paint encode, resize anchoring from every corner,
  hit tests, camera, gestures, tool keys and mode entries for every old link, history (gestures, tag
  coalescing, cancel, the 100-step cap) and storage.
- `scripts/editor-browser.ts` replaces `studio-browser.ts` and `dots-browser.ts`. It runs on desktop
  (1440×900) and on a touch phone (390×844), and serves `dist/` itself. The phone pass checks taps, pans,
  moves, pinch, the dock tools, touch resize, sheets at every detent (the top bar and the sheet's tabs stay
  uncovered, the selection stays in view), and the site tab bar coming back on leave. It shares its CDP
  harness (`scripts/lib/cdp.ts`).
- The old screens are deleted (§7.3).

### 8.2 What E2 added

- `select.ts` (React-free): the selection set (`selFrames`, `selLayers`, `toggleSel`, `validSel`,
  `selectAll`), group selections (`selGroup`, `clickLayer`), the marquee (`marqueeFrames`, `marqueeLayers`),
  the selection's box and `resizeGroup`, `alignDeltas` / `distributeDeltas` with `arrangeFrames` /
  `arrangeLayers`, and `snapBox` (guides and gaps).
- `clip.ts`: the clip (`clipOf`, `clipToJSON` / `clipFromJSON`, checked like a document, `asClip`) and
  `pasteClip` (new ids, paste offsets, the frame limit).
- `actions.ts`: the commands the keys, the inspector and the phone bar share, one `edit` each.
- `doc.ts`: v2 (`groups`, `locks`, `locked`), `migrateDoc`, `tidyGroups`, `unitsOf`, `groupLayers` /
  `ungroup`, `lockFrames` / `lockLayers`, `copyFrames` / `copyLayers` / `duplicateFrames`, `shiftLayers`,
  `removeFrames` / `removeLayers`, `cloneFrame` (groups and locks follow the new layer ids).
- `Canvas.tsx`: marquee, ⇧-click, group move / resize, Alt-drag, guides and gaps, locks. `Panels.tsx`:
  group rows, ⇧-click rows, lock buttons. `Inspector.tsx`: the SELECTION / GROUP panel (align, distribute,
  group, duplicate, copy, paste, lock, delete). `Editor.tsx`: the keys, the copy / cut / paste events and
  the phone's selection bar.
- Tests: `scripts/editor.ts` grew from 56 to 94 checks; `scripts/editor-browser.ts` has an E2 pass on desktop
  and on the phone.

Not in E2 (left for later): nested groups; dragging a layer out of a group in LAYERS (it stays in its group;
ungroup first); a layer marquee on touch; pasting plain text or images from the system clipboard.

### 8.3 What E3 added

- `direct.ts` (React-free): `siteHandles` / `dragSiteHandle`, `ringCount`; `hasBounds`, `specBounds`, `specBox`,
  `resizeSpecBounds`, `layerBox`; `editableText`, `textOf`, `withText`, `textGeo` (carets in glyph gaps) and
  `caretAt`; `tonesFor`, `stepTone`, `latticeOf`, `nextRung`, `stepLattice`, `stepSize`; `inkAt`, `inkStep`.
- `typing.ts`: the typing session (`startTyping`, `typeText`, `placeCaret`, `commitTyping`, `cancelTyping`) over
  the store's gesture (`begin` / `live` / `end`), so one session is one undo step.
- `OnCanvas.tsx`: the quick bar and the in-place input with its caret. `doc.ts`: `nudgeSpec`; `movable` and
  `nudgeLayer` cover placed spec layers. `store.ts`: `picking`, `typing`.
- `Canvas.tsx`: the site and bounds handles, double-click and tap-to-type, the caret press, the eyedropper, and a
  touch `pointerdown` that cancels its compatibility mouse events (they would blur the text being typed).
  `Editor.tsx`: Enter types, I picks, Esc stops a pick; the shortcut list. `Inspector.tsx`: START ° / SWEEP °,
  PICK INK, the spec PLACE fields, the spec JSON kept in step.
- Tests: `scripts/editor.ts` adds `editorE3Checks` (30 checks, in `pnpm verify`); `scripts/editor-browser.ts` has
  an E3 pass on desktop and on the phone, and its Text tool checks now type on the canvas.

### 8.4 What E5 added

- `link.ts` (React-free): the frame / document link (`linkPayload`, `encodeLink` / `decodeLink`, `linkId`, `linkUrl`,
  `openLinkIn`, `linkedFrames`) and the lineage registry (`recordLink`, `loadLinks`, `lineage`). `lib/share`: the codec as
  `packJSON` / `unpackJSON` (program links use it, their format unchanged), `hashText`, `isHash`. `store.ts`: `openLink`,
  `link` (the last one made). `actions.ts`: `shareSel`, `framesLink`, `programLink`, `knownParent`, `copyText`. `doc.ts`:
  `shareable` gives a parent.
- `Lineage.tsx`: REMIX (the old `RemixGraph`, restored from `f9bafb2`: the graph in dots, a click opens a program, your
  programs listed with their parents, CLEAR MY PROGRAMS) and LINK LINEAGE.
- `devices.ts` (React-free): `deviceFrames` (every `DEVICES` profile through `toDevice`; previews show the TRMNL at ¼),
  `devicePixels`, `exportScale`, `plotterPlan`. `quality.ts`: the old `studio/sheet.ts` (`c619dae`): `drawBarSheet`,
  `scoreCard`. `Review.tsx`: the DEVICES and QUALITY folds, one lazy chunk fetched when a fold opens (`WhenOpen` in
  `Inspector.tsx`).
- `Editor.tsx`: `?make&d=` opens once per page load (the frames' `source` dedupes reloads and Back); SHARE as in §7.4.
  `views.ts`: `d` belongs to MAKE.
- Tests: `scripts/editor.ts` adds `editorE5Checks` (21 checks, async, in `pnpm verify`); `scripts/editor-browser.ts` has an
  E5 pass on desktop (a link made, opened once, reload, Back, lineage, the document link, every device exported,
  quality, the cap, a corrupt link, the remix graph) and on the phone (SHARE, open, reload, Back, EXPORT · LINK /
  DEVICES / QUALITY in the sheet). The phone's SHARE check now expects a frame link.
- Two traps found on the way: the site builds with the React Compiler, which memoizes a `useMemo` by what its
  callback reads, so a storage read keyed only by a `version` in the deps array never refreshes (the stamp must
  be an argument: `galleryAt(version)`); and `navigator.clipboard.writeText` can stay pending (an unfocused page,
  an unanswered prompt), so `copyText` gives up after 1.5 s and nothing waits on it.

Not in E5 (left for later): `navigator.share` (E6); a short-link service (links stay self-contained, so a big
document is a file, not a link); frame lineage drawn as a graph (it is a list); a document link that replaces the
canvas (it adds its frames).

Not in E3 (left for later): a start handle for arcs (START ° is in DESIGN), dragging the centre of a ring apart
from the layer (the layer drag does it), handles for generator params and raster windows, word selection on a
double-click (it selects all), and text typed in place across several lines (the 5×7 text is one line).

## 9. Decisions

- **Frames are cards, not boxes.** There is no nesting of frames, auto layout or constraints. A card is a grid
  of dots, and its layout lives in cells (`layout.ts`). Groups inside a card are roadmap (§10).
- **Hit testing is by dots.** A layer is "under the pointer" when one of its own lit dots is. Its selection box
  is the bounds of its lit dots, so a full-card field selects the whole card and a word selects just the word.
- **Moving snaps to whole cells.** Dragging a text / sites layer moves it in whole cells, so dots stay on the
  grid (DESIGN.md, *drag scrubs whole dot columns*). Frames snap to 4 px (⇧ for 1 px).
- **On touch, drag pans until you select.** One finger on an unselected frame pans rather than moving it.
  Once the frame is selected, the same drag moves it. A tap selects on release, so a pan never changes the
  selection.

## 10. Roadmap

| Phase | Scope |
|---|---|
| **E1 · tests + cleanup** (done, §8.1) | `scripts/editor.ts` in `pnpm verify`; `scripts/editor-browser.ts` (desktop + touch) replaces `studio-browser.ts` / `dots-browser.ts`; the old screens are deleted. Their CSS (`.pg-*`, `.st-*`, `.dw-layout`, `.draw-*`) goes with the CSS tokens pass (T0). |
| **E2 · selection** (done, §4.1, §8.2) | Marquee and multi-select (⇧-click), group / ungroup layers inside a frame, alignment and distribute, copy / paste (frames and layers, also between tabs), Alt-drag duplicate, smart guides and spacing between frames, lock. |
| **E3 · editing on canvas** (done, §4.2, §8.3) | Direct handles for sites (ring radius / sweep, line ends), text editing in place, lattice / tone quick toggles on the canvas, layer bounds for spec layers, eyedropper for the paint ink. |
| **E4 · animate** | State-machine edges (the old Studio's machine panel, recoverable at `c619dae`), bindings with sources (LFO, clock, pointer, fixtures), a preview / prototype mode that fires press / release edges, and a real multi-track timeline strip under the canvas on desktop. |
| **E5 · share** (done, §7.4, §8.4) | A link for a whole frame or document (deflated JSON, the CODE link's codec, a size cap), remix lineage (the old RemixGraph) in CODE, export of every device profile (`toDevice`) in EXPORT, the scorecard and bar sheet (the old `studio/sheet.ts`, recoverable at `c619dae`) as an EXPORT · QUALITY fold. |
| **E6 · phone polish** | Long-press context menu (duplicate / delete / order), haptics-free snap feedback, sheet detent memory, landscape layout with a side sheet, `visualViewport` handling when the keyboard is open, a share sheet (`navigator.share`). |
| **E7 · performance** | Sample frames in the existing worker, let a zoomed-out canvas draw cached bitmaps, and use WebGL frames for GPU-tagged layers (the renderer rules apply per frame). |

**Next three:** E6 the long-press menu on the phone (it can reuse E2's `actions.ts`, and the E3 quick bar for a
layer) and a share sheet (`navigator.share` over E5's `shareSel`); E4 the state-machine edges; E7 frames in the worker.
