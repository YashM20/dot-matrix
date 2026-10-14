# STYLE BIBLE: what makes a Dot/480 card good

> Taken from the four cards the user likes: **level-03** (`audio.ts:258-306`), **afterlight** (`metro.ts:241-302`), **the mosaic board** (`mosaic.ts`) and **the components board** (`components.ts`). References are in `public/images/`.
> Tokens and invariants live in `DESIGN.md` and `AGENTS.md`. Gates and scores are in `MASTER-PLAN.md` §2. This file covers **taste**.
> Fail examples come from the lift backlog (MASTER-PLAN §5).
> ⚠ **Pending** marks a rule that depends on an open user decision (MASTER-PLAN §11).

---

## 1. Tonal depth beats on/off
- **Rule:** a hero uses at least 3 tonal bands with intent:
  - **void** (≤ .05), as the shadow or the background behind the subject;
  - **mid** (.3–.6), which carries the form;
  - **highlight** (≥ .9) on one edge or one point.

  The subject's own values should span ≥ .6. Flat fills and single-value plates are not heroes.
- **Why:**
  - level-03's corridor (`audio.ts:268-281`) uses five bands:
    - the black end wall (`z > FAR` → 0);
    - mortar at .04;
    - floor at .36–.44;
    - bricks at .62–.95 × fog;
    - a .95 lit wall base.

    Fog compresses toward the far end, so depth comes from tone alone.
  - afterlight's face maps 0–9 luma per site to .3–1 (`metro.ts:290`).
  - thermal-monitor uses a cool grey halo, a red body and a white core (`mosaic.ts:108-110`). Red → white is *dithered* by hash (`:101`), never stepped.
- **Pass:** `level-03`, `afterlight`, `thermal-monitor`, `cody` (mid fur `+` under value `#` highlights, `metro.ts:215-216`).
- **Fail:**
  - `thermal-puppy`: the body sits at .8–1.0 everywhere (`audio.ts:241`), a grey ghost with no shadow side;
  - `henry-bear`: one flat grey block;
  - `silhouette`: a two-tone threshold with banding;
  - `ev-charge`: the car spans .14–.9 but has no key light, so it reads as a smear.
- **Code:**
  - **Scenes and photos** use `quantizeSteps: 0` with `sizeMin: 0` and `sizeMax` of 1 to 1.05 (`audio.ts:296`, `metro.ts:295`, mosaic `photoStyle` `:15`). Dot *size* is the luminance.
  - **UI cards** stay quantized and get depth from **tones**: `value` > `idle` > `mid` > `faint` (plus `active`), stacked as separate layers.
  - **Multi-tone subjects:** split one field into tone layers by threshold, as thermal-monitor does. Don't emit one tone and hope.
  - ⚠ **Pending §11.2:** the `quantizeSteps: 0` exemption for *non-photo* scenes (level-03 is procedural, not a photo). AGENTS.md currently says "only photos skip quantization".

## 2. Scale contrast and the type ladder
- **Rule:** the hero is at least **2.5× the caption, measured in cap height** (glyph rows × lattice, in cells), and **at least 2 ladder tiers** above it.
  - Use one hero per card.
  - Use at most 4 text tiers per card, counting the chrome label. The liked cards use 2–4.
- **Why:**

  | Card | Hero | Small text | Ratio |
  |---|---|---|---|
  | level-03 | `84`: 13 rows × 1.85 ≈ 24 cells | label: 7 × .92 ≈ 6.4 | **3.7×** |
  | afterlight | title: 11 rows × 2.16 ≈ 22 cells | footer: 7 × 1.05 ≈ 7.4 | **3×** |
  | codex-usage | `2,842` at 2.3 ≈ 16 cells | `CAP` .72 ≈ 5 | **3.2×** |
  | ev-charge | `78` at 3 | `CAP` .72 | **4.2×** |
  | henry-sleep | `8:07` at 2 | `CAP` .72 | **2.8×** |

  ⚠ **Measure cap height, not lattice.** level-03's *lattice* ratio is only 1.85/.92 = 2.0×, because its condensed face is 14 rows tall. A raw "2.5× lattice" check (MASTER-PLAN §2.1 item 2) would fail a liked card.
- **Fail:**
  - `agent-status`: `THINKING` at 1.8 is about 12.6 cells against a 7-cell label (1.8×), so there's no hero;
  - `messages`: body text is the size of the names;
  - `word-play`, `codex-tokens`: tiny heroes.
