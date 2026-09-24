// node test_ghost.js — ゴースト再生の検証（開発用）
//  1) 走行中にタイヤを差し替えた走りを、イベント列から再生して完全一致するか
//  2) URL 用エンコード → デコードで同じイベント列に戻るか、URL の長さ
//  3) 重いゴーストが橋を割っても、自分のコースの橋は割れないか
//  4) おてほん（CPU）が 3 コースとも完走するか
const { DrawCar: D } = require('./physics.js');
const { COURSES, AXLES, DT, dcos, dsin, buildCourse, makeCar, placeAtStart, transferState, stepCar, makeRunner, stepRunner, idealEvents, encodeGhost, decodeGhost } = D;
const circle = (r, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: dcos(i / n * 2 * Math.PI) * r, y: dsin(i / n * 2 * Math.PI) * r }));
const poly = (r, k) => Array.from({ length: k + 1 }, (_, i) => ({ x: dcos(i / k * 2 * Math.PI) * r, y: dsin(i / k * 2 * Math.PI) * r }));
// 手描きっぽい線: 3px 間隔でガタつく丸を 0.5px に丸める（ゲームと同じ扱い）
let seed = 12345; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5;
const hand = r => { const n = Math.round(2 * Math.PI * r / 3); return Array.from({ length: n + 1 }, (_, i) => ({ x: dcos(i / n * 2 * Math.PI) * r + rnd() * 4, y: dsin(i / n * 2 * Math.PI) * r + rnd() * 4 })); };
const q = pts => pts.map(p => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }));
const at = (axle, f) => q(f.map(p => ({ x: axle.x + p.x, y: axle.y + p.y })));
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  OK  ' : '  NG  ') + msg); if (!ok) fails++; };

// ---- 1) ライブ走行（途中で差し替え）と再生の一致
{
  const def = COURSES[1];
  const c = buildCourse(def);
  const wheels = { rear: at(AXLES.rear, hand(60)), front: at(AXLES.front, hand(55)) };
  const events = [{ k: 0, kind: 'rear', pts: wheels.rear }, { k: 0, kind: 'front', pts: wheels.front }];
  const plan = { 700: ['front', at(AXLES.front, poly(60, 4))], 1900: ['rear', at(AXLES.rear, circle(30))], 1901: ['front', at(AXLES.front, circle(30))], 3300: ['rear', []], 3500: ['rear', at(AXLES.rear, hand(66))], 4200: ['front', at(AXLES.front, hand(70))] };
  let car = makeCar(wheels); placeAtStart(c, car); let k = 0;
  while (k < 60 / DT && car.x < c.FINISH_X) {
    if (plan[k]) { const [kind, pts] = plan[k]; wheels[kind] = pts.length ? pts : null; events.push({ k, kind, pts }); car = transferState(car, makeCar(wheels)); }
    stepCar(c, car, DT); k++;
  }
  const liveTime = car.x >= c.FINISH_X ? k * DT : null;
  const r = makeRunner(def, events);
  while (!r.done && r.k < k) stepRunner(r);
  const same = r.car.x === car.x && r.car.y === car.y && r.car.th === car.th && r.car.vx === car.vx && r.car.vy === car.vy && r.car.om === car.om;
  check(same, `ライブと再生が完全一致（x ${car.x.toFixed(2)} / ${r.car.x.toFixed(2)}、タイム ${liveTime ? liveTime.toFixed(2) + '秒' : 'DNF'} / ${r.time ? r.time.toFixed(2) + '秒' : 'DNF'}）`);

  // ---- 2) エンコード往復
  const enc = encodeGhost({ course: 1, time: liveTime || 0, events });
  const dec = decodeGhost(enc);
  const eqEv = dec && dec.events.length === events.length && events.every((e, i) => e.k === dec.events[i].k && e.kind === dec.events[i].kind && e.pts.length === dec.events[i].pts.length && e.pts.every((p, j) => p.x === dec.events[i].pts[j].x && p.y === dec.events[i].pts[j].y));
  check(eqEv, `エンコード → デコードで同じイベント列（${events.length} イベント、点 ${events.reduce((a, e) => a + e.pts.length, 0)}）`);
  check(dec && dec.course === 1 && Math.abs((dec.time || 0) - (liveTime || 0)) < 0.006, `コース番号とタイムも戻る`);
  console.log(`  URL の長さ: ${('https://renmy-stack.github.io/draw-car/#g=' + enc).length} 文字`);
  const r2 = makeRunner(def, dec.events);
  while (!r2.done && r2.k < k) stepRunner(r2);
  check(r2.car.x === car.x && r2.car.y === car.y, 'デコードしたイベントからの再生も一致');
}

// ---- 3) 橋の独立性
{
  const def = COURSES[0];
  const heavy = { rear: at(AXLES.rear, circle(80)), front: at(AXLES.front, circle(80)) };
  const light = { rear: at(AXLES.rear, circle(68)), front: at(AXLES.front, circle(68)) };
  const gh = makeRunner(def, [{ k: 0, kind: 'rear', pts: heavy.rear }, { k: 0, kind: 'front', pts: heavy.front }]);
  const c = buildCourse(def); let car = makeCar(light); placeAtStart(c, car);
  for (let k = 0; k < 20 / DT && car.x < c.FINISH_X; k++) { stepCar(c, car, DT); stepRunner(gh); }
  check(gh.course.BRIDGES[0].broken === true, 'ゴースト（丸80）は自分のコースの橋を割った');
  check(c.BRIDGES[0].broken === false, '自分（丸68）のコースの橋は割れていない');
  check(car.x > c.BRIDGES[0].x1 + 50, `自分は橋を渡りきった（${(car.x).toFixed(0)}px）`);
}

// ---- 4) おてほん
for (let i = 0; i < COURSES.length; i++) {
  const g = idealEvents(COURSES[i]);
  const r = makeRunner(COURSES[i], g.events);
  while (!r.done && r.k < 120 / DT) stepRunner(r);
  check(g.time && r.time && Math.abs(g.time - r.time) < 1e-9, `おてほん コース${i + 1}: ${g.time ? g.time.toFixed(2) + '秒' : 'DNF'}（再生 ${r.time ? r.time.toFixed(2) + '秒' : 'DNF'}、イベント ${g.events.length}）`);
}
console.log(fails ? `\n${fails} 件 NG` : '\nすべて OK');
process.exit(fails ? 1 : 0);
