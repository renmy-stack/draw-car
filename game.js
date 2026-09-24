// ドローカーレース — 画面・入力・進行（物理は physics.js）
'use strict';
const P = window.DrawCar;
const { PAD_W, PAD_H, AXLES, CHASSIS, CHASSIS_CENTER, SCALE, T, START_X, TSTEP, COURSES, DT, buildCourse, resetCourse, terrain, makeCar, placeAtStart, transferState, stepCar,
  PHYS_VERSION, makeRunner, stepRunner } = P;

const VIEW_W = 560;                       // 画面に映る横幅（ワールド座標）
const INK = '#23262b', PLAYER = '#e0413a', WINDOW = '#bfe9ff';
const SEC_COLOR = { hills: '#7bc67e', bumps: '#a8d08d', stairs: '#e0b04a', wave: '#6cc1e0', pits: '#8a6a4a', bigpit: '#6e4a2e',
  hurdles: '#e07a4a', sawtooth: '#c9a227', ice: '#9fdcff', cliff: '#8f8f8f', steep: '#b05c5c', mud: '#6b3f1f', belt: '#555', wall: '#444', tunnel: '#2f2a3f',
  gate: '#6b6b7a', bridge: '#b8865a' };
const SITE_URL = 'https://renmy-stack.github.io/draw-car/';
const VERSION = '8';   // version.txt と合わせる。更新したら index.html の ?v= も上げる

const $ = id => document.getElementById(id);
const race = $('race'), rctx = race.getContext('2d');
const pad = $('pad'), pctx = pad.getContext('2d');

let courseIdx = 0, course = null, car = null;
let wheels = { rear: null, front: null };
let state = 'idle';                        // idle | racing | result
let raceTime = 0, lastTs = 0, acc = 0, animT = 0;
let camX = 0, camY = 0, camInit = false;
let stroke = [], drawing = false;
let finalTime = 0, isRecord = false;
// ゴースト: レース開始からの物理ステップ番号 k とタイヤの差し替えイベントで走りを再現する
let events = [], stepK = 0, ghosts = [], lastRun = null;
const GHOST_STYLE = { best: { label: 'ベスト', color: '#e0a83a' } };

