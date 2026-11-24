/*
 * Neon Getaway: the game itself, with no drawing. The city, cars, traffic, people, police, missions and money.
 * Runs in the VS Code webview (window.NG) and in Node for the tests (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ basics

  const T = 32; // world pixels per tile
  const TILE = { WATER: 0, SAND: 1, ROAD: 2, WALK: 3, BUILD: 4, GRASS: 5, TREE: 6, LOT: 7, PIER: 8 };
  const W = 128, H = 128;
  const ROADS = []; for (let p = 10; p <= 118; p += 12) ROADS.push(p); // each road line is 2 tiles: p and p+1
  const ROAD_MIN = ROADS[0], ROAD_MAX = ROADS[ROADS.length - 1] + 1;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N
  const PED_TILES = new Set([TILE.WALK, TILE.LOT, TILE.GRASS, TILE.SAND, TILE.PIER]);

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  /** mulberry32: a small seeded random generator, so every player gets the same city. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  const MODELS = {
    compact: { name: 'Bolt Compact', max: 430, accel: 330, brake: 760, turn: 3.2, grip: 0.8, len: 34, wid: 17, price: 0, colors: ['#4cdcf2', '#f7d154', '#ff6b9a', '#9ad16f', '#e9e4dc'] },
    muscle: { name: 'Pulse GT', max: 545, accel: 410, brake: 780, turn: 2.85, grip: 0.76, len: 40, wid: 19, price: 1500, colors: ['#ff4f6d', '#f39a2b', '#1c1c28'] },
    sports: { name: 'Vapor S', max: 635, accel: 490, brake: 860, turn: 3.25, grip: 0.84, len: 38, wid: 18, price: 4000, colors: ['#b79bff', '#68f4d1', '#ff3fa4'] },
    super: { name: 'Hyperion', max: 725, accel: 570, brake: 920, turn: 3.35, grip: 0.87, len: 40, wid: 19, price: 9000, colors: ['#fdf05a', '#ffffff', '#ff7b2e'] },
    taxi: { name: 'City Cab', max: 440, accel: 320, brake: 760, turn: 3.0, grip: 0.8, len: 36, wid: 18, price: 0, colors: ['#ffd33d'] },
    van: { name: 'Haul Van', max: 360, accel: 240, brake: 640, turn: 2.4, grip: 0.82, len: 42, wid: 20, price: 0, colors: ['#d9dde4', '#5b6b8c', '#7f5539'] },
    police: { name: 'Patrol Interceptor', max: 590, accel: 470, brake: 860, turn: 3.05, grip: 0.84, len: 40, wid: 19, price: 0, colors: ['#10131c'] },
  };
  const GARAGE = ['compact', 'muscle', 'sports', 'super'];

  // ------------------------------------------------------------------ the city

  const DISTRICTS = [
    { name: 'Neon Heights', tall: [5, 12], parks: 0.08, lots: 0.08, roof: ['#2a2350', '#1f2a4f', '#2f2046'], neon: ['#ff3fa4', '#4cdcf2', '#b79bff'] },
    { name: 'Palm Shore', tall: [1, 3], parks: 0.28, lots: 0.12, roof: ['#3d3358', '#4a3a52', '#2f3f55'], neon: ['#ffd35c', '#ff7b9c', '#68f4d1'] },
    { name: 'Dockside', tall: [2, 4], parks: 0.05, lots: 0.3, roof: ['#32323e', '#3a3328', '#2c3238'], neon: ['#f39a2b', '#fdf05a', '#4cdcf2'] },
    { name: 'Old Town', tall: [2, 5], parks: 0.16, lots: 0.12, roof: ['#3b2a30', '#2d3a34', '#3a3245'], neon: ['#68f4d1', '#ff6b6b', '#ffd35c'] },
  ];
  const districtAt = (tx, ty) => DISTRICTS[(tx >= W / 2 ? 1 : 0) + (ty >= H / 2 ? 2 : 0)];

  /** Block (i, j) spans tiles ROADS[i]+2 .. ROADS[i+1]-1; its 8x8 inside starts one tile in. */
  const blockOrigin = (i, j) => [ROADS[i] + 3, ROADS[j] + 3];
  const SPECIAL = {
    garage: [4, 4, "Rico's Garage", '#68f4d1'],
    police: [2, 6, 'Police HQ', '#4c8dff'],
    spray: [6, 2, 'Fresh Coat Spray', '#ff3fa4'],
    bank: [1, 1, 'Solara Savings', '#ffd35c'],
    raceStart: [7, 6, 'Race Start', '#fdf05a'],
  };

  function makeCity(seed = 1986) {
    const r = rng(seed);
    const tiles = new Uint8Array(W * H).fill(TILE.WALK);
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };
    const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? TILE.WATER : tiles[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge < 5) set(x, y, TILE.WATER); else if (edge < 8) set(x, y, TILE.SAND);
    }
    for (const p of ROADS) for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
      set(p, k, TILE.ROAD); set(p + 1, k, TILE.ROAD); set(k, p, TILE.ROAD); set(k, p + 1, TILE.ROAD);
    }

    const buildings = [], parked = [], trees = [], poi = {}, lots = [];
    const special = {};
    for (const [key, [i, j]] of Object.entries(SPECIAL)) special[`${i},${j}`] = key;

    const addBuilding = (x, y, w, h, d, extra) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, TILE.BUILD);
      buildings.push(Object.assign({ x, y, w, h, floors: Math.round(d.tall[0] + r() * (d.tall[1] - d.tall[0])), roof: pick(r, d.roof), neon: pick(r, d.neon), seed: Math.floor(r() * 1e9) }, extra || {}));
    };

    for (let i = 0; i < ROADS.length - 1; i++) for (let j = 0; j < ROADS.length - 1; j++) {
      const [ox, oy] = blockOrigin(i, j);
      const d = districtAt(ox + 4, oy + 4);
      const key = special[`${i},${j}`];
      if (key) {
        const [, , label, colour] = SPECIAL[key];
        if (key === 'raceStart') { // an open plaza
          for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) set(ox + xx, oy + yy, TILE.LOT);
        } else {
          addBuilding(ox, oy, 8, 5, d, { label, neon: colour, special: key, floors: key === 'bank' ? 14 : 4 });
          for (let yy = 5; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) set(ox + xx, oy + yy, TILE.LOT);
        }
        poi[key] = { x: (ox + 4) * T, y: (oy + 6.5) * T, label, colour };
        continue;
      }
      const roll = r();
      if (roll < d.parks) { // a park with trees
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) set(ox + xx, oy + yy, TILE.GRASS);
        for (let n = 0; n < 7; n++) {
          const tx = ox + 1 + Math.floor(r() * 6), ty = oy + 1 + Math.floor(r() * 6);
          if (get(tx, ty) === TILE.GRASS && (tx - ox) % 3 !== 2) { set(tx, ty, TILE.TREE); trees.push([tx, ty]); }
        }
      } else if (roll < d.parks + d.lots) { // a parking lot
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) set(ox + xx, oy + yy, TILE.LOT);
        lots.push({ x: (ox + 4) * T, y: (oy + 4) * T, district: d.name });
        for (let row = 0; row < 2; row++) for (let n = 0; n < 4; n++) if (r() < 0.55) {
          const model = r() < 0.12 ? 'muscle' : r() < 0.1 ? 'van' : 'compact';
          parked.push({ model, x: (ox + 1 + n * 2) * T, y: (oy + 1.5 + row * 5) * T, a: Math.PI / 2 + (row ? Math.PI : 0), color: pick(r, MODELS[model].colors) });
        }
      } else { // buildings with alleys between them
        const plan = pick(r, [[[0, 0, 8, 8]], [[0, 0, 4, 8], [5, 0, 3, 8]], [[0, 0, 8, 4], [0, 5, 8, 3]], [[0, 0, 4, 4], [5, 0, 3, 4], [0, 5, 4, 3], [5, 5, 3, 3]]]);
        for (const [x, y, w, h] of plan) addBuilding(ox + x, oy + y, w, h, d);
      }
    }

    // The pier: a boardwalk out over the water from the south beach, where the boat leaves.
    const px = ROADS[5] + 6;
    for (let y = ROAD_MAX + 1; y < H - 1; y++) for (let x = px; x < px + 4; x++) set(x, y, TILE.PIER);
    poi.pier = { x: (px + 2) * T, y: (H - 3) * T, label: 'The Pier', colour: '#4cdcf2' };
    poi.busStop = { x: (ROADS[4] + 2.5) * T, y: (ROADS[5] - 0.5) * T, label: 'Bus stop', colour: '#e9e4dc' };
    // A Vapor S waits in a Palm Shore lot for the "Hot Wheels" job.
    const palm = lots.find(l => l.district === 'Palm Shore') || lots[0];
    poi.lotPalm = { x: palm.x, y: palm.y, label: 'Palm Shore lot', colour: '#b79bff' };
    poi.taxi = [poi.busStop, { x: (ROADS[7] + 2.5) * T, y: (ROADS[2] - 0.5) * T }, { x: (ROADS[2] + 2.5) * T, y: (ROADS[7] - 0.5) * T }]
      .map((p, n) => ({ x: p.x, y: p.y, label: `Taxi stand ${n + 1}`, colour: '#ffd33d' }));

    // Twenty cassette tapes, hidden on sidewalks, in parks and on the beach.
    const tapes = [];
    for (let guard = 0; tapes.length < 20 && guard < 20000; guard++) {
      const tx = 6 + Math.floor(r() * (W - 12)), ty = 6 + Math.floor(r() * (H - 12));
      const t = get(tx, ty);
      if ((t === TILE.WALK || t === TILE.GRASS || t === TILE.SAND) && tapes.every(p => Math.abs(p.tx - tx) + Math.abs(p.ty - ty) > 14))
        tapes.push({ id: tapes.length, tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T });
    }

    const city = {
      seed, W, H, T, tiles, buildings, parked, trees, poi, lots, tapes,
      get, tileAtPx: (x, y) => get(Math.floor(x / T), Math.floor(y / T)),
      isRoadTile: (x, y) => get(x, y) === TILE.ROAD,
      districtAtPx: (x, y) => districtAt(x / T, y / T).name,
    };
    return city;
  }

  const solid = t => t === TILE.WATER || t === TILE.BUILD || t === TILE.TREE;
  const slow = t => t === TILE.SAND || t === TILE.GRASS;

  /** Does a circle at (x, y) touch a wall, a building, a tree or the sea? */
  function hitsSolid(city, x, y, r) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solid(city.get(tx, ty))) continue;
      const cx = clamp(x, tx * T, tx * T + T), cy = clamp(y, ty * T, ty * T + T);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Nothing solid on the straight line between two points. */
  function lineOfSight(city, ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by), n = Math.ceil(d / 20);
    for (let k = 1; k < n; k++) if (solid(city.tileAtPx(ax + (bx - ax) * k / n, ay + (by - ay) * k / n))) return false;
    return true;
  }

  // Road network: intersections are a 10 x 10 grid of nodes.
  const nodeXY = (i, j) => [(ROADS[i] + 1) * T, (ROADS[j] + 1) * T];
  function nearestNode(x, y) {
    let bi = 0, bj = 0, best = Infinity;
    for (let i = 0; i < ROADS.length; i++) for (let j = 0; j < ROADS.length; j++) {
      const [nx, ny] = nodeXY(i, j), d = Math.abs(nx - x) + Math.abs(ny - y);
      if (d < best) { best = d; bi = i; bj = j; }
    }
    return [bi, bj];
  }
  /** A point on the roads, nearest to (x, y): where you respawn and where traffic appears. */
  function nearestRoadPoint(city, x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (city.isRoadTile(tx + dx, ty + dy)) return [(tx + dx + 0.5) * T, (ty + dy + 0.5) * T];
    }
    return [nodeXY(0, 0)[0], nodeXY(0, 0)[1]];
  }

  // ------------------------------------------------------------------ vehicles

  let nextId = 1;
  function makeCar(kind, model, x, y, a, color) {
    const m = MODELS[model];
    return { id: nextId++, kind, model, x, y, a: a || 0, vx: 0, vy: 0, f: 0, color: color || m.colors[0], dir: 0, v: 0, pending: null, lastNode: '', stun: 0, honk: 0, stuck: 0, reverse: 0, wp: null, wpAt: 0, siren: kind === 'police', drift: 0 };
  }
  const carRadius = c => MODELS[c.model].len * 0.42;
  const isDynamic = c => c.kind === 'player' || c.kind === 'police' || c.kind === 'rival' || c.kind === 'loose';

  /** Two circles along the car: front and back. */
  function carHits(city, c, x, y, a) {
    const m = MODELS[c.model], off = m.len * 0.27, rr = m.wid * 0.55, ca = Math.cos(a), sa = Math.sin(a);
    return hitsSolid(city, x + ca * off, y + sa * off, rr) || hitsSolid(city, x - ca * off, y - sa * off, rr);
  }

  /**
   * Arcade car handling. input: throttle -1..1, steer -1..1, handbrake. Returns the impact speed of a crash, if any.
   * Forward speed builds with throttle; sideways speed is gripped away each frame (much less with the handbrake: a drift).
   */
  function drive(city, c, input, dt) {
    const m = MODELS[c.model];
    const off = slow(city.tileAtPx(c.x, c.y));
    const max = m.max * (off ? 0.55 : 1);
    // Turn the car first. Its velocity doesn't turn with it: whatever is now sideways is the slide that grip removes.
    const f0 = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    const speedFactor = clamp(Math.abs(f0) / 160, 0, 1) * (1 - 0.3 * clamp((Math.abs(f0) - max * 0.6) / max, 0, 1));
    const newA = c.a + (input.steer || 0) * m.turn * speedFactor * dt * (f0 >= 0 ? 1 : -1) * (input.handbrake ? 1.4 : 1);
    if (!carHits(city, c, c.x, c.y, newA)) c.a = newA;
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    let f = c.vx * ca + c.vy * sa;
    let s = -c.vx * sa + c.vy * ca;
    const th = input.throttle || 0;
    if (th > 0) f += f < -5 ? m.brake * dt : m.accel * th * dt * (1 - 0.55 * clamp(f / max, 0, 1));
    else if (th < 0) f -= f > 5 ? m.brake * dt : m.accel * 0.6 * dt;
    else f -= Math.sign(f) * Math.min(Math.abs(f), 140 * dt);
    if (off) f *= 1 - 0.9 * dt;
    if (input.handbrake) f *= Math.pow(0.986, dt * 60);
    f = clamp(f, -max * 0.4, max);

    const keep = input.handbrake ? Math.pow(0.955, dt * 60) : Math.pow(1 - m.grip, dt * 60);
    s *= keep;
    c.drift = Math.abs(s) > 110 ? Math.abs(s) : 0;
    c.vx = ca * f - sa * s;
    c.vy = sa * f + ca * s;
    c.f = f;
    return moveCar(city, c, dt);
  }

  function moveCar(city, c, dt) {
    let impact = 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(c.vx, c.vy) * dt / 10));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      const nx = c.x + c.vx * h;
      if (carHits(city, c, nx, c.y, c.a)) { impact = Math.max(impact, Math.abs(c.vx)); c.vx *= -0.25; } else c.x = nx;
      const ny = c.y + c.vy * h;
      if (carHits(city, c, c.x, ny, c.a)) { impact = Math.max(impact, Math.abs(c.vy)); c.vy *= -0.25; } else c.y = ny;
    }
    return impact;
  }

  /** Steering a computer-driven car toward a point, around walls. */
  function steerTo(city, c, tx, ty, dt, opts) {
    const o = opts || {};
    const speed = Math.hypot(c.vx, c.vy);
    if (c.reverse > 0) {
      c.reverse -= dt;
      return { throttle: -1, steer: c.revSteer || 1, handbrake: false };
    }
    let diff = wrapAngle(Math.atan2(ty - c.y, tx - c.x) - c.a);
    const look = 42 + speed * 0.22;
    const probe = a => !hitsSolid(city, c.x + Math.cos(c.a + a) * look, c.y + Math.sin(c.a + a) * look, 10);
    if (!probe(0)) diff += probe(0.6) ? 0.9 : probe(-0.6) ? -0.9 : 0;
    const steer = clamp(diff * 2.4, -1, 1);
    let throttle = Math.abs(diff) > 1.7 ? 0.35 : (o.cap != null ? o.cap : 1);
    const d = dist(c.x, c.y, tx, ty);
    if (o.slowNear && d < 110 && Math.abs(diff) > 0.5) throttle = Math.min(throttle, 0.45);
    if (speed < 25 && throttle > 0.3) c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt * 2);
    if (c.stuck > 1.1) { c.stuck = 0; c.reverse = 0.8; c.revSteer = diff > 0 ? -1 : 1; }
    return { throttle, steer, handbrake: Math.abs(diff) > 1.2 && speed > 260 };
  }

  /** Where a computer driver should head next to reach (tx, ty): straight there if it can see it, else along the roads. */
  function routeTo(city, c, tx, ty, now) {
    if (dist(c.x, c.y, tx, ty) < 900 && lineOfSight(city, c.x, c.y, tx, ty)) { c.wp = null; return [tx, ty]; }
    const [gi, gj] = nearestNode(tx, ty);
    const reached = c.wp && dist(c.x, c.y, ...nodeXY(c.wp[0], c.wp[1])) < 55;
    if (!c.wp || reached || now - c.wpAt > 5) {
      let [i, j] = reached ? c.wp : nearestNode(c.x, c.y);
      if (reached || dist(c.x, c.y, ...nodeXY(i, j)) < 55) { // at an intersection: one block closer to the target
        const di = gi - i, dj = gj - j;
        if (di && (Math.abs(di) >= Math.abs(dj) || !dj)) i += Math.sign(di); else if (dj) j += Math.sign(dj);
      }
      c.wp = [i, j]; c.wpAt = now;
    }
    if (c.wp[0] === gi && c.wp[1] === gj && dist(c.x, c.y, ...nodeXY(gi, gj)) < 55) return [tx, ty];
    return nodeXY(c.wp[0], c.wp[1]);
  }

  // Traffic drives in lanes: right-hand traffic, so southbound uses a road's left tile and northbound its right one.
  const laneCoord = (dir, line) => (dir === 0 ? (line + 1.5) * T : dir === 2 ? (line + 0.5) * T : dir === 1 ? (line + 0.5) * T : (line + 1.5) * T);
  const roadLineAt = tile => ROADS.find(p => tile === p || tile === p + 1);

  function placeTraffic(city, r, cx, cy, minD, maxD) {
    for (let k = 0; k < 60; k++) {
      const horizontal = r() < 0.5, line = pick(r, ROADS);
      const along = ROAD_MIN + 1 + Math.floor(r() * (ROAD_MAX - ROAD_MIN - 1));
      if (roadLineAt(along) !== undefined) continue; // not in an intersection
      const dir = horizontal ? (r() < 0.5 ? 0 : 2) : (r() < 0.5 ? 1 : 3);
      const x = horizontal ? (along + 0.5) * T : laneCoord(dir, line);
      const y = horizontal ? laneCoord(dir, line) : (along + 0.5) * T;
      const d = dist(x, y, cx, cy);
      if (d < minD || d > maxD) continue;
      const model = r() < 0.15 ? 'taxi' : r() < 0.12 ? 'van' : r() < 0.1 ? 'muscle' : 'compact';
      const car = makeCar('traffic', model, x, y, dir * Math.PI / 2, pick(r, MODELS[model].colors));
      car.dir = dir; car.v = 120; car.cruise = 150 + r() * 80;
      return car;
    }
    return null;
  }

  function trafficStep(w, c, dt) {
    if (c.stun > 0) { c.stun -= dt; c.v = 0; return; }
    const [dx, dy] = DIRS[c.dir];
    let target = c.cruise;
    for (const o of w.cars) { // keep a gap to whatever's ahead in the lane
      if (o === c) continue;
      const rx = o.x - c.x, ry = o.y - c.y, ahead = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
      if (ahead > 0 && ahead < 78 && side < 16) target = Math.min(target, ahead < 46 ? 0 : c.cruise * (ahead - 46) / 32);
    }
    if (!w.player.car) {
      const rx = w.player.x - c.x, ry = w.player.y - c.y, ahead = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
      if (ahead > 0 && ahead < 60 && side < 16) target = 0;
    }
    c.v += clamp(target - c.v, -520 * dt, 220 * dt);
    if (c.v < 1 && target === 0) c.honk += dt; else c.honk = 0;
    const step = c.v * dt;
    // Intersections: decide once, then turn into the new lane when we reach it.
    const fx = Math.floor((c.x + dx * 22) / T), fy = Math.floor((c.y + dy * 22) / T);
    const vl = roadLineAt(fx), hl = roadLineAt(fy);
    if (vl !== undefined && hl !== undefined && c.pending == null && c.lastNode !== `${vl},${hl}`) {
      const ok = d => d !== (c.dir + 2) % 4 && city_road_beyond(w.city, vl, hl, d);
      const straight = ok(c.dir) ? [c.dir, c.dir] : [];
      const options = [...straight, (c.dir + 1) % 4, (c.dir + 3) % 4].filter(ok);
      const nd = options.length ? pick(w.rand, options) : (c.dir + 2) % 4;
      c.lastNode = `${vl},${hl}`;
      if (nd !== c.dir) c.pending = { dir: nd, at: laneCoord(nd, nd % 2 ? vl : hl), vl, hl };
    }
    c.x += dx * step; c.y += dy * step;
    if (c.pending) {
      const p = c.pending, uturn = p.dir === (c.dir + 2) % 4;
      const passed = uturn || (dx ? (c.x - p.at) * dx >= 0 : (c.y - p.at) * dy >= 0);
      if (passed) {
        if (!uturn) { if (dx) c.x = p.at; else c.y = p.at; }
        c.dir = p.dir; c.pending = null;
        if (DIRS[c.dir][0]) c.y = laneCoord(c.dir, p.hl); else c.x = laneCoord(c.dir, p.vl); // into the new lane
      }
    }
    c.a = c.dir * Math.PI / 2;
    c.vx = dx * c.v; c.vy = dy * c.v;
  }
  function city_road_beyond(city, vl, hl, d) {
    const x = d === 0 ? vl + 2 : d === 2 ? vl - 1 : vl, y = d === 1 ? hl + 2 : d === 3 ? hl - 1 : hl;
    return city.isRoadTile(x, y);
  }

  // ------------------------------------------------------------------ people

  function makePed(r, x, y) {
    return { id: nextId++, x, y, a: r() * Math.PI * 2, speed: 34 + r() * 22, dodge: 0, shout: 0, look: Math.floor(r() * 6), turn: 1 + r() * 3 };
  }
  function pedStep(w, p, dt) {
    p.shout = Math.max(0, p.shout - dt);
    if (p.dodge > 0) { // diving out of the way: people always get clear
      p.dodge -= dt;
      const nx = p.x + Math.cos(p.da) * 240 * dt, ny = p.y + Math.sin(p.da) * 240 * dt;
      if (!hitsSolid(w.city, nx, ny, 6)) { p.x = nx; p.y = ny; }
      return;
    }
    for (const c of w.cars) {
      const sp = Math.hypot(c.vx, c.vy);
      if (sp < 90) continue;
      const rx = p.x - c.x, ry = p.y - c.y, d = Math.hypot(rx, ry);
      const toward = (rx * c.vx + ry * c.vy) / (d * sp + 1e-6);
      if (d < 46 + sp * 0.12 && toward > 0.55) {
        const side = Math.sign(rx * -c.vy + ry * c.vx) || 1;
        p.da = Math.atan2(c.vy, c.vx) + side * Math.PI / 2; p.dodge = 0.45; p.shout = 1.6;
        if (c.kind === 'player') w.emit('nearMiss');
        return;
      }
    }
    p.turn -= dt;
    const nx = p.x + Math.cos(p.a) * p.speed * dt, ny = p.y + Math.sin(p.a) * p.speed * dt;
    if (p.turn < 0 || !PED_TILES.has(w.city.tileAtPx(nx, ny)) || hitsSolid(w.city, nx, ny, 6)) {
      p.a = Math.floor(w.rand() * 4) * Math.PI / 2 + (w.rand() - 0.5) * 0.3; p.turn = 1.5 + w.rand() * 4;
    } else { p.x = nx; p.y = ny; }
  }
  function placePed(w, cx, cy, minD, maxD) {
    for (let k = 0; k < 80; k++) {
      const a = w.rand() * Math.PI * 2, d = minD + w.rand() * (maxD - minD), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (w.city.tileAtPx(x, y) === TILE.WALK && !hitsSolid(w.city, x, y, 7)) return makePed(w.rand, x, y);
    }
    return null;
  }

  // ------------------------------------------------------------------ missions

  const MISSIONS = [
    { id: 'wheels', title: 'Fresh Off the Bus', from: 'Rico', start: 'busStop', reward: 250,
      intro: "Welcome to Solara Bay, kid. You need wheels. Grab one, then come see me at the garage.",
      steps: [{ type: 'enterCar', text: 'Find a car: walk up to one and press E.' }, { type: 'goto', poi: 'garage', car: true, text: "Drive to Rico's Garage." }] },
    { id: 'delivery', title: 'Special Delivery', from: 'Rico', start: 'garage', reward: 450,
      intro: "A client at the pier wants this package. Don't ask what's in it. Don't be late.",
      steps: [{ type: 'goto', poi: 'pier', car: true, timer: 75, text: 'Deliver the package to the pier before time runs out.' }] },
    { id: 'hotwheels', title: 'Hot Wheels', from: 'Rico', start: 'garage', reward: 900,
      intro: 'There\'s a Vapor S sitting in a Palm Shore lot. Its owner owes me. Bring it here.',
      steps: [{ type: 'stealCar', model: 'sports', poi: 'lotPalm', stars: 2, text: 'Take the Vapor S from the Palm Shore lot.' }, { type: 'goto', poi: 'garage', model: 'sports', text: 'The alarm called the cops. Bring the Vapor S to the garage.' }] },
    { id: 'getaway', title: 'The Getaway', from: 'Nova', start: 'garage', reward: 1600,
      intro: "I'm Nova. I need a driver who doesn't panic. Pick me up at Solara Savings. Keep the engine running.",
      steps: [{ type: 'goto', poi: 'bank', car: true, text: 'Pick Nova up outside Solara Savings.' }, { type: 'heat', stars: 3, text: 'The alarm is ringing. Lose the cops!' }, { type: 'goto', poi: 'garage', car: true, text: 'Bring Nova back to the garage.' }] },
    { id: 'kings', title: 'Street Kings', from: 'Nova', start: 'raceStart', reward: 2200,
      intro: "The Street Kings think they own these roads. Prove them wrong.",
      steps: [{ type: 'race', text: 'Win the race: hit every checkpoint before the Street Kings.' }] },
    { id: 'bigscore', title: 'The Big Score', from: 'Rico & Nova', start: 'garage', reward: 6000,
      intro: 'One last job, then we all disappear. The boat leaves from the pier. Don\'t miss it.',
      steps: [{ type: 'goto', poi: 'bank', car: true, text: 'Pick up the crew at Solara Savings.' }, { type: 'heat', stars: 4, text: 'Four stars. Lose them!' }, { type: 'goto', poi: 'pier', car: true, timer: 100, text: 'Make it to the boat at the pier before it leaves!' }] },
  ];
  const RACE = [[7, 6], [7, 2], [3, 2], [3, 7], [8, 8], [8, 6]]; // intersections, then back to the start

  // ------------------------------------------------------------------ the world

  const STAR_COPS = [0, 1, 2, 4, 6, 8];
  const NEW_SAVE = () => ({ v: 1, cash: 300, owned: ['compact'], car: 'compact', story: 0, tapes: [], bestRace: 0, stats: { missions: 0, busted: 0, escapes: 0, nearMisses: 0, distance: 0, topSpeed: 0, taxis: 0, paychecks: 0 } });

  function createWorld(save, opts) {
    const o = opts || {};
    const city = makeCity(o.seed);
    const s = Object.assign(NEW_SAVE(), save || {});
    s.stats = Object.assign(NEW_SAVE().stats, (save && save.stats) || {});
    const rand = rng(o.randSeed || 4242);
    const w = {
      city, rand, save: s, t: 0, events: [], cars: [], peds: [], wanted: { stars: 0, unseen: 0, seen: false, lastRam: -9 },
      player: { x: city.poi.busStop.x, y: city.poi.busStop.y - 20, a: -Math.PI / 2, vx: 0, vy: 0, car: null, busted: 0 },
      mission: null, job: null, race: null, toastCool: 0,
      emit(type, data) { w.events.push(Object.assign({ type }, data || {})); },
    };
    for (const p of city.parked) w.cars.push(makeCar('parked', p.model, p.x, p.y, p.a, p.color));
    // Your own car waits at the garage.
    const g = city.poi.garage;
    const own = makeCar('parked', s.car, g.x, g.y, 0, MODELS[s.car].colors[0]);
    own.owned = true; w.cars.push(own);
    for (let n = 0; n < 34; n++) { const c = placeTraffic(city, rand, w.player.x, w.player.y, 160, 1500); if (c) w.cars.push(c); }
    for (let n = 0; n < 40; n++) { const p = placePed(w, w.player.x, w.player.y, 40, 1100); if (p) w.peds.push(p); }
    return w;
  }

  const playerPos = w => (w.player.car ? [w.player.car.x, w.player.car.y] : [w.player.x, w.player.y]);
  const playerSpeed = w => (w.player.car ? Math.hypot(w.player.car.vx, w.player.car.vy) : Math.hypot(w.player.vx, w.player.vy));

  function addCash(w, n, why) { w.save.cash = Math.max(0, w.save.cash + n); w.emit('cash', { amount: n, why }); }
  function toast(w, text, kind) { w.emit('toast', { text, kind: kind || 'info' }); }

  function setStars(w, n, why) {
    const before = w.wanted.stars;
    w.wanted.stars = clamp(Math.max(n, 0), 0, 5);
    if (w.wanted.stars > before) { w.wanted.unseen = 0; w.emit('wanted', { stars: w.wanted.stars, why }); }
  }

  function copSees(w) {
    const [x, y] = playerPos(w);
    return w.cars.some(c => c.kind === 'police' && dist(c.x, c.y, x, y) < 720 && (dist(c.x, c.y, x, y) < 220 || lineOfSight(w.city, c.x, c.y, x, y)));
  }

  /** E: get into the nearest car, or out of yours. */
  function toggleCar(w) {
    const p = w.player;
    if (p.car) {
      const c = p.car;
      if (Math.hypot(c.vx, c.vy) > 160) return toast(w, 'Slow down before you jump out!');
      const side = [c.a + Math.PI / 2, c.a - Math.PI / 2].map(a => [c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26]).find(([x, y]) => !hitsSolid(w.city, x, y, 8));
      if (!side) return toast(w, 'No room to get out here.');
      [p.x, p.y] = side; p.vx = p.vy = 0;
      c.kind = 'loose'; p.car = null;
      w.emit('exitCar');
      return;
    }
    let best = null, bd = 50;
    for (const c of w.cars) { const d = dist(c.x, c.y, p.x, p.y); if (d < bd) { bd = d; best = c; } }
    if (!best) return toast(w, 'No car close enough. Walk up to one.');
    const witnessed = copSees(w);
    if (best.kind === 'traffic') {
      const ped = makePed(w.rand, best.x + Math.cos(best.a + Math.PI / 2) * 24, best.y + Math.sin(best.a + Math.PI / 2) * 24);
      ped.shout = 2.5; ped.dodge = 0.6; ped.da = best.a + Math.PI / 2; w.peds.push(ped);
      best.vx = best.vy = 0;
      if (witnessed) setStars(w, Math.max(w.wanted.stars, 1), 'Car theft');
    } else if (best.kind === 'police') {
      setStars(w, Math.max(w.wanted.stars, 2), 'Stole a police car');
      best.siren = false;
    } else if (best.kind === 'parked' && !best.owned && witnessed) setStars(w, Math.max(w.wanted.stars, 1), 'Car theft');
    best.kind = 'player'; best.stun = 0; best.pending = null;
    if (best.f === undefined) best.f = 0;
    p.car = best;
    w.emit('enterCar', { model: best.model, name: MODELS[best.model].name });
  }

  function spawnCops(w, dt) {
    const want = STAR_COPS[w.wanted.stars];
    const cops = w.cars.filter(c => c.kind === 'police');
    const [x, y] = playerPos(w);
    if (cops.length < want && (w.t - (w.lastCopSpawn || -9)) > 1.4) {
      const c = placeTraffic(w.city, w.rand, x, y, 650, 1100);
      if (c) { const cop = makeCar('police', 'police', c.x, c.y, c.a); cop.vx = Math.cos(c.a) * 200; cop.vy = Math.sin(c.a) * 200; w.cars.push(cop); w.lastCopSpawn = w.t; }
    }
    if (cops.length > want) { // they give up: the farthest one drives off first
      const far = cops.sort((a, b) => dist(b.x, b.y, x, y) - dist(a.x, a.y, x, y))[0];
      if (dist(far.x, far.y, x, y) > 700 || want === 0) far.leaving = true;
    }
    void dt;
  }

  function copStep(w, c, dt) {
    const [px, py] = playerPos(w);
    if (c.leaving || w.wanted.stars === 0) {
      c.leaving = true;
      const inp = steerTo(w.city, c, c.x + Math.cos(c.a) * 300, c.y + Math.sin(c.a) * 300, dt, { cap: 0.6 });
      drive(w.city, c, inp, dt);
      return;
    }
    const lead = w.player.car ? 0.35 : 0;
    const [tx, ty] = routeTo(w.city, c, px + (w.player.car ? w.player.car.vx : 0) * lead, py + (w.player.car ? w.player.car.vy : 0) * lead, w.t);
    const inp = steerTo(w.city, c, tx, ty, dt, { slowNear: !!c.wp });
    // Right beside a slow or stopped player: box them in and wait, instead of shoving them along.
    if (dist(c.x, c.y, px, py) < 95 && playerSpeed(w) < 90) { inp.throttle = Math.hypot(c.vx, c.vy) > 30 ? -1 : 0; inp.handbrake = false; }
    drive(w.city, c, inp, dt);
  }

  function rivalStep(w, c, dt) {
    const r = w.race;
    const cp = r.checkpoints[c.cp];
    if (!cp) { c.vx *= 0.95; c.vy *= 0.95; moveCar(w.city, c, dt); return; }
    if (dist(c.x, c.y, cp.x, cp.y) < 70) { c.cp++; if (c.cp >= r.checkpoints.length) { c.done = w.t; r.rivalsDone++; } }
    const [tx, ty] = routeTo(w.city, c, cp.x, cp.y, w.t);
    // A little rubber band keeps the race close.
    const ahead = c.cp - r.cp;
    const inp = steerTo(w.city, c, tx, ty, dt, { cap: ahead > 0 ? 0.82 : ahead < 0 ? 1 : 0.95, slowNear: !!c.wp });
    drive(w.city, c, inp, dt);
  }

  // ------------------------------------------------------------------ missions and jobs

  function poiOf(w, key) { return w.city.poi[key]; }
  function startMission(w, idx) {
    const m = MISSIONS[idx];
    w.mission = { idx, step: 0, timer: null, startT: w.t };
    w.emit('missionStart', { title: m.title, from: m.from, intro: m.intro });
    enterStep(w);
  }
  function enterStep(w) {
    const m = MISSIONS[w.mission.idx], st = m.steps[w.mission.step];
    w.mission.timer = st.timer || null;
    if (st.type === 'heat') setStars(w, st.stars, m.title);
    if (st.type === 'stealCar') {
      const p = poiOf(w, st.poi);
      const car = makeCar('parked', st.model, p.x, p.y, Math.PI / 2, MODELS[st.model].colors[0]);
      car.target = true; w.cars.push(car); w.mission.targetCar = car;
    }
    if (st.type === 'race') startRace(w);
    toast(w, st.text, 'mission');
  }
  function stepDone(w) {
    const m = MISSIONS[w.mission.idx];
    w.mission.step++;
    if (w.mission.step >= m.steps.length) {
      addCash(w, m.reward, m.title);
      w.save.story = Math.max(w.save.story, w.mission.idx + 1);
      w.save.stats.missions++;
      w.emit('missionPassed', { title: m.title, reward: m.reward });
      if (w.race) endRace(w);
      w.mission = null;
      return;
    }
    enterStep(w);
  }
  function failMission(w, why) {
    if (!w.mission) return;
    const m = MISSIONS[w.mission.idx];
    w.emit('missionFailed', { title: m.title, why });
    if (w.mission.targetCar && w.mission.targetCar.kind !== 'player') w.cars = w.cars.filter(c => c !== w.mission.targetCar);
    if (w.race) endRace(w);
    w.mission = null;
  }
  /** The marker the player is heading for now. */
  function objective(w) {
    if (w.mission) {
      const st = MISSIONS[w.mission.idx].steps[w.mission.step];
      if (st.type === 'goto') { const p = poiOf(w, st.poi); return { x: p.x, y: p.y, label: p.label, colour: '#fdf05a' }; }
      if (st.type === 'stealCar') { const c = w.mission.targetCar; return { x: c.x, y: c.y, label: MODELS[c.model].name, colour: '#b79bff' }; }
      if (st.type === 'race' && w.race) { const c = w.race.checkpoints[w.race.cp]; return c ? { x: c.x, y: c.y, label: `Checkpoint ${w.race.cp + 1}/${w.race.checkpoints.length}`, colour: '#fdf05a' } : null; }
      return null;
    }
    if (w.job) return { x: w.job.x, y: w.job.y, label: 'Drop-off', colour: '#ffd33d' };
    return null;
  }
  function missionStep(w, dt) {
    const mm = w.mission;
    if (!mm) return;
    const st = MISSIONS[mm.idx].steps[mm.step];
    if (mm.timer != null) { mm.timer -= dt; if (mm.timer <= 0) return failMission(w, 'Out of time'); }
    const [x, y] = playerPos(w);
    const car = w.player.car;
    if (st.type === 'enterCar' && car) return stepDone(w);
    if (st.type === 'goto') {
      const p = poiOf(w, st.poi);
      if (dist(x, y, p.x, p.y) < 70 && (!st.car || car) && (!st.model || (car && car.model === st.model))) {
        if (w.wanted.stars > 0 && st.poi === 'garage') { if (!mm.warned) { toast(w, 'Lose the cops first! Rico won\'t open up with cops on your tail.'); mm.warned = true; } return; }
        if (car && Math.hypot(car.vx, car.vy) > 120) return;
        return stepDone(w);
      }
      if (st.model && mm.targetCar && mm.targetCar.kind === 'loose' && dist(x, y, mm.targetCar.x, mm.targetCar.y) > 1400) return failMission(w, 'You left the Vapor S behind');
    }
    if (st.type === 'stealCar' && car && car === mm.targetCar) { setStars(w, st.stars, 'The alarm'); return stepDone(w); }
    if (st.type === 'heat' && w.wanted.stars === 0) { toast(w, 'You lost them.', 'good'); return stepDone(w); }
    if (st.type === 'race' && w.race) {
      const r = w.race, cp = r.checkpoints[r.cp];
      if (cp && dist(x, y, cp.x, cp.y) < 80) { r.cp++; w.emit('checkpoint', { n: r.cp, of: r.checkpoints.length }); }
      if (r.rivalsDone > 0) return failMission(w, 'The Street Kings got there first');
      if (r.cp >= r.checkpoints.length) {
        const time = w.t - r.start;
        if (!w.save.bestRace || time < w.save.bestRace) w.save.bestRace = Math.round(time * 10) / 10;
        return stepDone(w);
      }
    }
  }
  function startRace(w) {
    const checkpoints = RACE.map(([i, j]) => { const [x, y] = nodeXY(i, j); return { x, y }; });
    const s = poiOf(w, 'raceStart');
    const rivals = [];
    for (let n = 0; n < 3; n++) {
      const c = makeCar('rival', n === 0 ? 'sports' : 'muscle', s.x - 60 + n * 40, s.y + 30, -Math.PI / 2, ['#ff3fa4', '#f39a2b', '#68f4d1'][n]);
      c.cp = 0; rivals.push(c); w.cars.push(c);
    }
    w.race = { checkpoints, cp: 0, start: w.t, rivals, rivalsDone: 0 };
  }
  function endRace(w) { w.cars = w.cars.filter(c => c.kind !== 'rival'); w.race = null; }

  /** Taxi stands: pick up a fare, get them there fast. */
  function startJob(w) {
    const [x, y] = playerPos(w);
    let dest;
    for (let k = 0; k < 50; k++) {
      const [i, j] = [Math.floor(w.rand() * ROADS.length), Math.floor(w.rand() * ROADS.length)];
      const [nx, ny] = nodeXY(i, j);
      if (dist(nx, ny, x, y) > 900) { dest = [nx, ny]; break; }
    }
    if (!dest) return;
    const far = dist(dest[0], dest[1], x, y);
    w.job = { x: dest[0], y: dest[1], timer: Math.round(far / 260 + 12), pay: Math.round(far / 12) };
    toast(w, `Fare: get them to the drop-off in ${w.job.timer}s for $${w.job.pay}.`, 'mission');
  }
  function jobStep(w, dt) {
    const j = w.job; if (!j) return;
    j.timer -= dt;
    const [x, y] = playerPos(w);
    if (!w.player.car) { w.job = null; return toast(w, 'Your fare walked off.'); }
    if (dist(x, y, j.x, j.y) < 70) { addCash(w, j.pay, 'Fare'); w.save.stats.taxis++; w.job = null; return; }
    if (j.timer <= 0) { w.job = null; toast(w, 'Too slow: the fare got out.', 'bad'); }
  }

  /** Enter / F: start a mission, open the garage, take a fare, or get a paint job, depending on where you are. */
  function action(w) {
    const [x, y] = playerPos(w);
    const next = MISSIONS[w.save.story];
    if (!w.mission && next && dist(x, y, poiOf(w, next.start).x, poiOf(w, next.start).y) < 80) {
      if (w.wanted.stars > 0) return toast(w, 'Lose the cops before starting a job.');
      return startMission(w, w.save.story);
    }
    if (dist(x, y, w.city.poi.garage.x, w.city.poi.garage.y) < 80 && !w.mission) return w.emit('openGarage');
    if (dist(x, y, w.city.poi.spray.x, w.city.poi.spray.y) < 80 && w.player.car) {
      if (!w.wanted.stars) return toast(w, 'Your paint looks fine. Come back when the cops are after you.');
      const price = 250;
      if (w.save.cash < price) return toast(w, `A fresh coat costs $${price}.`);
      addCash(w, -price, 'Spray job'); w.wanted.stars = 0; w.save.stats.escapes++;
      return w.emit('sprayed');
    }
    if (!w.mission && !w.job && w.player.car && w.city.poi.taxi.some(t => dist(x, y, t.x, t.y) < 80)) return startJob(w);
  }

  /** Buy or choose a car in the garage. Returns an error text, or null. */
  function garagePick(w, model) {
    const m = MODELS[model]; if (!m || !GARAGE.includes(model)) return 'Unknown car';
    if (!w.save.owned.includes(model)) {
      if (w.save.cash < m.price) return `You need $${m.price}.`;
      addCash(w, -m.price, m.name); w.save.owned.push(model);
    }
    w.save.car = model;
    const g = w.city.poi.garage;
    w.cars = w.cars.filter(c => !(c.owned && c.kind === 'parked'));
    if (w.player.car && w.player.car.owned) { w.cars = w.cars.filter(c => c !== w.player.car); w.player.car = null; [w.player.x, w.player.y] = [g.x, g.y + 30]; }
    const car = makeCar('parked', model, g.x, g.y, 0, m.colors[0]); car.owned = true; w.cars.push(car);
    w.emit('garage', { model, name: m.name });
    return null;
  }

  function busted(w) {
    const fine = Math.min(w.save.cash, Math.max(100, Math.round(w.save.cash * 0.1)));
    w.save.cash -= fine; w.save.stats.busted++;
    failMission(w, 'Busted');
    if (w.job) w.job = null;
    if (w.player.car) { w.player.car.kind = 'loose'; w.player.car = null; }
    const st = w.city.poi.police;
    w.player.x = st.x; w.player.y = st.y + 20; w.player.vx = w.player.vy = 0;
    w.wanted.stars = 0; w.player.busted = 0;
    w.cars = w.cars.filter(c => c.kind !== 'police');
    w.emit('busted', { fine });
  }

  // ------------------------------------------------------------------ one tick

  /**
   * Advance the world by dt seconds. input: up/down/left/right/handbrake/sprint booleans, and the one-shot presses
   * enter (E) and action (Enter/F). Returns the events of this tick.
   */
  function step(w, input, dt) {
    dt = Math.min(dt, 1 / 20);
    w.t += dt;
    w.events = [];
    const p = w.player, inp = input || {};
    if (inp.enter) toggleCar(w);
    if (inp.action) action(w);

    if (p.car) {
      const c = p.car;
      const impact = drive(w.city, c, { throttle: (inp.up ? 1 : 0) - (inp.down ? 1 : 0), steer: (inp.right ? 1 : 0) - (inp.left ? 1 : 0), handbrake: !!inp.handbrake }, dt);
      if (impact > 140) w.emit('crash', { power: impact });
      const sp = Math.hypot(c.vx, c.vy);
      w.save.stats.distance += sp * dt / T * 3; // a tile is about 3 m
      w.save.stats.topSpeed = Math.max(w.save.stats.topSpeed, Math.round(sp / T * 3 * 3.6));
      if (c.drift) w.emit('drift', { amount: c.drift });
      // Speeding past a cop who can see you.
      if (!w.wanted.stars && sp > MODELS[c.model].max * 0.88 && w.cars.some(o => o.kind === 'police' && dist(o.x, o.y, c.x, c.y) < 380 && lineOfSight(w.city, o.x, o.y, c.x, c.y))) setStars(w, 1, 'Speeding');
    } else {
      const sp = inp.sprint ? 190 : 120;
      p.vx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * sp;
      p.vy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * sp;
      if (p.vx && p.vy) { p.vx *= 0.7071; p.vy *= 0.7071; }
      if (p.vx || p.vy) p.a = Math.atan2(p.vy, p.vx);
      const nx = p.x + p.vx * dt; if (!hitsSolid(w.city, nx, p.y, 7) && !w.cars.some(c => dist(c.x, c.y, nx, p.y) < carRadius(c) * 0.8)) p.x = nx;
      const ny = p.y + p.vy * dt; if (!hitsSolid(w.city, p.x, ny, 7) && !w.cars.some(c => dist(c.x, c.y, p.x, ny) < carRadius(c) * 0.8)) p.y = ny;
    }

    spawnCops(w, dt);
    for (const c of w.cars) {
      if (c.kind === 'traffic') trafficStep(w, c, dt);
      else if (c.kind === 'police') copStep(w, c, dt);
      else if (c.kind === 'rival') rivalStep(w, c, dt);
      else if (c.kind === 'loose') { drive(w.city, c, { throttle: 0, steer: 0 }, dt); c.vx *= Math.pow(0.4, dt); c.vy *= Math.pow(0.4, dt); if (Math.hypot(c.vx, c.vy) < 5) { c.vx = c.vy = 0; c.kind = 'parked'; c.abandoned = !c.owned; } }
    }

    // Car-to-car bumps.
    for (let i = 0; i < w.cars.length; i++) {
      const a = w.cars[i];
      for (let k = i + 1; k < w.cars.length; k++) {
        const b = w.cars[k];
        if (!isDynamic(a) && !isDynamic(b)) continue;
        const rr = carRadius(a) + carRadius(b), dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy);
        if (d >= rr || d === 0) continue;
        const nx = dx / d, ny = dy / d, overlap = rr - d;
        const ad = isDynamic(a), bd = isDynamic(b);
        const push = ad && bd ? 0.5 : 1;
        if (ad) { a.x -= nx * overlap * push; a.y -= ny * overlap * push; }
        if (bd) { b.x += nx * overlap * push; b.y += ny * overlap * push; }
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const j = rel * 0.65;
          if (ad) { a.vx -= nx * j * (bd ? 1 : 1.4); a.vy -= ny * j * (bd ? 1 : 1.4); }
          if (bd) { b.vx += nx * j; b.vy += ny * j; }
          if (b.kind === 'traffic' || b.kind === 'parked') b.stun = 1.4;
          if (a.kind === 'traffic' || a.kind === 'parked') a.stun = 1.4;
          const playerHit = a === p.car || b === p.car;
          if (playerHit && rel > 120) {
            w.emit('crash', { power: rel });
            const other = a === p.car ? b : a;
            if (other.kind === 'police' && w.t - w.wanted.lastRam > 2.5) { w.wanted.lastRam = w.t; setStars(w, Math.max(2, w.wanted.stars + 1), 'Rammed a cop'); }
            else if (other.kind !== 'police' && rel > 200 && copSees(w)) setStars(w, Math.max(1, w.wanted.stars), 'Reckless driving');
          }
        }
      }
    }

    // People.
    for (const ped of w.peds) pedStep(w, ped, dt);
    const [px, py] = playerPos(w);
    w.peds = w.peds.filter(q => dist(q.x, q.y, px, py) < 1300);
    while (w.peds.length < 40) { const q = placePed(w, px, py, 700, 1200); if (!q) break; w.peds.push(q); }
    // Traffic stays around you.
    w.cars = w.cars.filter(c => !((c.kind === 'traffic' || (c.kind === 'police' && c.leaving)) && dist(c.x, c.y, px, py) > 1700));
    let loose = w.cars.filter(c => (c.kind === 'loose' || (c.kind === 'parked' && c.abandoned)));
    if (loose.length > 25) { const far = loose.sort((a, b) => dist(b.x, b.y, px, py) - dist(a.x, a.y, px, py))[0]; w.cars = w.cars.filter(c => c !== far); }
    const traffic = w.cars.reduce((n, c) => n + (c.kind === 'traffic'), 0);
    if (traffic < 34) { const c = placeTraffic(w.city, w.rand, px, py, 750, 1500); if (c && !w.cars.some(o => dist(o.x, o.y, c.x, c.y) < 60)) w.cars.push(c); }

    // Wanted: the cops lose you when none of them has seen you for a while.
    if (w.wanted.stars > 0) {
      w.wanted.seen = copSees(w);
      if (w.wanted.seen) w.wanted.unseen = 0; else w.wanted.unseen += dt;
      if (w.wanted.unseen > 7 + w.wanted.stars * 2.5) { w.wanted.stars = 0; w.save.stats.escapes++; w.emit('escaped'); }
      // Busted: stopped with a cop right next to you.
      const close = w.cars.some(c => c.kind === 'police' && !c.leaving && dist(c.x, c.y, px, py) < (p.car ? 62 : 40));
      if (close && playerSpeed(w) < 40) { p.busted += dt; if (p.busted > (p.car ? 2.2 : 1)) busted(w); } else p.busted = Math.max(0, p.busted - dt);
    } else { w.wanted.unseen = 0; w.wanted.seen = false; p.busted = 0; }

    missionStep(w, dt);
    jobStep(w, dt);

    // Cassette tapes.
    for (const tp of w.city.tapes) if (!w.save.tapes.includes(tp.id) && dist(tp.x, tp.y, px, py) < 30) {
      w.save.tapes.push(tp.id); addCash(w, 100, 'Tape');
      w.emit('tape', { got: w.save.tapes.length, of: w.city.tapes.length });
    }
    return w.events;
  }

  /** Money earned while coding (the extension sends it in). */
  function paycheck(w, amount) {
    if (!(amount > 0)) return;
    addCash(w, Math.round(amount), 'Paycheck');
    w.save.stats.paychecks += Math.round(amount);
  }

  return {
    T, TILE, W, H, ROADS, MODELS, GARAGE, MISSIONS, DISTRICTS, STAR_COPS, NEW_SAVE,
    rng, makeCity, hitsSolid, lineOfSight, nearestRoadPoint, nodeXY, nearestNode, makeCar, drive, steerTo, routeTo,
    createWorld, step, toggleCar, action, garagePick, startMission, objective, paycheck, setStars, playerPos, playerSpeed, copSees, carRadius,
  };
});
