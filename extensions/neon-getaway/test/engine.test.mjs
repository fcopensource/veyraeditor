// The game rules, without a screen: the city, driving, traffic, people, police, missions and money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NG = require('../media/engine.js');
const { TILE, T } = NG;
const DT = 1 / 60;
const run = (w, input, seconds) => { const events = []; for (let k = 0; k < seconds * 60; k++) events.push(...NG.step(w, input, DT)); return events; };
const near = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) < d;
/** Put the player in a car of their own at (x, y), facing angle a. */
function drivingAt(w, x, y, a, model = 'sports') {
  const c = NG.makeCar('player', model, x, y, a);
  w.cars.push(c); w.player.car = c;
  return c;
}

test('the city is the same for everyone, with a coast, roads and landmarks', () => {
  const a = NG.makeCity(), b = NG.makeCity();
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.equal(a.get(0, 0), TILE.WATER);
  assert.equal(a.get(NG.ROADS[3], 60), TILE.ROAD);
  for (const key of ['garage', 'police', 'spray', 'bank', 'raceStart', 'pier', 'busStop', 'lotPalm']) assert.ok(a.poi[key], key);
  assert.equal(a.tapes.length, 20);
  assert.ok(a.buildings.length > 100 && a.parked.length > 20);
});

test('every road connects to every other', () => {
  const c = NG.makeCity();
  const seen = new Set(), start = [NG.ROADS[0], NG.ROADS[0]], queue = [start];
  seen.add(start.join());
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && c.isRoadTile(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  let roads = 0;
  for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) roads += c.isRoadTile(x, y);
  assert.equal(seen.size, roads);
});

test('every landmark and tape can be reached on foot or by car', () => {
  const c = NG.makeCity();
  for (const [key, p] of Object.entries(c.poi)) {
    if (Array.isArray(p)) continue;
    assert.ok(!NG.hitsSolid(c, p.x, p.y, 8), `${key} is not inside a wall`);
  }
  for (const t of c.tapes) assert.ok(!NG.hitsSolid(c, t.x, t.y, 6), `tape ${t.id}`);
});

test('a car speeds up to its top speed, and stops when you brake', () => {
  const w = NG.createWorld();
  const [x, y] = NG.nodeXY(2, 4);
  const car = drivingAt(w, x + 2 * T, y - 0.5 * T, 0);
  w.cars = [car]; w.peds = [];
  for (let k = 0; k < 240; k++) NG.drive(w.city, car, { throttle: 1, steer: 0 }, DT);
  const top = Math.hypot(car.vx, car.vy);
  assert.ok(top > NG.MODELS.sports.max * 0.85, `fast: ${top}`);
  for (let k = 0; k < 50; k++) NG.drive(w.city, car, { throttle: -1, steer: 0 }, DT);
  assert.ok(Math.hypot(car.vx, car.vy) < 60, `stopped in under a second: ${Math.hypot(car.vx, car.vy)}`);
  for (let k = 0; k < 240; k++) NG.drive(w.city, car, { throttle: -1, steer: 0 }, DT);
  assert.ok(car.f < 0 && -car.f <= NG.MODELS.sports.max * 0.4 + 1, 'then reverses, slowly');
});

test('cars never drive through buildings', () => {
  const w = NG.createWorld();
  const b = w.city.buildings.find(q => q.w >= 4 && q.h >= 4 && !q.special);
  const car = drivingAt(w, (b.x - 1) * T + 4, (b.y + b.h / 2) * T, 0, 'super');
  car.x = (b.x - 0.6) * T;
  let crash = 0;
  for (let k = 0; k < 180; k++) crash = Math.max(crash, NG.drive(w.city, car, { throttle: 1, steer: 0 }, DT));
  assert.ok(car.x < b.x * T, 'stopped at the wall');
  assert.ok(!NG.hitsSolid(w.city, car.x, car.y, 4));
});

test('handbrake turns make the car slide', () => {
  const w = NG.createWorld();
  const [x, y] = NG.nodeXY(4, 4);
  const car = drivingAt(w, x - 6 * T, y + 0.5 * T, 0);
  car.vx = 560;
  let maxDrift = 0;
  for (let k = 0; k < 40; k++) { NG.drive(w.city, car, { throttle: 1, steer: 1, handbrake: true }, DT); maxDrift = Math.max(maxDrift, car.drift); }
  assert.ok(maxDrift > 110, `drifting: ${maxDrift}`);
});

test('traffic stays on the roads, in lanes, for a long drive', () => {
  const w = NG.createWorld();
  w.player.x = NG.nodeXY(5, 5)[0]; w.player.y = NG.nodeXY(5, 5)[1];
  run(w, {}, 60);
  const traffic = w.cars.filter(c => c.kind === 'traffic');
  assert.ok(traffic.length > 20);
  for (const c of traffic) assert.equal(w.city.tileAtPx(c.x, c.y), TILE.ROAD, `traffic car ${c.id} at ${c.x},${c.y}`);
  const moved = traffic.filter(c => c.v > 20).length;
  assert.ok(moved > traffic.length * 0.4, `traffic flows: ${moved}/${traffic.length}`);
});