// ---------- 記録 ----------
function loadBest(i) { try { const v = localStorage.getItem('drawcar.best.' + i); return v ? +v : null; } catch (e) { return null; } }
function saveBest(i, t) { try { localStorage.setItem('drawcar.best.' + i, String(t)); } catch (e) {} }
function fmt(t) { return t.toFixed(2); }
function loadGhost(key, i) {
  try { const g = JSON.parse(localStorage.getItem('drawcar.' + key + '.' + i)); return g && g.v === PHYS_VERSION && Array.isArray(g.events) ? g : null; } catch (e) { return null; }
}
function saveGhost(key, i, g) { try { localStorage.setItem('drawcar.' + key + '.' + i, JSON.stringify({ v: PHYS_VERSION, time: g.time, events: g.events })); } catch (e) {} }
// ゴーストは自己ベストだけ（おてほん・ともだちは 2026-09-24 にオーナー判断で外した。physics.js 側の仕組みは残してある）
function ghostDefs(i) {
  const best = loadGhost('ghost', i);
  return best ? [{ kind: 'best', time: best.time, events: best.events }] : [];
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- コース・状態 ----------
function selectCourse(i) {
  courseIdx = i; course = buildCourse(COURSES[i]);
  car = makeCar(wheels); placeAtStart(course, car);
  state = 'idle'; raceTime = 0; camInit = false; ghosts = [];
  document.querySelectorAll('.cbtn').forEach(b => b.classList.toggle('active', +b.dataset.c === i));
  $('cname-text').textContent = 'コース' + (i + 1) + ' ' + COURSES[i].name;
  const best = loadBest(i);
  $('cbest').textContent = best ? 'ベスト ' + fmt(best) + '秒' : 'まだ きろくなし';
  $('result').hidden = true;
  document.body.style.background = COURSES[i].sky[0];
  document.body.classList.toggle('dark', !!COURSES[i].dark);
  updateButtons();
}
function hasWheels() { return !!(wheels.rear || wheels.front); }
function updateButtons() {
  $('start').hidden = !(state === 'idle' && hasWheels());
  $('retry').hidden = state !== 'racing';
  $('clear').hidden = state === 'racing' ? false : !hasWheels();
  $('padhint').classList.toggle('hidden', hasWheels() || state !== 'idle');
  $('timer').textContent = fmt(state === 'result' ? finalTime : raceTime);
}
function startRace() {
  resetCourse(course);
  car = makeCar(wheels); placeAtStart(course, car);
  raceTime = 0; acc = 0; state = 'racing';
  events = []; stepK = 0;
  for (const kind of ['rear', 'front']) if (wheels[kind]) events.push({ k: 0, kind, pts: wheels[kind] });
  // ゴーストはそれぞれ自分のコースを持つ（橋を割っても こちらのコースには影響しない）
  ghosts = ghostDefs(courseIdx).map(g => ({ kind: g.kind, label: GHOST_STYLE[g.kind].label, color: GHOST_STYLE[g.kind].color, time: g.time, runner: makeRunner(COURSES[courseIdx], g.events) }));
  $('result').hidden = true;
  updateButtons();
}
function replaceCar() {
  car = transferState(car, makeCar(wheels));
}
function finish() {
  state = 'result'; finalTime = raceTime;
  const best = loadBest(courseIdx);
  isRecord = !best || finalTime < best;
  lastRun = { time: finalTime, events: events.slice() };
  if (isRecord) { saveBest(courseIdx, finalTime); saveGhost('ghost', courseIdx, lastRun); }
  $('rghosts').innerHTML = ghosts.map(g => {
    const d = finalTime - g.time;
    const res = d <= 0 ? '<b class="win">' + fmt(-d) + '秒 かち！</b>' : fmt(d) + '秒 まけ';
    return '<div><span class="gdot" style="background:' + g.color + '"></span>' + g.label + ' ' + fmt(g.time) + '秒 に ' + res + '</div>';
  }).join('');
  $('rcourse').textContent = 'コース' + (courseIdx + 1) + ' ' + COURSES[courseIdx].name;
  $('rtime').textContent = fmt(finalTime);
  const rb = $('rbest');
  rb.textContent = isRecord ? '🎉 じこベスト こうしん！' : 'ベスト ' + fmt(best) + '秒';
  rb.classList.toggle('record', isRecord);
  $('cbest').textContent = 'ベスト ' + fmt(isRecord ? finalTime : best) + '秒';
  $('next').textContent = courseIdx + 1 < COURSES.length ? 'つぎのコース' : 'コース1へ';
  $('result').hidden = false;
  updateButtons();
}

// ---------- 描画パッド ----------
function padPos(e) {
  const r = pad.getBoundingClientRect();
  return { x: (e.clientX - r.left) * PAD_W / r.width, y: (e.clientY - r.top) * PAD_H / r.height };
}
function strokePath(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
  ctx.stroke();
}
function chassisPath(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
function drawPad() {
  const ctx = pctx;
  ctx.clearRect(0, 0, PAD_W, PAD_H);
  // 車体のシルエット
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  chassisPath(ctx, CHASSIS); ctx.fillStyle = '#e9ecf2'; ctx.fill(); ctx.strokeStyle = '#c5c9d2'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#d9e6f2'; ctx.fillRect(136, 42, 46, 20);
  // 軸のしるし
  for (const [kind, a] of Object.entries(AXLES)) {
    ctx.strokeStyle = '#9aa1ad'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(a.x, a.y, 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(a.x - 11, a.y); ctx.lineTo(a.x + 11, a.y); ctx.moveTo(a.x, a.y - 11); ctx.lineTo(a.x, a.y + 11); ctx.stroke();
    ctx.fillStyle = '#9aa1ad'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(kind === 'rear' ? 'うしろ' : 'まえ', a.x, a.y + 40);
  }
  // 描いたタイヤ
  ctx.strokeStyle = PLAYER; ctx.lineWidth = T * 2;
  for (const k of ['rear', 'front']) if (wheels[k]) strokePath(ctx, wheels[k]);
  if (stroke.length) { ctx.strokeStyle = '#ff8a85'; strokePath(ctx, stroke); }
}
pad.addEventListener('pointerdown', e => {
  e.preventDefault();
  drawing = true; stroke = [padPos(e)];
  try { pad.setPointerCapture(e.pointerId); } catch (err) {}
  drawPad();
});
pad.addEventListener('pointermove', e => {
  if (!drawing) return;
  const p = padPos(e), last = stroke[stroke.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 3) { stroke.push(p); drawPad(); }
});
function endStroke(e) {
  if (e && e.pointerId != null) { try { pad.releasePointerCapture(e.pointerId); } catch (err) {} }
  if (!drawing) return;
  drawing = false;
  if (stroke.length >= 3) {
    // 0.5px に丸める（ゴーストの URL に入れる形と、いま走る形を同じにするため）
    stroke = stroke.map(p => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }));
    // 線の中心に近い軸へ
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of stroke) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const kind = Math.hypot(cx - AXLES.rear.x, cy - AXLES.rear.y) <= Math.hypot(cx - AXLES.front.x, cy - AXLES.front.y) ? 'rear' : 'front';
    wheels[kind] = stroke;
    if (state === 'idle') startRace();
    else if (state === 'racing') { events.push({ k: stepK, kind, pts: stroke }); replaceCar(); }
    // リザルト表示中は次のレース用に描くだけ
  }
  stroke = [];
  drawPad(); updateButtons();
}
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);
pad.addEventListener('pointerleave', e => { if (drawing && !pad.hasPointerCapture?.(e.pointerId)) endStroke(); });

