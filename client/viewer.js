import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
function disposeModel(root) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => {
      material?.map?.dispose?.();
      material?.dispose?.();
    });
  });
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

function updateMascotLook(group, camera, canvas, pointer, look, headPosition) {
  const head = group.getObjectByName('head');
  if (!head || !pointer) {
    look.x = 0;
    look.y = 0;
    return;
  }
  camera.updateMatrixWorld();
  head.getWorldPosition(headPosition).project(camera);
  const box = canvas.getBoundingClientRect();
  const centerX = box.left + (headPosition.x + 1) * box.width / 2;
  const centerY = box.top + (1 - headPosition.y) * box.height / 2;
  look.x = clamp((pointer.x - centerX) / Math.max(box.width / 2, 1), -1, 1);
  look.y = clamp((pointer.y - centerY) / Math.max(box.height / 2, 1), -1, 1);
}

const MASCOT_MAX_HEAD_YAW = 0.28;
const MASCOT_MAX_HEAD_PITCH = 0.16;

function applyMascotLook(group, look) {
  const head = group.getObjectByName('head');
  const body = group.getObjectByName('body');
  if (!head || !body) return;
  const facing = Math.max(0, Math.cos(group.rotation.y));
  head.rotation.y += clamp(look.x * MASCOT_MAX_HEAD_YAW, -MASCOT_MAX_HEAD_YAW, MASCOT_MAX_HEAD_YAW) * facing;
  head.rotation.x += clamp(look.y * MASCOT_MAX_HEAD_PITCH, -MASCOT_MAX_HEAD_PITCH, MASCOT_MAX_HEAD_PITCH) * facing;
  body.rotation.y += look.x * 0.035 * facing;
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
    camera.position.set(0, 0.25, 6);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, -0.25, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    const playerGroup = new THREE.Group();
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
    viewerRef.current = { playerGroup, platform, resize };

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      controls.dispose();
      disposeModel(playerGroup);
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
      disposeModel(viewer.playerGroup);
      buildPlayer(viewer.playerGroup, img, player.skinModel, player.uuid);
      viewer.playerGroup.traverse(node => {
        if (node.isMesh) node.castShadow = !node.userData.outerLayer;
      });
      viewer.playerGroup.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(viewer.playerGroup);
      viewer.platform.position.y = bounds.min.y - 0.025;
      applyPartVisibility(viewer.playerGroup, visibilityRef.current);
      viewer.resize();
      setLoading(false);
    };
    img.onerror = () => {
      if (player.skinUrl && img.src !== player.skinUrl) img.src = player.skinUrl;
      else setLoading(false);
    };
    img.src = player.skinPath;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [open, player]);

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
    yaw: 0,
    hidden: false
  };
}

function readMascotState() {
  const fallback = defaultMascotState();
  try {
    const saved = JSON.parse(localStorage.getItem(MASCOT_STORE) || '{}');
    const savedYaw = Number(saved.yaw);
    return {
      ...fallback,
      ...saved,
      left: clamp(Number(saved.left ?? fallback.left), 8, window.innerWidth - 72),
      top: clamp(Number(saved.top ?? fallback.top), 8, window.innerHeight - 72),
      width: clamp(Number(saved.width ?? fallback.width), 220, 420),
      height: clamp(Number(saved.height ?? fallback.height), 330, 630),
      uuid: players.some(player => player.uuid === saved.uuid) ? saved.uuid : fallback.uuid,
      animation: ANIMATIONS.some(([value]) => value === saved.animation) ? saved.animation : fallback.animation,
      yaw: savedYaw === -0.22 ? 0 : Number.isFinite(savedYaw) ? savedYaw : fallback.yaw,
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
  const pointerRef = useRef(null);
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
      pointerRef.current = { x: event.clientX, y: event.clientY };
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
    const headPosition = new THREE.Vector3();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      animateBones(playerGroup, actionRef.current, elapsed);
      playerGroup.rotation.y = yawRef.current;
      if (actionRef.current === 'idle') {
        playerGroup.rotation.y += Math.sin(elapsed * 0.7) * 0.12;
      }
      updateMascotLook(playerGroup, camera, canvas, pointerRef.current, lookRef.current, headPosition);
      applyMascotLook(playerGroup, lookRef.current);
      window.__mascotLook = lookRef.current;
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
    img.src = player.skinPath;
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
