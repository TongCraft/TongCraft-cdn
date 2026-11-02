import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { createHash } from 'node:crypto';
import { buildClient } from '../scripts/build-client.js';
import { CACHE_CONTROL, staticHeaders } from './cache-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '3000');
const AVATARS_DIR = path.join(__dirname, '..', 'avatars');
const SKINS_DIR = path.join(__dirname, '..', 'skins');
const DATA_DIR = path.join(__dirname, '..', 'data');
const VISIT_COUNTER_NAMESPACE = process.env.VISIT_COUNTER_NAMESPACE || 'weiuou';
const VISIT_COUNTER_KEY = process.env.VISIT_COUNTER_KEY || 'tongcraft-cdn';
const VISIT_COUNTER_FALLBACK_BADGE = 'https://hits.sh/github.com/TongCraft/TongCraft-cdn.svg?label=views&color=3269aa';
const RELATED_SITES = [
  { label: '服务器官网', badge: '官网', href: 'https://www.tongcraft.cn/' },
  { label: '服务器地图', badge: '地图', href: 'https://map.weiuou.top/' },
];

const avatarCache = new Map();
const skinCache = new Map();
const playersData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'players.json'), 'utf-8'));
const players = playersData.players || [];

const clientBuild = await buildClient();
const versionedPaths = new Map();

if (fs.existsSync(AVATARS_DIR)) fs.readdirSync(AVATARS_DIR)
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

for (const [directory, cache] of [['avatars', avatarCache], ['skins', skinCache]]) {
  for (const [uuid, buffer] of cache) {
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const pathname = `/assets/${directory}/${uuid}-${hash}.png`;
    versionedPaths.set(`/${directory}/${uuid}.png`, pathname);
    clientBuild.files.set(pathname, buffer);
  }
}

const html = generateHTML(players, avatarCache.size, {
  visitCounterNamespace: VISIT_COUNTER_NAMESPACE,
  visitCounterKey: VISIT_COUNTER_KEY,
  visitCounterFallbackBadge: VISIT_COUNTER_FALLBACK_BADGE,
  relatedSites: RELATED_SITES,
});

