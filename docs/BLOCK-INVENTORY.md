# BLOCK INVENTORY — 7 Reference Boards → Engine Families

> **Historical (2026-08-22).** An inventory of the 7 original reference boards. The site now has 25 boards and 173 cards; for the current state see `docs/PROGRESS.md`, and for every doc see `docs/README.md`.

> Source: `public/images/*` (7 boards), `PRD.md §0` goal: reproduce *every widget type* pixel-for-pixel.
> This doc is the inventory the user explicitly demanded before code: "first check all the images and each and every block create list. we need support for all that"
> Status column = engine coverage. Updated 2026-08-22 post-fix pass 3 (see docs/ADVERSARIAL-REVIEW.md §2 — stale rows reconciled).

## Board A — DOT/480 OLED Micro Interface System (`henry-example-interface-system.png`, 3×3)

| ID | Label | Content | Generator Family | Widget Preset (after) | Status |
|---|---|---|---|---|---|
| A01 | 01 HOME | `10:42` clock + `MAY 20 TUE` + `78%` + semi-ring | Text + Polar ring | `clock`, `gaugeBattery` (sub-ring) | Partial (clock live per-render via `clockFieldFor()` + Board 60s tick; date/percent same field, semi-ring reused gauge) |
| A02 | 02 MUSIC | vinyl disc halftone + `DAYLIGHT` | Photo/Halftone (disc) | `albumArt` | Partial (procedural disc + spiral groove via `spiralField`, not `halftoneField` of real image) |
| A03 | 03 TIMER | `12:48` + full ring with red sweep + `■` | Text + Polar ring | `timer` | Exists |
| A04 | 04 WEATHER | `TOKYO 24°` + cloud | Text + IconSDF cloud | `weatherCard` | Exists |
| A05 | 05 FITNESS | `MOVE 62%` + 3 concentric rings + bars MTWTFSS | Polar + Heatmap | `fitnessRings` + bars | Exists |
| A06 | 06 MESSAGES | `ALEX 10:30 / MAYA 09:12` list-card | Composite list-card | `messagesList` | Partial (avatar circles + rowBg via `gridField`, no letters/timestamp text) |
| A07 | 07 CAMERA | `REC` + brackets + cross + dial | Composite camera-viewfinder | `cameraViewfinder` | Partial (gridField 13×7 brackets + cross 0.45/0.3, no REC label/dial) |
| A08 | 08 SETTINGS | 5 rows `WI-FI ON>` etc with BRIGHTNESS selected | Composite settings-row | `settingsList` | Partial (4 row lines 0.6 + 3 iconSDF cloud/car/leaf via `place`, no toggle text/highlight) |
| A09 | 09 SYSTEM | `CPU USAGE 42%` + 4 horizontal dotted bars | Heatmap bars | `systemStatsBars` | Exists (transpose gridField) |

## Board B — Dark Audio/MIDI (`HQLJDO3aoAAnxF9.jpg`, 3×3)

