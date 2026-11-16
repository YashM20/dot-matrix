/**
 * Changelog fragments (`changes/README.md`): a PR that changes `src/` adds one `changes/<branch>.md` with a
 * `visitor:` line and an `engineering:` line. The release lane folds them into CHANGELOG.md and src/changelog.ts.
 *
 *   pnpm exec tsx scripts/site/changes.ts   → warn when the branch changes src/ and adds no fragment, or a fragment
 *                                              lacks a line. Always exits 0. Runs in `pnpm check`.
 *
 * The diff is taken against `origin/main`: in a pull_request run it fetches main and diffs the merge commit against
 * it; locally it diffs the merge base with the working tree. Skipped on `main`, when there is no `origin/main`,
 * and on a release branch (one that edits CHANGELOG.md, since it folds the fragments in).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const tryGit = (...args: string[]): string | null => { try { return git(...args) } catch { return null } }
const skip = (why: string): never => { console.log(`changes: skipped (${why})`); process.exit(0) }

const ci = process.env.GITHUB_ACTIONS === 'true'
const branch = process.env.GITHUB_HEAD_REF || tryGit('rev-parse', '--abbrev-ref', 'HEAD') || ''
if (branch === 'main' || process.env.GITHUB_REF === 'refs/heads/main') skip('on main')
if (ci && process.env.GITHUB_EVENT_NAME !== 'pull_request') skip('not a pull request')

// CI checks out the PR's merge commit with depth 1, so origin/main has to be fetched first
if (ci) tryGit('fetch', '--no-tags', '--depth=1', 'origin', '+refs/heads/main:refs/remotes/origin/main')
if (!tryGit('rev-parse', '--verify', '--quiet', 'origin/main')) skip('no origin/main')

// a merge commit's tree minus main's tree is the PR; locally, the merge base against the working tree
const base = ci ? 'origin/main' : tryGit('merge-base', 'origin/main', 'HEAD')
if (!base) skip('no merge base with origin/main')
const rows = (tryGit('diff', '--name-status', '--no-renames', base!) ?? '').split('\n').filter(Boolean)
  .map(l => { const [status, path] = l.split('\t'); return { status, path } })
// files added locally and not yet staged don't show in a diff
const untracked = (tryGit('ls-files', '--others', '--exclude-standard', 'changes') ?? '').split('\n').filter(Boolean)

if (rows.some(r => r.path === 'CHANGELOG.md')) skip('release branch: it folds the fragments in')
const touchesSrc = rows.some(r => r.path.startsWith('src/'))
const isFragment = (p: string): boolean => /^changes\/[^/]+\.md$/.test(p) && p !== 'changes/README.md'
const added = [...rows.filter(r => r.status !== 'D').map(r => r.path), ...untracked].filter(isFragment)

const warns: string[] = []
if (touchesSrc && added.length === 0) {
  const name = `changes/${branch.replace(/[^\w.-]+/g, '-') || '<branch>'}.md`
  warns.push(`this branch changes src/ but adds no changelog fragment; add ${name} (see changes/README.md)`)
}
for (const f of added) {
  if (!existsSync(f)) continue
  const text = readFileSync(f, 'utf8')
  for (const key of ['visitor', 'engineering']) {
    if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(text)) warns.push(`${f}: needs its "${key}:" line`)
  }
}

for (const w of warns) console.log(`⚠ changes: ${w}`)
console.log(`changes: ${added.length} fragment(s), ${warns.length} warning(s) (warn only)`)
