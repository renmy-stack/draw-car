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
const WATER_DRAG = 14;    // 水（くさった橋の下）の抵抗（1/s）
const TILT_MAX = 22 * Math.PI / 180;   // 車体の傾きの上限（転倒しない。かべ 72 を丸タイヤで越えられない上限）
const TILT_K = 30;        // 水平に戻るバネ（rad/s^2 per rad）
const TILT_D = 3;         // 傾きの減衰（1/s）
const REACT = 1.0;        // モーター反力を車体に返す割合
const START_X = 140;
const SCALE = 0.56;       // パッド座標 → ワールド座標
const PAD_W = 300, PAD_H = 180;
const CHASSIS_CENTER = { x: 150, y: 78 };
const AXLES = { rear: { x: 96, y: 100 }, front: { x: 204, y: 100 } };   // 軸は y=100: 下に 80・上に 100 描ける
// 車体の輪郭（パッド座標・時計回り・閉じる）
const CHASSIS = [
  { x: 60, y: 100 }, { x: 60, y: 74 }, { x: 78, y: 66 }, { x: 110, y: 62 }, { x: 128, y: 36 },
  { x: 188, y: 36 }, { x: 208, y: 62 }, { x: 236, y: 70 }, { x: 240, y: 100 },
];

// ---------- コース定義 ----------
const COURSES = [
  { name: 'はらっぱ', sky: ['#7fc8ff', '#dff4ff'], ground: '#58b26b', dirt: '#8a5a3a',
    sections: [
      ['hills', { len: 700, amp: 36 }], ['bumps', { len: 400, amp: 8 }], ['bridge', { len: 560, d: 80, limit: 72 }], ['pits', { n: 2, w: 60, d: 28, gap: 120 }],
      ['wave', { len: 500, dh: 80 }], ['stairs', { n: 3, h: 30, gap: 110 }], ['tunnel', { len: 300 }], ['hills', { len: 500, amp: 30 }],
    ] },
  { name: 'とうげ', sky: ['#ff9a5c', '#ffe1b8'], ground: '#9ab55a', dirt: '#6e4a2e',
    sections: [
      ['bumps', { len: 300, amp: 10 }], ['hurdles', { n: 3, h: 22, w: 12, gap: 90 }], ['sawtooth', { n: 4, len: 90, h: 40 }],
      ['ice', { len: 500, dh: -120 }], ['stairs', { n: 4, h: 34, gap: 90 }], ['bridge', { len: 560, d: 80, limit: 72 }], ['bigpit', { w: 100, d: 55 }], ['tunnel', { len: 300 }],
      ['cliff', { dh: 120 }], ['gate', { h: 72, c: 110, len: 120 }], ['steep', { len: 220, dh: -100 }],
    ] },
  { name: 'まよなか', sky: ['#1c2350', '#4a4f8f'], ground: '#4f7f8f', dirt: '#2f2a3f', dark: true,
    sections: [
      ['wave', { len: 600, dh: 90 }], ['mud', { len: 400 }], ['bridge', { len: 560, d: 80, limit: 72 }], ['sawtooth', { n: 5, len: 80, h: 45 }], ['belt', { len: 420, speed: -180 }],
      ['pits', { n: 3, w: 65, d: 30, gap: 110 }], ['tunnel', { len: 360 }], ['hurdles', { n: 4, h: 26, w: 12, gap: 80 }], ['gate', { h: 72, c: 110, len: 120 }],
      ['steep', { len: 200, dh: -110 }], ['cliff', { dh: 140 }], ['stairs', { n: 4, h: 36, gap: 90 }], ['ice', { len: 400, dh: -100 }], ['gate', { h: 72, c: 110, len: 120 }],
    ] },
];
const LABELS = { flat: 'たいら', hills: 'おか', bumps: 'でこぼこ', stairs: 'かいだん', wave: 'おおなみ', pits: 'みぞ',
  bigpit: 'おおみぞ', hurdles: 'ハードル', sawtooth: 'のこぎり', ice: 'こおり', cliff: 'がけ', steep: 'きゅうざか',
  mud: 'どろ', belt: 'ベルト', wall: 'かべ', tunnel: 'トンネル', gate: 'もん', bridge: 'くさったはし' };

