import { seatForOrder, buildFillOrder, labelFor } from './seats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildReese } from './reese-figure.js';

/* ---------- dimensions (metres) ---------- */
const A = 92, B = 46;                 // inner edge of the stands
const ROWS = 40, TREAD = .86, RISE = .46, BASE_Y = 18, TL = 14; // TL lifts everything on the towers
const TOP_Y = BASE_Y + ROWS * RISE, RIM_D = ROWS * TREAD, WALK_D = RIM_D + 3.1;
const TOWER_D = 44, STAND_SEATS = 29000, VIP_SEATS = 1000, TOTAL = STAND_SEATS + VIP_SEATS;
const SUN = new THREE.Vector3(-.62, .44, .66).normalize();
// four quarters of the ground. Undyed until there is a team: recolour them here.
const UNDYED = { a: '#e9e3d3', b: '#a39e92', seat: [.1, .105, .12], flag: 0xe9e3d3 };
const SECTORS = [UNDYED, UNDYED, UNDYED, UNDYED];
const sectorOf = (x, z) => Math.floor(((Math.atan2(z / B, x / A) + Math.PI / 4 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let seedV = 7; const rnd = () => (seedV = (seedV * 16807) % 2147483647) / 2147483647;

function ell(t, d = 0) {
  const c = Math.cos(t), s = Math.sin(t);
  let nx = B * c, nz = A * s; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
  return { x: A * c + nx * d, z: B * s + nz * d, nx, nz };
}
const rowY = r => BASE_Y + r * RISE;
const rowD = r => (r + .5) * TREAD;

/* ---------- renderer ---------- */
const frame = document.getElementById('frame');
let renderer;
const params = new URLSearchParams(location.search);
const small = Math.min(innerWidth, innerHeight) < 700;
// Phones skip post-processing and use simpler seats and people. ?lite and ?full force a mode for testing.
const LITE = params.has('full') ? false : params.has('lite') || small || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
try { renderer = new THREE.WebGLRenderer({ antialias: LITE, powerPreference: 'high-performance' }); }
catch (e) { document.body.insertAdjacentHTML('beforeend', '<div id="err">This stadium needs WebGL. Turn on hardware acceleration in your browser and reload.</div>'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.25 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
frame.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(.56, .60, .67);
scene.fog = new THREE.FogExp2(FOG, .00042);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 9000);
const uTime = { value: 0 };

/* ---------- noise ---------- */
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), u), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}
function fbm(x, y, o = 5) { let a = .5, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); n += a; x = x * 2.03 + 17; y = y * 2.03 + 9; a *= .5; } return s / n; }

/* ---------- canvases ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function woodTexture() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#c9b193'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    x.strokeStyle = `rgba(${40 + rnd() * 50},${25 + rnd() * 30},${15 + rnd() * 15},${.04 + rnd() * .1})`;
    x.lineWidth = rnd() * 2 + .4; const y = rnd() * 512;
    x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(170, y + rnd() * 8 - 4, 340, y + rnd() * 8 - 4, 512, y); x.stroke();
  }
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(25,14,8,.55)'; x.fillRect(0, i * 128, 512, 3); }
  return tex(c, { repeat: true });
}
function clothTexture(cream, ink, gold = '#c9c3b4') {
  const [c, x] = canvas(512, 1024);
  const H = 1024, cut = 64;
  [cream, ink].forEach((col, i) => {
    x.fillStyle = col; x.fillRect(i * 256, 0, 256, H - cut);
    x.beginPath(); x.ellipse(i * 256 + 128, H - cut, 128, cut, 0, 0, Math.PI); x.fill();
  });
  x.fillStyle = gold; x.fillRect(0, H - cut - 50, 512, 16); x.fillRect(0, H - cut - 22, 512, 6);
  x.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,240,210'},${rnd() * .035})`; x.fillRect(rnd() * 512, rnd() * H, 1 + rnd() * 3, 6 + rnd() * 50); }
  return tex(c, { repeat: true });
}
function roofTexture(cA, cB) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = cA; x.fillRect(0, 0, 128, 256); x.fillStyle = cB; x.fillRect(128, 0, 128, 256);
  for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * .05})`; x.fillRect(rnd() * 256, rnd() * 256, 2, 16); }
  return tex(c, { repeat: true });
}
function pitchTexture() {
  const [c, x] = canvas(2048, 1024), W = 2048, H = 1024;
  // mown pattern: concentric oval rings, pale at the centre, with olive crescents that swell on the long axis and taper out
  const img = x.createImageData(W, H), px = img.data, RINGS = 7;
  const inner = [176, 191, 118], outer = [104, 158, 78], olive = [160, 170, 102];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const nx = i / W * 2 - 1, ny = j / H * 2 - 1, e = Math.hypot(nx, ny), w = e * RINGS, k = Math.floor(w), fr = w - k;
    const ang = Math.atan2(ny, nx) + .32 + e * .55;
    const mix = smooth(.05, .95, e), band = k % 2 ? 1 : .925;
    let r = lerp(inner[0], outer[0], mix) * band, g = lerp(inner[1], outer[1], mix) * band, b = lerp(inner[2], outer[2], mix) * band;
    const th = .5 * Math.pow(Math.abs(Math.cos(ang)), 1.5);       // crescent half-width at this angle
    if (k % 2 === 0 && e < 1 && Math.abs(fr - .5) < th) { const o = lerp(1, .88, mix); r = olive[0] * o; g = olive[1] * o; b = olive[2] * o; }
    const n = (hash(i * .37, j * .61) - .5) * 9, q = (i + j * W) * 4;
    px[q] = r + n; px[q + 1] = g + n; px[q + 2] = b + n * .6; px[q + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '40,70,25' : '215,225,150'},${rnd() * .13})`; x.fillRect(rnd() * W, rnd() * H, 2, 2 + rnd() * 4); }
  x.strokeStyle = 'rgba(247,245,232,.95)'; x.lineWidth = 7;
  const ox = W / 2, oy = H / 2, sx = W / 2 / A, sy = H / 2 / B;
  const el = (rx, ry, cx = 0) => { x.beginPath(); x.ellipse(ox + cx * sx, oy, rx * sx, ry * sy, 0, 0, 7); x.stroke(); };
  el(82, 38); el(10, 10);
  x.beginPath(); x.moveTo(ox, oy - 38 * sy); x.lineTo(ox, oy + 38 * sy); x.stroke();
  [-1, 1].forEach(s => { el(15, 19, s * 68); });
  return tex(c);
}

/* ---------- geometry helpers ---------- */
const tempC = new THREE.Color();
function tag(g, hex = 0xffffff, wave = null) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3); tempC.set(hex);
  const v = .86 + rnd() * .28;
  for (let i = 0; i < n; i++) { a[i * 3] = tempC.r * v; a[i * 3 + 1] = tempC.g * v; a[i * 3 + 2] = tempC.b * v; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (wave) {
    const w = new Float32Array(n), uv = g.attributes.uv;
    for (let i = 0; i < n; i++) w[i] = wave(uv.getX(i), uv.getY(i));
    g.setAttribute('aWave', new THREE.BufferAttribute(w, 1));
  }
  return g;
}
const WOOD = 0x8d6c4c, WOOD_D = 0x56402d, WOOD_L = 0xb08e66;
function box(w, h, d, x, y, z, ry = 0, col = WOOD) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return tag(g, col); }
const UP = new THREE.Vector3(0, 1, 0), v1 = new THREE.Vector3(), q1 = new THREE.Quaternion();
function beam(a, b, th = .4, col = WOOD) {
  v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = v1.length(); v1.divideScalar(len);
  const g = new THREE.BoxGeometry(th, len, th); q1.setFromUnitVectors(UP, v1); g.applyQuaternion(q1);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return tag(g, col);
}
function waveMaterial(mat, body) {
  mat.onBeforeCompile = s => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'attribute float aWave; uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);
  };
  return mat;
}

/* ---------- materials ---------- */
const woodMap = woodTexture();
const matWood = new THREE.MeshStandardMaterial({ map: woodMap, vertexColors: true, roughness: .86, side: THREE.DoubleSide });
const matTier = new THREE.MeshStandardMaterial({ map: woodMap, color: 0x6e5a48, roughness: .9, side: THREE.DoubleSide });
const matUnder = new THREE.MeshStandardMaterial({ color: 0x2a2019, roughness: 1, side: THREE.DoubleSide });
const matsCloth = SECTORS.map(c => waveMaterial(new THREE.MeshStandardMaterial({ map: clothTexture(c.a, c.b), alphaTest: .5, roughness: .95, side: THREE.DoubleSide }),
  'float w = sin(position.y*.8 + position.x*.35 + uTime*1.5) + .5*sin(position.y*1.9 + position.z*.6 + uTime*2.6);\ntransformed += objectNormal * w * aWave;'));
const matsRoof = SECTORS.map(c => new THREE.MeshStandardMaterial({ map: roofTexture(c.a, c.b), roughness: .9, side: THREE.DoubleSide }));
const matGold = new THREE.MeshStandardMaterial({ color: 0xd7ac55, metalness: 1, roughness: .32 });
const matPennant = waveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }),
  'float u = aWave; float ph = position.x*.9 + position.z*.5 - uTime*5.;\ntransformed.y += sin(ph)*.55*u; transformed.z += cos(ph*.8)*.9*u;');

