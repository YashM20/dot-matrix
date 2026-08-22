# BLOCK INVENTORY — 7 Reference Boards → Engine Families

> Source: `public/images/*` (7 boards), `PRD.md §0` goal: reproduce *every widget type* pixel-for-pixel.
> This doc is the inventory the user explicitly demanded before code: "first check all the images and each and every block create list. we need support for all that"
> Status column = engine coverage. Updated 2026-08-22 post-fix pass (see docs/ADVERSARIAL-REVIEW.md §2).

## Board A — DOT/480 OLED Micro Interface System (`henry-example-interface-system.png`, 3×3)

| ID | Label | Content | Generator Family | Widget Preset (after) | Status |
|---|---|---|---|---|---|
| A01 | 01 HOME | `10:42` clock + `MAY 20 TUE` + `78%` + semi-ring | Text + Polar ring | `clock`, `gaugeBattery` (sub-ring) | Partial (clock static) |
| A02 | 02 MUSIC | vinyl disc halftone + `DAYLIGHT` | Photo/Halftone (disc) | `albumArt` | Stub (ellipses) |
| A03 | 03 TIMER | `12:48` + full ring with red sweep + `■` | Text + Polar ring | `timer` | Exists |
| A04 | 04 WEATHER | `TOKYO 24°` + cloud | Text + IconSDF cloud | `weatherCard` | Exists |
| A05 | 05 FITNESS | `MOVE 62%` + 3 concentric rings + bars MTWTFSS | Polar + Heatmap | `fitnessRings` + bars | Exists |
| A06 | 06 MESSAGES | `ALEX 10:30 / MAYA 09:12` list-card | Composite list-card | `messagesList` | Partial (avatar circles + rowBg, no letters/timestamp) |
| A07 | 07 CAMERA | `REC` + brackets + cross + dial | Composite camera-viewfinder | `cameraViewfinder` | Fake grid |
| A08 | 08 SETTINGS | 5 rows `WI-FI ON>` etc with BRIGHTNESS selected | Composite settings-row | `settingsList` | Fake grid |
| A09 | 09 SYSTEM | `CPU USAGE 42%` + 4 horizontal dotted bars | Heatmap bars | `systemStatsBars` | Exists (transpose) |

## Board B — Dark Audio/MIDI (`HQLJDO3aoAAnxF9.jpg`, 3×3)

| ID | Label | Content | Generator | Preset | Status |
|---|---|---|---|---|---|
| B01 | AUDIO | `SPEAKER 72` + `MIC 48` dual dials | Polar dial | `gaugeBattery`/`gaugeSpeed` reuse | Dial exists but not dual |
| B02 | VIBE PAD | 4×4 icon-grid (16 icons) | Icon-grid | `appIconGrid` | Placeholder A-I letters |
| B03 | MIDI 01 | `AM7` heroDot + 8-dot pager + 3 sliders | Text + scatter + heatmap | `dialRadio` + `starField` mix | No preset |
| B04 | RECORDER | `01:47` + amplitude waveform (red left/gray right) | Waveform trace | `audioRecorder` | Bar not trace |
| B05 | RADIO | `CH 07` + dial `HOLD` `READY` | Polar dial | `dialRadio` | Exists |
| B06 | INTERPRETER | `EN → ZH` + dual waveforms + `开始吧` CJK | Waveform dual + CJK fallback | `interpreterDual` | Waveforms done, CJK dead code (not wired) |
| B07 | THERMAL | puppy IR photo | Halftone color-mapped | `thermalMonitor` | Procedural + sinWarp trig (1/11 warped), no real halftone |
| B08 | LEVEL 03 | corridor/maze receding grid + sprite | 3D corridor | `mazeGame` | Wireframe only |
| B09 | SHOPPING | `5 LEFT` + 3 checklist rows | Composite checklist | `shoppingChecklist` | Exists |

## Board C — DeerFlow AIoT (`HQIky8PaoAEHCij.jpg`, 3×4 = 12 cards)

