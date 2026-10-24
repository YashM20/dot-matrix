# WEB-PLAN: a site for nerds

> **Direction (2026-10-23, from the user):** Dot/480 is a personal project. The only deliverable is a website. There is no release, no npm publishing, no monetization and no marketing. People who find it interesting will find it.
>
> This doc replaces the product phases in `docs/NEXT-PLAN.md` §3 (P7 launch / hosted service, P10 plugins, P13 partnerships). `docs/MARKET-RESEARCH.md` is kept as reference only.
>
> Still valid in NEXT-PLAN: §1 gap audit, §2 consolidation, §4 Track R and §6 agent lessons.
>
> **Status (2026-10-24):**
> - **Done and live:** W0, C2–C8, C10 and the craft lift.
> - **Not started:** C1 (WebGPU compute) and C9 (multiplayer, optional).
> - **Open:** the essay as the front door (C10). UX-PLAN §7 proposes keeping a board as the front door, with the intent line linking to the essay.
> - **How visitors find all this:** `docs/UX-PLAN.md`. U0 and U1 are built.
> - **Per-item detail:** `docs/PROGRESS.md` › Web plan.

## 0. Principles
- **The site is the product.** Every idea is judged by one question: would someone on HN keep clicking for ten minutes?
- **Depth over breadth.** Fewer, deeper experiences, each with one "how is this a dot matrix?!" moment.
- **Everything explorable:**
  - deep links for every board, card and state;
  - a time scrubber anywhere;
  - "view the field" for any card (its IR, spec or describe output);
  - remix anything into DOTS.
- **Still Dot/480:**
  - the Field → Sampler → Renderer pipeline;
  - one accent per board;
  - quantized dots.

  Ambition goes into the engine and the interaction, not into breaking the style.
- **Static deploy:**
  - no backend by default;
  - anything multiplayer is optional and degrades to solo.

## 1. Ship the site (W0: about 3 days, do first)
| Item | Detail |
|---|---|
| Host | **Vercel** (connected to the repo: `main` → production, PRs → previews; config in `vercel.json`). |
| Build | `pnpm build` → `dist/`, plus the essay entry (`essay.html`) and SPA fallback for deep links. |
| CI | `.github/workflows/ci.yml`: `check` + `golden --check` + `build` + bundle budget. CI does not deploy: Vercel deploys `main` and a preview per branch or PR. |
| Speed | Lazy-load boards by route; budget 150 kB gz first load; the cards' worker path on by default. |
| Shareability | Per-board / per-card OG images (prebuilt at build time with `scripts/og.ts`); `<title>`/description per deep link. |
| Mobile | Every board usable at 375 px; touch on all controls; reduced-motion stills. |
| Housekeeping | Remove the ~40 agent worktrees; add `.gitattributes` (LF); fix git credentials and push; rename the "Glyph" board to **LOCK** (trademark caution even for a hobby site). |
| Drop | Publishing `@dot480/*`, hosting the shadcn registry, MCP directory listings, Pro pack, hosted API. The code can stay in the repo, unadvertised. |

## 2. Make it legendary: the cool track (pick in order; each about 1–2 weeks with agents)

### C1 · WebGPU dot engine: a million dots, live
- **What:** finish the WebGL2 renderer (P5-A, saved in its worktree), then a WebGPU compute path. Fields are evaluated in compute shaders and dots drawn instanced.
- **Wow moment:** a full-screen 1M-dot field that follows the cursor at 60 fps, with a "zoom into one dot" transition from a 25×25 card to the million-dot field.
- **Engine:**
  - IR → WGSL backend, with parity tests against JS;
  - a compute sampler;
  - fallback to WebGL2, then the CPU worker.
- **Gate:** 1M dots at 60 fps on an M1 or a mid GPU; parity ≤ 1e-4 on 20 IR fields.

### C2 · Dot physics you can touch
- **What:** a GPU particle/fluid layer where the dots *are* the simulation:
  - stable fluids or SPH, with the cursor stirring;
  - cloth and soft bodies (a dot flag waving);
  - grab-and-throw rigid "dot sprites";
  - sand that pours along with phone tilt (DeviceOrientation).
- **Wow moment:** drag through the Departures board and the split-flap letters splash into fluid, then settle back into text. A field-to-sim-to-field round trip using migration (P4-D).
- **Engine:** SimField on GPU (`src/engine/sim` today is CPU); migration between a field state and a sim state.

### C3 · Neural cellular automata: "the mirror that heals"
- **What:** in-browser NCA (Mordvintsev-style "Growing NCA"). The weights are trained offline in a script and shipped as a tiny Float32 asset; inference runs on GPU.
- **Wow moment:** a dot portrait or logo you can scratch with the cursor, and it regrows. This is signature moment 2 from MASTER-PLAN §9.
- **Gate:** regrows from 50% damage in under 5 s; under 2 ms per step at 64².

### C4 · Playable Levels
- **What:** turn the `levels` board into a real tiny game with a keyboard, gamepad or touch controller:
  - a raycast corridor (the level-03 lineage);
  - a maze;
  - a side-scroller;
  - a boss.
