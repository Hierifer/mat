#!/usr/bin/env node
/**
 * Auto-generate changelog.yaml and changelog.ts from git commit history.
 *
 * Commit convention:
 *   feat: xxx   → features
 *   fix: xxx    → fixes
 *   chore: bump version to X.Y.Z → version boundary
 *
 * Usage:
 *   node scripts/generate-changelog.mjs
 */

import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

const MAX_VERSIONS = 10

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

function getCommits() {
  const raw = execSync('git log --format="%s%x00%ai" -200', {
    cwd: rootDir,
    encoding: 'utf-8',
  })
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('\0')
      const subject = idx >= 0 ? line.slice(0, idx) : line
      const dateStr = idx >= 0 ? line.slice(idx + 1).trim() : ''
      return { subject, date: dateStr.split(' ')[0] }
    })
}

// ---------------------------------------------------------------------------
// Parse & group
// ---------------------------------------------------------------------------

function groupByVersion(commits) {
  const result = []
  let bucket = { features: [], fixes: [] }
  let prevBumpVersion = null
  let prevBumpDate = null

  for (const { subject, date } of commits) {
    const bump = subject.match(/^chore:\s*bump version to\s+v?(.+)$/i)

    if (bump) {
      if (bucket.features.length || bucket.fixes.length) {
        if (prevBumpVersion === null) {
          // Commits before the first bump are unreleased.
          // Only include them if package.json version differs from this bump
          // (meaning the developer already bumped package.json for the next release).
          try {
            const pkg = JSON.parse(
              readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
            )
            if (pkg.version !== bump[1]) {
              result.push({
                version: pkg.version,
                date: commits[0].date,
                features: [...bucket.features],
                fixes: [...bucket.fixes],
              })
            }
          } catch {
            // ignore – skip unreleased
          }
        } else {
          result.push({
            version: prevBumpVersion,
            date: prevBumpDate,
            features: [...bucket.features],
            fixes: [...bucket.fixes],
          })
        }
      }

      prevBumpVersion = bump[1]
      prevBumpDate = date
      bucket = { features: [], fixes: [] }
      continue
    }

    const feat = subject.match(/^feat:\s*(.+)$/)
    const fix = subject.match(/^fix:\s*(.+)$/)

    if (feat) bucket.features.push(feat[1])
    else if (fix) bucket.fixes.push(fix[1])
  }

  // Flush remaining oldest group
  if (prevBumpVersion && (bucket.features.length || bucket.fixes.length)) {
    result.push({
      version: prevBumpVersion,
      date: prevBumpDate,
      features: [...bucket.features],
      fixes: [...bucket.fixes],
    })
  }

  return result.slice(0, MAX_VERSIONS)
}

// ---------------------------------------------------------------------------
// YAML generation
// ---------------------------------------------------------------------------

function escapeYaml(s) {
  if (/[:#\[\]{}&*!|>'",@`]/.test(s) || s.startsWith('- ') || s.startsWith('? ')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

function toYaml(versions) {
  const lines = [
    '# Auto-generated from git history. Do not edit manually.',
    '# Regenerate: node scripts/generate-changelog.mjs',
    '',
  ]

  for (const v of versions) {
    lines.push(`- version: "${v.version}"`)
    lines.push(`  date: "${v.date}"`)

    if (v.features.length) {
      lines.push('  features:')
      for (const f of v.features) lines.push(`    - ${escapeYaml(f)}`)
    } else {
      lines.push('  features: []')
    }

    if (v.fixes.length) {
      lines.push('  fixes:')
      for (const f of v.fixes) lines.push(`    - ${escapeYaml(f)}`)
    } else {
      lines.push('  fixes: []')
    }

    lines.push('')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// TypeScript generation
// ---------------------------------------------------------------------------

function escapeTs(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function toTypeScript(versions) {
  const lines = [
    '// Auto-generated from git history. Do not edit manually.',
    '// Regenerate: node scripts/generate-changelog.mjs',
    '',
    'export interface ChangelogEntry {',
    '  date: string',
    '  features: string[]',
    '  fixes: string[]',
    '}',
    '',
    'export const changelog: Record<string, ChangelogEntry> = {',
  ]

  for (const v of versions) {
    lines.push(`  '${v.version}': {`)
    lines.push(`    date: '${v.date}',`)

    if (v.features.length) {
      lines.push('    features: [')
      for (const f of v.features) lines.push(`      '${escapeTs(f)}',`)
      lines.push('    ],')
    } else {
      lines.push('    features: [],')
    }

    if (v.fixes.length) {
      lines.push('    fixes: [')
      for (const f of v.fixes) lines.push(`      '${escapeTs(f)}',`)
      lines.push('    ],')
    } else {
      lines.push('    fixes: [],')
    }

    lines.push('  },')
  }

  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const commits = getCommits()
const versions = groupByVersion(commits)

const yamlPath = resolve(rootDir, 'src', 'data', 'changelog.yaml')
const tsPath = resolve(rootDir, 'src', 'data', 'changelog.ts')

writeFileSync(yamlPath, toYaml(versions), 'utf-8')
writeFileSync(tsPath, toTypeScript(versions), 'utf-8')

console.log(`Generated changelog with ${versions.length} versions`)
console.log(`  → ${yamlPath}`)
console.log(`  → ${tsPath}`)