function assetPath(pathname) {
  return process.env.STATIC_EXPORT ? pathname.replace(/^\//, '') : pathname;
}

function playerManifest(players) {
  return players.map(player => ({
    uuid: player.uuid,
    name: player.name,
    skinModel: player.skinModel || null,
    skinUrl: player.skinUrl?.replace(/^http:/, 'https:') || null,
    avatarPath: assetPath(versionedPaths.get(`/avatars/${player.uuid}.png`) || `/avatars/${player.uuid}.png`),
    skinPath: assetPath(versionedPaths.get(`/skins/${player.uuid}.png`) || `/skins/${player.uuid}.png`)
  }));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function generateHTML(players, count, options = {}) {
  const {
    visitCounterNamespace = 'weiuou',
    visitCounterKey = 'tongcraft-cdn',
    visitCounterFallbackBadge = '',
    relatedSites = [],
  } = options;
  const cards = players.map(p => {
    const has = avatarCache.has(p.uuid);
    const name = escapeHTML(p.name);
    const uuid = escapeHTML(p.uuid);
    const img = has ? `<img src="${assetPath(versionedPaths.get(`/avatars/${p.uuid}.png`))}" loading="lazy" width="64" height="64" alt="${name}">` : `<div class="na">${name[0] || '?'}</div>`;
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
  const relatedSitesMarkup = relatedSites.map(link => `<a class="site-badge" href="${escapeHTML(link.href)}" target="_blank" rel="noreferrer" aria-label="${escapeHTML(link.label)}"><span class="badge-label">TongCraft</span><span class="badge-value">${escapeHTML(link.badge)}</span></a>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tongcraft CDN</title><style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#f7f7f5;--fg:#111;--muted:#666;--line:#d9d9d6;--card:#fff;--soft:#f1f1ef;--accent:#111}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);padding:20px 34px 34px}
body.dark{--bg:#151515;--fg:#f5f5f5;--muted:#aaa;--line:#333;--card:#202020;--soft:#2a2a2a;--accent:#f5f5f5}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:28px}
header h1{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:25px;font-weight:800;letter-spacing:.2px}
header p{font-size:14px;margin-top:8px;color:var(--fg)}
.header-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
.site-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-top:10px;font-size:12px;color:var(--muted)}
.visit-badge,.site-badge{display:inline-flex;align-items:center;height:20px;border-radius:3px;overflow:hidden;color:#fff;font:11px/20px ui-sans-serif,system-ui,sans-serif;white-space:nowrap}
.badge-label,.badge-value{padding:0 7px}
.badge-label{background:#555}
.badge-value{background:#3269aa}
.site-badge{text-decoration:none}
.site-badge:hover{filter:brightness(1.15)}
.site-badge:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
.related-sites,.site-badges{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px}
.related-sites strong{color:var(--fg);font-weight:700}
.visit-counter-badge{display:block;height:20px}
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
  <div class="header-copy"><h1>Tongcraft Heads</h1><p>${players.length} 个玩家头颅 · ${count} 张头像缓存</p><div class="site-meta"><span class="visit-badge"><span class="badge-label">访问量</span><span class="badge-value" id="visitCount">--</span></span><span class="related-sites"><strong>相关站点</strong><span class="site-badges">${relatedSitesMarkup}</span></span></div></div>
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
<script>window.__PLAYERS__ = ${JSON.stringify(playerManifest(players)).replace(/</g, '\\u003c')};window.__VISIT_COUNTER__=${JSON.stringify({ namespace: visitCounterNamespace, key: visitCounterKey, fallbackBadge: visitCounterFallbackBadge })};</script>
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
function showVisitFallback(el){var cfg=window.__VISIT_COUNTER__||{};if(!cfg.fallbackBadge){el.textContent='--';return}var img=document.createElement('img');img.className='visit-counter-badge';img.alt='访问量';img.src=cfg.fallbackBadge;el.parentElement.replaceChildren(img)}
async function syncVisitCount(){var el=document.getElementById('visitCount');if(!el)return;var storageKey='tongcraft:visit:last-hit';var now=Date.now();var last=Number(localStorage.getItem(storageKey)||0);var action=last&&now-last<18e5?'get':'hit';var controller=new AbortController();var timer=setTimeout(function(){controller.abort()},2500);try{var response=await fetch(visitCounterUrl(action),{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('visit counter '+response.status);var payload=await response.json();if(action==='hit')localStorage.setItem(storageKey,String(now));if(typeof payload.value==='number')el.textContent=payload.value.toLocaleString('zh-CN');else showVisitFallback(el)}catch(error){showVisitFallback(el)}finally{clearTimeout(timer)}}
window.copyAvatar=copyAvatar;window.copyGive=copyGive;window.copyVisibleGive=copyVisibleGive;window.f=f;window.sortCards=sortCards;window.setTheme=setTheme;window.toggleTheme=toggleTheme;window.open3d=open3d;window.toggleMascot=toggleMascot;window.summonMascotFromCard=summonMascotFromCard;
setTheme(localStorage.getItem('theme')==='dark')
window.addEventListener('load',function(){setTimeout(syncVisitCount,1500)},{once:true})
</script>
<script type="module" src="${assetPath(clientBuild.entries['viewer'])}"></script></body></html>`;
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
<script>window.__PLAYERS__ = ${JSON.stringify(playerManifest(players)).replace(/</g, '\\u003c')};</script>
<script type="module" src="${assetPath(clientBuild.entries['legacy-viewer'])}"></script>
</body>
</html>`;
}

function send(req, res, buffer, type, policy, cors = false) {
  const etag = '"' + createHash('sha256').update(buffer).digest('hex') + '"';
  const headers = {
    'Content-Type': type,
    'Cache-Control': policy,
    'X-Content-Type-Options': 'nosniff',
    ETag: etag
  };
  if (cors) headers['Access-Control-Allow-Origin'] = '*';
  const validators = (req.headers['if-none-match'] || '').split(',').map(value => value.trim().replace(/^W\//, ''));
  if (validators.includes(etag) || validators.includes('*')) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(buffer) });
  res.end(req.method === 'HEAD' ? undefined : buffer);
}

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const asset = clientBuild.files.get(pathname);
  if (asset) {
    const type = pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8';
    send(req, res, asset, type, CACHE_CONTROL.immutable, true);
    return;
  }
  const image = pathname.match(/^\/(avatars|skins)\/([a-f0-9]{32})\.png$/i);
  if (image) {
    const buffer = (image[1] === 'avatars' ? avatarCache : skinCache).get(image[2]);
    if (buffer) {
      send(req, res, buffer, 'image/png', CACHE_CONTROL.image, true);
      return;
    }
  }
  if (pathname === '/players.json') {
    send(req, res, JSON.stringify(playerManifest(players)), 'application/json', CACHE_CONTROL.metadata, true);
    return;
  }
  const metadata = pathname.match(/^\/3d\/([a-f0-9]{32})\.json$/i);
  if (metadata) {
    const player = players.find(player => player.uuid === metadata[1]);
    if (player) {
      send(req, res, JSON.stringify(player), 'application/json', CACHE_CONTROL.metadata, true);
      return;
    }
  }
  if (pathname === '/3d' || pathname === '/3d.html') {
    const selected = url.searchParams.get('player');
    const player = players.find(player => player.uuid === selected || player.name === selected);
    send(req, res, viewerHTML(players, player), 'text/html; charset=utf-8', CACHE_CONTROL.html);
    return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    send(req, res, html, 'text/html; charset=utf-8', CACHE_CONTROL.html);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : 'Not found');
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
  const missing = players.filter(player => !avatarCache.has(player.uuid) || !skinCache.has(player.uuid));
  if (missing.length) throw new Error(`Missing images for ${missing.length} players. Run npm run fetch before building.`);
  const outDir = path.join(__dirname, '..', 'dist');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  fs.writeFileSync(path.join(outDir, '3d.html'), viewerHTML(players));
  fs.writeFileSync(path.join(outDir, '_headers'), staticHeaders());
  fs.writeFileSync(path.join(outDir, 'players.json'), JSON.stringify(playerManifest(players)) + '\n');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  for (const [pathname, buffer] of clientBuild.files) {
    const destination = path.join(outDir, pathname.slice(1));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, buffer);
  }
  fs.mkdirSync(path.join(outDir, '3d'), { recursive: true });
  for (const player of players) {
    fs.writeFileSync(path.join(outDir, '3d', `${player.uuid}.json`), JSON.stringify(player));
  }
  await copyDir(AVATARS_DIR, path.join(outDir, 'avatars'));
  await copyDir(SKINS_DIR, path.join(outDir, 'skins'));
  console.log(`Exported static site to ${outDir}`);
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