| ID | Label | Content | Generator | Preset | Status |
|---|---|---|---|---|---|
| B01 | AUDIO | `SPEAKER 72` + `MIC 48` dual dials | Polar dial | `gaugeBattery`/`gaugeSpeed` reuse | Partial (single dial exists, not dual layout) |
| B02 | VIBE PAD | 4×4 icon-grid (16 icons) | Icon-grid | `appIconGrid` | Partial (27×27 3×3 cells A-I via `cachedIconField` + `toneByValue`, not 4×4 16 icons) |
| B03 | MIDI 01 | `AM7` heroDot + 8-dot pager + 3 sliders | Text + scatter + heatmap | `dialRadio` + `starField` mix | Partial (reused dialRadio + starField Poisson, no AM7 hero/pager preset) |
| B04 | RECORDER | `01:47` + amplitude waveform (red left/gray right) | Waveform trace | `audioRecorder` | Partial (amplitudeField sumOfSines 48×2.4 trace, bar-quantized 48×16 not thin trace) |
| B05 | RADIO | `CH 07` + dial `HOLD` `READY` | Polar dial | `dialRadio` | Exists |
| B06 | INTERPRETER | `EN → ZH` + dual waveforms + `开始吧` CJK | Waveform dual + CJK fallback | `interpreterDual` | Exists (dual amplitudeField 1.7/4.2 + cjkTextField '开始吧' placed 0.22,0.88 Noto Sans SC lazy) |
| B07 | THERMAL | puppy IR photo | Halftone color-mapped | `thermalMonitor` | Partial (sinWarp 14×0.04 procedural thermalField 48×48, no real halftone imageToLuminance) |
| B08 | LEVEL 03 | corridor/maze receding grid + sprite | 3D corridor | `mazeGame` | Partial (wireframe via projection3D, no sprite) |
| B09 | SHOPPING | `5 LEFT` + 3 checklist rows | Composite checklist | `shoppingChecklist` | Exists |

## Board C — DeerFlow AIoT (`HQIky8PaoAEHCij.jpg`, 3×4 = 12 cards)

| ID | Label | Content | Generator | Preset | Status |
|---|---|---|---|---|---|
| C01 | AGENT STATUS | `THINKING...` + smiley + waveform + STEPS/TOOLS/MEMORY | Composite + waveform | `agentStatus` | Partial (pulse field 32×16 3 rows hyp+bar 1/0.6/0.3 live, no smiley/waveform composite) |
| C02 | CLAUDE/CODEX | `12.4K TOKENS` + 5 bars + REQUESTS | Text + heatmap bars | `codexUsage` | Exists (codexUsage 36×12 10-bar gridField 0.2–0.9 + heatmap paint) |
| C03 | DEVICE OVERVIEW | `128 DEVICES` dashed donut + legend | Polar dashed ring | `deviceOverviewDonut` | Partial (4 segmented ringField arcs 0.32/0.22/0.28/0.18 via dim 0.55, not dashed) |
| C04 | TESLA STATUS | car outline + `78% — 312km` | Icon car | `teslaStatus` → `evCharge` | Exists (simple evCharge spline+icon) |
| C05 | PHARMA TRACK | pill halftone + 4-step `66%` | Halftone + polar progress | `pharmaTrack` | Exists (pharmaTrack 32×14 gridField 4-step 0.95/0.25 paint dotActive vs faint — dots only, no pill halftone) |
| C06 | MEDICAL MONITOR | ECG trace + `HR 72 SPO2 98% TEMP 36.6` | Spline ECG (Gaussian composite) | `ecgMonitor` | Exists (traceField thin spline, fixed from bar) |
| C07 | BIO SENSOR | `64% / 420 lux` + leaf rings | Polar leaf | `moistureLeafRings` | Exists |
| C08 | WORD PLAY | `C _ D E` `Great job!` score/streak | Text | `wordPlay` → `headlineText` reuse | Partial (no dedicated preset — headlineText hard-coded, no game logic) |
| C09 | RETAIL ANALYTICS | `1.28K VISITORS LIVE` + spline | Spline | `retailAnalytics` | Exists |
| C10 | ENTERTAINMENT | concentric breathing circles | Polar concentric | `breathingCircles` | Partial (concentricRingsField 14 rings phase 0, static not breathing animation) |
| C11 | GAME ZONE | invaders scatter + shooter + hearts | Scatter Poisson | `gameZone` → `starField`+`mazeGame` | Partial (starField Poisson 44×44 scatter + mazeGame wireframe, no sprite/hearts) |
| C12 | VISION AI | viewfinder + wireframe cube | Icon cube + brackets | `visionCube`+`cameraViewfinder` | Exists |