| ID | Label | Content | Generator | Preset | Status |
|---|---|---|---|---|---|
| C01 | AGENT STATUS | `THINKING...` + smiley + waveform + STEPS/TOOLS/MEMORY | Composite + waveform | `agentStatus` | Fake pulses |
| C02 | CLAUDE/CODEX | `12.4K TOKENS` + 5 bars + REQUESTS | Text + heatmap bars | `claudeTokens` (missing) | No preset |
| C03 | DEVICE OVERVIEW | `128 DEVICES` dashed donut + legend | Polar dashed ring | `deviceOverviewDonut` | Arc not dashed |
| C04 | TESLA STATUS | car outline + `78% — 312km` | Icon car | `teslaStatus` → `evCharge` | Exists (simple) |
| C05 | PHARMA TRACK | pill halftone + 4-step `66%` | Halftone + polar progress | `pharmaTrack` | Exists (dots only, no pill) |
| C06 | MEDICAL MONITOR | ECG trace + `HR 72 SPO2 98% TEMP 36.6` | Spline ECG (Gaussian composite) | `ecgMonitor` | Fixed to traceField (thin), bar → trace |
| C07 | BIO SENSOR | `64% / 420 lux` + leaf rings | Polar leaf | `moistureLeafRings` | Exists |
| C08 | WORD PLAY | `C _ D E` `Great job!` score/streak | Text | `wordPlay` missing | No preset |
| C09 | RETAIL ANALYTICS | `1.28K VISITORS LIVE` + spline | Spline | `retailAnalytics` | Exists |
| C10 | ENTERTAINMENT | concentric breathing circles | Polar concentric | `breathingCircles` | Static not breathing |
| C11 | GAME ZONE | invaders scatter + shooter + hearts | Scatter Poisson | `gameZone` missing → `starField`+`mazeGame` | Partial |
| C12 | VISION AI | viewfinder + wireframe cube | Icon cube + brackets | `visionCube`+`cameraViewfinder` | Exists |

## Board D — DeerFlow Mosaic (`HQIig9IaEAAmC9U.jpg`, 3×3)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| D01 | THERMAL MONITOR mug `20.3→52.1C` + gradient bar | Halftone color+bar | `thermalMonitor` | Fake |
| D02 | EV CHARGE car charging line | Icon + spline | `evCharge` | Simple |
| D03 | CODEX USAGE `2,842` + bar chart `0-6K` | Heatmap bars | `codexUsage` | Exists (single row, no axes) |
| D04 | FITNESS RINGS large 3 arcs + weekly sparkline | Polar + spline | `fitnessRings`+`lapTimeChart` | Exists |
| D05 | HENRY SLEEP heatmap `DEEP/CORE/REM/AWAKE` `23:41-07:48` | Heatmap | `sleepChart` | Synthetic matrix |
| D06 | MINI GAME invaders | Scatter | `mazeGame`/`starField` | Generic |
| D07 | AI ASSISTANT `HELLO HENRY` + 4 pill chips | Composite chat-bubble | `aiAssistantChat` | Fake grid |
| D08 | VISION CAMERA laptop/mug/notebook/plant boxes | Photo + detection boxes | `visionCamera` → `cameraViewfinder` | Fake grid |
| D09 | DEERFLOW AGENT `ACTIVE 72%` + antler ring | Polar antler + progress | `agentAvatarRing`+`agentStatus` | Blob not antler |

## Board E — Henry 3×3 (`HQLGUf3bgAA3X29.jpg`)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| E01 | `14A SFO—LHR BOARDING` | Text | `boardingPass` | Exists |
| E02 | Sunburst `DAY 3 OF 7` + red center | Polar sunburst | `sunburst` | Exists (field + center red, no day count) |
| E03 | `247W` power ring | Polar ring | `gaugeBattery`/`gaugeSpeed` | Exists |
| E04 | `MIDNIGHT CIRCUIT` red waveform | Waveform mirrored trace | `midnightCircuit` → `audioRecorder` | Bar not thin |
| E05 | Silhouette halftone (person+building) | Halftone | `silhouetteArt` | Ellipse fake |
| E06 | `INHALE` concentric | Polar | `breathingCircles` | Static |
| E07 | `7H 42M` sleep blocks + grid | Heatmap | `sleepChart` | Generic |
| E08 | `A-07 03 AHEAD` + progress dots | Text + heatmap | `boardingPass` variant | No preset |
| E09 | `LISTENING` waveform | Waveform | `voiceListening` | Bar |

