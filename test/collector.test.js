import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('collector protects exports, runs cron, persists observations, and survives upstream failures', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tongcraft-collector-test-'));
  const bundle = await build({
    entryPoints: ['collector/worker.ts'], bundle: true, format: 'esm', write: false,
    platform: 'neutral', external: ['cloudflare:*', 'node:*']
  });
  const uuid = '00000000000040008000000000000001';
  let fail = false;
  let online = true;
  const options = {
    name: 'tongcraft-player-collector', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-11-08', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { OBSERVATIONS: { className: 'PlayerObservations', useSQLite: true } },
    bindings: { SERVER_ADDRESS: 'mc.tongcraft.cn', COLLECTOR_TOKEN: 'collector-test-token' },
    outboundService: async request => {
      assert.equal(request.url, 'https://api.mcsrvstat.us/3/mc.tongcraft.cn');
      assert.match(request.headers.get('user-agent'), /TongCraft/);
      if (fail) return new Response('Unavailable', { status: 503 });
      return Response.json(online ? {
        online: true, players: { online: 1, list: [{ uuid, name: 'Alice' }] },
        debug: { cachetime: Math.floor(Date.now() / 1000) }
      } : { online: false });
    }
  };
  const runtimeOptions = { ...convertV4MiniflareOptions(options), resourcePersistencePath: directory };
  let mf = new Miniflare(runtimeOptions);
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const get = async (path, authenticated = false, method = 'GET') => {
    const response = await mf.dispatchFetch('https://collector.invalid' + path, {
      method, headers: authenticated ? { Authorization: 'Bearer collector-test-token' } : {}
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await get('/health')).data.status, 'pending');
  assert.equal((await get('/observations')).status, 401);
  assert.equal((await get('/collect', false, 'POST')).status, 401);
  assert.equal((await get('/collect', true)).status, 405);
  const worker = await mf.getWorker();
  await worker.scheduled({ cron: '*/10 * * * *' });
  const first = await get('/observations', true);
  assert.equal(first.data.players[0].uuid, uuid);
  assert.equal(first.data.players.length, 1);
  assert.equal((await get('/health')).data.observedPlayers, 1);
  assert.equal('players' in (await get('/health')).data, false);
  online = false;
  assert.equal((await get('/collect', true, 'POST')).data.status, 'offline');
  fail = true;
  assert.equal((await get('/collect', true, 'POST')).status, 503);
  const retained = await get('/observations', true);
  assert.equal(retained.data.status, 'error');
  assert.deepEqual(retained.data.players, first.data.players);
  await mf.dispose();
  mf = new Miniflare(runtimeOptions);
  assert.deepEqual((await get('/observations', true)).data.players, first.data.players);
});
