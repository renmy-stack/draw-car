// node test_sections.js — 区間ごとに、どの形のタイヤが通れるかを表にする（開発用）
const { DrawCar } = require('./physics.js');
const { AXLES, buildCourse, resetCourse, makeCar, placeAtStart, stepCar, DT } = DrawCar;
const shape = (axle, f) => f.map(p => ({ x: axle.x + p.x, y: axle.y + p.y }));
const circle = (r, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: Math.cos(i / n * 2 * Math.PI) * r, y: Math.sin(i / n * 2 * Math.PI) * r }));
const poly = (r, k) => Array.from({ length: k + 1 }, (_, i) => ({ x: Math.cos(i / k * 2 * Math.PI) * r, y: Math.sin(i / k * 2 * Math.PI) * r }));
const star = (r, k, inner) => Array.from({ length: 2 * k + 1 }, (_, i) => { const rr = i % 2 ? r * inner : r; return { x: Math.cos(i / (2 * k) * 2 * Math.PI) * rr, y: Math.sin(i / (2 * k) * 2 * Math.PI) * rr }; });
const stick = r => [{ x: -r, y: 0 }, { x: r, y: 0 }];
const cross = r => [{ x: -r, y: 0 }, { x: r, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -r }, { x: 0, y: r }];
const SHAPES = { '丸68': circle(68), '丸45': circle(45), '丸30': circle(30), '四角60': poly(60, 4), '三角60': poly(60, 3),
  '星65': star(65, 5, 0.45), '歯車65': star(65, 10, 0.75), '棒60': stick(60), '十字60': cross(60), '丸80': circle(80), '四角80': poly(80, 4) };
const SECTIONS = [
  ['hills', { len: 700, amp: 36 }], ['bumps', { len: 400, amp: 8 }], ['stairs', { n: 3, h: 30, gap: 110 }], ['stairs', { n: 4, h: 36, gap: 90 }],
  ['wave', { len: 500, dh: 80 }], ['pits', { n: 2, w: 60, d: 28, gap: 120 }], ['pits', { n: 3, w: 65, d: 30, gap: 110 }], ['bigpit', { w: 100, d: 55 }],
  ['hurdles', { n: 3, h: 22, w: 12, gap: 90 }], ['hurdles', { n: 4, h: 26, w: 12, gap: 80 }], ['sawtooth', { n: 4, len: 90, h: 40 }],
  ['ice', { len: 500, dh: -120 }], ['cliff', { dh: 120 }], ['steep', { len: 220, dh: -100 }], ['mud', { len: 400 }], ['belt', { len: 420, speed: -180 }],
  ['wall', { h: 72 }], ['tunnel', { len: 360 }], ['gate', { h: 72, c: 110, len: 120 }], ['bridge', { len: 560, d: 80, limit: 72 }],
];
const limit = 40;
console.log('区間'.padEnd(26) + Object.keys(SHAPES).map(k => k.padEnd(9)).join(''));
for (const sec of SECTIONS) {
  const c = buildCourse({ sections: [sec] });
  let row = (sec[0] + ' ' + JSON.stringify(sec[1])).padEnd(26);
  for (const f of Object.values(SHAPES)) {
    const wheels = { rear: shape(AXLES.rear, f), front: shape(AXLES.front, f) };
    resetCourse(c);
    const b = makeCar(wheels); placeAtStart(c, b);
    let t = 0; while (t < limit && b.x < c.FINISH_X) { stepCar(c, b, DT); t += DT; }
    row += (b.x >= c.FINISH_X ? t.toFixed(1) + 's' : '  x  ').padEnd(9);
  }
  console.log(row);
}