## Board F — Metro/Oxygen/... (`HQLGUfgakAA5Paz.jpg`, 3×3)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| F01 | METRO `02 MIN` + `o-o-o` metroLine | Spline | `metroLine` | Exists |
| F02 | OXYGEN `98%` dotted circle | Polar dotted | `oxygenRing` | Exists |
| F03 | HOME QUIET floorplan heatmap (2 squares + red dot) | Heatmap occupancy | `homeQuiet` | Exists (hollow squares + red dot) |
| F04 | FINAL LAP `P2 -0.8 SEC` spline | Spline | `lapTimeChart` | Exists |
| F05 | NEWSWIRE `THE MOON BLINKED` headingDot | Text headingDot | `headlineText` | Hard-coded SHIP |
| F06 | DEERFLOW `80K STARS` antlers scatter | Scatter + Icon antlers | `starField`+antlers missing | Dots only |
| F07 | CODY reindeer pixel art + `WANTS COFFEE` | Halftone (pixel art) | `cody` missing → `silhouetteArt` | Fake |
| F08 | TATOOINE binary sunset (2 suns + horizon) | Halftone composite | `tatooine` missing | No preset |
| F09 | AFTERLIGHT face halftone split + red line | Halftone | `afterlight` → `portraitArt` | Generic |

## Board G — Ride/Henry/Wiki/... (`HQLHmo4asAA8Blx.jpg`, 3×3)

| ID | Content | Generator | Preset | Status |
|---|---|---|---|---|
| G01 | RIDE `32.4 KM/H 247W` dual rings | Polar dual dial | `gaugeSpeed` dual missing | Single dial only |
| G02 | HENRY `I'M LISTENING` bear/rabbit halftone dual rings | Halftone | `henryListening` missing | Fake blobs |
| G03 | THU 20 `DESIGN REVIEW` timeline (dotted H + red vertical) | Heatmap + heatmap | `thuTimeline` missing | No preset |
| G04 | MEMO 07 `SHIP THE IDEA` + progress | Text heading + heatmap | `headlineText` | Hard-coded |
| G05 | HENRY'S WIKI bear head + radial graph | Icon grid + spline | `wikiGraph` | Exists (spokes via CatmullRom) |
| G06 | SYSTEM `DISPLAY/SOUND/NETWORK/ABOUT` selection | Composite | `systemMenu` → `settingsList` | Generic |
| G07 | LAST PASSWORD `########` + dotted ring + `24 ITEMS` | Scatter ring | `passwordDotsRing` | Flat row not ring |
| G08 | NOTIFICATIONS `3 NEW` + red/gray dots grid | Heatmap pagination | `notifications` → `sleepChart` | Generic |
| G09 | APPS 3×3 icon-grid + `HENRY` | Icon-grid | `appIconGrid` | Placeholder letters |

## Summary Counts

- Total distinct blocks inventoried: **68**
- Distinct generator families needed (PRD §3): polar, bitmapFont, cjkFallback, iconSDF, halftone (Bayer/Floyd), waveform (bars + trace + mirrored), spline (Catmull-Rom), heatmap, scatter (Poisson), 3D perspective, warped/trig (next-level)
- Before remediation: ~22 presets covered families but only ~35 blocks with any fidelity; ~33 blocks had no faithful preset or faked as grid.
- Goal after remediation: every row above has a faithful preset or an explicit reuse note, and missing families (sunburst usage, antler SDF, dashed donut, wiki graph) are added.