/* ---------- sky ---------- */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTime, uSun: { value: SUN }, uFog: { value: FOG } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
  fragmentShader: `
    varying vec3 vD; uniform vec3 uSun, uFog; uniform float uTime;
    float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(11.,7.); a*=.5; } return s; }
    void main(){
      vec3 d = normalize(vD);
      float y = max(d.y,0.), sd = max(dot(d,uSun),0.);
      vec3 zen = vec3(.3,.42,.62), mid = vec3(.5,.6,.74), hor = vec3(.74,.78,.83);
      vec3 c = mix(hor, mid, smoothstep(0.,.22,y)); c = mix(c, zen, smoothstep(.12,.8,y));
      c += vec3(.5,.42,.3) * pow(sd,6.) * (1.-smoothstep(0.,.6,y));
      c += vec3(1.5,1.25,.9) * pow(sd,70.);
      c += vec3(9.,6.,3.5) * smoothstep(.9992,.9998,sd);
      vec2 p = d.xz/(y+.13)*1.25 + vec2(uTime*.006,uTime*.002);
      float f = fbm(p), f2 = fbm(p+uSun.xz*.09);
      float cov = smoothstep(.5,.62,f)*smoothstep(.01,.17,y);
      float lit = clamp((f-f2)*4.+.35,0.,1.);
      vec3 cc = mix(vec3(.72,.75,.8), vec3(.95,.95,.96), lit);
      cc += vec3(.9,.72,.46)*pow(sd,5.)*(lit*.9+.12);
      c = mix(c, cc, cov*.93);
      c = mix(c, uFog, 1.-smoothstep(-.02,.045,d.y));
      gl_FragColor = vec4(c,1.);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10; sky.onBeforeRender = () => sky.position.copy(camera.position);
scene.add(sky);
{ // image-based light from the same sky
  const s = new THREE.Scene(); const skyE = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat); s.add(skyE);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(s, .02).texture; scene.environmentIntensity = .75; pm.dispose();
}
const sun = new THREE.DirectionalLight(0xfff4e4, 2.3);
sun.position.copy(SUN).multiplyScalar(400); sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 4096, LITE ? 1024 : 4096);
Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 190, bottom: -170, near: 20, far: 900 });
sun.shadow.bias = -.0003; sun.shadow.normalBias = .25;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x8d8a78, 1.7));

/* ---------- land ---------- */
const CASTLE = { x: -660, z: 880 };
function ground(x, z) {
  const e = Math.hypot(x / 165, z / 120), m = smooth(1.15, 4.6, e);
  const r = 1 - Math.abs(2 * fbm(x * .0019 + 3, z * .0019 + 8, 5) - 1);
  let h = m * (34 * fbm(x * .004, z * .004, 4) + 400 * Math.pow(r, 2.4) * smooth(2.4, 7.5, e)) - .15;
  const lo = Math.hypot((x + 720) / 430, (z - 340) / 760);
  h = lerp(h, -14, smooth(1, .42, lo));
  const cd = ((x - CASTLE.x) ** 2 + (z - CASTLE.z) ** 2) / (230 * 230);
  return h + 120 * Math.exp(-cd);
}
{
  const n = LITE ? 120 : 360, g = new THREE.PlaneGeometry(4200, 4200, n, n); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), nor = g.attributes.normal, c = new THREE.Color(), rock = new THREE.Color(0x4d4845), moss = new THREE.Color(0x3d4f28), heather = new THREE.Color(0x4a3a3e), snow = new THREE.Color(0xc9c8d2), near = new THREE.Color(0x5c7a3c);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), sl = 1 - nor.getY(i), nv = fbm(x * .012, z * .012, 3);
    c.copy(moss).lerp(heather, smooth(.38, .65, nv)).lerp(near, 1 - smooth(1.0, 1.9, Math.hypot(x / 165, z / 120)));
    c.lerp(rock, smooth(.1, .3, sl + (y > 150 ? .08 : 0))); c.lerp(snow, smooth(260, 340, y + nv * 60) * (1 - smooth(.3, .55, sl)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .55 }));
  m.receiveShadow = true; scene.add(m);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b2632, roughness: .12, metalness: .7 }));
  w.position.y = -3.2; scene.add(w);
  // conifers
  const a = new THREE.ConeGeometry(2.6, 9, 6); a.translate(0, 7, 0); const b = new THREE.ConeGeometry(1.9, 7, 6); b.translate(0, 11.5, 0);
  const tr = new THREE.CylinderGeometry(.4, .5, 3, 5); tr.translate(0, 1.5, 0);
  const tree = mergeGeometries([a, b, tr]), N = small ? 1000 : 2000;
  const tm = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, envMapIntensity: .4 }), N);
  const d = new THREE.Object3D(); let placed = 0, guard = 0;
  while (placed < N && guard++ < N * 30) {
    const x = (rnd() - .5) * 2600, z = (rnd() - .5) * 2600, e = Math.hypot(x / 165, z / 120);
    if (e < 2.35 || e > 6 || fbm(x * .006 + 40, z * .006, 3) < .46) continue;
    const y = ground(x, z); if (y < .5 || y > 95) continue;
    const s = .7 + rnd() * 1.1; d.position.set(x, y - .5, z); d.scale.set(s, s * (.9 + rnd() * .5), s); d.rotation.y = rnd() * 6; d.updateMatrix();
    tm.setMatrixAt(placed, d.matrix); tm.setColorAt(placed, c.setRGB(.035 + rnd() * .02, .07 + rnd() * .035, .05)); placed++;
  }
  tm.count = placed; tm.frustumCulled = false; scene.add(tm);
}
// The railway runs from a mountain tunnel across the viaduct to a station joined to the stadium's rim.
function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
const RAIL_Y = 74, STATION = (() => { const rim = ell(Math.PI, WALK_D); return { rimX: rim.x, end: rim.x - 20, length: 92, y: TOP_Y }; })();
const railPath = new THREE.CatmullRomCurve3([V3(-1180, RAIL_Y, 120), V3(-950, RAIL_Y, 300), V3(-720, RAIL_Y, 370), V3(-520, RAIL_Y - 2, 295), V3(STATION.end - 165, STATION.y + 16, 105), V3(STATION.end - STATION.length - 12, STATION.y + 1, 8), V3(STATION.end - STATION.length + 12, STATION.y, 0), V3(STATION.end, STATION.y, 0)], false, 'centripetal');
const railSamples = railPath.getSpacedPoints(160);
const nearRailway = (x, z) => (x > STATION.end - STATION.length - 8 && x < STATION.rimX + 4 && Math.abs(z) < 24) || railSamples.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 13 * 13);
{ // the tournament camp: rows of canvas tents around the ground
  const bell = mergeGeometries([new THREE.CylinderGeometry(2.9, 3.1, 1.7, 10, 1, true).translate(0, .85, 0), new THREE.ConeGeometry(3.45, 3.3, 10).translate(0, 3.3, 0)]);
  const ridgeShape = new THREE.Shape(); ridgeShape.moveTo(-2.3, 0); ridgeShape.lineTo(2.3, 0); ridgeShape.lineTo(0, 2.9); ridgeShape.closePath();
  const ridge = new THREE.ExtrudeGeometry(ridgeShape, { depth: 5.4, bevelEnabled: false }); ridge.translate(0, 0, -2.7);
  const TENT_COLORS = ['#c8322e', '#2456b8', '#1f8a4c', '#e6b422', '#7a3fa8', '#e2702a', '#d9488a', '#1c9aa6', '#e8e2d2', '#8a1f3d', '#3f7fd6', '#6aa82f'];
  const camp = [], fires = [], flags = [];
  for (let k = 0; k < 30; k++) {
    if (k % 5 === 4) continue;                                   // ring roads
    const e = .97 + k * .052, per = 2 * Math.PI * Math.hypot(165 * e, 120 * e) / Math.SQRT2, n = Math.floor(per / 8.6);
    for (let i = 0; i < n; i++) {
      const a = (i + (k % 2) * .5) / n * Math.PI * 2;
      if (Math.abs(Math.sin(a * 7)) < .05) continue;            // radial lanes to the gates
      if (fbm(Math.cos(a) * 3.1 + 9, Math.sin(a) * 3.1 + e * 2.2, 3) < .22 + (e - 1) * .2) continue; // the camp thins towards its edge
      const x = Math.cos(a) * 165 * e + (rnd() - .5) * 2.4, z = Math.sin(a) * 120 * e + (rnd() - .5) * 2.4, y = ground(x, z);
      if (y < .4) continue;
      const roll = rnd();
      if (roll < .045) fires.push([x + 4.4, y + .45, z + 3.2]);
      if (roll > .955) flags.push([x, y, z]);
      if (nearRailway(x, z)) continue;
      camp.push({ x, y, z, big: roll > .985, bell: roll < .52, yaw: -a + Math.PI / 2 + (rnd() - .5) * .3 });
    }
  }
  const put = (geo, list) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true, side: THREE.DoubleSide }), list.length), d = new THREE.Object3D(), c = new THREE.Color();
    list.forEach((t, i) => { const s = (t.big ? 2.4 : .8 + rnd() * .3); d.position.set(t.x, t.y, t.z); d.rotation.y = t.yaw; d.scale.setScalar(s); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, c.set(TENT_COLORS[Math.floor(rnd() * TENT_COLORS.length)]).multiplyScalar(.72 + rnd() * .28)); });
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; scene.add(mesh);
  };
  put(bell, camp.filter(t => t.bell)); put(ridge, camp.filter(t => !t.bell));
  const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(.55, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb066 }), fires.length), fd = new THREE.Object3D();
  fires.forEach((f, i) => { fd.position.set(...f); fd.updateMatrix(); fm.setMatrixAt(i, fd.matrix); }); scene.add(fm);
  const poles = flags.map(([x, y, z]) => tag(new THREE.CylinderGeometry(.07, .1, 12, 5).translate(x, y + 6, z), 0x6b5c49));
  const cloths = flags.map(([x, y, z]) => tag(new THREE.PlaneGeometry(3.6, 1.6).translate(x + 1.8, y + 11, z), TENT_COLORS[Math.floor(rnd() * TENT_COLORS.length)]));
  scene.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 })));
  scene.add(new THREE.Mesh(mergeGeometries(cloths), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide })));
  window.__campCount = camp.length;
}
{
  const g = new THREE.CircleGeometry(1, 192); g.scale(A, B, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: .95, envMapIntensity: .6 }));
  m.position.y = .06; m.receiveShadow = true; scene.add(m);
}
{ // a castle on the crag, far across the water
  const parts = [], Y = ground(CASTLE.x, CASTLE.z) - 2, STONE = 0x8d8f94, SLATE = 0x2d3644, cx = CASTLE.x, cz = CASTLE.z, lights = [];
  const block = (w, h, d, x, z, base = 0, ry = 0) => parts.push(box(w, h, d, cx + x, Y + base + h / 2, cz + z, ry, STONE));
  const gable = (w, h, d, x, y, z) => { const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(w * .71, h, d * .71); g.translate(cx + x, Y + y + h / 2, cz + z); parts.push(tag(g, SLATE)); };
  block(110, 26, 70, 0, 0); block(84, 30, 20, -6, -6, 22); gable(84, 15, 20, -6, 52, -6); block(46, 24, 18, 30, 26, 22); gable(46, 12, 18, 30, 46, 26);
  [[-58, -36, 9, 62], [-58, 36, 8, 48], [58, -36, 10, 74], [58, 36, 8, 56], [0, -44, 7, 58], [24, -14, 8, 92], [-28, 22, 7, 70], [-8, 40, 6, 60], [38, 44, 5, 66], [-44, -8, 5, 84], [76, 4, 6, 46], [-78, 6, 6, 42]].forEach(([x, z, r, h]) => {
    const c = new THREE.CylinderGeometry(r * .92, r, h, 12); c.translate(cx + x, Y + h / 2, cz + z); parts.push(tag(c, STONE));
    const k = new THREE.ConeGeometry(r * 1.2, r * 3.4, 12); k.translate(cx + x, Y + h + r * 1.7, cz + z); parts.push(tag(k, SLATE));
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.28; lights.push([cx + x + Math.sin(a) * r, Y + 30 + rnd() * (h - 34), cz + z + Math.cos(a) * r]); }
  });
  const castleGeo = mergeGeometries(parts); castleGeo.translate(-cx, -Y, -cz);
  const m = new THREE.Mesh(castleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true })); m.position.set(cx, Y, cz); m.scale.setScalar(1.7); scene.add(m);
  const w = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 4.4, 2.4), new THREE.MeshBasicMaterial({ color: 0xffd98c }), lights.length), d = new THREE.Object3D();
  lights.forEach((l, i) => { d.position.set(cx + (l[0] - cx) * 1.7, Y + (l[1] - Y) * 1.7, cz + (l[2] - cz) * 1.7); d.updateMatrix(); w.setMatrixAt(i, d.matrix); }); scene.add(w);
}

/* ---------- the bowl ---------- */
const wood = [], cloth = [[], [], [], []], gold = [], roofs = [[], [], [], []], pennants = [], lanterns = [];
function ribbonBuilder() {
  const pos = [], uv = [], nor = [];
  return {
    quad(a, b, c, d, ua, ub, va, vb, hint) { // a,b along the near edge; c,d the far edge
      const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const n = e1.cross(e2).normalize(); const flip = n.dot(hint) < 0; if (flip) n.negate();
      const tri = flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
      const tuv = flip ? [[ua, va], [ua, vb], [ub, va], [ub, va], [ua, vb], [ub, vb]] : [[ua, va], [ub, va], [ua, vb], [ub, va], [ub, vb], [ua, vb]];
      tri.forEach((p, i) => { pos.push(...p); nor.push(n.x, n.y, n.z); uv.push(...tuv[i]); });
    },
    build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g; }
  };
}
const SEG = 420, TAU = Math.PI * 2;
{
  const tier = ribbonBuilder(), up = new THREE.Vector3(0, 1, 0);
  let arc = 0;
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG * TAU, t1 = (i + 1) / SEG * TAU;
    const P = (t, d, y) => { const e = ell(t, d); return [e.x, y, e.z]; };
    const seg = Math.hypot(ell(t1).x - ell(t0).x, ell(t1).z - ell(t0).z), u0 = arc / 3.2, u1 = (arc + seg) / 3.2; arc += seg;
    const inward = (() => { const e = ell(t0); return new THREE.Vector3(-e.nx, 0, -e.nz); })();
    for (let r = 0; r < ROWS; r++) {
      const d0 = r * TREAD, d1 = (r + 1) * TREAD, y = rowY(r), y1 = rowY(r + 1);
      tier.quad(P(t0, d0, y), P(t1, d0, y), P(t0, d1, y), P(t1, d1, y), u0, u1, 0, .25, up);
      tier.quad(P(t0, d1, y), P(t1, d1, y), P(t0, d1, y1), P(t1, d1, y1), u0, u1, .25, .3, inward);
    }
    tier.quad(P(t0, RIM_D, TOP_Y), P(t1, RIM_D, TOP_Y), P(t0, WALK_D, TOP_Y), P(t1, WALK_D, TOP_Y), u0, u1, 0, .75, up);
  }
  const tierM = new THREE.Mesh(tier.build(), matTier); tierM.receiveShadow = tierM.castShadow = true; scene.add(tierM);
  const under = ribbonBuilder();
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG * TAU, t1 = (i + 1) / SEG * TAU, P = (t, d, y) => { const e = ell(t, d); return [e.x, y, e.z]; };
    under.quad(P(t0, 0, BASE_Y - .25), P(t1, 0, BASE_Y - .25), P(t0, WALK_D, TOP_Y - .3), P(t1, WALK_D, TOP_Y - .3), 0, 1, 0, 1, new THREE.Vector3(0, -1, 0));
  }
  const um = new THREE.Mesh(under.build(), matUnder); um.castShadow = true; scene.add(um);
  // trestle under the seating
  const n = 120, ds = [.2, 3, 9, 15, 21, 27, 33, WALK_D - .4], LAST = ds.length - 1;
  const yAt = d => lerp(BASE_Y - .3, TOP_Y - .3, d / WALK_D);
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU, t2 = (i + 1) / n * TAU;
    ds.forEach((d, j) => {
      const e = ell(t, d), e2 = ell(t2, d);
      wood.push(beam([e.x, 0, e.z], [e.x, yAt(d), e.z], .5, WOOD));
      if (j % 2 === 0 || j === LAST) [5.6, 11.5].forEach(by => wood.push(beam([e.x, by, e.z], [e2.x, by, e2.z], .3, WOOD_D)));
      if (j === 0) wood.push(beam([e.x, 0, e.z], [e2.x, 11.5, e2.z], .2, WOOD_D), beam([e2.x, 0, e2.z], [e.x, 11.5, e.z], .2, WOOD_D));
      if (j === LAST) {
        const h = yAt(d);
        wood.push(beam([e.x, 0, e.z], [e2.x, h * .55, e2.z], .24, WOOD_D), beam([e2.x, 0, e2.z], [e.x, h * .55, e.z], .24, WOOD_D));
        wood.push(beam([e.x, h * .55, e.z], [e2.x, h, e2.z], .22, WOOD_D), beam([e2.x, h * .55, e2.z], [e.x, h, e.z], .22, WOOD_D));
        wood.push(beam([e.x, h * .55, e.z], [e2.x, h * .55, e2.z], .3, WOOD_D));
      }
    });
    // rim rail
    const a = ell(t, WALK_D), b = ell(t2, WALK_D);
    wood.push(beam([a.x, TOP_Y, a.z], [a.x, TOP_Y + 1.25, a.z], .16, WOOD_D));
    wood.push(beam([a.x, TOP_Y + 1.2, a.z], [b.x, TOP_Y + 1.2, b.z], .14, WOOD_D));
    wood.push(beam([a.x, TOP_Y + .62, a.z], [b.x, TOP_Y + .62, b.z], .1, WOOD_D));
    if (i % 3 === 0) lanterns.push([a.x, TOP_Y + 1.55, a.z, .22]);
  }
}

/* painted barrier round the pitch: the arena name repeats along it */
const [wallC, wallX] = canvas(4096, 512);
const wallT = tex(wallC, { repeat: true });
let arenaName = '', teamName = '';
function paintWall() {
  const x = wallX, W = 4096, H = 512;
  x.fillStyle = '#2b2b2e'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#8f8b82'; x.fillRect(0, 36, W, 8); x.fillRect(0, H - 44, W, 8);
  for (let i = 0; i < 32; i++) { x.fillStyle = i % 2 ? '#d9d3c4' : '#6d6a64'; x.fillRect(i * W / 32, H - 36, W / 32, 36); x.fillRect(i * W / 32, 0, W / 32, 36); }
  for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * .022})`; x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 30, 1); }
  x.fillStyle = arenaName ? '#d6ae5c' : 'rgba(214,174,92,.42)';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const text = arenaName ? arenaName.toUpperCase() : '?';
  let fs = 250; do { x.font = `900 ${fs}px "Cinzel Decorative",Georgia,serif`; fs -= 6; } while (x.measureText(text).width > W * .42 && fs > 40);
  x.fillText(text, W / 4, H / 2 + 10);
  // blank board in every second panel: the space reserved for future ads
  x.fillStyle = '#d9d0ba'; x.fillRect(W / 2 + 34, 70, W / 2 - 68, H - 140);
  x.strokeStyle = '#8f8b82'; x.lineWidth = 10; x.strokeRect(W / 2 + 34, 70, W / 2 - 68, H - 140);
  wallT.needsUpdate = true;
}
const adBoards = [], adBack = new THREE.MeshStandardMaterial({ color: 0x20252f, roughness: .85 }), adFront = (() => {
  const [c, x] = canvas(512, 468); x.fillStyle = '#e4dcc8'; x.fillRect(0, 0, 512, 468); x.lineWidth = 18; x.strokeStyle = '#a97c2e'; x.strokeRect(9, 9, 494, 450);
  x.fillStyle = '#8f8775'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 74px "Cinzel Decorative",Georgia,serif'; ['YOUR', 'AD', 'HERE'].forEach((l, i) => x.fillText(l, 256, 234 + (i - 1) * 92));
  return new THREE.MeshStandardMaterial({ map: tex(c), roughness: .78 });
})();
{
  const g = ribbonBuilder(); let arc = 0; const tiles = 8; let per = 0;
  for (let i = 0; i < SEG; i++) per += Math.hypot(ell((i + 1) / SEG * TAU).x - ell(i / SEG * TAU).x, ell((i + 1) / SEG * TAU).z - ell(i / SEG * TAU).z);
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG * TAU, t1 = (i + 1) / SEG * TAU, a = ell(t0, -.3), b = ell(t1, -.3);
    const s = Math.hypot(b.x - a.x, b.z - a.z), u0 = arc / per * tiles, u1 = (arc + s) / per * tiles; arc += s;
    g.quad([a.x, BASE_Y - 6, a.z], [b.x, BASE_Y - 6, b.z], [a.x, BASE_Y + 1, a.z], [b.x, BASE_Y + 1, b.z], u0, u1, 0, 1, new THREE.Vector3(-a.nx, 0, -a.nz));
    if (i % 12 === 0) lanterns.push([a.x, BASE_Y + 1.4, a.z, .2]);
  }
  const m = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ map: wallT, roughness: .92, side: THREE.DoubleSide }));
  m.castShadow = m.receiveShadow = true; scene.add(m);
  // advertising boards under the barrier, evenly spaced and all the same size
  const N = 900, arcs = [0]; for (let i = 0; i < N; i++) { const p = ell(i / N * TAU, -.7), o = ell((i + 1) / N * TAU, -.7); arcs.push(arcs[i] + Math.hypot(o.x - p.x, o.z - p.z)); }
  const AD_W = 8.6, AD_H = Math.min(8.2, BASE_Y - 7.4), count = Math.floor(arcs[N] / (AD_W + .8));
  for (let k = 0; k < count; k++) {
    const want = (k + .5) / count * arcs[N]; let i = 0; while (i < N && arcs[i] < want) i++;
    const dr = ell(i / N * TAU, -.7), board = new THREE.Mesh(new THREE.BoxGeometry(AD_W, AD_H, .24), [adBack, adBack, adBack, adBack, adFront, adBack]);
    board.position.set(dr.x, BASE_Y - 6.2 - AD_H / 2, dr.z); board.rotation.y = Math.atan2(-dr.nx, -dr.nz); board.castShadow = board.receiveShadow = true; scene.add(board); adBoards.push(board);
  }
}