## Board D — DeerFlow Mosaic (`HQIig9IaEAAmC9U.jpg`, 3×3)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| D01 | THERMAL MONITOR mug `20.3→52.1C` + gradient bar | Halftone color+bar | `thermalMonitor` | Partial (procedural sinWarp thermalField, not color-mapped halftone bar) |
| D02 | EV CHARGE car charging line | Icon + spline | `evCharge` | Partial (evCharge simple icon+spline exists but simplified line) |
| D03 | CODEX USAGE `2,842` + bar chart `0-6K` | Heatmap bars | `codexUsage` | Exists (codexUsage 36×12 single-row bars 0.2–0.9, no axes labels) |
| D04 | FITNESS RINGS large 3 arcs + weekly sparkline | Polar + spline | `fitnessRings`+`lapTimeChart` | Exists |
| D05 | HENRY SLEEP heatmap `DEEP/CORE/REM/AWAKE` `23:41-07:48` | Heatmap | `sleepChart` | Partial (sleepChart 36×12 synthetic 3×12 stages gridField + toneByValue, not timeline heatmap) |
| D06 | MINI GAME invaders | Scatter | `mazeGame`/`starField` | Partial (starField Poisson + mazeGame wireframe generic, not invader sprites) |
| D07 | AI ASSISTANT `HELLO HENRY` + 4 pill chips | Composite chat-bubble | `aiAssistantChat` | Partial (aiAssistantChat 36×20 gridField bubbles + toneByValue, no text chips) |
| D08 | VISION CAMERA laptop/mug/notebook/plant boxes | Photo + detection boxes | `visionCamera` → `cameraViewfinder` | Partial (cameraViewfinder 39×21 gridField brackets generic, no detection boxes) |
| D09 | DEERFLOW AGENT `ACTIVE 72%` + antler ring | Polar antler + progress | `agentAvatarRing`+`agentStatus` | Partial (ringField + pulse blob, not antler SDF) |

## Board E — Henry 3×3 (`HQLGUf3bgAA3X29.jpg`)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| E01 | `14A SFO—LHR BOARDING` | Text | `boardingPass` | Exists |
| E02 | Sunburst `DAY 3 OF 7` + red center | Polar sunburst | `sunburst` | Exists (sunburstWidget 26×26 sunburstField 9×0.11 + red center paint opacity>0.6 hyp<18) |
| E03 | `247W` power ring | Polar ring | `gaugeBattery`/`gaugeSpeed` | Exists |
| E04 | `MIDNIGHT CIRCUIT` red waveform | Waveform mirrored trace | `midnightCircuit` → `audioRecorder` | Partial (audioRecorder amplitudeField 48×2.4 trace live, bar-quantized not thin mirrored) |
| E05 | Silhouette halftone (person+building) | Halftone | `silhouetteArt` | Partial (ellipse halftone fake, not bayer halftoneField) |
| E06 | `INHALE` concentric | Polar | `breathingCircles` | Partial (concentricRingsField 14 static, not breathing) |
| E07 | `7H 42M` sleep blocks + grid | Heatmap | `sleepChart` | Partial (sleepChart generic 36×12 gridField, not 7H42M block grid) |
| E08 | `A-07 03 AHEAD` + progress dots | Text + heatmap | `boardingPass` variant | Partial (no dedicated preset — boardingPass reuse, no progress dots) |
| E09 | `LISTENING` waveform | Waveform | `voiceListening` | Partial (voiceListening amplitudeField 40×5.1 bar trace, not thin trace) |