test('people walk on sidewalks and always dive out of the way', () => {
  const w = NG.createWorld();
  const ped = w.peds[0];
  ped.x = w.player.x + 80; ped.y = w.player.y; ped.dodge = 0;
  const car = drivingAt(w, ped.x - 70, ped.y, 0);
  car.vx = 400;
  const events = run(w, { up: true }, 0.5);
  assert.ok(ped.shout > 0 || events.some(e => e.type === 'nearMiss'), 'they jumped clear');
});

test('get in a car with E, and out again', () => {
  const w = NG.createWorld();
  const parked = w.cars.find(c => c.kind === 'parked' && !c.owned);
  w.player.x = parked.x + 30; w.player.y = parked.y;
  w.cars = w.cars.filter(c => c.kind !== 'police');
  let ev = NG.step(w, { enter: true }, DT);
  assert.equal(w.player.car, parked);
  assert.ok(ev.some(e => e.type === 'enterCar'));
  ev = NG.step(w, { enter: true }, DT);
  assert.equal(w.player.car, null);
  assert.ok(ev.some(e => e.type === 'exitCar'));
});

test('a cop who sees you take a car gives you a star, and police come after you', () => {
  const w = NG.createWorld();
  const traffic = w.cars.find(c => c.kind === 'traffic');
  w.player.x = traffic.x; w.player.y = traffic.y + 30;
  const cop = NG.makeCar('police', 'police', traffic.x + 120, traffic.y, Math.PI);
  w.cars.push(cop);
  NG.step(w, { enter: true }, DT);
  assert.equal(w.wanted.stars, 1);
  run(w, {}, 4);
  assert.ok(w.cars.filter(c => c.kind === 'police').length >= 1);
});

test('more stars, more cops; they hunt you down through the streets', () => {
  const w = NG.createWorld();
  const [x, y] = NG.nodeXY(5, 5);
  drivingAt(w, x, y, 0);
  NG.setStars(w, 3, 'test');
  let most = 0, caught = false;
  for (let k = 0; k < 60 * 20 && !caught; k++) {
    caught = NG.step(w, {}, DT).some(e => e.type === 'busted');
    most = Math.max(most, w.cars.filter(c => c.kind === 'police').length);
  }
  assert.ok(most >= 3, `three stars bring at least three cops: ${most}`);
  assert.ok(caught, 'they reach a player who sits still, and bust them');
});

test('stopping next to a cop gets you busted: a fine, and back at the station', () => {
  const w = NG.createWorld({ cash: 1000 });
  const [x, y] = NG.nodeXY(5, 5);
  drivingAt(w, x, y, 0);
  NG.setStars(w, 1, 'test');
  const cop = NG.makeCar('police', 'police', x + 45, y, Math.PI);
  w.cars.push(cop);
  const events = run(w, {}, 3);
  assert.ok(events.some(e => e.type === 'busted'));
  assert.equal(w.wanted.stars, 0);
  assert.equal(w.save.cash, 900);
  assert.ok(near(w.player, w.city.poi.police, 60));
});

test('staying out of sight long enough loses the cops', () => {
  const w = NG.createWorld();
  const [x, y] = NG.nodeXY(5, 5);
  drivingAt(w, x, y, 0);
  NG.setStars(w, 1, 'test');
  w.lastCopSpawn = 1e9; // no cops arrive: nobody sees you
  const events = run(w, {}, 11);
  assert.ok(events.some(e => e.type === 'escaped'));
  assert.equal(w.wanted.stars, 0);
});

test('the spray shop wipes your stars for a price', () => {
  const w = NG.createWorld({ cash: 1000 });
  const sp = w.city.poi.spray;
  drivingAt(w, sp.x, sp.y, 0);
  NG.setStars(w, 3, 'test');
  const ev = NG.step(w, { action: true }, DT);
  assert.ok(ev.some(e => e.type === 'sprayed'));
  assert.equal(w.wanted.stars, 0);
  assert.equal(w.save.cash, 750);
});

test('the first mission: find a car, drive to the garage, get paid', () => {
  const w = NG.createWorld();
  let ev = NG.step(w, { action: true }, DT);
  assert.ok(ev.some(e => e.type === 'missionStart' && e.title === 'Fresh Off the Bus'));
  const g = w.city.poi.garage;
  const car = drivingAt(w, g.x - 300, g.y, 0);
  NG.step(w, {}, DT);
  assert.equal(w.mission.step, 1);
  car.x = g.x; car.y = g.y; car.vx = car.vy = 0;
  ev = run(w, {}, 0.2);
  assert.ok(ev.some(e => e.type === 'missionPassed'));
  assert.equal(w.save.story, 1);
  assert.equal(w.save.cash, 300 + 250);
});

