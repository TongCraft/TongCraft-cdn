export type ObservedPlayer = {
  uuid: string;
  name: string;
  firstObservedAt: string;
  lastObservedAt: string;
};

export type Snapshot = {
  version: 1;
  server: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  sourceSnapshotAt: string | null;
  status: 'pending' | 'online' | 'offline' | 'error';
  onlineCount: number | null;
  sampleCount: number;
  players: ObservedPlayer[];
};

export const normalizeUuid = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const id = value.replace(/-/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(id) && !/^0+$/.test(id) ? id : null;
};

export function emptySnapshot(server: string): Snapshot {
  return {
    version: 1, server, lastAttemptAt: null, lastSuccessAt: null,
    sourceSnapshotAt: null, status: 'pending', onlineCount: null, sampleCount: 0, players: []
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function mergeStatus(previous: Snapshot, payload: unknown, now: number): Snapshot {
  if (!object(payload) || typeof payload.online !== 'boolean') throw new Error('Invalid status response');
  const next: Snapshot = { ...previous, lastAttemptAt: new Date(now).toISOString() };
  if (!payload.online) return { ...next, status: 'offline', onlineCount: null, sampleCount: 0 };
  if (!object(payload.players) || !Number.isSafeInteger(payload.players.online)
      || Number(payload.players.online) < 0 || Number(payload.players.online) > 10000) {
    throw new Error('Invalid player count');
  }
  const debug = object(payload.debug) ? payload.debug : {};
  const sourceTime = typeof debug.cachetime === 'number' ? debug.cachetime * 1000 : NaN;
  // Cached replies describe the source snapshot, not the time our poll happened.
  if (!Number.isFinite(sourceTime) || sourceTime > now + 60000 || sourceTime < now - 15 * 60000) {
    throw new Error('Missing, stale, or future status timestamp');
  }
  if (previous.sourceSnapshotAt && sourceTime < Date.parse(previous.sourceSnapshotAt)) return previous;
  const raw = payload.players.list ?? [];
  if (!Array.isArray(raw) || raw.length > 2000) throw new Error('Invalid player sample');
  const sampled = new Map<string, string>();
  for (const entry of raw) {
    if (!object(entry)) continue;
    const uuid = normalizeUuid(entry.uuid);
    if (uuid && typeof entry.name === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(entry.name)) {
      sampled.set(uuid, entry.name);
    }
  }
  if (sampled.size > Number(payload.players.online)) throw new Error('Player sample exceeds online count');
  const observedAt = new Date(sourceTime).toISOString();
  const players = new Map(previous.players.map(player => [player.uuid, player]));
  for (const [uuid, name] of sampled) {
    const existing = players.get(uuid);
    if (existing && Date.parse(existing.lastObservedAt) >= sourceTime) continue;
    if (!existing && players.size >= 5000) throw new Error('Observation quota reached');
    players.set(uuid, {
      uuid, name, firstObservedAt: existing?.firstObservedAt ?? observedAt, lastObservedAt: observedAt
    });
  }
  return {
    ...next, status: 'online', lastSuccessAt: new Date(now).toISOString(),
    sourceSnapshotAt: observedAt, onlineCount: Number(payload.players.online),
    sampleCount: sampled.size, players: [...players.values()].sort((a, b) => a.uuid.localeCompare(b.uuid))
  };
}

export async function readJson(response: Response, limit = 512 * 1024): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Upstream HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, body = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('JSON response too large');
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    await reader.cancel();
  }
}
