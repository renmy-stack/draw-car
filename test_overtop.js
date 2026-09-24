// node test_overtop.js — トンネル・もんの天井ブロックに「上から乗って越える」裏技ができるタイヤを調べる（開発用）
// 厚みは physics.js の BLOCK_T
const { DrawCar } = require('./physics.js');
const { AXLES, buildCourse, resetCourse, makeCar, placeAtStart, stepCar, DT } = DrawCar;
const at = (axle, f) => f.map(p => ({ x: axle.x + p.x, y: axle.y + p.y }));
const circle = (r, cy = 0, n = 48) => Array.from({ length: n + 1 }, (_, i) => ({ x: Math.cos(i / n * 2 * Math.PI) * r, y: cy + Math.sin(i / n * 2 * Math.PI) * r }));
const ellipse = (rx, ry, cy = 0, n = 48) => Array.from({ length: n + 1 }, (_, i) => ({ x: Math.cos(i / n * 2 * Math.PI) * rx, y: cy + Math.sin(i / n * 2 * Math.PI) * ry }));
const poly = (r, k, cy = 0) => Array.from({ length: k + 1 }, (_, i) => ({ x: Math.cos(i / k * 2 * Math.PI) * r, y: cy + Math.sin(i / k * 2 * Math.PI) * r }));
const star = (r, k, inner, cy = 0) => Array.from({ length: 2 * k + 1 }, (_, i) => { const rr = i % 2 ? r * inner : r; return { x: Math.cos(i / (2 * k) * 2 * Math.PI) * rr, y: cy + Math.sin(i / (2 * k) * 2 * Math.PI) * rr }; });
// パッドの中（軸から 左右 ±90・上 100・下 80）に収まる形だけ
const SHAPES = {
  '丸80': circle(80), '丸90(上寄せ)': circle(90, -10), 'だ円95x90': ellipse(95, 90, -10), '四角90': poly(90, 4, -10),
  '三角95': poly(95, 3, -10), '星95': star(95, 5, 0.4, -10), '十字95': [{ x: -90, y: 0 }, { x: 90, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -100 }, { x: 0, y: 80 }],
  '棒(縦)': [{ x: 0, y: -100 }, { x: 0, y: 80 }], '丸68(正攻法)': circle(68),
};
const SECS = { tunnel: ['tunnel', { len: 300 }], tunnel360: ['tunnel', { len: 360 }], gate: ['gate', { h: 72, c: 110, len: 120 }] };
for (const [name, sec] of Object.entries(SECS)) {
  const c = buildCourse({ sections: [sec] });
  const tn = c.TUNNELS[0];
  console.log('\n' + name + '  ブロックの上端 = 地面から ' + Math.round(terrainY(c, tn.x0) - tn.top));
  for (const [sn, f] of Object.entries(SHAPES)) {
    resetCourse(c);
    const b = makeCar({ rear: at(AXLES.rear, f), front: at(AXLES.front, f) }); placeAtStart(c, b);
    let t = 0, over = false;
    while (t < 40 && b.x < c.FINISH_X) { stepCar(c, b, DT); t += DT; if (b.x > tn.x0 && b.x < tn.x1 && b.y < tn.top) over = true; }
    const done = b.x >= c.FINISH_X;
    console.log('  ' + sn.padEnd(12) + (done ? (over ? '★上を越えた ' : '下をくぐった ') + t.toFixed(1) + 's' : 'x（止まった x=' + Math.round(b.x - tn.x0) + '）'));
  }
}
function terrainY(c, x) { return DrawCar.terrain ? DrawCar.terrain(c, x) : c.H[Math.floor(x / DrawCar.TSTEP)]; }