/* ---------- 29,000 stand seats, exactly ---------- */
const SECTIONS = 24, GAP = 1.5, sx = new Float32Array(TOTAL), sy = new Float32Array(TOTAL), sz = new Float32Array(TOTAL), syaw = new Float32Array(TOTAL), sSec = new Int16Array(TOTAL), sRow = new Int16Array(TOTAL), sNum = new Int16Array(TOTAL);
{
  // section boundaries, equal arc on the inner edge
  const tab = [0]; const S = 2000; for (let i = 0; i < S; i++) { const a = ell(i / S * TAU), b = ell((i + 1) / S * TAU); tab.push(tab[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const bounds = []; for (let s = 0; s <= SECTIONS; s++) { const tgt = s / SECTIONS * tab[S]; let j = 0; while (j < S && tab[j] < tgt) j++; bounds.push(j / S * TAU); }
  const lens = [], lines = [];
  for (let r = 0; r < ROWS; r++) {
    lens[r] = []; lines[r] = [];
    for (let s = 0; s < SECTIONS; s++) {
      const pts = [], cum = [0]; const m = 44;
      for (let k = 0; k <= m; k++) { const e = ell(lerp(bounds[s], bounds[s + 1], k / m), rowD(r)); pts.push(e); if (k) cum.push(cum[k - 1] + Math.hypot(e.x - pts[k - 1].x, e.z - pts[k - 1].z)); }
      lens[r][s] = cum[m]; lines[r][s] = { pts, cum };
    }
  }
  const countAt = w => { let c = 0; for (let r = 0; r < ROWS; r++) for (let s = 0; s < SECTIONS; s++) c += Math.floor((lens[r][s] - GAP) / w); return c; };
  let lo = .45, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; countAt(m) >= STAND_SEATS ? lo = m : hi = m; }
  const w = lo, counts = lens.map(rr => rr.map(l => Math.floor((l - GAP) / w)));
  let excess = countAt(w) - STAND_SEATS, rr = ROWS - 1, ss = 0;
  while (excess > 0) { counts[rr][ss]--; excess--; ss = (ss + 1) % SECTIONS; if (!ss) rr = rr ? rr - 1 : ROWS - 1; }
  let id = 0;
  for (let r = 0; r < ROWS; r++) for (let s = 0; s < SECTIONS; s++) {
    const n = counts[r][s], { pts, cum } = lines[r][s], L = cum[cum.length - 1], usable = L - GAP; let k = 0;
    for (let q = 0; q < n; q++) {
      const a = GAP / 2 + (q + .5) / n * usable; while (k < cum.length - 2 && cum[k + 1] < a) k++;
      const f = (a - cum[k]) / (cum[k + 1] - cum[k]), p = pts[k], o = pts[k + 1];
      const x = lerp(p.x, o.x, f), z = lerp(p.z, o.z, f), nx = lerp(p.nx, o.nx, f), nz = lerp(p.nz, o.nz, f);
      sx[id] = x; sy[id] = rowY(r); sz[id] = z; syaw[id] = Math.atan2(-nx, -nz); sSec[id] = s + 1; sRow[id] = r + 1; sNum[id] = q + 1; id++;
    }
  }
  if (id !== STAND_SEATS) console.error('stand seat count', id);
}

/* ---------- 20 towers with 1,000 VIP seats ---------- */
const towers = [];
{
  const tab = [0], S = 4000; for (let i = 0; i < S; i++) { const a = ell(-Math.PI / 2 + i / S * TAU, TOWER_D), b = ell(-Math.PI / 2 + (i + 1) / S * TAU, TOWER_D); tab.push(tab[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const SLOTS = 22; let vip = STAND_SEATS, tIdx = 0;
  const tOf = sl => { const tgt = sl / SLOTS * tab[S]; let j = 0; while (j < S && tab[j] < tgt) j++; return -Math.PI / 2 + j / S * TAU; };
  for (let sl = 0; sl < SLOTS; sl++) {
    const tm = tOf(sl), mid = tOf(sl + .5), rimA = ell(lerp(tm, mid, .5), WALK_D + .3), rimB = ell(mid + (mid - tm) * .5, WALK_D + .3);
    [rimA, rimB].forEach(r => { // long banners on the outside of the rim
      const g = new THREE.PlaneGeometry(6.2, 18, 1, 10); g.rotateY(Math.atan2(r.nx, r.nz)); g.translate(r.x, TOP_Y - 9, r.z);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i));
      cloth[sectorOf(r.x, r.z)].push(tag(g, 0xffffff, (u, v) => (1 - v) * .55));
    });
    if (sl === 0 || sl === 11) continue;  // leave room for the two name boards
    const e = ell(tm, TOWER_D), cx = e.x, cz = e.z, out = Math.atan2(e.nx, e.nz), inw = out + Math.PI;
    towers.push({ x: cx, z: cz, inw, t: tm, id: tIdx++ }); const sec = sectorOf(cx, cz);
    const pr = y => lerp(7.6, 5.6, y / (44 + TL)), P = (k, y) => { const a = k / 8 * TAU + .39; return [cx + Math.sin(a) * pr(y), y, cz + Math.cos(a) * pr(y)]; };
    for (let k = 0; k < 8; k++) {
      wood.push(beam(P(k, 0), P(k, 44 + TL), .55, WOOD));
      for (let y = 0; y < 28 + TL; y += 7) {
        wood.push(beam(P(k, y), P(k + 1, y + 7), .2, WOOD_D), beam(P(k + 1, y), P(k, y + 7), .2, WOOD_D));
        wood.push(beam(P(k, y + 7), P(k + 1, y + 7), .28, WOOD_D));
      }
    }
    { const g = new THREE.CylinderGeometry(6, 6, 16, 16, 1, true); g.translate(cx, 34 + TL, cz); wood.push(tag(g, WOOD_D)); }
    [30 + TL, 37 + TL].forEach(y => {
      const g = new THREE.CylinderGeometry(9.3, 9.3, .4, 28, 1, false, inw - 1.5, 3); g.translate(cx, y, cz); wood.push(tag(g, WOOD));
      const n = 15; for (let k = 0; k <= n; k++) {
        const a = inw - 1.5 + k / n * 3, a2 = inw - 1.5 + (k + 1) / n * 3, px = cx + Math.sin(a) * 9.1, pz = cz + Math.cos(a) * 9.1;
        wood.push(beam([px, y, pz], [px, y + 1.1, pz], .1, WOOD_D));
        if (k < n) gold.push(beam([px, y + 1.1, pz], [cx + Math.sin(a2) * 9.1, y + 1.1, cz + Math.cos(a2) * 9.1], .09, 0xffffff));
      }
      lanterns.push([cx + Math.sin(inw - 1.5) * 9.1, y + 1.5, cz + Math.cos(inw - 1.5) * 9.1, .2], [cx + Math.sin(inw + 1.5) * 9.1, y + 1.5, cz + Math.cos(inw + 1.5) * 9.1, .2]);
      for (let j = 0; j < 25; j++) { // 25 seats a level x 2 levels x 20 towers
        const a = inw + (j - 12) * (Math.PI * .84 / 24);
        sx[vip] = cx + Math.sin(a) * 7.8; sy[vip] = y + .2; sz[vip] = cz + Math.cos(a) * 7.8; syaw[vip] = a; sSec[vip] = -(tIdx); sRow[vip] = y === 30 + TL ? 1 : 2; sNum[vip] = j + 1; vip++;
      }
    });
    wood.push(box(5, .4, 10, cx - e.nx * 8.5, TOP_Y - .1, cz - e.nz * 8.5, out, WOOD)); // bridge from the rim walkway
    // fabric: skirt behind the boxes, crown above them
    const fold = (g, n, amp) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z) + Math.sin(a * n) * amp; p.setX(i, Math.sin(a) * r); p.setZ(i, Math.cos(a) * r); } g.computeVertexNormals(); };
    { const g = new THREE.CylinderGeometry(6.5, 7.4, 17, 44, 8, true, out - 1.85, 3.7); fold(g, 22, .16); g.translate(cx, 33 + TL, cz); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 5); cloth[sec].push(tag(g, 0xffffff, (u, v) => (1 - v) * .34)); }
    { const g = new THREE.CylinderGeometry(9.9, 9.5, 12.5, 72, 7, true); fold(g, 36, .2); g.translate(cx, 45.8 + TL, cz); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 12); cloth[sec].push(tag(g, 0xffffff, (u, v) => (1 - v) * .3)); }
    { const pts = [[10.3, 51.6], [8, 54.5], [5.4, 59], [3, 65], [1.2, 71.5], [.14, 79]].map(p => new THREE.Vector2(p[0], p[1])); const g = new THREE.LatheGeometry(pts, 24); g.translate(cx, TL, cz); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 12); roofs[sec].push(tag(g, 0xffffff)); }
    { const g = new THREE.CylinderGeometry(.07, .12, 11, 6); g.translate(cx, 84 + TL, cz); gold.push(tag(g, 0xffffff)); const s = new THREE.SphereGeometry(.42, 12, 8); s.translate(cx, 89.8 + TL, cz); gold.push(tag(s, 0xffffff)); }
    { // pennant streaming downwind, blank until there is a team
      const g = new THREE.PlaneGeometry(13, 3.4, 18, 2), p = g.attributes.position; g.translate(6.5, 0, 0);
      for (let i = 0; i < p.count; i++) { const f = p.getX(i) / 13; p.setY(i, p.getY(i) * (1 - f * .94)); }
      g.computeVertexNormals(); const pl = g.attributes.position, w = new Float32Array(pl.count); for (let i = 0; i < pl.count; i++) w[i] = pl.getX(i) / 13;
      g.translate(cx, 86.6 + TL, cz); g.setAttribute('aWave', new THREE.BufferAttribute(w, 1)); g.deleteAttribute('uv');
      { tempC.set(SECTORS[sec].flag); const ca = new Float32Array(pl.count * 3); for (let i = 0; i < pl.count; i++) ca.set([tempC.r, tempC.g, tempC.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); }
      pennants.push(g);
    }
  }
  if (vip !== TOTAL) console.error('vip seat count', vip);
}