// ---------- ボタン ----------
// ボタン: iOS Safari で click が 1 回目に届かないことがあるので、pointerup でも反応させる（二重起動は時間で防ぐ）
const DEBUG = /debug/.test(location.search);
const dbg = DEBUG ? Object.assign(document.body.appendChild(document.createElement('div')), { id: 'dbg' }) : null;
if (dbg) dbg.style.cssText = 'position:fixed;left:8px;bottom:60px;z-index:99;background:#000;color:#0f0;font:12px monospace;padding:4px 6px;pointer-events:none;white-space:pre';
const dbgCount = {};
function dbgLog(name, ev) { if (!dbg) return; const k = name + ':' + ev; dbgCount[k] = (dbgCount[k] || 0) + 1; dbg.textContent = Object.entries(dbgCount).map(([a, b]) => a + '=' + b).join(' | '); }
function onTap(el, fn) {
  let last = 0;
  const run = (e, kind) => { dbgLog(el.id || el.className, kind); if (Date.now() - last < 700) return; last = Date.now(); fn(e); };
  el.addEventListener('pointerdown', e => dbgLog(el.id || el.className, 'pd'));
  el.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; run(e, 'pu'); });
  el.addEventListener('click', e => run(e, 'ck'));
}
document.querySelectorAll('.cbtn').forEach(b => onTap(b, () => selectCourse(+b.dataset.c)));
onTap($('start'), () => { if (state === 'idle' && hasWheels()) startRace(); });
onTap($('retry'), () => { if (state === 'racing') startRace(); });
onTap($('clear'), () => {
  wheels = { rear: null, front: null };
  if (state === 'racing') { state = 'idle'; raceTime = 0; }
  car = makeCar(wheels); placeAtStart(course, car);
  drawPad(); updateButtons();
});
onTap($('again'), () => { if (hasWheels()) startRace(); else { state = 'idle'; $('result').hidden = true; updateButtons(); } });
onTap($('next'), () => selectCourse((courseIdx + 1) % COURSES.length));
onTap($('share'), shareResult);
onTap($('closeshare'), () => { $('sharebox').hidden = true; });
onTap($('copy'), () => {
  const ta = $('sharetext');
  const done = () => { $('copy').textContent = 'コピーした！'; setTimeout(() => { $('copy').textContent = '文をコピー'; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); });
  else { ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
});

// ---------- 描画（レース画面） ----------
let cw = 0, ch = 0, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth; ch = window.innerHeight;
  race.width = Math.round(cw * dpr); race.height = Math.round(ch * dpr);
  race.style.width = cw + 'px'; race.style.height = ch + 'px';
  camInit = false;
}
window.addEventListener('resize', resize);
resize();

