#!/usr/bin/env node
/**
 * Generates the third-party notices for the web bundle, the only part of Game's Up that ships
 * code to users (HYG-3, D-085). The API runs on the server and distributes nothing.
 *
 * It resolves the web workspace's production dependency closure (`npm ls --omit=dev --all
 * --parseable`), reads each package's declared licence and its bundled licence text, and writes
 * one de-duplicated file to apps/web/public/, so Vite serves it at /THIRD-PARTY-NOTICES.txt and
 * the About dialog links to it.
 *
 * It runs as part of the web build, so the shipped file always matches the lockfile; the output
 * is git-ignored. Run `npm run notices` to generate it for local development.
 *
 * Ported from printstream's scripts/dev/generate-third-party-notices.mjs.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

/** Distributable artifacts that ship third-party code to an end user. */
const DISTRIBUTABLES = [
  {
    workspace: '@game-is-up/web',
    out: 'apps/web/public/THIRD-PARTY-NOTICES.txt',
    title: "Game's Up web app (browser bundle)",
  },
]

const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice|unlicense)(\..*)?$/i

/** Resolve the production dependency directories for a workspace. */
function productionDepDirs(workspace) {
  const out = execFileSync(
    'npm',
    ['ls', '--omit=dev', '--all', '--parseable', '--workspace', workspace],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((dir) => dir !== repoRoot)
}

/** Normalize the many shapes a package.json `license`/`licenses` field can take. */
function readLicenseId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type)
    return pkg.license.type
  if (Array.isArray(pkg.licenses)) {
    const ids = pkg.licenses
      .map((l) => (typeof l === 'string' ? l : l?.type))
      .filter(Boolean)
    if (ids.length) return ids.join(' OR ')
  }
  return 'UNKNOWN'
}

function readPublisher(pkg) {
  const a = pkg.author
  if (typeof a === 'string') return a
  if (a && typeof a === 'object' && a.name)
    return a.email ? `${a.name} <${a.email}>` : a.name
  return ''
}

function readRepository(pkg) {
  const r = pkg.repository
  if (typeof r === 'string') return r
  if (r && typeof r === 'object' && r.url)
    return r.url.replace(/^git\+/, '').replace(/\.git$/, '')
  return pkg.homepage || ''
}

/** Read the bundled license/notice text for a package directory, if any. */
function readLicenseText(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return ''
  }
  const files = entries
    .filter((name) => LICENSE_FILE_RE.test(name))
    .map((name) => path.join(dir, name))
    .filter((file) => {
      try {
        return statSync(file).isFile()
      } catch {
        return false
      }
    })
    // LICENSE before NOTICE/COPYING; shorter names (LICENSE) before LICENSE.md noise is irrelevant.
    .sort((a, b) => path.basename(a).length - path.basename(b).length)
  const chunks = []
  for (const file of files) {
    try {
      chunks.push(
        `----- ${path.basename(file)} -----\n${readFileSync(file, 'utf8').trim()}`,
      )
    } catch {
      /* ignore unreadable */
    }
  }
  return chunks.join('\n\n')
}

/** Collect a de-duplicated, sorted package record set for a workspace closure. */
function collectPackages(workspace) {
  const byKey = new Map()
  for (const dir of productionDepDirs(workspace)) {
    let pkg
    try {
      pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (!pkg.name) continue
    // Skip our own internal workspace packages: they are not third party.
    if (pkg.name.startsWith('@game-is-up/') || pkg.name === 'game-is-up')
      continue
    const key = `${pkg.name}@${pkg.version}`
    if (byKey.has(key)) continue
    byKey.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: readLicenseId(pkg),
      publisher: readPublisher(pkg),
      repository: readRepository(pkg),
      text: readLicenseText(dir),
    })
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )
}

function render(title, packages) {
  const summary = new Map()
  for (const p of packages)
    summary.set(p.license, (summary.get(p.license) ?? 0) + 1)
  const summaryLines = [...summary.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lic, n]) => `  ${String(n).padStart(4)}  ${lic}`)

  const header = [
    '='.repeat(78),
    `THIRD-PARTY SOFTWARE NOTICES: ${title}`,
    '='.repeat(78),
    '',
    'This artifact bundles or depends on the open-source packages listed below.',
    'Each package remains under its own license; the full license text follows',
    'each entry where the package ships one. This file is generated by',
    'scripts/dev/generate-third-party-notices.mjs (run `npm run notices`).',
    '',
    `Total packages: ${packages.length}`,
    'Licenses:',
    ...summaryLines,
    '',
  ]

  const body = packages.map((p) => {
    const lines = [
      '-'.repeat(78),
      `${p.name}@${p.version}`,
      `License: ${p.license}`,
    ]
    if (p.publisher) lines.push(`Publisher: ${p.publisher}`)
    if (p.repository) lines.push(`Repository: ${p.repository}`)
    lines.push('')
    lines.push(
      p.text ||
        '(no license file bundled with this package; see the declared license above)',
    )
    return lines.join('\n')
  })

  return `${header.join('\n')}\n${body.join('\n\n')}\n`
}

let total = 0
for (const dist of DISTRIBUTABLES) {
  const packages = collectPackages(dist.workspace)
  const outPath = path.join(repoRoot, dist.out)
  writeFileSync(outPath, render(dist.title, packages))
  total += packages.length
  console.log(`Wrote ${dist.out} (${packages.length} packages)`)
}
console.log(
  `Done. ${total} package entries across ${DISTRIBUTABLES.length} distributables.`,
)