/* ---------- name boards ---------- */
const [signC, signX] = canvas(2048, 624);
const signT = tex(signC);
function paintSign() {
  const x = signX, W = 2048, H = 624;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2c2c30'); g.addColorStop(1, '#1b1b1e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(0, i * 24, W, 2); }
  x.strokeStyle = '#c99f4b'; x.lineWidth = 12; x.strokeRect(26, 26, W - 52, H - 52); x.lineWidth = 3; x.strokeRect(48, 48, W - 96, H - 96);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const grad = x.createLinearGradient(0, 90, 0, 520); grad.addColorStop(0, '#ffe7a4'); grad.addColorStop(.5, '#e0b254'); grad.addColorStop(1, '#a4772b');
  if (arenaName) {
    const t = arenaName.toUpperCase(); let fs = 300;
    do { x.font = `900 ${fs}px "Cinzel Decorative",Georgia,serif`; fs -= 6; } while (x.measureText(t).width > W - 190 && fs > 40);
    x.fillStyle = grad; x.shadowColor = 'rgba(255,190,90,.5)'; x.shadowBlur = 32; x.fillText(t, W / 2, teamName ? H / 2 - 34 : H / 2 + 8); x.shadowBlur = 0;
    if (teamName) { x.font = '400 64px "IM Fell English SC",Georgia,serif'; x.fillStyle = '#e7dcc2'; x.fillText(`home of ${teamName}`, W / 2, H - 104); }
  } else {
    x.font = '900 400px "Cinzel Decorative",Georgia,serif'; x.fillStyle = grad; x.shadowColor = 'rgba(255,190,90,.5)'; x.shadowBlur = 36; x.fillText('?', W / 2, H / 2 - 42); x.shadowBlur = 0;
    x.font = '400 50px "IM Fell English SC",Georgia,serif'; x.fillStyle = '#e7dcc2'; x.fillText('the most liked comment names this arena', W / 2, H - 96);
  }
  signT.needsUpdate = true;
}
const SIGN_W = 46, SIGN_H = 14, SIGN_Y = TOP_Y + 15, SIGN_Z = B + WALK_D + 1.4;
const signLight = new THREE.PointLight(0xffc27a, 0, 90, 1.6); signLight.position.set(0, SIGN_Y - 2, -SIGN_Z + 9); scene.add(signLight);
const signMat = new THREE.MeshStandardMaterial({ map: signT, emissiveMap: signT, emissive: 0xffffff, emissiveIntensity: .62, roughness: .7 });
[-1, 1].forEach(s => {
  const z = s * SIGN_Z, ry = s < 0 ? 0 : Math.PI, dir = -s;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), signMat); face.position.set(0, SIGN_Y, z + dir * .36); face.rotation.y = ry; scene.add(face);
  const rear = new THREE.Mesh(face.geometry, signMat); rear.position.set(0, SIGN_Y, z - dir * .36); rear.rotation.y = ry + Math.PI; scene.add(rear);
  wood.push(box(SIGN_W + 1.4, SIGN_H + 1.4, .6, 0, SIGN_Y, z, 0, WOOD_D));
  [-1, 1].forEach(q => {
    wood.push(beam([q * (SIGN_W / 2 + .2), 0, z], [q * (SIGN_W / 2 + .2), SIGN_Y + SIGN_H / 2 + 3, z], 1, WOOD));
    gold.push(tag(new THREE.SphereGeometry(.6, 12, 8).translate(q * (SIGN_W / 2 + .2), SIGN_Y + SIGN_H / 2 + 3.5, z), 0xffffff));
  });
  for (let k = 0; k < 5; k++) { const x0 = lerp(-SIGN_W / 2, SIGN_W / 2, k / 5), x1 = lerp(-SIGN_W / 2, SIGN_W / 2, (k + 1) / 5); wood.push(beam([x0, TOP_Y, z], [x1, SIGN_Y - 7, z], .34, WOOD_D), beam([x1, TOP_Y, z], [x0, SIGN_Y - 7, z], .34, WOOD_D)); }
  for (let k = 0; k <= 6; k++) lanterns.push([lerp(-SIGN_W / 2 + 2, SIGN_W / 2 - 2, k / 6), SIGN_Y + SIGN_H / 2 + 1.1, z + dir * .4, .24]);
});