- **The ladder** {0.72, 1, 1.3, 1.6, 2, 2.5, 3, 4}. Tier roles are taken from current usage. The code currently has 35 distinct values; the last column shows how they migrate.

  | Tier | Role | In the liked cards today | Snaps from |
  |---|---|---|---|
  | **0.72** caption | Secondary lines, units, axis ticks, tag text, the key above a stat | mosaic `CAP` (`mosaic.ts:59-61`), recorder quote `.7` | .7–.72 |
  | **1** label | Card label, index number, in-scene titles, day ticks | chrome `T.text` (`types.ts` `cardChrome`); `LEVEL 03` .92 (`audio.ts:303`); `A FILM BY…` 1.05 (`metro.ts:300`) | .92–1.1 |
  | **1.3** body | Button text, list rows, footer stat values, sub-lines | components `BODY` (`components.ts:14`); mosaic footers at 1.1/1.15 (`mosaic.ts:119-123`) | 1.15–1.4 |
  | **1.6** value | Second numeral, unit beside the hero, secondary stat | `%` (`mosaic.ts:165`); `1,158` at 1.4 (`:197`) | 1.45–1.8 |
  | **2** sub-hero | Hero that shares the card with a scene or chart; state words | `8:07` (`mosaic.ts:250`), `ACTIVE` (`:393`), level-03 `84` 1.85 | 1.85–2.2 |
  | **2.5** hero | The card's one number | `2,842` 2.3 (`mosaic.ts:195`), `01:47` 2.45, `247` 2.5 smooth | 2.3–2.7 |
  | **3** hero-L | Hero alone on the card | `78` (`mosaic.ts:165`), `AM7` 3.05 | 2.8–3.05 |
  | **4** display | One-word poster | `14A` 3.7 smooth (`henry3.ts:21`) | 3.5+ |

- **Code:**
  - Use `T.big(s, col, row, { lattice })` from the ladder only. Add `smooth: true` at 2.5 and up for the 2-dot-stroke weight; cap height doubles to 14 rows.
  - Site-text cuts are a logged exception: metro `textDots` with an anisotropic `px`/`py` (afterlight title `1.8 × 2.16`), and the audio `face()`. Note the measured reference as the reason.
  - **Legibility (G4):** if the 1-tier label reads as dashed at 1×, raise its *dot size*, not its lattice.
  - ⚠ **Pending §11.5:** the ladder itself.
  - ⚠ **Open:** mosaic footer values (`20.3°C`, 6 glyphs) are ~45.5 cells wide at 1.3 but sit in ~45-cell columns (`mosaic.ts:120-122`). Snapping them to 1.3 collides with the rules; snapping to 1 weakens value over caption.

## 3. Accent as narrative: one hue, red is the plot point
- **Rule:** red marks the one thing the story is about: **live** (happening now), **hot** (physically hot or urgent) or **primary** (the data series that matters).
  - Every red layer must be able to name its role.
  - Hover and focus never use red.
  - Use one hue per board.
- **Why:**
  - level-03: the invader at the vanishing point (`audio.ts:301`), the only red on a grey scene;
  - afterlight: a dotted red line splitting title from face (`metro.ts:299`), the "cut";
  - mosaic:
    - the thermal body is red because it's *hot* (`mosaic.ts:109`);
    - consumed tokens are the *primary* series (`:202`);
    - the EV cable is the energy path (`:170`);
    - `ACTIVE` is *live* (`:393`);
  - components: the destructive pill, the live level slider and the live status dot (`components.ts:59,75,110`).
- **Fail:**
  - `thermal-puppy`: a red nose ring with no heat meaning (`audio.ts:251-252`); the lift moves red to the hot core;
  - `agent-status`: red eyes are decoration.
- **Code:**
  - Use `layer(f, 'active')`, with `activeDim` for "was active".
  - The planned `accentRole: 'live' | 'hot' | 'primary'` (MASTER-PLAN §3.4) is required on every `active` layer by G2.
  - ⚠ **Pending §11.1:** "one hue per board, many red elements if each has a role" (the mosaic precedent) vs AGENTS.md "one accent colour per board" vs DESIGN.md:216 "one per card".
  - ⚠ **Open:** the mosaic's red index numbers (`num()`, `mosaic.ts:68`) are chrome, not live, hot or primary. G2 as written fails the user's favourite board. Either exempt the index or call it `primary`.

## 4. Hand-authored hero data
- **Rule:** faces, characters, creatures and signature data are **hand-authored or hand-tuned data**: luma tables, `#`/`+` sprites, point lists read off a reference. Generators produce the draft; then tune the numbers.
- **Why:**
  - afterlight's `FACE` is 41 rows of 0–9 luma digits (`metro.ts:242-284`);
  - level-03's `INVADER` is a 10-row sprite on a 1.45 lattice (`audio.ts:283-294,298`);
  - `CODY` (`metro.ts:178-210`) is a two-tone sprite;
  - mosaic: the `SHIP_W`/`SHIP_R` two-layer sprite with white hull and red detail (`mosaic.ts:268-276`), `DEER_HEAD` (`:376-379`), and the measured `TOTAL`/`USED`, hypnogram and `TREND` arrays (`:184-185,214,241-243`).
