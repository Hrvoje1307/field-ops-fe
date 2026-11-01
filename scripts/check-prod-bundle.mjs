// A build with VITE_API_MOCK=false must contain none of the mock: not MSW, not the seed
// data, not the triggers only the mock understands. Builds the app the way production
// does and reads every file of dist/.
//   pnpm check:prod-bundle
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'

/** What must not be in a production bundle, and what it would mean. */
const FORBIDDEN = [
  [/mockServiceWorker/, "MSW's worker script"],
  [/\[MSW\]|@mswjs|mswjs\.io|msw\/browser|setupWorker/, 'the MSW library'],
  [/Alarmko|Bura klima|Čisto d\.o\.o\.|Ivana Babić/, 'a seed tenant or person'],
  [/@alarmko\.test|@bura\.test|@cisto\.test|ana@demo\.test/, 'a seed account'],
  [/__fieldops/, 'a hook of the mock for the console and the tests'],
  [/fieldops\.mock\./, 'a storage key of the mock'],
  [/mock-oauth|Dopusti pristup/, "the mock's stand-in for a mail provider"],
  [/MOCK_AI_|MOCK_CONNECT/, 'a constant of the mock'],
  // `.invalid` alone is in other code too (a URL parsed against a dummy host, zod); the mock's own uses are these
  [/endsWith\(["'`]\.invalid["'`]\)|hub\.invalid/, "the mock's way to make a connection test fail"],
]

const run = (command, args, env) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

// `--no-build` reads the dist/ that is there (to see that the check does find the mock in a build that has it)
if (!process.argv.includes('--no-build')) {
  rmSync(DIST, { recursive: true, force: true })
  // The same build as production: the mock off, whatever .env.local says
  run('pnpm', ['build'], {
    VITE_API_MOCK: 'false',
    VITE_API_URL: process.env.VITE_API_URL ?? 'https://api.example.test/api/v1',
  })
}

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(DIST)

const problems = []
for (const file of files) {
  const shown = relative(process.cwd(), file)
  if (/mockServiceWorker/i.test(file)) problems.push(`${shown}: the file itself (MSW's worker)`)
  if (!/\.(js|css|html|map|json|svg|txt|webmanifest)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const [pattern, meaning] of FORBIDDEN) {
    const match = pattern.exec(text)
    if (match) {
      const at = match.index
      const around = text.slice(Math.max(0, at - 30), at + 50).replace(/\s+/g, ' ')
      problems.push(`${shown}: ${meaning}: …${around}…`)
    }
  }
}

if (problems.length > 0) {
  console.error(`\nThe production build contains the mock (${String(problems.length)}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`\nProduction bundle is clean: ${String(files.length)} files, none of the mock.`)