/* ---------- The First 100 boards, on the two sides without a name board ---------- */
// Raised above the tower crowns on two central posts, so no tower balcony loses its view.
const F100_W = 30, F100_H = 14, F100_X = A + WALK_D - 5, F100_Y = 45.8 + TL + 6.25 + F100_H / 2 + 2;
const [f100C, f100X] = canvas(2048, 956), f100T = tex(f100C);
let first100Names = [];
function paintFirst100(highlight = '') {
  const x = f100X, W = 2048, H = 956, COLS = 20, ROWS_ = 5, names = first100Names;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2c2c30'); g.addColorStop(1, '#1b1b1e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#c99f4b'; x.lineWidth = 12; x.strokeRect(26, 26, W - 52, H - 52); x.lineWidth = 3; x.strokeRect(48, 48, W - 96, H - 96);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const grad = x.createLinearGradient(0, 70, 0, 230); grad.addColorStop(0, '#ffe7a4'); grad.addColorStop(.5, '#e0b254'); grad.addColorStop(1, '#a4772b');
  x.font = '900 128px "Cinzel Decorative",Georgia,serif'; x.fillStyle = grad; x.fillText('THE FIRST 100', W / 2, 136);
  x.font = '400 46px "IM Fell English SC",Georgia,serif'; x.fillStyle = '#e7dcc2'; x.fillText(`${names.length} of 100 names on the wall`, W / 2, 232);
  const left = 76, top = 282, cw = (W - left * 2) / COLS, ch = (H - top - 70) / ROWS_;
  for (let i = 0; i < 100; i++) {
    const cx = left + (i % COLS) * cw, cy = top + Math.floor(i / COLS) * ch, name = names[i] || (i === names.length ? highlight : '');
    x.fillStyle = name ? 'rgba(224,178,84,.24)' : 'rgba(255,255,255,.045)'; x.fillRect(cx + 4, cy + 4, cw - 8, ch - 8);
    x.strokeStyle = name ? '#e0b254' : 'rgba(201,159,75,.35)'; x.lineWidth = 2; x.strokeRect(cx + 4, cy + 4, cw - 8, ch - 8);
    if (name) { let fs = 25; x.fillStyle = '#fff4d0'; do { x.font = `600 ${fs}px Georgia,serif`; fs -= 1; } while (x.measureText(name).width > cw - 14 && fs > 9); x.fillText(name, cx + cw / 2, cy + ch / 2); }
    else { x.font = '400 26px Georgia,serif'; x.fillStyle = 'rgba(231,220,194,.28)'; x.fillText(String(i + 1), cx + cw / 2, cy + ch / 2); }
  }
  f100T.needsUpdate = true;
}
const f100Mat = new THREE.MeshStandardMaterial({ map: f100T, emissiveMap: f100T, emissive: 0xffffff, emissiveIntensity: .62, roughness: .7 });
[-1, 1].forEach(s => {
  const x = s * F100_X, inward = -s, ry = s < 0 ? Math.PI / 2 : -Math.PI / 2, rimX = s * (A + WALK_D);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(F100_W, F100_H), f100Mat); face.position.set(x + inward * .36, F100_Y, 0); face.rotation.y = ry; scene.add(face);
  const rear = new THREE.Mesh(face.geometry, f100Mat); rear.position.set(x - inward * .36, F100_Y, 0); rear.rotation.y = ry + Math.PI; scene.add(rear);
  wood.push(box(.6, F100_H + 1.4, F100_W + 1.4, x, F100_Y, 0, 0, WOOD_D));
  [-1, 1].forEach(q => {
    const px = x - inward * 1.05; wood.push(beam([px, TOP_Y - .6, q * 3], [px, F100_Y + 1, q * 3], .9, WOOD), beam([rimX, TOP_Y - .2, q * 3], [px, TOP_Y + 16, q * 3], .5, WOOD), beam([x, F100_Y - F100_H / 2, q * 3], [x, F100_Y - F100_H / 2, q * 12], .4, WOOD), beam([x, F100_Y - F100_H / 2 - 5, q * 3], [x, F100_Y - F100_H / 2, q * 12], .3, WOOD_D));
    gold.push(tag(new THREE.SphereGeometry(.6, 12, 8).translate(x, F100_Y + F100_H / 2 + 1, q * (F100_W / 2 + .7)), 0xffffff));
  });
  for (let k = 0; k <= 5; k++) lanterns.push([x + inward * .4, F100_Y + F100_H / 2 + 1.1, lerp(-F100_W / 2 + 2, F100_W / 2 - 2, k / 5), .24]);
});

/* ---------- hoops ---------- */
[-1, 1].forEach(s => [[-10.5, 31], [0, 39], [10.5, 31]].forEach(([z, h]) => {
  const x = s * 68, R = 4.2;
  gold.push(tag(new THREE.CylinderGeometry(.13, .26, h - R, 12).translate(x, (h - R) / 2, z), 0xffffff));
  gold.push(tag(new THREE.CylinderGeometry(.75, 1.15, .7, 16).translate(x, .35, z), 0xffffff));
  const t = new THREE.TorusGeometry(R, .2, 12, 64); t.rotateY(Math.PI / 2); t.translate(x, h, z); gold.push(tag(t, 0xffffff));
}));