- **Fail:**
  - `henry-bear`: a generic block with an illegible bunny (lift: a hand-authored 3-tone sprite);
  - `thermal-puppy`: procedural ellipses plus hash fuzz;
  - `silhouette`: a threshold, not a drawing.
- **Code:**
  - **Sprites:** `T.lattice(k, col, row)` then `.at(L.sprite(rows, 0, 0))`, one layer per tone character.
  - **Luma tables:** emit `sites` plus a field that looks luminance up by site position, the afterlight pattern (`metro.ts:286-293`); planned as `lumaSites` (§3.8).
  - **Read from the reference:** values measured off `public/images/*` via `pnpm snap` and the reference crop.

## 5. Scenes over inventories
- **Rule:** one idea per card, stated as a one-line thesis before you build.
  - "You are in a corridor; the enemy waits at the end." "A film poster." "How hot is the mug?"
  - Supporting data serves the scene.
- **Why:** level-03 (scene + score), afterlight (poster), thermal-monitor (mug + three readouts), mini-game (one moment of a game).
- **Fail:**
  - `messages`, `settings`: equal rows with no hero;
  - `vision-camera`: four labelled objects, none readable;
  - `sunburst`: a pattern without a subject.
- **Code:** pick the hero element first and give it the coarsest tier and the densest dots (rules 2, 8). Everything else steps down at least one tier and one tone.

## 6. Component vocabulary
- **Rule:**
  - **Outlines:** fine dotted outlines (sites spaced at arc length).
  - **Knobs and status dots:** one huge site each.
  - **Geometry:** exact and symmetric.
  - **Moats:** negative space around moving parts.
  - **Outlines are never doubled.**
- **Why:**
  - `stadium()` puts sites at equal arc length (`components.ts:18-33`), with `OUTLINE = { spacing: 3.3, size: 1.5 }` (`:34`);
  - the toggle knob is **one site of size 30** (`:42`), the slider knob 18, the status dot 18 (`:63,110`), and `cornerRoundness: 0` gives true circles (`:13`);
  - the track, pill and buttons centre on cell 72 (`:38,52,79`);
  - the slider rail leaves an 11-cell gap around the knob (`:63,69`);
  - mosaic: one-dot `frame()` outlines (`mosaic.ts:46-54`) and dashed tag boxes (`:63-65`).
- **Fail:**
  - `messages`, `settings`: doubled dotted borders;
  - `henry-bear`: features built from clusters of small dots (forbidden by AGENTS.md);
  - `sunburst`: a square-grid patch where a concentric site disc belongs.
- **Code:**
  - **Curves:** `T.dots(points, size)`, `T.dotRing`, `T.dotLine`, `T.dotDisc`, `T.dotBars`.
  - **Knobs:** `T.dots([[x, y]], 18–30)`, never a disc of card dots.
  - **Arcs:** draw the full track in `faint`/`mid`, then the arc in `value`/`active`. They share sites (`types.ts` `dotRing`).

## 7. Label and chrome system
- **Rule:** every card on a board shares one chrome:
  - top-left, a **numbered index** plus a two-space **label**;
  - top-right, a **corner glyph** that means something;
  - optionally a **stat footer**: a faint rule, `CAP` keys over value-tier numbers, faint vertical dividers.

  Bleed scene cards drop the chrome label and set a 1-tier title inside the scene. Use one numeral weight per board.
- **Why:**
  - mosaic `label: '01  THERMAL MONITOR'` with `num()` overlaying the index (`mosaic.ts:68,103`);
  - corner glyphs: menu `⁘` (`:70`), bolt for EV (`:71-72`), wave for the agent (`:73`);
  - footers: `:119-123`, `:172-177`, `:257-262`, `:402-406`;
  - level-03 and afterlight set `label: ''` and place their own title (`audio.ts:303`, `metro.ts:297`);
  - the `live` card's status dot comes from `cardChrome` (`types.ts`).
- **Fail:**
  - henry board: `home-clock` uses thin 5×7-site numerals (`henry.ts:117`) next to `timer`, so the board has two numeral weights;
  - all lattice-1 eyebrow labels read as dashed at 1× (G4).
- **Code:** use `chrome: 'dots'`, `label`, `live` for the status dot, a shared `num`/glyph helper per board, and the `CAP` + `T.vrule(..., 'faint')` footer pattern.

