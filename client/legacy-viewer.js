import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const players = window.__PLAYERS__ || [];
const canvas = document.getElementById('canvas');
const sel = document.getElementById('sel');
const pname = document.getElementById('pname');
const puuid = document.getElementById('puuid');
const pmodel = document.getElementById('pmodel');
const selected = new URL(location.href).searchParams.get('player');
const selectedPlayer = players.find(player => player.uuid === selected || player.name === selected);
if (selectedPlayer) sel.value = selectedPlayer.uuid;

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
  img.src = player.skinPath;
}

window.loadPlayer = loadPlayer;

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
