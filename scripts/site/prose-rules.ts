/**
 * The prose lint's rules (scripts/site/prose-lint.ts; the voice they enforce is docs/WRITING.md). Each rule has an id,
 * a severity and a hint that says how to fix the sentence. `error` rules are the high-confidence tells and fail
 * `pnpm check`; `warn` rules are fuzzier and only print.
 *
 * Regex rules run on every block (headings too) against a copy where curly apostrophes are straight, so `'` in a
 * pattern also matches `’`. `check` rules run on prose blocks only, unless `on` says otherwise.
 */

export type Severity = 'error' | 'warn'
export type Kind = 'prose' | 'heading'
/** One block of visitor text (a paragraph, list item, caption or heading), whitespace-collapsed, with a source map. */
export interface Block { file: string; src: string; kind: Kind; text: string; map: number[]; bold: [number, number][] }
export interface Hit { at: number; len: number }
export interface Rule {
  id: string
  severity: Severity
  /** how to fix it, in a few words */
  hint: string
  re?: RegExp
  check?: (b: Block) => Hit[]
  on?: Kind | 'all'
}

const words = (s: string) => s.match(/[A-Za-z][\w'’-]*/g)?.length ?? 0
export const all = (re: RegExp, s: string) => [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]
const S = '(?:^|[.!?:] )' // sentence start

const VOCAB = [
  'delve[sd]?', 'delving', 'tapestry', 'testament', 'intricate(?:ly)?', 'intricacies', 'pivotal', 'seamless(?:ly)?', 'robust(?:ly|ness)?',
  'leverag(?:e|es|ed|ing)', 'elevat(?:e|es|ed|ing)', '(?<!(?:long-press|hold to|press to|swipe to|slide to) )unlock(?:s|ed|ing)?', 'realms?', 'vibrant', 'showcas(?:e|es|ed|ing)',
  'underscor(?:e|es|ed|ing)', 'boasts?', 'boasting', 'nestled', 'crucial(?:ly)?', 'foster(?:s|ed|ing)?', 'embark(?:s|ed|ing)?',
  'journey', 'meticulous(?:ly)?', 'bolster(?:s|ed|ing)?', 'garner(?:s|ed|ing)?', 'interplay', 'multifaceted', 'groundbreaking',
  'renowned', 'game-?changer', 'cutting-edge', 'ever-evolving', 'synerg(?:y|ies)', 'holistic', 'paradigm', 'empower(?:s|ed|ing)?',
  'unparalleled', 'transformative', 'harmonious(?:ly)?', 'captivating', 'breathtaking', 'indelible', 'enduring legacy',
  'utiliz(?:e|es|ed|ing)', 'streamlin(?:e|es|ed|ing)', 'effortless(?:ly)?', 'supercharg(?:e|es|ed|ing)', 'revolutioniz(?:e|es|ed|ing)',
]
/** Literal senses stay allowed: "a long-press unlock" on a lock screen (in VOCAB), and "landscape" as an orientation (landscape mode, the landscape side sheet). */
const LANDSCAPE = '\\b(?<!in )landscapes?\\b(?! (?:mode|orientation|side|sheet|layout|phone|view|screen)s?\\b)'

/** An en dash is fine between two numbers or ids with digits (2–4, Q2–Q3) and between two names (Gray–Scott). */
function badEnDashes(b: Block): Hit[] {
  return all(/–/, b.text).filter(m => {
    const i = m.index!
    const before = /[\w.×%]*$/.exec(b.text.slice(0, i))![0], after = /^[\w.×%]*/.exec(b.text.slice(i + 1))![0]
    const range = /\d/.test(before) && /\d/.test(after)
    const names = /^[A-Z][a-z]+$/.test(before) && /^[A-Z][a-z]+$/.test(after)
    return !range && !names
  }).map(m => ({ at: m.index!, len: 1 }))
}

export const RULES: Rule[] = [
  // ---- errors: high-confidence tells -----------------------------------------------------------------------------
  { id: 'banned-word', severity: 'error', hint: 'an inflated word; say the plain thing ("uses", "shows", "important")',
    re: new RegExp(`\\b(?:${VOCAB.join('|')})\\b|${LANDSCAPE}`, 'i') },
  { id: 'stock-phrase', severity: 'error', hint: 'a stock phrase that says nothing; cut it or state the fact',
    re: /\b(?:let'?s dive in|dive (?:in|into)|deep dive|in today'?s|fast-paced|in conclusion|it'?s worth noting|worth noting that|it should be noted|plays? an? (?:crucial|key|pivotal|vital|important|central) role|stands as an?|serves as an?|whether you'?re|a reminder that|in the heart of|at the end of the day|the world of|look no further|unleash(?:es|ed)?|rich history|a wide (?:range|array|variety) of|diverse array|when it comes to|in the realm of|navigat(?:e|ing) the)\b/i },
  { id: 'filler-opener', severity: 'error', hint: 'a padding transition; start the sentence with the point',
    re: new RegExp(`${S}(?:Moreover|Furthermore|Additionally|Ultimately|In summary|In short|Overall|All in all|In essence|Notably|Importantly),`) },
  { id: 'em-dash', severity: 'error', hint: 'no em dashes; use a period, comma, colon or parentheses', re: /—| -- / },
  { id: 'en-dash', severity: 'error', hint: 'an en dash only joins number ranges (2–4) or two names; use a period, comma or "to"', check: badEnDashes, on: 'all' },
  { id: 'emoji', severity: 'error', hint: 'no emoji in prose; cut it', re: /(?![©®™↔↕])\p{Extended_Pictographic}/u },
  { id: 'its-not-x-its-y', severity: 'error', hint: 'contrast frame ("it\'s not X, it\'s Y"); say what it is',
    re: /\b(?:it'?s|it is|this is|that'?s|that is) not\b[^.!?]{1,60}?[,;:] ?(?:it'?s|it is|but|this is|that'?s)\b/i },
  { id: 'not-just', severity: 'error', hint: 'contrast frame ("not just X but Y"); list the things plainly', re: /\bnot (?:just|only|merely|simply)\b/i },
  { id: 'isnt-x-its-y', severity: 'error', hint: 'contrast frame ("X isn\'t Y. It\'s Z."); state Z',
    re: /\b(?:isn'?t|is not|aren'?t|are not|wasn'?t|was not)\b[^.!?;]{1,80}(?:\. (?:it'?s|it is|it was|this is|that'?s|that is|they'?re|they are)\b(?! not)|; (?:it|this|that|they) (?!(?:does|is|are|was|do)n'?t\b|(?:does|is|are|do) not\b)\w+)/i },
  { id: 'not-x-but-y', severity: 'error', hint: 'contrast frame ("not X but Y"); state Y', re: /\b(?:not|isn'?t|aren'?t)\b [^.,;:!?]{1,40} but (?!also\b)/i },
  { id: 'not-about', severity: 'error', hint: 'contrast frame ("X isn\'t about Y"); say what it is about', re: /\b(?:isn'?t|is not|aren'?t|are not|wasn'?t|not) (?:really |just )?about\b/i },
  { id: 'less-x-more-y', severity: 'error', hint: 'contrast frame ("less X, more Y"); say what it has', re: /\bless [\w-]+(?: [\w-]+)?[,.;] (?:and )?more\b/i },
  { id: 'not-because', severity: 'error', hint: 'contrast frame ("not because X but because Y"); give the real reason', re: /\bnot because\b[^.!?]{0,120}\bbut because\b/i },
  { id: 'rather-than-reveal', severity: 'error', hint: 'contrast opener ("Rather than X, Y"); start with Y', re: new RegExp(`${S}Rather than\\b`) },
  { id: 'no-no-just', severity: 'error', hint: 'fragment triplet ("No X. No Y. Just Z."); write one plain sentence',
    re: /\bno [^.!?,;]{1,40}[.,] no [^.!?,;]{1,40}[.,] (?:just|only)\b/i },
  { id: 'setup-reveal', severity: 'error', hint: 'set-up then reveal ("Here\'s the thing:", "The result?"); just say it',
    re: new RegExp(`${S}(?:Here(?:'s| is) (?:the \\w+|why|how|what|where)\\b|(?:And |But |So )?The (?:catch|result|kicker|twist|upshot|takeaway|answer|secret|trick|problem|best part|bottom line)[?:])`) },

  // ---- warnings: fuzzier, read them and fix the real ones --------------------------------------------------------
  { id: 'rhetorical-q', severity: 'warn', hint: 'a question answered in the next sentence; make the statement', re: /[A-Za-z][^.!?]{2,120}\? (?=[A-Z])/ },
  { id: 'cliche-opener', severity: 'warn', hint: '"It turns out", "Think of it as", "Imagine"; start with the fact',
    re: new RegExp(`\\bit turns out\\b|\\bthink of (?:it|this|them) (?:as|like)\\b|${S}Imagine\\b`, 'i') },
  { id: 'from-x-to-y', severity: 'warn', hint: '"From X to Y," opener; name the things directly', re: new RegExp(`${S}From [^,.!?]{1,50} to [^,.!?]{1,50},`) },
  { id: 'x-meets-y', severity: 'warn', hint: '"X meets Y"; say what the thing does', re: /\b\w+ meets (?!the |a |an |its |every |all |our |your |this |that |\d)\w+/i },
  { id: 'moral-close', severity: 'warn', hint: 'a one-line moral ("And that\'s the point."); end on the last fact',
    re: /\b(?:that'?s|this is|that is|it is|it'?s|which is) (?:the (?:whole )?(?:point|magic|beauty|secret|key|idea)|what matters)\b|(?:^|[.!?] )And that'?s [^.!?]{1,40}[.!]$/i },
  { id: 'comma-not', severity: 'warn', hint: '", not Y" tail, often a soft contrast frame; keep it only if the reader needs Y', re: /, not (?:a |an |the |per )?\w+/ },
  { id: 'triplets', severity: 'warn', hint: '3+ "X, Y and Z" lists in one paragraph; keep the list that carries facts',
    check: b => { const m = all(/\b[\w'-]+(?: [\w'-]+)?, [\w'-]+(?: [\w'-]+){0,2},? (?:and|or) [\w'-]+/, b.text); return m.length >= 3 ? [{ at: m[2].index!, len: m[2][0].length }] : [] } },
  { id: 'hedging', severity: 'warn', hint: 'hedge words pile up; commit to the claim or cut it',
    check: b => { const m = all(/\b(?:may|might|potentially|perhaps|possibly|arguably|somewhat|seemingly|generally|typically)\b/i, b.text); return m.length >= 3 || (m.length >= 2 && words(b.text) < 40) ? [{ at: m.at(-1)!.index!, len: m.at(-1)![0].length }] : [] } },
  { id: 'bold-in-prose', severity: 'warn', hint: 'bold inside running prose; keep bold for a run-in lead',
    check: b => b.bold.filter(([s], i) => i > 0 || b.text.slice(0, s).trim() !== '').map(([s, e]) => ({ at: s, len: e - s })) },
  { id: 'title-case', severity: 'warn', hint: 'Title Case heading; use sentence case', on: 'heading',
    check: b => { const w = b.text.match(/[A-Za-z][\w'-]*/g) ?? []; const big = w.slice(1).filter(x => !/^(?:a|an|the|and|or|of|in|on|to|for|with|at|by|vs)$/i.test(x) && x !== x.toUpperCase()); return big.length >= 2 && big.every(x => /^[A-Z]/.test(x)) ? [{ at: 0, len: b.text.length }] : [] } },
]

export const FILE_RULES: { id: string; severity: Severity; hint: string; check: (bs: Block[]) => [Block, Hit][] }[] = [
  { id: 'quote-mix', severity: 'warn', hint: 'straight and curly quotes mixed in one file; pick one',
    check: bs => {
      const curly = bs.flatMap(b => all(/[‘’“”]/, b.text).map(m => [b, { at: m.index!, len: 1 }] as [Block, Hit]))
      const straight = bs.flatMap(b => all(/['"]/, b.text).map(m => [b, { at: m.index!, len: 1 }] as [Block, Hit]))
      return curly.length && straight.length ? (curly.length <= straight.length ? curly : straight) : []
    } },
]
