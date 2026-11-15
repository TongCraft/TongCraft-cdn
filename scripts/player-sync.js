import { normalizeUuid, readJson } from '../collector/observations.ts';

export async function verifyProfile(uuid) {
  const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, {
    signal: AbortSignal.timeout(10000), redirect: 'error'
  });
  const profile = await readJson(response, 64 * 1024);
  if (normalizeUuid(profile?.id) !== uuid || !/^[A-Za-z0-9_]{1,16}$/.test(profile?.name ?? '')) {
    throw new Error('Mojang profile mismatch');
  }
  return profile.name;
}

export async function mergePlayers(data, snapshot, policy, resolveProfile = verifyProfile, now = Date.now()) {
  if (snapshot?.version !== 1 || snapshot.server !== 'mc.tongcraft.cn' || !Array.isArray(snapshot.players)
      || snapshot.players.length > 5000 || !Array.isArray(data.players)) throw new Error('Invalid observations or roster');
  const days = policy.inactiveAfterDays ?? 90;
  if (!Number.isInteger(days) || days < 1 || !Array.isArray(policy.excludedUuids)) throw new Error('Invalid player policy');
  const excluded = new Set(policy.excludedUuids.map(value => {
    const uuid = normalizeUuid(value);
    if (!uuid) throw new Error('Invalid excluded UUID');
    return uuid;
  }));
  const observations = new Map();
  for (const player of snapshot.players) {
    const uuid = normalizeUuid(player.uuid);
    const first = Date.parse(player.firstObservedAt), last = Date.parse(player.lastObservedAt);
    if (!uuid || !/^[A-Za-z0-9_]{1,16}$/.test(player.name) || !Number.isFinite(first)
        || !Number.isFinite(last) || first > last || last > now + 60000 || observations.has(uuid)) {
      throw new Error('Invalid observed player');
    }
    observations.set(uuid, { ...player, uuid });
  }
  // Build a new roster so failed validation never partially edits the caller's data.
  const players = data.players.map(player => ({ ...player, archived: excluded.has(normalizeUuid(player.uuid)) }));
  const known = new Map(players.map(player => [normalizeUuid(player.uuid), player]));
  const added = [], renamed = [], pending = [];
  for (const [uuid, observation] of observations) {
    if (excluded.has(uuid)) continue;
    const existing = known.get(uuid);
    if (existing?.name === observation.name) continue;
    let name;
    try {
      name = await resolveProfile(uuid);
      if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new Error('Invalid verified name');
    } catch {
      pending.push({ uuid, name: observation.name, reason: 'profile-verification-unavailable' });
      continue;
    }
    if (existing) {
      if (existing.name !== name) {
        renamed.push({ uuid, previousName: existing.name, name });
        existing.name = name;
      }
    } else {
      const player = { uuid, name, addedAt: observation.firstObservedAt, hasAvatar: false, source: 'server-observation', archived: false };
      players.push(player);
      known.set(uuid, player);
      added.push({ uuid, name });
    }
  }
  const activity = players.map(player => {
    const observation = observations.get(normalizeUuid(player.uuid));
    const last = observation?.lastObservedAt ?? null;
    return {
      uuid: player.uuid, name: player.name,
      firstObservedAt: observation?.firstObservedAt ?? null, lastObservedAt: last,
      status: player.archived ? 'archived' : !last ? 'unobserved'
        : now - Date.parse(last) >= days * 86400000 ? 'review-inactivity' : 'recently-observed'
    };
  });
  return {
    data: { ...data, players },
    activity: { generatedAt: new Date(now).toISOString(), source: snapshot.server, lastSuccessfulCollection: snapshot.lastSuccessAt, inactiveAfterDays: days, players: activity, pending },
    added, renamed
  };
}
