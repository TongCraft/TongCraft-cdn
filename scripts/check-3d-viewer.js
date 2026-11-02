import { chromium } from 'playwright';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'playwright-results');

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not respond: ${url}`);
}

async function readPlayers() {
  const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'players.json'), 'utf-8'));
  const players = data.players || [];
  const slim = players.find(player => player.skinModel === 'slim');
  const classic = players.find(player => player.skinModel === 'classic');
  return [slim, classic].filter(Boolean).slice(0, 2);
}

async function canvasStats(page) {
  const buffer = await page.locator('#viewer-canvas').screenshot();
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let nonBackground = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 0 && (Math.abs(r - 26) > 4 || Math.abs(g - 26) > 4 || Math.abs(b - 26) > 4)) {
      nonBackground++;
    }
  }
  return { buffer, data, width: info.width, height: info.height, nonBackground };
}

function changedPixels(before, after) {
  const length = Math.min(before.data.length, after.data.length);
  let changed = 0;
  for (let i = 0; i < length; i += 4) {
    const delta =
      Math.abs(before.data[i] - after.data[i]) +
      Math.abs(before.data[i + 1] - after.data[i + 1]) +
      Math.abs(before.data[i + 2] - after.data[i + 2]);
    if (delta > 20) changed++;
  }
  return changed;
}

async function verifyCase(page, baseUrl, player, viewportName, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__reactViewerReady, null, { timeout: 15000 });
  await page.evaluate(uuid => window.open3d(uuid), player.uuid);
  await page.waitForSelector('.viewer-modal', { timeout: 15000 });
  await page.waitForFunction(() => window.__viewerState?.skinModel, null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const modal = page.locator('.viewer-modal');
  if (await modal.getByRole('button', { name: /export|导出/i }).count() || await modal.locator('input[type="number"]').count()) {
    throw new Error('The viewer still contains model export or print controls');
  }

  const state = await page.evaluate(() => window.__viewerState);
  if (state.skinModel !== player.skinModel) {
    throw new Error(`${player.name}: expected ${player.skinModel}, rendered ${state.skinModel}`);
  }

  const before = await canvasStats(page);
  if (before.nonBackground < 1000) {
    throw new Error(`${player.name}: canvas appears blank (${before.nonBackground} non-background pixels)`);
  }
  const shot = path.join(OUT_DIR, `${viewportName}-${player.skinModel}-${player.name}.png`);
  await modal.screenshot({ path: shot });

  await page.getByLabel('Head').uncheck();
  await page.waitForFunction(() => window.__partVisibility?.head === false, null, { timeout: 5000 });
  await page.waitForTimeout(250);
  const withoutHead = await canvasStats(page);
  const hiddenHeadPixels = changedPixels(before, withoutHead);
  if (hiddenHeadPixels < 1000) {
    throw new Error(`${player.name}: hiding Head did not visibly change the canvas (${hiddenHeadPixels} changed pixels)`);
  }
  await page.getByLabel('Head').check();
  await page.waitForFunction(() => window.__partVisibility?.head === true, null, { timeout: 5000 });
  await page.waitForTimeout(250);

  await page.getByLabel('Auto Rotate').check();
  await page.waitForFunction(() => window.__autoRotate === true, null, { timeout: 5000 });
  const autoStart = await canvasStats(page);
  await page.waitForTimeout(900);
  const autoEnd = await canvasStats(page);
  const autoChanged = changedPixels(autoStart, autoEnd);
  if (autoChanged < 1000) {
    throw new Error(`${player.name}: auto rotate did not visibly change the canvas (${autoChanged} changed pixels)`);
  }
  await page.getByLabel('Auto Rotate').uncheck();
  await page.waitForFunction(() => window.__autoRotate === false, null, { timeout: 5000 });

  await page.getByLabel('Animation').selectOption('wave');
  await page.waitForFunction(() => window.__viewerAnimation === 'wave', null, { timeout: 5000 });
  const waveStart = await canvasStats(page);
  await page.waitForTimeout(700);
  const waveEnd = await canvasStats(page);
  const waveChanged = changedPixels(waveStart, waveEnd);
  if (waveChanged < 300) {
    throw new Error(`${player.name}: wave animation did not visibly change the canvas (${waveChanged} changed pixels)`);
  }
  await page.getByLabel('Animation').selectOption('idle');
  await page.waitForFunction(() => window.__viewerAnimation === 'idle', null, { timeout: 5000 });

  const beforeZoom = await canvasStats(page);
  const canvasBox = await page.locator('#viewer-canvas').boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(500);
  const afterZoom = await canvasStats(page);
  const zoomChanged = changedPixels(beforeZoom, afterZoom);
  if (zoomChanged < 300) {
    throw new Error(`${player.name}: zoom did not visibly change the canvas (${zoomChanged} changed pixels)`);
  }

  const box = await page.locator('#viewer-canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await canvasStats(page);
  const changed = changedPixels(afterZoom, after);
  if (changed < 1000) {
    throw new Error(`${player.name}: drag did not visibly change the canvas (${changed} changed pixels)`);
  }

  return {
    player: player.name,
    model: state.skinModel,
    viewport: viewportName,
    armWidth: state.armWidth,
    zoomChangedPixels: zoomChanged,
    nonBackgroundBefore: before.nonBackground,
    nonBackgroundAfter: after.nonBackground,
    changedPixels: changed,
    screenshot: path.relative(ROOT, shot)
  };
}

async function main() {
  const players = await readPlayers();
  if (players.length === 0) {
    throw new Error('No players with skinModel found. Run npm run fetch first.');
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const port = await getFreePort();
  const baseUrl = process.env.CHECK_3D_BASE_URL?.replace(/\/$/, '') || `http://localhost:${port}`;
  const server = process.env.CHECK_3D_BASE_URL ? null : spawn(process.execPath, ['src/server.js', '--port', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  server?.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  try {
    if (server) await waitForServer(baseUrl);
    const browser = await chromium.launch({
      proxy: process.env.PLAYWRIGHT_PROXY_SERVER ? { server: process.env.PLAYWRIGHT_PROXY_SERVER, bypass: 'localhost,127.0.0.1' } : undefined
    });
    const page = await browser.newPage();
    // The gallery and viewer must work even when third-party CDNs are unreachable.
    const externalScripts = [];
    await page.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin === new URL(baseUrl).origin) return route.continue();
      if (request.resourceType() === 'script') externalScripts.push(request.url());
      return route.abort();
    });
    const results = [];

    try {
      for (const player of players) {
        results.push(await verifyCase(page, baseUrl, player, 'desktop', { width: 1280, height: 800 }));
        results.push(await verifyCase(page, baseUrl, player, 'mobile', { width: 390, height: 844 }));
      }
      // The standalone viewer must also resolve bundled assets and skin URLs.
      await page.setViewportSize({ width: 1280, height: 800 });
      const selected = players[players.length - 1];
      await page.goto(baseUrl + '/3d?player=' + selected.uuid, { waitUntil: 'networkidle' });
      await page.waitForFunction(uuid => window.__viewerState?.uuid === uuid, selected.uuid);
      await page.locator('#sel').selectOption(players[0].uuid);
      await page.waitForFunction(uuid => window.__viewerState?.uuid === uuid, players[0].uuid);
      await page.screenshot({ path: path.join(OUT_DIR, 'desktop-standalone.png') });
      if (externalScripts.length) throw new Error('External script requests: ' + externalScripts.join(', '));
    } finally {
      await browser.close();
    }

    console.table(results);
  } finally {
    server?.kill();
  }

  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
