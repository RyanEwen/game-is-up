import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const publicDir = path.join(repoRoot, 'apps', 'web', 'public')
const defaultSvgFiles = [
  'icon-gamepad-voice-green-bubble.svg',
  'icon-gamepad-voice-red-bubble.svg'
]
const outputSizes = [1024, 512, 192]

function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: publicDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  }).trim()
}

function ensureBinary(command) {
  try {
    runCommand('command', ['-v', command], { shell: true })
  } catch {
    process.stderr.write(`Missing required command: ${command}\n`)
    process.exit(1)
  }
}

function readImageSize(fileName) {
  const output = runCommand('identify', ['-format', '%w %h', fileName])
  const [widthText, heightText] = output.split(' ')
  const width = Number.parseInt(widthText, 10)
  const height = Number.parseInt(heightText, 10)

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    process.stderr.write(`Could not determine image size for ${fileName}.\n`)
    process.exit(1)
  }

  return { width, height }
}

function exportSvg(fileName) {
  const sourcePath = path.join(publicDir, fileName)

  if (!sourcePath.startsWith(publicDir)) {
    process.stderr.write(`Refusing to read outside ${publicDir}: ${fileName}\n`)
    process.exit(1)
  }

  const { width, height } = readImageSize(fileName)
  const squareSize = Math.max(width, height)
  const baseName = fileName.replace(/\.svg$/i, '')
  const renderName = `${baseName}-render.png`

  process.stdout.write(`Exporting ${fileName} using ${squareSize}x${squareSize} transparent padding.\n`)

  runCommand('convert', ['-background', 'none', fileName, `PNG32:${renderName}`])

  try {
    for (const size of outputSizes) {
      const outputName = `${baseName}-${size}.png`
      runCommand('convert', [
        renderName,
        '-background',
        'none',
        '-gravity',
        'center',
        '-extent',
        `${squareSize}x${squareSize}`,
        '-resize',
        `${size}x${size}`,
        `PNG32:${outputName}`
      ])
      process.stdout.write(`  Wrote ${outputName}\n`)
    }
  } finally {
    runCommand('rm', ['-f', renderName])
  }
}

function main() {
  ensureBinary('identify')
  ensureBinary('convert')

  const svgFiles = process.argv.slice(2)
  const filesToExport = svgFiles.length > 0 ? svgFiles : defaultSvgFiles

  for (const fileName of filesToExport) {
    if (!fileName.endsWith('.svg')) {
      process.stderr.write(`Expected an .svg file name, received: ${fileName}\n`)
      process.exit(1)
    }
    exportSvg(fileName)
  }
}

main()