- **Wow moment:** the boss fight on a dot matrix, with screen-shake in whole cells and hit flashes as dither bursts. A high score sits in localStorage; the optional shared board needs no backend (see C9).
- **Engine:**
  - an input map for game controls;
  - `scene3d` promoted out of `levels.ts` into the engine (NEXT-PLAN gap #7);
  - a small ECS for game state.

### C5 · Sound and music on dots
- **What:** the Instrument board actually plays.
  - WebAudio synth voices behind the knobs;
  - the 16-step sequencer drives them;
  - the XY pad is a filter;
  - the crank scrubs tape.

  Also a mic visualizer (FFT → dots), and an audio-reactive mode for any board.
- **Wow moment:** jam on the Instrument, then hit "record" and get a GIF/WebM with audio (export path from P5-D).
- **Gate:** under 10 ms audio latency on desktop; no clicks when parameters change.

### C6 · Camera magic
- **What:** the mirror board grows hand and pose tracking (MediaPipe or a small ONNX model, app-level dependency only, never in `src/engine`).
- **Wow moment:** conduct the Departures board with your hand; pinch to grab dots; your silhouette becomes a dot shadow-puppet with depth parallax.
- **Gate:** at least 30 fps tracking on a laptop; everything stays local, and the page says so.

### C7 · Display physics: skins for the whole site
- **What:** a global "display" switch that re-renders every board as a different physical display:
  - CRT with phosphor persistence and bloom;
  - VFD glow (cyan-green);
  - LED matrix with bleed;
  - e-ink with ghosting (from P5-C);
  - flip-disc with clack;
  - split-flap;
  - a Nixie-ish glow.
- **Wow moment:** flip the whole site from OLED to CRT to e-ink live, with the transition itself drawn as a display refresh.
- **Engine:**
  - a post-raster "display" stage (afterglow raster, still owed from P3);
  - device profiles from `src/engine/device/`.
- **Accent:** the accent stays the same hue per board; skins change only the physics of the display.

### C8 · Kinetic type and SDF morphs
- **What:** a dot type system with variable weight, width and roundness:
  - glyphs generated from SDFs;
  - text that morphs letter to letter (`morph` from P4-D);
  - scrolling LED marquees;
  - CJK and emoji dot fonts.
- **Wow moment:** type anything in a ⌘K box and the whole board re-sets in that text with a migration flight.

### C9 · Multiplayer, optional and no backend required
- **What:** "r/place for dots". A shared canvas or a shared Instrument jam over WebRTC.
  - For a no-server start, peers connect by copying a link.
  - A tiny hosted relay (a small WebSocket service; Vercel functions do not hold sockets) can be added later if wanted.
  - It falls back to solo.
- **Wow moment:** two people's cursors as torch lights on the same `light` board.
- **Note:** only if the user wants it. It's the one item that needs infra.

### C10 · The explorable layer: "how it works", everywhere
- **What:**
  - Every card gets an **X-ray** toggle that shows its field values, the sampler grid, its layers, its IR and spec, and its fps and dot count.
  - A global **time machine** scrubs any board, and **remix in DOTS** works from any card.
  - The essay (P6-F, saved in its worktree) becomes the front door.
- **Wow moment:** hover any dot anywhere and see why it is that size.
- **Also:**
  - a ⌘K command palette;
  - a terminal-style "dot shell" (`load departures`, `skin crt`, `fps`);
  - easter eggs (Konami code shows the boss fight).

## 3. Order and sizing (one developer plus agents)
| Week | Track | Why first |
|---|---|---|
| 0 | §1 ship the site | Get it live and shareable; everything after is an update. |
| 1 | Merge the saved P5-A (WebGL2), P6-D (Studio) and P6-F (essay) work; C10 X-ray + ⌘K | Cheap and makes everything feel deep. |
| 2–3 | C1 WebGPU | Unlocks C2, C3 and C7 at scale. |
| 3–4 | C7 display skins + C5 sound | High wow per effort; they reuse the device sims and the Instrument. |
| 5–6 | C2 physics + C3 NCA | The "I didn't know a dot matrix could do that" pair. |
| 7 | C4 playable Levels | A game makes people stay and share. |
| 8+ | C6 camera, C8 type, C9 multiplayer | Pick by mood. |

## 4. Kept from earlier plans, reframed
- **Consolidation (NEXT-PLAN §2.2):** still do it, because the agent build left duplication. It also makes the cool tracks safer.
- **Taste session:** still the best use of 2 hours. Like or kill each board, and decide which boards are on the front page.
- **Perf and a11y gates:** keep the ones that affect the site experience:
  - first-load budget;
  - 60 fps on the hero boards;
  - mobile;
  - reduced motion;
  - keyboard.

  Drop the publishing gates (npm install) and the κ/AI-authoring gates unless they're fun.
- **Devices (P5-C/E):** keep them as demos. Real hardware only if the user owns some (WLED/ESP32 is cheap and fun).
- **MCP App:** keep for personal use with Claude; there's no directory listing.

## 5. Not doing (unless the user changes their mind)
- npm publishing, a shadcn registry listing, a Figma plugin, Pro packs, pricing, a hosted render API, Product Hunt / launch campaigns, partnerships.
