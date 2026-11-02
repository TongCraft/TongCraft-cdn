import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/worker.js';

test('missing immutable assets are never cached as successful downloads', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = worker.fetch(new Request('https://example.com/assets/missing.js', { method }));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('unsupported methods return an uncached 405 with supported methods', () => {
  const response = worker.fetch(new Request('https://example.com/', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
