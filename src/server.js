import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '3000');
const AVATARS_DIR = path.join(__dirname, '..', 'avatars');
const SKINS_DIR = path.join(__dirname, '..', 'skins');
const DATA_DIR = path.join(__dirname, '..', 'data');
const VISIT_COUNTER_NAMESPACE = process.env.VISIT_COUNTER_NAMESPACE || 'weiuou';
const VISIT_COUNTER_KEY = process.env.VISIT_COUNTER_KEY || 'tongcraft-cdn';
const VISIT_COUNTER_FALLBACK_BADGE = 'https://hits.sh/github.com/TongCraft/TongCraft-cdn.svg?label=&color=111111';
const FRIEND_LINKS = [
  { label: '服务器官网', href: 'https://www.tongcraft.cn/' },
  { label: '服务器地图', href: 'https://map.weiuou.art/' },
];

const avatarCache = new Map();
const skinCache = new Map();
const playersData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'players.json'), 'utf-8'));
const players = playersData.players || [];

fs.readdirSync(AVATARS_DIR)
  .filter(f => f.endsWith('.png'))
  .forEach(f => {
    avatarCache.set(f.replace('.png', ''), fs.readFileSync(path.join(AVATARS_DIR, f)));
  });

if (fs.existsSync(SKINS_DIR)) {
  fs.readdirSync(SKINS_DIR)
    .filter(f => f.endsWith('.png'))
    .forEach(f => {
      skinCache.set(f.replace('.png', ''), fs.readFileSync(path.join(SKINS_DIR, f)));
    });
}

const html = generateHTML(players, avatarCache.size, {
  visitCounterNamespace: VISIT_COUNTER_NAMESPACE,
  visitCounterKey: VISIT_COUNTER_KEY,
  visitCounterFallbackBadge: VISIT_COUNTER_FALLBACK_BADGE,
  friendLinks: FRIEND_LINKS,
});

