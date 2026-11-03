/**
 * Cut a release: verify, bump the version, close the changelog section, commit,
 * tag, push.
 *
 * The publish itself is not done here. Pushing the tag triggers
 * `.github/workflows/publish.yml`, which publishes through npm Trusted
 * Publishing (OIDC) with provenance. Keeping the two apart means a failed
 * publish is re-runnable from the Actions page without touching the repo.
 *
 *   node scripts/release.mjs            # patch bump: 0.2.1 → 0.2.2
 *   node scripts/release.mjs minor      # 0.2.1 → 0.3.0
 *   node scripts/release.mjs 1.0.0      # explicit version
 *   node scripts/release.mjs --dry-run  # verify and print, change nothing
 *   node scripts/release.mjs --no-push  # commit and tag, leave the push to you
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`usage: node scripts/release.mjs [patch|minor|major|<x.y.z>] [--dry-run] [--no-push]

  patch|minor|major  bump kind (default patch)
  <x.y.z>            explicit version
  --dry-run          verify and report, write nothing
  --no-push          commit and tag locally, leave the push to you`)
  process.exit(0)
}
const dryRun = args.includes('--dry-run')
const noPush = args.includes('--no-push')
const bump = args.find(arg => !arg.startsWith('--')) ?? 'patch'

/**
 * Run a command and return its trimmed stdout.
 * @param {string} file - executable.
 * @param {string[]} argv - arguments.
 * @param {boolean} stream - show the child's output instead of capturing it.
 * @returns {string} stdout (empty when streamed).
 */
function run(file, argv, stream = false) {
  if (stream) {
    execFileSync(file, argv, { stdio: 'inherit' })
    return ''
  }
  return execFileSync(file, argv, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim()
}

/**
 * Print a step heading.
 * @param {string} text - step description.
 */
function step(text) {
  console.log(`\n› ${text}`)
}

/**
 * Abort the release.
 * @param {string} reason - what went wrong.
 */
function fail(reason) {
  console.error(`\nrelease: ${reason}\n`)
  process.exit(1)
}

// 1. A release must start from a clean, pushed tree: the tag has to describe
// exactly the commit that CI will check out.
step('checking the working tree')
const status = run('git', ['status', '--porcelain'])
if (status !== '') fail(`working tree is dirty:\n${status}`)
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'master' && branch !== 'main') fail(`refusing to release from branch "${branch}"`)

// 2. The version this release will carry.
const pkgText = readFileSync('package.json', 'utf8')
const pkg = JSON.parse(pkgText)
const current = pkg.version
const explicit = /^\d+\.\d+\.\d+$/.test(bump)
const [major, minor, patchNumber] = current.split('.').map(Number)
const next = explicit
  ? bump
  : bump === 'major' ? `${major + 1}.0.0`
    : bump === 'minor' ? `${major}.${minor + 1}.0`
      : bump === 'patch' ? `${major}.${minor}.${patchNumber + 1}`
        : fail(`unknown bump "${bump}" (use patch, minor, major or a version)`)
if (next === current) fail(`version is already ${current}`)
step(`version ${current} → ${next}`)

// 3. A tag that already exists would make the publish job a no-op.
if (run('git', ['tag', '--list', `v${next}`]) !== '') fail(`tag v${next} already exists`)

// 4. The changelog section is the release note; refuse to ship an empty one.
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const HEADING = '## 未发布'
if (!changelog.startsWith(`# Changelog\n\n${HEADING}`)) {
  fail(`CHANGELOG.md must start with "${HEADING}" and list this release's entries`)
}
const body = changelog.slice(`# Changelog\n\n${HEADING}`.length).split('\n## ')[0]
if (body.replace(/- \[ \]/g, '').trim() === '') fail('the 未发布 section has no entries')

// 5. Everything the publish job will run, run here first.
step('verify (typecheck, tests, build, smoke)')
run('pnpm', ['verify'], true)

const today = new Date().toISOString().slice(0, 10)
if (dryRun) {
  step(`dry run: would set ${next}, retitle the changelog to "${next} — ${today}", commit, tag v${next}${noPush ? '' : ' and push'}`)
  process.exit(0)
}

// 6. Write the two files the release touches.
pkg.version = next
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
writeFileSync('CHANGELOG.md', changelog.replace(`${HEADING}`, `## ${next} — ${today}`))

step('commit and tag')
run('git', ['add', 'package.json', 'CHANGELOG.md'])
run('git', ['commit', '-m', `release: ${next}`], true)
run('git', ['tag', `v${next}`])

if (noPush) {
  console.log(`\nrelease: committed and tagged v${next}. Push when ready:\n  git push && git push origin v${next}\n`)
  process.exit(0)
}

step('push (this triggers the publish workflow)')
run('git', ['push'], true)
run('git', ['push', 'origin', `v${next}`], true)

console.log(`\nrelease: v${next} pushed. Watch the run at
  https://github.com/raven3005672/dsh-plugin-highlight-notes/actions
Then confirm: npm view dsh-plugin-highlight-notes dist-tags --json\n`)