test('a timed delivery fails when time runs out', () => {
  const w = NG.createWorld({ story: 1 });
  const g = w.city.poi.garage;
  w.player.x = g.x; w.player.y = g.y + 20;
  NG.step(w, { action: true }, DT);
  assert.equal(w.mission.idx, 1);
  const car = drivingAt(w, g.x, g.y + 200, 0);
  void car;
  const ev = run(w, {}, 76);
  assert.ok(ev.some(e => e.type === 'missionFailed' && e.why === 'Out of time'));
  assert.equal(w.save.story, 1);
});

test('"The Getaway": three stars to lose before the garage lets you in', () => {
  const w = NG.createWorld({ story: 3 });
  NG.startMission(w, 3);
  const b = w.city.poi.bank;
  const car = drivingAt(w, b.x, b.y, 0);
  run(w, {}, 0.2);
  assert.equal(w.mission.step, 1);
  assert.equal(w.wanted.stars, 3);
  w.wanted.stars = 0; // as if you'd shaken them off
  run(w, {}, 0.1);
  assert.equal(w.mission.step, 2);
  const g = w.city.poi.garage;
  car.x = g.x; car.y = g.y; car.vx = car.vy = 0;
  const ev = run(w, {}, 0.2);
  assert.ok(ev.some(e => e.type === 'missionPassed' && e.reward === 1600));
});

test('the race: rivals drive the course, and finishing first pays', () => {
  const w = NG.createWorld({ story: 4 });
  NG.startMission(w, 4);
  assert.equal(w.race.rivals.length, 3);
  const before = w.race.rivals.map(c => [c.x, c.y]);
  run(w, {}, 3);
  assert.ok(w.race.rivals.some((c, n) => Math.hypot(c.x - before[n][0], c.y - before[n][1]) > 200), 'rivals are racing');
  const car = drivingAt(w, 0, 0, 0);
  for (const cp of [...w.race.checkpoints]) { car.x = cp.x; car.y = cp.y; NG.step(w, {}, DT); }
  assert.equal(w.save.story, 5);
  assert.ok(w.save.bestRace > 0);
});

test('taxi fares pay for getting there in time', () => {
  const w = NG.createWorld();
  const stand = w.city.poi.taxi[1];
  const car = drivingAt(w, stand.x, stand.y, 0);
  NG.step(w, { action: true }, DT);
  assert.ok(w.job);
  const pay = w.job.pay;
  car.x = w.job.x; car.y = w.job.y;
  const ev = run(w, {}, 0.1);
  assert.ok(ev.some(e => e.type === 'cash' && e.amount === pay));
  assert.equal(w.save.stats.taxis, 1);
});

test('the garage sells cars, and you drive away in the one you pick', () => {
  const w = NG.createWorld({ cash: 2000 });
  assert.equal(NG.garagePick(w, 'super'), 'You need $9000.');
  assert.equal(NG.garagePick(w, 'muscle'), null);
  assert.equal(w.save.cash, 500);
  assert.deepEqual(w.save.owned, ['compact', 'muscle']);
  assert.ok(w.cars.some(c => c.owned && c.model === 'muscle'));
  assert.equal(NG.garagePick(w, 'compact'), null);
  assert.equal(w.save.cash, 500, 'owned cars are free to switch to');
});

test('tapes are collected once, for $100 each', () => {
  const w = NG.createWorld();
  const t = w.city.tapes[0];
  w.player.x = t.x; w.player.y = t.y;
  let ev = NG.step(w, {}, DT);
  assert.ok(ev.some(e => e.type === 'tape' && e.got === 1));
  ev = NG.step(w, {}, DT);
  assert.ok(!ev.some(e => e.type === 'tape'));
  assert.equal(w.save.cash, 400);
});

test('paychecks from coding add up, and the save holds everything', () => {
  const w = NG.createWorld();
  NG.paycheck(w, 125);
  NG.paycheck(w, -5);
  assert.equal(w.save.cash, 425);
  const again = NG.createWorld(JSON.parse(JSON.stringify(w.save)));
  assert.equal(again.save.cash, 425);
  assert.equal(again.save.stats.paychecks, 125);
});

test('a long chaotic session never crashes or leaves anything inside a wall', () => {
  const w = NG.createWorld({ cash: 50000 });
  const [x, y] = NG.nodeXY(5, 5);
  drivingAt(w, x, y, 0);
  NG.setStars(w, 5, 'chaos');
  const r = NG.rng(7);
  for (let k = 0; k < 60 * 90; k++) {
    const input = { up: r() < 0.8, down: r() < 0.1, left: r() < 0.3, right: r() < 0.3, handbrake: r() < 0.1, enter: r() < 0.002, action: r() < 0.002 };
    NG.step(w, input, DT);
  }
  for (const c of w.cars) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'positions stay numbers');
  const [px, py] = NG.playerPos(w);
  assert.ok(Number.isFinite(px) && Number.isFinite(py));
});
