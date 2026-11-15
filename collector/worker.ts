import { DurableObject } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';
import { emptySnapshot, mergeStatus, readJson, type Snapshot } from './observations';

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

export class PlayerObservations extends DurableObject<CollectorEnv> {
  constructor(ctx: DurableObjectState, env: CollectorEnv) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
  }

  snapshot(): Snapshot {
    const row = this.ctx.storage.sql.exec<{ body: string }>('SELECT body FROM snapshot WHERE id=1').toArray()[0];
    return row ? JSON.parse(row.body) : emptySnapshot(this.env.SERVER_ADDRESS);
  }

  async collect(): Promise<Snapshot> {
    const now = Date.now();
    let payload: unknown;
    try {
      const response = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(this.env.SERVER_ADDRESS)}`, {
        headers: { 'User-Agent': 'TongCraft-player-collector/1.0 (github.com/TongCraft/TongCraft-cdn)' },
        signal: AbortSignal.timeout(12000), redirect: 'manual'
      });
      payload = await readJson(response);
      // Read and merge after external I/O, in one synchronous transaction. Concurrent
      // manual/cron polls cannot overwrite each other's newly discovered players.
      return this.ctx.storage.transactionSync(() => {
        const current = this.snapshot();
        if (current.lastAttemptAt && Date.parse(current.lastAttemptAt) > now) return current;
        const next = mergeStatus(current, payload, now);
        this.save(next);
        return next;
      });
    } catch (error) {
      this.ctx.storage.transactionSync(() => {
        const current = this.snapshot();
        if (!current.lastAttemptAt || Date.parse(current.lastAttemptAt) <= now) {
          this.save({ ...current, status: 'error', lastAttemptAt: new Date(now).toISOString() });
        }
      });
      console.error(JSON.stringify({ event: 'player-collection-failed', message: error instanceof Error ? error.message : 'Unknown error' }));
      throw new Error('Player status unavailable; existing observations retained');
    }
  }

  private save(snapshot: Snapshot): void {
    this.ctx.storage.sql.exec('INSERT INTO snapshot(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', JSON.stringify(snapshot));
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(env.OBSERVATIONS.getByName(env.SERVER_ADDRESS).collect().then(snapshot => {
      console.log(JSON.stringify({ event: 'player-collection', status: snapshot.status, online: snapshot.onlineCount, sampled: snapshot.sampleCount, known: snapshot.players.length }));
    }));
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!['/health', '/observations', '/collect'].includes(path)) return json({ error: 'Not found' }, 404);
    const method = path === '/collect' ? 'POST' : 'GET';
    if (request.method !== method) return json({ error: 'Method not allowed' }, 405);
    if (path !== '/health') {
      if (!env.COLLECTOR_TOKEN) return json({ error: 'Collector not configured' }, 503);
      const actual = new TextEncoder().encode(request.headers.get('Authorization') ?? '');
      const expected = new TextEncoder().encode(`Bearer ${env.COLLECTOR_TOKEN}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'Unauthorized' }, 401);
    }
    try {
      const stub = env.OBSERVATIONS.getByName(env.SERVER_ADDRESS);
      const snapshot = path === '/collect' ? await stub.collect() : await stub.snapshot();
      if (path === '/health') {
        const { players, ...health } = snapshot;
        return json({ ...health, observedPlayers: players.length });
      }
      return json(snapshot);
    } catch {
      return json({ error: 'Collector unavailable; existing observations retained' }, 503);
    }
  }
} satisfies ExportedHandler<CollectorEnv>;
