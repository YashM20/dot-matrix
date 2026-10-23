# MARKET RESEARCH: Dot/480

> Researched 2026-10-23. Every factual claim carries a source tag `[S#]`; the full list (URL + access date) is at the end.
> Numbers marked **Estimate** are my reasoning from comparables, not data. Where evidence is thin I say so.
> Product described from `docs/MASTER-PLAN.md` (v2), `docs/MCP-APP.md`, `docs/PROGRESS.md` (P0–P4 done, P5 active, P6 not started, 146 presets) and `README.md`.

---

## Executive summary (recommendation first)

**Positioning.** *Dot/480 is the dot-matrix engine for the agent era: write a field once and ship it as a React component, a live status card inside Claude/ChatGPT/Copilot, an e-ink dashboard and an LED matrix, from the same source.*
Lead with **"alive and everywhere"**. Do not lead with "another animated component library": Magic UI, Aceternity, React Bits and thinking-orbs already own that framing [S34][S50].

**Top 3 segments**
1. **AI/devtool companies that need agent-status UI.** The demand is proven. `thinking-orbs`, a 3-month-old library of dotted agent loaders, did about 3.0M npm downloads in the last 30 days and has about 3.8k stars [S35][S50]. MCP Apps has been a stable spec since 2026-01-26 [S54], and ChatGPT and Claude list thousands of apps and connectors [S55]. Dot/480's edge: a closed presence vocabulary, inline MCP App rendering, `describe()` for screen readers and agents, and the same state on a desk LED or e-ink screen.
2. **Design engineers and indie hackers building landing pages.** This is the biggest top of funnel: `shadcn` gets about 7.45M weekly downloads, and Motion/Framer Motion about 47M combined [S35]. It is also the most crowded segment, and it is where AI is eroding paid component sales (Tailwind) [S46].
3. **Hardware hobbyists and dashboard builders (ESP32/WLED, e-ink, pixel clocks).** Home Assistant reports 708k opted-in installs [S57], WLED has 18.9k stars [S34] and TRMNL has 1,000+ plugins plus a paying creator fund [S10][S12]. These people care about "one field, five surfaces", and no web UI kit serves them.
   - Nothing Phone developers and creative coders are **amplifiers, not revenue segments**. The Glyph Matrix SDK forbids commercial use without written permission [S2]; creative coders remix but rarely pay.

**Top 3 monetization bets** (all revenue ranges are **Estimates**)
1. **Custom "signature moment" and agent-presence builds for AI companies** (consulting). This is the fastest cash and validates the presence vocabulary. About $10k–25k per project; year 1 $20k–120k.
2. **Open core: a free MIT engine plus a paid "Dot/480 Pro" pack** (hero boards, the full presence kit, device templates). Comparables: Magic UI Pro $199 lifetime, Aceternity $199 lifetime / $1,590 team, Motion+ $399 [S39][S40][S41]. Price at $129 solo and $599 team. Year 1 $5k–40k. The Tailwind collapse caps the upside [S46].
3. **A hosted render and push API**: README/OG cards, TRMNL/e-ink PNG, LED/WebP push and MCP App hosting. Free tier, $12/mo Pro, $49/mo Team; comparables Bannerbear $49/mo and Placid ~$29/mo [S63]. This is the only recurring revenue that agents cannot copy into a repo. Year 1 $0.5k–3k MRR by month 12.
   - **Defer** the Dot Studio SaaS: Rive and Spline set a high bar [S42][S44].
   - **Do not count on** device marketplaces: TRMNL's whole creator pool pays about $4.1k/month across all plugin authors [S12].

**Launch plan in 10 bullets**
1. **Claim the name this week.** `dot480` is free on npm (scope too), GitHub user/org and 8 TLDs including .com/.dev/.io [S36][S34b][S37]. Move the repo off `YashM20/dot-matrix` [S72]. Run a trademark knockout through counsel.
2. **Rename the public "Glyph" flagship** (for example "Hourglass"). Nothing has a GLYPH trademark application on file [S9], and the plan's P4 flagship uses that name.
3. **Ship a minimum launchable kit before the full P6.**
   - `npm i @dot480/core @dot480/react` plus `<dot-card>`.
   - A shadcn registry with about 12 boards plus the presence kit.
   - The Heartbeat MCP App over Streamable HTTP (today it is stdio only, per `docs/MCP-APP.md`).
4. **Spend three pre-launch weeks building in public.** Post one signature moment per post: a 10–20 s clip plus a live link (Hourglass Clock, Mirror that Heals, Torch, Heartbeat).
5. **Launch day: the "Ditherpunk for UI" interactive essay**, as a Show HN (link the essay, not the homepage) plus an X/Bluesky thread. The comparables that worked were interactive explainers: ASCII rendering got 1,353 points, Surma's Ditherpunk 1,290, visualrambling's Dithering 461 [S38].
6. **Day +7: Product Hunt.** Pitch "agent heartbeat + dot UI kit". Magic UI took #1 of the day with 570 upvotes [S48].
7. **Week +2: registries.** shadcn Registry Directory, registry.directory and 21st.dev [S47].
8. **Week +2–3: MCP directories.** Official MCP Registry, Glama, mcp.so, PulseMCP and Smithery [S56]; then the Claude/ChatGPT app directories once HTTP transport and host review are done.
9. **Week +3–5: device communities.**
   - A published TRMNL recipe (it qualifies for the Creator Fund) [S12].
   - A WLED/Home Assistant DDP demo and a Tronbyt app [S17].
   - A free, non-commercial Glyph Toy, plus a request to Nothing for commercial permission [S2].
10. **Ongoing.** A weekly "dot of the week" remix on the Dwitter-for-dots page. Decide on the paid Pro pack at **≥1,500 stars or ≥300 waitlist emails** (a decision gate, not a forecast).

---

## 1. Market landscape

### 1.1 The dot-matrix / retro-display aesthetic: hardware and platforms

