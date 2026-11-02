import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const manifest = JSON.parse(await fs.readFile(path.join(DIST, 'players.json'), 'utf8'));
const source = JSON.parse(await fs.readFile(path.join(ROOT, 'data/players.json'), 'utf8'));
assert.equal(manifest.length, source.players.length);

for (const player of manifest) {
  for (const key of ['avatarPath', 'skinPath']) {
    const pathname = player[key];
    assert.match(pathname, /^assets\/(avatars|skins)\/[a-f0-9]{32}-[a-f0-9]{16}\.png$/);
    const bytes = await fs.readFile(path.join(DIST, pathname));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    assert.ok(pathname.endsWith('-' + hash + '.png'), 'Image URL must identify its actual contents');
  }
}

for (const filename of ['index.html', '3d.html']) {
  const html = await fs.readFile(path.join(DIST, filename), 'utf8');
  assert.ok(!html.includes('type="importmap"'), 'Dependencies must be bundled');
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)];
  assert.ok(scripts.length > 0);
  for (const [, src] of scripts) {
    assert.match(src, /^assets\/[\w-]+\.js$/);
    await fs.access(path.join(DIST, src));
    // Relative paths also work on the existing GitHub Pages project subpath.
    assert.ok(new URL(src, 'https://example.com/TongCraft-cdn/' + filename).pathname.startsWith('/TongCraft-cdn/assets/'));
  }
}

const port = await new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.on('error', reject);
  listener.listen(0, '127.0.0.1', () => {
    const port = listener.address().port;
    listener.close(() => resolve(port));
  });
});
const baseUrl = process.env.CHECK_NETWORK_BASE_URL?.replace(/\/$/, '') || `http://127.0.0.1:${port}`;
const server = process.env.CHECK_NETWORK_BASE_URL ? null : spawn(process.execPath, ['src/server.js', '--port', String(port)], {
  cwd: ROOT,
  stdio: ['ignore', 'ignore', 'pipe']
});
let stderr = '';
server?.stderr.on('data', chunk => { stderr += chunk.toString(); });

try {
  let ready = false;
  for (let attempt = 0; attempt < (server ? 60 : 3); attempt++) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(server ? 1000 : 15000) });
      ready = response.ok;
      await response.body?.cancel();
      if (ready) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Site did not respond: ${baseUrl}\n${stderr}`);
  const imageUrl = new URL(manifest[0].skinPath, baseUrl + '/');
  const image = await fetch(imageUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('access-control-allow-origin'), '*');
  assert.match(image.headers.get('cache-control'), /max-age=31536000, immutable/);
  const etag = image.headers.get('etag');
  assert.ok(etag);
  const imageBytes = await image.arrayBuffer();
  const head = await fetch(imageUrl, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('etag'), etag);
  assert.equal(head.headers.get('cache-control'), image.headers.get('cache-control'));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const validated = await fetch(imageUrl, { headers: { 'If-None-Match': 'W/' + etag } });
  assert.equal(validated.status, 304);
  assert.equal((await validated.arrayBuffer()).byteLength, 0);

  const stable = await fetch(`${baseUrl}/skins/${manifest[0].uuid}.png`);
  assert.equal(stable.status, 200);
  assert.match(stable.headers.get('cache-control'), /max-age=300,/);
  assert.deepEqual(new Uint8Array(await stable.arrayBuffer()), new Uint8Array(imageBytes));
  const missing = await fetch(baseUrl + '/assets/missing.js');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  const post = await fetch(baseUrl, { method: 'POST' });
  assert.equal(post.status, 405);
  const metadata = await fetch(baseUrl + '/players.json');
  assert.match(metadata.headers.get('cache-control'), /max-age=60,/);
  assert.equal((await metadata.json()).length, manifest.length);
  console.log(`Network checks passed: ${manifest.length} players, content hashes, bundled scripts, portable paths, CORS, HEAD, ETag/304 and cache freshness.`);
} finally {
  server?.kill();
}