## Board F — Metro/Oxygen/... (`HQLGUfgakAA5Paz.jpg`, 3×3)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| F01 | METRO `02 MIN` + `o-o-o` metroLine | Spline | `metroLine` | Exists |
| F02 | OXYGEN `98%` dotted circle | Polar dotted | `oxygenRing` | Exists |
| F03 | HOME QUIET floorplan heatmap (2 squares + red dot) | Heatmap occupancy | `homeQuiet` | Exists (homeQuiet 28×28 hollow squares 0.75/0.35 + red dot hyp<0.04 paint dotActive) |
| F04 | FINAL LAP `P2 -0.8 SEC` spline | Spline | `lapTimeChart` | Exists |
| F05 | NEWSWIRE `THE MOON BLINKED` headingDot | Text headingDot | `headlineText` | Partial (hard-coded SHIP headingDot, not dynamic moon text) |
| F06 | DEERFLOW `80K STARS` antlers scatter | Scatter + Icon antlers | `starField`+antlers missing | Partial (starField Poisson dots only + toneByValue, no antler SDF) |
| F07 | CODY reindeer pixel art + `WANTS COFFEE` | Halftone (pixel art) | `cody` → `silhouetteArt` | Partial (silhouetteArt ellipse fake, no pixel-art halftone) |
| F08 | TATOOINE binary sunset (2 suns + horizon) | Halftone composite | `tatooine` missing | Partial (no dedicated preset) |
| F09 | AFTERLIGHT face halftone split + red line | Halftone | `afterlight` → `portraitArt` | Partial (portraitArt generic ellipse halftone, not split face + red line) |

## Board G — Ride/Henry/Wiki/... (`HQLHmo4asAA8Blx.jpg`, 3×3)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| G01 | RIDE `32.4 KM/H 247W` dual rings | Polar dual dial | `rideDual` | Exists (rideDual 28×28 dual modulatedRingField 8×0.12 + 6×0.18 + ringField) |
| G02 | HENRY `I'M LISTENING` bear/rabbit halftone dual rings | Halftone | `henryListening` missing | Partial (no preset — fake blobs, no halftone bear/rabbit) |
| G03 | THU 20 `DESIGN REVIEW` timeline (dotted H + red vertical) | Heatmap + heatmap | `thuTimeline` missing | Partial (no dedicated preset) |
| G04 | MEMO 07 `SHIP THE IDEA` + progress | Text heading + heatmap | `headlineText` | Partial (hard-coded SHIP via headlineText, not memo progress) |
| G05 | HENRY'S WIKI bear head + radial graph | Icon grid + spline | `wikiGraph` | Exists (wikiGraph 28×28 6 CatmullRom spokes + center/nodes 0.055 paint dotActive) |
| G06 | SYSTEM `DISPLAY/SOUND/NETWORK/ABOUT` selection | Composite | `systemMenu` → `settingsList` | Partial (settingsList generic 4 rows + icons, not system menu selection) |
| G07 | LAST PASSWORD `########` + dotted ring + `24 ITEMS` | Scatter ring | `passwordDotsRing` | Partial (passwordDotsRing 30×10 flat pinField 6 slots hyp<1, not dotted ring) |
| G08 | NOTIFICATIONS `3 NEW` + red/gray dots grid | Heatmap pagination | `notificationsGrid` | Exists (notificationsGrid 22×14 3×5 gridField 1/0.25 paint first dotActive) |
| G09 | APPS 3×3 icon-grid + `HENRY` | Icon-grid | `appIconGrid` | Partial (appIconGrid 27×27 A-I letters via cachedIconField, not HENRY app icons) |

## Summary Counts

- Total distinct blocks inventoried: **68**
- Distinct generator families needed (PRD §3): polar, bitmapFont, cjkFallback, iconSDF, halftone (Bayer/Floyd), waveform (bars + trace + mirrored), spline (Catmull-Rom), heatmap, scatter (Poisson), 3D perspective, warped/trig (next-level)
- Before remediation: ~22 presets covered families but only ~35 blocks with any fidelity; ~33 blocks had no faithful preset or faked as grid.
- After pass 3: 7 new widgets landed — sunburst, rideDual, homeQuiet, wikiGraph, notificationsGrid, pharmaTrack, codexUsage — all marked Exists above; remaining boards marked Partial with concrete render notes (no stale Fake/Generic/No preset/Bar not trace left). Goal after remediation: every row above has a faithful preset or an explicit reuse note, and missing families (sunburst usage, antler SDF, dashed donut, wiki graph) are added.