| Player | What it is | Pricing / model | Community-size signals | How Dot/480 differs |
|---|---|---|---|---|
| **Nothing: Glyph Interface / Glyph Matrix / Glyph Toys** | Back-of-phone LED matrix. Phone (3) is 25×25 with Glyph Touch; Phone (4a) Pro is 13×13, AOD toys only [S1]. GDK v2 for the Matrix shipped 2025-07-01, with updates in Mar/Jul 2026 for 4a Pro / 4b (third-party wiki) [S3]. "Playground" community hub launched 2025-09-30 [S5]; some items link out to paid Play Store apps [S4]. | Phone (3) launched at $799 [S6b]. The SDK is closed source, and **commercial use is prohibited without Nothing's written permission** [S2]. | 5.1M+ Nothing units shipped in total (all models) and <1% global share, as of Sep 2025 [S6]. GlyphMatrix-Developer-Kit repo: 312 stars [S34]. Reviewers call the toy catalogue "a handful" [S7]. Nothing OS 4.0 moved the system font to Geist and uses dot matrix "more intentionally" (forum source) [S8]. | Dot/480 is a web-first engine that can *emulate* and *target* the 25×25 / 13×13 masks. Nothing is a channel and an aesthetic cousin, not a customer, and its own software is drifting away from heavy dot use [S8]. |
| **Teenage Engineering** | Design-led hardware; co-designed Nothing's aesthetic (2021) and the Rabbit r1 [S28]. | Premium hardware: OP-1 Field $1,999, TX-6 $1,199 [S29]. | No public revenue found. | An aesthetic reference only. There is no software platform to plug into, so partnership odds are low. |
| **Playdate (Panic)** | 1-bit handheld with a crank. | Hardware plus a game catalogue. | 70k units by spring 2025 [S26]; "80k+" in a later, undated report [S27]. | Shows that 1-bit aesthetics sell to a paying niche. The engine's dithering and halftone ladder fits, but Playdate is Lua/C, so it is not a target. |
| **TRMNL** | 7.5" 800×480 e-ink dashboard, "hackable", with BYOD/BYOS options. | OG $139 one-time, "no subscription", 1,000+ plugins [S10]. TRMNL X $229; dev access is a one-time ~$20; 1,231 integrations [S11]. Clarity Kit $25 [S10]. | 1,800 devices and ~$200k in the first months; $157k Kickstarter [S13]. Firmware repo 1.2k stars [S34]. Monthly **Creator Fund**: $46,954 source revenue → $5,909 payout (Jul 2026), 70% to plugin authors [S12]. AI Agent plugin builder in beta (Jul 2026) [S14]. | TRMNL is the clearest device partner: same 800×480 1-bit target as P5, an open plugin model, and authors get paid. Dot/480 would be a *design layer* for TRMNL plugins, not a rival. |
| **Tidbyt → Tronbyt** | 64×32 LED pixel display. Tidbyt was acquihired by **Modal** and stopped making hardware [S15][S16]. Tronbyt is the community replacement (server, firmware, pixlet fork) [S17]. | Tronbyt: Apache-2.0, no paid tier [S17]. | `tronbyt/server` 221 stars; `tidbyt/pixlet` 846 [S34]. | A frozen, shrinking installed base, but an enthusiastic one. Cheap to support through WebP push; don't build a business on it. |
| **AWTRIX 3 / AWTRIX NG + Ulanzi TC001** | Custom firmware for the ~$46 Ulanzi pixel clock [S20]. **AWTRIX 3 is discontinued, superseded by AWTRIX NG** [S18]. | NG is under the **PolyForm Noncommercial 1.0.0** licence; commercial use needs an agreement [S19]. TC001 is €40.99 vs LaMetric's ~€189 [S21]. | AWTRIX 3: 2.35k stars [S34] and "5,000+" Discord members [S18]. | Plan correction: P5 targets "AWTRIX MQTT". Target **NG's** API instead, and note the non-commercial licence for any paid bundle. |
| **LaMetric (TIME / SKY)** | Commercial pixel clock with an app market. | TIME $199.99 [S22]. | Per-app installs are small: "Radio" 2,258 [S23]. | Closed ecosystem with a small app economy. Low priority. |
| **WLED** | ESP32/ESP8266 LED firmware; the de-facto hobby LED standard. | Free (EUPL-1.2) [S34]. | 18.9k stars, 4.4k forks [S34]. Espressif has shipped 1B+ chips in total (2023) [S58]. | DDP realtime streaming makes Dot/480 a *content source* for WLED matrices. That is a strong demo ("your agent status on your desk lamp"). |
| **Vestaboard** | Split-flap smart sign. | Note $1,099 frameless / $1,269 framed from Sep 2026 [S25]. Vestaboard+ $119/yr [S24]. | Unit sales not public. HN commenters cite it as "can't justify the expense" [S38: 47875795]. | Proves willingness to pay for *the split-flap feeling*. Dot/480's Departures board gives the feeling for $0 on any screen, which is an X/HN hook rather than a revenue line. |
| **Split-flap DIY** | Open-source ESP32 split-flap (scottbez1). | Apache, sponsor-supported [S30]. | 4.2k stars [S34]; 293 HN points (2021) [S38]. | Same as above. |
| **Flip-disc** | AlfaZeta (PL) panels, roughly €500 per 14×28 in a hobbyist report [S31]; Breakfast (NY) art installations, low six figures minimum [S32]; flipdisc.io DIY guide with Node libraries [S33]. | Hardware. | "Flipdiscs" got 569 HN points (Apr 2026) and "Flip Fluid on Flip Dots" 398 (Sep 2026) [S38]. Commenters asked for Game of Life, generative graphics and Atkinson dithering [S38: 47875795]. | The flip-disc *simulator* (inertia + clack) is a cheap, viral preview of hardware people want but cannot afford. |

### 1.2 Adjacent software tools