function drawCar(ctx, b, scale, color) {
  // ctx はワールド座標に変換済み（scale 済み）で呼ぶ。b.x, b.y は重心、b.th は車体の傾き
  const body = color || PLAYER;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.th);
  // タイヤ（車体の後ろ側）。ハブは車体と一緒に傾き、タイヤ自体は絶対角 j.a で回る
  for (const j of b.joints) {
    ctx.save(); ctx.translate(j.ox, j.oy); ctx.rotate(j.a - b.th);
    if (j.line.length) { ctx.strokeStyle = INK; ctx.lineWidth = T * 2; strokePath(ctx, j.line); }
    ctx.restore();
  }
  // 車体（CHASSIS_CENTER 基準の座標で描くので、重心の分だけずらす）
  ctx.save(); ctx.translate(-b.cx, -b.cy);
  chassisPath(ctx, b.chassisLine); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  const tf = p => ({ x: (p.x - CHASSIS_CENTER.x) * SCALE, y: (p.y - CHASSIS_CENTER.y) * SCALE });
  const w0 = tf({ x: 136, y: 42 }), w1 = tf({ x: 182, y: 62 });
  ctx.fillStyle = WINDOW; ctx.fillRect(w0.x, w0.y, w1.x - w0.x, w1.y - w0.y);
  const hl = tf({ x: 236, y: 80 });
  ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(hl.x, hl.y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ハブ
  for (const j of b.joints) {
    ctx.beginPath(); ctx.arc(j.ox, j.oy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}

function render() {
  const ctx = rctx, def = COURSES[courseIdx], scale = cw / VIEW_W, vh = ch / scale;
  const tx = car.x - VIEW_W * 0.32, ty = car.y - vh * 0.30;
  if (!camInit) { camX = tx; camY = ty; camInit = true; }
  else { camX += (tx - camX) * 0.18; camY += (ty - camY) * 0.12; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, ch); sky.addColorStop(0, def.sky[0]); sky.addColorStop(1, def.sky[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);
  // 遠景の丘（パララックス）
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(0, ch);
  for (let x = 0; x <= cw; x += 8) ctx.lineTo(x, ch * 0.55 + Math.sin((x + camX * 0.25) * 0.012) * 26 + Math.sin((x + camX * 0.25) * 0.03) * 10);
  ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill();

  ctx.save(); ctx.scale(scale, scale); ctx.translate(-camX, -camY);
  const x0 = Math.max(0, Math.floor((camX - 20) / TSTEP)), x1 = Math.min(course.H.length - 1, Math.ceil((camX + VIEW_W + 20) / TSTEP));
  // 地面（塗り）
  ctx.fillStyle = def.dirt; ctx.beginPath(); ctx.moveTo(x0 * TSTEP, camY + vh + 50);
  for (let i = x0; i <= x1; i++) ctx.lineTo(i * TSTEP, course.H[i]);
  ctx.lineTo(x1 * TSTEP, camY + vh + 50); ctx.closePath(); ctx.fill();
  // 地表の線（区間の種類で色分け）
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 9;
  let i = x0;
  while (i < x1) {
    const sf = course.SF[i]; let k = i;
    while (k < x1 && course.SF[k] === sf) k++;
    ctx.strokeStyle = sf && sf.ice ? '#cfefff' : sf && sf.water ? '#3a8fd9' : sf && sf.mud ? '#5a3418' : sf && sf.belt ? '#3a3a3a' : sf && sf.bridge ? '#b8865a' : def.ground;
    ctx.beginPath(); ctx.moveTo(i * TSTEP, course.H[i]);
    for (let q = i + 1; q <= k; q++) ctx.lineTo(q * TSTEP, course.H[q]);
    ctx.stroke();
    if (sf && sf.belt) {   // 動く矢印もよう
      ctx.save(); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.setLineDash([10, 16]); ctx.lineDashOffset = -animT * sf.belt;
      ctx.beginPath(); ctx.moveTo(i * TSTEP, course.H[i]); for (let q = i + 1; q <= k; q++) ctx.lineTo(q * TSTEP, course.H[q]); ctx.stroke(); ctx.restore();
    }
    if (sf && sf.ice) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([2, 22]);
      ctx.beginPath(); ctx.moveTo(i * TSTEP, course.H[i] - 3); for (let q = i + 1; q <= k; q++) ctx.lineTo(q * TSTEP, course.H[q] - 3); ctx.stroke(); ctx.restore();
    }
    if (sf && sf.bridge) {   // 板のつなぎ目と、下の空洞
      ctx.save(); ctx.fillStyle = def.sky[1]; ctx.globalAlpha = 0.55; ctx.fillRect(i * TSTEP, course.H[i] + 5, (k - i) * TSTEP, 60); ctx.restore();
      ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([2, 18]);
      ctx.beginPath(); ctx.moveTo(i * TSTEP, course.H[i]); ctx.lineTo(k * TSTEP, course.H[k]); ctx.stroke(); ctx.restore();
    }
    if (sf && sf.water) {    // 水面のゆれ
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([12, 20]); ctx.lineDashOffset = -animT * 40;
      ctx.beginPath(); ctx.moveTo(i * TSTEP, course.H[i] - 3); for (let q = i + 1; q <= k; q++) ctx.lineTo(q * TSTEP, course.H[q] - 3); ctx.stroke(); ctx.restore();
    }
    i = k;
  }
  // トンネルの天井ブロック
  for (const tn of course.TUNNELS) {
    if (tn.x1 < camX - 20 || tn.x0 > camX + VIEW_W + 20) continue;
    ctx.fillStyle = tn.gate ? '#6b6b7a' : def.dirt; ctx.fillRect(tn.x0, tn.yc - 400, tn.x1 - tn.x0, 400);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(tn.x0, tn.yc - 400, tn.x1 - tn.x0, 400);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let bx = tn.x0; bx < tn.x1; bx += 30) ctx.fillRect(bx + 4, tn.yc - 12, 22, 6);
  }
  // くさった橋が抜けた瞬間
  for (const br of course.BRIDGES) {
    if (!br.broken || !br.brokenAt || Date.now() - br.brokenAt > 1200) continue;
    ctx.save(); ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.strokeText('バキッ!', br.x0 + 120, br.deckY - 50); ctx.fillText('バキッ!', br.x0 + 120, br.deckY - 50); ctx.restore();
  }
  // 区間ラベル
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const s of course.SECTIONS) {
    if (s.from < camX - 100 || s.from > camX + VIEW_W + 20) continue;
    const tn = s.type === 'tunnel' || s.type === 'gate' ? course.TUNNELS.find(t => t.x0 >= s.from && t.x0 < s.to) : null;
    const gy = tn ? tn.yc - 20 : terrain(course, s.from + 6) - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(s.label, (tn ? tn.x0 : s.from) + 6, gy);
  }
  // スタート・ゴール
  for (const [gx, label, col] of [[START_X, 'START', '#fff'], [course.FINISH_X, 'GOAL', '#ffd23f']]) {
    if (gx < camX - 80 || gx > camX + VIEW_W + 80) continue;
    const gy = terrain(course, gx);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 80); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(gx, gy - 80); ctx.lineTo(gx + 34, gy - 68); ctx.lineTo(gx, gy - 56); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, gx, gy - 86);
  }
  // ゴースト（半透明。自分の車の後ろ）
  for (const g of ghosts) {
    const gc = g.runner.car;
    if (gc.x < camX - 150 || gc.x > camX + VIEW_W + 150) continue;
    ctx.save(); ctx.globalAlpha = 0.45; drawCar(ctx, gc, scale, g.color); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.85; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = g.color;
    ctx.fillText(g.label, gc.x, gc.y - 48); ctx.restore();
  }
  drawCar(ctx, car, scale);
  ctx.restore();

  // ミニマップ（進行バー）
  const mx = 12, mw = cw - 24, my = Math.max(60, (parseFloat(getComputedStyle($('top')).paddingTop) || 10) + 52), mh = 8;
  const total = course.FINISH_X - START_X;
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(mx, my, mw, mh);
  for (const s of course.SECTIONS) {
    const a = mx + mw * (s.from - START_X) / total, b2 = mx + mw * (s.to - START_X) / total;
    ctx.fillStyle = SEC_COLOR[s.type] || '#999'; ctx.fillRect(a, my, Math.max(1, b2 - a), mh);
  }
  const t = Math.min(Math.max((car.x - START_X) / total, 0), 1);
  ctx.fillStyle = PLAYER; ctx.beginPath(); ctx.arc(mx + mw * t, my + mh / 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}