function assetPath(pathname) {
  return process.env.STATIC_EXPORT ? pathname.replace(/^\//, '') : pathname;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function generateHTML(players, count, options = {}) {
  const {
    visitCounterNamespace = 'weiuou',
    visitCounterKey = 'tongcraft-cdn',
    visitCounterFallbackBadge = '',
    friendLinks = [],
  } = options;
  const cards = players.map(p => {
    const has = avatarCache.has(p.uuid);
    const name = escapeHTML(p.name);
    const uuid = escapeHTML(p.uuid);
    const img = has ? `<img src="${assetPath(`/avatars/${uuid}.png`)}" loading="lazy" alt="${name}">` : `<div class="na">${name[0] || '?'}</div>`;
    const model = escapeHTML(p.skinModel || 'unknown');
    const texture = p.skinUrl ? 'Texture ready' : 'Name lookup';
    return `<article class="card" data-name="${name.toLowerCase()}" data-uuid="${uuid}" onclick="summonMascotFromCard(event,'${uuid}')">
      <div class="avatar">${img}</div>
      <div class="brand">${name}</div>
      <div class="meta">${model} · ${texture}</div>
      <div class="actions">
        <button type="button" class="swatch" onclick="copyAvatar('${uuid}')" title="Copy avatar URL">头像</button>
        <button type="button" onclick="copyGive('${uuid}')" title="Copy Minecraft give command">指令</button>
        <button type="button" onclick="open3d('${uuid}')" title="Open 3D viewer">3D</button>
      </div>
    </article>`;
  }).join('');
  const friendLinksMarkup = friendLinks.map(link => `<a href="${escapeHTML(link.href)}" target="_blank" rel="noreferrer">${escapeHTML(link.label)}</a>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tongcraft CDN</title><style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#f7f7f5;--fg:#111;--muted:#666;--line:#d9d9d6;--card:#fff;--soft:#f1f1ef;--accent:#111}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);padding:20px 34px 34px}
body.dark{--bg:#151515;--fg:#f5f5f5;--muted:#aaa;--line:#333;--card:#202020;--soft:#2a2a2a;--accent:#f5f5f5}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:28px}
header h1{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:25px;font-weight:800;letter-spacing:.2px}
header p{font-size:14px;margin-top:8px;color:var(--fg)}
.header-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
.site-meta{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:10px;font-size:13px;color:var(--muted)}
.site-meta strong{color:var(--fg);font-weight:700}
.site-meta a{color:inherit;text-decoration:none;border-bottom:1px solid transparent}
.site-meta a:hover{color:var(--fg);border-color:currentColor}
.friend-links{display:inline-flex;flex-wrap:wrap;gap:10px}
.visit-counter-badge{height:20px;vertical-align:middle}
.header-actions{display:flex;gap:16px;align-items:center;color:var(--fg);font-size:13px;white-space:nowrap}
.header-actions button{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:4px 2px}
.header-actions .icon-link{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;color:inherit;border-radius:4px;text-decoration:none}
.header-actions .icon-link:hover{background:var(--soft)}
.header-actions .icon-link svg{width:19px;height:19px;display:block;fill:currentColor}
.bar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:14px;align-items:end;margin-bottom:20px}
.control{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)}
.control input{width:100%;height:34px;border:1px solid var(--line);border-radius:3px;background:var(--card);color:var(--fg);padding:0 12px;font-size:14px;outline:none}
.control input:focus{border-color:var(--fg)}
.group{display:flex;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:var(--card);height:34px}
.group button{min-width:34px;border:0;border-right:1px solid var(--line);background:var(--card);color:var(--fg);font-weight:700;cursor:pointer;padding:0 9px}
.group button:last-child{border-right:0}
.group button.on,.group button:hover{background:var(--accent);color:var(--bg)}
.count{font-size:13px;color:var(--muted);align-self:center;white-space:nowrap}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(184px,1fr));gap:8px}
.card{min-height:181px;border:1px solid var(--line);border-radius:5px;background:var(--card);display:grid;grid-template-rows:1fr auto auto 28px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.card:hover{box-shadow:0 2px 10px rgba(0,0,0,.12);transform:translateY(-1px)}
.avatar{height:116px;display:flex;align-items:center;justify-content:center;padding:18px;background:var(--card)}
.avatar img{width:80px;height:80px;border-radius:10px;image-rendering:pixelated;object-fit:cover}
.na{width:80px;height:80px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font-size:32px;font-weight:800}
.brand{font-size:16px;font-weight:700;line-height:1.2;padding:0 12px 4px;word-break:break-word;color:var(--fg)}
.meta{font-size:11px;color:var(--muted);padding:0 12px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.actions{display:grid;grid-template-columns:1fr 45px 39px;border-top:1px solid var(--line);height:28px}
.actions button{border:0;border-right:1px solid var(--line);background:var(--card);color:var(--fg);font-size:12px;font-weight:700;cursor:pointer}
.actions button:last-child{border-right:0}
.actions button:hover{background:var(--soft)}
.actions .swatch{background:#111;color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
body.dark .actions .swatch{background:#f5f5f5;color:#111}
.t{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(12px);padding:9px 18px;background:#111;color:#fff;border-radius:6px;font-size:13px;opacity:0;transition:.2s;pointer-events:none;white-space:nowrap;z-index:200}
.t.on{opacity:1;transform:translateX(-50%) translateY(0)}
@media (max-width:780px){body{padding:16px}header{flex-direction:column}.header-actions{flex-wrap:wrap;white-space:normal}.bar{grid-template-columns:1fr 1fr}.count{grid-column:1 / -1}.g{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
.viewer-backdrop{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:28px}
.viewer-modal{width:min(980px,100%);height:min(720px,calc(100vh - 56px));background:#161616;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:8px;box-shadow:0 24px 80px rgba(0,0,0,.45);display:grid;grid-template-columns:240px 1fr;overflow:hidden}
.viewer-panel{background:#202020;border-right:1px solid rgba(255,255,255,.1);padding:16px;display:flex;flex-direction:column;gap:12px}
.viewer-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.viewer-title{font-size:14px;font-weight:700}
.viewer-close{width:30px;height:30px;border:1px solid rgba(255,255,255,.16);background:#2b2b2b;color:#fff;border-radius:6px;cursor:pointer;font-size:18px;line-height:1}
.viewer-close:hover{background:#383838}
.viewer-panel select{width:100%;padding:8px 10px;border:1px solid #444;border-radius:6px;background:#2f2f2f;color:#fff;font-size:13px;outline:none}
.viewer-meta{font-size:12px;color:#aaa;line-height:1.6;word-break:break-all}
.viewer-meta strong{display:block;color:#fff;font-size:13px;line-height:1.35;margin-bottom:4px}
.viewer-parts{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#ddd}
.viewer-part{display:flex;align-items:center;gap:7px;min-height:24px;cursor:pointer;user-select:none}
.viewer-part input{width:14px;height:14px;accent-color:#fff}
.viewer-part-wide{grid-column:1 / -1}
.viewer-part-actions{display:flex;gap:8px}
.viewer-part-actions button{flex:1;padding:6px 8px;border:1px solid rgba(255,255,255,.16);border-radius:6px;background:#2b2b2b;color:#fff;font-size:12px;cursor:pointer}
.viewer-part-actions button:hover{background:#383838}
.viewer-control-label{font-size:12px;color:#aaa;display:flex;flex-direction:column;gap:6px}
.viewer-export{margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:8px}
.viewer-export-row{display:grid;grid-template-columns:1fr 42px;gap:8px;align-items:end}
.viewer-export-row input{width:100%;height:32px;padding:0 8px;border:1px solid #444;border-radius:6px;background:#2f2f2f;color:#fff;font-size:13px;outline:none}
.viewer-export-unit{height:32px;display:flex;align-items:center;justify-content:center;border:1px solid #444;border-radius:6px;color:#aaa;font-size:12px}
.viewer-export button{width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:#f2f2f2;color:#111;font-size:12px;font-weight:800;cursor:pointer}
.viewer-export button:hover{background:#fff}
.viewer-export button:disabled{cursor:not-allowed;opacity:.5}
.viewer-export .viewer-export-secondary{background:#2b2b2b;color:#fff}
.viewer-export .viewer-export-secondary:hover{background:#383838}
.viewer-export-note{font-size:10px;line-height:1.45;color:#888}
.viewer-stage{position:relative;min-width:0;background:#1a1a1a}
.viewer-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.viewer-loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;color:#888;pointer-events:none}
.viewer-hint{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:12px;color:#666;pointer-events:none;white-space:nowrap}
.mascot{position:fixed;left:calc(100vw - 292px);top:calc(100vh - 444px);z-index:80;width:284px;height:426px;cursor:grab;touch-action:none;user-select:none;overflow:visible}
.mascot:active{cursor:grabbing}
.mascot canvas{position:absolute;inset:0;width:100%;height:100%;display:block;filter:drop-shadow(0 18px 18px rgba(0,0,0,.18))}
.mascot-loading{display:none}
.mascot-bubble{position:absolute;right:72%;top:24%;max-width:190px;padding:8px 11px;background:rgba(17,17,17,.88);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:8px;font-family:Minecraft,Minecraftia,"Press Start 2P","Courier New",ui-monospace,monospace;font-size:12px;font-weight:700;line-height:1.45;text-shadow:1px 1px 0 rgba(0,0,0,.75);box-shadow:0 12px 28px rgba(0,0,0,.22);pointer-events:none;opacity:0;transform:translateY(8px);transition:opacity .18s,transform .18s;white-space:normal;image-rendering:pixelated}
.mascot-bubble.on{opacity:1;transform:translateY(0)}
body.dark .mascot-bubble{background:rgba(245,245,245,.9);color:#111;border-color:rgba(0,0,0,.12);text-shadow:1px 1px 0 rgba(255,255,255,.55)}
@media (max-width:780px){.mascot{width:220px;height:330px;left:calc(100vw - 228px);top:calc(100vh - 346px)}}
@media (max-width:720px){
  .viewer-backdrop{padding:12px}
  .viewer-modal{height:calc(100vh - 24px);grid-template-columns:1fr;grid-template-rows:auto 1fr}
  .viewer-panel{border-right:0;border-bottom:1px solid rgba(255,255,255,.1)}
}
</style></head><body>
<header>
  <div class="header-copy"><h1>Tongcraft Heads</h1><p>${players.length} 个玩家头颅 · ${count} 张头像缓存</p><div class="site-meta"><span><strong>本站点击量</strong> <span id="visitCount">--</span></span><span><strong>友链</strong> <span class="friend-links">${friendLinksMarkup}</span></span></div></div>
  <div class="header-actions">
    <a class="icon-link" href="https://github.com/TongCraft/TongCraft-cdn" target="_blank" rel="noreferrer" aria-label="GitHub repository" title="GitHub repository"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.16c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.27-5.23-5.67 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18A10.95 10.95 0 0 1 12 6.06c.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.66.41.36.78 1.06.78 2.14v3.16c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg></a>
    <button type="button" onclick="toggleMascot()">Mascot</button><button type="button" onclick="toggleTheme()">◐ 主题</button><button type="button" onclick="copyVisibleGive()">⛏ 复制当前指令</button>
  </div>
</header>
<div class="bar">
  <label class="control">搜索<input id="q" placeholder="按玩家名或 UUID 搜索..." oninput="f()"></label>
  <label class="control">排序<div class="group"><button type="button" class="on" id="sortName" onclick="sortCards('name')">A-Z</button><button type="button" id="sortUuid" onclick="sortCards('uuid')">UUID</button></div></label>
  <label class="control">主题<div class="group"><button type="button" onclick="setTheme(false)">☼</button><button type="button" onclick="setTheme(true)">☾</button></div></label>
  <span class="count" id="cnt">${players.length} players</span>
</div>
<div class="g" id="grid">${cards}</div>
<div class="t" id="t">Copied!</div>
<div id="viewer-root"></div>
<div id="mascot-root"></div>
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
    "fflate": "https://esm.sh/fflate@0.8.2",
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script>window.__PLAYERS__ = ${JSON.stringify(players.map(p => ({ uuid: p.uuid, name: p.name, skinModel: p.skinModel || null, skinUrl: p.skinUrl || null })))};window.__VISIT_COUNTER__=${JSON.stringify({ namespace: visitCounterNamespace, key: visitCounterKey, fallbackBadge: visitCounterFallbackBadge })};</script>
<script>
function toast(message){var t=document.getElementById('t');t.textContent=message;t.classList.add('on');setTimeout(function(){t.classList.remove('on')},1400)}
function giveCommand(uuid){var p=(window.__PLAYERS__||[]).find(function(player){return player.uuid===uuid});var id=p&&p.name?p.name:uuid;return '/give @p minecraft:player_head[minecraft:profile='+JSON.stringify(id)+'] 1'}
function mascotSay(message){window.dispatchEvent(new CustomEvent('mascot-say',{detail:{message:message}}))}
function summonMascot(uuid,message){window.dispatchEvent(new CustomEvent('summon-mascot',{detail:{uuid:uuid,message:message}}))}
function summonMascotFromCard(event,uuid){if(event.target.closest('button'))return;var p=(window.__PLAYERS__||[]).find(function(player){return player.uuid===uuid});summonMascot(uuid,(p&&p.name?p.name:uuid)+' 加入了大厅')}
function copyText(text,message){navigator.clipboard.writeText(text).then(function(){toast(message);mascotSay('复制好了！')})}
function copyAvatar(uuid){copyText(new URL('avatars/'+uuid+'.png', location.href).href,'头像 URL 已复制')}
function copyGive(uuid){copyText(giveCommand(uuid),'give 头颅指令已复制')}
function copyVisibleGive(){var commands=Array.from(document.querySelectorAll('.card')).filter(function(c){return c.style.display!=='none'}).map(function(c){return giveCommand(c.dataset.uuid)});copyText(commands.join(String.fromCharCode(10)),commands.length+' 条 give 指令已复制')}
function f(){var q=document.getElementById('q').value.toLowerCase(),n=0;document.querySelectorAll('.card').forEach(function(c){var show=(c.dataset.name+' '+c.dataset.uuid).includes(q);c.style.display=show?'':'none';if(show)n++});document.getElementById('cnt').textContent=n+' players'}
function sortCards(key){var grid=document.getElementById('grid');Array.from(grid.children).sort(function(a,b){return a.dataset[key].localeCompare(b.dataset[key])}).forEach(function(card){grid.appendChild(card)});document.getElementById('sortName').classList.toggle('on',key==='name');document.getElementById('sortUuid').classList.toggle('on',key==='uuid')}
function setTheme(dark){document.body.classList.toggle('dark',dark);localStorage.setItem('theme',dark?'dark':'light');window.dispatchEvent(new CustomEvent('theme-changed',{detail:{dark:dark}}))}
function toggleTheme(){setTheme(!document.body.classList.contains('dark'))}
function open3d(uuid){window.dispatchEvent(new CustomEvent('open-3d-viewer',{detail:{uuid:uuid}}))}
function toggleMascot(){window.dispatchEvent(new CustomEvent('toggle-mascot'))}
function visitCounterUrl(action){var cfg=window.__VISIT_COUNTER__||{};return 'https://api.countapi.xyz/'+action+'/'+encodeURIComponent(cfg.namespace||'weiuou')+'/'+encodeURIComponent(cfg.key||'tongcraft-cdn')}
function showVisitFallback(el){var cfg=window.__VISIT_COUNTER__||{};if(!cfg.fallbackBadge){el.textContent='--';return}el.innerHTML='';var img=document.createElement('img');img.className='visit-counter-badge';img.alt='本站点击量';img.src=cfg.fallbackBadge;el.appendChild(img)}
async function syncVisitCount(){var el=document.getElementById('visitCount');if(!el)return;var storageKey='tongcraft:visit:last-hit';var now=Date.now();var last=Number(localStorage.getItem(storageKey)||0);var action=last&&now-last<18e5?'get':'hit';try{var response=await fetch(visitCounterUrl(action),{cache:'no-store'});if(!response.ok)throw new Error('visit counter '+response.status);var payload=await response.json();if(action==='hit')localStorage.setItem(storageKey,String(now));if(typeof payload.value==='number')el.textContent=payload.value.toLocaleString('zh-CN');else showVisitFallback(el)}catch(error){showVisitFallback(el);console.warn('visit counter unavailable, fallback badge used',error)}}
window.copyAvatar=copyAvatar;window.copyGive=copyGive;window.copyVisibleGive=copyVisibleGive;window.f=f;window.sortCards=sortCards;window.setTheme=setTheme;window.toggleTheme=toggleTheme;window.open3d=open3d;window.toggleMascot=toggleMascot;window.summonMascotFromCard=summonMascotFromCard;
setTheme(localStorage.getItem('theme')==='dark')
syncVisitCount()
</script>
<script type="module">
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { strToU8, zipSync } from 'fflate';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const players = window.__PLAYERS__ || [];
const h = React.createElement;
const PARTS = [
  ['head', 'Head'],
  ['body', 'Body'],
  ['rightArm', 'Right Arm'],
  ['leftArm', 'Left Arm'],
  ['rightLeg', 'Right Leg'],
  ['leftLeg', 'Left Leg'],
  ['outerLayer', 'Outer Layer']
];
const DEFAULT_VISIBILITY = Object.fromEntries(PARTS.map(([key]) => [key, true]));
const ANIMATIONS = [
  ['none', 'None'],
  ['idle', 'Idle'],
  ['walk', 'Walk'],
  ['run', 'Run'],
  ['wave', 'Wave'],
  ['crouch', 'Crouch']
];
const DEFAULT_PRINT_HEIGHT = 64;

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function safeFilename(value) {
  return String(value || 'player').trim().replace(/[^a-z0-9._-]+/gi, '-') || 'player';
}

function disposeModel(root) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material?.dispose?.());
  });
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character] || character);
}

function coordinate(value) {
  if (Math.abs(value) < 0.000005) return '0';
  return Number(value.toFixed(5)).toString();
}

function getRegion(img, u, v, uw, uh) {
  const c = document.createElement('canvas');
  c.width = uw;
  c.height = uh;
  c.getContext('2d').drawImage(img, u, v, uw, uh, 0, 0, uw, uh);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makeSkinCanvas(img) {
  if (img.naturalWidth === 64 && img.naturalHeight === 64) return img;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(img, 0, 0);
  const copyFace = (sx, sy, sw, sh, dx, dy) => {
    ctx.save();
    ctx.translate(dx + sw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  };
  copyFace(4, 16, 4, 4, 20, 48);
  copyFace(8, 16, 4, 4, 24, 48);
  copyFace(8, 20, 4, 12, 16, 52);
  copyFace(4, 20, 4, 12, 20, 52);
  copyFace(0, 20, 4, 12, 24, 52);
  copyFace(12, 20, 4, 12, 28, 52);
  copyFace(44, 16, 4, 4, 36, 48);
  copyFace(48, 16, 4, 4, 40, 48);
  copyFace(48, 20, 4, 12, 32, 52);
  copyFace(44, 20, 4, 12, 36, 52);
  copyFace(40, 20, 4, 12, 40, 52);
  copyFace(52, 20, 4, 12, 44, 52);
  return c;
}

function isSlimSkin(img) {
  if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return false;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  const alphaAt = (x, y) => data[(y * 64 + x) * 4 + 3];
  const columnTransparent = (x, y1, y2) => {
    for (let y = y1; y <= y2; y++) if (alphaAt(x, y) !== 0) return false;
    return true;
  };
  return columnTransparent(47, 16, 31) && columnTransparent(54, 20, 31) && columnTransparent(47, 32, 47) && columnTransparent(54, 36, 47);
}

function partMats(img, front, back, left, right, top, bottom, fw, fh, dw) {
  const t = (x, y, w, h) => new THREE.MeshBasicMaterial({ map: getRegion(img, x, y, w, h), transparent: true, alphaTest: 0.5 });
  return [t(...right, dw, fh), t(...left, dw, fh), t(...top, fw, dw), t(...bottom, fw, dw), t(...front, fw, fh), t(...back, fw, fh)];
}

function addOverlay(img, parent, front, back, left, right, top, bottom, fw, fh, dw) {
  const S = 1 / 8;
  const E = S * 0.64;
  const mats = partMats(img, front, back, left, right, top, bottom, fw, fh, dw);
  mats.forEach(m => { m.depthWrite = false; });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(S * fw + E, S * fh + E, S * dw + E), mats);
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

function markPart(object, part) {
  object.userData.part = part;
  return object;
}

function markOuter(object, part) {
  object.userData.part = part;
  object.userData.outerLayer = true;
  return object;
}

function rememberBase(object) {
  object.userData.basePosition = object.position.clone();
  object.userData.baseRotation = object.rotation.clone();
  return object;
}

function applyPartVisibility(group, visibility) {
  group.traverse(object => {
    const part = object.userData.part;
    if (!part) return;
    object.visible = Boolean(visibility[part]) && (!object.userData.outerLayer || Boolean(visibility.outerLayer));
  });
  window.__partVisibility = { ...visibility };
}

function resetBone(object) {
  if (!object?.userData.basePosition || !object?.userData.baseRotation) return;
  object.position.copy(object.userData.basePosition);
  object.rotation.copy(object.userData.baseRotation);
}

function animateBones(group, action, elapsed) {
  const head = group.getObjectByName('head');
  const body = group.getObjectByName('body');
  const rightArm = group.getObjectByName('rightArm');
  const leftArm = group.getObjectByName('leftArm');
  const rightLeg = group.getObjectByName('rightLeg');
  const leftLeg = group.getObjectByName('leftLeg');
  const bones = [head, body, rightArm, leftArm, rightLeg, leftLeg];
  if (bones.some(bone => !bone)) return;
  bones.forEach(resetBone);

  if (!action || action === 'none') return;

  if (action === 'idle') {
    const breathe = Math.sin(elapsed * 2.2);
    body.position.y += breathe * 0.015;
    head.rotation.y = Math.sin(elapsed * 0.9) * 0.08;
    rightArm.rotation.x = 0.08 + Math.sin(elapsed * 1.7) * 0.04;
    leftArm.rotation.x = 0.08 - Math.sin(elapsed * 1.7) * 0.04;
    return;
  }

  if (action === 'walk' || action === 'run') {
    const speed = action === 'run' ? 8.5 : 4.4;
    const swing = action === 'run' ? 0.9 : 0.55;
    const t = elapsed * speed;
    const s = Math.sin(t) * swing;
    const bounce = Math.abs(Math.cos(t)) * (action === 'run' ? 0.055 : 0.025);
    body.position.y += bounce;
    rightArm.rotation.x = -s;
    leftArm.rotation.x = s;
    rightLeg.rotation.x = s;
    leftLeg.rotation.x = -s;
    rightArm.rotation.z = action === 'run' ? 0.12 : 0.04;
    leftArm.rotation.z = action === 'run' ? -0.12 : -0.04;
    head.rotation.x = Math.sin(t * 0.5) * 0.035;
    return;
  }

  if (action === 'wave') {
    const sway = Math.sin(elapsed * 5.8);
    rightArm.rotation.z = -2.55 + sway * 0.22;
    rightArm.rotation.x = -0.08 + Math.sin(elapsed * 3.2) * 0.06;
    body.rotation.z = Math.sin(elapsed * 1.8) * 0.025;
    leftArm.rotation.x = 0.1;
    head.rotation.z = Math.sin(elapsed * 2.1) * 0.045;
    return;
  }

  if (action === 'crouch') {
    body.rotation.x = 0.22;
    body.position.y -= 0.16;
    head.position.z -= 0.12;
    head.position.y -= 0.1;
    rightArm.rotation.x = 0.35;
    leftArm.rotation.x = 0.35;
    rightLeg.rotation.x = -0.22;
    leftLeg.rotation.x = -0.22;
  }
}

function partForMesh(mesh, root) {
  let owner = mesh;
  while (owner && owner !== root) {
    if (owner.userData.part) return owner.userData.part;
    owner = owner.parent;
  }
  return null;
}

function pixelPlateGeometry(face, bounds, columns, rows, column, row, inset, outset, overlap = 1) {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const thickness = inset + outset;
  const surfaceOffset = (outset - inset) / 2;
  let width;
  let height;
  let depth;
  let x = center.x;
  let y = center.y;
  let z = center.z;

  if (face === 0 || face === 1) {
    const cellHeight = size.y / rows;
    const cellDepth = size.z / columns;
    width = thickness;
    height = cellHeight * overlap;
    depth = cellDepth * overlap;
    x = face === 0 ? bounds.max.x + surfaceOffset : bounds.min.x - surfaceOffset;
    y = bounds.max.y - (row + 0.5) * cellHeight;
    z = face === 0
      ? bounds.max.z - (column + 0.5) * cellDepth
      : bounds.min.z + (column + 0.5) * cellDepth;
  } else if (face === 2 || face === 3) {
    const cellWidth = size.x / columns;
    const cellDepth = size.z / rows;
    width = cellWidth * overlap;
    height = thickness;
    depth = cellDepth * overlap;
    x = bounds.min.x + (column + 0.5) * cellWidth;
    y = face === 2 ? bounds.max.y + surfaceOffset : bounds.min.y - surfaceOffset;
    z = face === 2
      ? bounds.min.z + (row + 0.5) * cellDepth
      : bounds.max.z - (row + 0.5) * cellDepth;
  } else {
    const cellWidth = size.x / columns;
    const cellHeight = size.y / rows;
    width = cellWidth * overlap;
    height = cellHeight * overlap;
    depth = thickness;
    x = face === 4
      ? bounds.min.x + (column + 0.5) * cellWidth
      : bounds.max.x - (column + 0.5) * cellWidth;
    y = bounds.max.y - (row + 0.5) * cellHeight;
    z = face === 4 ? bounds.max.z + surfaceOffset : bounds.min.z - surfaceOffset;
  }

  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}

function normalizePrintableGroup(printable, requestedHeight) {
  printable.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(printable);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(initialSize.y) || initialSize.y <= 0) throw new Error('模型尺寸无效');
  const height = THREE.MathUtils.clamp(Number(requestedHeight) || DEFAULT_PRINT_HEIGHT, 32, 256);
  printable.scale.setScalar(height / initialSize.y);
  printable.rotation.x = Math.PI / 2;
  printable.updateMatrixWorld(true);
  const printBounds = new THREE.Box3().setFromObject(printable);
  const center = printBounds.getCenter(new THREE.Vector3());
  printable.position.x -= center.x;
  printable.position.y -= center.y;
  printable.position.z -= printBounds.min.z;
  printable.updateMatrixWorld(true);
  return height;
}

function mergePixelPlates(printable) {
  const byParent = new Map();
  printable.traverse(node => {
    if (!node.isMesh || !node.userData.pixelPlate || !node.parent) return;
    const groups = byParent.get(node.parent) || new Map();
    const key = node.userData.printColor + ':' + (node.userData.outerLayer ? 'outer' : 'base');
    const meshes = groups.get(key) || [];
    meshes.push(node);
    groups.set(key, meshes);
    byParent.set(node.parent, groups);
  });
  byParent.forEach((groups, parent) => {
    groups.forEach(meshes => {
      const mergedGeometry = mergeGeometries(meshes.map(mesh => mesh.geometry), false);
      if (!mergedGeometry) return;
      const merged = new THREE.Mesh(mergedGeometry, meshes[0].material);
      merged.userData = { ...meshes[0].userData };
      meshes.forEach(mesh => {
        parent.remove(mesh);
        mesh.geometry.dispose();
      });
      parent.add(merged);
    });
  });
}

function pixelizedPlayerModel(source, visibility, requestedHeight, requestedRelief, options = {}) {
  const printable = source.clone(true);
  printable.position.set(0, 0, 0);
  printable.rotation.set(0, 0, 0);
  printable.scale.set(1, 1, 1);
  animateBones(printable, 'none', 0);
  printable.updateMatrixWorld(true);

  const materialCache = new Map();
  const materialFor = color => {
    if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 }));
    return materialCache.get(color);
  };
  const coreMaterial = materialFor('#505050');
  const sourceMeshes = [];
  printable.traverse(node => { if (node.isMesh) sourceMeshes.push(node); });
  let pixelCount = 0;
  const targetHeight = THREE.MathUtils.clamp(Number(requestedHeight) || DEFAULT_PRINT_HEIGHT, 32, 256);
  const relief = THREE.MathUtils.clamp(Number(requestedRelief) || 0.8, 0.4, 2);
  const reliefInModelUnits = relief * 4 / targetHeight;
  const pixelOverlap = options.previewMode ? 1.035 : 1;
  const baseInset = Math.min(reliefInModelUnits, 0.09);
  const outerGap = 0.04;

  sourceMeshes.forEach(mesh => {
    const part = partForMesh(mesh, printable);
    const partVisible = !part || visibility[part] !== false;
    const isOuter = Boolean(mesh.userData.outerLayer);
    if (!partVisible || (isOuter && visibility.outerLayer === false)) {
      mesh.parent?.remove(mesh);
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (options.previewMode && !isOuter) {
      mesh.material = materials.map(material => new THREE.MeshStandardMaterial({
        map: material?.map || null,
        transparent: true,
        alphaTest: 0.5,
        roughness: 0.78,
        metalness: 0
      }));
      return;
    }
    const inset = isOuter ? outerGap : baseInset;
    const outset = isOuter ? reliefInModelUnits : 0;
    materials.slice(0, 6).forEach((material, face) => {
      const image = material?.map?.image;
      const context = image?.getContext?.('2d');
      if (!context || !image.width || !image.height) return;
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      for (let row = 0; row < image.height; row++) {
        for (let column = 0; column < image.width; column++) {
          const offset = (row * image.width + column) * 4;
          if (pixels[offset + 3] < 16) continue;
          const color = '#' + [pixels[offset], pixels[offset + 1], pixels[offset + 2]]
            .map(channel => channel.toString(16).padStart(2, '0'))
            .join('');
          const geometry = pixelPlateGeometry(face, bounds, image.width, image.height, column, row, inset, outset, pixelOverlap);
          geometry.applyMatrix4(mesh.matrix);
          const plate = new THREE.Mesh(geometry, materialFor(color));
          plate.userData = {
            printColor: color.toUpperCase(),
            pixelPlate: true,
            part,
            outerLayer: isOuter
          };
          mesh.parent?.add(plate);
          pixelCount++;
        }
      }
    });

    if (isOuter) mesh.parent?.remove(mesh);
    else {
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      mesh.geometry = new THREE.BoxGeometry(
        Math.max(0.01, size.x - baseInset * 2),
        Math.max(0.01, size.y - baseInset * 2),
        Math.max(0.01, size.z - baseInset * 2)
      );
      mesh.geometry.translate(center.x, center.y, center.z);
      mesh.material = coreMaterial;
    }
  });

  if (!pixelCount && !options.previewMode) throw new Error('皮肤中没有可导出的颜色像素');
  mergePixelPlates(printable);
  printable.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = !options.previewMode || !node.userData.pixelPlate;
    node.receiveShadow = true;
  });
  return { printable, relief, pixelCount, targetHeight };
}

function multicolorPlayerModel(source, visibility, requestedHeight, requestedRelief) {
  const result = pixelizedPlayerModel(source, visibility, requestedHeight, requestedRelief);
  const { printable, relief, pixelCount, targetHeight } = result;
  const height = normalizePrintableGroup(printable, targetHeight);
  return { printable, height, relief, pixelCount };
}

function meshColor(mesh) {
  if (mesh.userData.printColor) return mesh.userData.printColor;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material = materials.find(candidate => candidate?.color);
  return '#' + (material?.color?.getHexString(THREE.SRGBColorSpace) || '505050').toUpperCase();
}

function printableParts(printable) {
  const byColor = new Map();
  printable.traverse(node => {
    if (!node.isMesh) return;
    const color = meshColor(node);
    const meshes = byColor.get(color) || [];
    meshes.push(node);
    byColor.set(color, meshes);
  });
  return Array.from(byColor, entry => ({ color: entry[0], meshes: entry[1] }));
}

function partMeshXml(part) {
  const vertices = [];
  const triangles = [];
  let vertexOffset = 0;
  part.meshes.forEach(source => {
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    const position = geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      vertices.push('<vertex x="' + coordinate(position.getX(index)) + '" y="' + coordinate(position.getY(index)) + '" z="' + coordinate(position.getZ(index)) + '"/>');
    }
    const indices = geometry.index;
    if (indices) {
      for (let index = 0; index < indices.count; index += 3) {
        triangles.push('<triangle v1="' + (vertexOffset + indices.getX(index)) + '" v2="' + (vertexOffset + indices.getX(index + 1)) + '" v3="' + (vertexOffset + indices.getX(index + 2)) + '"/>');
      }
    } else {
      for (let index = 0; index < position.count; index += 3) {
        triangles.push('<triangle v1="' + (vertexOffset + index) + '" v2="' + (vertexOffset + index + 1) + '" v3="' + (vertexOffset + index + 2) + '"/>');
      }
    }
    vertexOffset += position.count;
    geometry.dispose();
  });
  return '<mesh><vertices>' + vertices.join('') + '</vertices><triangles>' + triangles.join('') + '</triangles></mesh>';
}

function create3mf(parts, playerName) {
  const materialXml = parts.map((part, index) =>
    '<base name="Color ' + (index + 1) + ' ' + xmlEscape(part.color) + '" displaycolor="' + part.color + 'FF"/>'
  ).join('');
  const objectXml = parts.map((part, index) =>
    '<object id="' + (index + 2) + '" type="model" name="' + xmlEscape(part.color) + '" pid="1" pindex="' + index + '">' + partMeshXml(part) + '</object>'
  ).join('');
  const assemblyId = parts.length + 2;
  const components = parts.map((part, index) => '<component objectid="' + (index + 2) + '"/>').join('');
  const modelXml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    '<metadata name="Title">Tongcraft ' + xmlEscape(playerName) + '</metadata>' +
    '<metadata name="Application">Tongcraft CDN</metadata>' +
    '<metadata name="Description">Multicolor Minecraft player model generated from skin pixels</metadata>' +
    '<resources><basematerials id="1">' + materialXml + '</basematerials>' + objectXml +
    '<object id="' + assemblyId + '" type="model" name="' + xmlEscape(playerName) + ' multicolor assembly"><components>' + components + '</components></object>' +
    '</resources><build><item objectid="' + assemblyId + '"/></build></model>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const relationships = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(relationships),
    '3D/3dmodel.model': strToU8(modelXml)
  }, { level: 6 });
}

function applyMascotLook(group, look) {
  const head = group.getObjectByName('head');
  const body = group.getObjectByName('body');
  if (!head || !body) return;
  head.rotation.y += look.x * 0.28;
  head.rotation.x += look.y * 0.16;
  body.rotation.y += look.x * 0.035;
}

function buildPlayer(group, img, model, uuid, options = {}) {
  while (group.children.length) group.remove(group.children[0]);
  const S = 1 / 8;
  const skin = makeSkinCanvas(img);
  const slim = model === 'slim' || (!model && isSlimSkin(img));
  const armWidth = slim ? 3 : 4;
  const armX = S * (8 / 2 + armWidth / 2);
  const rightArmBase = slim
    ? { front:[44,20], back:[51,20], left:[40,20], right:[48,20], top:[44,16], bottom:[47,16] }
    : { front:[44,20], back:[52,20], left:[40,20], right:[48,20], top:[44,16], bottom:[48,16] };
  const rightArmOverlay = slim
    ? { front:[44,36], back:[51,36], left:[40,36], right:[48,36], top:[44,32], bottom:[47,32] }
    : { front:[44,36], back:[52,36], left:[40,36], right:[48,36], top:[44,32], bottom:[48,32] };
  const leftArmBase = slim
    ? { front:[36,52], back:[43,52], left:[32,52], right:[40,52], top:[36,48], bottom:[39,48] }
    : { front:[36,52], back:[44,52], left:[32,52], right:[40,52], top:[36,48], bottom:[40,48] };
  const leftArmOverlay = slim
    ? { front:[52,52], back:[59,52], left:[48,52], right:[56,52], top:[52,48], bottom:[55,48] }
    : { front:[52,52], back:[60,52], left:[48,52], right:[56,52], top:[52,48], bottom:[56,48] };

  if (!options.silent) {
    window.__viewerState = { uuid, skinModel: slim ? 'slim' : 'classic', sourceModel: model || 'fallback', armWidth };
  }

  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  markPart(headGroup, 'head');
  headGroup.position.y = S * (12 / 2 + 8 / 2);
  rememberBase(headGroup);
  group.add(headGroup);
  headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(S * 8, S * 8, S * 8), partMats(skin, [8,8], [24,8], [0,8], [16,8], [8,0], [16,0], 8, 8, 8)));
  markOuter(addOverlay(skin, headGroup, [40,8], [56,8], [32,8], [48,8], [40,0], [48,0], 8, 8, 8), 'head');

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'body';
  markPart(bodyGroup, 'body');
  rememberBase(bodyGroup);
  group.add(bodyGroup);
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(S * 8, S * 12, S * 4), partMats(skin, [20,20], [32,20], [16,20], [28,20], [20,16], [28,16], 8, 12, 4)));
  markOuter(addOverlay(skin, bodyGroup, [20,36], [32,36], [16,36], [28,36], [20,32], [28,32], 8, 12, 4), 'body');

  const rArmGroup = new THREE.Group();
  rArmGroup.name = 'rightArm';
  markPart(rArmGroup, 'rightArm');
  rArmGroup.position.set(-armX, S * 6, 0);
  rememberBase(rArmGroup);
  group.add(rArmGroup);
  const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(S * armWidth, S * 12, S * 4), partMats(skin, rightArmBase.front, rightArmBase.back, rightArmBase.left, rightArmBase.right, rightArmBase.top, rightArmBase.bottom, armWidth, 12, 4));
  rArmMesh.position.y = -S * 6;
  rArmGroup.add(rArmMesh);
  const rArmOuter = markOuter(addOverlay(skin, rArmGroup, rightArmOverlay.front, rightArmOverlay.back, rightArmOverlay.left, rightArmOverlay.right, rightArmOverlay.top, rightArmOverlay.bottom, armWidth, 12, 4), 'rightArm');
  rArmOuter.position.y = -S * 6;

  const lArmGroup = new THREE.Group();
  lArmGroup.name = 'leftArm';
  markPart(lArmGroup, 'leftArm');
  lArmGroup.position.set(armX, S * 6, 0);
  rememberBase(lArmGroup);
  group.add(lArmGroup);
  const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(S * armWidth, S * 12, S * 4), partMats(skin, leftArmBase.front, leftArmBase.back, leftArmBase.left, leftArmBase.right, leftArmBase.top, leftArmBase.bottom, armWidth, 12, 4));
  lArmMesh.position.y = -S * 6;
  lArmGroup.add(lArmMesh);
  const lArmOuter = markOuter(addOverlay(skin, lArmGroup, leftArmOverlay.front, leftArmOverlay.back, leftArmOverlay.left, leftArmOverlay.right, leftArmOverlay.top, leftArmOverlay.bottom, armWidth, 12, 4), 'leftArm');
  lArmOuter.position.y = -S * 6;

  const rLegGroup = new THREE.Group();
  rLegGroup.name = 'rightLeg';
  markPart(rLegGroup, 'rightLeg');
  rLegGroup.position.set(-S * 2, -S * 6, 0);
  rememberBase(rLegGroup);
  group.add(rLegGroup);
  const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(S * 4, S * 12, S * 4), partMats(skin, [4,20], [12,20], [0,20], [8,20], [4,16], [8,16], 4, 12, 4));
  rLegMesh.position.y = -S * 6;
  rLegGroup.add(rLegMesh);
  const rLegOuter = markOuter(addOverlay(skin, rLegGroup, [4,36], [12,36], [0,36], [8,36], [4,32], [8,32], 4, 12, 4), 'rightLeg');
  rLegOuter.position.y = -S * 6;

  const lLegGroup = new THREE.Group();
  lLegGroup.name = 'leftLeg';
  markPart(lLegGroup, 'leftLeg');
  lLegGroup.position.set(S * 2, -S * 6, 0);
  rememberBase(lLegGroup);
  group.add(lLegGroup);
  const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(S * 4, S * 12, S * 4), partMats(skin, [20,52], [28,52], [16,52], [24,52], [20,48], [24,48], 4, 12, 4));
  lLegMesh.position.y = -S * 6;
  lLegGroup.add(lLegMesh);
  const lLegOuter = markOuter(addOverlay(skin, lLegGroup, [4,52], [12,52], [0,52], [8,52], [4,48], [8,48], 4, 12, 4), 'leftLeg');
  lLegOuter.position.y = -S * 6;
}

function ViewerModal() {
  const [open, setOpen] = useState(false);
  const [uuid, setUuid] = useState(players[0]?.uuid || '');
  const [loading, setLoading] = useState(false);
  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);
  const [autoRotate, setAutoRotate] = useState(false);
  const [animation, setAnimation] = useState('idle');
  const [printHeight, setPrintHeight] = useState(String(DEFAULT_PRINT_HEIGHT));
  const [printRelief, setPrintRelief] = useState('0.8');
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const visibilityRef = useRef(visibility);
  const autoRotateRef = useRef(autoRotate);
  const animationRef = useRef(animation);
  const player = useMemo(() => players.find(p => p.uuid === uuid) || players[0], [uuid]);

  useEffect(() => {
    visibilityRef.current = visibility;
  }, [visibility]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
    window.__autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    animationRef.current = animation;
    window.__viewerAnimation = animation;
  }, [animation]);

  useEffect(() => {
    const onOpen = event => {
      setUuid(event.detail.uuid);
      setOpen(true);
    };
    window.addEventListener('open-3d-viewer', onOpen);
    return () => window.removeEventListener('open-3d-viewer', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171717);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    const playerGroup = new THREE.Group();
    const sourceGroup = new THREE.Group();
    scene.add(playerGroup);
    scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x302a25, 1.15));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.1);
    dirLight.position.set(3.5, 5.5, 4.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -4;
    dirLight.shadow.camera.right = 4;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    scene.add(dirLight);
    const platform = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x292929, roughness: 1, metalness: 0 })
    );
    platform.rotation.x = -Math.PI / 2;
    platform.receiveShadow = true;
    scene.add(platform);

    const resize = () => {
      const box = canvas.parentElement.getBoundingClientRect();
      renderer.setSize(box.width, box.height, false);
      camera.aspect = box.width / box.height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      animateBones(playerGroup, animationRef.current, clock.getElapsedTime());
      if (autoRotateRef.current) {
        playerGroup.rotation.y += 0.01;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    viewerRef.current = { playerGroup, sourceGroup, platform, resize };

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      controls.dispose();
      disposeModel(playerGroup);
      disposeModel(sourceGroup);
      platform.geometry.dispose();
      platform.material.dispose();
      renderer.dispose();
      viewerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !player || !viewerRef.current) return;
    setLoading(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      disposeModel(viewer.sourceGroup);
      buildPlayer(viewer.sourceGroup, img, player.skinModel, player.uuid);
      const preview = pixelizedPlayerModel(viewer.sourceGroup, DEFAULT_VISIBILITY, printHeight, printRelief, { previewMode: true }).printable;
      disposeModel(viewer.playerGroup);
      while (viewer.playerGroup.children.length) viewer.playerGroup.remove(viewer.playerGroup.children[0]);
      viewer.playerGroup.add(preview);
      applyPartVisibility(viewer.playerGroup, visibilityRef.current);
      preview.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(preview);
      viewer.platform.position.y = bounds.min.y - 0.025;
      viewerRef.current.resize();
      setLoading(false);
    };
    img.onerror = () => {
      if (player.skinUrl && img.src !== player.skinUrl) img.src = player.skinUrl;
      else setLoading(false);
    };
    img.src = 'skins/' + player.uuid + '.png?' + Date.now();
  }, [open, player, printHeight, printRelief]);

  useEffect(() => {
    if (!viewerRef.current) return;
    applyPartVisibility(viewerRef.current.playerGroup, visibility);
  }, [visibility]);

  const setAllParts = checked => {
    setVisibility(Object.fromEntries(PARTS.map(([key]) => [key, checked])));
  };

  const togglePart = key => {
    setVisibility(current => ({ ...current, [key]: !current[key] }));
  };

  const exportStl = () => {
    if (loading || !viewerRef.current?.playerGroup) return;
    try {
      const { printable, height, relief, pixelCount } = multicolorPlayerModel(viewerRef.current.sourceGroup, visibility, printHeight, printRelief);
      const data = new STLExporter().parse(printable, { binary: true });
      const filename = 'tongcraft-' + safeFilename(player.name) + '-' + height + 'mm.stl';
      downloadBlob(new Blob([data], { type: 'model/stl' }), filename);
      window.__lastModelExport = { filename, height, relief, pixelCount, byteLength: data.byteLength };
      toast('STL 模型已导出');
      mascotSay(player.name + ' 的打印模型准备好了！');
    } catch (error) {
      console.error('STL export failed', error);
      toast(error.message || 'STL 导出失败');
    }
  };

  const export3mf = () => {
    if (loading || !viewerRef.current?.playerGroup) return;
    try {
      const { printable, height, relief, pixelCount } = multicolorPlayerModel(viewerRef.current.sourceGroup, visibility, printHeight, printRelief);
      const parts = printableParts(printable);
      const data = create3mf(parts, player.name);
      const filename = 'tongcraft-' + safeFilename(player.name) + '-' + height + 'mm-multicolor.3mf';
      downloadBlob(new Blob([data], { type: 'model/3mf' }), filename);
      window.__last3mfExport = { filename, height, relief, byteLength: data.byteLength, colorCount: parts.length, pixelCount };
      toast('多色 3MF 模型已导出');
      mascotSay(player.name + ' 的彩色打印模型准备好了！');
    } catch (error) {
      console.error('3MF export failed', error);
      toast(error.message || '3MF 导出失败');
    }
  };

  if (!open || !player) return null;
  return h('div', { className: 'viewer-backdrop', onMouseDown: () => setOpen(false) },
    h('div', { className: 'viewer-modal', onMouseDown: event => event.stopPropagation() },
      h('aside', { className: 'viewer-panel' },
        h('div', { className: 'viewer-top' },
          h('div', { className: 'viewer-title' }, '3D Player Viewer'),
          h('button', { className: 'viewer-close', type: 'button', onClick: () => setOpen(false), 'aria-label': 'Close viewer' }, 'x')
        ),
        h('select', { value: player.uuid, onChange: event => setUuid(event.target.value) },
          players.map(p => h('option', { key: p.uuid, value: p.uuid }, p.name))
        ),
        h('div', { className: 'viewer-meta' },
          h('strong', null, player.name),
          h('div', null, 'UUID: ' + player.uuid),
          h('div', null, 'Model: ' + (player.skinModel || 'unknown'))
        ),
        h('label', { className: 'viewer-part viewer-part-wide' },
          h('input', { type: 'checkbox', checked: autoRotate, onChange: () => setAutoRotate(value => !value) }),
          h('span', null, 'Auto Rotate')
        ),
        h('label', { className: 'viewer-control-label' },
          h('span', null, 'Animation'),
          h('select', { value: animation, onChange: event => setAnimation(event.target.value) },
            ANIMATIONS.map(([value, label]) => h('option', { key: value, value }, label))
          )
        ),
          h('div', { className: 'viewer-parts' },
          PARTS.map(([key, label]) => h('label', { key, className: key === 'outerLayer' ? 'viewer-part viewer-part-wide' : 'viewer-part' },
            h('input', { type: 'checkbox', checked: visibility[key], onChange: () => togglePart(key) }),
            h('span', null, label)
          )),
          h('div', { className: 'viewer-part-actions viewer-part-wide' },
            h('button', { type: 'button', onClick: () => setAllParts(true) }, 'All'),
            h('button', { type: 'button', onClick: () => setAllParts(false) }, 'None')
          )
        ),
        h('div', { className: 'viewer-export' },
          h('div', { className: 'viewer-export-row' },
            h('label', { className: 'viewer-control-label' },
              h('span', null, 'Print Height'),
              h('input', {
                type: 'number', min: 32, max: 256, step: 1,
                value: printHeight,
                onChange: event => setPrintHeight(event.target.value),
                'aria-label': 'Print Height'
              })
            ),
            h('span', { className: 'viewer-export-unit' }, 'mm')
          ),
          h('div', { className: 'viewer-export-row' },
            h('label', { className: 'viewer-control-label' },
              h('span', null, 'Pixel Relief'),
              h('input', {
                type: 'number', min: 0.4, max: 2, step: 0.1,
                value: printRelief,
                onChange: event => setPrintRelief(event.target.value),
                'aria-label': 'Pixel Relief'
              })
            ),
            h('span', { className: 'viewer-export-unit' }, 'mm')
          ),
          h('button', { type: 'button', onClick: export3mf, disabled: loading, 'aria-label': 'Export multicolor 3MF' }, '导出多色 3MF'),
          h('button', { className: 'viewer-export-secondary', type: 'button', onClick: exportStl, disabled: loading, 'aria-label': 'Export STL' }, '导出单色 STL'),
          h('div', { className: 'viewer-export-note' }, '中立站姿 · 实体像素表层 · 3MF 保留皮肤颜色，STL 兼容所有切片软件')
        )
      ),
      h('div', { className: 'viewer-stage' },
        h('canvas', { id: 'viewer-canvas', ref: canvasRef }),
        loading ? h('div', { className: 'viewer-loading' }, 'Loading skin...') : null,
        h('div', { className: 'viewer-hint' }, 'Drag to rotate - Scroll to zoom')
      )
    )
  );
}

const MASCOT_STORE = 'tongcraft-mascot-v2';
const MASCOT_ACTIONS = [
  ['idle', '待机'],
  ['wave', '招手'],
  ['walk', '走走'],
  ['run', '跑跑'],
  ['crouch', '潜行']
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function defaultMascotState() {
  return {
    left: Math.max(16, window.innerWidth - 292),
    top: Math.max(16, window.innerHeight - 444),
    width: window.innerWidth < 780 ? 220 : 284,
    height: window.innerWidth < 780 ? 330 : 426,
    uuid: players[0]?.uuid || '',
    animation: 'idle',
    yaw: -0.22,
    hidden: false
  };
}

function readMascotState() {
  const fallback = defaultMascotState();
  try {
    const saved = JSON.parse(localStorage.getItem(MASCOT_STORE) || '{}');
    return {
      ...fallback,
      ...saved,
      left: clamp(Number(saved.left ?? fallback.left), 8, window.innerWidth - 72),
      top: clamp(Number(saved.top ?? fallback.top), 8, window.innerHeight - 72),
      width: clamp(Number(saved.width ?? fallback.width), 220, 420),
      height: clamp(Number(saved.height ?? fallback.height), 330, 630),
      uuid: players.some(player => player.uuid === saved.uuid) ? saved.uuid : fallback.uuid,
      animation: ANIMATIONS.some(([value]) => value === saved.animation) ? saved.animation : fallback.animation,
      yaw: Number.isFinite(Number(saved.yaw)) ? Number(saved.yaw) : fallback.yaw,
      hidden: Boolean(saved.hidden)
    };
  } catch {
    return fallback;
  }
}

function MascotWidget() {
  const [state, setState] = useState(readMascotState);
  const [loading, setLoading] = useState(false);
  const [bubble, setBubble] = useState(null);
  const canvasRef = useRef(null);
  const mascotRef = useRef(null);
  const sceneRef = useRef(null);
  const actionRef = useRef(state.animation);
  const yawRef = useRef(state.yaw);
  const lookRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const bubbleTimerRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const idleReturnRef = useRef(0);
  const player = useMemo(() => players.find(p => p.uuid === state.uuid) || players[0], [state.uuid]);

  const rememberActivity = () => {
    lastActivityRef.current = Date.now();
  };

  const say = (message, duration = 2200) => {
    if (!message) return;
    window.clearTimeout(bubbleTimerRef.current);
    setBubble({ message, on: true });
    bubbleTimerRef.current = window.setTimeout(() => {
      setBubble(current => current ? { ...current, on: false } : current);
    }, duration);
  };

  useEffect(() => () => {
    window.clearTimeout(bubbleTimerRef.current);
    window.clearTimeout(idleReturnRef.current);
  }, []);

  useEffect(() => {
    actionRef.current = state.animation;
  }, [state.animation]);

  useEffect(() => {
    yawRef.current = state.yaw;
  }, [state.yaw]);

  useEffect(() => {
    localStorage.setItem(MASCOT_STORE, JSON.stringify(state));
    window.__mascotState = state;
  }, [state]);

  useEffect(() => {
    const onToggle = () => setState(current => ({ ...current, hidden: !current.hidden }));
    window.addEventListener('toggle-mascot', onToggle);
    return () => window.removeEventListener('toggle-mascot', onToggle);
  }, []);

  useEffect(() => {
    const onSummon = event => {
      const uuid = event.detail?.uuid;
      if (!uuid || !players.some(p => p.uuid === uuid)) return;
      rememberActivity();
      setState(current => ({ ...current, uuid, animation: 'wave', hidden: false }));
      say(event.detail?.message || '你好呀！');
    };
    const onSay = event => say(event.detail?.message);
    const onTheme = event => {
      rememberActivity();
      setState(current => ({ ...current, animation: 'wave', hidden: false }));
      say(event.detail?.dark ? '夜晚模式开启！' : '白天模式开启！');
    };
    window.addEventListener('summon-mascot', onSummon);
    window.addEventListener('mascot-say', onSay);
    window.addEventListener('theme-changed', onTheme);
    return () => {
      window.removeEventListener('summon-mascot', onSummon);
      window.removeEventListener('mascot-say', onSay);
      window.removeEventListener('theme-changed', onTheme);
    };
  }, []);

  useEffect(() => {
    const onPointerMove = event => {
      if (!mascotRef.current) return;
      const box = mascotRef.current.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height * 0.38;
      lookRef.current = {
        x: clamp((event.clientX - cx) / Math.max(220, window.innerWidth * 0.35), -1, 1),
        y: clamp((event.clientY - cy) / Math.max(180, window.innerHeight * 0.28), -1, 1)
      };
      window.__mascotLook = lookRef.current;
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  useEffect(() => {
    const onActivity = () => rememberActivity();
    ['pointerdown', 'keydown', 'scroll'].forEach(type => window.addEventListener(type, onActivity, { passive: true }));
    window.addEventListener('wheel', onActivity, { passive: true });
    return () => {
      ['pointerdown', 'keydown', 'scroll'].forEach(type => window.removeEventListener(type, onActivity));
      window.removeEventListener('wheel', onActivity);
    };
  }, []);

  useEffect(() => {
    if (state.hidden) return;
    const options = [
      ['idle', '我在到处看看。'],
      ['wave', '你好呀！'],
      ['walk', '活动一下腿。'],
      ['crouch', '正在潜行...']
    ];
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current < 12000 || dragRef.current) return;
      const [animation, message] = options[Math.floor(Math.random() * options.length)];
      setState(current => ({ ...current, animation }));
      say(message, 1800);
      window.clearTimeout(idleReturnRef.current);
      if (animation !== 'idle') {
        idleReturnRef.current = window.setTimeout(() => {
          setState(current => ({ ...current, animation: 'idle' }));
        }, 3200);
      }
      lastActivityRef.current = Date.now() - 5000;
    }, 7000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(idleReturnRef.current);
    };
  }, [state.hidden]);

  useEffect(() => {
    const onResize = () => {
      setState(current => ({
        ...current,
        left: clamp(current.left, 8, window.innerWidth - 72),
        top: clamp(current.top, 8, window.innerHeight - 72)
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (state.hidden || !mascotRef.current) return;
    const el = mascotRef.current;
    const onWheel = event => {
      event.preventDefault();
      event.stopPropagation();
      resizeBy(event.deltaY > 0 ? -12 : 12);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [state.hidden, state.width, state.height]);

  useEffect(() => {
    if (state.hidden || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 6.9);
    camera.lookAt(0, 0, 0);
    const playerGroup = new THREE.Group();
    playerGroup.position.y = 0;
    playerGroup.rotation.y = yawRef.current;
    scene.add(playerGroup);
    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    const resize = () => {
      const box = canvas.parentElement.getBoundingClientRect();
      renderer.setSize(box.width, box.height, false);
      camera.aspect = box.width / box.height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      animateBones(playerGroup, actionRef.current, elapsed);
      playerGroup.rotation.y = yawRef.current;
      if (actionRef.current === 'idle') {
        playerGroup.rotation.y += Math.sin(elapsed * 0.7) * 0.12;
      }
      applyMascotLook(playerGroup, lookRef.current);
      renderer.render(scene, camera);
    };
    animate();
    sceneRef.current = { playerGroup, resize };

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [state.hidden]);

  useEffect(() => {
    if (state.hidden || !player || !sceneRef.current) return;
    setLoading(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      buildPlayer(sceneRef.current.playerGroup, img, player.skinModel, player.uuid, { silent: true });
      applyPartVisibility(sceneRef.current.playerGroup, DEFAULT_VISIBILITY);
      sceneRef.current.resize();
      setLoading(false);
    };
    img.onerror = () => {
      if (player.skinUrl && img.src !== player.skinUrl) img.src = player.skinUrl;
      else setLoading(false);
    };
    img.src = 'skins/' + player.uuid + '.png?' + Date.now();
  }, [state.hidden, player]);

  const patchState = patch => setState(current => ({ ...current, ...patch }));

  const nextAction = () => {
    const index = MASCOT_ACTIONS.findIndex(([value]) => value === actionRef.current);
    const [next, label] = MASCOT_ACTIONS[(index + 1) % MASCOT_ACTIONS.length];
    rememberActivity();
    patchState({ animation: next });
    say(label + '！');
  };

  const nextPlayer = () => {
    if (!players.length) return;
    const index = players.findIndex(p => p.uuid === player.uuid);
    const next = players[(index + 1) % players.length];
    rememberActivity();
    patchState({ uuid: next.uuid, animation: 'wave' });
    say(next.name + ' 加入了大厅');
  };

  const startDrag = event => {
    if (event.button !== 0) return;
    rememberActivity();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: state.left,
      top: state.top,
      yaw: state.yaw,
      mode: event.shiftKey ? 'rotate' : 'move',
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = event => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
    if (dragState.mode === 'rotate') {
      patchState({ yaw: dragState.yaw + dx * 0.012 });
    } else {
      patchState({
        left: clamp(dragState.left + dx, 8, window.innerWidth - 72),
        top: clamp(dragState.top + dy, 8, window.innerHeight - 72)
      });
    }
  };

  const stopDrag = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current = null;
    if (!wasDrag) nextAction();
  };

  const resizeBy = delta => {
    rememberActivity();
    patchState({
      width: clamp(state.width + delta, 220, 420),
      height: clamp(state.height + delta * 1.5, 330, 630)
    });
  };

  if (!player || state.hidden) return null;

  return h('section', {
    ref: mascotRef,
    className: 'mascot',
    style: { left: state.left, top: state.top, width: state.width, height: state.height },
    'aria-label': 'Experimental mascot',
    title: 'Drag to move, Shift+drag left/right to rotate, click to change action, wheel to resize, double click to change player',
    onPointerDown: startDrag,
    onPointerMove: drag,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onWheel: event => event.preventDefault(),
    onDoubleClick: nextPlayer,
    onContextMenu: event => {
      event.preventDefault();
      nextPlayer();
    }
  },
    h('canvas', { ref: canvasRef }),
    loading ? h('div', { className: 'mascot-loading' }, 'Loading...') : null,
    bubble ? h('div', { className: 'mascot-bubble' + (bubble.on ? ' on' : '') }, bubble.message) : null
  );
}

createRoot(document.getElementById('viewer-root')).render(h(ViewerModal));
createRoot(document.getElementById('mascot-root')).render(h(MascotWidget));
window.__reactViewerReady = true;
</script></body></html>`;
}

function viewerHTML(players, selected) {
  const options = players.map(p => `<option value="${p.uuid}" ${selected && selected.uuid === p.uuid ? 'selected' : ''}>${p.name}</option>`).join('');
  const defaultPlayer = selected || players[0] || null;
  const defaultUUID = defaultPlayer ? defaultPlayer.uuid : '';
  const defaultName = defaultPlayer ? defaultPlayer.name : '';
  const defaultModel = defaultPlayer?.skinModel || 'unknown';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>3D Player Viewer - Tongcraft CDN</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#1a1a1a;color:#fff;overflow:hidden}
#panel{position:fixed;top:16px;left:16px;z-index:100;background:#222;border-radius:10px;padding:16px;width:220px;box-shadow:0 4px 20px rgba(0,0,0,.5)}
#panel h2{font-size:14px;font-weight:600;margin-bottom:12px;color:#fff}
#panel select{width:100%;padding:8px 10px;border:1px solid #444;border-radius:6px;background:#333;color:#fff;font-size:13px;outline:none;margin-bottom:12px}
#panel select:focus{border-color:#666}
#info{font-size:12px;color:#aaa;line-height:1.5}
#info span{color:#fff}
#canvas{position:fixed;top:0;left:0;width:100vw;height:100vh}
#hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-size:12px;color:#666}
</style>
</head>
<body>
<div id="panel">
<h2>3D Player Viewer</h2>
<select id="sel" onchange="loadPlayer()">${options}</select>
<div id="info">
<div>Name: <span id="pname">${defaultName}</span></div>
<div>UUID: <span id="puuid">${defaultUUID}</span></div>
<div>Model: <span id="pmodel">${defaultModel}</span></div>
</div>
</div>
<canvas id="canvas"></canvas>
<div id="hint">Drag to rotate &middot; Scroll to zoom</div>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script>const players = ${JSON.stringify(players.map(p => ({ uuid: p.uuid, name: p.name, skinModel: p.skinModel || null, skinUrl: p.skinUrl || null })))};</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('canvas');
const sel = document.getElementById('sel');
const pname = document.getElementById('pname');
const puuid = document.getElementById('puuid');
const pmodel = document.getElementById('pmodel');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 10;

const playerGroup = new THREE.Group();
scene.add(playerGroup);

const textureLoader = new THREE.TextureLoader();
let bodyMesh = null;
let headMesh = null;

function getRegion(img, u, v, uw, uh) {
  const c = document.createElement('canvas');
  c.width = uw; c.height = uh;
  c.getContext('2d').drawImage(img, u, v, uw, uh, 0, 0, uw, uh);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makeSkinCanvas(img) {
  if (img.naturalWidth === 64 && img.naturalHeight === 64) return img;

  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(img, 0, 0);

  const copyFace = (sx, sy, sw, sh, dx, dy) => {
    ctx.save();
    ctx.translate(dx + sw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  };

  // Legacy 64x32 skins only define the right arm/leg. Populate the 1.8+ left limb slots.
  copyFace(4, 16, 4, 4, 20, 48);   // left leg top
  copyFace(8, 16, 4, 4, 24, 48);   // left leg bottom
  copyFace(8, 20, 4, 12, 16, 52);  // left leg right (inner)
  copyFace(4, 20, 4, 12, 20, 52);  // left leg front
  copyFace(0, 20, 4, 12, 24, 52);  // left leg left (outer)
  copyFace(12, 20, 4, 12, 28, 52); // left leg back

  copyFace(44, 16, 4, 4, 36, 48);  // left arm top
  copyFace(48, 16, 4, 4, 40, 48);  // left arm bottom
  copyFace(48, 20, 4, 12, 32, 52); // left arm right (inner)
  copyFace(44, 20, 4, 12, 36, 52); // left arm front
  copyFace(40, 20, 4, 12, 40, 52); // left arm left (outer)
  copyFace(52, 20, 4, 12, 44, 52); // left arm back

  return c;
}

function isSlimSkin(img) {
  if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return false;

  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  const alphaAt = (x, y) => data[(y * 64 + x) * 4 + 3];
  const columnTransparent = (x, y1, y2) => {
    for (let y = y1; y <= y2; y++) {
      if (alphaAt(x, y) !== 0) return false;
    }
    return true;
  };

  return (
    columnTransparent(47, 16, 31) &&
    columnTransparent(54, 20, 31) &&
    columnTransparent(47, 32, 47) &&
    columnTransparent(54, 36, 47)
  );
}

// UV coords: [x, y] on 64x64 skin. Three.js face order: +x, -x, +y, -y, +z, -z (right,left,top,bottom,front,back)
// Ref project order: front, back, left, right, top, bottom
function partMats(img, front, back, left, right, top, bottom, fw, fh, sw, sh, dw, dh) {
  const t = (x, y, w, h) => new THREE.MeshBasicMaterial({ map: getRegion(img, x, y, w, h), transparent: true, alphaTest: 0.5 });
  return [t(...right, dw, fh), t(...left, dw, fh), t(...top, fw, dw), t(...bottom, fw, dw), t(...front, fw, fh), t(...back, fw, fh)];
}

function addOverlay(img, parent, front, back, left, right, top, bottom, fw, fh, dw) {
  const S = 1/8, E = S * 0.64;
  const mats = partMats(img, front, back, left, right, top, bottom, fw, fh, dw, dw, dw, dw);
  mats.forEach(m => { m.depthWrite = false; });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(S*fw+E, S*fh+E, S*dw+E), mats);
  mesh.renderOrder = 1;
  parent.add(mesh);
}

function buildPlayer(img, model) {
  while (playerGroup.children.length) playerGroup.remove(playerGroup.children[0]);
  const S = 1/8;
  const skin = makeSkinCanvas(img);
  const slim = model === 'slim' || (!model && isSlimSkin(img));
  const armWidth = slim ? 3 : 4;
  const armX = S * (8 / 2 + armWidth / 2);
  const rightArmBase = slim
    ? { front:[44,20], back:[51,20], left:[40,20], right:[48,20], top:[44,16], bottom:[47,16] }
    : { front:[44,20], back:[52,20], left:[40,20], right:[48,20], top:[44,16], bottom:[48,16] };
  const rightArmOverlay = slim
    ? { front:[44,36], back:[51,36], left:[40,36], right:[48,36], top:[44,32], bottom:[47,32] }
    : { front:[44,36], back:[52,36], left:[40,36], right:[48,36], top:[44,32], bottom:[48,32] };
  const leftArmBase = slim
    ? { front:[36,52], back:[43,52], left:[32,52], right:[40,52], top:[36,48], bottom:[39,48] }
    : { front:[36,52], back:[44,52], left:[32,52], right:[40,52], top:[36,48], bottom:[40,48] };
  const leftArmOverlay = slim
    ? { front:[52,52], back:[59,52], left:[48,52], right:[56,52], top:[52,48], bottom:[55,48] }
    : { front:[52,52], back:[60,52], left:[48,52], right:[56,52], top:[52,48], bottom:[56,48] };
  window.__viewerState = {
    uuid: sel.value,
    skinModel: slim ? 'slim' : 'classic',
    sourceModel: model || 'fallback',
    armWidth
  };

  // Head (front,back,left,right,top,bottom, fw,fh,dw)
  const headGroup = new THREE.Group();
  headGroup.position.y = S*(12/2 + 8/2);
  playerGroup.add(headGroup);
  headMesh = new THREE.Mesh(new THREE.BoxGeometry(S*8,S*8,S*8),
    partMats(skin,[8,8],[24,8],[0,8],[16,8],[8,0],[16,0], 8,8,8,8,8,8));
  headGroup.add(headMesh);
  addOverlay(skin, headGroup,[40,8],[56,8],[32,8],[48,8],[40,0],[48,0], 8,8,8);

  // Body
  const bodyGroup = new THREE.Group();
  playerGroup.add(bodyGroup);
  bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(S*8,S*12,S*4),
    partMats(skin,[20,20],[32,20],[16,20],[28,20],[20,16],[28,16], 8,12,4,12,4,4));
  bodyGroup.add(bodyMesh);
  addOverlay(skin, bodyGroup,[20,36],[32,36],[16,36],[28,36],[20,32],[28,32], 8,12,4);

  // Right arm
  const rArmGroup = new THREE.Group();
  rArmGroup.position.set(-armX, 0, 0);
  playerGroup.add(rArmGroup);
  rArmGroup.add(new THREE.Mesh(new THREE.BoxGeometry(S*armWidth,S*12,S*4),
    partMats(skin, rightArmBase.front, rightArmBase.back, rightArmBase.left, rightArmBase.right, rightArmBase.top, rightArmBase.bottom, armWidth, 12, 4, 12, 4, 4)));
  addOverlay(skin, rArmGroup, rightArmOverlay.front, rightArmOverlay.back, rightArmOverlay.left, rightArmOverlay.right, rightArmOverlay.top, rightArmOverlay.bottom, armWidth, 12, 4);

  // Left arm
  const lArmGroup = new THREE.Group();
  lArmGroup.position.set(armX, 0, 0);
  playerGroup.add(lArmGroup);
  lArmGroup.add(new THREE.Mesh(new THREE.BoxGeometry(S*armWidth,S*12,S*4),
    partMats(skin, leftArmBase.front, leftArmBase.back, leftArmBase.left, leftArmBase.right, leftArmBase.top, leftArmBase.bottom, armWidth, 12, 4, 12, 4, 4)));
  addOverlay(skin, lArmGroup, leftArmOverlay.front, leftArmOverlay.back, leftArmOverlay.left, leftArmOverlay.right, leftArmOverlay.top, leftArmOverlay.bottom, armWidth, 12, 4);

  // Right leg
  const rLegGroup = new THREE.Group();
  rLegGroup.position.set(-S*2, -S*(12/2+12/2), 0);
  playerGroup.add(rLegGroup);
  rLegGroup.add(new THREE.Mesh(new THREE.BoxGeometry(S*4,S*12,S*4),
    partMats(skin,[4,20],[12,20],[0,20],[8,20],[4,16],[8,16], 4,12,4,12,4,4)));
  addOverlay(skin, rLegGroup,[4,36],[12,36],[0,36],[8,36],[4,32],[8,32], 4,12,4);

  // Left leg
  const lLegGroup = new THREE.Group();
  lLegGroup.position.set(S*2, -S*(12/2+12/2), 0);
  playerGroup.add(lLegGroup);
  lLegGroup.add(new THREE.Mesh(new THREE.BoxGeometry(S*4,S*12,S*4),
    partMats(skin,[20,52],[28,52],[16,52],[24,52],[20,48],[24,48], 4,12,4,12,4,4)));
  addOverlay(skin, lLegGroup,[4,52],[12,52],[0,52],[8,52],[4,48],[8,48], 4,12,4);
}

function loadPlayer() {
  const uuid = sel.value;
  const player = players.find(p => p.uuid === uuid);
  if (!player) return;
  pname.textContent = player.name;
  puuid.textContent = player.uuid;
  pmodel.textContent = player.skinModel || 'unknown';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => buildPlayer(img, player.skinModel);
  img.onerror = () => {
    if (player.skinUrl && img.src !== player.skinUrl) img.src = player.skinUrl;
  };
  img.src = 'skins/' + uuid + '.png?' + Date.now();
}

const light = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(light);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(2, 3, 3);
scene.add(dirLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (sel.options.length > 0) loadPlayer();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/avatars/')) {
    const uuid = path.basename(req.url.split('?')[0], '.png');
    const buf = avatarCache.get(uuid);
    if (buf) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      res.end(buf);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (req.url.startsWith('/skins/')) {
    const uuid = path.basename(req.url.split('?')[0], '.png');
    const buf = skinCache.get(uuid);
    if (buf) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      res.end(buf);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (req.url.startsWith('/3d/')) {
    const uuid = path.basename(req.url, '.json');
    const player = players.find(p => p.uuid === uuid);
    if (player) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' });
      res.end(JSON.stringify(player));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (req.url === '/3d' || req.url.startsWith('/3d?')) {
    const url = new URL(req.url, 'http://localhost');
    const selected = url.searchParams.get('player') || '';
    const selectedPlayer = selected ? players.find(p => p.uuid === selected || p.name === selected) : null;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(viewerHTML(players, selectedPlayer));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
});

async function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

async function exportStatic() {
  const outDir = path.join(__dirname, '..', 'dist');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  await copyDir(AVATARS_DIR, path.join(outDir, 'avatars'));
  await copyDir(SKINS_DIR, path.join(outDir, 'skins'));
  console.log(`Exported GitHub Pages site to ${outDir}`);
  console.log(`${players.length} players, ${avatarCache.size} avatars`);
}

if (process.env.STATIC_EXPORT) {
  await exportStatic();
} else {
  server.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
    console.log(`${players.length} players, ${avatarCache.size} avatars (cached in memory)`);
  });
}
