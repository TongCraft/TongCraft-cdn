/**
 * Fetch skins from Mojang and crop to face avatars for all whitelisted players
 *
 * Usage:
 *   node scripts/fetch-avatars.js          # All players
 *   node scripts/fetch-avatars.js <name>   # Single player
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATARS_DIR = path.join(__dirname, '..', 'avatars');
const SKINS_DIR = path.join(__dirname, '..', 'skins');
const DATA_DIR = path.join(__dirname, '..', 'data');
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_FETCH_RETRIES = Number.parseInt(process.env.MOJANG_FETCH_RETRIES ?? '4', 10);
const RETRY_BASE_DELAY_MS = Number.parseInt(process.env.MOJANG_FETCH_RETRY_DELAY_MS ?? '1000', 10);
const INTER_PLAYER_DELAY_MS = Number.parseInt(process.env.MOJANG_FETCH_INTERVAL_MS ?? '200', 10);

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value) {
  if (!value) return null;

  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;
  return Math.max(0, retryAt - Date.now());
}

async function fetchWithRetry(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;

      const error = new Error(`${label} failed: ${res.status}`);
      error.retryable = RETRYABLE_STATUSES.has(res.status);
      if (!error.retryable || attempt === MAX_FETCH_RETRIES) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
      const backoffMs = retryAfterMs ?? (RETRY_BASE_DELAY_MS * (2 ** attempt));
      await sleep(backoffMs);
      continue;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_FETCH_RETRIES || error.retryable === false) break;
      await sleep(RETRY_BASE_DELAY_MS * (2 ** attempt));
    }
  }

  throw lastError ?? new Error(`${label} failed`);
}

async function getCachedAvatarFallback(player, metaEntry) {
  const avatarPath = path.join(AVATARS_DIR, `${player.uuid}.png`);

  try {
    const avatarStat = await fs.stat(avatarPath);
    if (!avatarStat.isFile()) return null;

    return {
      updatedAt: metaEntry?.updatedAt ?? player.avatarUpdatedAt ?? avatarStat.mtime.toISOString(),
      skinModel: metaEntry?.skinModel ?? player.skinModel ?? null,
      skinUrl: metaEntry?.skinUrl ?? player.skinUrl ?? null,
      skinTextureUpdatedAt: metaEntry?.skinTextureUpdatedAt ?? player.skinTextureUpdatedAt ?? null,
      width: metaEntry?.skinWidth ?? null,
      height: metaEntry?.skinHeight ?? null
    };
  } catch {
    return null;
  }
}

async function getSkinProfile(uuid) {
  const res = await fetchWithRetry(
    `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
    'Profile fetch'
  );
  const data = await res.json();
  const prop = data.properties?.find(p => p.name === 'textures');
  if (!prop) throw new Error('No textures property');
  const textures = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf-8'));
  const skin = textures.textures?.SKIN;
  const skinUrl = skin?.url;
  if (!skinUrl) throw new Error('No skin URL');
  return {
    skinUrl,
    skinModel: skin.metadata?.model === 'slim' ? 'slim' : 'classic',
    skinTextureUpdatedAt: textures.timestamp ? new Date(textures.timestamp).toISOString() : null
  };
}

async function fetchAndCrop(uuid) {
  const skinProfile = await getSkinProfile(uuid);
  const { skinUrl, skinModel, skinTextureUpdatedAt } = skinProfile;
  const res = await fetchWithRetry(skinUrl, 'Skin download');
  const skinBuffer = Buffer.from(await res.arrayBuffer());

  const { width, height } = await sharp(skinBuffer).metadata();
  if (width !== 64 || (height !== 32 && height !== 64)) {
    throw new Error(`Unexpected skin size: ${width}x${height}`);
  }

  await fs.writeFile(path.join(SKINS_DIR, `${uuid}.png`), skinBuffer);

  const baseHead = await sharp(skinBuffer)
    .extract({ left: 8, top: 8, width: 8, height: 8 })
    .resize(64, 64, { kernel: 'nearest' })
    .toBuffer();

  const hatLayer = await sharp(skinBuffer)
    .extract({ left: 40, top: 8, width: 8, height: 8 })
    .resize(64, 64, { kernel: 'nearest' })
    .toBuffer();

  await sharp(baseHead)
    .composite([{ input: hatLayer, blend: 'over' }])
    .png()
    .toFile(path.join(AVATARS_DIR, `${uuid}.png`));

  return {
    skinUrl,
    skinModel,
    skinTextureUpdatedAt,
    width,
    height,
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  await fs.mkdir(AVATARS_DIR, { recursive: true });
  await fs.mkdir(SKINS_DIR, { recursive: true });

  const playersPath = path.join(DATA_DIR, 'players.json');
  const metaPath = path.join(DATA_DIR, 'avatars-meta.json');
  const playersData = await readJson(playersPath, { players: [], lastUpdated: null });
  const meta = await readJson(metaPath, {});
  const { players } = playersData;
  const args = process.argv.slice(2);
  const active = players.filter(player => !player.archived);
  const targets = args.length > 0
    ? active.filter(p => args.includes(p.name))
    : active;

  let ok = 0, fallback = 0, fail = 0;
  for (const player of targets) {
    process.stdout.write(`  ${player.name} (${player.uuid})... `);
    try {
      const result = await fetchAndCrop(player.uuid);
      player.hasAvatar = true;
      player.avatarUpdatedAt = result.updatedAt;
      player.skinModel = result.skinModel;
      player.skinUrl = result.skinUrl;
      player.skinTextureUpdatedAt = result.skinTextureUpdatedAt;
      meta[player.uuid] = {
        ...(meta[player.uuid] || {}),
        uuid: player.uuid,
        name: player.name,
        filename: `${player.uuid}.png`,
        updatedAt: result.updatedAt,
        skinModel: result.skinModel,
        skinUrl: result.skinUrl,
        skinTextureUpdatedAt: result.skinTextureUpdatedAt,
        skinWidth: result.width,
        skinHeight: result.height
      };
      console.log(`ok (${result.skinModel})`);
      ok++;
    } catch (e) {
      const cached = await getCachedAvatarFallback(player, meta[player.uuid]);
      if (cached) {
        player.hasAvatar = true;
        player.avatarUpdatedAt = cached.updatedAt;
        if (cached.skinModel) player.skinModel = cached.skinModel;
        if (cached.skinUrl) player.skinUrl = cached.skinUrl;
        if (cached.skinTextureUpdatedAt) player.skinTextureUpdatedAt = cached.skinTextureUpdatedAt;
        meta[player.uuid] = {
          ...(meta[player.uuid] || {}),
          uuid: player.uuid,
          name: player.name,
          filename: `${player.uuid}.png`,
          updatedAt: cached.updatedAt,
          skinModel: cached.skinModel ?? meta[player.uuid]?.skinModel,
          skinUrl: cached.skinUrl ?? meta[player.uuid]?.skinUrl,
          skinTextureUpdatedAt: cached.skinTextureUpdatedAt ?? meta[player.uuid]?.skinTextureUpdatedAt,
          skinWidth: cached.width ?? meta[player.uuid]?.skinWidth,
          skinHeight: cached.height ?? meta[player.uuid]?.skinHeight
        };
        console.log(`fallback to cached png (${e.message})`);
        fallback++;
      } else {
        console.log(`FAILED: ${e.message}`);
        fail++;
      }
    }
    await sleep(INTER_PLAYER_DELAY_MS);
  }

  playersData.lastUpdated = new Date().toISOString();
  await writeJson(playersPath, playersData);
  await writeJson(metaPath, meta);

  console.log(`\nDone! ${ok} ok, ${fallback} fallback, ${fail} failed.`);
}

main().catch(console.error);
