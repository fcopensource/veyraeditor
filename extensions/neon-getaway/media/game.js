/* Neon Getaway: drawing, input, menus and saving. The rules live in engine.js (window.NG). */
(function () {
  'use strict';
  const NG = window.NG, T = NG.T, TILE = NG.TILE;
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage() {}, getState() {}, setState() {} };
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const audio = new window.NGAudio();

  // ---------------------------------------------------------------- state

  let world = NG.createWorld();
  let mode = 'title'; // title | play | pause | garage | map
  let menuIndex = 0, garageIndex = 0;
  let soundSetting = true, firstKey = false, showHelp = true;
  const cam = { x: world.player.x, y: world.player.y, zoom: 1 };
  const toasts = [], banners = [], floaters = [], skid = [], sparks = [];
  let cashShown = world.save.cash, lastSave = 0, dirty = false, lastDistrict = '', districtTimer = 0, flash = 0;
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- input

  const keys = new Set();
  const pressed = new Set();
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'handbrake', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
  window.addEventListener('keydown', e => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!firstKey) { firstKey = true; if (soundSetting) audio.start(); }
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); if (mode === 'play') mode = 'pause'; });
  const held = name => Object.entries(KEYMAP).some(([code, n]) => n === name && keys.has(code));
  const hit = (...codes) => codes.some(c => pressed.has(c));

  // ---------------------------------------------------------------- messages from VS Code

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'init') {
      world = NG.createWorld(m.save || null);
      soundSetting = m.sound !== false; audio.setOn(soundSetting && firstKey);
      showHelp = !(m.save && m.save.stats && m.save.stats.missions > 0);
      cashShown = world.save.cash;
      Object.assign(cam, { x: world.player.x, y: world.player.y });
      if (m.paycheck > 0) payday(m.paycheck);
    }
    if (m.type === 'paycheck' && m.amount > 0) payday(m.amount);
  });
  function payday(amount) {
    NG.paycheck(world, amount);
    banner(`YOUR CODE PAID OUT  +$${amount.toLocaleString('en')}`, '#68f4d1', 3.2);
    audio.fx('cash'); saveNow(); vscode.postMessage({ type: 'paid', amount });
  }
  function saveNow() { vscode.postMessage({ type: 'save', save: world.save }); lastSave = performance.now(); dirty = false; }

  // ---------------------------------------------------------------- messages on screen

  function toast(text, kind) { toasts.push({ text, kind: kind || 'info', t: 5.5 }); while (toasts.length > 3) toasts.shift(); }
  function banner(text, colour, t, sub) { banners.length = 0; banners.push({ text, colour, t: t || 2.6, life: t || 2.6, sub }); }
  function floater(text, colour) { floaters.push({ text, colour, t: 1.4 }); }

  function handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'toast': toast(e.text, e.kind); break;
        case 'cash': if (e.amount > 0) { floater(`+$${e.amount.toLocaleString('en')}`, '#68f4d1'); audio.fx('cash'); } else floater(`-$${(-e.amount).toLocaleString('en')}`, '#ff6b8a'); dirty = true; break;
        case 'enterCar': toast(e.name); audio.fx('door'); break;
        case 'exitCar': audio.fx('door'); break;
        case 'crash': flash = Math.min(0.5, e.power / 900); addSparks(); audio.fx('crash', e.power); break;
        case 'wanted': banner('WANTED', '#ff3fa4', 1.8, e.why); audio.fx('wanted'); break;
        case 'escaped': banner('YOU LOST THEM', '#68f4d1', 2.4); dirty = true; break;
        case 'busted': banner('BUSTED', '#4c8dff', 3.4, `Fined $${e.fine.toLocaleString('en')}`); audio.fx('busted'); dirty = true; break;
        case 'missionStart': banner(e.title.toUpperCase(), '#fdf05a', 3.2, `${e.from}: "${e.intro}"`); break;
        case 'missionPassed': banner('MISSION PASSED', '#68f4d1', 3.6, `${e.title}  +$${e.reward.toLocaleString('en')}`); audio.fx('passed'); saveNow(); break;
        case 'missionFailed': banner('MISSION FAILED', '#ff6b8a', 3, e.why); audio.fx('failed'); break;
        case 'checkpoint': audio.fx('checkpoint'); break;
        case 'tape': banner(`TAPE ${e.got} OF ${e.of}`, '#b79bff', 2.2, 'A lost mixtape. +$100'); audio.fx('tape'); saveNow(); break;
        case 'nearMiss': world.save.stats.nearMisses++; break;
        case 'sprayed': banner('FRESH PAINT', '#ff3fa4', 2.2, 'The cops have no idea who you are.'); break;
        case 'openGarage': mode = 'garage'; garageIndex = Math.max(0, NG.GARAGE.indexOf(world.save.car)); break;
        case 'garage': toast(`Your ${e.name} is waiting outside.`, 'good'); saveNow(); break;
      }
    }
  }

  // ---------------------------------------------------------------- the loop

  let last = performance.now(), acc = 0, titleT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    update(dt);
    draw(dt);
    pressed.clear();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (hit('KeyM')) { soundSetting = !soundSetting; audio.setOn(soundSetting); toast(soundSetting ? 'Sound on' : 'Sound off'); vscode.postMessage({ type: 'sound', on: soundSetting }); }
    if (mode === 'title') {
      titleT += dt;
      if (hit('Enter', 'Space', 'KeyE')) { mode = 'play'; if (soundSetting) audio.start(); }
      return;
    }
    if (mode === 'pause') return updatePause();
    if (mode === 'garage') return updateGarage();
    if (mode === 'map') { if (hit('Tab', 'Escape', 'KeyP')) mode = 'play'; return; }
    if (showHelp && hit('Enter', 'KeyF', 'KeyE', 'Escape')) { showHelp = false; pressed.clear(); } // closing the card does nothing else
    if (hit('Escape', 'KeyP')) { mode = 'pause'; menuIndex = 0; return; }
    if (hit('Tab')) { mode = 'map'; return; }
    if (hit('KeyR')) toast(`📻 ${audio.nextStation()}`);
    if (hit('KeyH') && world.player.car) audio.fx('horn');

    acc += dt;
    const input = { up: held('up'), down: held('down'), left: held('left'), right: held('right'), handbrake: held('handbrake'), sprint: held('sprint'), enter: hit('KeyE'), action: hit('Enter', 'KeyF') };
    while (acc >= 1 / 60) {
      handle(NG.step(world, input, 1 / 60));
      input.enter = input.action = false;
      acc -= 1 / 60;
    }
    effects(dt);
    const car = world.player.car;
    const speed = car ? Math.hypot(car.vx, car.vy) / NG.MODELS[car.model].max : null;
    let siren = 0;
    if (world.wanted.stars) for (const c of world.cars) if (c.kind === 'police') siren = Math.max(siren, 1 - Math.hypot(c.x - cam.x, c.y - cam.y) / 900);
    audio.update(speed, held('up') ? 1 : 0, Math.max(0, siren), !!car);
    if (dirty && performance.now() - lastSave > 4000) saveNow();
    else if (performance.now() - lastSave > 20000) saveNow();
    cashShown += (world.save.cash - cashShown) * Math.min(1, dt * 6);
    if (Math.abs(world.save.cash - cashShown) < 1) cashShown = world.save.cash;
  }

  const PAUSE = ['Resume', 'Garage (at Rico\'s)', 'Controls', 'Sound: on', 'Save game'];
  function updatePause() {
    if (hit('Escape', 'KeyP')) { mode = 'play'; return; }
    if (hit('ArrowUp', 'KeyW')) menuIndex = (menuIndex + PAUSE.length - 1) % PAUSE.length;
    if (hit('ArrowDown', 'KeyS')) menuIndex = (menuIndex + 1) % PAUSE.length;
    if (hit('Enter', 'Space')) {
      if (menuIndex === 0) mode = 'play';
      if (menuIndex === 1) { mode = 'play'; toast("Drive to Rico's Garage (the green marker) and press Enter to buy and change cars."); }
      if (menuIndex === 2) { showHelp = true; mode = 'play'; }
      if (menuIndex === 3) { soundSetting = !soundSetting; audio.setOn(soundSetting); vscode.postMessage({ type: 'sound', on: soundSetting }); }
      if (menuIndex === 4) { saveNow(); toast('Saved.', 'good'); mode = 'play'; }
    }
  }
  function updateGarage() {
    if (hit('Escape', 'KeyP', 'Backspace')) { mode = 'play'; return; }
    if (hit('ArrowLeft', 'KeyA')) garageIndex = (garageIndex + NG.GARAGE.length - 1) % NG.GARAGE.length;
    if (hit('ArrowRight', 'KeyD')) garageIndex = (garageIndex + 1) % NG.GARAGE.length;
    if (hit('Enter', 'Space')) {
      const err = NG.garagePick(world, NG.GARAGE[garageIndex]);
      handle(world.events.splice(0));
      if (err) toast(err, 'bad'); else mode = 'play';
    }
  }

  // ---------------------------------------------------------------- effects

  function addSparks() {
    const [x, y] = NG.playerPos(world);
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 220; sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.4 + Math.random() * 0.3 }); }
  }
  function effects(dt) {
    for (const c of world.cars) {
      if (!c.drift && !(c.kind !== 'traffic' && Math.abs(c.f || 0) > 40 && held('handbrake') && c === world.player.car)) continue;
      const m = NG.MODELS[c.model], ca = Math.cos(c.a), sa = Math.sin(c.a), back = m.len * 0.32, side = m.wid * 0.38;
      for (const sd of [-1, 1]) {
        const x = c.x - ca * back - sa * side * sd, y = c.y - sa * back + ca * side * sd;
        const prev = c['skid' + sd];
        if (prev && Math.hypot(prev[0] - x, prev[1] - y) < 40) skid.push({ x1: prev[0], y1: prev[1], x2: x, y2: y, t: 14 });
        c['skid' + sd] = [x, y];
      }
    }
    for (const c of world.cars) if (!c.drift) { c['skid-1'] = null; c.skid1 = null; }
    while (skid.length > 700) skid.shift();
    for (const s of skid) s.t -= dt;
    while (skid.length && skid[0].t <= 0) skid.shift();
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.9; s.vy *= 0.9; s.t -= dt; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t <= 0) sparks.splice(i, 1);
    for (const t of toasts) t.t -= dt;
    while (toasts.length && toasts[0].t <= 0) toasts.shift();
    for (const b of banners) b.t -= dt;
    if (banners.length && banners[0].t <= 0) banners.shift();
    for (const f of floaters) f.t -= dt;
    while (floaters.length && floaters[0].t <= 0) floaters.shift();
    flash = Math.max(0, flash - dt * 1.6);
    const [px, py] = NG.playerPos(world);
    const d = world.city.districtAtPx(px, py);
    if (d !== lastDistrict) { lastDistrict = d; districtTimer = 3; } else districtTimer -= dt;
  }

  // ---------------------------------------------------------------- the city, drawn once into chunks

  const CHUNK = 16, chunks = new Map();
  const COL = { [TILE.WATER]: '#0a1736', [TILE.SAND]: '#4b3f3c', [TILE.ROAD]: '#1b1d29', [TILE.WALK]: '#2b2d3c', [TILE.BUILD]: '#11121b', [TILE.GRASS]: '#13301f', [TILE.TREE]: '#13301f', [TILE.LOT]: '#22242f', [TILE.PIER]: '#4a3326' };
  const isRoadLine = t => NG.ROADS.includes(t) || NG.ROADS.includes(t - 1);

  function chunkCanvas(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (c) { chunks.delete(key); chunks.set(key, c); return c; }
    c = document.createElement('canvas'); c.width = c.height = CHUNK * T;
    const g = c.getContext('2d'), city = world.city, x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const X = x0 + tx, Y = y0 + ty, t = city.get(X, Y);
      g.fillStyle = COL[t]; g.fillRect(tx * T, ty * T, T, T);
      if (t === TILE.WATER) { g.fillStyle = '#0f2149'; if ((X + Y) % 3 === 0) g.fillRect(tx * T + 6, ty * T + 12, 14, 2); }
      if (t === TILE.SAND && city.get(X, Y + 1) === TILE.WATER) { g.fillStyle = '#8fb7d955'; g.fillRect(tx * T, ty * T + T - 4, T, 4); }
      if (t === TILE.SAND && city.get(X, Y - 1) === TILE.WATER) { g.fillStyle = '#8fb7d955'; g.fillRect(tx * T, ty * T, T, 4); }
      if (t === TILE.WALK) { g.fillStyle = '#323546'; g.fillRect(tx * T, ty * T, T, 1); g.fillRect(tx * T, ty * T, 1, T); }
      if (t === TILE.PIER) { g.fillStyle = '#5c4031'; for (let k = 0; k < 4; k++) g.fillRect(tx * T, ty * T + k * 8, T, 1); }
      if (t === TILE.LOT) { g.fillStyle = '#3a3d4d'; if (X % 2 === 0 && (Y % 5 === 1 || Y % 5 === 2)) g.fillRect(tx * T, ty * T + 4, 1, 24); }
      if (t === TILE.ROAD) {
        const v = isRoadLine(X), h = isRoadLine(Y);
        g.fillStyle = '#f7d15488';
        if (v && !h && NG.ROADS.includes(X - 1)) for (let k = 0; k < 2; k++) g.fillRect(tx * T - 1, ty * T + k * 16 + 2, 2, 9);
        if (h && !v && NG.ROADS.includes(Y - 1)) for (let k = 0; k < 2; k++) g.fillRect(tx * T + k * 16 + 2, ty * T - 1, 9, 2);
        g.fillStyle = '#e9e4dc22';
        if (v && !h) { if (NG.ROADS.includes(X)) g.fillRect(tx * T, ty * T, 2, T); else g.fillRect(tx * T + T - 2, ty * T, 2, T); }
        if (h && !v) { if (NG.ROADS.includes(Y)) g.fillRect(tx * T, ty * T, T, 2); else g.fillRect(tx * T, ty * T + T - 2, T, 2); }
        // zebra crossings next to intersections
        g.fillStyle = '#e9e4dc30';
        if (v && !h && (isRoadLine(Y - 1) || isRoadLine(Y + 1))) for (let k = 0; k < 5; k++) g.fillRect(tx * T + 3 + k * 6, ty * T + 6, 3, 20);
        if (h && !v && (isRoadLine(X - 1) || isRoadLine(X + 1))) for (let k = 0; k < 5; k++) g.fillRect(tx * T + 6, ty * T + 3 + k * 6, 20, 3);
      }
    }
    // trees: palms in Palm Shore, round ones elsewhere
    for (const [tx, ty] of city.trees) {
      if (tx < x0 - 1 || tx > x0 + CHUNK || ty < y0 - 1 || ty > y0 + CHUNK) continue;
      const x = (tx - x0 + 0.5) * T, y = (ty - y0 + 0.5) * T;
      if (city.districtAtPx(tx * T, ty * T) === 'Palm Shore') {
        g.strokeStyle = '#2f9e6b'; g.lineWidth = 4; g.lineCap = 'round';
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + tx; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); g.stroke(); }
        g.fillStyle = '#6b4a2e'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
      } else {
        g.fillStyle = '#0b2416'; g.beginPath(); g.arc(x + 3, y + 3, 14, 0, 7); g.fill();
        g.fillStyle = '#1f5a36'; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
        g.fillStyle = '#2d7a4a'; g.beginPath(); g.arc(x - 4, y - 4, 7, 0, 7); g.fill();
      }
    }
    // buildings: rooftops with neon edges
    for (const b of city.buildings) {
      if (b.x > x0 + CHUNK || b.x + b.w < x0 || b.y > y0 + CHUNK || b.y + b.h < y0) continue;
      drawBuilding(g, b, (b.x - x0) * T, (b.y - y0) * T);
    }
    // street lamps at the corners of every intersection
    g.globalCompositeOperation = 'lighter';
    for (const p of NG.ROADS) for (const q of NG.ROADS) for (const [ox, oy] of [[-0.35, -0.35], [2.35, 2.35]]) {
      const x = (p + ox - x0) * T, y = (q + oy - y0) * T;
      if (x < -80 || y < -80 || x > CHUNK * T + 80 || y > CHUNK * T + 80) continue;
      const gr = g.createRadialGradient(x, y, 0, x, y, 70);
      gr.addColorStop(0, 'rgba(255,214,150,0.22)'); gr.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = gr; g.fillRect(x - 70, y - 70, 140, 140);
    }
    g.globalCompositeOperation = 'source-over';
    chunks.set(key, c);
    if (chunks.size > 36) chunks.delete(chunks.keys().next().value);
    return c;
  }

  function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function drawBuilding(g, b, x, y) {
    const w = b.w * T, h = b.h * T, r = seeded(b.seed);
    g.fillStyle = '#05060c'; g.fillRect(x + 5, y + 7, w, h); // shadow
    g.fillStyle = b.roof; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    // rooftop details: vents, a water tank, and a helipad on tall towers
    if (b.floors >= 10 && w >= 160 && h >= 120) {
      g.strokeStyle = '#ffffff55'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 2, y + h / 2, 34, 0, 7); g.stroke();
      g.fillStyle = '#ffffff66'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', x + w / 2, y + h / 2 + 1);
    } else {
      const n = 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const vw = 10 + r() * 22, vh = 10 + r() * 18, vx = x + 10 + r() * (w - vw - 20), vy = y + 10 + r() * (h - vh - 20);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(vx + 2, vy + 3, vw, vh);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(vx, vy, vw, vh);
      }
      if (r() < 0.4) { const cx = x + 18 + r() * (w - 36), cy = y + 18 + r() * (h - 36); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cx + 2, cy + 3, 9, 0, 7); g.fill(); g.fillStyle = '#8a7b6a'; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill(); }
    }
    // neon outline: a wide soft line, then a bright thin one
    const glow = b.floors >= 6 || b.special || r() < 0.55;
    if (glow) {
      g.strokeStyle = hexA(b.neon, 0.22); g.lineWidth = 7; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
      g.strokeStyle = hexA(b.neon, 0.95); g.lineWidth = 1.6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
    if (b.label) {
      g.font = `800 ${Math.min(28, w / (b.label.length * 0.62))}px "Segoe UI", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = hexA(b.neon, 0.35); g.fillText(b.label.toUpperCase(), x + w / 2 + 1, y + h / 2 + 2);
      g.fillStyle = b.neon; g.fillText(b.label.toUpperCase(), x + w / 2, y + h / 2);
    }
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  // ---------------------------------------------------------------- cars and people

  const sprites = new Map();
  function carSprite(c) {
    const key = c.model + c.color + (c.kind === 'police' || c.model === 'police');
    let s = sprites.get(key);
    if (s) return s;
    const m = NG.MODELS[c.model], L = m.len, Wd = m.wid, P = 4;
    s = document.createElement('canvas'); s.width = (L + P * 2) * 2; s.height = (Wd + P * 2) * 2;
    const g = s.getContext('2d'); g.scale(2, 2); g.translate(P + L / 2, P + Wd / 2);
    const police = c.model === 'police';
    rr(g, -L / 2, -Wd / 2, L, Wd, 5); g.fillStyle = police ? '#141824' : c.color; g.fill();
    if (police) { g.fillStyle = '#e9edf5'; g.fillRect(-L * 0.16, -Wd / 2, L * 0.32, Wd); }
    // shading, roof and glass
    g.fillStyle = 'rgba(255,255,255,0.18)'; rr(g, -L / 2 + 2, -Wd / 2 + 1.5, L - 4, 3, 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; rr(g, -L / 2 + 2, Wd / 2 - 4.5, L - 4, 3, 2); g.fill();
    g.fillStyle = '#0d1422'; rr(g, -L * 0.2, -Wd / 2 + 2.5, L * 0.46, Wd - 5, 3); g.fill();
    g.fillStyle = '#4f6a8f'; rr(g, L * 0.08, -Wd / 2 + 3, L * 0.16, Wd - 6, 2); g.fill();
    g.fillStyle = '#3b4f6e'; rr(g, -L * 0.24, -Wd / 2 + 3.5, L * 0.08, Wd - 7, 1.5); g.fill();
    if (c.model === 'taxi') { g.fillStyle = '#111'; g.fillRect(-2, -3, 6, 6); g.fillStyle = '#fff3a6'; g.fillRect(-1, -2, 4, 4); }
    if (c.model === 'muscle' || c.model === 'super') { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-L / 2 + 1, -1.5, L - 2, 3); }
    // lights
    g.fillStyle = '#fff6d8'; g.fillRect(L / 2 - 2.5, -Wd / 2 + 2, 2, 4); g.fillRect(L / 2 - 2.5, Wd / 2 - 6, 2, 4);
    g.fillStyle = '#ff2d55'; g.fillRect(-L / 2 + 0.5, -Wd / 2 + 2, 2, 4); g.fillRect(-L / 2 + 0.5, Wd / 2 - 6, 2, 4);
    sprites.set(key, s);
    return s;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  const PED_COLOURS = ['#ff6b9a', '#4cdcf2', '#f7d154', '#9ad16f', '#b79bff', '#ff9f43'];
  function drawPed(p, now) {
    const step = Math.sin(now * 12 + p.id) * (p.dodge > 0 ? 0 : 2.2);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.dodge > 0 ? p.da : p.a);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(2, 3, 7, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#20222e'; ctx.fillRect(-2 + step, -5, 4, 3); ctx.fillRect(-2 - step, 2, 4, 3);
    ctx.fillStyle = PED_COLOURS[p.look]; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 6.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c79a74'; ctx.beginPath(); ctx.arc(1, 0, 3.4, 0, 7); ctx.fill();
    ctx.restore();
    if (p.shout > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', p.x, p.y - 14); }
  }
  function drawPlayerOnFoot(p, now) {
    const moving = Math.hypot(p.vx, p.vy) > 1, step = moving ? Math.sin(now * 14) * 2.6 : 0;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.fillStyle = 'rgba(104,244,209,0.18)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#10131c'; ctx.fillRect(-2 + step, -6, 5, 3); ctx.fillRect(-2 - step, 3, 5, 3);
    ctx.fillStyle = '#68f4d1'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 7.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1f1a'; ctx.beginPath(); ctx.arc(1, 0, 3.8, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- drawing a frame

  function draw(dt) {
    const now = performance.now() / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#07081a'; ctx.fillRect(0, 0, W, H);
    if (mode === 'title') return drawTitle(now);

    // camera: ahead of where you're going, and further out at speed
    const [px, py] = NG.playerPos(world);
    const car = world.player.car, sp = car ? Math.hypot(car.vx, car.vy) : 0;
    const base = Math.max(0.55, Math.min(1.25, Math.min(W, H) / 760));
    const look = car ? 0.42 : 0;
    cam.x += ((px + (car ? car.vx : 0) * look) - cam.x) * Math.min(1, dt * 4);
    cam.y += ((py + (car ? car.vy : 0) * look) - cam.y) * Math.min(1, dt * 4);
    cam.zoom += ((base * (1 - Math.min(0.28, sp / 2600))) - cam.zoom) * Math.min(1, dt * 2);
    const z = cam.zoom, shake = flash * 10;
    ctx.save();
    ctx.translate(W / 2 + (Math.random() - 0.5) * shake, H / 2 + (Math.random() - 0.5) * shake);
    ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
    const vw = W / z, vh = H / z, left = cam.x - vw / 2, top = cam.y - vh / 2;

    const S = CHUNK * T;
    for (let cy = Math.floor(top / S); cy <= Math.floor((top + vh) / S); cy++) for (let cx = Math.floor(left / S); cx <= Math.floor((left + vw) / S); cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= NG.W || cy * CHUNK >= NG.H) continue;
      ctx.drawImage(chunkCanvas(cx, cy), cx * S, cy * S);
    }
    // the sea shimmers
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(76,220,242,0.08)'; ctx.lineWidth = 2;
    for (let y = Math.floor(top / 48) * 48; y < top + vh; y += 48) {
      ctx.beginPath();
      for (let x = Math.floor(left / 24) * 24; x < left + vw; x += 24) {
        const t = world.city.tileAtPx(x, y);
        const yy = y + Math.sin(x * 0.02 + now * 1.4) * 4;
        if (t === TILE.WATER) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // tyre marks
    for (const s of skid) { ctx.strokeStyle = `rgba(0,0,0,${Math.min(0.5, s.t / 14 * 0.5)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }

    drawMarkers(now);
    const inView = (x, y, m) => x > left - m && x < left + vw + m && y > top - m && y < top + vh + m;
    for (const p of world.peds) if (inView(p.x, p.y, 30)) drawPed(p, now);
    if (!world.player.car) drawPlayerOnFoot(world.player, now);

    // headlights (under the cars), then the cars
    ctx.globalCompositeOperation = 'lighter';
    for (const c of world.cars) {
      if (!inView(c.x, c.y, 160) || c.kind === 'parked' || Math.hypot(c.vx, c.vy) < 20) continue;
      const m = NG.MODELS[c.model], ca = Math.cos(c.a), sa = Math.sin(c.a);
      const hx = c.x + ca * m.len * 0.5, hy = c.y + sa * m.len * 0.5;
      const gr = ctx.createRadialGradient(hx, hy, 2, hx, hy, 105);
      gr.addColorStop(0, 'rgba(255,236,190,0.16)'); gr.addColorStop(0.6, 'rgba(255,236,190,0.05)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.arc(hx, hy, 105, c.a - 0.36, c.a + 0.36); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const c of world.cars) {
      if (!inView(c.x, c.y, 60)) continue;
      const s = carSprite(c);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-s.width / 4 + 3, -s.height / 4 + 4, s.width / 2 - 2, s.height / 2 - 2);
      ctx.drawImage(s, -s.width / 4, -s.height / 4, s.width / 2, s.height / 2);
      if (c.kind === 'police' || c.model === 'police') {
        const on = Math.floor(now * 8 + c.id) % 2 === 0, lit = c.kind === 'police';
        ctx.fillStyle = lit && on ? '#ff2d55' : '#5a1020'; ctx.fillRect(-3, -7, 5, 6);
        ctx.fillStyle = lit && !on ? '#2d7bff' : '#10204a'; ctx.fillRect(-3, 1, 5, 6);
        if (lit) {
          ctx.globalCompositeOperation = 'lighter';
          const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
          gr.addColorStop(0, on ? 'rgba(255,45,85,0.35)' : 'rgba(45,123,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.fillRect(-70, -70, 140, 140);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (c === world.player.car) { ctx.strokeStyle = 'rgba(104,244,209,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(-NG.MODELS[c.model].len / 2 - 3, -NG.MODELS[c.model].wid / 2 - 3, NG.MODELS[c.model].len + 6, NG.MODELS[c.model].wid + 6); }
      if (c.target && c !== world.player.car) { ctx.strokeStyle = '#b79bff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(now * 5) * 4, 0, 7); ctx.stroke(); }
      if (c.kind === 'traffic' && c.honk > 1.2 && Math.floor(now * 2) % 2) { ctx.rotate(-c.a); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HONK', 0, -18); }
      ctx.restore();
    }
    for (const s of sparks) { ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},90,${s.t * 2})`; ctx.fillRect(s.x, s.y, 3, 3); }
    ctx.restore();

    // night: a vignette, and red/blue when the cops are close
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(7,8,26,0)'); vg.addColorStop(1, 'rgba(7,8,26,0.65)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (world.wanted.stars) { ctx.fillStyle = Math.floor(now * 3) % 2 ? 'rgba(255,45,85,0.05)' : 'rgba(45,123,255,0.05)'; ctx.fillRect(0, 0, W, H); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.35})`; ctx.fillRect(0, 0, W, H); }

    if (mode !== 'garage' && mode !== 'map') drawHud(now);
    if (mode === 'pause') drawPause();
    if (mode === 'garage') drawGarage(now);
    if (mode === 'map') drawMap(now);
  }

  function drawMarkers(now) {
    const pulse = 1 + Math.sin(now * 4) * 0.08;
    const ring = (x, y, colour, label, r) => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(x, y, 0, x, y, (r || 34) * pulse * 1.6);
      gr.addColorStop(0, hexA(colour, 0.35)); gr.addColorStop(1, hexA(colour, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, (r || 34) * pulse * 1.6, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, (r || 34) * pulse, 0, 7); ctx.stroke();
      if (label) { ctx.fillStyle = colour; ctx.font = '800 13px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - (r || 34) - 10); }
    };
    const poi = world.city.poi;
    const next = NG.MISSIONS[world.save.story];
    if (!world.mission && next) ring(poi[next.start].x, poi[next.start].y, '#fdf05a', `★ ${next.title}`, 30);
    ring(poi.garage.x, poi.garage.y, '#68f4d1', '', 24);
    if (world.wanted.stars) ring(poi.spray.x, poi.spray.y, '#ff3fa4', 'Spray $250', 26);
    if (!world.mission && !world.job && world.player.car) for (const t of poi.taxi) ring(t.x, t.y, '#ffd33d', 'Fares', 20);
    const o = NG.objective(world);
    if (o) ring(o.x, o.y, o.colour, o.label, 36);
    // tapes spin
    for (const t of world.city.tapes) {
      if (world.save.tapes.includes(t.id)) continue;
      ctx.save(); ctx.translate(t.x, t.y); ctx.scale(Math.cos(now * 3 + t.id), 1);
      ctx.fillStyle = '#b79bff'; rr(ctx, -10, -7, 20, 14, 2); ctx.fill();
      ctx.fillStyle = '#1b1533'; ctx.beginPath(); ctx.arc(-4, 0, 2.6, 0, 7); ctx.arc(4, 0, 2.6, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- HUD

  function panel(x, y, w, h) { ctx.fillStyle = 'rgba(10,11,24,0.78)'; rr(ctx, x, y, w, h, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke(); }
  function text(t, x, y, size, colour, align, weight) { ctx.font = `${weight || 700} ${size}px "Segoe UI", Inter, sans-serif`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = colour; ctx.fillText(t, x, y); }
  function star(x, y, r, filled, colour) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    ctx.closePath();
    if (filled) { ctx.fillStyle = colour; ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  function drawHud(now) {
    const pad = 16, s = world.save;
    // cash and stars, top right under the minimap
    const mm = Math.min(190, Math.max(130, W * 0.16));
    drawMinimap(W - mm - pad, pad, mm, now);
    text(`$${Math.round(cashShown).toLocaleString('en')}`, W - pad, mm + pad + 34, 28, '#68f4d1', 'right', 800);
    const unseen = world.wanted.stars && !world.wanted.seen;
    for (let k = 0; k < 5; k++) star(W - pad - 12 - (4 - k) * 26, mm + pad + 58, 10, k < world.wanted.stars, unseen && Math.floor(now * 4) % 2 ? 'rgba(253,240,90,0.35)' : '#fdf05a');
    floaters.forEach((f, i) => text(f.text, W - pad, mm + pad + 92 + i * 22 - (1.4 - f.t) * 14, 18, f.colour, 'right', 800));

    // the district you just drove into
    if (districtTimer > 0) { ctx.globalAlpha = Math.min(1, districtTimer); text(lastDistrict.toUpperCase(), pad, H - 96, 22, '#ffffff', 'left', 800); text('SOLARA BAY', pad, H - 76, 12, '#9aa7b4', 'left', 600); ctx.globalAlpha = 1; }
    // speed, car and radio, bottom left
    const car = world.player.car;
    if (car) {
      const kmh = Math.round(Math.hypot(car.vx, car.vy) / T * 3 * 3.6);
      panel(pad, H - 64, 230, 50);
      text(String(kmh), pad + 16, H - 28, 26, '#ffffff', 'left', 800);
      text('km/h', pad + 16 + ctx.measureText(String(kmh)).width + 6, H - 28, 12, '#9aa7b4', 'left', 600);
      text(NG.MODELS[car.model].name, pad + 214, H - 40, 13, '#ffffff', 'right', 700);
      text(`📻 ${audio.stationName()}`, pad + 214, H - 22, 11, '#9aa7b4', 'right', 600);
    }
    // mission box, top left
    let y = pad;
    if (world.mission || world.job) {
      const st = world.mission ? NG.MISSIONS[world.mission.idx].steps[world.mission.step] : null;
      const title = world.mission ? NG.MISSIONS[world.mission.idx].title : 'Fare';
      const textLine = st ? st.text : `Drop-off: ${Math.max(0, Math.ceil(world.job.timer))}s · $${world.job.pay}`;
      const timer = world.mission && world.mission.timer != null ? Math.max(0, Math.ceil(world.mission.timer)) : null;
      const lines = wrap(textLine, 320, 14);
      const h = 44 + lines.length * 18;
      panel(pad, y, 350, h);
      text(title.toUpperCase(), pad + 14, y + 24, 12, '#fdf05a', 'left', 800);
      if (timer != null) text(`${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')}`, pad + 336, y + 24, 16, timer < 10 ? '#ff6b8a' : '#ffffff', 'right', 800);
      if (world.race) text(`CHECKPOINT ${Math.min(world.race.cp + 1, world.race.checkpoints.length)}/${world.race.checkpoints.length}`, pad + 336, y + 24, 12, '#ffffff', 'right', 800);
      lines.forEach((l, i) => text(l, pad + 14, y + 46 + i * 18, 14, '#e8edf2', 'left', 500));
      y += h + 10;
    }
    toasts.forEach(t => {
      ctx.globalAlpha = Math.min(1, t.t * 2);
      const lines = wrap(t.text, 320, 13), h = 18 + lines.length * 17;
      panel(pad, y, 350, h);
      lines.forEach((l, i) => text(l, pad + 14, y + 22 + i * 17, 13, t.kind === 'bad' ? '#ff9db0' : t.kind === 'good' ? '#9ff5dc' : t.kind === 'mission' ? '#fff3a6' : '#e8edf2', 'left', 500));
      y += h + 8; ctx.globalAlpha = 1;
    });
    // what you can do here
    const hint = prompt();
    if (hint) { ctx.font = '700 14px "Segoe UI", sans-serif'; const w = ctx.measureText(hint).width + 36; panel(W / 2 - w / 2, H - 70, w, 38); text(hint, W / 2, H - 45, 14, '#ffffff', 'center', 700); }
    // banners
    const b = banners[0];
    if (b) {
      const a = Math.min(1, b.t * 2, (b.life - b.t) * 4);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(7,8,26,0.55)'; ctx.fillRect(0, H * 0.32, W, b.sub ? 110 : 80);
      ctx.save(); ctx.shadowColor = b.colour; ctx.shadowBlur = 24;
      text(b.text, W / 2, H * 0.32 + 52, Math.min(46, W / 16), b.colour, 'center', 900);
      ctx.restore();
      if (b.sub) wrap(b.sub, Math.min(760, W - 60), 15).slice(0, 2).forEach((l, i) => text(l, W / 2, H * 0.32 + 80 + i * 19, 15, '#e8edf2', 'center', 500));
      ctx.globalAlpha = 1;
    }
    if (showHelp) drawHelp();
  }

  function prompt() {
    const p = world.player, [x, y] = NG.playerPos(world), poi = world.city.poi;
    const next = NG.MISSIONS[world.save.story];
    if (!world.mission && next && Math.hypot(x - poi[next.start].x, y - poi[next.start].y) < 80) return `Enter  Start "${next.title}"`;
    if (!world.mission && Math.hypot(x - poi.garage.x, y - poi.garage.y) < 80) return "Enter  Rico's Garage: buy and change cars";
    if (p.car && world.wanted.stars && Math.hypot(x - poi.spray.x, y - poi.spray.y) < 80) return 'Enter  Fresh paint: lose the cops ($250)';
    if (p.car && !world.mission && !world.job && poi.taxi.some(t => Math.hypot(x - t.x, y - t.y) < 80)) return 'Enter  Take a fare';
    if (!p.car && world.cars.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 50)) return 'E  Get in';
    return '';
  }

  function wrap(t, width, size) {
    ctx.font = `500 ${size}px "Segoe UI", sans-serif`;
    const out = []; let line = '';
    for (const word of String(t).split(' ')) { const test = line ? line + ' ' + word : word; if (ctx.measureText(test).width > width && line) { out.push(line); line = word; } else line = test; }
    if (line) out.push(line);
    return out;
  }

  // minimap: the whole city drawn once at 2px a tile, then the area around you
  let mapImage = null;
  function cityMap() {
    if (mapImage) return mapImage;
    const c = document.createElement('canvas'); c.width = NG.W * 2; c.height = NG.H * 2;
    const g = c.getContext('2d');
    const MC = { [TILE.WATER]: '#0b1a3d', [TILE.SAND]: '#3d3436', [TILE.ROAD]: '#7d7f98', [TILE.WALK]: '#23253a', [TILE.BUILD]: '#2a2148', [TILE.GRASS]: '#16402a', [TILE.TREE]: '#16402a', [TILE.LOT]: '#2c2f45', [TILE.PIER]: '#6b4a2e' };
    for (let y = 0; y < NG.H; y++) for (let x = 0; x < NG.W; x++) { g.fillStyle = MC[world.city.get(x, y)]; g.fillRect(x * 2, y * 2, 2, 2); }
    return (mapImage = c);
  }
  function mapDots(g, sx, sy, scale, now) {
    const dot = (x, y, r, colour) => { g.fillStyle = colour; g.beginPath(); g.arc(sx(x), sy(y), r, 0, 7); g.fill(); };
    const poi = world.city.poi;
    dot(poi.garage.x, poi.garage.y, 4, '#68f4d1');
    if (world.wanted.stars) dot(poi.spray.x, poi.spray.y, 4, '#ff3fa4');
    const next = NG.MISSIONS[world.save.story];
    if (!world.mission && next) dot(poi[next.start].x, poi[next.start].y, 5, '#fdf05a');
    const o = NG.objective(world); if (o) dot(o.x, o.y, 5 + Math.sin(now * 6), o.colour);
    for (const c of world.cars) if (c.kind === 'police') dot(c.x, c.y, 3, Math.floor(now * 6) % 2 ? '#ff2d55' : '#2d7bff');
    for (const c of world.cars) if (c.kind === 'rival') dot(c.x, c.y, 3, '#ff9f43');
    const [px, py] = NG.playerPos(world), a = world.player.car ? world.player.car.a : world.player.a;
    g.save(); g.translate(sx(px), sy(py)); g.rotate(a);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    void scale;
  }
  function drawMinimap(x, y, size, now) {
    const img = cityMap(), [px, py] = NG.playerPos(world);
    const scale = 2 / T * 1.4; // minimap px per world px
    ctx.save();
    rr(ctx, x, y, size, size, 14); ctx.fillStyle = '#07081a'; ctx.fill(); ctx.clip();
    const sx = wx => x + size / 2 + (wx - px) * scale, sy = wy => y + size / 2 + (wy - py) * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx(0), sy(0), img.width * 1.4, img.height * 1.4);
    mapDots(ctx, sx, sy, scale, now);
    ctx.restore();
    ctx.strokeStyle = world.wanted.stars ? (Math.floor(now * 3) % 2 ? '#ff2d55' : '#2d7bff') : 'rgba(104,244,209,0.6)'; ctx.lineWidth = 2;
    rr(ctx, x, y, size, size, 14); ctx.stroke();
  }
  function drawMap(now) {
    ctx.fillStyle = 'rgba(5,6,16,0.9)'; ctx.fillRect(0, 0, W, H);
    const size = Math.min(W, H - 110), x = (W - size) / 2, y = 76, img = cityMap(), scale = size / (NG.W * T);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x, y, size, size);
    const half = size / 2;
    NG.DISTRICTS.forEach((d, i) => { ctx.globalAlpha = 0.55; text(d.name.toUpperCase(), x + half * (i % 2) + half / 2, y + half * Math.floor(i / 2) + half / 2, Math.max(12, size / 34), d.neon[0], 'center', 900); ctx.globalAlpha = 1; });
    const poi = world.city.poi;
    for (const k of ['garage', 'police', 'spray', 'bank', 'raceStart', 'pier']) { const q = poi[k]; text(q.label, x + q.x * scale, y + q.y * scale - 9, 11, '#ffffff', 'center', 700); }
    mapDots(ctx, wx => x + wx * scale, wy => y + wy * scale, scale, now);
    text('SOLARA BAY', W / 2, 40, 22, '#ffffff', 'center', 900);
    const legend = [['#68f4d1', "Rico's Garage"], ['#fdf05a', 'Next mission'], ['#ff3fa4', 'Spray shop'], ['#ff2d55', 'Police']];
    const lx = W / 2 - legend.length * 65;
    legend.forEach(([c, l], i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx + 8 + i * 130, H - 14, 5, 0, 7); ctx.fill(); text(l, lx + 20 + i * 130, H - 9, 13, '#c9d4de', 'left', 600); });
    text(`Tapes ${world.save.tapes.length}/20  ·  Missions ${world.save.story}/${NG.MISSIONS.length}  ·  Tab to close`, W / 2, 62, 13, '#9aa7b4', 'center', 600);
  }

  function drawHelp() {
    const w = Math.min(560, W - 40), h = 300, x = (W - w) / 2, y = (H - h) / 2;
    panel(x, y, w, h);
    text('HOW TO PLAY', x + 24, y + 38, 14, '#68f4d1', 'left', 800);
    const rows = [['W A S D / arrows', 'Drive or walk'], ['Space', 'Handbrake: drift!'], ['E', 'Get in or out of a car'], ['Enter / F', 'Start missions, garage, spray shop, fares'], ['Shift', 'Run'], ['Tab', 'City map'], ['R  ·  M  ·  H', 'Radio station · sound on/off · horn'], ['Esc / P', 'Pause']];
    rows.forEach(([k, v], i) => { text(k, x + 24, y + 72 + i * 25, 14, '#ffffff', 'left', 800); text(v, x + 210, y + 72 + i * 25, 14, '#c9d4de', 'left', 500); });
    text('Press Enter to start. The yellow marker is your first job.', x + w / 2, y + h - 18, 13, '#fdf05a', 'center', 700);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(5,6,16,0.75)'; ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, H / 2 - 120, 40, '#ffffff', 'center', 900);
    PAUSE.forEach((item, i) => {
      const label = i === 3 ? `Sound: ${soundSetting ? 'on' : 'off'}` : item;
      text((i === menuIndex ? '▶  ' : '') + label, W / 2, H / 2 - 50 + i * 40, 20, i === menuIndex ? '#68f4d1' : '#c9d4de', 'center', 700);
    });
    const s = world.save.stats;
    text(`Missions ${world.save.story}/${NG.MISSIONS.length} · Tapes ${world.save.tapes.length}/20 · Escapes ${s.escapes} · Busted ${s.busted} · Top speed ${s.topSpeed} km/h · Earned by coding $${s.paychecks.toLocaleString('en')}`, W / 2, H - 40, 13, '#9aa7b4', 'center', 600);
  }

  function drawGarage(now) {
    ctx.fillStyle = 'rgba(5,6,16,0.88)'; ctx.fillRect(0, 0, W, H);
    const model = NG.GARAGE[garageIndex], m = NG.MODELS[model], owned = world.save.owned.includes(model);
    text("RICO'S GARAGE", W / 2, 70, 30, '#68f4d1', 'center', 900);
    text('← →  choose    Enter  ' + (owned ? 'drive it' : `buy for $${m.price.toLocaleString('en')}`) + '    Esc  leave', W / 2, 98, 14, '#9aa7b4', 'center', 600);
    // the car, big and slowly turning
    const s = carSprite({ model, color: m.colors[0], kind: 'parked' });
    ctx.save(); ctx.translate(W / 2, H / 2 - 20); ctx.rotate(Math.sin(now * 0.8) * 0.3 - 0.2); ctx.scale(3.2, 3.2);
    ctx.drawImage(s, -s.width / 4, -s.height / 4, s.width / 2, s.height / 2); ctx.restore();
    text(m.name, W / 2, H / 2 + 80, 28, '#ffffff', 'center', 900);
    text(owned ? (world.save.car === model ? 'Yours · parked outside' : 'Yours') : `$${m.price.toLocaleString('en')}`, W / 2, H / 2 + 106, 16, owned ? '#68f4d1' : world.save.cash >= m.price ? '#fdf05a' : '#ff6b8a', 'center', 700);
    const bars = [['Top speed', m.max / 725], ['Acceleration', m.accel / 570], ['Handling', (m.turn - 2.3) / 1.1 * 0.5 + m.grip * 0.5]];
    bars.forEach(([l, v], i) => {
      const bx = W / 2 - 150, by = H / 2 + 136 + i * 28;
      text(l, bx, by + 10, 13, '#c9d4de', 'left', 600);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(bx + 110, by, 190, 10);
      ctx.fillStyle = '#68f4d1'; ctx.fillRect(bx + 110, by, 190 * Math.min(1, v), 10);
    });
    NG.GARAGE.forEach((g, i) => { ctx.fillStyle = i === garageIndex ? '#68f4d1' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(W / 2 - 36 + i * 24, H - 40, 5, 0, 7); ctx.fill(); });
    text(`$${Math.round(cashShown).toLocaleString('en')}`, W - 24, 40, 22, '#68f4d1', 'right', 800);
  }

  // ---------------------------------------------------------------- title screen

  function drawTitle(now) {
    // a slow flight over the city at night
    const t = now * 0.04;
    const cx = (NG.W * T) / 2 + Math.cos(t) * 1300, cy = (NG.H * T) / 2 + Math.sin(t * 0.8) * 1100;
    const z = Math.max(0.55, Math.min(1.1, Math.min(W, H) / 900));
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
    const vw = W / z, vh = H / z, S = CHUNK * T;
    for (let y = Math.floor((cy - vh / 2) / S); y <= Math.floor((cy + vh / 2) / S); y++) for (let x = Math.floor((cx - vw / 2) / S); x <= Math.floor((cx + vw / 2) / S); x++) {
      if (x < 0 || y < 0 || x * CHUNK >= NG.W || y * CHUNK >= NG.H) continue;
      ctx.drawImage(chunkCanvas(x, y), x * S, y * S);
    }
    for (const c of world.cars) { const s = carSprite(c); ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.drawImage(s, -s.width / 4, -s.height / 4, s.width / 2, s.height / 2); ctx.restore(); }
    ctx.restore();
    NG.step(world, {}, 1 / 60); // the city keeps moving behind the menu
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(7,8,26,0.85)'); g.addColorStop(0.5, 'rgba(7,8,26,0.35)'); g.addColorStop(1, 'rgba(7,8,26,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the logo
    const size = Math.min(96, W / 8);
    ctx.save(); ctx.translate(W / 2, H * 0.4); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.font = `900 ${size}px "Segoe UI", Inter, sans-serif`; ctx.textAlign = 'center';
    const lg = ctx.createLinearGradient(-size * 3, 0, size * 3, 0);
    lg.addColorStop(0, '#ff3fa4'); lg.addColorStop(0.5, '#ff8a5c'); lg.addColorStop(1, '#fdf05a');
    ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 30; ctx.fillStyle = lg; ctx.fillText('NEON', 0, 0);
    ctx.shadowColor = '#4cdcf2'; ctx.fillStyle = '#4cdcf2'; ctx.fillText('GETAWAY', 0, size * 0.95);
    ctx.restore();
    text('SOLARA BAY  ·  OPEN WORLD', W / 2, H * 0.4 + size * 1.55, 14, '#c9d4de', 'center', 700);
    if (Math.floor(now * 2) % 2 === 0) text('Press Enter to play', W / 2, H * 0.78, 20, '#ffffff', 'center', 800);
    text('W A S D drive  ·  Space drift  ·  E get in a car  ·  Tab map  ·  M sound', W / 2, H * 0.78 + 30, 13, '#9aa7b4', 'center', 600);
    if (world.save.cash) text(`$${world.save.cash.toLocaleString('en')}  ·  missions ${world.save.story}/${NG.MISSIONS.length}`, W / 2, H - 24, 13, '#68f4d1', 'center', 700);
  }

  vscode.postMessage({ type: 'ready' });
  window.__neonGetaway = { get world() { return world; }, get mode() { return mode; }, set mode(v) { mode = v; }, cam, banner, toast, clear() { banners.length = 0; toasts.length = 0; floaters.length = 0; } };
  requestAnimationFrame(frame);
})();
