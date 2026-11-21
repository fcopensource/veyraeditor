// Veyra Aura panel. Renders the state the extension posts, and draws the shareable aura card on a canvas.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  let data = null;
  let lastTotal = null;
  let cardUrl = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('en');
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toLocaleString('en');

  window.addEventListener('message', event => {
    const m = event.data;
    if (m.type === 'state') { data = m.data; render(); vscode.postMessage({ type: 'rendered', total: data.total }); }
    else if (m.type === 'makeCard') { if (data) makeCard(); }
  });

  function render() {
    const d = data, r = d.rank;
    const C = 2 * Math.PI * 88;
    const pop = lastTotal !== null && lastTotal !== d.total;
    lastTotal = d.total;
    const max = Math.max(10, ...d.week.map(w => Math.abs(w.aura)));
    const weekTotal = d.week.reduce((s, w) => s + w.aura, 0);
    app.innerHTML = `
      <section class="hero">
        <div class="ring">
          <div class="glow ${d.total < 0 ? 'neg' : ''}"></div>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs><linearGradient id="auraGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#68f4d1"/><stop offset=".45" stop-color="#4cdcf2"/><stop offset=".75" stop-color="#9673ff"/><stop offset="1" stop-color="#ff5fa8"/></linearGradient></defs>
            <circle class="track" cx="100" cy="100" r="88"/>
            <circle class="bar" cx="100" cy="100" r="88" stroke-dasharray="${(C * Math.max(0.002, d.progress)).toFixed(1)} ${C.toFixed(1)}"/>
          </svg>
          <div class="center ${pop ? 'pop' : ''}">
            <span class="label">AURA</span>
            <b class="total">${esc(d.totalText)}</b>
            <span class="today ${d.today < 0 ? 'neg' : ''}">${signed(d.today)} today</span>
          </div>
        </div>
        <div>
          <div class="rank"><span class="emoji">${r.emoji}</span><div><small>YOUR RANK</small><h1>${esc(r.name)}</h1><p>${esc(r.vibe)}</p></div></div>
          ${d.next ? `<div class="next"><div class="row"><span>Next: <b>${d.next.emoji} ${esc(d.next.name)}</b></span><span>${fmt(Math.max(0, d.next.min - d.total))} aura to go</span></div><div class="meter"><i data-w="${Math.round(d.progress * 100)}"></i></div></div>` : '<div class="next"><div class="row"><span><b>Max rank.</b> Nobody is above you.</span></div><div class="meter"><i data-w="100"></i></div></div>'}
          <div class="actions">
            <button class="btn primary" data-act="card">📸 Share my aura card</button>
            <button class="btn" data-act="caption">Copy caption</button>
          </div>
        </div>
      </section>

      <section class="stats">
        <div class="stat fire"><b>🔥 ${d.streak}</b><span>day streak · best ${d.bestStreak}</span></div>
        <div class="stat"><b>${signed(weekTotal)}</b><span>aura this week</span></div>
        <div class="stat"><b>${signed(d.today)}</b><span>aura today</span></div>
        <div class="stat"><b>${d.events.length ? esc(d.events[0].emoji) : '—'}</b><span>${d.events.length ? esc(d.events[0].text) : 'No moves yet'}</span></div>
      </section>

      <section class="grid2">
        <div class="box"><span class="kicker">THE WEEK</span><h2>Your last 7 days</h2>
          <div class="week">${d.week.map((w, i) => `<div class="day ${i === 6 ? 'today' : ''}"><div class="col"><i class="${w.aura < 0 ? 'neg' : ''}" data-h="${Math.round((Math.abs(w.aura) / max) * 100)}"></i></div><b>${w.aura ? signed(w.aura) : '·'}</b><span>${esc(w.day)}</span></div>`).join('')}</div>
        </div>
        <div class="box"><span class="kicker">BEST MOVES</span><h2>What's farming your aura</h2>
          ${d.top.length ? `<div class="top">${d.top.map(t => `<div><em>${t.emoji}</em><span>${esc(t.label)} <small class="muted">×${t.times}</small></span><b>+${fmt(t.aura)}</b></div>`).join('')}</div>` : '<p class="empty">Clear some errors, ship a commit or get your tests green. Your best moves show up here.</p>'}
        </div>
      </section>

      <section class="grid2 section">
        <div class="box"><span class="kicker">THE FEED</span><h2>Every move</h2>
          ${d.events.length ? `<ul class="feed">${d.events.map(e => `<li><em>${e.emoji}</em><span>${esc(e.text)}</span><b class="${e.aura > 0 ? 'plus' : e.aura < 0 ? 'minus' : 'zero'}">${signed(e.aura)}</b><small>${esc(e.ago)}</small></li>`).join('')}</ul>` : '<p class="empty">Nothing yet. Start coding: aura shows up here as you earn it.</p>'}
        </div>
        <div class="box"><span class="kicker">HOW TO FARM AURA</span><h2>The rules</h2>
          <p class="how"><b>+15</b> clear every error in a file · <b>+1</b> clean save · <b>+20</b> commit (<b>+5</b> if the message eats) · <b>+20</b> tests pass · <b>+10</b> build passes · <b>+15</b> delete 50+ lines · <b>+10</b> every 25 minutes locked in · <b>+5</b> per day of your streak<br>${d.roast ? '<b>−5</b> “wip” commit messages · <b>−5</b> failing tests · <b>−20</b> force push · <b>−5</b> leftover debugger' : 'Roast mode is off: no aura is taken away.'}</p>
        </div>
      </section>

      <section class="box section"><span class="kicker">THE LADDER</span><h2>Ranks</h2>
        <div class="ladder">${d.ranks.map(x => `<div class="${x.name === r.name ? 'now' : d.total >= x.min ? 'done' : ''}"><b>${x.emoji} ${esc(x.name)}</b><span>${fmt(x.min)} aura</span></div>`).join('')}</div>
      </section>
      ${cardUrl ? `<section class="box section card-preview"><span class="kicker">YOUR AURA CARD</span><h2>Saved. Caption copied. Go post it.</h2><img alt="Your aura card" src="${cardUrl}"></section>` : ''}`;

    // Sizes are set from script: the page's Content Security Policy blocks inline style attributes.
    for (const el of app.querySelectorAll('[data-w]')) requestAnimationFrame(() => { el.style.width = el.dataset.w + '%'; });
    for (const el of app.querySelectorAll('[data-h]')) el.style.height = Math.max(3, Number(el.dataset.h)) * 1.05 + 'px';
    app.querySelector('[data-act="card"]').addEventListener('click', makeCard);
    app.querySelector('[data-act="caption"]').addEventListener('click', () => vscode.postMessage({ type: 'caption' }));
  }

  // ---------- The aura card: 1200 × 630, the size X, LinkedIn and Instagram previews like ----------
  function makeCard() {
    const d = data, r = d.rank;
    const W = 1200, H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b0e15'); bg.addColorStop(1, '#161a2e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = (x, y, rad, color) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    glow(930, 300, 380, d.total < 0 ? 'rgba(255,79,109,0.35)' : 'rgba(150,115,255,0.45)');
    glow(1040, 160, 260, 'rgba(255,95,168,0.25)');
    glow(820, 470, 300, 'rgba(104,244,209,0.30)');
    glow(80, 640, 380, 'rgba(76,220,242,0.12)');

    // The ring with the rank emoji
    const cx = 930, cy = 300, R = 175;
    g.lineWidth = 22; g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    ring.addColorStop(0, '#68f4d1'); ring.addColorStop(0.45, '#4cdcf2'); ring.addColorStop(0.75, '#9673ff'); ring.addColorStop(1, '#ff5fa8');
    g.strokeStyle = ring; g.lineCap = 'round'; g.shadowColor = 'rgba(104,244,209,0.6)'; g.shadowBlur = 30;
    g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, d.progress)); g.stroke();
    g.shadowBlur = 0;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `150px ${font}`; g.fillText(r.emoji, cx, cy + 8);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';

    // Left side: the number, the rank, the vibe
    g.fillStyle = '#8e9aab'; g.font = `600 22px ${font}`;
    spaced('MY CODE AURA', 80, 112, 6);
    const num = g.createLinearGradient(80, 0, 640, 0);
    num.addColorStop(0, '#68f4d1'); num.addColorStop(0.5, '#4cdcf2'); num.addColorStop(1, '#c4a8ff');
    g.fillStyle = num; g.font = `800 ${d.totalText.length > 6 ? 130 : 150}px ${font}`;
    g.fillText(d.totalText, 72, 262);
    g.fillStyle = '#eef3f8'; g.font = `800 58px ${font}`;
    g.fillText(`${r.name} ${r.emoji}`, 80, 352);
    g.fillStyle = '#b9c3d0'; g.font = `400 28px ${font}`;
    g.fillText(r.vibe, 80, 400);

    // Chips: streak, this week, best move
    const week = d.week.reduce((s, w) => s + w.aura, 0);
    const chips = [];
    if (d.streak >= 1) chips.push(`🔥 ${d.streak}-day streak`);
    chips.push(`${signed(week)} this week`);
    if (d.top[0]) chips.push(`${d.top[0].emoji} ${d.top[0].label}`);
    let x = 80;
    g.font = `600 22px ${font}`;
    for (const c of chips) {
      const w = g.measureText(c).width + 36;
      if (x + w > 730) break;
      roundRect(x, 446, w, 54, 27); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = "#eef3f8"; g.fillText(c, x + 18, 481);
      x += w + 12;
    }
    // Footer
    g.fillStyle = '#6f7b8c'; g.font = `500 22px ${font}`;
    g.fillText('Veyra Aura for VS Code · veyraeditor.com/aura', 80, 580);

    cardUrl = canvas.toDataURL('image/png');
    vscode.postMessage({ type: 'card', png: cardUrl });
    render();

    function spaced(text, x0, y0, spacing) { let xx = x0; for (const ch of text) { g.fillText(ch, xx, y0); xx += g.measureText(ch).width + spacing; } }
    function roundRect(x0, y0, w, h, rad) { g.beginPath(); g.moveTo(x0 + rad, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, rad); g.arcTo(x0 + w, y0 + h, x0, y0 + h, rad); g.arcTo(x0, y0 + h, x0, y0, rad); g.arcTo(x0, y0, x0 + w, y0, rad); g.closePath(); }
  }

  vscode.postMessage({ type: 'ready' });
})();
