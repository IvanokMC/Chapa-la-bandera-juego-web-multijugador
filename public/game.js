(() => {
  'use strict';
  const { T, COLS, ROWS, MAPS, ITEMS, ROT_NAMES, CHARS, FOODS, RULES, overlap, itemRect, rotsOf, protectedZones, validPlacement } = SHARED;
  const W = COLS * T, H = ROWS * T, S = 2;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mod = (a, n) => ((a % n) + n) % n;
  const TOUCH = matchMedia('(pointer: coarse)').matches;

  const cv = $('game');
  const ctx = cv.getContext('2d');
  cv.width = W * S; cv.height = H * S;
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    cv.style.width = `${Math.floor(W * s)}px`; cv.style.height = `${Math.floor(H * s)}px`;
  }
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 250));
  if (window.visualViewport) visualViewport.addEventListener('resize', fit);
  fit();
  // Pantalla completa y, si el navegador lo permite, bloquear en horizontal.
  function goFull() {
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* no soportado */ } };
    try { const r = req && req.call(el); if (r && r.then) r.then(lock, () => {}); else lock(); } catch (e) { /* no soportado */ }
  }
  document.getElementById('rotar-full').addEventListener('click', goFull);
  document.getElementById('rotar-ok').addEventListener('click', () => document.body.classList.add('vertical-ok'));
  // Dibuja arte de alta resolución (2 px de arte por px del mundo) alineado a la rejilla de píxeles.
  const snap = (v) => { const k = S * cam.z; return Math.round(v * k) / k; };
  function draw(im, x, y, w = im.width / S, h = im.height / S) { ctx.drawImage(im, snap(x), snap(y), w, h); }
  const colorOf = (charId) => (CHARS.find((c) => c.id === charId) || CHARS[0]).color;

  // ---------- Sonido ----------
  const AU = {
    ctx: null, on: true, last: {},
    init() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sin audio */ } },
    tone(f, d, type = 'square', vol = 0.04, when = 0, slide = 0) {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
    },
    every(k, ms) { const n = performance.now(); if (n - (this.last[k] || 0) < ms) return false; this.last[k] = n; return true; },
  };
  const sfx = {
    jump: () => AU.tone(330, 0.1, 'square', 0.03, 0, 1.8),
    land: () => AU.tone(120, 0.05, 'triangle', 0.04),
    bounce: () => AU.tone(200, 0.25, 'square', 0.04, 0, 3),
    die: () => [300, 220, 160, 110].forEach((f, i) => AU.tone(f, 0.12, 'sawtooth', 0.04, i * 0.08)),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => AU.tone(f, 0.16, 'square', 0.04, i * 0.08)),
    eat: () => { AU.tone(660, 0.08, 'triangle', 0.05); AU.tone(990, 0.12, 'triangle', 0.05, 0.07); },
    power: () => AU.tone(520, 0.2, 'triangle', 0.05, 0, 2),
    pick: () => AU.tone(880, 0.08, 'square', 0.03),
    place: () => { AU.tone(200, 0.08, 'square', 0.05); AU.tone(140, 0.1, 'square', 0.04, 0.05); },
    rotate: () => AU.tone(620, 0.05, 'square', 0.03),
    boom: () => AU.tone(80, 0.5, 'sawtooth', 0.08, 0, 0.3),
    tick: () => AU.tone(1200, 0.04, 'square', 0.02),
    go: () => AU.tone(880, 0.3, 'square', 0.05),
    flap: () => AU.every('flap', 180) && AU.tone(180, 0.08, 'triangle', 0.05, 0, 0.6),
  };

  // ---------- Red ----------
  let ws = null, myId = 0, R = null, wantJoin = null, connected = false;
  const BASE = location.pathname.replace(/[^/]*$/, '');
  function connect() {
    setStatus('Conectando…');
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}ws`);
    ws.onopen = () => { connected = true; setStatus(''); if (wantJoin && !R) send({ t: 'join', ...wantJoin }); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMsg(m); };
    ws.onclose = () => {
      connected = false;
      if (R) { R = null; PH = 'home'; wantJoin = null; showHome('Se perdió la conexión con el servidor. Vuelve a entrar a la sala.'); }
      setStatus('Sin conexión. Reintentando…');
      setTimeout(connect, 2000);
    };
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function setStatus(s) { const el = $('status'); el.textContent = s; el.classList.toggle('hidden', !s); }

  // ---------- Estado local ----------
  let PH = 'home', phaseEnd = 0, runT0 = 0, lastTick = -1;
  let box = [], placed = [], foods = [], myRot = 0, cursor = null, cursors = [];
  const others = new Map();
  let me = null, level = null, fx = [], temps = [], countdownShown = -1, curSent = 0, roundNow = 0, lastScore = null, bombaNow = false;
  const myP = () => (R ? R.players.find((p) => p.id === myId) : null);
  const pById = (id) => (R ? R.players.find((p) => p.id === id) : null);
  const charOf = (id) => CHARS.find((c) => c.id === id) || CHARS[0];
  const mapIdx = () => (R ? R.map : 0);
  const mapNow = () => MAPS[mapIdx()];
  const myPick = () => { const p = myP(); return p && p.pick && !p.placed ? p.pick : null; };

  function onMsg(m) {
    switch (m.t) {
      case 'hi': myId = m.id; break;
      case 'err': toast(m.msg); wantJoin = null; showHome(); break;
      case 'joined': history.replaceState(null, '', `${location.pathname}?sala=${m.code}`); break;
      case 'left': R = null; PH = 'home'; showHome(); break;
      case 'room': {
        const first = !R, prevMap = R ? R.map : -1;
        R = m;
        if (R.map !== prevMap) buildLevel();
        if (first && R.phase === 'lobby') { PH = 'lobby'; showLobby(); }
        else if (PH === 'lobby' || PH === 'end') { if (R.phase === 'lobby') showLobby(); }
        if (PH === 'pick') renderPick();
        if (PH === 'score' && lastScore) showScore(lastScore);
        renderHud();
        break;
      }
      case 'phase': onPhase(m); break;
      case 'box': box = m.box; renderPick(); break;
      case 'placed': placed = m.items; buildLevel(); if (PH === 'place') sfx.place(); break;
      case 'boom': fx.push({ k: 'boom', x: (m.x + 0.5) * T, y: (m.y + 0.5) * T, t: 0.6, d: 0.6 }); puff((m.x + 0.5) * T, (m.y + 0.5) * T, 22, '#ffb040', 120, 90, 0.7, 2, 120); sfx.boom(); break;
      case 'bad': toast('No se puede poner ahí.'); break;
      case 's': {
        const now = performance.now();
        for (const [id, x, y, f, a, fl] of m.p) {
          if (id === myId) continue;
          let o = others.get(id);
          if (!o) { o = { x, y, buf: [], a }; others.set(id, o); }
          const lastS = o.buf[o.buf.length - 1];
          if (lastS && Math.hypot(lastS[1] - x, lastS[2] - y) > 70) o.buf = []; // teletransporte: no interpolar
          o.buf.push([now, x, y]);
          if (o.buf.length > 6) o.buf.shift();
          if ((fl & 1) && !(o.fl & 1)) { const p = pById(id); puff(o.x, o.y - 8, 16, p ? colorOf(p.char) : '#fff', 90, 70, 0.6, 2, 160); }
          Object.assign(o, { f, a, fl });
        }
        break;
      }
      case 'c': cursors = m.c.filter((c) => c[0] !== myId); break;
      case 'ev': {
        const p = pById(m.id);
        if (!p || m.id === myId) break;
        if (m.k === 'win') toast(`🇵🇪 ${p.name} chapó la bandera${m.n === 1 ? ' ¡primero!' : ''}`);
        if (m.k === 'die') { const o = others.get(m.id); if (o) fx.push({ k: 'poof', x: o.x, y: o.y - 8, t: 0.4, d: 0.4 }); }
        break;
      }
      case 'ate': { const f = foods.find((x) => x.i === m.i); if (f) f.by = m.id; break; }
      case 'fx': onFx(m); break;
      default:
    }
  }

  function onPhase(m) {
    PH = m.phase;
    phaseEnd = performance.now() + m.dur * 1000;
    lastTick = -1;
    if (PH === 'lobby') { others.clear(); me = null; showLobby(); return; }
    if (PH === 'pick') { box = m.box || box; myRot = 0; me = null; roundNow = m.round || (R ? R.round : 0); bombaNow = !!m.bomba; showPick(); sfx.pick(); if (bombaNow) banner('¡Nadie llegó! Apareció dinamita en la caja 🧨'); }
    if (PH === 'place') { hideScreen(); myRot = 0; cam.userZ = 1; if (TOUCH) { cursorScreen = { x: W / 2, y: H / 2 }; cursor = { x: W / 2, y: H / 2 }; } banner(myPick() ? `Coloca: ${ITEMS[myPick()].name}` : 'Mira dónde ponen sus trampas…'); }
    if (PH === 'run') {
      hideScreen(); foods = (m.foods || []).map((f) => ({ ...f })); others.clear(); temps = [];
      runT0 = performance.now() - (m.late ? (RULES.runTime + RULES.countdown - m.dur) * 1000 : 0);
      buildLevel();
      const p = myP();
      me = p && p.active && !m.late ? spawnMe() : null;
      countdownShown = -1;
    }
    if (PH === 'score') showScore(m);
    if (PH === 'end') showEnd(m);
    renderHud();
    refreshKeys();
  }

  // ---------- Nivel: colisiones, trampas y sus trayectorias ----------
  const SHOOTERS = {
    llama: { sp: 150, every: 2, burst: 1, gap: 0, off: 0.4, spr: 'escupitajo', why: 'la saliva de llama', oy: 5 },
    sicario: { sp: 300, every: 1.8, burst: 2, gap: 0.16, off: 0.9, spr: 'bala', why: 'una bala del sicario', oy: 16 },
  };
  const DROP = { sp: 170, every: 2.5, off: 0.7 };
  const BLINK = { period: 2.6, on: 1.2, warn: 0.4 };
  const pxRect = (r) => ({ x: r.x * T, y: r.y * T, w: r.w * T, h: r.h * T });

  function buildLevel() {
    const map = mapNow();
    const L = { solids: [], deadly: [], movers: [], shooters: [], droppers: [], blinkers: [], walkers: [], patrols: [], winds: [], perches: [], grid: new Set() };
    for (const s of map.solids) L.solids.push({ ...pxRect(s), kind: 'solid' });
    for (const s of map.spikes) L.deadly.push({ x: s.x * T + 3, y: s.y * T + 3, w: s.w * T - 6, h: s.h * T - 3, why: 'una tuna' });
    for (const s of map.water) L.deadly.push({ x: s.x * T, y: s.y * T + 6, w: s.w * T, h: s.h * T, why: 'el agua' });
    for (const it of placed) {
      const d = ITEMS[it.id], r = pxRect(itemRect(it));
      if (['solid', 'bounce', 'slip', 'dropper'].includes(d.kind) || it.id === 'llama') L.solids.push({ ...r, kind: d.kind === 'dropper' || d.kind === 'shooter' ? 'solid' : d.kind });
      if (d.kind === 'deadly') L.deadly.push({ x: r.x + 3, y: r.y + 4, w: r.w - 6, h: r.h - 4, why: d.name.toLowerCase() });
      if (it.id === 'sicario') L.deadly.push({ x: r.x + 4, y: r.y + 8, w: r.w - 8, h: r.h - 8, why: 'el sicario' });
    }
    for (const s of L.solids) for (let i = Math.floor(s.x / T); i < (s.x + s.w) / T; i++) for (let j = Math.floor(s.y / T); j < (s.y + s.h) / T; j++) L.grid.add(`${i},${j}`);
    level = L;
    for (const it of placed) addDynamic(L, it);
  }
  function addDynamic(L, it) {
    const d = ITEMS[it.id], r = pxRect(itemRect(it));
    if (d.kind === 'mover' || d.kind === 'moverDeadly') {
      L.movers.push({ it, base: r, axis: (d.kind === 'mover') === !it.rot ? 'y' : 'x', amp: (d.kind === 'mover' ? 2.5 : 3) * T, period: d.kind === 'mover' ? 4 : 3,
        deadly: d.kind === 'moverDeadly', rect: { ...r, kind: 'solid' }, dx: 0, dy: 0 });
    }
    if (d.kind === 'shooter') {
      const c = SHOOTERS[it.id], dir = it.rot ? -1 : 1, ox = dir > 0 ? r.x + r.w : r.x, oy = r.y + c.oy;
      L.shooters.push({ it, ...c, x: ox, y: oy, dir, range: ray(L, ox + dir, oy, dir, 0) });
    }
    if (d.kind === 'dropper') { const ox = r.x + 8, oy = r.y + r.h; L.droppers.push({ it, x: ox, y: oy, range: ray(L, ox, oy + 1, 0, 1) }); }
    if (d.kind === 'blinker') {
      const vert = it.rot % 2 === 1;
      L.blinkers.push({ it, r, vert, phase: mod(it.x * 0.37 + it.y * 0.61, BLINK.period), hit: vert ? { x: r.x + 5, y: r.y, w: 7, h: r.h } : { x: r.x, y: r.y + 5, w: r.w, h: 7 } });
    }
    if (d.kind === 'walker') L.walkers.push({ it, ...simWalker(L, r, it.rot ? -1 : 1) });
    if (d.kind === 'patrol') L.patrols.push({ it, ...simPatrol(L, r, it.rot ? -1 : 1) });
    if (d.kind === 'wind') L.winds.push({ it, r, dir: it.rot });
    if (d.kind === 'jetpack') L.perches.push({ it, r, i: L.perches.length });
  }
  const cellSolid = (L, i, j) => L.grid.has(`${i},${j}`);
  function boxHits(L, x, y, w, h) {
    if (x < 0 || x + w > W) return true;
    for (let i = Math.floor(x / T); i <= Math.floor((x + w - 0.01) / T); i++) for (let j = Math.floor(y / T); j <= Math.floor((y + h - 0.01) / T); j++) if (cellSolid(L, i, j)) return true;
    return false;
  }
  function ray(L, x, y, dx, dy) {
    for (let d = 0; d < 1200; d += 2) {
      const px = x + dx * d, py = y + dy * d;
      if (px < 0 || px > W || py > H) return d;
      if (cellSolid(L, Math.floor(px / T), Math.floor(py / T))) return d;
    }
    return 1200;
  }
  // Carro de néctar: avanza, se cae en los huecos, rebota en paredes. La ruta se precalcula igual en todos los clientes.
  function simWalker(L, r, dir0) {
    const path = [], dt = 1 / 60, speed = 72;
    let x = r.x, y = r.y, dir = dir0, vy = 0, exited = false;
    for (let i = 0; i < 60 * 25; i++) {
      let nx = x + dir * speed * dt;
      if (boxHits(L, nx, y, r.w, r.h)) { dir = -dir; nx = x; }
      x = nx;
      vy = Math.min(vy + 1000 * dt, 430);
      let ny = y + vy * dt;
      if (boxHits(L, x, ny, r.w, r.h)) { ny = Math.floor((ny + r.h) / T) * T - r.h; vy = 0; if (boxHits(L, x, ny, r.w, r.h)) ny = y; }
      y = ny;
      path.push(x, y, dir);
      if (y > H + 30) { exited = true; break; }
    }
    const dur = path.length / 3 / 60;
    return { path, dur, cycle: dur + (exited ? 1.2 : 0), exited, w: r.w, h: r.h };
  }
  function walkerAt(wk, t) {
    const tt = mod(t, wk.cycle), i = Math.floor(tt * 60);
    if (i * 3 >= wk.path.length) return null;
    return { x: wk.path[i * 3], y: wk.path[i * 3 + 1], dir: wk.path[i * 3 + 2] };
  }
  // Perro chusco: cae hasta el piso y patrulla de borde a borde.
  function simPatrol(L, r, dir0) {
    const fall = [];
    let y = r.y, vy = 0; const dt = 1 / 60;
    while (!boxHits(L, r.x, y + 1, r.w, r.h) && y < H + 30) { vy = Math.min(vy + 1000 * dt, 430); y += vy * dt; if (boxHits(L, r.x, y, r.w, r.h)) y = Math.floor((y + r.h) / T) * T - r.h; fall.push(y); }
    if (y >= H + 30) return { fall, dead: true, x0: r.x };
    const row = Math.round((y + r.h) / T), c = Math.floor(r.x / T);
    let a = c, b = c;
    while (a - 1 >= 0 && cellSolid(L, a - 1, row) && !cellSolid(L, a - 1, row - 1)) a--;
    while (b + 1 < COLS && cellSolid(L, b + 1, row) && !cellSolid(L, b + 1, row - 1)) b++;
    return { fall, y, minX: a * T, maxX: b * T, x0: r.x, dir0, landT: fall.length / 60, sp: 45 };
  }
  function patrolAt(pt, t) {
    if (pt.dead) { const i = Math.floor(mod(t, pt.fall.length / 60 + 1) * 60); return i < pt.fall.length ? { x: pt.x0, y: pt.fall[i], dir: 1 } : null; }
    if (t < pt.landT) return { x: pt.x0, y: pt.fall[Math.floor(t * 60)] ?? pt.y, dir: pt.dir0 };
    const span = pt.maxX - pt.minX;
    if (span <= 0) return { x: pt.minX, y: pt.y, dir: pt.dir0 };
    const u0 = pt.dir0 > 0 ? pt.x0 - pt.minX : span + (pt.maxX - pt.x0);
    const u = mod(u0 + (t - pt.landT) * pt.sp, 2 * span);
    return u < span ? { x: pt.minX + u, y: pt.y, dir: 1 } : { x: pt.maxX - (u - span), y: pt.y, dir: -1 };
  }
  function moverRect(m, t) {
    const off = Math.sin((t / m.period) * Math.PI * 2) * m.amp;
    return { x: m.base.x + (m.axis === 'x' ? off : 0), y: m.base.y + (m.axis === 'y' ? off : 0), w: m.base.w, h: m.base.h, kind: 'solid', mover: m };
  }
  const blinkOn = (b, t) => mod(t + b.phase, BLINK.period) < BLINK.on;
  const blinkWarn = (b, t) => mod(t + b.phase, BLINK.period) > BLINK.period - BLINK.warn;
  function projectiles(t) {
    const out = [];
    if (!level) return out;
    for (const s of level.shooters) {
      const first = Math.max(0, Math.floor((t - s.off - s.range / s.sp - s.gap * s.burst) / s.every));
      for (let k = first; k <= Math.floor((t - s.off) / s.every); k++) {
        for (let b = 0; b < s.burst; b++) {
          const d = (t - s.off - k * s.every - b * s.gap) * s.sp;
          if (d >= 0 && d < s.range) out.push({ k: s.spr, x: s.x + s.dir * d, y: s.y, dir: s.dir, why: s.why, sz: s.spr === 'bala' ? 3 : 5 });
        }
      }
    }
    for (const s of level.droppers) {
      for (let k = Math.max(0, Math.floor((t - DROP.off - s.range / DROP.sp) / DROP.every)); k <= Math.floor((t - DROP.off) / DROP.every); k++) {
        const d = (t - DROP.off - k * DROP.every) * DROP.sp;
        if (d >= 0 && d < s.range) out.push({ k: 'roca', x: s.x, y: s.y + d, why: 'el huaico', sz: 6 });
      }
    }
    return out;
  }
  const runTime = () => (performance.now() - runT0) / 1000 - RULES.countdown;
  const animTime = () => (PH === 'run' ? Math.max(0, runTime()) : performance.now() / 1000);

  // ---------- Jugador local ----------
  const GRAV = 1000, JUMP = 340, MOVE = 115, MAXFALL = 430;
  function spawnMe() {
    const map = mapNow(), idx = R.players.findIndex((p) => p.id === myId);
    return {
      x: map.start[0] * T + 8 + ((idx % 4) - 1.5) * 9, y: map.start[1] * T, vx: 0, vy: 0, face: 1, ground: null, coyote: 0, jumpBuf: 0,
      wall: 0, dead: false, won: false, jumps: 0, dbl: false, shield: false, speedT: 0, jumpT: 0, immuneT: 0, glideT: 0,
      stunT: 0, invertT: 0, cd: 0, pollo: false, anim: 0, sendAcc: 0, char: myP().char, jet: 0, perches: new Set(),
    };
  }
  const keys = {}, pressed = {};
  const KEYGROUP = { KeyA: 'move', KeyD: 'move', ArrowLeft: 'move', ArrowRight: 'move', Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', KeyE: 'power', ShiftLeft: 'power', ShiftRight: 'power', KeyK: 'power', KeyR: 'rotate', KeyQ: 'rotate' };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    // que Espacio nunca "apriete" un botón que quedó enfocado
    if ((PH === 'run' || PH === 'place') && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && PH !== 'home') e.preventDefault();
    if (e.code === 'KeyR' && PH === 'place') rotate(1);
    if (e.code === 'KeyQ' && PH === 'place') rotate(-1);
    if (PH === 'place' && (e.code === 'Equal' || e.code === 'NumpadAdd')) stepZoom(1);
    if (PH === 'place' && (e.code === 'Minus' || e.code === 'NumpadSubtract')) stepZoom(-1);
    if (e.code === 'KeyH' && (PH === 'place' || PH === 'run')) { keysForced = !keysForced; refreshKeys(); }
    if (PH === 'pick' && /^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (box[i]) send({ t: 'pick', i }); }
    markKey(KEYGROUP[e.code], e.code);
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; document.querySelectorAll(`#keys [data-code~="${e.code}"]`).forEach((k) => k.classList.remove('down')); });
  const touch = { left: false, right: false, jump: false, power: false };
  const down = (...c) => c.some((k) => keys[k]);
  const hit = (...c) => c.some((k) => pressed[k]);
  const box10 = (p) => ({ x: p.x - 5, y: p.y - 14, w: 10, h: 14 });

  function solidsAt(t) {
    const arr = level.solids.slice();
    for (const m of level.movers) if (!m.deadly) arr.push(m.rect);
    for (const tp of temps) if (tp.until > t) arr.push(tp);
    return arr;
  }
  function stepMe(dt, t) {
    const m = me;
    for (const mv of level.movers) { const nr = moverRect(mv, t); mv.dx = nr.x - mv.rect.x; mv.dy = nr.y - mv.rect.y; mv.rect = nr; }
    if (m.dead || m.won) return;
    if (m.ground && m.ground.mover) { m.x += m.ground.mover.dx; m.y += m.ground.mover.dy; }
    const solids = solidsAt(t);
    const stunned = m.stunT > t;
    let dir = (down('KeyA', 'ArrowLeft') || touch.left ? -1 : 0) + (down('KeyD', 'ArrowRight') || touch.right ? 1 : 0);
    if (m.invertT > t) dir = -dir;
    if (stunned) dir = 0;
    const jumpHeld = !stunned && (down('Space', 'KeyW', 'ArrowUp') || touch.jump);
    if (!stunned && (hit('Space', 'KeyW', 'ArrowUp') || touch.jumpHit)) m.jumpBuf = 0.12;
    touch.jumpHit = false;
    if (dir) m.face = dir;
    const onSlip = m.ground && m.ground.kind === 'slip';
    const speed = MOVE * (m.speedT > t ? 1.4 : 1);
    const acc = m.ground ? (onSlip ? 260 : 1500) : 950;
    if (dir) m.vx += clamp(dir * speed - m.vx, -acc * dt, acc * dt);
    else { const fr = m.ground ? (onSlip ? 60 : 1700) : 300; m.vx -= clamp(m.vx, -fr * dt, fr * dt); }
    m.coyote = m.ground ? 0.09 : m.coyote - dt;
    m.jumpBuf -= dt;
    const jv = JUMP * (m.jumpT > t ? 1.22 : 1);
    if (m.jumpBuf > 0) {
      if (m.ground || m.coyote > 0) { m.vy = -jv; m.jumpBuf = 0; m.coyote = 0; m.ground = null; m.jumps = 0; m.stT = 0.12; dust(m.x, m.y, 4); sfx.jump(); }
      else if (m.wall) { m.vy = -jv * 0.95; m.vx = -m.wall * 170; m.face = -m.wall; m.jumpBuf = 0; m.stT = 0.12; puff(m.x + m.wall * 5, m.y - 6, 5, '#ffffff', 20, 10, 0.3); sfx.jump(); }
      else if (m.dbl && m.jumps < 1 && m.jet <= 0) { m.vy = -jv * 0.9; m.jumps++; m.jumpBuf = 0; sfx.jump(); fx.push({ k: 'poof', x: m.x, y: m.y, t: 0.25, d: 0.25 }); }
    }
    if (!stunned && (hit('KeyE', 'ShiftLeft', 'ShiftRight', 'KeyK') || touch.powerHit)) usePower(t, solids);
    touch.powerHit = false;
    let g = GRAV;
    if (m.glideT > t && m.vy > 0) g = GRAV * 0.25;
    if (m.vy < 0 && !jumpHeld && m.jet <= 0) g *= 2.2;
    // cóndor jetpack: mantener saltar para volar
    if (m.jet > 0) {
      if (jumpHeld && !m.ground) { m.vy = Math.max(m.vy - 2600 * dt, -240); m.jet -= dt; sfx.flap(); }
      if (m.jet <= 0) { m.jet = 0; fx.push({ k: 'condorSale', x: m.x, y: m.y - 22, t: 1, d: 1 }); toast('El cóndor se fue volando.'); }
    }
    // viento
    for (const wz of level.winds) {
      if (!overlap(box10(m), wz.r)) continue;
      if (wz.dir === 0) m.vx = Math.min(m.vx + 950 * dt, 270);
      if (wz.dir === 2) m.vx = Math.max(m.vx - 950 * dt, -270);
      if (wz.dir === 1) { m.vy -= 1900 * dt; m.ground = null; }
      if (wz.dir === 3) m.vy += 900 * dt;
    }
    const maxFall = m.glideT > t ? 70 : m.jet > 0 ? 150 : m.wall && m.vy > 0 ? 90 : MAXFALL;
    m.vy = Math.max(-520, Math.min(m.vy + g * dt, maxFall));
    // mover en X
    m.x += m.vx * dt;
    let b = box10(m);
    for (const s of solids) if (overlap(b, s)) { if (m.vx > 0) m.x = s.x - 5.001; else if (m.vx < 0) m.x = s.x + s.w + 5.001; m.vx = 0; b = box10(m); }
    // mover en Y
    const wasGround = !!m.ground;
    m.y += m.vy * dt;
    b = box10(m);
    m.ground = null;
    let bounced = false;
    for (const s of solids) {
      if (!overlap(b, s)) continue;
      if (m.vy >= 0) { m.y = s.y - 0.001; if (s.kind === 'bounce') bounced = true; else m.ground = s; m.vy = 0; }
      else { m.y = s.y + s.h + 14.001; m.vy = 0; }
      b = box10(m);
    }
    if (!m.ground) { const probe = { x: m.x - 5, y: m.y, w: 10, h: 1.5 }; for (const s of solids) if (s.kind !== 'bounce' && overlap(probe, s)) { m.ground = s; break; } }
    if (bounced) { m.vy = -560; m.ground = null; m.jumps = 0; m.stT = 0.18; puff(m.x, m.y, 8, '#ffffff', 60, 30, 0.4); sfx.bounce(); }
    if (m.ground && !wasGround) { m.sqT = 0.12; dust(m.x, m.y, 6); sfx.land(); }
    if (m.ground && Math.abs(m.vx) > 60) { m.dAcc = (m.dAcc || 0) + dt; if (m.dAcc > 0.09) { m.dAcc = 0; dust(m.x - m.face * 4, m.y, 1); } }
    for (const s of solids) {
      b = box10(m);
      if (!overlap(b, s)) continue;
      const pl = b.x + b.w - s.x, pr = s.x + s.w - b.x, pu = b.y + b.h - s.y, pd = s.y + s.h - b.y, mn = Math.min(pl, pr, pu, pd);
      if (mn === pu) { m.y -= pu; m.ground = s; } else if (mn === pd) m.y += pd; else if (mn === pl) m.x -= pl; else m.x += pr;
    }
    m.wall = 0;
    if (!m.ground) {
      const l = { x: m.x - 6.5, y: m.y - 12, w: 1.5, h: 10 }, r = { x: m.x + 5, y: m.y - 12, w: 1.5, h: 10 };
      if (dir < 0 && solids.some((s) => overlap(l, s))) m.wall = -1;
      if (dir > 0 && solids.some((s) => overlap(r, s))) m.wall = 1;
      if (m.wall && m.vy > 20) { m.wAcc = (m.wAcc || 0) + dt; if (m.wAcc > 0.08) { m.wAcc = 0; puff(m.x + m.wall * 5, m.y - 4, 1, '#ffffff', 6, 4, 0.3); } }
    }
    m.x = clamp(m.x, 5, W - 5);
    m.anim = !m.ground ? 2 : Math.abs(m.vx) > 10 ? 1 : 0;
    // peligros
    const hb = { x: m.x - 4, y: m.y - 12, w: 8, h: 11 };
    let why = null;
    if (m.y > H + 24) why = 'una caída';
    for (const d of level.deadly) if (overlap(hb, d)) why = d.why;
    for (const mv of level.movers) if (mv.deadly && overlap(hb, { x: mv.rect.x + 2, y: mv.rect.y + 2, w: mv.rect.w - 4, h: mv.rect.h - 2 })) why = 'la combi';
    for (const bl of level.blinkers) if (blinkOn(bl, t) && overlap(hb, bl.hit)) why = 'un cable pelado';
    for (const wk of level.walkers) { const p = walkerAt(wk, t); if (p && overlap(hb, { x: p.x + 2, y: p.y + 2, w: wk.w - 4, h: wk.h - 2 })) why = 'el carro de néctar'; }
    for (const pt of level.patrols) { const p = patrolAt(pt, t); if (p && overlap(hb, { x: p.x + 3, y: p.y + 5, w: 10, h: 11 })) why = 'un perro chusco'; }
    for (const p of projectiles(t)) if (overlap(hb, { x: p.x - p.sz / 2, y: p.y - p.sz / 2, w: p.sz, h: p.sz })) why = p.why;
    if (why && m.immuneT <= t) {
      if (m.shield) {
        m.shield = false; m.immuneT = t + 1.2; m.vy = why === 'una caída' ? -560 : -300; m.y = Math.min(m.y, H - 4);
        toast('¡El rocoto relleno te salvó!'); sfx.eat();
      } else die(why);
    }
    // cóndor jetpack
    for (const pc of level.perches) {
      if (!m.perches.has(pc.i) && overlap(hb, pc.r)) { m.perches.add(pc.i); m.jet = 2.6; m.jumps = 0; toast('¡Un cóndor te carga! Mantén saltar para volar.'); sfx.power(); }
    }
    // comida
    for (const f of foods) {
      if (f.by) continue;
      if (overlap(hb, { x: f.x * T + 2, y: f.y * T + 2, w: 12, h: 12 })) { f.by = myId; eat(f.k, t); send({ t: 'eat', i: f.i }); }
    }
    // bandera
    const map = mapNow();
    if (overlap(hb, { x: map.flag[0] * T + 2, y: (map.flag[1] - 3) * T, w: 12, h: 3 * T })) {
      m.won = true; send({ t: 'st', x: m.x, y: m.y, f: m.face, a: 0, fl: flags() }); send({ t: 'finish' });
      sfx.win(); banner('¡Chapaste la bandera! 🇵🇪'); fx.push({ k: 'confeti', x: m.x, y: m.y - 20, t: 1.4, d: 1.4 });
    }
  }
  function flags() {
    const t = runTime(), m = me;
    if (!m) return 0;
    return (m.dead ? 1 : 0) | (m.won ? 2 : 0) | (m.immuneT > t ? 4 : 0) | (m.glideT > t ? 8 : 0) | (m.stunT > t ? 16 : 0) | (m.invertT > t ? 32 : 0)
      | (m.shield ? 64 : 0) | (m.pollo ? 128 : 0) | (m.jet > 0 ? 256 : 0);
  }
  function die(why) {
    me.dead = true;
    puff(me.x, me.y - 8, 18, colorOf(me.char), 100, 80, 0.7, 2, 160);
    if (why === 'el agua') puff(me.x, H - 26, 14, '#bfe4ff', 50, 110, 0.6, 2, 220);
    send({ t: 'st', x: me.x, y: me.y, f: me.face, a: 0, fl: flags() });
    send({ t: 'die', why });
    sfx.die();
    fx.push({ k: 'poof', x: me.x, y: me.y - 8, t: 0.5, d: 0.5 });
    banner(`Te ganó ${why}. Mira cómo les va a los demás…`);
    refreshKeys();
  }
  function eat(k, t) {
    sfx.eat();
    if (k === 'picarones') { me.dbl = true; toast('Picarones: ¡doble salto!'); }
    if (k === 'ceviche') { me.speedT = t + 8; toast('Ceviche: ¡más rápido por 8 s!'); }
    if (k === 'rocoto') { me.shield = true; toast('Rocoto relleno: escudo contra una trampa'); }
    if (k === 'chicha') { me.jumpT = t + 8; toast('Chicha morada: ¡saltas más alto por 8 s!'); }
    if (k === 'pollo') { me.pollo = true; toast('Pollo a la brasa: +5 puntos si llegas'); }
  }
  function nearestOther(maxD, filter = () => true) {
    let best = null, bd = maxD;
    for (const [id, o] of others) {
      if (o.fl & 3) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d < bd && filter(o)) { bd = d; best = id; }
    }
    return best;
  }
  function usePower(t, solids) {
    if (me.cd > t || t < 0) return;
    const c = charOf(me.char);
    me.cd = t + c.cd;
    sfx.power();
    const base = { t: 'pw', x: me.x, y: me.y - 8 };
    switch (c.id) {
      case 'vedette': { const id = nearestOther(100); send({ ...base, k: 'stun', to: id ? [id] : [] }); fx.push({ k: 'hearts', x: me.x, y: me.y - 10, t: 0.8, d: 0.8 }); break; }
      case 'congresista': me.immuneT = t + 2.5; send({ ...base, k: 'immune' }); break;
      case 'presidente': {
        const x0 = me.x;
        for (let d = 60; d >= 8; d -= 4) {
          const nx = clamp(me.x + me.face * d, 5, W - 5);
          if (!solids.some((s) => overlap({ x: nx - 5, y: me.y - 14, w: 10, h: 14 }, s))) { me.x = nx; break; }
        }
        fx.push({ k: 'poof', x: x0, y: me.y - 8, t: 0.4, d: 0.4 }, { k: 'poof', x: me.x, y: me.y - 8, t: 0.4, d: 0.4 });
        send({ ...base, k: 'blink', x: x0, x2: me.x, y2: me.y - 8 });
        break;
      }
      case 'alcalde': temps.push({ x: me.x - 24, y: me.y, w: 48, h: 8, kind: 'solid', obra: true, until: t + 3.5 }); send({ ...base, k: 'obra', x: me.x, y: me.y }); break;
      case 'chola': {
        const id = nearestOther(150, (o) => (o.x - me.x) * me.face > 0 && Math.abs(o.y - me.y) < 48);
        const tgt = id ? others.get(id) : null;
        const x2 = tgt ? tgt.x : me.x + me.face * 120, y2 = tgt ? tgt.y - 8 : me.y - 8;
        send({ ...base, k: 'knock', to: id ? [id] : [], d: me.face, x2, y2 });
        fx.push({ k: 'stone', x: me.x, y: me.y - 8, x2, y2, t: 0.3, d: 0.3 });
        break;
      }
      case 'futbolista': me.vy = -JUMP * 1.5; me.ground = null; send({ ...base, k: 'chalaca' }); fx.push({ k: 'poof', x: me.x, y: me.y, t: 0.3, d: 0.3 }); break;
      case 'condor': me.glideT = t + 2.5; send({ ...base, k: 'glide' }); break;
      case 'comico': {
        const ids = [...others].filter(([, o]) => !(o.fl & 3) && Math.hypot(o.x - me.x, o.y - me.y) < 120).map(([id]) => id);
        send({ ...base, k: 'invert', to: ids }); fx.push({ k: 'ring', x: me.x, y: me.y - 8, t: 0.5, d: 0.5 });
        break;
      }
      default:
    }
  }
  function onFx(m) {
    const t = runTime();
    const from = pById(m.from), name = from ? from.name : '?';
    if (m.from !== myId) {
      if (m.k === 'stun') fx.push({ k: 'hearts', x: m.x, y: m.y, t: 0.8, d: 0.8 });
      if (m.k === 'blink') fx.push({ k: 'poof', x: m.x, y: m.y, t: 0.4, d: 0.4 }, { k: 'poof', x: m.x2, y: m.y2, t: 0.4, d: 0.4 });
      if (m.k === 'obra') temps.push({ x: m.x - 24, y: m.y, w: 48, h: 8, kind: 'solid', obra: true, until: t + 3.5 });
      if (m.k === 'knock') fx.push({ k: 'stone', x: m.x, y: m.y, x2: m.x2, y2: m.y2, t: 0.3, d: 0.3 });
      if (m.k === 'invert') fx.push({ k: 'ring', x: m.x, y: m.y, t: 0.5, d: 0.5 });
      if (m.k === 'chalaca') fx.push({ k: 'poof', x: m.x, y: m.y + 8, t: 0.3, d: 0.3 });
    }
    if (!me || me.dead || me.won || !m.to.includes(myId)) return;
    if (me.immuneT > t) { toast('¡Inmunidad! No te afectó.'); return; }
    if (m.k === 'stun') { me.stunT = t + 1.3; toast(`💋 ${name} te dejó paralizado`); }
    if (m.k === 'invert') { me.invertT = t + 2.5; toast(`🤡 ${name} te contó un chiste malo: ¡controles al revés!`); }
    if (m.k === 'knock') { me.vx = m.d * 330; me.vy = -230; me.ground = null; toast(`🪨 ¡Warak'a de ${name}!`); }
  }

  // ---------- Colocación y rotación ----------
  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function ghostFor(pos, id, rot) {
    const r = itemRect({ id, x: 0, y: 0, rot });
    return { id, x: Math.round(pos.x / T - r.w / 2), y: Math.round(pos.y / T - r.h / 2), rot };
  }
  function rotate(dirn) {
    const pick = myPick();
    if (!pick) return;
    const n = rotsOf(pick);
    if (n < 2) { toast(`${ITEMS[pick].name} no se puede girar.`); return; }
    myRot = mod(myRot + dirn, n);
    sfx.rotate();
    markKey('rotate');
    refreshKeys();
  }
  // ---------- Cámara ----------
  // z = zoom (1 = mapa completo). Al colocar: mapa completo con zoom opcional. En la carrera: sigue al jugador.
  const cam = { x: W / 2, y: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, userZ: 1 };
  const RUN_Z = 1.75, ZOOMS = [1, 1.5, 2, 2.5];
  let cursorScreen = null, pinch = null;
  const pointers = new Map();
  const screenToWorld = (p) => ({ x: cam.x + (p.x - W / 2) / cam.z, y: cam.y + (p.y - H / 2) / cam.z });
  function clampCam(o, z) { const hw = W / (2 * z), hh = H / (2 * z); o.x = clamp(o.x, hw, W - hw); o.y = clamp(o.y, hh, H - hh); }
  function setUserZoom(z, anchor) {
    z = clamp(z, 1, 2.5);
    if (anchor) { const wp = screenToWorld(anchor); cam.tx = wp.x - (anchor.x - W / 2) / z; cam.ty = wp.y - (anchor.y - H / 2) / z; }
    cam.userZ = z;
  }
  function stepZoom(dir, anchor) {
    const i = ZOOMS.reduce((b, z, k) => (Math.abs(z - cam.userZ) < Math.abs(ZOOMS[b] - cam.userZ) ? k : b), 0);
    setUserZoom(ZOOMS[clamp(i + dir, 0, ZOOMS.length - 1)], anchor || cursorScreen);
  }
  function updateCamera(dt) {
    const alive = me && !me.dead && !me.won;
    const following = PH === 'run' && alive && runTime() > -1.6;
    if (PH === 'place') {
      cam.tz = cam.userZ;
      if (cam.userZ <= 1.01) { cam.tx = W / 2; cam.ty = H / 2; }
      else if (cursorScreen) { // acercar el cursor al borde desplaza la vista
        const m = 0.1, sp = 480 / cam.z, ex = cursorScreen.x / W, ey = cursorScreen.y / H;
        if (ex < m) cam.tx -= sp * dt * (1 - ex / m);
        if (ex > 1 - m) cam.tx += sp * dt * (1 - (1 - ex) / m);
        if (ey < m) cam.ty -= sp * dt * (1 - ey / m);
        if (ey > 1 - m) cam.ty += sp * dt * (1 - (1 - ey) / m);
      }
    } else if (following) {
      cam.tz = RUN_Z;
      cam.tx = me.x + clamp(me.vx * 0.4, -60, 60);
      cam.ty = me.y - 28;
    } else { cam.tz = 1; cam.tx = W / 2; cam.ty = H / 2; } // al ganar, morir o mirar: mapa completo
    const tgt = { x: cam.tx, y: cam.ty }; clampCam(tgt, cam.tz); cam.tx = tgt.x; cam.ty = tgt.y;
    cam.z += (cam.tz - cam.z) * (1 - Math.exp(-dt * (following ? 3.5 : 2.6)));
    if (Math.abs(cam.z - cam.tz) < 0.002) cam.z = cam.tz;
    cam.x += (cam.tx - cam.x) * (1 - Math.exp(-dt * (following ? 7 : 4)));
    cam.y += (cam.ty - cam.y) * (1 - Math.exp(-dt * (following ? 4.5 : 4)));
    clampCam(cam, cam.z);
    if (cursorScreen && PH === 'place') cursor = screenToWorld(cursorScreen);
  }
  // En el celular el objeto aparece un poco más arriba del dedo para que se vea.
  const toScreen = (e) => { const p = canvasPos(e); return e.pointerType === 'touch' ? { x: p.x, y: p.y - 26 } : p; };
  cv.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, canvasPos(e));
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      setUserZoom((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    cursorScreen = toScreen(e);
  });
  cv.addEventListener('pointerdown', (e) => {
    AU.init();
    if (e.pointerType === 'touch') {
      pointers.set(e.pointerId, canvasPos(e));
      if (pointers.size === 2 && PH === 'place') { const [a, b] = [...pointers.values()]; pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z: cam.userZ }; return; }
    }
    if (PH !== 'place' || !myPick()) return;
    if (e.button === 2) { rotate(1); return; }
    cursorScreen = toScreen(e); cursor = screenToWorld(cursorScreen);
    if (e.pointerType === 'touch') return; // en el celular se coloca con el botón
    placeCurrent();
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; stepZoom(0); } // al soltar, se ajusta al zoom nítido más cercano
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  function placeCurrent() {
    if (PH !== 'place' || !myPick() || !cursor) return;
    const g = ghostFor(cursor, myPick(), myRot);
    if (validPlacement(mapNow(), placed, g)) { send({ t: 'place', x: g.x, y: g.y, r: g.rot }); markKey('place'); }
    else toast('No se puede poner ahí (zona prohibida u ocupada).');
  }
  cv.addEventListener('wheel', (e) => { if (PH !== 'place') return; e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1, canvasPos(e)); }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Controles táctiles ----------
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* sin vibración */ } };
  // Botones de saltar y poder: el dedo queda "capturado", así no se sueltan si se corre un poco.
  function bindTouch(id, key) {
    const el = $(id), ptrs = new Set();
    const sync = () => { const v = ptrs.size > 0; touch[key] = v; el.classList.toggle('on', v); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); AU.init();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      ptrs.add(e.pointerId);
      if (key === 'jump') touch.jumpHit = true;
      if (key === 'power') touch.powerHit = true;
      buzz(); sync();
    });
    const up = (e) => { ptrs.delete(e.pointerId); sync(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    touchResets.push(() => { ptrs.clear(); sync(); });
  }
  // Pad de dirección: la mitad donde esté el dedo decide izquierda o derecha, y se puede deslizar sin levantarlo.
  function bindPad() {
    const pad = $('t-pad'), halves = pad.querySelectorAll('.half'), ptrs = new Map();
    const sync = () => {
      const r = pad.getBoundingClientRect(), mid = r.left + r.width / 2;
      let l = false, rr = false;
      for (const x of ptrs.values()) { if (x < mid) l = true; else rr = true; }
      touch.left = l; touch.right = rr;
      halves[0].classList.toggle('on', l); halves[1].classList.toggle('on', rr);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault(); AU.init();
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      ptrs.set(e.pointerId, e.clientX); buzz(); sync();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const r = pad.getBoundingClientRect(), mid = r.left + r.width / 2, before = ptrs.get(e.pointerId) < mid;
      ptrs.set(e.pointerId, e.clientX);
      if ((e.clientX < mid) !== before) buzz();
      sync();
    });
    const up = (e) => { ptrs.delete(e.pointerId); sync(); };
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('lostpointercapture', up);
    touchResets.push(() => { ptrs.clear(); sync(); });
  }
  const touchResets = [];
  bindPad(); bindTouch('t-jump', 'jump'); bindTouch('t-power', 'power');
  $('touch').addEventListener('contextmenu', (e) => e.preventDefault());
  $('t-rot').addEventListener('click', () => rotate(1));
  $('t-place').addEventListener('click', () => { AU.init(); placeCurrent(); });

  // ---------- Pantallita flotante de controles ----------
  let keysForced = false, keysMode = '';
  const used = { move: false, jump: false, power: false, rotate: false, place: false };
  const helpDone = (() => { try { return JSON.parse(localStorage.getItem('bandera-ayuda') || '{}'); } catch (e) { return {}; } })();
  function saveHelp() { try { localStorage.setItem('bandera-ayuda', JSON.stringify(helpDone)); } catch (e) { /* ignorar */ } }
  const cap = (codes, label) => `<kbd data-code="${codes}">${label}</kbd>`;
  function markKey(group, code) {
    if (code) document.querySelectorAll(`#keys [data-code~="${code}"]`).forEach((k) => k.classList.add('down', 'used'));
    if (!group || used[group]) return;
    used[group] = true;
    document.querySelectorAll(`#keys [data-group="${group}"]`).forEach((g) => g.classList.add('done'));
    const mode = keysMode;
    if (mode === 'run' && used.move && used.jump && used.power) { helpDone.run = true; saveHelp(); setTimeout(refreshKeys, 1400); }
    if (mode === 'place' && used.place) { helpDone.place = true; saveHelp(); setTimeout(refreshKeys, 900); }
  }
  function refreshKeys() {
    const el = $('keys'), chip = $('keys-chip');
    let mode = '';
    if (PH === 'place' && myPick()) mode = 'place';
    if (PH === 'run' && me && !me.dead && !me.won) mode = 'run';
    chip.classList.toggle('hidden', !mode || TOUCH);
    if (TOUCH && mode === 'run') { el.classList.add('hidden'); keysMode = mode; return; }
    const show = mode && (keysForced || !helpDone[mode]);
    if (!show) { el.classList.add('hidden'); keysMode = mode; return; }
    if (mode !== keysMode) { for (const k in used) used[k] = false; }
    keysMode = mode;
    el.classList.remove('hidden');
    el.classList.toggle('tactil', TOUCH);
    const pick = myPick();
    if (mode === 'place') {
      const n = rotsOf(pick), names = ROT_NAMES[pick];
      el.innerHTML = TOUCH
        ? `<div class="kt"><span>Coloca: <b>${esc(ITEMS[pick].name)}</b></span></div><div class="krow">Arrastra el dedo para moverlo · pellizca para hacer zoom · botón ✓ Colocar${n > 1 ? ' · botón ↻ para girar' : ''}</div>`
        : `<div class="kt"><span>Coloca: <b>${esc(ITEMS[pick].name)}</b></span> <button class="kx" data-close>✕</button></div>
          <div class="krow" data-group="place"><kbd class="wide">🖱 Mouse</kbd> mover · <kbd class="wide">Clic</kbd> colocar</div>
          <div class="krow ${n > 1 ? '' : 'off'}" data-group="rotate">${cap('KeyR', 'R')} ${cap('KeyQ', 'Q')} <kbd class="wide">Clic der.</kbd> girar
            ${n > 1 ? `<span class="rot">↻ ${esc(names[myRot])} <small>(${myRot + 1}/${n})</small></span>` : '<span class="rot">no se gira</span>'}</div>
          <div class="krow" data-group="zoom"><kbd class="wide">Rueda</kbd> ${cap('Equal', '+')} ${cap('Minus', '−')} zoom <small>(borde de la pantalla = mover la vista)</small></div>
          <div class="kfoot">${cap('KeyH', 'H')} mostrar/ocultar ayuda</div>`;
      if (used.place) el.querySelector('[data-group="place"]')?.classList.add('done');
      if (used.rotate || n < 2) el.querySelector('[data-group="rotate"]')?.classList.add('done');
    } else {
      el.innerHTML = TOUCH
        ? '<div class="kt">Controles</div><div class="krow">◀ ▶ moverse · ▲ saltar (mantén = más alto) · ⚡ poder</div>'
        : `<div class="kt">¡Corre a la bandera! <button class="kx" data-close>✕</button></div>
          <div class="krow ${used.move ? 'done' : ''}" data-group="move">${cap('KeyA ArrowLeft', 'A')} ${cap('KeyD ArrowRight', 'D')} <span class="or">o</span> ${cap('ArrowLeft', '←')} ${cap('ArrowRight', '→')} moverse</div>
          <div class="krow ${used.jump ? 'done' : ''}" data-group="jump">${cap('Space', 'Espacio')} ${cap('KeyW ArrowUp', 'W')} saltar <small>(mantén = más alto · contra la pared = rebote)</small></div>
          <div class="krow ${used.power ? 'done' : ''}" data-group="power">${cap('KeyE', 'E')} ${cap('ShiftLeft ShiftRight', 'Shift')} poder: <b>${esc(charOf(me.char).power)}</b></div>
          <div class="kfoot">Con el cóndor: mantén saltar para volar · ${cap('KeyH', 'H')} ayuda</div>`;
    }
    const x = el.querySelector('[data-close]');
    if (x) x.onclick = () => { helpDone[mode] = true; keysForced = false; saveHelp(); refreshKeys(); };
  }
  $('keys-chip').addEventListener('click', () => { keysForced = !keysForced; refreshKeys(); });

  // ---------- Pantallas ----------
  const screen = $('screen');
  function hideScreen() { screen.classList.add('hidden'); screen.innerHTML = ''; }
  function show(html) { screen.innerHTML = html; screen.classList.remove('hidden'); }
  const charImg = (id) => ART.url(ART.char(id, 0), 2);
  function iconImg(id) { const c = ART.icon(id); return ART.url(c, Math.min(2, 80 / Math.max(c.width, c.height))); }
  const foodImg = (k) => ART.url(ART.foodArt(k), 2);
  const CAT = { bloque: ['Bloque', 'cat-b'], trampa: ['Trampa', 'cat-t'], especial: ['Especial', 'cat-e'] };
  function showHome(msg = '') {
    PH = 'home';
    const code = new URLSearchParams(location.search).get('sala') || '';
    let name = '';
    try { name = localStorage.getItem('bandera-name') || ''; } catch (e) { /* sin almacenamiento */ }
    show(`
      <div class="home">
        <div class="logo"><span class="l1">¡CHAPA LA</span><span class="l2">BANDERA!</span><span class="l3">PERÚ PARTY · HASTA 8 JUGADORES</span></div>
        <div class="flagrow">${CHARS.map((c) => `<img src="${charImg(c.id)}" alt="${esc(c.name)}" title="${esc(c.name)}">`).join('')}</div>
        <p class="tag">Pon trampas, esquiva las de tus patas y sé el primero en chapar la bandera del Perú.</p>
        ${msg ? `<p class="warn">${esc(msg)}</p>` : ''}
        <div class="panel form">
          <label>Tu nombre <input id="in-name" maxlength="14" value="${esc(name)}" placeholder="Ej: ElCausa" autocomplete="off"></label>
          ${code ? `<p class="hint">Te invitaron a la sala <b>${esc(code.toUpperCase())}</b></p>
            <button class="btn big" data-act="join-link">Entrar a la sala ${esc(code.toUpperCase())}</button>
            <button class="btn ghost" data-act="create">Mejor crear una sala nueva</button>` : `
            <button class="btn big" data-act="create">Crear sala</button>
            <div class="joinrow"><input id="in-code" maxlength="4" placeholder="CÓDIGO" autocomplete="off"><button class="btn ghost" data-act="join">Unirse</button></div>`}
          <button class="link" data-act="help">¿Cómo se juega?</button>
          ${TOUCH ? '<button class="link" data-act="full">⛶ Jugar en pantalla completa</button>' : ''}
        </div>
      </div>`);
  }
  function getName() {
    const v = ($('in-name') && $('in-name').value.trim()) || '';
    try { localStorage.setItem('bandera-name', v); } catch (e) { /* ignorar */ }
    return v;
  }
  function doJoin(code) {
    if (!connected) toast('Conectando con el servidor…');
    wantJoin = { name: getName(), code };
    send({ t: 'join', ...wantJoin });
  }
  function showHelp() {
    show(`
      <div class="panel help">
        <h2>¿Cómo se juega?</h2>
        <ol>
          <li><b>La caja:</b> cada ronda aparece una caja con objetos. Elige uno rápido, antes que te lo ganen.</li>
          <li><b>Colócalo</b> en el mapa. <b>R, Q o clic derecho</b> lo giran y <b>la rueda</b> (o pellizcar en el celular) hace zoom. Las líneas punteadas muestran cómo se mueve o hasta dónde dispara.</li>
          <li><b>¡Corre!</b> Todos van por la <b>bandera del Perú</b>. Las trampas se quedan para las siguientes rondas.</li>
          <li><b>Puntos:</b> llegar da 10, el primero +5 y el pollo a la brasa +5. Si <b>todos</b> llegan es "muy fácil" y nadie suma. Si nadie llega, tampoco.</li>
        </ol>
        <div class="keysline"><kbd>A</kbd><kbd>D</kbd> moverse · <kbd>Espacio</kbd> saltar · <kbd>E</kbd> poder · <kbd>H</kbd> ayuda en pantalla</div>
        <h3>Comidas</h3>
        <div class="legend">${Object.entries(FOODS).map(([k, f]) => `<div><img src="${foodImg(k)}" alt=""><span><b>${esc(f.name)}</b> · ${esc(f.desc)}</span></div>`).join('')}</div>
        <h3>Objetos de la caja</h3>
        <div class="legend">${Object.entries(ITEMS).map(([k, d]) => `<div class="${CAT[d.cat][1]}"><img src="${iconImg(k)}" alt=""><span><b>${esc(d.name)}</b> · ${esc(d.desc)}</span></div>`).join('')}</div>
        <button class="btn" data-act="${R ? 'lobby' : 'home'}">Volver</button>
      </div>`);
  }
  function showLobby() {
    if (!R) return;
    PH = 'lobby';
    const host = R.host === myId, link = `${location.origin}${location.pathname}?sala=${R.code}`;
    const mine = myP();
    show(`
      <div class="lobby">
        <div class="panel room">
          <div class="roomhead">
            <div><span class="kicker">Sala</span><div class="code">${esc(R.code)}</div></div>
            <button class="btn ghost small" data-act="copy" data-link="${esc(link)}">📋 Copiar link</button>
          </div>
          <p class="hint">Comparte el código o el link. ${R.players.length}/${RULES.maxPlayers} jugadores.</p>
          <ul class="players">${R.players.map((p) => `
            <li class="${p.id === myId ? 'me' : ''}" style="--pc:${colorOf(p.char)}"><img src="${charImg(p.char)}" alt=""><span>${esc(p.name)}${p.id === R.host ? ' 👑' : ''}</span><small>${esc(charOf(p.char).name)}</small></li>`).join('')}
            ${Array.from({ length: RULES.maxPlayers - R.players.length }, () => '<li class="empty"><span>Esperando…</span></li>').join('')}
          </ul>
          ${TOUCH ? '<button class="btn ghost small" data-act="full">⛶ Pantalla completa</button>' : ''}
          <button class="link" data-act="leave">Salir de la sala</button>
        </div>
        <div class="panel pickchar">
          <h3>Elige tu personaje</h3>
          <div class="chars">${CHARS.map((c) => {
            const by = R.players.find((p) => p.char === c.id);
            const taken = by && by.id !== myId;
            return `<button class="char ${mine && mine.char === c.id ? 'sel' : ''}" data-char="${c.id}" ${taken ? 'disabled' : ''} style="--pc:${c.color}">
              <img src="${charImg(c.id)}" alt=""><span class="cname">${esc(c.name)}</span>
              <span class="cpow">⚡ ${esc(c.power)}</span><span class="cdesc">${esc(c.pdesc)}</span>${taken ? `<span class="taken">${esc(by.name)}</span>` : ''}</button>`;
          }).join('')}</div>
        </div>
        <div class="panel maps">
          <h3>Mapa ${host ? '' : '<small>(elige el anfitrión)</small>'}</h3>
          <div class="maplist">${MAPS.map((m, i) => `
            <button class="map ${R.map === i ? 'sel' : ''}" data-map="${i}" ${host ? '' : 'disabled'}><img src="${SCENERY.thumb(i)}" alt=""><span class="mname">${esc(m.name)}</span><span class="mdesc">${esc(m.desc)}</span></button>`).join('')}</div>
          <div class="winrow"><span>Puntos para ganar:</span>${RULES.winOptions.map((w) => `<button class="chip ${R.win === w ? 'sel' : ''}" data-win="${w}" ${host ? '' : 'disabled'}>${w}</button>`).join('')}</div>
          ${host ? '<button class="btn big" data-act="start">▶ Empezar partida</button>' : '<p class="hint">Esperando que el anfitrión empiece…</p>'}
          ${host ? '<div class="startbar"><button class="btn" data-act="start">▶ Empezar partida</button></div>' : ''}
          <button class="link" data-act="help">¿Cómo se juega?</button>
        </div>
      </div>`);
  }
  function showPick() {
    show(`<div class="crate"><div class="crate-top"><h2>¡Abre la caja! <small>Ronda ${roundNow || (R ? R.round : '')}</small></h2><p class="hint">Elige un objeto antes que te lo ganen (teclas 1-${box.length}).</p>${bombaNow ? '<p class="bombanote">🧨 Nadie llegó la ronda pasada: quien agarre la <b>dinamita</b> puede borrar un objeto del mapa.</p>' : ''}</div>
      <div id="pickgrid" class="pickgrid"></div><div class="ptimer"><div id="pick-bar"></div></div></div>`);
    renderPick();
  }
  function renderPick() {
    const g = $('pickgrid');
    if (!g || PH !== 'pick') return;
    const mine = myP(), done = mine && mine.pick;
    g.innerHTML = box.map((s, i) => {
      const d = ITEMS[s.id], by = s.by ? pById(s.by) : null, [cn, cc] = CAT[d.cat];
      const moves = ['mover', 'moverDeadly', 'walker', 'patrol', 'shooter', 'dropper', 'blinker', 'wind'].includes(d.kind);
      return `<button class="item ${cc} ${by ? 'taken' : ''} ${by && s.by === myId ? 'mine' : ''}" data-pick="${i}" ${by || done ? 'disabled' : ''} ${by ? `style="--pc:${colorOf(by.char)}"` : ''}>
        <span class="num">${i + 1}</span><span class="catl">${cn}${moves ? ' · se mueve' : ''}${rotsOf(s.id) > 1 ? ' · gira' : ''}</span>
        <span class="iimg"><img src="${iconImg(s.id)}" alt=""></span><span class="iname">${esc(d.name)}</span><span class="idesc">${esc(d.desc)}</span>
        ${by ? `<span class="by"><img src="${charImg(by.char)}" alt=""> ${esc(by.name)}</span>` : ''}</button>`;
    }).join('');
  }
  function showScore(m) {
    lastScore = m;
    const reasons = { facil: '¡Muy fácil! Todos llegaron, nadie suma puntos. Pongan más trampas.', dificil: '¡Nadie llegó! Nadie suma puntos. Quizás exageraron con las trampas.', ok: '' };
    const max = Math.max(R ? R.win : 50, 1);
    const rows = (R ? R.players.slice() : []).sort((a, b) => b.score - a.score);
    show(`<div class="panel score"><h2>Resultados · Ronda ${R ? R.round : ''}</h2>
      ${reasons[m.reason] ? `<p class="warn">${reasons[m.reason]}</p>` : ''}
      <div class="bars">${rows.map((p) => {
        const res = (m.results || []).find((r) => r.id === p.id);
        return `<div class="bar" style="--pc:${colorOf(p.char)}"><img src="${charImg(p.char)}" alt=""><span class="bname">${esc(p.name)}</span>
          <div class="track"><div class="fill" style="width:${Math.min(100, ((p.score - (res ? res.gain : 0)) / max) * 100)}%"></div><div class="gain" style="width:${Math.min(100, ((res ? res.gain : 0) / max) * 100)}%"></div></div>
          <b>${p.score}</b>${res ? `<small>+${res.gain} ${esc(res.why)}</small>` : `<small>${p.done === 'dead' ? '💀' : ''}</small>`}</div>`;
      }).join('')}</div><p class="hint">Meta: ${max} puntos</p></div>`);
  }
  function showEnd(m) {
    const r = m.ranking || [];
    const podium = [r[1], r[0], r[2]].map((p, i) => (p ? `<div class="pod p${[2, 1, 3][i]}"><img src="${ART.url(ART.char(p.char, 0), 3)}" alt=""><span>${esc(p.name)}</span><b>${p.score}</b><div class="step">${[2, 1, 3][i]}°</div></div>` : '<div class="pod"></div>')).join('');
    show(`<div class="panel end"><h2>🇵🇪 ¡${r[0] ? esc(r[0].name) : '?'} gana la partida! 🇵🇪</h2><div class="podium">${podium}</div>
      <ol class="rest">${r.slice(3).map((p) => `<li>${esc(p.name)} · ${p.score}</li>`).join('')}</ol>
      ${R && R.host === myId ? '<button class="btn big" data-act="back">Volver a la sala</button>' : '<p class="hint">Volviendo a la sala…</p>'}</div>`);
    sfx.win();
  }

  screen.addEventListener('click', (e) => {
    AU.init();
    const a = e.target.closest('[data-act],[data-char],[data-map],[data-win],[data-pick]');
    if (!a || a.disabled) return;
    if (a.dataset.char) { send({ t: 'char', char: a.dataset.char }); return; }
    if (a.dataset.map) { send({ t: 'cfg', map: +a.dataset.map }); return; }
    if (a.dataset.win) { send({ t: 'cfg', win: +a.dataset.win }); return; }
    if (a.dataset.pick) { send({ t: 'pick', i: +a.dataset.pick }); sfx.pick(); return; }
    switch (a.dataset.act) {
      case 'create': doJoin(''); break;
      case 'join': { const c = ($('in-code').value || '').trim().toUpperCase(); if (c.length !== 4) { toast('El código tiene 4 letras.'); return; } doJoin(c); break; }
      case 'join-link': doJoin(new URLSearchParams(location.search).get('sala')); break;
      case 'help': showHelp(); break;
      case 'home': showHome(); break;
      case 'lobby': showLobby(); break;
      case 'leave': send({ t: 'leave' }); history.replaceState(null, '', location.pathname); break;
      case 'start': send({ t: 'start' }); break;
      case 'back': send({ t: 'back' }); break;
      case 'full': goFull(); break;
      case 'copy': {
        const link = a.dataset.link;
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('¡Link copiado!'), () => prompt('Copia este link:', link));
        break;
      }
      default:
    }
  });
  screen.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'in-code') screen.querySelector('[data-act="join"]').click(); });

  // ---------- HUD ----------
  const PH_NAMES = { pick: '📦 Elige de la caja', place: '🔨 Coloca tu objeto', run: '🏃 ¡Corre a la bandera!', score: '🏆 Resultados', end: '🎉 Fin de la partida' };
  function renderHud() {
    const inGame = R && ['pick', 'place', 'run', 'score', 'end'].includes(PH);
    $('hud').classList.toggle('hidden', !inGame);
    document.body.classList.toggle('ingame', !!inGame);
    $('t-rot').classList.toggle('hidden', !(TOUCH && PH === 'place' && myPick() && rotsOf(myPick()) > 1));
    if (!inGame) return;
    $('ph').textContent = PH_NAMES[PH] || '';
    $('round').textContent = `Ronda ${R.round} · meta ${R.win} · ${mapNow().name}`;
    $('board').innerHTML = R.players.slice().sort((a, b) => b.score - a.score).map((p) => `
      <span class="chip ${p.id === myId ? 'me' : ''} ${p.done === 'dead' ? 'dead' : ''} ${p.done === 'win' ? 'won' : ''}" style="--pc:${colorOf(p.char)}"><img src="${ART.url(ART.char(p.char, 0), 1)}" alt=""><span class="nm">${esc(p.name)}</span> <b>${p.score}</b></span>`).join('');
  }
  let lastPowerHtml = '', lastTimer = '';
  function renderPower() {
    const el = $('power');
    if (PH !== 'run' || !me) { setHidden('power', true); return; }
    const c = charOf(me.char), t = runTime(), left = Math.max(0, me.cd - t);
    if (TOUCH) {
      setHidden('power', true);
      const lbl = left > 0 ? String(Math.ceil(left)) : '⚡';
      if (lbl !== lastPowerHtml) { lastPowerHtml = lbl; const b = $('t-power'); b.textContent = lbl; b.classList.toggle('cd', left > 0); }
      return;
    }
    setHidden('power', false);
    const extra = [me.dbl && foodImg('picarones'), me.shield && foodImg('rocoto'), me.pollo && foodImg('pollo'), me.jet > 0 && ART.url(ART.icon('condor'), 1)].filter(Boolean);
    const html = `<b>⚡ ${esc(c.power)}</b> ${left > 0 ? `<span>${left.toFixed(1)} s</span>` : `<span class="ready">${TOUCH ? 'listo' : 'E / Shift'}</span>`}
      ${me.jet > 0 ? `<span class="jet"><i style="width:${Math.round((me.jet / 2.6) * 20) * 5}%"></i></span>` : ''}${extra.map((u) => `<img src="${u}" alt="">`).join('')}`;
    if (html !== lastPowerHtml) { lastPowerHtml = html; el.innerHTML = html; }
  }
  function toast(msg) {
    const el = $('toast');
    const d = document.createElement('div'); d.textContent = msg; el.appendChild(d);
    while (el.childElementCount > 4) el.firstElementChild.remove();
    setTimeout(() => d.remove(), 3200);
  }
  let bannerT = null;
  function banner(msg) { const b = $('banner'); b.textContent = msg; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 2600); }

  // ---------- Dibujo: líneas guía de trampas ----------
  const GUIDE = { trampa: '#ff5a4a', bloque: '#5ad1ff', especial: '#ffd23f' };
  function path(pts, col, alpha, dash = [3, 2.5]) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.strokeStyle = '#1b1426'; ctx.lineWidth = 2.6;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.restore();
  }
  function arrowHead(x, y, dx, dy, col, alpha, s = 4) {
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    ctx.save(); ctx.globalAlpha = alpha;
    for (const [c, k] of [['#1b1426', 1.5], [col, 1]]) {
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(x + dx * s * k, y + dy * s * k);
      ctx.lineTo(x - dy * s * 0.8 * k - dx * s * 0.6, y + dx * s * 0.8 * k - dy * s * 0.6);
      ctx.lineTo(x + dy * s * 0.8 * k - dx * s * 0.6, y - dx * s * 0.8 * k - dy * s * 0.6);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function chevrons(x0, y0, x1, y1, col, alpha, t, every = 14) {
    const len = Math.hypot(x1 - x0, y1 - y0); if (len < 4) return;
    const dx = (x1 - x0) / len, dy = (y1 - y0) / len, off = (t * 40) % every;
    for (let d = off; d < len; d += every) arrowHead(x0 + dx * d, y0 + dy * d, dx, dy, col, alpha * 0.9, 3);
  }
  function xMark(x, y, col, alpha) { path([[x - 3, y - 3], [x + 3, y + 3]], col, alpha, []); path([[x + 3, y - 3], [x - 3, y + 3]], col, alpha, []); }
  // Dibuja cómo se comporta un objeto: por dónde se mueve, hacia dónde dispara, etc.
  function guideFor(it, L, t, alpha) {
    const d = ITEMS[it.id], col = GUIDE[d.cat], r = pxRect(itemRect(it));
    if (d.kind === 'mover' || d.kind === 'moverDeadly') {
      const vertical = (d.kind === 'mover') === !it.rot, amp = (d.kind === 'mover' ? 2.5 : 3) * T, period = d.kind === 'mover' ? 4 : 3;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const a = vertical ? [cx, cy - amp] : [cx - amp, cy], b = vertical ? [cx, cy + amp] : [cx + amp, cy];
      path([a, b], col, alpha);
      arrowHead(a[0], a[1], a[0] - cx, a[1] - cy, col, alpha); arrowHead(b[0], b[1], b[0] - cx, b[1] - cy, col, alpha);
      ctx.save(); ctx.globalAlpha = alpha * 0.55; ctx.setLineDash([2, 2]); ctx.strokeStyle = col; ctx.lineWidth = 1;
      for (const s of [-1, 1]) ctx.strokeRect(r.x + (vertical ? 0 : s * amp) + 0.5, r.y + (vertical ? s * amp : 0) + 0.5, r.w - 1, r.h - 1);
      ctx.restore();
      if (PH !== 'run') { const off = Math.sin((t / period) * Math.PI * 2) * amp; ctx.globalAlpha = 0.45 * alpha; draw(ART.item(it.id, it.rot), r.x + (vertical ? 0 : off), r.y + (vertical ? off : 0)); ctx.globalAlpha = 1; }
    }
    if (d.kind === 'shooter') {
      const s = L.shooters.find((q) => q.it === it) || shooterPreview(it, L);
      if (!s) return;
      const x1 = s.x + s.dir * s.range;
      path([[s.x, s.y], [x1, s.y]], col, alpha, [2, 3]);
      chevrons(s.x, s.y, x1, s.y, col, alpha, t);
      xMark(x1, s.y, col, alpha);
    }
    if (d.kind === 'dropper') {
      const s = L.droppers.find((q) => q.it === it) || { x: r.x + 8, y: r.y + r.h, range: ray(L, r.x + 8, r.y + r.h + 1, 0, 1) };
      path([[s.x, s.y], [s.x, s.y + s.range]], col, alpha, [2, 3]);
      chevrons(s.x, s.y, s.x, s.y + s.range, col, alpha, t);
      xMark(s.x, s.y + s.range, col, alpha);
    }
    if (d.kind === 'walker') {
      const wk = L.walkers.find((q) => q.it === it) || preview(`w${it.x},${it.y},${it.rot}`, () => ({ it, ...simWalker(L, r, it.rot ? -1 : 1) }));
      const pts = [];
      for (let i = 0; i < wk.path.length; i += 3 * 8) pts.push([wk.path[i] + wk.w / 2, wk.path[i + 1] + wk.h - 2]);
      const n = wk.path.length; pts.push([wk.path[n - 3] + wk.w / 2, wk.path[n - 2] + wk.h - 2]);
      path(pts, col, alpha);
      for (let i = 4; i < pts.length - 1; i += 6) arrowHead(pts[i][0], pts[i][1], pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], col, alpha, 3.5);
      const last = pts[pts.length - 1];
      if (wk.exited) arrowHead(last[0], Math.min(last[1], H - 6), 0, 1, col, alpha, 6);
      if (PH !== 'run') { const p = walkerAt(wk, t); if (p) { ctx.globalAlpha = 0.5 * alpha; draw(ART.item('nectar', p.dir < 0 ? 1 : 0), p.x, p.y); ctx.globalAlpha = 1; } }
    }
    if (d.kind === 'patrol') {
      const pt = L.patrols.find((q) => q.it === it) || preview(`p${it.x},${it.y},${it.rot}`, () => ({ it, ...simPatrol(L, r, it.rot ? -1 : 1) }));
      if (pt.dead) { path([[r.x + 8, r.y + 16], [r.x + 8, H]], col, alpha); return; }
      const y = pt.y + 15;
      if (pt.fall.length) path([[pt.x0 + 8, r.y + 16], [pt.x0 + 8, y]], col, alpha, [2, 3]);
      path([[pt.minX + 2, y], [pt.maxX + 14, y]], col, alpha);
      arrowHead(pt.minX + 2, y, -1, 0, col, alpha); arrowHead(pt.maxX + 14, y, 1, 0, col, alpha);
    }
    if (d.kind === 'wind') {
      const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]][it.rot];
      ctx.save(); ctx.globalAlpha = alpha; ctx.setLineDash([3, 2]); ctx.strokeStyle = '#1b1426'; ctx.lineWidth = 2.5; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 1.2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.restore();
      for (let k = 0; k < 3; k++) {
        const o = ((t * 30 + k * 16) % 48) - 24, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const px = cx + dirs[0] * o + dirs[1] * (k - 1) * 13, py = cy + dirs[1] * o + dirs[0] * (k - 1) * 13;
        path([[px - dirs[0] * 6, py - dirs[1] * 6], [px + dirs[0] * 6, py + dirs[1] * 6]], '#bfefff', alpha, []);
        arrowHead(px + dirs[0] * 7, py + dirs[1] * 7, dirs[0], dirs[1], '#bfefff', alpha, 3.5);
      }
    }
    if (d.kind === 'jetpack') { path([[r.x + 8, r.y - 2], [r.x + 8, r.y - 3 * T]], col, alpha * 0.8, [2, 3]); arrowHead(r.x + 8, r.y - 3 * T, 0, -1, col, alpha); }
    if (d.kind === 'blinker' && PH !== 'run') { const b = L.blinkers.find((q) => q.it === it); if (b && blinkWarn(b, t)) { ctx.globalAlpha = alpha; ctx.fillStyle = '#fff36a'; ctx.fillRect(r.x + r.w / 2 - 1, r.y - 7, 2, 4); ctx.globalAlpha = 1; } }
  }
  // Caché de trayectorias del objeto que se está colocando (se vacía cuando cambia el mapa).
  let previewCache = new Map(), previewLevel = null;
  function preview(key, fn) {
    if (previewLevel !== level) { previewCache = new Map(); previewLevel = level; }
    if (!previewCache.has(key)) { if (previewCache.size > 200) previewCache.clear(); previewCache.set(key, fn()); }
    return previewCache.get(key);
  }
  function shooterPreview(it, L) {
    const c = SHOOTERS[it.id], r = pxRect(itemRect(it)), dir = it.rot ? -1 : 1, ox = dir > 0 ? r.x + r.w : r.x, oy = r.y + c.oy;
    return { ...c, x: ox, y: oy, dir, range: ray(L, ox + dir, oy, dir, 0) };
  }

  // ---------- Dibujo: objetos, jugadores, efectos ----------
  function drawItem(it, t, alpha = 1) {
    const d = ITEMS[it.id], r = pxRect(itemRect(it));
    ctx.globalAlpha = alpha;
    if (d.kind === 'wind') {
      // zona suave + polvo arrastrado (se ve también en la carrera; las flechas son solo guía)
      const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]][it.rot];
      ctx.save(); ctx.globalAlpha = 0.22 * alpha; ctx.fillStyle = '#8fe3ff'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
      for (let k = 0; k < 12; k++) {
        const u = mod(t * 55 + k * 23, 48) - 24, v = ((k * 37) % 44) - 22, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        ctx.fillStyle = k % 3 ? 'rgba(255,255,255,.85)' : 'rgba(230,200,150,.9)';
        ctx.fillRect(snap(cx + dirs[0] * u + dirs[1] * v), snap(cy + dirs[1] * u + dirs[0] * v), k % 4 ? 1.5 : 3, 1.5);
      }
    } else if (d.kind === 'mover' || d.kind === 'moverDeadly') {
      const mv = level && level.movers.find((m) => m.it === it);
      const rr = PH === 'run' && mv ? mv.rect : r;
      draw(ART.item(it.id, it.rot), rr.x, rr.y);
    } else if (d.kind === 'walker') {
      const wk = level && level.walkers.find((q) => q.it === it);
      if (PH === 'run' && wk) { const p = walkerAt(wk, t); if (p) draw(ART.item('nectar', p.dir < 0 ? 1 : 0), p.x, p.y + Math.round(Math.sin(t * 20)) * 0.5); }
      else draw(ART.item('nectar', it.rot), r.x, r.y);
    } else if (d.kind === 'patrol') {
      const pt = level && level.patrols.find((q) => q.it === it);
      if (PH === 'run' && pt) { const p = patrolAt(pt, t); if (p) draw(ART.item('perro', p.dir < 0 ? 1 : 0, Math.floor(t * 8) % 2), p.x, p.y); }
      else draw(ART.item('perro', it.rot, Math.floor(t * 3) % 2), r.x, r.y);
    } else if (d.kind === 'shooter') {
      const s = level && level.shooters.find((q) => q.it === it);
      let frame = 0;
      if (s) {
        const ph = mod(t - s.off, s.every);
        frame = it.id === 'llama' ? (ph > s.every - 0.35 || ph < 0.08 ? 1 : 0) : ph < 0.1 || (s.burst > 1 && ph > s.gap && ph < s.gap + 0.1) ? 1 : 0;
        if (it.id === 'sicario' && frame) { glow(s.x + s.dir * 3, s.y, 10, 'rgba(255,220,110,0.8)'); ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(s.x + s.dir * 2, s.y, 3, 0, Math.PI * 2); ctx.fill(); }
      }
      draw(ART.item(it.id, it.rot, frame), r.x, r.y);
    } else if (d.kind === 'bomb') {
      draw(ART.item('dinamita'), r.x - 2, r.y - 6, 20, 20);
    } else if (d.kind === 'jetpack') {
      draw(ART.item('condor', 0, Math.floor(t * 2) % 2), r.x, r.y);
    } else {
      draw(ART.item(it.id, it.rot), r.x, r.y);
    }
    if (it.id === 'parrilla') {
      glow(r.x + 8, r.y + 9, 13 + Math.sin(t * 13) * 1.5, 'rgba(255,130,40,0.5)');
      for (let i = 0; i < 5; i++) {
        const fl = (t * 10 + i * 1.7) % 4;
        ctx.fillStyle = i % 2 ? '#ff8a2a' : '#ffd23f';
        ctx.fillRect(snap(r.x + 2.5 + i * 2.4), snap(r.y + 8 - fl), 1.5, 1.5 + fl * 0.7);
      }
    }
    if (it.id === 'cable' && level) {
      const b = level.blinkers.find((q) => q.it === it);
      if (b && (blinkOn(b, t) || (blinkWarn(b, t) && Math.floor(t * 16) % 2))) {
        const on = blinkOn(b, t);
        ctx.save(); ctx.globalAlpha = on ? 1 : 0.6;
        if (on) { ctx.fillStyle = 'rgba(120,220,255,0.35)'; ctx.fillRect(b.hit.x - 1, b.hit.y - 1, b.hit.w + 2, b.hit.h + 2); glow(b.hit.x + b.hit.w / 2, b.hit.y + b.hit.h / 2, Math.max(b.hit.w, b.hit.h) * 0.7, 'rgba(110,210,255,0.55)'); }
        for (let i = 0; i < 8; i++) {
          const k = (i * 7919 + Math.floor(t * 20) * 31) % 100 / 100;
          const px = b.vert ? b.hit.x + b.hit.w / 2 + (k - 0.5) * 8 : b.hit.x + k * b.hit.w, py = b.vert ? b.hit.y + k * b.hit.h : b.hit.y + b.hit.h / 2 + (k - 0.5) * 8;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#7fdcff'; ctx.fillRect(snap(px), snap(py), 1.5, 1.5);
        }
        ctx.restore();
      }
    }
    if (it.id === 'huaico' && level) {
      const dr = level.droppers.find((q) => q.it === it);
      if (dr && mod(t - DROP.off, DROP.every) > DROP.every - 0.4) { ctx.fillStyle = '#8a5a33'; ctx.fillRect(snap(dr.x - 1 + Math.sin(t * 40)), dr.y + 1, 2, 2); }
    }
    ctx.globalAlpha = 1;
  }
  function drawPlayer(x, y, char, face, anim, fl, t, name, isMe, sqT = 0, stT = 0) {
    if (fl & 1) return;
    const frame = anim === 1 ? 1 + (Math.floor(t * 10) % 2) : anim === 2 ? 3 : 0;
    let im = ART.char(char, frame, face < 0);
    if (fl & 4 && Math.floor(t * 12) % 2) im = ART.tinted(im, '#f6c90e', `${char}${frame}${face}`);
    const CS = 1.3, px = x - 6 * CS, py = y - 15 * CS, col = colorOf(char);
    ctx.fillStyle = 'rgba(10,5,25,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 7.5, 1.9, 0, 0, Math.PI * 2); ctx.fill();
    if (fl & 256) draw(ART.char('condor', 3), x - 6, py - 13);
    const sx = 1 + 0.28 * (sqT / 0.12) - 0.16 * (stT / 0.12), sy = 1 - 0.22 * (sqT / 0.12) + 0.2 * (stT / 0.12);
    ctx.drawImage(im, snap(x - 6 * sx * CS), snap(y - 15 * sy * CS), 12 * sx * CS, 16 * sy * CS);
    if (fl & 8) { ctx.fillStyle = '#1b1426'; ctx.fillRect(snap(px - 5), snap(py + 7), 5, 2); ctx.fillRect(snap(px + 12), snap(py + 7), 5, 2); }
    if (fl & 16) { const a = t * 6; for (let i = 0; i < 3; i++) draw(ART.fx('estrella'), x + Math.cos(a + i * 2.1) * 8 - 3, py - 4 + Math.sin(a + i * 2.1) * 2); }
    if (fl & 32) { ctx.fillStyle = '#f6c90e'; ctx.font = '6px "Press Start 2P", monospace'; ctx.fillText('?', px + 3, py - 2); }
    if (fl & 64) { ctx.strokeStyle = 'rgba(255,90,90,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 10, 14, 0, Math.PI * 2); ctx.stroke(); }
    if (fl & 128) draw(ART.foodArt('pollo'), px + 1, py - 10);
    if (fl & 2) draw(ART.flag(Math.floor(t * 6)), px - 1, py - 11);
    if (name) {
      ctx.font = '5px "Press Start 2P", monospace';
      const w = ctx.measureText(name).width, ty = py - 9 - (fl & 128 ? 9 : 0) - (fl & 256 ? 12 : 0);
      ctx.fillStyle = '#1b1426'; ctx.fillRect(snap(x - w / 2 - 2.5), snap(ty - 5.5), Math.ceil(w) + 5, 8);
      ctx.fillStyle = col; ctx.fillRect(snap(x - w / 2 - 2), snap(ty - 5), Math.ceil(w) + 4, 7);
      ctx.fillStyle = col === '#f4f4f4' || col === '#ffd23f' ? '#1b1426' : '#ffffff'; ctx.fillText(name, snap(x - w / 2), snap(ty));
      if (isMe) { const b = Math.sin(t * 6) * 1.5 - 9; arrowHead(x, ty + b + 1, 0, 1, col, 1, 3.5); }
    }
  }
  function render() {
    const mi = mapIdx(), map = MAPS[mi], t = animTime();
    const z = cam.z;
    ctx.setTransform(S * z, 0, 0, S * z, Math.round(S * (W / 2 - cam.x * z)), Math.round(S * (H / 2 - cam.y * z)));
    ctx.imageSmoothingEnabled = false;
    const bgs = SCENERY.build(mi);
    // paralaje: el fondo lejano se mueve más lento que las plataformas
    const pox = (cam.x - W / 2) * 0.3, poy = (cam.y - H / 2) * 0.3;
    ctx.drawImage(bgs.back, pox, poy, W, H);
    ctx.save(); ctx.translate(pox, poy); SCENERY.ambient(ctx, map.id, performance.now() / 1000); ctx.restore();
    ctx.drawImage(bgs.terrain, 0, 0, W, H);
    for (const w of map.water) {
      const deep = map.id === 'paititi' ? ['#3f6b4a', '#5f9a6a', '#8fcf9a'] : ['#2f6fa8', '#4f8fc8', '#bfe4ff'];
      ctx.fillStyle = deep[0]; ctx.fillRect(w.x * T, w.y * T + 6, w.w * T, w.h * T);
      ctx.fillStyle = deep[1]; ctx.fillRect(w.x * T, w.y * T + 6, w.w * T, 2);
      ctx.fillStyle = deep[2];
      for (let i = 0; i < w.w * T; i += 10) ctx.fillRect(snap(w.x * T + i + Math.sin(t * 2 + i) * 2 + 2), w.y * T + 6, 4, 1);
    }
    if (PH === 'place') {
      ctx.fillStyle = 'rgba(255,60,60,.16)';
      for (const z of protectedZones(map)) { ctx.fillRect(z.x * T, z.y * T, z.w * T, z.h * T); }
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i <= COLS; i++) ctx.fillRect(i * T, 0, 0.5, H);
      for (let j = 0; j <= ROWS; j++) ctx.fillRect(0, j * T, W, 0.5);
    }
    // guías de movimiento y dirección: solo mientras se colocan objetos
    if (level && PH === 'place') for (const it of placed) guideFor(it, level, t, 1);
    for (const it of placed) drawItem(it, t);
    if (PH === 'run') for (const p of projectiles(t)) {
      glow(p.x, p.y, p.k === 'bala' ? 6 : p.k === 'roca' ? 0.1 : 7, p.k === 'bala' ? 'rgba(255,210,90,0.7)' : 'rgba(190,255,90,0.55)');
      if (p.k === 'escupitajo') { ctx.fillStyle = 'rgba(185,242,90,.45)'; ctx.fillRect(snap(p.x - p.dir * 7), snap(p.y - 1), 5, 2); ctx.fillRect(snap(p.x - p.dir * 11), snap(p.y - 0.5), 3, 1); }
      if (p.k === 'bala') { ctx.fillStyle = 'rgba(255,220,120,.7)'; ctx.fillRect(snap(p.x - p.dir * 12), snap(p.y - 0.5), 10, 1); }
      const im = ART.fx(p.k), f = p.dir < 0 && p.k === 'bala';
      if (f) { ctx.save(); ctx.translate(snap(p.x), 0); ctx.scale(-1, 1); draw(im, -im.width / 4, p.y - im.height / 4); ctx.restore(); }
      else draw(im, p.x - im.width / 4, p.y - im.height / 4);
    }
    for (const tp of temps) {
      if (tp.until <= t) continue;
      ctx.fillStyle = '#1b1426'; ctx.fillRect(snap(tp.x - 0.5), snap(tp.y - 0.5), tp.w + 1, tp.h + 1);
      ctx.fillStyle = '#b8845a'; ctx.fillRect(snap(tp.x), snap(tp.y), tp.w, tp.h); ctx.fillStyle = '#d9a878'; ctx.fillRect(snap(tp.x), snap(tp.y), tp.w, 1.5);
      ctx.fillStyle = '#f28c28'; ctx.fillRect(snap(tp.x), snap(tp.y) - 5, 3, 5); ctx.fillRect(snap(tp.x + tp.w - 3), snap(tp.y) - 5, 3, 5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(tp.x), snap(tp.y) - 3, 3, 1); ctx.fillRect(snap(tp.x + tp.w - 3), snap(tp.y) - 3, 3, 1);
    }
    if (PH === 'run') for (const f of foods) if (!f.by) glow(f.x * T + 8, f.y * T + 8, 9 + Math.sin(t * 4 + f.i) * 2, 'rgba(255,245,200,0.45)');
    if (PH === 'run') for (const f of foods) if (!f.by) draw(ART.foodArt(f.k), f.x * T + 2.5, f.y * T + 2.5 + Math.sin(t * 3 + f.i) * 1.5);
    // bandera
    const fx0 = map.flag[0] * T + 7, fy0 = map.flag[1] * T;
    ctx.fillStyle = '#1b1426'; ctx.fillRect(fx0 - 0.5, fy0 - 46, 3, 46);
    ctx.fillStyle = '#e8e2d4'; ctx.fillRect(fx0, fy0 - 45, 2, 45); ctx.fillStyle = '#e0b24a'; ctx.fillRect(fx0 - 1, fy0 - 48, 4, 3);
    glow(fx0 + 8, fy0 - 38, 20 + Math.sin(t * 2) * 2, 'rgba(255,215,120,0.35)');
    draw(ART.flag(Math.floor(t * 5)), fx0 + 1.5, fy0 - 45);
    ctx.fillStyle = '#6b5a45'; ctx.fillRect(fx0 - 3, fy0 - 2, 8, 2);
    // colocación: fantasmas y cursores
    if (PH === 'place') {
      for (const [id, cx, cy, rot] of cursors) {
        const p = pById(id); if (!p || !p.pick) continue;
        const g = { id: p.pick, x: cx, y: cy, rot }, r = pxRect(itemRect(g)), col = colorOf(p.char);
        drawItem(g, t, 0.45);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); ctx.setLineDash([]);
        draw(ART.tinted(ART.fx('mano'), col, 'mano'), r.x + r.w / 2 - 2, r.y + r.h / 2 - 2);
        ctx.font = '5px "Press Start 2P", monospace'; ctx.fillStyle = '#1b1426'; ctx.fillRect(r.x, r.y - 8, ctx.measureText(p.name).width + 4, 7);
        ctx.fillStyle = col; ctx.fillText(p.name, r.x + 2, r.y - 3);
      }
      const pick = myPick();
      if (pick && cursor) {
        const g = ghostFor(cursor, pick, myRot), ok = validPlacement(map, placed, g), r = pxRect(itemRect(g));
        if (ITEMS[pick].kind === 'bomb') {
          const target = placed.find((o) => overlap(itemRect(g), itemRect(o)));
          if (target) {
            const tr = pxRect(itemRect(target)), pulse = 0.35 + Math.sin(t * 10) * 0.15;
            ctx.fillStyle = `rgba(255,50,30,${pulse.toFixed(2)})`; ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
            ctx.strokeStyle = '#1b1426'; ctx.lineWidth = 2.5; ctx.strokeRect(tr.x - 1, tr.y - 1, tr.w + 2, tr.h + 2);
            ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 1.2; ctx.strokeRect(tr.x - 1, tr.y - 1, tr.w + 2, tr.h + 2);
            xMark(tr.x + tr.w / 2, tr.y + tr.h / 2, '#ffffff', 1);
          }
          draw(ART.item('dinamita'), r.x - 2, r.y - 6, 20, 20);
        }
        else { if (ok && level) guideFor(g, level, t, 1); drawItem(g, t, 0.85); }
        ctx.strokeStyle = '#1b1426'; ctx.lineWidth = 2.5; ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
        ctx.strokeStyle = ok ? '#5ee06a' : '#ff4a4a'; ctx.lineWidth = 1.2; ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
        if (rotsOf(pick) > 1) {
          ctx.font = '5px "Press Start 2P", monospace';
          const lbl = `↻ ${ROT_NAMES[pick][myRot]}`, w = ctx.measureText(lbl).width;
          ctx.fillStyle = '#1b1426'; ctx.fillRect(snap(r.x + r.w / 2 - w / 2 - 3), snap(r.y + r.h + 3), w + 6, 8);
          ctx.fillStyle = '#ffd23f'; ctx.fillText(lbl, snap(r.x + r.w / 2 - w / 2), snap(r.y + r.h + 9));
        }
        const tn = performance.now();
        if (tn - curSent > 100) { curSent = tn; send({ t: 'cur', x: g.x, y: g.y, r: g.rot }); }
      }
    }
    // jugadores
    if (PH === 'run' || PH === 'score') {
      for (const [id, o] of others) { const p = pById(id); if (p) drawPlayer(o.x, o.y, p.char, o.f, o.a, o.fl, t, p.name, false, o.sqT, o.stT); }
      if (me) drawPlayer(me.x, me.y, me.char, me.face, me.anim, flags(), t, myP() ? myP().name : '', true, me.sqT, me.stT);
    }
    drawParts();
    // efectos
    for (const f of fx) {
      const k = 1 - f.t / f.d;
      if (f.k === 'poof') { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.fillRect(snap(f.x + Math.cos(a) * 11 * k), snap(f.y + Math.sin(a) * 11 * k), 2 - k, 2 - k); } }
      if (f.k === 'hearts') for (let i = 0; i < 4; i++) draw(ART.fx('corazon'), f.x - 12 + i * 7, f.y - 6 - k * 18 - (i % 2) * 5);
      if (f.k === 'stone') draw(ART.fx('piedra'), f.x + (f.x2 - f.x) * k, f.y + (f.y2 - f.y) * k - Math.sin(k * Math.PI) * 14);
      if (f.k === 'ring') { ctx.strokeStyle = `rgba(246,201,14,${(1 - k).toFixed(2)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y, 120 * k, 0, Math.PI * 2); ctx.stroke(); }
      if (f.k === 'boom') { ctx.fillStyle = `rgba(255,150,40,${(1 - k).toFixed(2)})`; ctx.fillRect(f.x - 24 - k * 10, f.y - 24 - k * 10, 48 + k * 20, 48 + k * 20); ctx.fillStyle = `rgba(255,240,160,${(1 - k).toFixed(2)})`; ctx.fillRect(f.x - 12, f.y - 12, 24, 24); }
      if (f.k === 'confeti') { const cols = ['#d62828', '#ffffff', '#f6c90e', '#43a047']; for (let i = 0; i < 28; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(snap(f.x + Math.cos(i * 1.7) * 44 * k), snap(f.y - 20 * k + Math.sin(i * 2.3) * 30 * k + k * k * 40), 2, 2); } }
      if (f.k === 'condorSale') draw(ART.char('condor', 3), f.x - 6 + k * 40, f.y - 6 - k * 60);
    }
    ctx.setTransform(S, 0, 0, S, 0, 0); // lo que sigue va fijo en pantalla
    ctx.drawImage(SCENERY.grade(map.id), 0, 0, W, H);
    if (PH === 'run') {
      const cd = -runTime();
      if (cd > 0) {
        const n = Math.ceil(cd);
        if (n !== countdownShown) { countdownShown = n; sfx.tick(); }
        bigText(String(n), '#f6c90e');
      } else if (cd > -0.8) { if (countdownShown !== 0) { countdownShown = 0; sfx.go(); } bigText('¡YA!', '#5ee06a'); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function bigText(s, col) {
    ctx.font = '32px "Press Start 2P", monospace';
    const w = ctx.measureText(s).width;
    ctx.fillStyle = '#1b1426'; ctx.fillText(s, (W - w) / 2 + 3, H / 2 + 3);
    ctx.fillStyle = col; ctx.fillText(s, (W - w) / 2, H / 2);
  }

  // ---------- Bucle ----------
  let last = performance.now(), acc = 0;
  function frame() {
    const tnow = performance.now();
    const dt = Math.min(0.1, (tnow - last) / 1000);
    last = tnow;
    const left = Math.max(0, (phaseEnd - tnow) / 1000);
    if (['pick', 'place', 'run', 'score'].includes(PH)) {
      const tt = PH === 'run' ? String(Math.ceil(Math.min(left, RULES.runTime))) : String(Math.ceil(left));
      if (tt !== lastTimer) { lastTimer = tt; $('timer').textContent = tt; $('timer').classList.toggle('late', left < 5); }
      const bar = $('pick-bar'); if (bar) bar.style.width = `${(left / RULES.pickTime) * 100}%`;
      if (PH !== 'run' && left < 4 && Math.ceil(left) !== lastTick) { lastTick = Math.ceil(left); sfx.tick(); }
    }
    if (PH === 'run' && level) {
      // Física con pasos variables (máx. 1/120 s): cada cuadro avanza exactamente el tiempo real,
      // así se ve fluido en monitores de 60, 120 o 144 Hz y ninguna tecla se pierde.
      const tEnd = runTime();
      let rem = dt;
      while (rem > 1e-6) {
        const h = Math.min(rem, 1 / 120), t = tEnd - rem + h;
        if (me && t >= 0) stepMe(h, t);
        else for (const mv of level.movers) mv.rect = moverRect(mv, Math.max(0, t));
        rem -= h;
      }
      if (tEnd >= 0) for (const k in pressed) delete pressed[k];
      interpolateOthers(dt);
      if (me) { me.sendAcc += dt; if (me.sendAcc > 0.05) { me.sendAcc = 0; if (!me.dead) send({ t: 'st', x: me.x, y: me.y, f: me.face, a: me.anim, fl: flags() }); } }
      temps = temps.filter((tp) => tp.until > runTime());
    } else for (const k in pressed) delete pressed[k];
    for (const f of fx) f.t -= dt;
    fx = fx.filter((f) => f.t > 0);
    stepParts(dt);
    if (me) { me.sqT = Math.max(0, (me.sqT || 0) - dt); me.stT = Math.max(0, (me.stT || 0) - dt); }
    if (PH !== 'home' && PH !== 'lobby') { updateCamera(dt); render(); }
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(SCENERY.flatten(Math.floor(tnow / 6000) % MAPS.length), 0, 0); }
    renderPower();
    setHidden('touch', !(TOUCH && PH === 'run' && me && !me.dead && !me.won));
    setHidden('t-place', !(TOUCH && PH === 'place' && myPick()));
    requestAnimationFrame(frame);
  }
  const hiddenState = {};
  function setHidden(id, v) {
    if (hiddenState[id] === v) return;
    hiddenState[id] = v; $(id).classList.toggle('hidden', v);
    if (id === 'touch' && v) for (const f of touchResets) f(); // al ocultarse, ningún botón queda "pegado"
  }

  // Otros jugadores: se dibujan ~110 ms en el pasado interpolando entre dos estados recibidos (sin saltos).
  function interpolateOthers(dt) {
    const rt = performance.now() - 110;
    for (const o of others.values()) {
      const b = o.buf; if (!b || !b.length) continue;
      let nx = b[b.length - 1][1], ny = b[b.length - 1][2];
      if (rt <= b[0][0]) { nx = b[0][1]; ny = b[0][2]; }
      else for (let k = 0; k < b.length - 1; k++) {
        if (b[k + 1][0] >= rt) { const u = (rt - b[k][0]) / Math.max(1, b[k + 1][0] - b[k][0]); nx = b[k][1] + (b[k + 1][1] - b[k][1]) * u; ny = b[k][2] + (b[k + 1][2] - b[k][2]) * u; break; }
      }
      o.x = nx; o.y = ny;
      // polvo y "squash & stretch" también para los demás
      if (o.pa === 2 && o.a !== 2) { o.sqT = 0.12; dust(o.x, o.y, 6); }
      if (o.pa !== 2 && o.a === 2) { o.stT = 0.12; dust(o.x, o.y, 3); }
      if (o.a === 1 && !(o.fl & 3)) { o.dAcc = (o.dAcc || 0) + dt; if (o.dAcc > 0.1) { o.dAcc = 0; dust(o.x - o.f * 4, o.y, 1); } }
      o.pa = o.a;
      o.sqT = Math.max(0, (o.sqT || 0) - dt); o.stT = Math.max(0, (o.stT || 0) - dt);
    }
  }

  // ---------- Partículas ----------
  let parts = [];
  const DUST = { plaza: '#e3d8c6', hatun: '#d6c2a4', lima: '#c8c8c8', machupicchu: '#d6e2b4', nazca: '#f3d6a6', paititi: '#c4e39a' };
  function puff(x, y, n, col, spd = 30, up = 20, life = 0.35, size = 1.5, grav = 60) {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * spd, vy: -Math.random() * up, life: life * (0.7 + Math.random() * 0.6), max: life, col, size, grav });
    if (parts.length > 500) parts.splice(0, parts.length - 500);
  }
  const dust = (x, y, n) => puff(x, y - 1, n, DUST[mapNow().id] || '#ffffff', 34, 14, 0.35, 1.5, 30);
  function stepParts(dt) {
    for (const p of parts) { p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
  }
  function drawParts() {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.col; ctx.fillRect(snap(p.x), snap(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  // Brillo aditivo (luz) centrado en x,y con radio r.
  function glow(x, y, r, color) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(ART.glow(color), x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  window.__B = { get PH() { return PH; }, get R() { return R; }, get me() { return me; }, get placed() { return placed; }, get level() { return level; }, get others() { return others; }, send, runTime, validPlacement, mapNow, get box() { return box; }, get myRot() { return myRot; }, rotate, get cam() { return cam; }, get touch() { return touch; } };
  // Solo para pruebas (?debug): pone objetos en el mapa local sin pasar por la caja.
  if (new URLSearchParams(location.search).has('debug')) window.__B.setPlaced = (items) => { placed = items; buildLevel(); };
  showHome();
  connect();
  requestAnimationFrame(frame);
})();
