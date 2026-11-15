import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySnapshot, mergeStatus, readJson } from '../collector/observations.ts';
import { mergePlayers } from '../scripts/player-sync.js';

const now = Date.parse('2026-11-15T12:00:00Z');
const alice = '00000000000040008000000000000001';
const bob = '00000000000040008000000000000002';
const status = (list = [], count = list.length, at = now) => ({
  online: true, players: { online: count, list }, debug: { cachetime: at / 1000 }
});
const observed = (uuid = alice, name = 'Alice') => mergeStatus(emptySnapshot('mc.tongcraft.cn'), status([{ uuid, name }]), now);
const policy = { inactiveAfterDays: 90, excludedUuids: [] };

test('UUID observations merge, deduplicate, rename, and retain original first observation', () => {
  const first = observed('00000000-0000-4000-8000-000000000001');
  assert.equal(first.players[0].uuid, alice);
  const next = mergeStatus(first, status([{ uuid: alice, name: 'AliceNew' }, { uuid: alice, name: 'AliceNew' }], 2, now + 600000), now + 600000);
  assert.equal(next.players.length, 1);
  assert.equal(next.players[0].name, 'AliceNew');
  assert.equal(next.players[0].firstObservedAt, first.players[0].firstObservedAt);
  assert.equal(next.players[0].lastObservedAt, new Date(now + 600000).toISOString());
  assert.deepEqual(mergeStatus(next, status([], 0, now), now + 600001), next);
});

test('empty, absent, offline, and invalid samples never remove known players or invent activity', () => {
  const first = observed();
  const empty = mergeStatus(first, status([], 0, now + 600000), now + 600000);
  assert.deepEqual(empty.players, first.players);
  assert.deepEqual(mergeStatus(first, { online: false }, now + 600000).players, first.players);
  const absent = status([], 8);
  delete absent.players.list;
  assert.equal(mergeStatus(first, absent, now).sampleCount, 0);
  const invalid = mergeStatus(first, status([{ uuid: '0'.repeat(32), name: 'Fake' }, { uuid: bob, name: '§Bad' }], 2), now);
  assert.deepEqual(invalid.players, first.players);
  assert.throws(() => mergeStatus(first, status([], 0, now - 3600000), now), /timestamp/);
  assert.throws(() => mergeStatus(first, status([{ uuid: bob, name: 'Bob' }], 0), now), /exceeds/);
});

test('bounded JSON reads reject large or failed upstream responses', async () => {
  assert.deepEqual(await readJson(Response.json({ ok: true })), { ok: true });
  await assert.rejects(readJson(new Response('unavailable', { status: 500 })), /HTTP 500/);
  await assert.rejects(readJson(new Response('x'.repeat(50)), 10), /too large/);
});

test('new players require verified profiles; existing identities and unknown activity are preserved', async () => {
  const data = { players: [{ uuid: bob, name: 'Bob', addedAt: '2020-01-01' }] };
  const result = await mergePlayers(data, observed(), policy, async uuid => {
    assert.equal(uuid, alice);
    return 'Alice';
  }, now);
  assert.equal(result.added.length, 1);
  assert.equal(result.data.players.length, 2);
  assert.equal(result.activity.players.find(player => player.uuid === bob).status, 'unobserved');
  assert.equal(data.players.length, 1);
  const unavailable = await mergePlayers(data, observed(), policy, async () => { throw new Error('Mojang down'); }, now);
  assert.equal(unavailable.data.players.length, 1);
  assert.equal(unavailable.activity.pending.length, 1);
});

test('inactivity only requests review; archived UUIDs stay excluded even when observed again', async () => {
  const data = { players: [{ uuid: alice, name: 'Alice' }] };
  const inactive = await mergePlayers(data, observed(), policy, async () => 'Alice', now + 91 * 86400000);
  assert.equal(inactive.data.players.length, 1);
  assert.equal(inactive.data.players[0].archived, false);
  assert.equal(inactive.activity.players[0].status, 'review-inactivity');
  const archived = await mergePlayers(data, observed(), { ...policy, excludedUuids: [alice] }, async () => { throw new Error('Must not verify archived account'); }, now);
  assert.equal(archived.data.players[0].archived, true);
  assert.equal(archived.activity.players[0].status, 'archived');
  assert.equal(archived.added.length, 0);
  const unknown = await mergePlayers({ players: [] }, observed(), { ...policy, excludedUuids: [alice] }, async () => 'Alice', now);
  assert.equal(unknown.data.players.length, 0);
});

test('UUID-based renames do not create a second player and repeated imports are idempotent', async () => {
  const data = { players: [{ uuid: alice, name: 'OldName', skinModel: 'slim' }] };
  const result = await mergePlayers(data, observed(), policy, async () => 'Alice', now);
  assert.equal(result.data.players.length, 1);
  assert.equal(result.data.players[0].skinModel, 'slim');
  assert.equal(result.renamed.length, 1);
  const again = await mergePlayers(result.data, observed(), policy, async () => { throw new Error('Unnecessary lookup'); }, now);
  assert.deepEqual(again.data, result.data);
  assert.equal(again.renamed.length, 0);
});
