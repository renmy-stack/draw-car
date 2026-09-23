// node test_physics.js [制限秒] — 代表的なタイヤで3コースを走らせ、タイムを出す（git 管理外の開発用）
const { DrawCar } = require('./physics.js');
const { COURSES, AXLES, buildCourse, makeCar, placeAtStart, stepCar, clampWheel, DT } = DrawCar;
const shape = (axle, f) => f.map(p => ({ x: axle.x + p.x, y: axle.y + p.y }));
const circle = (r, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: Math.cos(i / n * 2 * Math.PI) * r, y: Math.sin(i / n * 2 * Math.PI) * r }));
const poly = (r, k) => Array.from({ length: k + 1 }, (_, i) => ({ x: Math.cos(i / k * 2 * Math.PI) * r, y: Math.sin(i / k * 2 * Math.PI) * r }));
const star = (r, k = 5) => Array.from({ length: 2 * k + 1 }, (_, i) => { const rr = i % 2 ? r * 0.45 : r; return { x: Math.cos(i / (2 * k) * 2 * Math.PI) * rr, y: Math.sin(i / (2 * k) * 2 * Math.PI) * rr }; });
const stick = r => [{ x: -r, y: 0 }, { x: r, y: 0 }];
const SHAPES = {
  'まる大(68)': circle(68), 'まる中(45)': circle(45), 'まる小(25)': circle(25), 'しかく(60)': poly(60, 4), 'さんかく(60)': poly(60, 3),
  'ほし(65)': star(65), 'ぼう(60)': stick(60), 'まる大+なし': null,
};
const square = poly(60, 4);
const BIG = circle(68), SMALL = circle(30);
const BEST = { wall: square, tunnel: SMALL };   // それ以外は 丸68
// 区間に入るたびに最適な形へ描き替える「理想プレイ」
function idealRun(c) {
  const mk = f => ({ rear: clampWheel(shape(AXLES.rear, f), AXLES.rear), front: clampWheel(shape(AXLES.front, f), AXLES.front) });
  let cur = null, b = null, t = 0;
  const sw = f => { const nb = makeCar(mk(f)); if (b) { nb.x = b.x; nb.y = b.y; nb.vx = b.vx; nb.vy = b.vy; nb.joints.forEach((j, i) => { j.w = b.joints[i].w; }); } else placeAtStart(c, nb); b = nb; cur = f; };
  sw(BIG);
  while (t < 120 && b.x < c.FINISH_X) {
    const s = c.SECTIONS.find(s => b.x + 40 >= s.from && b.x + 40 < s.to);
    let want = (s && BEST[s.type]) || BIG;
    if (c.TUNNELS.some(tn => b.x - 90 < tn.x1 && b.x + 50 > tn.x0)) want = SMALL;   // トンネルを抜けきるまでは小さいまま
    if (want !== cur) sw(want);
    stepCar(c, b, DT); t += DT;
  }
  return b.x >= c.FINISH_X ? t : Infinity;
}
const limit = +(process.argv[2] || 90);
for (let ci = 0; ci < COURSES.length; ci++) {
  const c = buildCourse(COURSES[ci]);
  console.log(`\n== コース${ci + 1} ${COURSES[ci].name}  長さ ${c.FINISH_X}px  区間: ${c.SECTIONS.map(s => s.label).join(' ')}`);
  const it = idealRun(c); console.log(`  理想プレイ（区間ごとに切替）: ${isFinite(it) ? it.toFixed(2) + '秒' : 'DNF'}`);
  for (const [name, f] of Object.entries(SHAPES)) {
    const wheels = f ? { rear: clampWheel(shape(AXLES.rear, f), AXLES.rear), front: clampWheel(shape(AXLES.front, f), AXLES.front) }
                     : { rear: clampWheel(shape(AXLES.rear, circle(68)), AXLES.rear), front: null };
    const b = makeCar(wheels); placeAtStart(c, b);
    let t = 0, maxX = 0, stuckAt = '';
    while (t < limit) { stepCar(c, b, DT); t += DT; maxX = Math.max(maxX, b.x); if (b.x >= c.FINISH_X) break; }
    if (b.x < c.FINISH_X) { const s = c.SECTIONS.find(s => maxX >= s.from && maxX < s.to); stuckAt = s ? s.label : (maxX < c.SECTIONS[0].from ? 'スタート前' : 'ゴール前'); }
    console.log(`  ${name.padEnd(12)} ${b.x >= c.FINISH_X ? t.toFixed(2).padStart(6) + '秒' : 'DNF     '}  最大到達 ${maxX.toFixed(0).padStart(5)}${stuckAt ? '（' + stuckAt + ' で停止）' : ''}`);
  }
}