/* ---------- railway viaduct with a steam train, past the camp ---------- */
const trainParts = [];
let railTunnelU = 0, railRunTime = 0;
{
  const stone = [], metal = [], L = railPath.getLength(), SPAN = 30, H = 130, n = Math.floor(L / SPAN);
  const sh = new THREE.Shape(); sh.moveTo(-SPAN / 2, 0); sh.lineTo(SPAN / 2, 0); sh.lineTo(SPAN / 2, H); sh.lineTo(-SPAN / 2, H); sh.closePath();
  const hole = new THREE.Path(), rA = SPAN / 2 - 3.2; hole.moveTo(-rA, 0); hole.lineTo(rA, 0); hole.lineTo(rA, H - 9 - rA); hole.absarc(0, H - 9 - rA, rA, 0, Math.PI, false); hole.lineTo(-rA, 0); sh.holes.push(hole);
  for (let i = 0; i < n; i++) {
    const u = (i + .5) / n, p = railPath.getPointAt(u), tn = railPath.getTangentAt(u), a = Math.atan2(-tn.z, tn.x), pitch = Math.asin(tn.y);
    if (ground(p.x, p.z) > p.y + 1) continue; // inside the mountain
    const g = new THREE.ExtrudeGeometry(sh, { depth: 8, bevelEnabled: false, curveSegments: 10 }); g.translate(0, 0, -4); g.rotateY(a); g.translate(p.x, p.y - H, p.z);
    stone.push(tag(g.toNonIndexed(), 0x9a958a));
    const parapet = new THREE.BoxGeometry(SPAN + .6, 1.1, 9); parapet.rotateZ(pitch); parapet.rotateY(a); parapet.translate(p.x, p.y + .4, p.z); stone.push(tag(parapet.toNonIndexed(), 0x858074));
    [-1, 1].forEach(s => { const r = new THREE.BoxGeometry(SPAN + .6, .22, .22); r.translate(0, 1.2, s * .9); r.rotateZ(pitch); r.rotateY(a); r.translate(p.x, p.y, p.z); metal.push(tag(r.toNonIndexed(), 0x2c2c30)); });
  }
  { // tunnel mouth where the line meets the mountain
    let u = 1; while (u > 0 && ground(railPath.getPointAt(u).x, railPath.getPointAt(u).z) <= railPath.getPointAt(u).y) u -= .002;
    railTunnelU = u;
    const p = railPath.getPointAt(u), tn = railPath.getTangentAt(u), a = Math.atan2(-tn.z, tn.x) + Math.PI / 2, W = 40, Ht = 44, r = 8;
    const face = new THREE.Shape(); face.moveTo(-W / 2, -24); face.lineTo(W / 2, -24); face.lineTo(W / 2, Ht); face.lineTo(-W / 2, Ht); face.closePath();
    const arch = new THREE.Path(); arch.moveTo(-r, 0); arch.lineTo(r, 0); arch.lineTo(r, 10); arch.absarc(0, 10, r, 0, Math.PI, false); arch.lineTo(-r, 0); face.holes.push(arch);
    const fg = new THREE.ExtrudeGeometry(face, { depth: 10, bevelEnabled: false, curveSegments: 14 }); p.addScaledVector(tn, 5); fg.translate(0, 0, -6); fg.rotateY(a); fg.translate(p.x, p.y, p.z); stone.push(tag(fg.toNonIndexed(), 0x7c776c));
    const mouth = new THREE.Shape(); mouth.moveTo(-r, 0); mouth.lineTo(r, 0); mouth.lineTo(r, 10); mouth.absarc(0, 10, r, 0, Math.PI, false); mouth.lineTo(-r, 0);
    const dark = new THREE.ShapeGeometry(mouth, 14); dark.translate(0, 0, 3.8); dark.rotateY(a); dark.translate(p.x, p.y, p.z); stone.push(tag(dark.toNonIndexed(), 0x050507));
  }
  { // the stadium station: platform, canopy, buffer, booking hall and footbridge to the rim
    const { end, length: LEN, y, rimX } = STATION, mid = end - LEN / 2, block = (w, h, d, x, by, z, col, list = stone) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, by + h / 2, z); list.push(tag(b.toNonIndexed(), col)); };
    [-1, 1].forEach(side => {
      block(LEN, 1.3, 7, mid, y, side * 7, 0xa49e91); // platform
      for (let x = end - LEN + SPAN / 2; x < end; x += SPAN) { // the viaduct's arches continue under the platform
        const g = new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: false, curveSegments: 10 }); g.translate(x, y - H, side * 8.5 - 3); stone.push(tag(g.toNonIndexed(), 0x9a958a));
      }
      block(LEN, .4, 7.4, mid, y + 1.3, side * 7, 0x77736a);
      for (let x = end - LEN + 5; x <= end - 2; x += 10) { block(.55, 8, .55, x, y + 1.3, side * 9.8, 0x2b2d33, metal); lanterns.push([x, y + 6.5, side * 9.4, .24]); }
      const roof = new THREE.BoxGeometry(LEN + 2, .5, 13); roof.rotateX(side * .14); roof.translate(mid, y + 10.1, side * 5.2); stone.push(tag(roof.toNonIndexed(), 0x2d3644));
    });
    block(1.6, 3.2, 4.4, end - 1, y + 1, 0, 0x8e1a20, metal); // buffer stop
    block(18, 13, 28, end + 8, y, 0, 0x9a958a); // booking hall
    const hip = new THREE.ConeGeometry(18, 8, 4); hip.rotateY(Math.PI / 4); hip.scale(.72, 1, 1.12); hip.translate(end + 8, y + 17, 0); stone.push(tag(hip.toNonIndexed(), 0x2d3644));
    const bridgeL = rimX - end - 16, bx = end + 16 + bridgeL / 2;
    block(bridgeL + 2, .7, 7, bx, y - .2, 0, 0x6e5a48);
    [-1, 1].forEach(side => block(bridgeL + 2, 1.2, .3, bx, y + .5, side * 3.4, 0xd7ac55, metal));
  }
  const sm = new THREE.Mesh(mergeGeometries(stone), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide })); sm.frustumCulled = false; scene.add(sm);
  const mm = new THREE.Mesh(mergeGeometries(metal), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 })); mm.frustumCulled = false; scene.add(mm);
  const col = hex => new THREE.MeshStandardMaterial({ color: hex, roughness: .55 });
  const red = col(0x8e1a20), blk = col(0x17181c), roof = col(0x2a2c32);
  [0, 1, 2, 3, 4, 5].forEach(c => {
    const g = new THREE.Group();
    if (!c) {
      const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 9, 14), red); boiler.rotation.z = Math.PI / 2; boiler.position.set(1.5, 3.8, 0);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 4.6, 3.8), blk); cab.position.set(-4.4, 4.2, 0);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(.55, .4, 2.2, 10), blk); chim.position.set(4.6, 6.2, 0);
      g.add(boiler, cab, chim);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(13, 3.6, 3.6), red); body.position.y = 3.6;
      const top = new THREE.Mesh(new THREE.BoxGeometry(13.2, .5, 3.9), roof); top.position.y = 5.6;
      g.add(body, top);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(c ? 13 : 13.5, 1.2, 3), blk); base.position.y = 1.6; g.add(base);
    g.userData.back = c ? 9.5 + (c - 1) * 14.5 : 0; scene.add(g); trainParts.push(g);
  });
}
const steam = Array.from({ length: 22 }, (_, i) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, color: 0xf2f2f2, transparent: true, depthWrite: false })); scene.add(m); return { m, i }; });
function updateTrain(t) {
  // Leaves the tunnel, stops at the station, waits, then backs out the way it came.
  const L = railPath.getLength(), sMin = Math.max(95, railTunnelU * L - 20), sMax = L - 3, run = (sMax - sMin) / 19, wait = 16, cycle = 2 * (run + wait), ph = t % cycle;
  const u = ph < run ? ph / run : ph < run + wait ? 1 : ph < 2 * run + wait ? 1 - (ph - run - wait) / run : 0;
  railRunTime = run;
  const headS = lerp(sMin, sMax, u * .7 + u * u * (3 - 2 * u) * .3);
  trainParts.forEach(g => {
    const s = headS - g.userData.back, vis = s > 2 && s < L - 2; g.visible = vis; if (!vis) return;
    const p = railPath.getPointAt(s / L), tn = railPath.getTangentAt(s / L);
    g.position.set(p.x, p.y + 1.1, p.z); g.rotation.order = 'YZX'; g.rotation.set(0, Math.atan2(-tn.z, tn.x), Math.asin(tn.y));
  });
  steam.forEach(({ m, i }) => {
    const age = ((t * .55 + i / steam.length) % 1), s = headS - age * 26 + 3; m.visible = s > 2 && s < L - 2; if (!m.visible) return;
    const p = railPath.getPointAt(s / L); m.position.set(p.x, p.y + 9 + age * 15, p.z); const sc = 2.5 + age * 11; m.scale.set(sc, sc, 1); m.material.opacity = .55 * (1 - age);
  });
}

/* ---------- merge the static world ---------- */
function addMerged(list, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; scene.add(m); return m;
}
addMerged(wood, matWood); cloth.forEach((l, i) => addMerged(l, matsCloth[i])); roofs.forEach((l, i) => addMerged(l, matsRoof[i])); addMerged(gold, matGold); addMerged(pennants, matPennant, false, false);
{
  const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a8, fog: false }), lanterns.length);
  const d = new THREE.Object3D(); lanterns.forEach((l, i) => { d.position.set(l[0], l[1], l[2]); d.scale.setScalar(l[3]); d.updateMatrix(); lm.setMatrixAt(i, d.matrix); }); lm.frustumCulled = false; scene.add(lm);
}

