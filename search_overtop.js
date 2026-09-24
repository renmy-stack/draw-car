// node search_overtop.js [厚み...] — パッドに描ける極端な形を片っ端から試して、トンネルの上を越えられるものを探す（開発用）
'use strict';
const { DrawCar } = require('./physics.js');
const { AXLES, buildCourse, resetCourse, makeCar, placeAtStart, stepCar, DT } = DrawCar;
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const W = 300, Hh = 180;
function line(a, b, n = 12) { return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n })); }
function path(pts) { let out = []; for (let i = 0; i < pts.length - 1; i++) out = out.concat(line(pts[i], pts[i + 1]).slice(i ? 1 : 0)); return out; }
function kindOf(s) { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const p of s) { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y); } const cx = (a + b) / 2, cy = (c + d) / 2; return Math.hypot(cx - AXLES.rear.x, cy - AXLES.rear.y) <= Math.hypot(cx - AXLES.front.x, cy - AXLES.front.y) ? 'rear' : 'front'; }
function randPt(r) { return { x: Math.round(r() * W), y: Math.round(r() * Hh) }; }
function edgePt(r) { const t = r(); if (t < 0.25) return { x: Math.round(r() * W), y: 0 }; if (t < 0.5) return { x: Math.round(r() * W), y: Hh }; if (t < 0.75) return { x: 0, y: Math.round(r() * Hh) }; return { x: W, y: Math.round(r() * Hh) }; }
function randStroke(r) { const k = 2 + Math.floor(r() * 4); const pts = []; for (let i = 0; i < k; i++) pts.push(r() < 0.6 ? edgePt(r) : randPt(r)); return path(pts); }
const tops = process.argv.slice(2).map(Number); if (!tops.length) tops.push(150, 250, 350);
const N = +(process.env.N || 400);
for (const top of tops) {
  const c = buildCourse({ sections: [['tunnel', { len: 300, top }]] }), tn = c.TUNNELS[0];
  const r = rng(7); let wins = [];
  for (let i = 0; i < N; i++) {
    const w = { rear: null, front: null };
    let guard = 0; while ((!w.rear || !w.front) && guard++ < 50) { const s = randStroke(r); const k = kindOf(s); if (!w[k]) w[k] = s; }
    if (!w.rear || !w.front) continue;
    resetCourse(c); const b = makeCar(w); placeAtStart(c, b);
    let t = 0, over = false; while (t < 30 && b.x < c.FINISH_X) { stepCar(c, b, DT); t += DT; if (b.x > tn.x0 && b.x < tn.x1 && b.y < tn.top) over = true; }
    if (b.x >= c.FINISH_X && over) wins.push({ t, w });
  }
  wins.sort((a, b) => a.t - b.t);
  console.log('厚み ' + top + ': 上を越えた ' + wins.length + ' / ' + N + (wins[0] ? '  最速 ' + wins[0].t.toFixed(1) + 's' : ''));
  if (wins[0] && process.env.SHOW) console.log(JSON.stringify({ rear: wins[0].w.rear.filter((_, i) => i % 12 === 0), front: wins[0].w.front.filter((_, i) => i % 12 === 0) }));
}
