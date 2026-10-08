/**
 * Update avatar metadata
 * 
 * Scans the avatars directory and generates/updates metadata files
 * 
 * Usage:
 *   node scripts/update-meta.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATARS_DIR = path.join(__dirname, '..', 'avatars');
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Load players.json
 */
async function loadPlayers() {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'players.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return { players: [], lastUpdated: null };
  }
}

/**
 * Save players.json
 */
async function savePlayers(data) {
  await fs.writeFile(
    path.join(DATA_DIR, 'players.json'),
    JSON.stringify(data, null, 2)
  );
}

/**
 * Generate avatars-meta.json from avatars directory
 */
async function generateMeta() {
  const files = await fs.readdir(AVATARS_DIR);
  const avatarFiles = files.filter(f => f.endsWith('.png'));
  
  const meta = {};
  
  for (const filename of avatarFiles) {
    const uuid = filename.replace('.png', '');
    const filePath = path.join(AVATARS_DIR, filename);
    const stat = await fs.stat(filePath);
    
    // Try to find player name from players.json
    const playersData = await loadPlayers();
    const player = playersData.players.find(p => p.uuid === uuid);
    
    meta[uuid] = {
      uuid,
      name: player ? player.name : null,
      filename,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      skinModel: player?.skinModel || meta[uuid]?.skinModel || null,
      skinUrl: player?.skinUrl || meta[uuid]?.skinUrl || null,
      skinTextureUpdatedAt: player?.skinTextureUpdatedAt || meta[uuid]?.skinTextureUpdatedAt || null
    };
  }
  
  const metaFile = path.join(DATA_DIR, 'avatars-meta.json');
  await fs.writeFile(metaFile, JSON.stringify(meta, null, 2));
  
  return meta;
}

/**
 * Main function
 */
async function main() {
  console.log('Updating metadata...\n');
  
  // Ensure directories exist
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  // Generate metadata
  const meta = await generateMeta();
  const avatarCount = Object.keys(meta).length;
  console.log(`Found ${avatarCount} avatar(s) in avatars/`);
  
  // Update players.json with avatar info
  const playersData = await loadPlayers();
  for (const player of playersData.players) {
    if (meta[player.uuid]) {
      player.hasAvatar = true;
      player.avatarUpdatedAt = meta[player.uuid].updatedAt;
      if (meta[player.uuid].skinModel) player.skinModel = meta[player.uuid].skinModel;
      if (meta[player.uuid].skinUrl) player.skinUrl = meta[player.uuid].skinUrl;
      if (meta[player.uuid].skinTextureUpdatedAt) {
        player.skinTextureUpdatedAt = meta[player.uuid].skinTextureUpdatedAt;
      }
    } else {
      player.hasAvatar = false;
    }
  }
  playersData.lastUpdated = new Date().toISOString();
  await savePlayers(playersData);
  console.log('Updated players.json');
  
  console.log('\nDone!');
}

main().catch(console.error);
