/* Vault — 3D hero, "product photo" realism.
 * Matte-black vault dial + titanium handle wheel + chip stack, lit like a studio product shoot.
 * Three.js (MIT, free). Loaded as a module; exposes window.Hero3D.
 * Realism comes from: softbox environment lighting, bevelled edges, micro-surface maps
 * (brushed metal, matte grain, engraved relief), soft VSM shadows, and a lens pass
 * (shallow depth of field, gentle highlight bloom, film grain, vignette).
 * Open the page with ?tweak for sliders → "Copy settings" → paste into DEFAULTS.
 * Phones get a lighter pipeline; reduced motion gets one still frame; no WebGL keeps the CSS chips.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const DEFAULTS = {
  exposure: 1.12,
  envIntensity: 1.45,
  softbox: 3.2,
  keyIntensity: 22,
  keyX: 1.6,
  rimIntensity: 1.2,
  metalColor: '#c9ced5',
  metalRoughness: 0.42,
  brushed: 0.75,
  blackRoughness: 0.5,
  blackClearcoat: 0.3,
  grainSurface: 0.35,
  chipInsertColor: '#b4bac2',
  dof: 0.6,
  bloom: 0.1,
  filmGrain: 0.045,
  vignette: 0.35,
  bob: 0.06,
  spinSpeed: 0.1,
  parallax: 0.3,
  cameraZ: 9.2,
  fov: 22,
  dialSpinTurns: 1.5,
  introSeconds: 2.2
};

const params = Object.assign({}, DEFAULTS);
const LITE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t) => { t = clamp01(t); const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const span = (t, a, b) => clamp01((t - a) / (b - a));

let renderer, scene, camera, clock, composer, bokeh, bloom, grade, raf = 0, visible = true, started = 0, built = false, gui = null;
let key, rim, envTex, studio, softboxes = [], mats = {}, dial, handle, stack, hero;
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch (e) { return false; }
}

// ---------- procedural maps ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return [c, c.getContext('2d')]; }
function tex(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 8; return t;
}
// grey value noise for roughness variation / matte grain
function noiseCanvas(size, lo, hi, blur) {
  const [c, g] = canvas(size); const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) { const v = lo + Math.random() * (hi - lo); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (blur) { g.filter = `blur(${blur}px)`; g.drawImage(c, 0, 0); g.filter = 'none'; }
  return c;
}
// height canvas → tangent-space normal map
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h); const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    const len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (dx / len * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0); return c;
}
// brushed streaks (horizontal), used as anisotropy + roughness detail
function brushedCanvas(size) {
  const [c, g] = canvas(size); g.fillStyle = '#dedede'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) { const y = Math.random() * size, a = Math.random() * 0.25; g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${a})`; g.fillRect(0, y, size, Math.random() * 1.2 + 0.2); }
  return c;
}

function drawChipFace(g, s, forHeight) {
  const cx = s / 2, r = s / 2;
  if (forHeight) { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, s, s); }
  else {
    const base = g.createRadialGradient(cx * 0.85, cx * 0.75, 10, cx, cx, r);
    base.addColorStop(0, '#23262a'); base.addColorStop(0.6, '#141518'); base.addColorStop(1, '#0c0d0f');
    g.fillStyle = base; g.fillRect(0, 0, s, s);
  }
  const ink = forHeight ? '#ffffff' : params.chipInsertColor;
  g.strokeStyle = ink; g.lineWidth = r * 0.11;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.arc(cx, cx, r * 0.9, a, a + 0.22); g.stroke(); }
  g.strokeStyle = forHeight ? '#000' : 'rgba(205,210,216,.5)'; g.lineWidth = forHeight ? 6 : 3;
  g.beginPath(); g.arc(cx, cx, r * 0.72, 0, Math.PI * 2); g.stroke();       // engraved groove
  g.strokeStyle = forHeight ? '#000' : 'rgba(205,210,216,.28)'; g.lineWidth = forHeight ? 4 : 1.5;
  g.beginPath(); g.arc(cx, cx, r * 0.66, 0, Math.PI * 2); g.stroke();
  // engraved vault mark
  g.strokeStyle = forHeight ? '#000' : 'rgba(205,210,216,.6)'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cx, r * 0.26, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 12;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.1, cx + Math.sin(a) * r * 0.1); g.lineTo(cx + Math.cos(a) * r * 0.24, cx + Math.sin(a) * r * 0.24); g.stroke(); }
  g.fillStyle = forHeight ? '#000' : 'rgba(205,210,216,.7)'; g.beginPath(); g.arc(cx, cx, r * 0.06, 0, Math.PI * 2); g.fill();
}
function chipFaceMaps() {
  const s = LITE ? 512 : 1024;
  const [c, g] = canvas(s); drawChipFace(g, s, false);
  const [h, hg] = canvas(s); drawChipFace(hg, s, true); hg.filter = 'blur(1.5px)'; hg.drawImage(h, 0, 0);
  return { map: tex(c, true), normalMap: tex(normalFromHeight(h, 2.2)) };
}
function chipSideMap() {
  const [c, g] = canvas(1024, 64);
  g.fillStyle = '#121316'; g.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < 8; i++) {
    const x = i * 128 + 48, grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, '#5c6168'); grd.addColorStop(0.5, params.chipInsertColor); grd.addColorStop(1, '#5c6168');
    g.fillStyle = grd; g.fillRect(x, 8, 22, 48);
  }
  const t = tex(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- studio environment: softboxes in a black room (what product photographers use) ----------
function buildStudio() {
  studio = new THREE.Scene();
  studio.background = new THREE.Color(0x17191c);
  const box = (w, h, pos, look, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(look); m.userData.k = k; studio.add(m); softboxes.push(m); return m;
  };
  const O = new THREE.Vector3(0, 0, 0);
  box(9, 4, new THREE.Vector3(0.5, 6, 2.5), O, 1.0);     // big overhead softbox
  box(1.2, 6, new THREE.Vector3(-6, 1.2, 2.5), O, 0.55);   // tall strip, camera left
  box(1.0, 5, new THREE.Vector3(5.5, 2, -3.5), O, 0.8);    // rim strip, behind right
  box(10, 3, new THREE.Vector3(0, -3, 6), O, 0.04);        // faint floor bounce
}
function bakeEnv() {
  for (const m of softboxes) m.material.color.setScalar(params.softbox * m.userData.k);
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (envTex) envTex.dispose();
  envTex = pmrem.fromScene(studio, 0.02).texture; pmrem.dispose();
  scene.environment = envTex;
}

// grade: film grain + vignette (applied after tone mapping)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.04 }, vignette: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, grain, vignette; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      c.rgb += (rnd(vUv * 1000.0) - 0.5) * grain; gl_FragColor = c; }`
};

// ---------- geometry helpers (bevelled = realistic highlights on edges) ----------
function bevelledDisc(R, H, b, sideMat, faceMat, rimMat) {
  const g = new THREE.Group();
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H - 2 * b, 128, 1, true), sideMat);
  const capGeo = new THREE.CircleGeometry(R - b, 128);
  const top = new THREE.Mesh(capGeo, faceMat); top.rotation.x = -Math.PI / 2; top.position.y = H / 2;
  const bot = new THREE.Mesh(capGeo, faceMat); bot.rotation.x = Math.PI / 2; bot.position.y = -H / 2;
  const ringGeo = new THREE.TorusGeometry(R - b, b, 16, 128);
  const r1 = new THREE.Mesh(ringGeo, rimMat); r1.rotation.x = Math.PI / 2; r1.position.y = H / 2 - b;
  const r2 = new THREE.Mesh(ringGeo, rimMat); r2.rotation.x = Math.PI / 2; r2.position.y = -H / 2 + b;
  for (const m of [side, top, bot, r1, r2]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

// ---------- scene ----------
function build() {
  renderer = new THREE.WebGLRenderer({ antialias: !(!LITE), alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(LITE ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = params.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.domElement.className = 'hero3d-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121417).convertSRGBToLinear();
  buildStudio(); bakeEnv();
  scene.environmentIntensity = params.envIntensity;

  camera = new THREE.PerspectiveCamera(params.fov, 1, 0.1, 60);
  camera.position.set(0, 0.5, params.cameraZ);

  // a real light only for the soft shadow + a touch of extra shape; the softboxes do most of the work
  key = new THREE.SpotLight(0xf3f6fa, params.keyIntensity, 25, Math.PI / 8, 0.9, 1.5);
  key.position.set(params.keyX, 6, 3); key.target.position.set(0.3, -0.4, 0);
  key.castShadow = true; key.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
  key.shadow.radius = 10; key.shadow.blurSamples = 16; key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  rim = new THREE.DirectionalLight(0xdfe6ef, params.rimIntensity); rim.position.set(-3, 2.5, -4); scene.add(rim);

  // ---- materials ----
  const matteGrain = tex(normalFromHeight(noiseCanvas(256, 90, 165, 0.6), 1.2), false, 6);
  const roughVar = tex(noiseCanvas(256, 150, 215, 1.5), false, 3);
  const brushed = tex(brushedCanvas(512), false, 1);
  mats.black = new THREE.MeshPhysicalMaterial({ color: 0x0f1012, roughness: params.blackRoughness, roughnessMap: roughVar, metalness: 0.1,
    clearcoat: params.blackClearcoat, clearcoatRoughness: 0.5, normalMap: matteGrain, normalScale: new THREE.Vector2(params.grainSurface, params.grainSurface) });
  mats.metal = new THREE.MeshPhysicalMaterial({ color: params.metalColor, roughness: params.metalRoughness, roughnessMap: brushed, metalness: 1,
    anisotropy: params.brushed, anisotropyMap: null });
  mats.metalDark = new THREE.MeshPhysicalMaterial({ color: 0x4d5259, roughness: 0.38, metalness: 1, anisotropy: 0.4 });
  const face = chipFaceMaps();
  mats.chipFace = new THREE.MeshPhysicalMaterial({ map: face.map, normalMap: face.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.42, roughnessMap: roughVar,
    metalness: 0.12, clearcoat: 0.45, clearcoatRoughness: 0.35 });
  mats.chipSide = new THREE.MeshPhysicalMaterial({ map: chipSideMap(), roughness: 0.45, metalness: 0.12, clearcoat: 0.4, clearcoatRoughness: 0.4 });
  mats.chipRim = new THREE.MeshPhysicalMaterial({ color: 0x111215, roughness: 0.38, metalness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.3 });

  // floor that only receives the soft shadow
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.18; floor.receiveShadow = true; scene.add(floor);

  // ---- vault dial ----
  dial = new THREE.Group();
  const door = bevelledDisc(1.25, 0.24, 0.035, mats.black, mats.black, mats.black);
  door.rotation.x = Math.PI / 2; dial.add(door);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.29, 0.075, 48, 200), mats.metal); bezel.position.z = 0.1; bezel.castShadow = true; dial.add(bezel);
  const bezelLip = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.012, 16, 200), mats.metal); bezelLip.position.z = 0.125; dial.add(bezelLip);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.01, 16, 200), mats.metal); inner.position.z = 0.122; dial.add(inner);
  const ticks = new THREE.Group();
  const tickBig = new THREE.BoxGeometry(0.026, 0.13, 0.01), tickSmall = new THREE.BoxGeometry(0.012, 0.065, 0.01);
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0, a = i / 60 * Math.PI * 2, rr = big ? 1.095 : 1.12;
    const tick = new THREE.Mesh(big ? tickBig : tickSmall, mats.metal);
    tick.position.set(Math.sin(a) * rr, Math.cos(a) * rr, 0.123); tick.rotation.z = -a; ticks.add(tick);
  }
  dial.add(ticks);
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 3), mats.metal); marker.position.set(0, 1.45, 0.1); marker.rotation.z = Math.PI; dial.add(marker);
  handle = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.22, 96), mats.metal); hub.rotation.x = Math.PI / 2; hub.position.z = 0.23; hub.castShadow = true; handle.add(hub);
  const hubLip = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 16, 96), mats.metal); hubLip.position.z = 0.34; handle.add(hubLip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 64), mats.metalDark); cap.rotation.x = Math.PI / 2; cap.position.z = 0.345; handle.add(cap);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i / 3 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.68, 8, 24), mats.metal); spoke.position.set(0, 0.52, 0.3); spoke.castShadow = true; arm.add(spoke);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.078, 48, 24), mats.metal); knob.position.set(0, 0.9, 0.3); knob.castShadow = true; arm.add(knob);
    handle.add(arm);
  }
  dial.add(handle);
  dial.position.set(-0.15, 0.25, -0.9); dial.rotation.set(-0.06, -0.32, 0);
  scene.add(dial);

  // ---- chips ----
  const makeChip = () => bevelledDisc(0.62, 0.12, 0.014, mats.chipSide, mats.chipFace, mats.chipRim);
  stack = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = makeChip(); c.position.set((Math.random() - 0.5) * 0.035, -1.12 + i * 0.122, (Math.random() - 0.5) * 0.035);
    c.rotation.y = Math.random() * Math.PI * 2; c.rotation.z = (Math.random() - 0.5) * 0.015;
    c.userData.restY = c.position.y; stack.add(c);
  }
  stack.position.set(1.05, 0, 0.45); scene.add(stack);
  hero = new THREE.Group(); hero.add(makeChip());
  hero.position.set(1.15, 0.45, 0.75); hero.userData.restY = 0.45; hero.rotation.set(0.95, 0.2, -0.38);
  scene.add(hero);

  // ---- lens: depth of field, highlight bloom, grade ----
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: LITE ? 0 : 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!LITE) { bokeh = new BokehPass(scene, camera, { focus: params.cameraZ, aperture: 0.0006, maxblur: 0.006 }); composer.addPass(bokeh); }
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), params.bloom, 0.4, 0.93); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  grade = new ShaderPass(GradeShader); composer.addPass(grade);

  clock = new THREE.Clock();
  built = true;
  applyParams();

  window.addEventListener('pointermove', (e) => { pointer.tx = (e.clientX / window.innerWidth) * 2 - 1; pointer.ty = (e.clientY / window.innerHeight) * 2 - 1; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
}

let envDirty = false;
function applyParams() {
  if (!built) return;
  renderer.toneMappingExposure = params.exposure;
  scene.environmentIntensity = params.envIntensity;
  key.intensity = params.keyIntensity; key.position.x = params.keyX;
  rim.intensity = params.rimIntensity;
  mats.metal.color.set(params.metalColor); mats.metal.roughness = params.metalRoughness; mats.metal.anisotropy = params.brushed;
  mats.black.roughness = params.blackRoughness; mats.black.clearcoat = params.blackClearcoat; mats.black.normalScale.setScalar(params.grainSurface);
  camera.fov = params.fov; camera.position.z = params.cameraZ; camera.updateProjectionMatrix();
  if (bokeh) bokeh.uniforms.aperture.value = 0.001 * params.dof;
  bloom.strength = params.bloom;
  grade.uniforms.grain.value = params.filmGrain; grade.uniforms.vignette.value = params.vignette;
  envDirty = true;
}

// ---------- animation ----------
function pose(t) {
  const T = params.introSeconds / 2.2;
  const d = easeOutBack(span(t, 0, 1.2 * T));
  dial.rotation.z = (1 - d) * -Math.PI * 2 * params.dialSpinTurns;
  dial.scale.setScalar(0.92 + 0.08 * easeOut(span(t, 0, 0.8 * T)));
  handle.rotation.z = easeOut(span(t, 1.0 * T, 1.6 * T)) * (Math.PI / 2);
  stack.children.forEach((c, i) => {
    const k = easeOut(span(t, 0.2 * T + i * 0.08 * T, 0.75 * T + i * 0.08 * T));
    c.position.y = c.userData.restY + (1 - k) * 0.6; c.visible = k > 0.001;
  });
  const h = easeOut(span(t, 0.1 * T, 1.1 * T)), idle = Math.max(0, t - 1.1 * T);
  hero.position.y = hero.userData.restY + (1 - h) * 1.2 + Math.sin(idle * (Math.PI * 2 / 3.5)) * params.bob * Math.min(1, idle);
  hero.rotation.y = 0.2 + idle * params.spinSpeed;
  hero.visible = h > 0.001;
  key.position.x = params.keyX + Math.sin(t * 0.25) * 0.5;
  pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04;
  camera.position.x = pointer.x * params.parallax;
  camera.position.y = 0.5 - pointer.y * params.parallax * 0.5;
  camera.lookAt(0.35, -0.15, 0);
  if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(hero.position);
  grade.uniforms.time.value = t % 10;
}

function draw(t) {
  if (envDirty) { bakeEnv(); envDirty = false; }
  pose(t); composer.render();
}
function frame() {
  raf = 0;
  if (!visible || document.hidden || !renderer.domElement.isConnected) return;
  draw(clock.getElapsedTime() - started);
  loop();
}
function loop() { if (!raf && !reduced()) raf = requestAnimationFrame(frame); }

function resize() {
  const el = renderer.domElement; if (!el.parentElement) return;
  const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (reduced()) draw(10);
}

let ro = null, io = null;
function mount(container) {
  if (!container || !webglOk()) return false;
  try { if (!built) build(); } catch (e) { console.warn('3D hero unavailable', e); return false; }
  if (renderer.domElement.parentElement !== container) {
    container.appendChild(renderer.domElement);
    container.classList.add('has-3d');
    if (ro) ro.disconnect(); ro = new ResizeObserver(resize); ro.observe(container);
    if (io) io.disconnect(); io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) loop(); }); io.observe(container);
  }
  resize();
  if (!started) started = clock.getElapsedTime() || 0.0001;
  if (reduced()) draw(10); else loop();
  if (/[?&]tweak\b/.test(location.search) && !gui) openTweaks();
  return true;
}
function replay() { started = clock.getElapsedTime(); loop(); }

async function openTweaks() {
  const { default: GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/dist/lil-gui.esm.min.js');
  gui = new GUI({ title: 'Hero tweaks' });
  const L = gui.addFolder('Light');
  L.add(params, 'exposure', 0.4, 2, 0.01).name('Exposure');
  L.add(params, 'softbox', 0, 15, 0.1).name('Softboxes');
  L.add(params, 'envIntensity', 0, 3, 0.01).name('Reflections');
  L.add(params, 'keyIntensity', 0, 60, 0.5).name('Spotlight');
  L.add(params, 'keyX', -4, 4, 0.05).name('Spotlight side');
  L.add(params, 'rimIntensity', 0, 6, 0.05).name('Rim light');
  const M = gui.addFolder('Materials');
  M.addColor(params, 'metalColor').name('Metal color');
  M.add(params, 'metalRoughness', 0, 1, 0.01).name('Metal roughness');
  M.add(params, 'brushed', 0, 1, 0.01).name('Brushed look');
  M.add(params, 'blackRoughness', 0, 1, 0.01).name('Black matte');
  M.add(params, 'blackClearcoat', 0, 1, 0.01).name('Black sheen');
  M.add(params, 'grainSurface', 0, 1, 0.01).name('Surface grain');
  const C = gui.addFolder('Lens');
  C.add(params, 'dof', 0, 3, 0.05).name('Background blur');
  C.add(params, 'bloom', 0, 1, 0.01).name('Highlight glow');
  C.add(params, 'filmGrain', 0, 0.15, 0.005).name('Film grain');
  C.add(params, 'vignette', 0, 1, 0.01).name('Vignette');
  C.add(params, 'cameraZ', 5, 14, 0.05).name('Camera distance');
  C.add(params, 'fov', 12, 50, 1).name('Lens (fov)');
  const A = gui.addFolder('Motion');
  A.add(params, 'bob', 0, 0.3, 0.005).name('Chip bob');
  A.add(params, 'spinSpeed', 0, 1, 0.01).name('Chip spin');
  A.add(params, 'parallax', 0, 1, 0.01).name('Mouse parallax');
  A.add(params, 'dialSpinTurns', 0, 4, 0.25).name('Dial spin turns');
  A.add(params, 'introSeconds', 1, 5, 0.1).name('Intro length (s)');
  gui.onChange(applyParams);
  gui.add({ replay }, 'replay').name('▶ Replay intro');
  gui.add({ copy() {
    const out = JSON.stringify(params, null, 2);
    (navigator.clipboard ? navigator.clipboard.writeText(out) : Promise.reject()).then(() => alert('Settings copied. Paste them to Claude.'), () => prompt('Copy these settings:', out));
  } }, 'copy').name('📋 Copy settings');
  gui.add({ reset() { Object.assign(params, DEFAULTS); gui.controllersRecursive().forEach(c => c.updateDisplay()); applyParams(); } }, 'reset').name('↺ Reset');
}

window.Hero3D = { mount, replay, params };
window.dispatchEvent(new Event('hero3d-ready'));