| Tool | What it does | Pricing / model | Community signals | How Dot/480 differs |
|---|---|---|---|---|
| **Rive** | Vector animation editor plus state machines; MIT runtimes. | Free; Cadet $9/seat; Voyager $32/seat; Enterprise $120/seat ($10M+ revenue companies). "No revenue share, no runtime fees" [S42]. | `@rive-app/canvas` 696k/wk; `@rive-app/react-canvas` 600k/wk [S35]. rive-runtime 1.2k stars [S34]. | Rive authors vectors on a timeline. Dot/480 programs dot *fields* that are resolution- and device-aware and run on an ESP32. Complement, don't compete. Borrow the "state machine view" for Studio. |
| **Lottie / LottieFiles** | JSON animation format plus a SaaS for assets and collaboration. | Paid tiers about $19.99 (individual) and $24.99 (team) per user/month; free-tier status disputed across sources [S43]. | `lottie-web` 4.31M/wk; `@lottiefiles/dotlottie-web` 949k/wk [S35]; lottie-web 32k stars [S34]. | The plan *cut* Lottie export (file bloat). Position as "the dots Lottie can't do: live data and devices". |
| **Spline** | Browser 3D design tool. | Sources disagree: Free/$12/$20/$36 vs "Super" $24 [S44]. $15M seed in 2023 [S44]. | No user count found. | A different medium (3D meshes). Dot/480's "Levels"/"Torch" give a 3D *feel* on a dot lattice. |
| **Framer** | Site builder with a component marketplace. | Plans ~$10–$100/mo; $50M ARR in Aug 2025, doubled from 2024 (Sacra estimate) [S45]. | The marketplace already sells a "Dot Matrix Icon" component [S53]. | A distribution channel (the plan deferred the Framer plugin), not a rival. |
| **shadcn/ui + registries** | Copy-in component system; the registry protocol lets anyone publish installable components. | Free, MIT. | 126k stars [S34]; `shadcn` CLI 7.45M/wk [S35]. About 300 community registries claimed (vendor blog) [S47]; directories at registry.directory and shadcnregistry.com [S47]. | Dot/480 publishes *into* this (P6). A registry listing is cheap and probably the highest-leverage distribution step. |
| **Magic UI** | Animated React/Tailwind components for "design engineers". | Free MIT library; Pro $199 lifetime [S39]. | 22.8k stars [S34]; PH #1 of the day, 570 upvotes (May 2025) [S48]; 230 HN points (2024) [S38]. | Generic web motion. Dot/480 is a single, deep aesthetic plus an engine plus devices. |
| **Aceternity UI** | Cinematic animated components and templates. | Free tier; 1-yr $169, Lifetime $199, Team $1,590 (sale prices) [S40]. | "Thousands of developers" (self-claimed) [S40]. | As above. |
| **React Bits / motion-primitives / 8bitcn** | Free animated and retro component sets. | Free (8bitcn is MIT). | React Bits 50k stars; motion-primitives 6.8k; **8bitcn 2.1k** [S34]. 8bitcn ranked #2 on PH [S49]. | 8bitcn proves "retro aesthetic as a shadcn registry" draws stars. Dot/480 goes deeper (fields, motion, devices). |
| **Motion (Framer Motion)** | Animation library; Motion+ is the paid layer. | Motion+ $399 one-time solo; teams billed yearly per seat [S41]. | `framer-motion` 31.0M/wk plus `motion` 15.8M/wk [S35]. | The best open-core comparable: a free engine with paid examples, components and tools. |
| **thinking-orbs** *(closest direct competitor)* | Nine dotted canvas loaders for AI/agent states, two sizes, auto light/dark [S50]. | MIT. | Created 2026-07-21; ~3.8k stars [S50]; **3.02M npm downloads in 30 days** [S35]. Downloads likely include CI and transitive installs, so they are not unique users. | It owns "dotted agent indicator" mindshare today. Dot/480 must win on (a) inline MCP App rendering, (b) the same state on LED/e-ink, (c) `describe()` and a11y, (d) living simulation (Lenia/RD) rather than loops. |
| **dot/matrix loaders, dot-anime-react, Framer Dot Matrix Icon** | Small 5×5 dot loaders "agent-themed" [S52]; React dot animation [S36]; Framer component [S53]. | MIT / marketplace. | dot-matrix-animations 87 stars [S34]; dot-anime-react ~158 downloads/wk [S35]. | Shows the space is fragmenting into toys. None has an engine, a sampler, device targets or an IR. |
| **ascii.rest** | 240 animated ASCII pieces; React/Astro/`<ascii-art>` tag; agent skill [S51]. | MIT, sponsorware. | 474 HN points (2026-10-07) [S38]; npm ~2.4k/wk after two weeks [S35]. | The sister aesthetic, launched two weeks ago with the same distribution playbook (web component plus agent skill). Watch it closely. |
| **Dwitter / Shadertoy / tixy.land / p5.js** | Code-golf and creative-coding communities. | Free. | Dwitter: 361 HN points (2017), repo 805 stars [S38][S34]. Shadertoy: 52k+ public shaders (mid-2021) [S65]. tixy.land (16×16 dots from `(t,i,x,y)`): 539 HN points (May 2025) [S38]. p5.js: 24k stars, 67k npm/wk [S34][S35]. | "Dwitter for dots" is explicitly tixy-plus-Dwitter for a real engine. tixy's two HN hits show the constraint format still lands. |
| **ASCII/dither libraries** | `canvas-dither` (27.7k/wk) [S35]; Dither3D 1.6k stars [S34]; play.core 543 stars [S34]; Atkinson-dither demo 438 HN points [S38]. | Free. | See left. | These are single effects. Dot/480 makes dithering a UI system with tokens, quantized sizes and devices. |
| **react-three-fiber / three.js** | 3D on the web. | Free. | r3f 33k stars and 4.0M/wk; three 117k stars and 14.1M/wk [S34][S35]. | Different layer. The WebGL2 renderer (P5) may sit next to r3f scenes; no conflict. |

**What this table says.** No product combines (1) a field-based dot engine, (2) a shippable component kit, (3) device targets and (4) agent-native rendering. Each piece has a competitor, but the combination does not. The risk is that the combination is hard to *explain*, so the launch must show it in one video ("One Field, Five Surfaces").

---

## 2. Target users and jobs-to-be-done

Sizes are signals, not TAM. Converting a signal into "reachable people" is an **Estimate**.

