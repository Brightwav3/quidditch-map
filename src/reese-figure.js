import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- geometry helpers ---------- */
const V = (a) => new THREE.Vector3(...a);
const asFn = (r) => typeof r === 'function' ? r : () => r;
// Sweeps an ellipse along a path. rx lies along the side direction, ry along the surface normal.
function sweep(points, { rx, ry = rx, hint = [0, 0, 1], seg = 16, steps = 32, caps = true }) {
  const curve = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
  const rxF = asFn(rx), ryF = asFn(ry), H = V(hint).normalize();
  const pos = [], uv = [], idx = [], side = new THREE.Vector3(), nor = new THREE.Vector3(), T = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; curve.getPoint(t, P); curve.getTangent(t, T);
    side.crossVectors(T, H); if (side.lengthSq() < 1e-5) side.set(1, 0, 0); side.normalize(); nor.crossVectors(side, T).normalize();
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a) * rxF(t), s = Math.sin(a) * ryF(t);
      pos.push(P.x + side.x * c + nor.x * s, P.y + side.y * c + nor.y * s, P.z + side.z * c + nor.z * s); uv.push(j / seg, t);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < steps; i++) for (let j = 0; j < seg; j++) { const a = i * row + j, b = a + row; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  if (caps) [[0, 0, false], [steps, 1, true]].forEach(([r, t, flip]) => {
    curve.getPoint(t, P); const c = pos.length / 3; pos.push(P.x, P.y, P.z); uv.push(.5, t);
    for (let j = 0; j < seg; j++) { const a = r * row + j; flip ? idx.push(a + 1, a, c) : idx.push(a, a + 1, c); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// Lofts horizontal rings. `start`/`len` leave the front open for the robe.
function loft(rings, { seg = 48, sub = 8, start = 0, len = Math.PI * 2, wave = 0, waves = 0 } = {}) {
  const lerp = (k, t) => { const n = rings.length - 1, f = Math.min(t * n, n - 1e-4), i = Math.floor(f), u = f - i, s = u * u * (3 - 2 * u); return (rings[i][k] ?? 0) * (1 - s) + (rings[i + 1][k] ?? 0) * s; };
  const pos = [], uv = [], idx = [], steps = (rings.length - 1) * sub;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, y = lerp('y', t), z = lerp('z', t), x = lerp('x', t), rx = lerp('rx', t), rz = lerp('rz', t);
    for (let j = 0; j <= seg; j++) {
      const a = start + j / seg * len, w = 1 + wave * (1 - t) * Math.sin(a * waves);
      pos.push(x + Math.sin(a) * rx * w, y, z + Math.cos(a) * rz * w); uv.push(j / seg, t);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < steps; i++) for (let j = 0; j < seg; j++) { const a = i * row + j, b = a + row; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const ball = (p, s, seg = 28) => new THREE.SphereGeometry(1, seg, Math.round(seg * .75)).scale(s[0], s[1], s[2]).translate(p[0], p[1], p[2]);
const colored = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

/* ---------- textures ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } return t;
}
function bumpTex(w, h, draw, repeat) { const t = canvasTex(w, h, draw, repeat); t.colorSpace = THREE.NoColorSpace; return t; }
const GREEN = '#0f4a30', SILVER = '#b9bfc4';
const speckle = (x, w, h, n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * a})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const scarfTex = canvasTex(128, 1024, (x, w, h) => {
  x.fillStyle = GREEN; x.fillRect(0, 0, w, h);
  for (let y = 40; y < h; y += 170) { x.fillStyle = SILVER; x.fillRect(0, y, w, 34); x.fillRect(0, y + 58, w, 34); }
  for (let y = 0; y < h; y += 4) { x.fillStyle = 'rgba(0,0,0,.13)'; x.fillRect(0, y, w, 1); }
  for (let i = 0; i < w; i += 6) { x.fillStyle = 'rgba(0,0,0,.1)'; x.fillRect(i, 0, 2, h); }
});
const tieTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = GREEN; x.fillRect(0, 0, w, h); x.strokeStyle = SILVER; x.lineWidth = 22;
  for (let i = -h; i < w + h; i += 86) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
}, [1.5, 3]);
const knitBump = bumpTex(128, 128, (x, w, h) => {
  x.fillStyle = '#777'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 8) { x.fillStyle = '#c8c8c8'; x.fillRect(i, 0, 3, h); }
  for (let j = 0; j < h; j += 8) { x.fillStyle = 'rgba(30,30,30,.45)'; x.fillRect(0, j, w, 2); }
}, [12, 12]);
const woolBump = bumpTex(256, 256, (x, w, h) => { x.fillStyle = '#888'; x.fillRect(0, 0, w, h); speckle(x, w, h, 7000, .25); }, [6, 6]);
const crestTex = canvasTex(256, 300, (x) => {
  const shield = () => { x.beginPath(); x.moveTo(28, 26); x.lineTo(228, 26); x.lineTo(228, 165); x.quadraticCurveTo(222, 240, 128, 284); x.quadraticCurveTo(34, 240, 28, 165); x.closePath(); };
  x.clearRect(0, 0, 256, 300); shield(); x.fillStyle = '#0d4029'; x.fill(); x.lineWidth = 15; x.strokeStyle = '#c7cdd2'; x.stroke();
  x.strokeStyle = '#d8dde1'; x.lineWidth = 19; x.lineCap = 'round'; x.beginPath(); x.moveTo(166, 72); x.bezierCurveTo(88, 42, 62, 102, 124, 128); x.bezierCurveTo(188, 150, 178, 224, 96, 212); x.stroke();
  x.fillStyle = '#d8dde1'; x.beginPath(); x.ellipse(176, 76, 28, 18, .2, 0, 7); x.fill(); x.fillStyle = '#0d4029'; x.beginPath(); x.arc(180, 72, 3.8, 0, 7); x.fill();
});

/* ---------- materials: ordinary cloth and skin, nothing emissive ---------- */
const std = (o) => new THREE.MeshStandardMaterial({ roughness: .86, metalness: 0, ...o });
const M = {
  skin: std({ color: 0xe6bba2, roughness: .58 }),
  hair: std({ vertexColors: true, roughness: .5, metalness: .03 }),
  shirt: std({ color: 0xeeece6, roughness: .8 }),
  sweater: std({ color: 0x70757b, bumpMap: knitBump, bumpScale: .9 }),
  trousers: std({ color: 0x565a60, bumpMap: woolBump, bumpScale: .4 }),
  robe: std({ color: 0x2a2d33, bumpMap: woolBump, bumpScale: .55, roughness: .92 }),
  lining: std({ color: 0x0f5b39, roughness: .48, side: THREE.DoubleSide }),
  scarf: std({ map: scarfTex, bumpMap: knitBump, bumpScale: .75, roughness: .94 }),
  tie: std({ map: tieTex, roughness: .55 }),
  green: std({ color: 0x0f5535, roughness: .75 }), silver: std({ color: 0xaeb4b9, roughness: .72 }),
  metal: std({ color: 0xc2c7cb, metalness: .95, roughness: .28 }),
  shoe: std({ color: 0x08080a, roughness: .28 }), sole: std({ color: 0x151412, roughness: .7 }),
  seat: std({ color: 0xa97c2e, roughness: .62 }),
  crest: std({ map: crestTex, transparent: true, alphaTest: .4, roughness: .78 })
};

/* ---------- Reese ---------- */
// Origin at the foot of her seat, facing +z, matching the stadium's seats.
export function buildReese() {
  const root = new THREE.Group(); root.name = 'reese';
  let layer = 'base'; const layers = { base: [], scarf: [], robe: [], hat: [] };
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); layers[layer].push(mesh); return mesh; };

  // faceless head and neck
  add(ball([0, 1.215, -.02], [.087, .114, .098], 40), M.skin);
  add(sweep([[0, 1.02, -.03], [0, 1.08, -.03], [0, 1.15, -.025]], { rx: .043, seg: 20, steps: 8 }), M.skin);

  // sweater, with knit hem at the waist
  add(loft([{ y: .5, z: -.02, rx: .15, rz: .12 }, { y: .6, z: -.02, rx: .155, rz: .122 }, { y: .72, z: -.025, rx: .125, rz: .095 }, { y: .85, z: -.03, rx: .13, rz: .096 }, { y: .97, z: -.035, rx: .152, rz: .086 }, { y: 1.025, z: -.035, rx: .1, rz: .068 }, { y: 1.055, z: -.03, rx: .05, rz: .05 }]), M.sweater);
  add(loft([{ y: .6, z: -.02, rx: .158, rz: .126 }, { y: .645, z: -.021, rx: .146, rz: .112 }]), M.green);

  // shirt front and collar inside the sweater's V-neck
  const shirt = new THREE.Shape(); shirt.moveTo(-.058, 1.05); shirt.lineTo(.058, 1.05); shirt.lineTo(0, .83); shirt.closePath();
  const shirtG = new THREE.ShapeGeometry(shirt); shirtG.rotateX(-.08); shirtG.translate(0, .09, .071); add(shirtG, M.shirt);
  [-1, 1].forEach(s => {
    const c = new THREE.Shape(); c.moveTo(s * .005, 1.052); c.lineTo(s * .062, 1.06); c.lineTo(s * .052, 1.0); c.closePath();
    const g = new THREE.ExtrudeGeometry(c, { depth: .004, bevelEnabled: false }); g.rotateX(-.08); g.translate(0, .088, .073); add(g, M.shirt);
    // silver and green trim along the V-neck
    const a = [s * .063, 1.03, .067], b = [s * .004, .842, .08];
    add(sweep([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .077], b], { rx: .007, ry: .0035, hint: [0, 0, 1], seg: 8, steps: 12 }), M.green);
    const off = s * .01; add(sweep([[a[0] + off, a[1], .066], [(a[0] + b[0]) / 2 + off, (a[1] + b[1]) / 2, .075], [b[0] + off * .8, b[1] - .006, .078]], { rx: .0035, ry: .0025, hint: [0, 0, 1], seg: 8, steps: 12 }), M.silver);
  });

  // striped tie
  add(sweep([[0, 1.018, .083], [0, .95, .078], [0, .845, .083]], { rx: t => .015 + t * .018, ry: .0035, hint: [0, 0, 1], seg: 12, steps: 14 }), M.tie);
  add(ball([0, 1.022, .083], [.021, .018, .012], 16), M.tie);

  // trousers
  [-1, 1].forEach(s => {
    add(sweep([[s * .082, .57, -.04], [s * .092, .565, .13], [s * .096, .56, .34]], { rx: t => .088 - t * .025, ry: t => .083 - t * .022, hint: [0, 1, 0], seg: 24, steps: 18 }), M.trousers);
    add(ball([s * .096, .552, .345], [.059, .058, .058], 22), M.trousers);
    add(sweep([[s * .096, .55, .345], [s * .098, .32, .36], [s * .098, .1, .37]], { rx: t => .058 - t * .012, hint: [0, 0, 1], seg: 22, steps: 18 }), M.trousers);
    // polished shoes
    add(sweep([[s * .098, .055, .33], [s * .098, .058, .39], [s * .098, .048, .46], [s * .098, .035, .51]], { rx: t => .045 + Math.sin(t * 3.14) * .008 - t * .008, ry: t => .043 - t * .019, hint: [0, 1, 0], seg: 20, steps: 18 }), M.shoe);
    add(sweep([[s * .098, .008, .325], [s * .098, .008, .39], [s * .098, .008, .46], [s * .098, .008, .515]], { rx: t => .044 + Math.sin(t * 3.14) * .008 - t * .012, ry: .008, hint: [0, 1, 0], seg: 18, steps: 18 }), M.sole);
    for (let i = 0; i < 3; i++) add(sweep([[s * .07, .083 - i * .009, .4 + i * .021], [s * .098, .087 - i * .009, .406 + i * .021], [s * .126, .083 - i * .009, .4 + i * .021]], { rx: .0024, seg: 6, steps: 6 }), M.sole);
  });

  // sweater sleeves under the robe, seen when the robe is off
  [-1, 1].forEach(s => { add(sweep([[s * .155, .99, -.04], [s * .195, .74, -.025], [s * .135, .625, .2]], { rx: t => .047 - t * .012, hint: [s, 0, .3], seg: 16, steps: 18 }), M.sweater); add(ball([s * .155, .99, -.04], [.05, .05, .055], 16), M.sweater); });

  // black robe: shoulders and back, open at the front
  layer = 'robe';
  add(loft([{ y: .54, z: -.024, rx: .205, rz: .155 }, { y: .65, z: -.024, rx: .182, rz: .136 }, { y: .8, z: -.03, rx: .158, rz: .112 }, { y: .95, z: -.035, rx: .178, rz: .11 }, { y: 1.018, z: -.035, rx: .165, rz: .1 }, { y: 1.062, z: -.03, rx: .062, rz: .06 }], { start: Math.PI / 6.2, len: Math.PI * 2 - Math.PI / 3.1, wave: .025, waves: 9 }), M.robe);

  // emerald-lined robe panels falling over the lap
  [-1, 1].forEach(s => {
    layer = 'robe';
    const lap = [[s * .112, .66, .11], [s * .158, .595, .24], [s * .172, .575, .36], [s * .178, .44, .41], [s * .185, .24, .425]];
    add(sweep(lap, { rx: t => .046 + t * .018, ry: .007, hint: [0, .7, .7], seg: 14, steps: 34 }), M.robe);
    add(sweep(lap.map(p => [p[0] + s * .002, p[1] - .006, p[2] - .004]), { rx: t => .05 + t * .019, ry: .004, hint: [0, .7, .7], seg: 14, steps: 34 }), M.lining);
    // robe facing up the chest
    add(sweep([[s * .067, 1.05, .018], [s * .08, .96, .075], [s * .092, .82, .087], [s * .108, .68, .116]], { rx: .02, ry: .006, hint: [s * .08, 0, 1], seg: 12, steps: 24 }), M.lining);
    // side drape over the seat
    const drape = [[s * .19, .6, -.05], [s * .25, .42, -.04], [s * .262, .24, -.02]];
    add(sweep(drape, { rx: t => .082 + t * .012, ry: .009, hint: [s, 0, 0], seg: 14, steps: 22 }), M.robe);
    add(sweep(drape.map(p => [p[0] - s * .01, p[1], p[2]]), { rx: t => .086 + t * .012, ry: .004, hint: [s, 0, 0], seg: 14, steps: 22 }), M.lining);

    // wide sleeves, lined cuff, shirt cuff and hand
    const shoulder = [s * .17, 1, -.04], elbow = [s * .205, .74, -.025], wrist = [s * .138, .625, .2];
    add(sweep([shoulder, elbow, wrist], { rx: t => .056 + t * .015, hint: [s, 0, .3], seg: 24, steps: 30, caps: false }), M.robe);
    add(ball([shoulder[0] * .97, shoulder[1] + .004, shoulder[2]], [.058, .058, .068], 22), M.robe);
    const dir = new THREE.Vector3(wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]).normalize();
    const cuff = new THREE.TorusGeometry(.07, .0065, 10, 36); cuff.lookAt(dir); cuff.translate(...wrist); add(cuff, M.lining);
    const inner = new THREE.CircleGeometry(.068, 28); inner.lookAt(dir); inner.translate(...wrist); add(inner, M.lining);
    layer = 'base';
    const palm = [s * .112, .585, .285];
    add(sweep([wrist, [s * .125, .603, .232], [s * .114, .594, .262]], { rx: .03, ry: .026, hint: [0, 1, 0], seg: 12, steps: 8 }), M.shirt);
    add(sweep([[s * .122, .6, .235], palm], { rx: .022, ry: .017, hint: [0, 1, 0], seg: 12, steps: 6 }), M.skin);
    add(ball(palm, [.031, .016, .035], 16), M.skin);
    for (let f = 0; f < 4; f++) {
      const dx = (f - 1.5) * .0135;
      add(sweep([[palm[0] + dx, palm[1] + .002, palm[2] + .022], [palm[0] + dx * 1.1, palm[1] - .001, palm[2] + .048], [palm[0] + dx * 1.15, palm[1] - .011, palm[2] + .068 - Math.abs(f - 1.5) * .004]], { rx: .0062, seg: 8, steps: 8 }), M.skin);
    }
    add(sweep([[palm[0] - s * .02, palm[1] + .002, palm[2] - .004], [palm[0] - s * .034, palm[1] - .002, palm[2] + .022], [palm[0] - s * .033, palm[1] - .007, palm[2] + .043]], { rx: .007, seg: 8, steps: 8 }), M.skin);
  });

  // folded hood at the back of the neck
  layer = 'robe';
  add(sweep([[-.105, 1.04, -.08], [-.075, 1.015, -.155], [0, 1.0, -.185], [.075, 1.015, -.155], [.105, 1.04, -.08]], { rx: .04, ry: .02, hint: [0, 1, 0], seg: 16, steps: 32 }), M.robe);
  add(sweep([[-.085, 1.058, -.075], [-.06, 1.038, -.135], [0, 1.026, -.162], [.06, 1.038, -.135], [.085, 1.058, -.075]], { rx: .021, ry: .009, hint: [0, 1, 0], seg: 12, steps: 32 }), M.lining);

  layer = 'scarf';
  // knitted scarf: neck wrap, front tail with fringe, tail thrown over her right shoulder
  const scarfLoop = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; scarfLoop.push([Math.sin(a) * .08, 1.072 + Math.sin(a * 2) * .005, -.028 + Math.cos(a) * .078]); }
  const loopG = sweep(scarfLoop, { rx: .032, ry: .023, hint: [0, 1, 0], seg: 18, steps: 84, caps: false }); loopG.attributes.uv.array.forEach((_, i, a) => { if (i % 2 === 1) a[i] *= .75; }); add(loopG, M.scarf);
  const lower = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; lower.push([Math.sin(a) * .086, 1.043, -.03 + Math.cos(a) * .083]); }
  add(sweep(lower, { rx: .032, ry: .018, hint: [0, 1, 0], seg: 16, steps: 84, caps: false }), M.scarf);
  const tail = [[-.055, 1.056, .05], [-.072, .96, .092], [-.076, .84, .101], [-.082, .72, .112], [-.09, .64, .17], [-.098, .612, .245]];
  add(sweep(tail, { rx: .045, ry: .008, hint: [0, .35, 1], seg: 12, steps: 42 }), M.scarf);
  for (let i = 0; i < 9; i++) { const dx = (i - 4) * .0098; add(sweep([[-.098 + dx, .612, .245], [-.1 + dx, .606, .265], [-.102 + dx, .596, .282]], { rx: .0028, seg: 6, steps: 6 }), i % 2 ? M.green : M.silver); }
  add(sweep([[-.075, 1.058, -.07], [-.15, 1.03, -.1], [-.16, .92, -.14], [-.155, .8, -.145]], { rx: .043, ry: .008, hint: [-1, .3, -.5], seg: 12, steps: 26 }), M.scarf);

  // sewn crest and silver robe clasps
  layer = 'robe';
  const crest = new THREE.PlaneGeometry(.082, .096); crest.rotateX(-.04); crest.rotateY(.28); crest.translate(.128, .875, .11); add(crest, M.crest);
  [-1, 1].forEach(s => { const c = new THREE.TorusGeometry(.0085, .0023, 8, 18); c.translate(s * .071, .966, .083); add(c, M.metal); });

  // pointed wizard hat, only shown on request
  layer = 'hat';
  add(loft([{ y: 1.29, z: -.03, rx: .19, rz: .2 }, { y: 1.3, z: -.03, rx: .115, rz: .125 }, { y: 1.42, z: -.04, rx: .075, rz: .08 }, { y: 1.54, z: -.06, rx: .035, rz: .038 }, { y: 1.64, z: -.09, rx: .004, rz: .004 }], { seg: 32 }), M.robe);
  add(loft([{ y: 1.3, z: -.03, rx: .118, rz: .128 }, { y: 1.335, z: -.03, rx: .108, rz: .117 }], { seg: 32 }), M.green);

  layer = 'base';
  // blonde hair: dome, then long strands falling either side of the bare face
  const GOLDS = [new THREE.Color(0xa77f3f), new THREE.Color(0xb88f4c), new THREE.Color(0x96702f), new THREE.Color(0xc39b58), new THREE.Color(0x85622b)];
  const cap = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * .62); cap.scale(.094, .118, .1); cap.translate(0, 1.232, -.047);
  add(colored(cap, GOLDS[2]), M.hair);
  const strands = [], yTop = 1.337, cz = -.02, R = .092, Rz = .103; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  [-1, 1].forEach(s => {
    for (let i = 0; i < 64; i++) {
      const u = i / 63, a = .86 + u * (Math.PI - .86) + (rnd() - .5) * .03, sn = Math.sin(a), cs = Math.cos(a), j = rnd() - .5, front = cs > .05, hz = cz - .03 * Math.max(0, -cs);
      const tipY = front ? .88 + rnd() * .07 : .9 + rnd() * .06;
      const shoulderX = s * (R * 1.2 * sn + .018 + rnd() * .012), shoulderZ = front ? .045 + cs * .035 : cz + cs * .15;
      const pts = [
        [s * .004, yTop - u * .012, cz + (.04 - u * .11)],
        [s * sn * R * .9, 1.302 - u * .004, hz + cs * Rz * .9],
        [s * sn * R * 1.09, 1.225, hz + cs * Rz * 1.08],
        [s * sn * R * 1.17 + j * .004, 1.12, hz + cs * Rz * 1.12 + (front ? .012 : 0)],
        [shoulderX, 1.015, shoulderZ],
        [shoulderX * (1.03 + j * .08), tipY + .07, shoulderZ + (front ? .022 : 0)],
        [shoulderX * (.97 + j * .16), tipY, shoulderZ + (front ? .03 : 0) + j * .012]
      ];
      const w = .011 + rnd() * .005;
      strands.push(colored(sweep(pts, { rx: t => w * (1 - t * t * .78), ry: t => .0045 * (1 - t * t * .65), hint: [s * sn, .15, cs], seg: 6, steps: 28 }), GOLDS[Math.floor(rnd() * GOLDS.length)]));
    }
  });
  add(mergeGeometries(strands), M.hair);
  // Stages used by the reel: 0 sweater, 1 scarf, 2 robe, 3 hat.
  root.setLook = stage => { layers.scarf.forEach(m => { m.visible = stage >= 1; }); layers.robe.forEach(m => { m.visible = stage >= 2; }); layers.hat.forEach(m => { m.visible = stage >= 3; }); };
  root.outfitLayers = layers;
  root.setLook(2);
  return root;
}