function buildCourse(def) {
  const H = [], SF = [], SECTIONS = [], TUNNELS = [], BRIDGES = [];
  let y = 0;
  const push = (yy, sf) => { H.push(yy); SF.push(sf || null); };
  const seg = (len, f, sf) => { const n = Math.max(1, Math.round(len / TSTEP)), y0 = y; for (let i = 1; i <= n; i++) { y = y0 + f(i / n); push(y, sf); } };
  const flat = (len, sf) => seg(len, () => 0, sf);
  const vert = (dy, sf) => { if (sf) SF[SF.length - 1] = sf; y += dy; push(y); };   // 面の属性は線分の始点側に持つ
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
      // もん: 段差（h）のすぐ上に低い天井（上の床から c）。登れる形で、かつ大きすぎないタイヤだけ通れる
      case 'gate': { flat(60); vert(-p.h); const x0 = H.length * TSTEP, yc = y - p.c; flat(p.len); const x1 = H.length * TSTEP;
        TUNNELS.push({ x0, x1, yc, gate: true, poly: [{ x: x0, y: yc - 400 }, { x: x0, y: yc }, { x: x1, y: yc }, { x: x1, y: yc - 400 }] }); flat(100); break; }
      // くさったはし: タイヤの半径（パッド座標）が limit を超えると板が抜けて、深さ d の水に落ちる（出口はスロープ）
      case 'bridge': { flat(40); const i0 = H.length - 1; flat(p.len, { bridge: true }); const i1 = H.length - 1;
        BRIDGES.push({ i0, i1, x0: i0 * TSTEP, x1: i1 * TSTEP, deckY: y, d: p.d, ramp: p.ramp || p.d * 2, limit: p.limit, broken: false }); flat(40); break; }
    }
    SECTIONS.push({ type, label: LABELS[type], from, to: H.length * TSTEP });
  }
  flat(260);
  const FINISH_X = H.length * TSTEP;
  flat(320); vert(-400); flat(40);
  const TP = H.map((h, i) => ({ x: i * TSTEP, y: h }));
  return { H, SF, TP, SECTIONS, TUNNELS, BRIDGES, FINISH_X, LEN: H.length * TSTEP };
}
// 橋を元に戻す（レース開始時に呼ぶ）
function resetCourse(c) {
  for (const br of c.BRIDGES) {
    if (!br.broken) continue;
    for (let i = br.i0 + 1; i < br.i1; i++) { c.H[i] = br.deckY; c.TP[i].y = br.deckY; c.SF[i] = { bridge: true }; }
    br.broken = false;
  }
}
function breakBridge(c, br) {
  const ramp = br.ramp, water = { mud: true, water: true };
  for (let i = br.i0 + 1; i < br.i1; i++) {
    const x = i * TSTEP, toEnd = br.x1 - x;
    const yy = br.deckY + (toEnd < ramp ? br.d * toEnd / ramp : br.d);
    c.H[i] = yy; c.TP[i].y = yy; c.SF[i] = water;
  }
  br.broken = true; br.brokenAt = Date.now();
}

