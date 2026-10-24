/**
 * P6 authoring tools (docs/MASTER-PLAN.md P6 "AI authoring", §2.7): render_card, score_card,
 * refine_card, record_verdict, push_to_device. The logic lives in `scripts/author/` (headless,
 * Node built-ins only); this file is the MCP surface. No LLM is called here: the host model is the
 * critic, it reads renders + scores and steers `refine_card` with `feedback`.
 *
 * TODO(spec v1): accept a card spec v1 document (`src/spec`, landed in P6-A) as the card input; for
 * now a card is `{ id }` (any preset) or `{ ir, grid?, lattice?, tone?, accent?, … }`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { describeText, resolveCard, TONES, type CardRef, type IRCard } from '../../scripts/author/card'
import { exemplars, fitBT } from '../../scripts/author/bt'
import { refine } from '../../scripts/author/refine'
import { scoreAuthored } from '../../scripts/author/score'
import { appendVerdict, readVerdicts, verdictsPath } from '../../scripts/author/verdicts'
import { renderCard, sampleCard, visible } from '../../scripts/lib/cards'

const irFields = {
  ir: z.string().min(1).max(4096).describe('Field IR (`dot`) source: an expression in u, v ∈ [0,1], t, data.*, pointer.*; value 0…1 per dot'),
  grid: z.object({ cols: z.number().int().min(8).max(256), rows: z.number().int().min(8).max(256), pitch: z.number().positive().max(16).optional() }).optional().describe('Card grid, default 144×144 at 2.25 px (TILE)'),
  lattice: z.number().min(.5).max(8).optional().describe('Lattice factor of the main layer; ladder {0.72,1,1.3,1.6,2,2.5,3,4}; default 1'),
  tone: z.enum(TONES).optional().describe("Tone of the main layer; default 'auto' (grey by value). 'active' is the board's single red accent"),
  accent: z.string().min(1).max(4096).optional().describe('Optional accent IR program, lit in red where value ≥ accentCut'),
  accentCut: z.number().min(0).max(1).optional(),
  gain: z.number().min(.1).max(8).optional().describe('Contrast about 0.5, default 1'),
  level: z.number().min(-1).max(1).optional().describe('Brightness offset, default 0'),
  speed: z.number().min(0).max(8).optional().describe('Time scale for t, default 1'),
  data: z.record(z.string(), z.number()).optional(),
  name: z.string().max(64).optional(),
}
const cardInput = z.object({ id: z.string().optional().describe('A preset card id (e.g. level-03); or give `ir` instead'), ...irFields, ir: irFields.ir.optional() })
type CardInput = z.infer<typeof cardInput>

const toRef = (a: CardInput): CardRef => {
  if (a.id) return { id: a.id }
  if (!a.ir) throw new Error('give either `id` (a preset) or `ir` (Field IR source)')
  const { id: _id, ...card } = a
  return card as IRCard
}
const fail = (e: unknown): CallToolResult => ({ isError: true, content: [{ type: 'text', text: (e as Error).message ?? String(e) }] })
const text = (s: string, structuredContent?: Record<string, unknown>): CallToolResult => ({ content: [{ type: 'text', text: s }], ...(structuredContent && { structuredContent }) })

function preference(key: string) {
  const records = readVerdicts()
  if (!records.length) return undefined
  const fit = fitBT(records), me = fit.items.find(x => x.key === key)
  return { rank: me?.rank ?? null, of: fit.items.length, strength: me?.strength ?? null, exemplars: exemplars(fit) }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function registerAuthorTools(server: McpServer) {
  server.registerTool('render_card', {
    title: 'Render card',
    description: 'Render a Dot/480 card headlessly to PNG: a preset `{ id }` or an authored Field IR card `{ ir, grid?, lattice?, tone?, accent?, … }`. Returns the image plus a text description. Use it to look at what you authored before scoring or refining.',
    inputSchema: cardInput.extend({ t: z.number().min(0).max(3600).optional().describe('Time in seconds, default 0'), px: z.number().int().min(1).max(4).optional().describe('Output px per CSS px, default 2') }),
    annotations: { readOnlyHint: true },
  }, async (a): Promise<CallToolResult> => {
    try {
      const { key, preset } = resolveCard(toRef(a)), t = a.t ?? 0
      const png = renderCard(preset, { px: a.px ?? 2, t }).png()
      const summary = describeText(preset, t)
      return { content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: `${key}: ${summary}` }], structuredContent: { key, summary, bytes: png.length } }
    } catch (e) { return fail(e) }
  })

  server.registerTool('score_card', {
    title: 'Score card',
    description: 'Automated fidelity scorecard for a card (same input as render_card): gates G1–G5 plus tonal depth, density and motion-legibility proxies, with metrics; and, when like/kill history exists, the card\'s Bradley–Terry rank and the liked/killed exemplars to compare against. Taste (silhouette, hierarchy, story) is yours to judge from render_card.',
    inputSchema: cardInput,
    annotations: { readOnlyHint: true },
  }, async (a): Promise<CallToolResult> => {
    try {
      const { key, preset } = resolveCard(toRef(a)), s = scoreAuthored(preset), pref = preference(key)
      const lines = s.gates.map(g => `${g.pass ? 'ok  ' : 'FAIL'} ${g.id} ${g.name}: ${g.value} (want ${g.want})`)
      const head = `${key}: ${s.passed}/${s.total} gates${s.pass ? ' — PASS' : ''}`
      const prefLine = pref ? `\npreference: ${pref.rank ? `rank ${pref.rank}/${pref.of}` : `unranked (${pref.of} cards in history)`}; liked ${pref.exemplars.like.join(', ') || '-'}; killed ${pref.exemplars.kill.join(', ') || '-'}` : ''
      const { fidelity: f, ...rest } = s
      return text(`${head}\n${lines.join('\n')}${prefLine}`, { key, ...rest, fidelity: { g1: f.g1, g2: f.g2, g3: f.g3, g5: f.g5, motion: f.motion ?? null }, ...(pref && { preference: pref }) })
    } catch (e) { return fail(e) }
  })

  server.registerTool('refine_card', {
    title: 'Refine card',
    description: 'Run the deterministic local refinement loop on an IR card: render → score → rule-based revisions for the failing gates (snap/raise lattice, shrink accent area, raise contrast, adjust level, slow time) → re-score; a round is kept only if it scores better. Stops at the gate or after `rounds`. Returns every round. There is no model inside: you are the critic — pass your critique as `feedback` (keywords like "more contrast", "less red", "bigger dots", "too busy", "flicker") and call again.',
    inputSchema: z.object({ ...irFields, feedback: z.string().max(2000).optional(), rounds: z.number().int().min(0).max(12).optional().describe('Max rounds, default 4') }),
  }, async (a): Promise<CallToolResult> => {
    try {
      const { feedback, rounds, ...card } = a
      const r = refine(card as IRCard, { feedback, rounds })
      const lines = r.rounds.map(x => `r${x.round} ${x.score.passed}/${x.score.total} failing [${x.score.failing.join(' ')}]${x.accepted.length ? ` ← ${x.accepted.join('; ')}` : ''}`)
      return text(`stopped: ${r.stopped}\n${lines.join('\n')}\nfinal card: ${JSON.stringify(r.card)}`, { stopped: r.stopped, rounds: r.rounds, card: r.card, passed: r.score.passed, total: r.score.total, pass: r.score.pass })
    } catch (e) { return fail(e) }
  })

  server.registerTool('record_verdict', {
    title: 'Record verdict',
    description: 'Record the user\'s like/kill verdict on a card (only when the user said so). Appends to the local history (.dot480/verdicts.jsonl) that score_card ranks with Bradley–Terry.',
    inputSchema: cardInput.extend({ verdict: z.enum(['like', 'kill']), note: z.string().max(500).optional() }),
  }, async (a): Promise<CallToolResult> => {
    try {
      const { verdict, note, ...rest } = a, ref = toRef(rest), { key, card } = resolveCard(ref)
      appendVerdict({ key, verdict, note, card })
      const pref = preference(key)!
      return text(`${verdict} recorded for ${key}; rank ${pref.rank}/${pref.of}`, { key, verdict, rank: pref.rank, of: pref.of, path: verdictsPath() })
    } catch (e) { return fail(e) }
  })

  server.registerTool('push_to_device', {
    title: 'Push to device',
    description: 'Send a card frame (dot list) to a local device. Not configured by default: target "http" needs DOT480_DEVICE_URL pointing at a loopback address, target "file" needs DOT480_DEVICE_DIR. Never contacts anything else.',
    inputSchema: cardInput.extend({ target: z.enum(['http', 'file']), t: z.number().min(0).max(3600).optional() }),
  }, async (a): Promise<CallToolResult> => {
    try {
      const { target, t = 0, ...rest } = a, { key, preset } = resolveCard(toRef(rest))
      const url = process.env.DOT480_DEVICE_URL, dir = process.env.DOT480_DEVICE_DIR
      const notConfigured = (why: string) => text(`not configured: ${why}`, { status: 'not-configured', target })
      if (target === 'http' && !url) return notConfigured('set DOT480_DEVICE_URL to a loopback URL (http://127.0.0.1:…)')
      if (target === 'file' && !dir) return notConfigured('set DOT480_DEVICE_DIR to a local folder')
      const dots = sampleCard(preset, t).filter(visible).map(d => [+d.x.toFixed(2), +d.y.toFixed(2), +d.r.toFixed(3), +d.opacity.toFixed(3), d.color])
      const frame = { key, cols: preset.grid.cols, rows: preset.grid.rows, pitch: preset.grid.pitch ?? null, t, dots }
      if (target === 'file') {
        mkdirSync(dir!, { recursive: true })
        const path = join(dir!, `${key.replace(/[^\w.-]/g, '_')}.json`)
        writeFileSync(path, JSON.stringify(frame))
        return text(`wrote ${dots.length} dots to ${path}`, { status: 'written', target, path, dots: dots.length })
      }
      const u = new URL(url!)
      if (!/^https?:$/.test(u.protocol) || !LOOPBACK.has(u.hostname)) return fail(new Error(`refusing ${u.origin}: DOT480_DEVICE_URL must be a loopback http(s) URL`))
      const res = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(frame), signal: AbortSignal.timeout(3000) })
      return text(`sent ${dots.length} dots to ${u.origin}: HTTP ${res.status}`, { status: res.ok ? 'sent' : 'device-error', target, httpStatus: res.status, dots: dots.length })
    } catch (e) { return fail(e) }
  })
}
