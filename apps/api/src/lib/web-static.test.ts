/**
 * Unit tests for serving the web build: hashed assets are immutable, the app shell and update
 * files are never cached, client-side routes get the shell, and a missing asset is a 404.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import { cacheControlFor, serveWebApp } from './web-static.js'

test('cache rules: assets immutable, update files fresh, other files default', () => {
  assert.match(cacheControlFor('/assets/index-abc123.js') ?? '', /immutable/)
  for (const file of [
    '/index.html',
    '/sw.js',
    '/registerSW.js',
    '/manifest.webmanifest',
    '/build-id.json',
  ]) {
    assert.match(cacheControlFor(file) ?? '', /^no-store/, file)
  }
  assert.equal(cacheControlFor('/icon-up-bang-64.png'), null)
  assert.equal(cacheControlFor('/icon-192.png'), null)
})

test('the built app is served with its cache headers and a shell fallback', async (context) => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'giu-web-dist-'))
  context.after(() => rm(distDir, { recursive: true, force: true }))
  await mkdir(path.join(distDir, 'assets'))
  await writeFile(
    path.join(distDir, 'index.html'),
    '<!doctype html><p>shell</p>',
  )
  await writeFile(path.join(distDir, 'sw.js'), 'self.skipWaiting()')
  await writeFile(path.join(distDir, 'assets', 'app-1a2b.js'), 'export {}')

  const app = express()
  serveWebApp(app, distDir)
  const server = app.listen(0)
  context.after(() => server.close())
  const { port } = server.address() as AddressInfo
  const get = (urlPath: string) => fetch(`http://127.0.0.1:${port}${urlPath}`)

  const asset = await get('/assets/app-1a2b.js')
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/)

  const worker = await get('/sw.js')
  assert.equal(worker.status, 200)
  assert.match(worker.headers.get('cache-control') ?? '', /^no-store/)

  const deepLink = await get('/play/some-call')
  assert.equal(deepLink.status, 200)
  assert.match(await deepLink.text(), /shell/)
  assert.match(deepLink.headers.get('cache-control') ?? '', /^no-store/)

  const root = await get('/')
  assert.match(await root.text(), /shell/)
  assert.match(root.headers.get('cache-control') ?? '', /^no-store/)

  assert.equal((await get('/assets/gone-9z9z.js')).status, 404)
})
