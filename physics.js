// ドローカーレース — コース生成と物理（DOM に依存しない。Node でもブラウザでも動く）
(function (root) {
'use strict';

// ---------- 定数 ----------
const TSTEP = 2;          // 地形サンプル間隔（ワールド px）
const DT = 1 / 240;       // 物理ステップ
const G = 1400;           // 重力
const T = 4;              // 線の太さ（半径）
const M_PT = 1;           // 1点の質量
const E = 0.05;           // 反発係数
const MU = 1.0;           // 摩擦係数
const POWER = 1.8;        // モータートルク = POWER × 全体重 × タイヤ半径
const WMAX = 8;           // タイヤの回転上限（rad/s）
const TUNNEL_H = 68;      // トンネルの天井高（地面から）
const MUD_DRAG = 7;       // 泥の抵抗（1/s）
const START_X = 140;
const SCALE = 0.56;       // パッド座標 → ワールド座標
const PAD_W = 300, PAD_H = 180;
const MAX_WHEEL_R = 68;   // タイヤの最大半径（パッド座標）
const CHASSIS_CENTER = { x: 150, y: 100 };
const AXLES = { rear: { x: 96, y: 122 }, front: { x: 204, y: 122 } };
// 車体の輪郭（パッド座標・時計回り・閉じる）
const CHASSIS = [
  { x: 60, y: 122 }, { x: 60, y: 96 }, { x: 78, y: 88 }, { x: 110, y: 84 }, { x: 128, y: 58 },
  { x: 188, y: 58 }, { x: 208, y: 84 }, { x: 236, y: 92 }, { x: 240, y: 122 },
];

// ---------- コース定義 ----------
const COURSES = [
  { name: 'はらっぱ', sky: ['#7fc8ff', '#dff4ff'], ground: '#58b26b', dirt: '#8a5a3a',
    sections: [
      ['hills', { len: 700, amp: 36 }], ['bumps', { len: 400, amp: 8 }], ['pits', { n: 2, w: 60, d: 28, gap: 120 }],
      ['wave', { len: 500, dh: 80 }], ['stairs', { n: 3, h: 30, gap: 110 }], ['tunnel', { len: 300 }], ['hills', { len: 500, amp: 30 }],
    ] },
  { name: 'とうげ', sky: ['#ff9a5c', '#ffe1b8'], ground: '#9ab55a', dirt: '#6e4a2e',
    sections: [
      ['bumps', { len: 300, amp: 10 }], ['hurdles', { n: 3, h: 22, w: 12, gap: 90 }], ['sawtooth', { n: 4, len: 90, h: 40 }],
      ['ice', { len: 500, dh: -120 }], ['stairs', { n: 4, h: 34, gap: 90 }], ['bigpit', { w: 100, d: 55 }], ['tunnel', { len: 300 }],
      ['cliff', { dh: 120 }], ['wall', { h: 50 }], ['steep', { len: 220, dh: -100 }],
    ] },
  { name: 'まよなか', sky: ['#1c2350', '#4a4f8f'], ground: '#4f7f8f', dirt: '#2f2a3f', dark: true,
    sections: [
      ['wave', { len: 600, dh: 90 }], ['mud', { len: 400 }], ['sawtooth', { n: 5, len: 80, h: 45 }], ['belt', { len: 420, speed: -180 }],
      ['pits', { n: 3, w: 65, d: 30, gap: 110 }], ['tunnel', { len: 360 }], ['hurdles', { n: 4, h: 26, w: 12, gap: 80 }], ['wall', { h: 50 }],
      ['steep', { len: 200, dh: -110 }], ['cliff', { dh: 140 }], ['stairs', { n: 4, h: 36, gap: 90 }], ['ice', { len: 400, dh: -100 }], ['wall', { h: 50 }],
    ] },
];
const LABELS = { flat: 'たいら', hills: 'おか', bumps: 'でこぼこ', stairs: 'かいだん', wave: 'おおなみ', pits: 'みぞ',
  bigpit: 'おおみぞ', hurdles: 'ハードル', sawtooth: 'のこぎり', ice: 'こおり', cliff: 'がけ', steep: 'きゅうざか',
  mud: 'どろ', belt: 'ベルト', wall: 'かべ', tunnel: 'トンネル' };

function buildCourse(def) {
  const H = [], SF = [], SECTIONS = [], TUNNELS = [];
  let y = 0;
  const push = (yy, sf) => { H.push(yy); SF.push(sf || null); };
  const seg = (len, f, sf) => { const n = Math.max(1, Math.round(len / TSTEP)), y0 = y; for (let i = 1; i <= n; i++) { y = y0 + f(i / n); push(y, sf); } };
  const flat = (len, sf) => seg(len, () => 0, sf);
  const vert = dy => { y += dy; push(y); };
  const hump = (amp, cycles) => t => -amp * (1 - Math.cos(2 * Math.PI * t * cycles)) / 2;
  push(0);
  flat(300);
  for (const [type, p] of def.sections) {
    const from = H.length * TSTEP;
    switch (type) {
      case 'flat': flat(p.len); break;
      case 'hills': seg(p.len, hump(p.amp, Math.max(1, Math.round(p.len / 300)))); break;
      case 'bumps': seg(p.len, hump(p.amp, Math.round(p.len / 36))); break;
      case 'stairs': for (let k = 0; k < p.n; k++) { flat(p.gap); vert(-p.h); } flat(80); break;
      case 'pits': for (let k = 0; k < p.n; k++) { flat(p.gap); vert(p.d); flat(p.w); vert(-p.d); } flat(60); break;
      case 'bigpit': flat(80); vert(p.d); flat(p.w); vert(-p.d); flat(60); break;
      case 'wave': seg(p.len, hump(p.dh, 1)); break;
      case 'sawtooth': for (let k = 0; k < p.n; k++) { seg(p.len, t => -p.h * t); vert(p.h); } flat(60); break;
      case 'hurdles': for (let k = 0; k < p.n; k++) { flat(p.gap); vert(-p.h); flat(p.w); vert(p.h); } flat(60); break;
      case 'cliff': flat(80); vert(p.dh); flat(140); break;
      case 'steep': seg(p.len, t => p.dh * t); flat(60); break;
      case 'ice': seg(p.len, t => p.dh * t, { mu: 0.3, ice: true }); flat(60); break;
      case 'mud': flat(p.len, { mud: true }); flat(60); break;
      case 'belt': flat(p.len, { belt: p.speed }); flat(60); break;
      case 'wall': flat(60); vert(-p.h); flat(100); break;
      case 'tunnel': { flat(40); const x0 = H.length * TSTEP, yc = y - TUNNEL_H; flat(p.len); const x1 = H.length * TSTEP;
        TUNNELS.push({ x0, x1, yc, poly: [{ x: x0, y: yc - 400 }, { x: x0, y: yc }, { x: x1, y: yc }, { x: x1, y: yc - 400 }] }); flat(160); break; }
    }
    SECTIONS.push({ type, label: LABELS[type], from, to: H.length * TSTEP });
  }
  flat(260);
  const FINISH_X = H.length * TSTEP;
  flat(320); vert(-400); flat(40);
  const TP = H.map((h, i) => ({ x: i * TSTEP, y: h }));
  return { H, SF, TP, SECTIONS, TUNNELS, FINISH_X, LEN: H.length * TSTEP };
}

function terrainIndex(c, x) { return Math.min(Math.max(Math.floor(x / TSTEP), 0), c.H.length - 2); }
function terrain(c, x) {
  const i = terrainIndex(c, x), t = Math.min(Math.max(x / TSTEP - i, 0), 1);
  return c.H[i] + (c.H[i + 1] - c.H[i]) * t;
}
function surfaceAt(c, x) { return c.SF[terrainIndex(c, x)]; }
function closestOnTerrain(c, px, py) {
  const P = c.TP, i0 = terrainIndex(c, px);
  let best = Infinity, bx = px, by = terrain(c, px);
  for (let i = Math.max(0, i0 - 26); i <= Math.min(P.length - 2, i0 + 26); i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let u = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const qx = a.x + dx * u, qy = a.y + dy * u, d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  return { x: bx, y: by, d: Math.sqrt(best) };
}

function closestOnPoly(P, px, py) {
  let best = Infinity, bx = px, by = py;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let u = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const qx = a.x + dx * u, qy = a.y + dy * u, d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  return { x: bx, y: by, d: Math.sqrt(best) };
}

// ---------- 車 ----------
function samplePolyline(pts, spacing) {
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d === 0) continue;
    let t = spacing - carry;
    while (t <= d) { out.push({ x: a.x + (b.x - a.x) * t / d, y: a.y + (b.y - a.y) * t / d }); t += spacing; }
    carry = d - (t - spacing);
  }
  return out;
}
// タイヤを軸まわりに最大半径へ収める（パッド座標）
function clampWheel(stroke, axle) {
  let r = 0;
  for (const p of stroke) r = Math.max(r, Math.hypot(p.x - axle.x, p.y - axle.y));
  if (r <= MAX_WHEEL_R) return stroke;
  const k = MAX_WHEEL_R / r;
  return stroke.map(p => ({ x: axle.x + (p.x - axle.x) * k, y: axle.y + (p.y - axle.y) * k }));
}
// wheels: { rear: 線 | null, front: 線 | null }（パッド座標）
function makeCar(wheels) {
  const tf = p => ({ x: (p.x - CHASSIS_CENTER.x) * SCALE, y: (p.y - CHASSIS_CENTER.y) * SCALE });
  const chassisPts = samplePolyline(CHASSIS.concat([CHASSIS[0]]), 9).map(tf);
  let m = M_PT * chassisPts.length * 2;   // 車体は重め
  const joints = [];
  for (const kind of ['rear', 'front']) {
    const axle = AXLES[kind], o = tf(axle), st = wheels[kind];
    const rel = p => ({ x: (p.x - axle.x) * SCALE, y: (p.y - axle.y) * SCALE });
    const pts = st ? samplePolyline(st, 8).map(rel) : [];
    let I = 0, jr = 0;
    for (const p of pts) { I += M_PT * (p.x * p.x + p.y * p.y); jr = Math.max(jr, Math.hypot(p.x, p.y)); }
    I += M_PT * pts.length * T * T / 2;
    m += M_PT * pts.length;
    joints.push({ kind, ox: o.x, oy: o.y, pts, line: st ? st.map(rel) : [], a: 0, w: 0, I, invI: pts.length ? 1 / I : 0, rad: jr + T, active: pts.length > 0 });
  }
  return { chassisPts, chassisLine: CHASSIS.map(tf), joints, m, invM: 1 / m, x: 0, y: 0, vx: 0, vy: 0, inMud: false, contacts: 0 };
}
function placeAtStart(c, b) {
  let low = -Infinity;
  for (const p of b.chassisPts) low = Math.max(low, p.y);
  for (const j of b.joints) for (const p of j.pts) low = Math.max(low, j.oy + p.y);
  b.x = START_X; b.y = terrain(c, START_X) - low - T - 1; b.vx = 0; b.vy = 0;
  for (const j of b.joints) { j.a = 0; j.w = 0; }
}
// 1点の接触。j が null なら車体の点、あれば関節 j を軸に回る点
function applyContact(b, px, py, j, nx, ny, pen, surf) {
  const belt = surf && surf.belt ? surf.belt : 0, muF = surf && surf.mu ? surf.mu : 1;
  const rx = j ? px - (b.x + j.ox) : 0, ry = j ? py - (b.y + j.oy) : 0;
  const w = j ? j.w : 0, invI = j ? j.invI : 0;
  let vpx = b.vx - w * ry, vpy = b.vy + w * rx;
  const vn = vpx * nx + vpy * ny;
  if (vn < 0) {
    const rn = rx * ny - ry * nx, kn = b.invM + rn * rn * invI;
    const jn = -(1 + E) * vn / kn;
    b.vx += jn * nx * b.invM; b.vy += jn * ny * b.invM; if (j) j.w += rn * jn * invI;
    const tx = -ny, ty = nx, w2 = j ? j.w : 0;
    vpx = b.vx - w2 * ry; vpy = b.vy + w2 * rx;
    const vt = (vpx - belt) * tx + vpy * ty;
    const rt = rx * ty - ry * tx, kt = b.invM + rt * rt * invI;
    const lim = MU * muF * jn;
    const jt = Math.max(-lim, Math.min(lim, -vt / kt));
    b.vx += jt * tx * b.invM; b.vy += jt * ty * b.invM; if (j) j.w += rt * jt * invI;
  }
  const corr = Math.min(pen, 8) * 0.4;
  b.x += nx * corr; b.y += ny * corr;
  b.contacts++;
  if (surf && surf.mud) b.inMud = true;
}
function contact(c, b, px, py, j) {
  // トンネルの天井ブロック（側面にも当たる）
  for (const tn of c.TUNNELS) {
    if (px < tn.x0 - 40 || px > tn.x1 + 40 || py - T - 4 > tn.yc) continue;
    const inside = px > tn.x0 && px < tn.x1 && py < tn.yc;
    const cp = closestOnPoly(tn.poly, px, py);
    const pen = inside ? cp.d + T : T - cp.d;
    if (pen <= 0) continue;
    let nx, ny;
    if (cp.d < 1e-6) { nx = 0; ny = 1; }
    else if (inside) { nx = (cp.x - px) / cp.d; ny = (cp.y - py) / cp.d; }
    else { nx = (px - cp.x) / cp.d; ny = (py - cp.y) / cp.d; }
    applyContact(b, px, py, j, nx, ny, pen, null);
  }
  const h = terrain(c, px);
  if (py + T + 4 < h) return;
  const inside = py > h;
  const cp = closestOnTerrain(c, px, py);
  const pen = inside ? cp.d + T : T - cp.d;
  if (pen <= 0) return;
  let nx, ny;
  if (cp.d < 1e-6) { nx = 0; ny = -1; }
  else if (inside) { nx = (cp.x - px) / cp.d; ny = (cp.y - py) / cp.d; }
  else { nx = (px - cp.x) / cp.d; ny = (py - cp.y) / cp.d; }
  applyContact(b, px, py, j, nx, ny, pen, surfaceAt(c, px));
}
function stepCar(c, b, dt) {
  b.vy += G * dt;
  b.vx *= 1 - 0.03 * dt;
  for (const j of b.joints) {
    if (!j.active) continue;
    if (j.w < WMAX) j.w += POWER * G * b.m * j.rad * j.invI * dt;
    j.a += j.w * dt;
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.inMud = false; b.contacts = 0;
  for (const v of b.chassisPts) contact(c, b, b.x + v.x, b.y + v.y, null);
  for (const j of b.joints) {
    const co = Math.cos(j.a), si = Math.sin(j.a);
    for (const v of j.pts) contact(c, b, b.x + j.ox + v.x * co - v.y * si, b.y + j.oy + v.x * si + v.y * co, j);
  }
  if (b.inMud) { b.vx *= 1 - MUD_DRAG * dt; for (const j of b.joints) j.w *= 1 - 2 * dt; }
}

root.DrawCar = { TSTEP, DT, G, T, TUNNEL_H, START_X, SCALE, PAD_W, PAD_H, MAX_WHEEL_R, CHASSIS, CHASSIS_CENTER, AXLES, COURSES,
  buildCourse, terrain, surfaceAt, samplePolyline, clampWheel, makeCar, placeAtStart, stepCar };
})(typeof module !== 'undefined' ? module.exports : window);
