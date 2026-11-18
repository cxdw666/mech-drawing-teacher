#!/usr/bin/env node
/**
 * 立体描述 JSON → 可旋转三维网页（three.js + CSG，全部本地依赖）。
 * 用法：node tools/make3d.mjs viewer/models/724-3.json
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) { console.error('用法: node tools/make3d.mjs <spec.json>'); process.exit(1); }
const root = path.resolve(import.meta.dirname, '..');
let spec = JSON.parse(fs.readFileSync(file, 'utf8'));

// ---------- 字段归一化：模型写的字段名不总是和文档一致 ----------
function normalizeSpec(raw) {
  const out = Object.assign({}, raw);
  const b = raw.bounds;
  if (Array.isArray(b) && b.length === 6) out.bounds = { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
  out.solids = (raw.solids || []).map(function (s) {
    const o = Object.assign({}, s);
    o.shape = s.shape || s.type || 'box';
    if (s.radius !== undefined && s.r === undefined) o.r = s.radius;
    if (s.height !== undefined && s.h === undefined) o.h = s.height;
    if (!o.size && s.length !== undefined) o.size = [s.length, s.height, s.width];
    o.op = s.op === 'subtract' ? 'sub' : s.op === 'union' ? 'add' : (s.op || 'base');
    return o;
  });
  return out;
}
const rawKeys = new Set((spec.solids || []).flatMap(function (s) { return Object.keys(s); }));
if (rawKeys.has('type') || rawKeys.has('radius') || Array.isArray(spec.bounds)) {
  console.log('ℹ 检测到字段别名（type/radius/height/op:subtract 或扁平 bounds），已自动归一化');
}
spec = normalizeSpec(spec);


const dimsHtml = (spec.dims || []).map(function (d) {
  return '<div class="dim"><b>' + d.label + '</b><span>' + d.note + '</span></div>';
}).join('');
const viewsHtml = Object.entries(spec.views || {}).map(function (kv) {
  return '<div class="view"><h4>' + kv[0] + '</h4><p>' + kv[1] + '</p></div>';
}).join('');

const VIEWER = [
'import * as THREE from "three";',
'import { OrbitControls } from "three/addons/controls/OrbitControls.js";',
'import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";',
'import { RenderPass } from "three/addons/postprocessing/RenderPass.js";',
'import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";',
'import { OutputPass } from "three/addons/postprocessing/OutputPass.js";',
'import { RoomEnvironment } from "three/addons/environments_RoomEnvironment.js";',
'import { Brush, Evaluator, SUBTRACTION, ADDITION } from "three/addons/three-bvh-csg.module.js";',
'',
'const SPEC = ' + JSON.stringify(spec) + ';',
'const canvas = document.getElementById("cv");',
'const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });',
'renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));',
'renderer.toneMapping = THREE.ACESFilmicToneMapping;',
'renderer.toneMappingExposure = 0.95;',
'',
'const scene = new THREE.Scene();',
'scene.fog = new THREE.Fog(0x060b13, 380, 1300);',
'const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 6000);',
'',
'const pmrem = new THREE.PMREMGenerator(renderer);',
'const envRT = pmrem.fromScene(new RoomEnvironment(), 0.05);',
'scene.environment = envRT.texture;',
'',
'scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x061019, 1.25));',
'const key = new THREE.DirectionalLight(0xffffff, 2.9); key.position.set(160, 300, 210); scene.add(key);',
'const rim = new THREE.DirectionalLight(0x35e0ff, 2.2); rim.position.set(-220, 120, -180); scene.add(rim);',
'const fill = new THREE.DirectionalLight(0x2a6cff, 1.1); fill.position.set(-120, -120, 160); scene.add(fill);',
'',
'const evaluator = new Evaluator();',
'evaluator.useGroups = false;',
'const mat = new THREE.MeshPhysicalMaterial({ color: 0x1a5f80, metalness: 0.32, roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.2, envMapIntensity: 1.05, side: THREE.DoubleSide });',
'let acc = null;',
'for (const s of SPEC.solids) {',
'  const geo = s.shape === "cylinder"',
'    ? new THREE.CylinderGeometry(s.r, s.r, s.h, 128, 1)',
'    : new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);',
'  const b = new Brush(geo, mat);',
'  b.position.set(s.pos[0], s.pos[1], s.pos[2]);',
'  if (s.rotation) b.rotation.set(s.rotation[0] * Math.PI / 180, s.rotation[1] * Math.PI / 180, s.rotation[2] * Math.PI / 180);',
'  b.updateMatrixWorld();',
'  if (!acc) { acc = b; continue; }',
'  acc = evaluator.evaluate(acc, b, s.op === "sub" ? SUBTRACTION : ADDITION);',
'}',
'const mesh = new THREE.Mesh(acc.geometry, mat);',
'mesh.geometry.computeVertexNormals();',
'scene.add(mesh);',
'',
'',
'',
'acc.geometry.computeBoundingBox();',
'const bb = acc.geometry.boundingBox;',
'const center = bb.getCenter(new THREE.Vector3());',
'const sizeV = bb.getSize(new THREE.Vector3());',
'const radius = sizeV.length() * 0.5;   // 包围球半径，取景用它才不会切边',
'',
'const gridSpan = Math.ceil(radius * 8);',
'const grid = new THREE.GridHelper(gridSpan, Math.round(gridSpan / 10), 0x2aa9c8, 0x0e3346);',
'grid.position.set(center.x, bb.min.y - 0.6, center.z);',
'grid.material.transparent = true; grid.material.opacity = 0.55;',
'scene.add(grid);',
'',
'const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 256;',
'const gctx = glowCanvas.getContext("2d");',
'const grad = gctx.createRadialGradient(128, 128, 4, 128, 128, 126);',
'grad.addColorStop(0, "rgba(53,224,255,0.55)"); grad.addColorStop(0.45, "rgba(30,140,190,0.18)"); grad.addColorStop(1, "rgba(0,0,0,0)");',
'gctx.fillStyle = grad; gctx.fillRect(0, 0, 256, 256);',
'const glowTex = new THREE.CanvasTexture(glowCanvas);',
'const glow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 5.2, radius * 5.2),',
'  new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));',
'glow.rotation.x = -Math.PI / 2;',
'glow.position.set(center.x, bb.min.y - 0.5, center.z);',
'scene.add(glow);',
'',
'const controls = new OrbitControls(camera, canvas);',
'controls.enableDamping = true;',
'controls.dampingFactor = 0.075;',
'controls.target.copy(center);',
'controls.minDistance = radius * 1.25;',
'controls.maxDistance = radius * 9;',
'controls.autoRotate = true;',
'controls.autoRotateSpeed = 1.15;',
'',
'const composer = new EffectComposer(renderer);',
'composer.addPass(new RenderPass(scene, camera));',
'const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.55, 0.9);',
'composer.addPass(bloom);',
'composer.addPass(new OutputPass());',
'',
'function place(distMul) {',
'  const d = radius * (distMul || 4.3);',
'  const shift = -radius * 0.42;',
'  camera.position.set(center.x + d * 0.72, center.y + d * 0.52, center.z + d * 0.66);',
'  controls.target.set(center.x + shift * 0.75, center.y - radius * 0.05, center.z);',
'  camera.near = radius * 0.02; camera.far = radius * 40;',
'  camera.updateProjectionMatrix();',
'}',
'place();',
'',
'function resize() {',
'  const w = canvas.clientWidth, h = canvas.clientHeight;',
'  renderer.setSize(w, h, false);',
'  composer.setSize(w, h);',
'  camera.aspect = w / h;',
'  camera.updateProjectionMatrix();',
'}',
'window.addEventListener("resize", resize);',
'resize();',
'',
'(function loop() { requestAnimationFrame(loop); controls.update(); composer.render(); })();',
'',
'const api = {',
'  setView: function (n) {',
'    controls.autoRotate = false;',
'    const d = Math.round(radius * 4.3);',
'    if (n === "front") camera.position.set(center.x, center.y, center.z + d);',
'    if (n === "top") camera.position.set(center.x, center.y + d, center.z + 0.01);',
'    if (n === "left") camera.position.set(center.x - d, center.y, center.z);',
'    if (n === "iso") { camera.position.set(center.x + d * 0.72, center.y + d * 0.52, center.z + d * 0.66); controls.autoRotate = true; }',
'    camera.lookAt(center); controls.update();',
'  },',
'  toggleAuto: function () { controls.autoRotate = !controls.autoRotate; },',
'  toggleWire: function () { mat.wireframe = !mat.wireframe; edges.visible = !mat.wireframe; },',
'  reset: function () { controls.autoRotate = true; controls.target.copy(center); place(); }',
'};',
'window.v = api;'
].join('\n');

const CSS = [
  ':root{--cy:#35e0ff;--cy2:#0af;--bg:#04070d}',
  '*{box-sizing:border-box;margin:0;padding:0}',
  'html,body{height:100%}',
  'body{background:radial-gradient(ellipse at 50% 42%,#0a1a26 0%,#050b12 45%,#010306 100%);color:#cfe8f5;font-family:Consolas,"Microsoft YaHei",monospace;overflow:hidden}',
  '#stage{position:fixed;inset:0}',
  'canvas{display:block;width:100%;height:100%;cursor:grab}',
  'canvas:active{cursor:grabbing}',
  '.panel{position:fixed;background:linear-gradient(180deg,rgba(8,20,32,.82),rgba(6,14,22,.7));border:1px solid rgba(53,224,255,.22);box-shadow:0 0 30px rgba(53,224,255,.09) inset,0 8px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px)}',
  '.panel::before,.panel::after{content:"";position:absolute;width:16px;height:16px;border:2px solid var(--cy);opacity:.85}',
  '.panel::before{top:-1px;left:-1px;border-right:0;border-bottom:0}',
  '.panel::after{bottom:-1px;right:-1px;border-left:0;border-top:0}',
  '#info{position:fixed;top:26px;left:26px;width:392px;padding:20px 22px;z-index:4}',
  '#info h1{font-size:18px;color:#fff;letter-spacing:1.5px;text-shadow:0 0 18px rgba(53,224,255,.45)}',
  '#info h1::before{content:"▮ ";color:var(--cy)}',
  '#sub{font-size:11.5px;line-height:1.75;color:#86aec2;margin:9px 0 15px}',
  '.dim{display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:6px 0;border-bottom:1px dashed rgba(53,224,255,.13)}',
  '.dim b{color:var(--cy);font-weight:600;text-shadow:0 0 12px rgba(53,224,255,.5)}',
  '.dim span{color:#6d94a8;text-align:right}',
  '#views{position:fixed;bottom:26px;left:26px;width:660px;padding:15px 20px;display:flex;gap:20px;z-index:4}',
  '.view{flex:1}',
  '.view h4{font-size:12px;color:var(--cy);margin-bottom:6px;letter-spacing:1px}',
  '.view p{font-size:11.5px;line-height:1.65;color:#7fa8bd}',
  '#ctrl{position:fixed;top:26px;right:26px;display:flex;flex-direction:column;gap:9px;z-index:5}',
  'button{cursor:pointer;font-family:inherit;font-size:12px;letter-spacing:1.2px;color:var(--cy);background:linear-gradient(180deg,rgba(10,26,40,.9),rgba(6,16,26,.9));border:1px solid rgba(53,224,255,.3);padding:10px 15px;transition:.18s;text-align:left;min-width:150px}',
  'button:hover{background:rgba(53,224,255,.16);box-shadow:0 0 18px rgba(53,224,255,.4);border-color:var(--cy);color:#eafcff}',
  '#hint{position:fixed;bottom:26px;right:26px;font-size:11px;color:#4d7186;text-align:right;line-height:1.9}',
  '.scan{position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(53,224,255,.022) 0 1px,transparent 1px 3px)}',
  '.vig{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,.55) 100%)}'
].join('');

const IMPORTMAP = JSON.stringify({ imports: {
  'three': '../vendor/three.module.js',
  'three/addons/': '../vendor/jsm/',
  'three-mesh-bvh': '../vendor/jsm/three-mesh-bvh.module.js'
} });

const BTNS = [
  ['iso', '等轴测视角'], ['front', '主视图方向'], ['top', '俯视图方向'],
  ['left', '左视图方向'], ['auto', '自动旋转 开/关'], ['wire', '线框模式'], ['reset', '重置']
].map(function (b) {
  const fn = b[0] === 'auto' ? 'v.toggleAuto()' : b[0] === 'wire' ? 'v.toggleWire()' : b[0] === 'reset' ? 'v.reset()' : "v.setView('" + b[0] + "')";
  return '<button onclick="' + fn + '">' + b[1] + '</button>';
}).join('');

const html = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>' + spec.title + ' · 三维还原</title>',
  '<script type="importmap">' + IMPORTMAP + '</' + 'script>',
  '<style>' + CSS + '</style></head><body>',
  '<div id="stage"><canvas id="cv"></canvas></div>',
  '<div class="scan"></div><div class="vig"></div>',
  '<div id="info" class="panel"><h1>' + spec.title + '</h1>',
  '<div id="sub">' + spec.subtitle + '</div>' + dimsHtml + '</div>',
  '<div id="views" class="panel">' + viewsHtml + '</div>',
  '<div id="ctrl">' + BTNS + '</div>',
  '<div id="hint">拖拽 = 旋转　滚轮 = 缩放　右键 = 平移<br>three.js · CSG 实时布尔 · 光追风格泛光</div>',
  '<script type="module">' + VIEWER + '</' + 'script>',
  '</body></html>'
].join('\n');

// ---------- 几何自检：渲染前先体检 ----------
const EPS = 0.01;
const boundsOf = (s) => {
  if (s.shape === 'box') {
    return [s.pos[0] - s.size[0] / 2, s.pos[0] + s.size[0] / 2,
            s.pos[1] - s.size[1] / 2, s.pos[1] + s.size[1] / 2,
            s.pos[2] - s.size[2] / 2, s.pos[2] + s.size[2] / 2];
  }
  const r = s.r;
  return [s.pos[0] - r, s.pos[0] + r, s.pos[1] - s.h / 2, s.pos[1] + s.h / 2, s.pos[2] - r, s.pos[2] + r];
};
const warns = [];
const B = spec.bounds;
(spec.solids || []).forEach((sd, i) => {
  const b = boundsOf(sd);
  const faces = [[b[0], B.min[0] + EPS], [B.max[0] - EPS, b[1]], [b[2], B.min[1] + EPS], [B.max[1] - EPS, b[3]], [b[4], B.min[2] + EPS], [B.max[2] - EPS, b[5]]];
  faces.forEach(([lo, hi]) => { if (Math.abs(lo - hi) < 0.5) warns.push('solids[' + i + '] 的边界与 bounds 贴死（差值 ' + (hi - lo).toFixed(2) + ' mm）：切面会被裁掉，bounds 应外扩 5~10 mm'); });
  if (sd.op === 'sub') {
    (spec.solids || []).forEach((other, j) => {
      if (i === j) return;
      const o = boundsOf(other);
      for (let k = 0; k < 6; k += 2) {
        if (Math.abs(b[k] - o[k]) < EPS || Math.abs(b[k + 1] - o[k + 1]) < EPS) {
          warns.push('提示：solids[' + i + '] 与 solids[' + j + '] 在第 ' + (k / 2 + 1) + ' 轴端面共面（' + b[k].toFixed(1) + '）。通孔类共面通常没问题，但径向孔/切槽若正好切到曲面切点会炸出碎面——把切割体两端各多伸 2 mm 最稳');
          break;
        }
      }
    });
  }
  if (sd.rotation && sd.rotation.some(v => v % 90 !== 0)) warns.push('solids[' + i + '] 的 rotation 不是 90° 的整数倍，易与"正对某视图"的描述冲突');
});
if (warns.length) { console.log('⚠ 几何自检发现 ' + warns.length + ' 处风险：'); warns.forEach(w => console.log('  - ' + w)); }
else console.log('✓ 几何自检通过');

const outDir = path.join(root, 'viewer', 'pages');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, spec.id + '.html');
fs.writeFileSync(out, html, 'utf8');
console.log('生成: ' + path.relative(root, out) + '  ' + (html.length / 1024).toFixed(1) + ' KB');
