import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readJson } from '../collector/observations.ts';
import { mergePlayers } from './player-sync.js';

const root = new URL('../', import.meta.url);
const token = process.env.PLAYER_COLLECTOR_TOKEN ?? (await fs.readFile(new URL('.collector-token', root), 'utf8').catch(() => '')).trim();
const base = process.env.PLAYER_COLLECTOR_URL ?? 'https://tongcraft-player-collector.3159415804.workers.dev';
if (!token) throw new Error('PLAYER_COLLECTOR_TOKEN is required');
if (process.argv.includes('--collect')) {
  const attempt = await fetch(new URL('/collect', base), {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(25000), redirect: 'error'
  });
  await attempt.body?.cancel();
  if (!attempt.ok && attempt.status !== 503) throw new Error(`Collection HTTP ${attempt.status}`);
  if (!attempt.ok) console.warn('本次采集不可用，将读取已保存的观察记录。');
}
const response = await fetch(new URL('/observations', base), {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000), redirect: 'error'
});
const snapshot = await readJson(response, 2 * 1024 * 1024);
const [data, policy] = await Promise.all(['data/players.json', 'data/player-policy.json'].map(async name =>
  JSON.parse(await fs.readFile(new URL(name, root), 'utf8'))));
const result = await mergePlayers(data, snapshot, policy);
for (const [name, value] of [['data/players.json', result.data], ['data/player-activity.json', result.activity]]) {
  const target = fileURLToPath(new URL(name, root));
  await fs.writeFile(`${target}.tmp`, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(`${target}.tmp`, target);
}
const review = result.activity.players.filter(player => player.status === 'review-inactivity');
const summary = [
  '### 玩家采集同步',
  `新增 ${result.added.length} 位；改名 ${result.renamed.length} 位；待验证 ${result.activity.pending.length} 位；长期未观察到、待确认 ${review.length} 位。`,
  `最近成功采集：${snapshot.lastSuccessAt ?? '等待首次采集'}。未观察到不代表没有上线，名单不会自动删除。`,
  '详细活跃记录保存在本地 data/player-activity.json，不提交到公开仓库。'
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