function terrainIndex(c, x) { return Math.min(Math.max(Math.floor(x / TSTEP), 0), c.H.length - 2); }
function terrain(c, x) {
  const i = terrainIndex(c, x), t = Math.min(Math.max(x / TSTEP - i, 0), 1);
  return c.H[i] + (c.H[i + 1] - c.H[i]) * t;
}
function surfaceAt(c, x) { return c.SF[terrainIndex(c, x)]; }
function closestOnTerrain(c, px, py) {
  const P = c.TP, i0 = terrainIndex(c, px);
  let best = Infinity, bx = px, by = terrain(c, px), bi = i0;
  for (let i = Math.max(0, i0 - 26); i <= Math.min(P.length - 2, i0 + 26); i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let u = l2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const qx = a.x + dx * u, qy = a.y + dy * u, d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d < best) { best = d; bx = qx; by = qy; bi = i; }
  }
  return { x: bx, y: by, d: Math.sqrt(best), i: bi };   // i: いちばん近い線分（面の属性はこれで引く）
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
// wheels: { rear: 線 | null, front: 線 | null }（パッド座標）
// 車体の座標系: 原点は重心（b.x, b.y）。b.cx, b.cy は CHASSIS_CENTER 基準で見た重心の位置（描画用）
function makeCar(wheels) {
  const tf = p => ({ x: (p.x - CHASSIS_CENTER.x) * SCALE, y: (p.y - CHASSIS_CENTER.y) * SCALE });
  const chassisRaw = samplePolyline(CHASSIS.concat([CHASSIS[0]]), 9).map(tf);
  const mc = M_PT * 2;                     // 車体の点は重め
  let m = mc * chassisRaw.length, sx = 0, sy = 0;
  for (const p of chassisRaw) { sx += mc * p.x; sy += mc * p.y; }
  const joints = [];
  for (const kind of ['rear', 'front']) {
    const axle = AXLES[kind], o = tf(axle), st = wheels[kind];
    const rel = p => ({ x: (p.x - axle.x) * SCALE, y: (p.y - axle.y) * SCALE });
    const pts = st ? samplePolyline(st, 8).map(rel) : [];
    let I = 0, jr = 0;
    for (const p of pts) { I += M_PT * (p.x * p.x + p.y * p.y); jr = Math.max(jr, Math.hypot(p.x, p.y)); }
    I += M_PT * pts.length * T * T / 2;
    const mw = M_PT * pts.length;
    m += mw; sx += mw * o.x; sy += mw * o.y;
    joints.push({ kind, ox: o.x, oy: o.y, mw, pts, line: st ? st.map(rel) : [], a: 0, w: 0, I, invI: pts.length ? 1 / I : 0, rad: jr + T, active: pts.length > 0 });
  }
  const cx = sx / m, cy = sy / m;          // 重心（CHASSIS_CENTER 基準）
  let reach = 0;                           // いちばん大きいタイヤの半径（パッド座標。くさった橋の判定に使う）
  for (const j of joints) reach = Math.max(reach, (j.rad - T) / SCALE);
  const chassisPts = chassisRaw.map(p => ({ x: p.x - cx, y: p.y - cy }));
  let Ib = 0;
  for (const p of chassisPts) Ib += mc * (p.x * p.x + p.y * p.y);
  for (const j of joints) { j.ox -= cx; j.oy -= cy; Ib += j.mw * (j.ox * j.ox + j.oy * j.oy); }
  return { chassisPts, chassisLine: CHASSIS.map(tf), joints, m, invM: 1 / m, Ib, invIb: 1 / Ib, cx, cy, reach,
    x: 0, y: 0, vx: 0, vy: 0, th: 0, om: 0, inMud: false, inWater: false, contacts: 0 };
}
// 車体ローカル座標 → ワールド座標
function bodyPoint(b, lx, ly) {
  const co = Math.cos(b.th), si = Math.sin(b.th);
  return { x: b.x + lx * co - ly * si, y: b.y + lx * si + ly * co };
}
function placeAtStart(c, b) {
  b.th = 0; b.om = 0;
  let low = -Infinity;
  for (const p of b.chassisPts) low = Math.max(low, p.y);
  for (const j of b.joints) for (const p of j.pts) low = Math.max(low, j.oy + p.y);
  b.x = START_X; b.y = terrain(c, START_X) - low - T - 1; b.vx = 0; b.vy = 0;
  for (const j of b.joints) { j.a = 0; j.w = 0; }
}
// 走行中の乗せ替え: 車体の位置・速度・傾き・タイヤの回転を引き継ぐ（重心の位置がずれる分を補正）
function transferState(from, to) {
  const co = Math.cos(from.th), si = Math.sin(from.th), dx = to.cx - from.cx, dy = to.cy - from.cy;
  to.x = from.x + dx * co - dy * si; to.y = from.y + dx * si + dy * co;
  to.vx = from.vx; to.vy = from.vy; to.th = from.th; to.om = from.om;
  to.joints.forEach((j, i) => { j.w = from.joints[i].w; j.a = from.joints[i].a; });
  return to;
}
// 1点の接触。j が null なら車体の点、あれば関節 j（ハブまわりに回るタイヤ）の点
// 一般化速度は (vx, vy, om, 各タイヤの絶対角速度 w)。質量行列は対角（原点が重心なので）
function applyContact(b, px, py, j, nx, ny, pen, surf) {
  const belt = surf && surf.belt ? surf.belt : 0, muF = surf && surf.mu != null ? surf.mu : 1;
  // 車体側のレバー: 関節ならハブの位置、車体の点ならその点
  let hx, hy;
  if (j) { const h = bodyPoint(b, j.ox, j.oy); hx = h.x - b.x; hy = h.y - b.y; } else { hx = px - b.x; hy = py - b.y; }
  const rx = j ? px - (b.x + hx) : 0, ry = j ? py - (b.y + hy) : 0;
  const w = j ? j.w : 0, invI = j ? j.invI : 0, om = b.om, invIb = b.invIb;
  let vpx = b.vx - om * hy - w * ry, vpy = b.vy + om * hx + w * rx;
  const vn = vpx * nx + vpy * ny;
  if (vn < 0) {
    const bn = hx * ny - hy * nx, rn = rx * ny - ry * nx;
    const kn = b.invM + bn * bn * invIb + rn * rn * invI;
    const jn = -(1 + E) * vn / kn;
    b.vx += jn * nx * b.invM; b.vy += jn * ny * b.invM; b.om += bn * jn * invIb; if (j) j.w += rn * jn * invI;
    const tx = -ny, ty = nx, w2 = j ? j.w : 0, om2 = b.om;
    vpx = b.vx - om2 * hy - w2 * ry; vpy = b.vy + om2 * hx + w2 * rx;
    const vt = (vpx - belt) * tx + vpy * ty;
    const bt = hx * ty - hy * tx, rt = rx * ty - ry * tx;
    const kt = b.invM + bt * bt * invIb + rt * rt * invI;
    const lim = MU * muF * jn;
    const jt = Math.max(-lim, Math.min(lim, -vt / kt));
    b.vx += jt * tx * b.invM; b.vy += jt * ty * b.invM; b.om += bt * jt * invIb; if (j) j.w += rt * jt * invI;
  }
  const corr = Math.min(pen, 8) * 0.4;
  b.x += nx * corr; b.y += ny * corr;
  b.contacts++;
  if (surf && surf.mud) b.inMud = true;
  if (surf && surf.water) b.inWater = true;
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
  applyContact(b, px, py, j, nx, ny, pen, c.SF[cp.i]);
}
function stepCar(c, b, dt) {
  b.vy += G * dt;
  b.vx *= 1 - 0.03 * dt;
  // 水平に戻るバネ（弱い）と減衰
  b.om += (-TILT_K * b.th - TILT_D * b.om) * dt;
  for (const j of b.joints) {
    if (!j.active) continue;
    if (j.w - b.om < WMAX) {                 // モーターはタイヤを車体に対して回す
      const dw = POWER * G * b.m * j.rad * j.invI * dt;
      j.w += dw;
      b.om -= REACT * dw * j.I * b.invIb;    // 反力は車体へ
    }
    j.a += j.w * dt;
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.th += b.om * dt;
  if (b.th > TILT_MAX) { b.th = TILT_MAX; if (b.om > 0) b.om = 0; }
  else if (b.th < -TILT_MAX) { b.th = -TILT_MAX; if (b.om < 0) b.om = 0; }
  b.inMud = false; b.inWater = false; b.contacts = 0;
  for (const br of c.BRIDGES) if (!br.broken && b.reach > br.limit && b.x > br.x0 - 20 && b.x < br.x1) breakBridge(c, br);   // 乗った瞬間に抜ける
  const co = Math.cos(b.th), si = Math.sin(b.th);
  for (const v of b.chassisPts) contact(c, b, b.x + v.x * co - v.y * si, b.y + v.x * si + v.y * co, null);
  for (const j of b.joints) {
    const hx = b.x + j.ox * co - j.oy * si, hy = b.y + j.ox * si + j.oy * co;
    const cj = Math.cos(j.a), sj = Math.sin(j.a);
    for (const v of j.pts) contact(c, b, hx + v.x * cj - v.y * sj, hy + v.x * sj + v.y * cj, j);
  }
  if (b.inMud) { b.vx *= 1 - (b.inWater ? WATER_DRAG : MUD_DRAG) * dt; for (const j of b.joints) j.w += (b.om - j.w) * 2 * dt; }
}

root.DrawCar = { TSTEP, DT, G, T, TUNNEL_H, START_X, SCALE, PAD_W, PAD_H, CHASSIS, CHASSIS_CENTER, AXLES, COURSES,
  buildCourse, resetCourse, terrain, surfaceAt, samplePolyline, makeCar, placeAtStart, transferState, bodyPoint, stepCar };
})(typeof module !== 'undefined' ? module.exports : window);