/* ---------- seats ---------- */
const seatGeo = LITE ? mergeGeometries([ // phones: seat pan, its front edge and the backrest, 6 triangles per seat
  new THREE.PlaneGeometry(.48, .42).rotateX(-Math.PI / 2).translate(0, .48, .02),
  new THREE.PlaneGeometry(.48, .08).translate(0, .44, .23),
  new THREE.PlaneGeometry(.48, .56).rotateX(-.1).translate(0, .74, -.17)
].map(g => { g.deleteAttribute('uv'); return g; })) : (() => {
  const a = new THREE.BoxGeometry(.48, .08, .42); a.translate(0, .44, .02);
  const sh = new THREE.Shape(), bw = .24, bh = .56, rr = .09;
  sh.moveTo(-bw, 0); sh.lineTo(bw, 0); sh.lineTo(bw, bh - rr); sh.quadraticCurveTo(bw, bh, bw - rr, bh); sh.lineTo(-bw + rr, bh); sh.quadraticCurveTo(-bw, bh, -bw, bh - rr); sh.closePath();
  const b = new THREE.ExtrudeGeometry(sh, { depth: .07, bevelEnabled: false, curveSegments: 2 }).toNonIndexed(); b.translate(0, 0, -.035); b.rotateX(-.1); b.translate(0, .46, -.2);
  const c = new THREE.BoxGeometry(.12, .42, .24); c.translate(0, .2, -.02); c.deleteAttribute('uv');
  a.deleteAttribute('uv'); b.deleteAttribute('uv');
  return mergeGeometries([a.toNonIndexed(), b, c.toNonIndexed()]);
})();
const seatMat = new THREE.MeshStandardMaterial({ roughness: .82, metalness: 0, envMapIntensity: .45, side: LITE ? THREE.DoubleSide : THREE.FrontSide });
seatMat.onBeforeCompile = s => {
  s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float sGlow = max(vColor.r, max(vColor.g, vColor.b));
    if (sGlow > 1.) { totalEmissiveRadiance += vec3(.46, .27, .025); diffuseColor.rgb = vec3(.8, .47, .05); }`);
};
const seats = new THREE.InstancedMesh(seatGeo, seatMat, TOTAL);
const baseCol = new Float32Array(TOTAL * 3);
{
  const d = new THREE.Object3D();
  for (let i = 0; i < TOTAL; i++) {
    d.position.set(sx[i], sy[i], sz[i]); d.rotation.y = syaw[i]; d.updateMatrix(); seats.setMatrixAt(i, d.matrix);
    const v = .95 + rnd() * .1;
    if (i < STAND_SEATS) { const f = 1, c = SECTORS[sectorOf(sx[i], sz[i])].seat; baseCol.set([c[0] * v * f, c[1] * v * f, c[2] * v * f], i * 3); }
    else baseCol.set([1.9 * v, 1.3 * v, .34 * v], i * 3);
    seats.setColorAt(i, tempC.setRGB(baseCol[i * 3], baseCol[i * 3 + 1], baseCol[i * 3 + 2]));
  }
  seats.instanceMatrix.needsUpdate = true; seats.instanceColor.setUsage(THREE.DynamicDrawUsage);
  seats.castShadow = seats.receiveShadow = true; seats.frustumCulled = false; scene.add(seats);
}
const GLOW = [2.2, 1.35, .36];
function setGlow(i, on) {
  const c = seats.instanceColor.array;
  if (on) { c[i * 3] = GLOW[0]; c[i * 3 + 1] = GLOW[1]; c[i * 3 + 2] = GLOW[2]; }
  else { c[i * 3] = baseCol[i * 3]; c[i * 3 + 1] = baseCol[i * 3 + 1]; c[i * 3 + 2] = baseCol[i * 3 + 2]; }
  seats.instanceColor.needsUpdate = true;
}

/* ---------- people ---------- */
function shade(g, r, gg, b) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([r, gg, b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function limb(a, b, r0, r1, seg) {
  v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = v1.length(); v1.divideScalar(len);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1); q1.setFromUnitVectors(UP, v1); g.applyQuaternion(q1);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
function seatedBody(seg = 7, withRightArm = true) { // origin at the seat's foot, facing +z
  const leg = .16, parts = [
    shade(limb([0, .54, -.1], [0, .98, -.08], .19, .16, seg + 3), 1, 1, 1),
    shade(new THREE.SphereGeometry(.17, seg + 3, seg).translate(0, .98, -.08), 1, 1, 1)
  ];
  [-1, 1].forEach(s => {
    parts.push(shade(limb([s * .1, .55, -.08], [s * .1, .55, .3], .085, .07, seg), leg, leg, leg * 1.2));
    parts.push(shade(limb([s * .1, .55, .3], [s * .1, .08, .34], .065, .05, seg), leg, leg, leg * 1.2));
    parts.push(shade(new THREE.BoxGeometry(.1, .07, .24).translate(s * .1, .035, .4), .09, .07, .06));
    if (s < 0 || withRightArm) {
      parts.push(shade(limb([s * .2, 1, -.08], [s * .2, .72, 0], .055, .05, seg), 1, 1, 1));
      parts.push(shade(limb([s * .2, .72, 0], [s * .15, .62, .22], .05, .04, seg), 1, 1, 1));
    }
  });
  return mergeGeometries(parts);
}
function seatedBodyLite() { // phones: about 90 triangles per person
  const leg = .16, parts = [shade(limb([0, .54, -.1], [0, 1.02, -.08], .18, .15, 5), 1, 1, 1), shade(limb([0, 1, -.08], [0, 1.16, -.06], .06, .05, 3), .8, .62, .5)];
  [-1, 1].forEach(s => {
    parts.push(shade(limb([s * .1, .55, -.08], [s * .1, .55, .3], .08, .07, 3), leg, leg, leg * 1.2));
    parts.push(shade(limb([s * .1, .55, .3], [s * .1, .04, .36], .06, .05, 3), leg, leg, leg * 1.2));
    parts.push(shade(limb([s * .2, 1, -.08], [s * .15, .62, .22], .05, .04, 3), 1, 1, 1));
  });
  return mergeGeometries(parts);
}
function seatedHead(seg = 8) {
  const h = shade(new THREE.SphereGeometry(.125, seg + 2, seg).translate(0, 1.24, -.05), 1, 1, 1);
  const hair = shade(new THREE.SphereGeometry(.132, seg + 2, seg, 0, 6.3, 0, 1.5).translate(0, 1.25, -.065), .22, .17, .15);
  return mergeGeometries([h, hair]);
}
const peopleBody = new THREE.InstancedMesh(LITE ? seatedBodyLite() : seatedBody(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), TOTAL);
const peopleHead = new THREE.InstancedMesh(LITE ? seatedHead(4) : seatedHead(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 }), TOTAL);
peopleBody.count = peopleHead.count = 0;
[peopleBody, peopleHead].forEach(m => { m.frustumCulled = false; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
const CLOTHES = ['#2b3648', '#3b3f46', '#46617f', '#6e2f33', '#2f5140', '#b18a3c', '#d9d6cf', '#8a8d91', '#1f2024', '#9a5634', '#5a4a70', '#31708a', '#b4473d', '#d17a35', '#d8b84c', '#6f8f3a', '#2f8f6b', '#3f8fc0', '#27509c', '#7b5fc0', '#a4478c', '#d9799d', '#efe7d2', '#59402e', '#a58b6c', '#8fb4c8', '#e2a7a0', '#46494f'];
const SKIN = [[.84, .6, .46], [.62, .4, .27], [.33, .19, .11], [.9, .7, .56], [.72, .5, .33]];
function seatPerson(k, seat) {
  const d = new THREE.Object3D(); d.position.set(sx[seat], sy[seat], sz[seat]); d.rotation.y = syaw[seat]; d.updateMatrix();
  peopleBody.setMatrixAt(k, d.matrix); peopleHead.setMatrixAt(k, d.matrix);
  // Each person's look comes from a well-mixed hash of their seat, so no rows or diagonals show up in the crowd.
  const mix = n => { let h = Math.imul(n + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae3d); return (h ^ (h >>> 16)) >>> 0; };
  const r = mix(seat), sk = SKIN[(r >>> 8) % SKIN.length], top = CLOTHES[r % CLOTHES.length], hsl = {};
  tempC.set(top).getHSL(hsl); tempC.setHSL((hsl.h + ((r >>> 12) % 1000 / 1000 - .5) * .05 + 1) % 1, clamp(hsl.s * (.72 + (r >>> 16 & 255) / 255 * .5)), clamp(hsl.l * (.72 + (r >>> 24) / 255 * .56)));
  peopleBody.setColorAt(k, tempC); peopleHead.setColorAt(k, tempC.setRGB(sk[0], sk[1], sk[2]));
  peopleBody.count = peopleHead.count = k + 1;
  peopleBody.instanceMatrix.needsUpdate = peopleHead.instanceMatrix.needsUpdate = true;
  peopleBody.instanceColor.needsUpdate = peopleHead.instanceColor.needsUpdate = true;
}

/* speech-bubble tooltips above people's heads */
function makeTip() {
  const [c, x] = canvas(1024, 300), t = tex(c), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false, toneMapped: false }));
  sp.center.set(.5, 0); sp.renderOrder = 10; sp.visible = false; scene.add(sp);
  return { sp, paint(title, sub) {
    x.clearRect(0, 0, 1024, 300); x.textAlign = 'center'; x.textBaseline = 'middle';
    const fam = '-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif';
    let fs = 118; do { x.font = `700 ${fs}px ${fam}`; fs -= 4; } while (x.measureText(title).width > 900 && fs > 28);
    const tw = x.measureText(title).width; let subW = 0;
    if (sub) { x.font = `500 40px ${fam}`; subW = x.measureText(sub).width; }
    const w = Math.min(1000, Math.max(tw, subW) + 96), l = 512 - w / 2, h = 222;
    x.fillStyle = 'rgba(14,16,24,.95)'; x.beginPath(); x.roundRect(l, 8, w, h, 46); x.moveTo(476, 8 + h); x.lineTo(512, 292); x.lineTo(548, 8 + h); x.closePath(); x.fill();
    x.font = `700 ${fs + 4}px ${fam}`; x.fillStyle = '#ffffff'; x.fillText(title, 512, sub ? 92 : 122);
    if (sub) { x.font = `500 40px ${fam}`; x.fillStyle = '#c9cede'; x.fillText(sub, 512, 182); }
    t.needsUpdate = true;
  } };
}
const focusTip = makeTip();
const seatLight = new THREE.PointLight(0xffd9a0, 0, 7, 1.7); scene.add(seatLight);
let focused = -1;
function showSeat(i, name, sub) {
  focused = i; focusTip.paint(name, sub);
  const s = Math.sin(syaw[i]), c = Math.cos(syaw[i]);
  focusTip.sp.position.set(sx[i], sy[i] + 1.5, sz[i]); focusTip.sp.visible = true;
  seatLight.position.set(sx[i] + s * .8, sy[i] + 1.5, sz[i] + c * .8); seatLight.intensity = .9;
}
function hideSeat() { focused = -1; focusTip.sp.visible = false; seatLight.intensity = 0; }
function sizeTips() {
  [focusTip].forEach(({ sp }) => { if (!sp.visible) return; const d = camera.position.distanceTo(sp.position), w = Math.max(1.05, d * (camera.aspect < 1 ? .34 : .2)); sp.scale.set(w, w * 300 / 1024, 1); });
}

/* ---------- atmosphere ---------- */
const uv1 = (() => { const [c, x] = canvas(128, 128), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return tex(c); })();
steam.forEach(({ m }) => { m.material.map = uv1; m.material.needsUpdate = true; });

/* the snitch keeps the empty stadium alive */
const snitch = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd778, metalness: 1, roughness: .25, emissive: 0xffa630, emissiveIntensity: 2.2 })); snitch.add(body);
  const wm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2, 1.6), transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false });
  const wg = new THREE.PlaneGeometry(1.15, .34); wg.translate(.6, 0, 0);
  const l = new THREE.Mesh(wg, wm), r = new THREE.Mesh(wg, wm); r.rotation.y = Math.PI; snitch.add(l, r); snitch.userData = { l, r }; scene.add(snitch);
}
function updateSnitch(t) {
  const a = t * .42, b = t * 1.07, c = t * .71;
  const px = Math.sin(a) * 58 + Math.sin(b * 1.9) * 7, py = 24 + Math.sin(c) * 10 + Math.sin(b * 2.7) * 2.2, pz = Math.cos(a * 1.3) * 26 + Math.cos(b * 1.5) * 5;
  snitch.lookAt(px, py, pz); snitch.position.set(px, py, pz);
  const f = Math.sin(t * 58) * .7; snitch.userData.l.rotation.z = f; snitch.userData.r.rotation.z = f;
}

/* players on brooms, plus the balls */
const PLAYERS = 14, pitch = new THREE.Group(); scene.add(pitch);
const riderGeo = mergeGeometries([
  shade(limb([0, .55, -.25], [0, 1.05, .25], .17, .14, 7), 1, 1, 1),
  shade(limb([-.16, .98, .15], [-.1, .55, .72], .05, .04, 5), 1, 1, 1), shade(limb([.16, .98, .15], [.1, .55, .72], .05, .04, 5), 1, 1, 1),
  shade(limb([-.14, .5, -.25], [-.2, .3, .15], .08, .06, 5), 1, 1, 1), shade(limb([.14, .5, -.25], [.2, .3, .15], .08, .06, 5), 1, 1, 1),
  shade(limb([-.2, .3, .15], [-.16, .02, -.2], .06, .05, 5), .18, .15, .13), shade(limb([.2, .3, .15], [.16, .02, -.2], .06, .05, 5), .18, .15, .13)
]);
const broomGeo = mergeGeometries([
  shade(limb([0, .45, -1.1], [0, .55, 1.5], .035, .028, 6), .3, .17, .08),
  shade(new THREE.ConeGeometry(.2, 1, 8).rotateX(-Math.PI / 2).translate(0, .43, -1.5), .55, .42, .2),
  shade(new THREE.SphereGeometry(.13, 10, 8).translate(0, 1.22, .34), .78, .55, .42)
]);
const riders = new THREE.InstancedMesh(riderGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), PLAYERS);
const brooms = new THREE.InstancedMesh(broomGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), PLAYERS);
riders.frustumCulled = brooms.frustumCulled = false; pitch.add(riders, brooms);
for (let i = 0; i < PLAYERS; i++) riders.setColorAt(i, tempC.set(i % 2 ? '#ece6d8' : '#4a4a50'));
const quaffle = new THREE.Mesh(new THREE.SphereGeometry(.42, 14, 10), new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: .7 }));
const bludgers = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(.34, 14, 10), new THREE.MeshStandardMaterial({ color: 0x17181c, metalness: .7, roughness: .4 })));
pitch.add(quaffle, ...bludgers);
const flyPath = (i, t) => {
  const ph = i * 1.71, wide = i < 2 ? .25 : 1, baseX = i < 2 ? (i ? 68 : -68) : 0;
  return [baseX + (Math.sin(t + ph) * 56 + Math.sin(t * 2.3 + ph * 2) * 11) * wide, 13 + (i % 5) * 4.5 + Math.sin(t * 1.7 + ph) * 5, (Math.cos(t * .83 + ph) * 25 + Math.cos(t * 1.9 + ph) * 6) * wide];
};
const pd = new THREE.Object3D();
function updatePlayers(T) {
  if (!pitch.visible) return;
  for (let i = 0; i < PLAYERS; i++) {
    const t = T * (.3 + (i % 4) * .035), a = flyPath(i, t), b = flyPath(i, t + .05);
    pd.position.set(a[0], a[1], a[2]); pd.lookAt(b[0], b[1], b[2]); pd.rotateZ(clamp((b[0] - a[0]) * .05, -.5, .5)); pd.scale.setScalar(1.25); pd.updateMatrix();
    riders.setMatrixAt(i, pd.matrix); brooms.setMatrixAt(i, pd.matrix);
  }
  riders.instanceMatrix.needsUpdate = brooms.instanceMatrix.needsUpdate = true;
  const q = flyPath(2, T * .365); quaffle.position.set(q[0] + 1.4, q[1] + 1.6, q[2] + 1);
  bludgers.forEach((m, k) => { const p = flyPath(5 + k * 4, T * (.6 + k * .1)); m.position.set(p[0], p[1] + Math.sin(T * 3 + k) * 3, p[2]); });
}

/* sparks for the unveil and for a newly claimed seat */
const SP = 900, spP = new Float32Array(SP * 3), spV = new Float32Array(SP * 3), spL = new Float32Array(SP); let spI = 0;
const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spP, 3));
spP.fill(-999);
const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ map: uv1, color: 0xffd778, size: .75, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sparks.frustumCulled = false; scene.add(sparks);
function burst(x, y, z, n, spread, power) {
  for (let k = 0; k < n; k++) {
    const i = spI = (spI + 1) % SP; spP[i * 3] = x + (rnd() - .5) * spread; spP[i * 3 + 1] = y + (rnd() - .5) * spread * .3; spP[i * 3 + 2] = z + (rnd() - .5) * 2;
    spV[i * 3] = (rnd() - .5) * power; spV[i * 3 + 1] = rnd() * power * 1.05; spV[i * 3 + 2] = (rnd() - .25) * power; spL[i] = 1.2 + rnd() * 1.6;
  }
}
function updateSparks(dt) {
  for (let i = 0; i < SP; i++) {
    if (spL[i] <= 0) continue; spL[i] -= dt;
    if (spL[i] <= 0) { spP[i * 3 + 1] = -999; continue; }
    spV[i * 3 + 1] -= 9 * dt; spP[i * 3] += spV[i * 3] * dt; spP[i * 3 + 1] += spV[i * 3 + 1] * dt; spP[i * 3 + 2] += spV[i * 3 + 2] * dt;
  }
  spGeo.attributes.position.needsUpdate = true;
}

/* ---------- post ---------- */
let composer = null;
if (!LITE) {
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .3, .35, 2)); // only very bright things bloom: the golden user and the sun
composer.addPass(new OutputPass());
}
/* ---------- camera ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = 1.2; controls.maxDistance = 900; controls.maxPolarAngle = Math.PI * .497;
controls.autoRotate = !reduced; controls.autoRotateSpeed = .22;
const HOME = { p: new THREE.Vector3(232, 148, -268), t: new THREE.Vector3(-6, 8, 6) };
camera.position.copy(HOME.p); controls.target.copy(HOME.t);
renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });
let baseFov = 42, vertical = false;
function applyFov(f) { baseFov = f; camera.fov = camera.aspect < 1 ? Math.min(f * 1.45, 80) : f; camera.updateProjectionMatrix(); }
function resize() {
  const W = innerWidth, H = innerHeight; let w = W, h = H;
  if (vertical) { h = H; w = Math.round(H * 9 / 16); if (w > W) { w = W; h = Math.round(W * 16 / 9); } }
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  renderer.setSize(w, h); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  camera.aspect = w / h; applyFov(baseFov);
}
addEventListener('resize', resize);

let flight = null;
function flyTo(p, t, dur = 2.4) {
  if (reduced) dur = .01;
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), u: 0, dur };
  controls.enabled = false; controls.autoRotate = false;
}
function flyToSeat(i) {
  const s = Math.sin(syaw[i]), c = Math.cos(syaw[i]);
  const tgt = new THREE.Vector3(sx[i], sy[i] + .85, sz[i]);
  if (i >= STAND_SEATS) { // tower seats: approach from the pitch side, where nothing blocks the view
    const inw = towers[-sSec[i] - 1].inw;
    flyTo(new THREE.Vector3(sx[i] + Math.sin(inw) * 8.5, sy[i] + 2.6, sz[i] + Math.cos(inw) * 8.5), tgt);
    return;
  }
  flyTo(new THREE.Vector3(sx[i] + s * 4.6, sy[i] + 2.5, sz[i] + c * 4.6), tgt);
}


/* ---------- fixed reference seat ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let hero = 0; { const e = ell(-Math.PI / 2 + .3, rowD(13)); let best = 1e9; for (let i = 0; i < STAND_SEATS; i++) { if (sRow[i] !== 14) continue; const d = (sx[i] - e.x) ** 2 + (sz[i] - e.z) ** 2; if (d < best) { best = d; hero = i; } } }
const ease = u => lerp(u, u * u * (3 - 2 * u), .62);

/* ---------- followers and seats ---------- */
const dataFile = await fetch('data/followers.json').then(r => { if (!r.ok) throw new Error('followers ' + r.status); return r.json(); }).catch(e => {
  document.body.insertAdjacentHTML('beforeend', '<div id="err">The seat list could not load. Please refresh the page.</div>'); throw e;
});
const FOLLOWERS = dataFile.followers;
first100Names = dataFile.first100 || [];
const CUSTOM_FIGURES = { reesekgoodwin: buildReese };
const owners = new Map(), seatByHandle = new Map();
const standFillOrder = buildFillOrder(sSec, sRow, sNum, STAND_SEATS, hero);
const seatFor = order => seatForOrder(order, standFillOrder);
const handle = n => '@' + n;
function seatLabel(i) { return labelFor(i >= STAND_SEATS ? { vip: true, tower: -sSec[i], box: sRow[i], seat: sNum[i] } : { vip: false, section: sSec[i], row: sRow[i], seat: sNum[i] }); }
FOLLOWERS.forEach((name, order) => {
  const seat = seatFor(order); seatPerson(order, seat); owners.set(seat, name); seatByHandle.set(name.toLowerCase(), seat);
  const custom = CUSTOM_FIGURES[name];
  if (custom) { // this follower has their own model, so the generic person is hidden
    const hid = new THREE.Matrix4().makeScale(0, 0, 0); peopleBody.setMatrixAt(order, hid); peopleHead.setMatrixAt(order, hid);
    const f = custom(); f.position.set(sx[seat], sy[seat], sz[seat]); f.rotation.y = syaw[seat]; scene.add(f);
  }
});
peopleBody.instanceMatrix.needsUpdate = peopleHead.instanceMatrix.needsUpdate = true;

let onSelect = () => {};
function openSeat(i) {
  const name = owners.get(i), title = name ? handle(name) : 'Empty seat', label = seatLabel(i);
  showSeat(i, title, label); flyToSeat(i); onSelect({ handle: name || null, title, label });
}

/* ---------- tap a seat ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera); const hit = ray.intersectObject(seats, false)[0];
  if (hit) openSeat(hit.instanceId); else { hideSeat(); onSelect(null); }
});

/* ---------- loop ---------- */
const clock = new THREE.Clock(); let T = 0;
function step(dt) {
  T += dt; uTime.value = T;
  updateSnitch(T); updateSparks(dt); updatePlayers(T); updateTrain(T); sizeTips();
  if (flight) {
    flight.u += dt / flight.dur; const k = ease(clamp(flight.u)), kk = k * k * (3 - 2 * k);
    camera.position.lerpVectors(flight.p0, flight.p1, kk); controls.target.lerpVectors(flight.t0, flight.t1, kk); camera.lookAt(controls.target);
    if (flight.u >= 1) { flight = null; controls.enabled = true; }
  } else controls.update();
}
function frameLoop() {
  requestAnimationFrame(frameLoop); const dt = Math.min(clock.getDelta(), .05); step(dt);
  if (composer) composer.render(dt); else renderer.render(scene, camera);
}

/* ---------- boot ---------- */
try {
  await Promise.race([
    Promise.all(['900 120px "Cinzel Decorative"', '400 40px "IM Fell English SC"', '400 40px "IM Fell English"'].map(f => document.fonts.load(f, 'ARENA?'))),
    new Promise(r => setTimeout(r, 2500))
  ]);
} catch (e) { }
teamName = dataFile.team || ''; setArena(dataFile.arena || '');
function setArena(n) { arenaName = n; paintSign(); paintWall(); paintFirst100(); }
resize(); renderer.shadowMap.needsUpdate = true; frameLoop();

export const site = {
  handles: FOLLOWERS, totalSeats: TOTAL, lite: LITE,
  seatOf: h => seatByHandle.get(h.toLowerCase()),
  seatLabel,
  focusHandle(h) { const s = seatByHandle.get(h.toLowerCase()); if (s === undefined) return false; openSeat(s); return true; },
  clear() { hideSeat(); onSelect(null); },
  onSelect(fn) { onSelect = fn; },
  stats: () => ({ ...renderer.info.render, lite: LITE, pixelRatio: renderer.getPixelRatio() }),
  scene,
  debug: { ground, camera, controls, railPath, setTime: t => { T = t; }, railRunTime: () => railRunTime }
};