## 8. Edges
- **Rule:** **organic** shapes (faces, heat, fog, fabric, light pools) get a **soft ramp about 1 cell wide**. **UI** (outlines, bars, text, controls) is **hard**: on or off at exact sites or integer cells, with no partial values.
- **Why:**
  - the thermal body darkens over a short edge ramp (`sstep(0, 4, edge)`, `mosaic.ts:89`), and the halo decays as `exp(-d/2.2)` (`:97`);
  - afterlight's face edge is carried by low luma digits (1–3) at the rim;
  - level-03 keeps mortar joints hard (.04) because they are structure;
  - `frame()` rounds to integer cells before testing (`mosaic.ts:49`).
- **Fail:**
  - `thermal-puppy`: `smoothstep(-.04, .1)` in uv is a ~20-cell ramp plus ±.17 hash fuzz (`audio.ts:239`), giving a ragged, mushy edge;
  - `silhouette`: banding where a ramp belongs.
- **Code:**
  - Ramp on signed distance *in cells*: `sstep(0, 1, d)` inside `cells()`.
  - There is no engine `soft()` yet; `henry3.ts:76` has a local one with a ~2-cell ramp.
  - UI geometry goes through sites or rounded cells. Partial values on quantized UI become stray dim dots.

## 9. Density and negative space
- **Rule:**
  - nothing is denser than the hero;
  - negative space is *composed*: it frames the hero or carries a line, it is not leftover;
  - keep content margins steady per board (bleed cards excepted).
- **Why:**
  - afterlight leaves about half the card black except the red line;
  - level-03's darkest, emptiest point is where the invader sits;
  - components put one control per card on wide margins;
  - mosaic: dense heroes, sparse `.72` footers, 1–1.3-size stars (`mosaic.ts:288`).
- **Fail:**
  - `agent-status`, `word-play`, `codex-tokens`: empty middles around tiny heroes;
  - `messages`: every row the same density.
- **Code:**
  - Supporting elements use wider `spacing` and smaller `size` than the hero.
  - Dense `cells()` fills are reserved for the hero.
  - Check the blur and squint view on the bar sheet (§2.6).

## 10. Motion feel (forward-looking: P1 primitives aren't built yet)
- **Rule:**
  - **Entrances:** decelerate.
  - **Exits:** accelerate.
  - **Mechanical things** (playheads, scanners, scrolls) move linearly.
  - **Duration:** ≥ 300 ms for anything meant to read as motion.
  - **Speed:** ≤ 1–2 cells per frame at the card's fps (≤ 12–24 cells/s at 12 fps).
  - **Velocity:** shown by **afterglow** or a lattice change, never by smearing into card-pitch clusters.
  - **Reduced motion:** every motion has a cut or dissolve fallback.
- **Today:**
  - the mini-game bullet moves 18 cells/s = 1.5 cells/frame (`mosaic.ts:283`) ✓;
  - the recorder scroll steps one bar every 333 ms (`audio.ts:122`), mechanical ✓;
  - level-03 is static. Its motion story (Torch in the Dark, §9) must keep the invader as the only red.
- **Code (planned):**
  - easing tokens and data springs (§3.5);
  - an afterglow decay raster;
  - buffer-level enter/exit masks;
  - snap to the integer cell or lattice step per frame.
  - ⚠ **Pending §11.4:** the fps tiers (12 / 30 / 60).

---

## Before you ship a card
- [ ] **Thesis.** One sentence; one hero element (rule 5).
- [ ] **Tone.** The hero has void, mid and highlight; quantization fits the card type (rule 1; ⚠ §11.2).
- [ ] **Scale.** Hero cap height is ≥ 2.5× the smallest text; every lattice is on the ladder or logged; ≤ 4 tiers; the label passes 1× (rule 2, G3, G4).
- [ ] **Accent.** Each red layer is live, hot or primary; one hue on the board; nothing red on hover or focus (rule 3, G2).
- [ ] **Hero data.** Faces, creatures and sprites are hand-authored or tuned data, not raw generator output (rule 4).
- [ ] **Components.** Dotted outlines, single big sites for knobs, symmetric on cell 72, no doubled borders, no small-dot clusters (rule 6).
- [ ] **Chrome.** Matches the board: index, label, glyph, footer, one numeral weight (rule 7).
- [ ] **Edges.** Soft about 1 cell for organic shapes, hard for UI (rule 8).
- [ ] **Density.** Nothing denser than the hero; negative space frames something (rule 9).
- [ ] **Motion.** Speed within ≤ 2 cells/frame, easing per rule 10, reduced-motion path present.
- [ ] **Review.** `pnpm snap <id> --out .snapshots/<dir>`, viewed beside level-03, afterlight, `thermal-monitor` and `ui-toggle` at 1×, plus blur and silhouette views.