| # | Segment | Job to be done | Evidence of size | Reachable (Estimate) | Will they pay? |
|---|---|---|---|---|---|
| 1 | **AI/devtool companies (agent presence, MCP Apps)** | "Show users what my agent is doing (thinking, running a tool, waiting for approval, error, done) in a way that is on-brand, accessible and works inside the chat host." | MCP SDK 39.4M/wk; `ext-apps` 3.4M/wk [S35]. ChatGPT directory 2,049 apps and Claude 1,375 connectors (Aug 2026 census; couldn't re-fetch, HTTP 429) [S55]. Official MCP Registry ~9.7k servers; Glama 77k+ (self-reported, Aug 2026) [S56]. thinking-orbs: 3.0M downloads/30 days [S35]. Cloudscape published a "thinking" pattern (Apr 2026) [S66]. | 500–2,000 companies shipping agent UIs; 50–200 who care enough about brand to pay. | **Yes.** Companies pay for custom builds, priority support and hosted rendering. Highest willingness to pay. |
| 2 | **Design engineers / indie hackers** | "Make my landing page or product feel distinctive in an afternoon, copy-paste, no design budget." | shadcn CLI 7.45M/wk; Motion 47M/wk combined [S35]. Magic UI 22.8k stars; React Bits 50k [S34]. Tailwind Plus made ~$30k/day at peak (early 2023), down to ~$6k/day by Nov 2025 [S46]. | Tens of thousands see a launch; 1–3% star; 0.2–1% of stargazers buy a Pro pack. | **Some.** One-time $99–$299 purchases, but AI generation is eroding this market [S46]. |
| 3 | **Hardware hobbyists (ESP32/WLED, e-ink, pixel clocks)** | "Put something beautiful and *live* on my LED matrix or e-ink frame without writing firmware graphics code." | Home Assistant 708,084 active opted-in installs (the project says fewer than a quarter opt in) [S57]. WLED 18.9k stars, ESPHome 11.9k, FastLED 7.5k, rpi-rgb-led-matrix 4.4k [S34]. AWTRIX Discord 5,000+ [S18]. TRMNL 1,000+ plugins [S10]. 457 `epaper` GitHub topic repos (search snippet, weak) [S73]. | Thousands of tinkerers; the best fit for "One Field, Five Surfaces". | **Low per head.** $0–$12/mo for hosted push or templates. They are strong amplifiers (YouTube, Reddit, Hackaday). |
| 4 | **Nothing Phone developers** | "Ship a Glyph Toy that looks good on 25×25 / 13×13 without hand-pixelling frames." | 5.1M+ Nothing units in total, all models [S6]. Only Phone (3) and (4a) Pro have a Matrix [S1]. SDK repo 312 stars [S34]. A community Glyph Matrix Editor already exists [S67]. | Hundreds of active toy developers (Estimate; no official count found). | **No, for now.** Commercial use of the SDK needs Nothing's permission [S2]. |
| 5 | **Creative coders** | "Make and share a beautiful loop in under 32 characters, remix others." | tixy 539 HN points (2025) [S38]; Shadertoy 52k+ shaders [S65]; p5 67k/wk [S35]. | Large, but monetizes poorly. | **No.** They are the remix engine and the source of the content flywheel. |
| 6 | **Dashboard / kiosk builders** | "Office or home status board (departures, weather, build status) that looks like a real sign." | Vestaboard sustains $1,099+ hardware and a $119/yr subscription [S24][S25]; LaMetric $199.99 [S22]; TRMNL X $229 [S11]. | Overlaps segments 3 and 1 (company status boards). | **Moderate.** Hosted boards for office TVs at $12–49/mo (Estimate). |

---

## 3. Demand signals

### 3.1 Search and social trends: what I could and couldn't verify
- **Google Trends and X data were not accessed** (no API, and no scraping). I can't give search-volume curves for "dot matrix UI", "ditherpunk", "Nothing design" or "e-ink dashboard". Evidence below is from HN, npm, GitHub and press.
- **Dithering is mainstream-cyclical, not new.** 2026 trend roundups call dithering and ASCII "no longer surprising but will keep being used" [S60]. MBB ties the pixel/dither comeback to the 2024–25 Y2K and "desktop core" revivals [S60]. FontLab ran a "Dithering, ditherpunk, and Bill Atkinson" feature in March 2026 [S69].
- **"Ditherpunk" as a term:** Surma's 2021 essay got 1,290 HN points and is still reposted [S59][S38]. It coined the term the launch essay borrows. That is good for recognition, but credit Surma explicitly.
- **"Nothing design":** Nothing itself is *reducing* Ndot use (Geist became the system font in OS 4.0), and some community members object [S8]. The dot aesthetic is now a *broader* design-engineering idiom (Framer marketplace, loaders, thinking-orbs [S50][S52][S53]) rather than "Nothing's look". That helps both positioning and IP.
- **MCP Apps:** the launch post got 192 HN points (Nov 2025) [S38], and the spec went stable 2026-01-26 with Claude, VS Code, Goose and then ChatGPT shipping support [S54]. "A playable DOOM MCP app" got 93 points (Apr 2026) [S38]. The novelty of "UI inside the chat" still gets clicks.

### 3.2 Notable posts and launches (last ~24 months; HN via Algolia [S38])

| Date | Post | Points / comments | Why it worked (my read) |
|---|---|---|---|
| 2026-09-15 | Show HN: e-ink frame that hears birds and draws them as 1800s illustrations | 2,391 / 267 | Physical object, gentle, a personal story, open source. |
| 2024-11-14 | MomBoard: e-ink display for a parent with amnesia | 2,106 / 251 | Emotional use case plus simple tech. |
| 2026-01-17 | ASCII characters are not pixels: a deep dive into ASCII rendering | 1,353 / 149 | **Interactive essay.** This is the format the launch essay copies. |
| 2024-10-04 | Getting my daily news from a dot matrix printer | 904 / 253 | A retro output device solving a modern problem. |
| 2026-04-23 | Flipdiscs (flipdisc.io) | 569 / 91 | Mechanical "satisfaction"; comments asked for Life, generative graphics and dithering [S38: 47875795]. |
| 2025-05-10 | tixy.land: 16×16 dot animation from simple math rules | 539 / 99 | Instantly playable in one URL, plus a constraint. |
| 2024-11-08 / 2026-03-16 | Obra Dinn 1-bit dithering (two reposts) | 527 / 472 | Perennial craft-nerd interest in dithering. |
| 2026-10-07 | Animated ASCII Art for Web Pages (ascii.rest) | 474 / 76 | A library framed as a *gallery*; web component plus agent skill. |
| 2025-10-29 / 2026-01-26 | Dithering Part 1 / Part 2 (visualrambling) | 461 / 256 | Visual explainer series. |
| 2025-06-07 | Convert photos to Atkinson dithering | 438 / 54 | Drop-your-photo toy (compare the Mirror that Heals). |
| 2026-09-26 | Flip Fluid on Flip Dots | 398 / 26 | Simulation on physical dots (compare SimFields). |
| 2024-05-23 | Magic UI: UI Library for Design Engineers | 230 / 92 | The "design engineer" label; free library. |
| 2025-11-23 | MCP Apps: extending servers with interactive UIs | 192 / 121 | Spec news. |
| 2026-06-27 | Show HN: Hacker News on a train-station flip board | 114 / 30 | Split-flap plus HN self-reference. Dot/480's Departures board could do this better. |
| 2024-11-14 | Show HN: TRMNL | **21** / 16 | **Counter-signal:** TRMNL grew through Kickstarter and community [S13], not HN. Device audiences live on YouTube, Reddit and Discord. |
| 2026-07-22 | Animated Thinking Orb Components | **5** | **Counter-signal:** thinking-orbs went viral off-HN (X / design Twitter) yet reached ~3.8k stars [S50]. The agent-UI audience lives on X. |

**Pattern.** The winners are (1) *interactive explainers*, (2) *physical objects with a story*, (3) *one-URL toys with a constraint*. Dot/480 can do all three; most competitors do one.

---

## 4. Monetization options with comparables

| Option | Comparables (with sources) | Suggested price (Estimate) | Year-1 revenue range (Estimate) | Effort | Verdict |
|---|---|---|---|---|---|
| **Consulting / custom builds** (branded presence vocabulary, signature hero, device installs) | No public rate cards found for this niche. Rive Enterprise ($120/seat, $10M+ revenue companies) shows enterprises pay for custom runtimes [S42]. | $10k–25k per project; $150–250/hr. | $20k–120k (2–6 projects). | Low (the work already exists). | **Do first.** Fastest cash, and real-world validation for the vocabulary. |
| **Open core: free engine + Pro pack** | Magic UI Pro $199 lifetime [S39]; Aceternity $199 lifetime / $1,590 team [S40]; Motion+ $399 [S41]; Tailwind Plus $299 → ~80% revenue drop from AI and new sign-ups closed after the Shopify deal [S46]. | $129 solo lifetime; $599 team (10 seats). | $5k–40k (50–300 sales). | Medium. | **Do, cautiously.** Sell what agents can't regenerate: device templates, tuned heroes, the presence kit with an MCP App, and updates. |
| **Hosted render / push API** (README/OG cards, e-ink PNG, LED WebP/DDP push, hosted MCP App) | Shields serves 1.6B+ requests/month and is donation-funded [S61]. github-readme-stats has 79.8k stars, and its maintainers warn the free Vercel instance costs money and rate-limits [S62][S34]. Bannerbear $49/mo for 1k credits; Placid ~$29/mo [S63]. `@vercel/og` 1.36M/wk, satori 2.84M/wk [S35] (the build-it-yourself alternative). | Free (watermark/rate limit); Pro $12/mo; Team $49/mo; usage above that. | $0.5k–3k MRR by month 12. | Medium-high (ops, abuse, cost). | **Do, second.** The only recurring line, and it fits "one field, five surfaces". The README card is the free viral loop. |
| **Dot Studio SaaS** (editor + AI authoring) | Rive $9–32/seat [S42]; Spline $12–20/mo reported [S44]; LottieFiles ~$20–25/user [S43]; Framer $50M ARR (Sacra) [S45]. | $15/mo creator, $39/seat team. | $1k–5k MRR by month 12 *if* built; likely less. | Very high. | **Defer** until there is an audience. Ship the free playground and Dwitter-for-dots first. |
| **Device templates / marketplace** (TRMNL, Glyph Toys, AWTRIX) | TRMNL Creator Fund: about $4.1k/month shared across *all* plugin authors (Jul 2026) [S12]. Glyph SDK bans commercial use without permission [S2]. AWTRIX NG is non-commercial [S19]. LaMetric app installs are in the hundreds to low thousands [S23]. | Free (distribution) or in the Pro pack. | < $2k. | Low-medium. | **Distribution, not revenue.** |
| **Licensing to hardware makers** (engine plus IR bytecode in a device's UI) | LVGL Pro: $1k–3k/seat/yr, or a $20k per-product licence (pages disagree) [S64]. Rive custom runtime (Enterprise) [S42]. | $5k–20k per product or an annual licence. | $0–40k (0–2 deals; 6–12 month cycles). | High (support, SLAs). | **Opportunistic.** Pursue only if a maker reaches out after the Five Surfaces demo. |
| **Sponsorships** | Motion's sponsors get Motion+ after 3 months [S41]; shields relies on donations [S61]; splitflap asks for GitHub Sponsors [S30]. | $5–$500/mo tiers; logo on the essay and README. | $1k–12k/yr. | Low. | **Turn on at launch.** Pair with Pro perks as Motion does. |

**Key caution (Tailwind).** AI coding tools cut Tailwind's docs traffic about 40% and revenue about 80% while usage hit record highs [S46]. Plan for agents to be the main installers. Expose an MCP server and `llms.txt`, and make the registry agent-friendly. Monetize at the points agents *can't* do for free: hosted rendering, device push, custom work and support.

---

## 5. Go-to-market plan

### 5.1 Positioning statement
> **For** design engineers and AI product teams **who** want interfaces that feel alive and recognizably *theirs*, **Dot/480 is** a field-based dot-matrix engine and kit **that** renders one source as a React component, an inline agent-status card in Claude/ChatGPT/Copilot, an e-ink dashboard and an LED matrix. **Unlike** animated-component libraries (Magic UI, Aceternity) or single-purpose loaders (thinking-orbs), Dot/480 is a programmable engine with device physics, accessibility (`describe()`) and a portable IR.

Tagline candidates: "Ditherpunk for UI" (essay); "One field. Every surface."; "Dots that are alive."

### 5.2 Naming and brand check (2026-10-23)

| Asset | Result | Source |
|---|---|---|
| npm `dot480`, `dot-480` | Not found (404), so available | [S36] |
| npm scope `@dot480` (`@dot480/core`, `@dot480/react`) | No packages in the scope; the scope is unclaimed | [S36] |
| npm `dot-card`, `dot-matrix` | Not found (404), so available | [S36] |
| npm `dotfield`, `dotmatrix` | **Taken** (unrelated) | [S36] |
| GitHub user/org `dot480`, `dot-480` | Not found (404); repo search "dot480" = 0 | [S34b] |
| Domains `dot480.com/.dev/.io/.app/.org/.net/.xyz/.studio`, `dots480.com` | No RDAP record, so likely unregistered. Method checked against known registered domains. | [S37] |
| Web usage of "dot480" / "Dot/480" | Only this project's public repo `YashM20/dot-matrix` (1 star) | [S72][search] |
| Trademarks | **Not checked in USPTO TSDR / EUIPO eSearch** (no official query run). Web search found no conflicting "DOT480" mark. Nothing has a **GLYPH** application (serial 98239520, per a third-party aggregator; status unverified) [S9]. | — |

Recommendations:
- Use **`dot480`** as the handle everywhere. The slash in "Dot/480" can't go in URLs, npm names or social handles, so keep it as the wordmark only.
- Register `.com` and `.dev` now.
- Have counsel run a knockout search in classes 9 and 42 before spending on brand.
- **Don't name anything public "Glyph"**, and don't use "Nothing" except nominatively ("works with Nothing Phone (3)").

### 5.3 Launch sequence (detail)

| Step | When | Channel | Deliverable | Success metric |
|---|---|---|---|---|
| 0 | Weeks −4…−1 | Infra | Claim handles; publish `@dot480/core`, `@dot480/react`, `<dot-card>`; shadcn registry JSON; MCP App over Streamable HTTP; waitlist page; Sponsors | `npm i` works; registry installs |
| 1 | Weeks −3…−1 | X, Bluesky, design Discords | 6–9 short clips, one signature moment each, with a live URL | Followers; waitlist ≥ 300 |
| 2 | Launch day (Tue/Wed, ~8–9am PT) | HN (link the essay), X thread, newsletter pitches | "Ditherpunk for UI" interactive essay with the five §9 moments embedded and Surma credited | HN front page; ≥ 500 stars in 72 h (target) |
| 3 | +7 days | Product Hunt | Kit plus Agent Heartbeat; demo video | Top 5 of the day |
| 4 | +2 weeks | shadcn Registry Directory, registry.directory, 21st.dev, awesome-shadcn | Listings with preview GIFs | Registry installs/week |
| 5 | +2–3 weeks | MCP Registry, Glama, mcp.so, PulseMCP, Smithery; then Claude/ChatGPT directories | Heartbeat MCP App listing | MCP installs; host approvals |
| 6 | +3–5 weeks | TRMNL recipe, WLED/HA forums, Tronbyt apps repo, AWTRIX NG community, Nothing community/Playground | "One Field, Five Surfaces" device ports | Recipe installs (≥ 50 connections qualifies for the Creator Fund [S12]) |
| 7 | Ongoing | Dwitter-for-dots | Weekly prompt ("dot of the week"); remix graph | Remixes/week |

### 5.4 Eight-week content calendar (week 1 = launch week)

| Week | Hero content | Supporting posts | Channel focus |
|---|---|---|---|
| −1 | Teaser: Hourglass Clock (tilt the phone, the sand settles into the time) | 2 clips: Departures split-flap; Torch in the Dark | X, Bluesky |
| 1 | **Launch: "Ditherpunk for UI" essay** | HN; X thread; "how the sampler works" thread | HN, X |
| 2 | **Product Hunt:** Agent Heartbeat in Claude, mirrored to a $46 Ulanzi clock | "Your agent's status on your desk" video | PH, X, LinkedIn |
| 3 | **The Mirror that Heals** (webcam halftone, scratch to regrow) | Making-of: STBN temporal stability | X, Reddit r/creativecoding (check rules) |
| 4 | **One Field, Five Surfaces** (browser, Glyph emulator, TRMNL, flip-disc sim, plotter) | TRMNL recipe release; WLED DDP how-to | YouTube short, HA forum, TRMNL Discord |
| 5 | **Dwitter for dots** opens: the IR in the URL, 32-char challenge | 10 seeded remixes by you | X, HN (Show HN: the REPL) |
| 6 | **README card service:** GitHub contributions as a departures board | "Add to your profile in one line" | GitHub, X, dev.to |
| 7 | **Field IR → ESP32 bytecode** deep dive | Perf numbers (500k IR dots @ 60 fps if the P5 gate is met) | HN, Hackaday tip line (submit, don't spam) |
| 8 | Retrospective plus Pro-pack decision post | Community showcase; roadmap | Blog, X, newsletter |

### 5.5 Demo ideas ranked by viral odds (judgement, backed by §3.2)
1. **Agent Heartbeat inside Claude/ChatGPT, mirrored to a physical LED clock.** It combines the AI zeitgeist with a physical object (patterns 1+2), and thinking-orbs shows the appetite [S50].
2. **Hourglass Clock on a phone with tilt.** Instantly playable, tactile, loops well as video.
3. **The Mirror that Heals.** A drop-your-face toy; the Atkinson-dither demo got 438 points [S38].
4. **One Field, Five Surfaces.** The "how is this one source?!" moment. It needs a well-edited 30 s video.
5. **HN / GitHub as a departures board.** Self-referential; the flip-board Show HN got 114 points even as a simpler build [S38].
6. **Flip-disc simulator with clack audio, doing Game of Life plus Atkinson dithering.** Directly answers what HN commenters asked flipdisc.io for [S38: 47875795].
7. **Torch in the Dark** (cursor torch on the level-03 corridor).

### 5.6 Partnership targets (identified only; nobody contacted)

| Target | Why | Ask | Odds (judgement) |
|---|---|---|---|
| **TRMNL** | Same 800×480 1-bit target; pays creators [S12]; AI-agent plugin builder [S14] | Featured recipe; "design layer for plugins" co-post | High |
| **Nothing Developer Programme** (GDKsupport@nothing.tech) | Glyph Toys plus Playground [S2][S5] | Written commercial permission; Playground feature | Medium |
| **Blueforcer / AWTRIX NG** and **Ulanzi** | A $46 device with a big Discord [S18][S20] | Showcase; commercial agreement if bundling [S19] | Medium |
| **WLED / Tronbyt maintainers** | Open LED ecosystems [S17][S34] | Showcase in docs or app repos | Medium |
| **MCP host directories** (Anthropic connectors, OpenAI apps, VS Code) | Distribution for the Heartbeat [S54][S55] | Listing after review | Medium (review gates) |
| **shadcn registry ecosystem** | 7.45M/wk CLI [S35] | Directory listing | High (self-serve) |
| **LottieFiles / Rive communities** | Motion-designer audiences [S42][S43] | Community showcase posts, not integrations | Low-medium |
| **Teenage Engineering** | Aesthetic halo [S28] | None realistic; homage only | Low |

### 5.7 Metrics and KPIs

| Stage | KPI | 8-week target (Estimate / aspiration) |
|---|---|---|
| Awareness | Essay unique visitors; median time on page | 50k; ≥ 3 min |
| Awareness | HN peak points; PH rank | Front page; top 5 |
| Interest | GitHub stars | 1.5k–3k |
| Activation | `@dot480/core` weekly downloads | 1k–5k/wk by week 8 |
| Activation | Registry installs (server logs on the registry JSON) | 500+ |
| Activation | MCP App installs (registry/directory stats) | 100+ |
| Engagement | Dwitter-for-dots remixes/week | 50+ |
| Engagement | Device ports (TRMNL recipe connections, WLED/Tronbyt users) | ≥ 50 TRMNL connections |
| Revenue | Waitlist → Pro conversion; consulting leads | 300 waitlist; 3 qualified leads |
| Revenue | Hosted API: free → paid | 2–5% (Estimate) |
| Health | Issues response time; contributors | < 48 h; 5 outside contributors |

---

## 6. Risks

| Risk | Evidence | Severity | Mitigation |
|---|---|---|---|
| **IP / trade dress around Nothing's look** | Nothing has a GLYPH trademark application (status unverified) [S9]. Ndot is Nothing's proprietary brand font [S68]. Product-design trade dress generally needs proven secondary meaning [S9b]. Dot-matrix type and LED grids are decades-old generic conventions. | Medium | Never ship Ndot, Nothing logos or the "Glyph" name. Keep your own bitmap font (already 5×7). Rename the "Glyph" flagship. Use "Nothing" only nominatively. Counsel review before monetizing Glyph templates. |
| **Glyph SDK terms** | Commercial use is prohibited without written permission; no redistribution or modification [S2]. | Medium-high for any paid Glyph product | Glyph work stays free and demo-only until permission arrives. The *emulator* lives in Dot/480 (no SDK code), and toys stay a thin Android wrapper. |
| **AWTRIX NG licence** | PolyForm Noncommercial [S19] | Low-medium | Talk to its public API only; never bundle the firmware commercially without an agreement. |
| **Platform dependency: MCP Apps** | Spec stable 2026-01-26 but extended in a `draft` folder; host gaps (ChatGPT has no tool calls from the UI; Claude needs domain signing; VS Code has no fullscreen), per third-party write-ups (`docs/MCP-APP.md`) [S54]. | Medium | Keep the card a pure view with no host-specific APIs; test in all three hosts; keep the same card available as `<dot-card>` and an image URL so nothing depends on one host. |
| **Platform dependency: dead devices** | Tidbyt no longer makes hardware [S15]; AWTRIX 3 is discontinued [S18]. | Low | Treat devices as demos and targets via open protocols (DDP, WebP, PNG), not partnerships you depend on. |
| **Competition** | thinking-orbs (3.0M downloads/30 days) [S35][S50]; ascii.rest [S51]; Magic UI/Aceternity [S39][S40]; small dot loaders [S52][S53]. AI can generate "dot loaders" on request. | High | Compete on depth no single prompt reproduces: the engine, device physics, IR, MCP App, `describe()`, the fidelity gate. Make the free tier generous so Dot/480 becomes the default agents install. |
| **Paid components eroded by AI** | Tailwind: ~80% revenue drop; 3 of 4 engineers laid off (Jan 2026); new sales closed after the Shopify deal (Sep 2026) [S46]. | High for bet #2 | Lead with services and hosted products; the Pro pack is upside, not the plan. |
| **Open-source sustainability** | shields runs on volunteers and donations [S61]; github-readme-stats maintainers flag hosting cost and rate limits [S62]. | Medium | Rate-limit and cache the hosted API from day one; Sponsors at launch; never run an unmetered free image endpoint. |
| **Scope / timeline** | The plan puts P6 (packages, Studio, essay) at weeks 17–21+, and P5 is active now (`docs/PROGRESS.md`). | Medium | Launch a minimum kit (§5.3 step 0) before Studio and AI authoring; the essay needs only the five moments. |
| **Evidence gaps in this report** | No Google Trends/X data; no Reddit sizes (API blocked); MCP census not re-fetchable (429); several prices come from third-party aggregators. | — | Re-check §1–§3 numbers just before launch; add PostHog/Plausible on the essay to build first-party data. |

---

## Sources (all accessed 2026-10-23)

- [S1] Nothing GlyphMatrix Developer Kit README: https://github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit
- [S2] Glyph Matrix SDK licence: https://raw.githubusercontent.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit/main/LICENSE.md
- [S3] Nothing wiki (third-party), Glyph Developer Kit: https://nothing.wiki/software/glyph_developer_kit
- [S4] PhoneArena on Nothing Playground: https://www.phonearena.com/news/nothing-playground-best-community-creative-feature_id180201
- [S5] NothingTec, Essential Apps and Playground (2025-09-30): https://nothingtec.com/en/2025/09/30/nothing-essential-apps-playground/
- [S6] TechCrunch, Nothing $200M Series C (2025-09-15): https://techcrunch.com/2025/09/15/nothing-closes-200m-series-c-led-by-tiger-global-plans-ai-first-device-launch
- [S6b] Wikipedia, Nothing Phone 3: https://en.wikipedia.org/wiki/Nothing_Phone_3
- [S7] Android Authority on the Glyph Matrix: https://www.androidauthority.com/nothing-glyph-matrix-gimmick-3602057
- [S8] Nothing Community, Nothing OS evolution / dot matrix use (forum, via search summary): https://nothing.community/d/61774-nothing-os-evolution
- [S9] uspto.report, Nothing Technology Ltd trademarks (third-party aggregator; fetch returned 403, so data comes from the search snippet): https://uspto.report/company/Nothing-Technology-L-T-D
- [S9b] Trade dress background: https://en.wikipedia.org/wiki/Trade_dress; USPTO non-traditional marks: https://www.uspto.gov/sites/default/files/documents/tm-non-traditional-marks-20251216.pdf
- [S10] TRMNL shop (OG): https://shop.trmnl.com/products/trmnl
- [S11] TRMNL X review (2026-08-28): https://truenetlab.com/en/blog/trmnl-x-e-ink-information-screen-review/
- [S12] TRMNL Creator Fund, July 2026: https://trmnl.com/blog/creator-fund-07-2026
- [S13] Indie Hackers, Ryan Kulp/TRMNL: https://www.indiehackers.com/post/e-commerce/after-8-years-in-b2b-saas-ryan-kulp-made-200k-in-5-months-with-his-first-hardware-product-xMMR0fmB8MXFoencrEXS
- [S14] TRMNL AI Agent help article: https://help.trmnl.com/en/articles/14130438-ai-agent
- [S15] Tom MacWright, "Tidbyt without the company": https://macwright.com/2025/04/12/tidbyt-second-life
- [S16] Hackaday, open source keeps Tidbyt afloat: https://hackaday.com/2025/03/29/open-source-framework-aims-to-keep-tidbyt-afloat/
- [S17] Tronbyt docs: https://tronbyt.com/what-is-tronbyt/ and server repo: https://github.com/tronbyt/server
- [S18] AWTRIX 3 repo (discontinued notice, Discord size): https://github.com/Blueforcer/awtrix3
- [S19] AWTRIX NG (licence): https://blueforcer.github.io/awtrix-ng/
- [S20] Ulanzi TC001 (US store): https://www.ulanzi.com/products/ulanzi-pixel-smart-clock-2882
- [S21] Ulanzi DE, TC001 vs LaMetric (Jun 2026): https://www.ulanzi.de/en/blogs/news-en/tc001-lametric-vergleich-2026
- [S22] LaMetric store: https://store.lametric.com/products/lametric
- [S23] LaMetric Market: https://apps.lametric.com/
- [S24] Vestaboard+ pricing: https://www.vestaboard.com/news/plus-pricing
- [S25] Vestaboard Note price increase: https://www.vestaboard.com/news/vestaboard-note-price-increases
- [S26] Wikipedia, Playdate: https://en.wikipedia.org/wiki/Playdate_(console)
- [S27] ScreenHub, Playdate showcase: https://www.screenhub.com.au/news/games/panic-playdate-game-showcase-2685272/
- [S28] Wikipedia, Teenage Engineering: https://en.wikipedia.org/wiki/Teenage_Engineering
- [S29] Engadget via AOL, TE Field pricing: https://www.aol.com/news/teenage-engineering-op1-tx6-expensive-fun-181029889.html
- [S30] scottbez1/splitflap: https://github.com/scottbez1/splitflap
- [S31] Particle community, AlfaZeta flip-dots: https://community.particle.io/t/controlling-an-electromagnetic-flip-disc-display-alfa-zeta-flip-dots/28200
- [S32] Gizmodo AU, Breakfast flip-disc: https://gizmodo.com.au/?p=1009901
- [S33] flipdisc.io: https://flipdisc.io
- [S34] GitHub REST API repo stats, queried 2026-10-23: `https://api.github.com/repos/<owner>/<repo>` for wled/WLED (18,902★), Blueforcer/awtrix3 (2,353), tronbyt/server (221), tidbyt/pixlet (846), usetrmnl/firmware (1,192), usetrmnl/byos_laravel (441), shadcn-ui/ui (126,295), magicuidesign/magicui (22,808), airbnb/lottie-web (32,265), rive-app/rive-runtime (1,238), rive-app/rive-wasm (1,011), processing/p5.js (24,162), pmndrs/react-three-fiber (33,176), mrdoob/three.js (116,812), lionleaf/dwitter (805), ibelick/motion-primitives (6,791), DavidHDev/react-bits (50,040), TheOrcDev/8bitcn-ui (2,059), Nothing-Developer-Programme/GlyphMatrix-Developer-Kit (312), modelcontextprotocol/ext-apps (3,001), ertdfgcvb/play.core (543), runevision/Dither3D (1,619), anuraghazra/github-readme-stats (79,839), badges/shields (27,300), vercel/satori (14,123), scottbez1/splitflap (4,184), hzeller/rpi-rgb-led-matrix (4,393), FastLED/FastLED (7,514), esphome/esphome (11,945), icantcodefyi/dot-matrix-animations (87), YashM20/dot-matrix (1)
- [S34b] GitHub REST API users/orgs/search: `https://api.github.com/users/dot480`, `/orgs/dot480`, `/users/dot-480`, `/orgs/dot-480` (all 404); `/search/repositories?q=dot480` (0 results)
- [S35] npm downloads API, week 2026-10-12…18: `https://api.npmjs.org/downloads/point/last-week/<pkg>`. lottie-web 4,314,430; @lottiefiles/dotlottie-web 948,585; @rive-app/canvas 695,630; @rive-app/react-canvas 599,859; p5 66,624; @react-three/fiber 3,993,061; three 14,115,096; shadcn 7,450,390; motion 15,750,774; framer-motion 31,049,591; @modelcontextprotocol/ext-apps 3,397,954; @modelcontextprotocol/sdk 39,432,481; satori 2,842,555; @vercel/og 1,358,247; canvas-dither 27,700; thinking-orbs 508,040 (30-day range 3,018,191 via `/downloads/range/last-month/`); ascii.rest 2,359; dot-anime-react 158
- [S36] npm registry: `https://registry.npmjs.org/<name>` for dot480, dot-480, @dot480/core, @dot480/react, dot-card, dot-matrix (404); dotmatrix, dotfield, dot-anime-react, thinking-orbs, ascii.rest (exist). Scope search: `https://registry.npmjs.org/-/v1/search?text=scope:dot480` (0)
- [S37] RDAP: `https://rdap.verisign.com/com/v1/domain/dot480.com`, `…/net/v1/domain/dot480.net`, `https://pubapi.registry.google/rdap/domain/dot480.dev` and `/dot480.app`, `https://rdap.identitydigital.services/rdap/domain/dot480.io` and `/dot480.studio`, `https://rdap.publicinterestregistry.org/rdap/domain/dot480.org`, `https://rdap.centralnic.com/xyz/domain/dot480.xyz` (all 404). Method checked against google.com, web.dev, bit.io, get.app, python.org, gen.xyz (all returned records).
- [S38] Hacker News via Algolia API `https://hn.algolia.com/api/v1/search` (stories, points > 80, since 2024-10-01, plus all-time queries). Items: https://news.ycombinator.com/item?id=49711544, …=42135520, …=46657122, …=41742210, …=47875795, …=43942881, …=42084080, …=47406160, …=49993857, …=45750954, …=46770274, …=44212446, …=49854219, …=40450128, …=46020502, …=47939079, …=48693912, …=42137513, …=49010348, …=25633483, …=13700698, …=26858741, …=24974534
- [S39] Magic UI Pro: https://pro.magicui.design/
- [S40] Aceternity UI pricing: https://ui.aceternity.com/pricing
- [S41] Motion+ pricing: https://motion.dev/pricing; sponsorship: https://motion.dev/sponsor
- [S42] Rive pricing: https://rive.app/pricing
- [S43] LottieFiles pricing (third-party): https://toolradar.com/tools/lottiefiles/pricing; plans and limits: https://docs.lottiefiles.com/en/integrations/figma/03_workspace/plans-and-limits
- [S44] Spline pricing (Capterra): https://www.capterra.com/p/10021565/Spline/; seed round: https://appmaster.io/news/3d-no-code-design-solution-spline-secures-15m
- [S45] Sacra, Framer: https://sacra.com/c/framer/
- [S46] Tailwind: The Register (2026-09-10) https://www.theregister.com/devops/2026/09/10/shopify-extends-lifeline-to-tailwind-as-vibe-coding-erodes-web-dev-platforms-bottom-line/5295672; PPC Land on the layoffs https://ppc.land/tailwind-css-lays-off-75-of-engineering-team-as-ai-impacts-revenue/; revenue/day figures https://danjcleary.substack.com/p/ai-is-both-propelling-and-undermining
- [S47] shadcn namespaces/registry docs: https://ui.shadcn.com/docs/registry/namespace; https://registry.directory/; https://shadcnregistry.com/; "~300 registries" (vendor blog): https://shadcnuikit.com/blog/10-free-shadcn-community-registries
- [S48] Hunted.space, Magic UI on PH: https://hunted.space/dashboard/magic-ui-2
- [S49] Product Hunt, 8bitcn: https://www.producthunt.com/products/8bitcn
- [S50] thinking-orbs: https://gittrend.io/repo/Jakubantalik/thinking-orbs; https://orbs.jakubantalik.com/; PH coverage https://aitoolly.com/ai-news/article/2026-10-05-thinking-orbs-launches-on-product-hunt-enhancing-visual-feedback-and-user-experience-in-modern-ai-in
- [S51] ascii.rest: https://ascii.rest/
- [S52] dot/matrix loaders: https://dot-matrix-animations.vercel.app/; https://github.com/icantcodefyi/dot-matrix-animations
- [S53] Framer Marketplace, Dot Matrix Icon: https://www.framer.com/community/marketplace/components/dotmatrixicon/
- [S54] MCP Apps announcement (2026-01-26): https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/; SEP-1865: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp; host gaps: https://alpic.ai/blog/mcp-apps-goes-official-claude-chatgpt-support
- [S55] MCP apps census, Aug 2026 (search summary; direct fetch returned 429): https://www.nicolassitter.com/research/mcp-apps-census-2026
- [S56] MCP registries compared (2026-07-14): https://thinkneo.ai/blog/mcp-registries-compared-20260714; https://unyly.org/mcp-directories
- [S57] Home Assistant analytics: https://analytics.home-assistant.io/
- [S58] Espressif, 1 billion chips: https://www.espressif.com/en/news/1_Billion_Chip_Sales
- [S59] Surma, Ditherpunk: https://surma.dev/things/ditherpunk/
- [S60] Icons8 design trends 2026–27: https://icons8.com/blog/articles/design-trends-for-2027/; MBB 2026 trends: https://mbbagency.com/blog/six-design-trends-in-2026/
- [S61] Shields.io donate page (mirror): https://shields.mitmproxy.org/donate
- [S62] github-readme-stats issue #2130: https://github.com/anuraghazra/github-readme-stats/issues/2130; issue #4748: https://github.com/anuraghazra/github-readme-stats/issues/4748
- [S63] Bannerbear pricing (third-party): https://templated.io/blog/best-bannerbear-alternatives/; Placid: https://toolradar.com/tools/placid/pricing
- [S64] LVGL Pro pricing: https://pro.lvgl.io/pricing; licensing announcement: https://lvgl.io/blog/announcement-lvgl-pro-licensing
- [S65] Wikipedia, Shadertoy: https://en.wikipedia.org/wiki/Shadertoy
- [S66] Cloudscape "Thinking" pattern: https://cloudscape.design/gen-ai/patterns/thinking/
- [S67] NothingTec, community Glyph Matrix Editor: https://nothingtec.com/?p=2410
- [S68] Nothing blog, community Ndot work: https://au.nothing.tech/blogs/news/celebrating-our-communitys-work
- [S69] FontLab blog (2026-03-24): https://blog.fontlab.com/2026/03/24/dithering-ditherpunk-and-bill-atkinson/
- [S72] Project repo: https://github.com/YashM20/dot-matrix
- [S73] GitHub topic `epaper`: https://github.com/topics/epaper