// ---------- ループ ----------
function frame(ts) {
  const dt = Math.min((ts - lastTs) / 1000 || 0, 0.05); lastTs = ts; animT += dt;
  if (state === 'racing') {
    acc += dt;
    while (acc >= DT) {
      stepCar(course, car, DT); raceTime += DT; acc -= DT; stepK++;
      for (const g of ghosts) stepRunner(g.runner);
      if (car.x >= course.FINISH_X) { finish(); break; }
    }
    $('timer').textContent = fmt(raceTime);
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- シェア ----------
function shareResult() {
  const W = 720, H = 480, cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d'); g.scale(2, 2);
  const def = COURSES[courseIdx];
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, def.sky[0]); sky.addColorStop(1, def.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = def.dirt; g.fillRect(0, 406, W, H - 406);
  g.fillStyle = def.ground; g.fillRect(0, 400, W, 12);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = 'bold 34px sans-serif'; g.fillText('ドローカーレース', W / 2, 58);
  g.font = 'bold 22px sans-serif'; g.fillText('コース' + (courseIdx + 1) + ' ' + def.name, W / 2, 94);
  g.font = 'bold 64px sans-serif'; g.fillText(fmt(finalTime) + ' 秒', W / 2, 160);
  if (isRecord) { g.fillStyle = PLAYER; g.font = 'bold 20px sans-serif'; g.fillText('じこベスト こうしん！', W / 2, 190); }
  // 車（大きく）
  const b = makeCar(wheels); let low = -Infinity;
  for (const p of b.chassisPts) low = Math.max(low, p.y);
  for (const j of b.joints) for (const p of j.pts) low = Math.max(low, j.oy + p.y);
  b.x = 0; b.y = 0;
  g.save(); g.translate(W / 2, 400 - (low + T) * 2.0); g.scale(2.0, 2.0); drawCar(g, b, 1); g.restore();
  g.fillStyle = INK; g.font = '18px sans-serif'; g.fillText(SITE_URL, W / 2, H - 22);
  const dataUrl = cv.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const file = new File([buf], 'drawcar.png', { type: 'image/png' });
  const text = 'ドローカーレース コース' + (courseIdx + 1) + ' ' + def.name + '\nタイム : ' + fmt(finalTime) + '秒' + (isRecord ? '（じこベスト）' : '') + '\n\n' + SITE_URL + '\n#ドローカーレース';
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], text }).catch(() => {});
  } else if (navigator.share) {
    navigator.share({ text }).catch(() => showShareBox(dataUrl, text));
  } else showShareBox(dataUrl, text);
}
function showShareBox(dataUrl, text) {
  $('shareimg').src = dataUrl; $('sharetext').value = text; $('sharebox').hidden = false;
}

// ---------- 開発用: ff(秒) で早送り ----------
window.ff = sec => { if (state !== 'racing') return 'not racing'; const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { stepCar(course, car, DT); raceTime += DT; stepK++; for (const g of ghosts) stepRunner(g.runner); if (car.x >= course.FINISH_X) { finish(); break; } } camInit = false; $('timer').textContent = fmt(state === 'result' ? finalTime : raceTime); return state + ' x=' + car.x.toFixed(0) + ' t=' + raceTime.toFixed(2); };

// ---------- 自動更新: Safari が古いページを開き続けるので、新しい版があれば読み直す ----------
async function checkVersion() {
  try {
    const r = await fetch('version.txt?ts=' + Date.now(), { cache: 'no-store' });
    const v = (await r.text()).trim();
    if (v && v !== VERSION && state !== 'racing') location.reload();
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
window.addEventListener('pageshow', e => { if (e.persisted) checkVersion(); });
checkVersion();

// ---------- 開始 ----------
selectCourse(0);
drawPad();
requestAnimationFrame(frame);
