// Servidor de ¡Chapa la Bandera!: sirve los archivos del juego y maneja las salas por WebSocket.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const SH = require('../public/shared.js');

const PORT = +process.env.PORT || 3100;
const PUB = path.resolve(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const { RULES, MAPS, CHARS, ITEMS, ITEM_POOL, T, COLS, ROWS } = SH;
const W = COLS * T, H = ROWS * T;

// ---------- Archivos estáticos ----------
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  if (p === '/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, salas: rooms.size, jugadores: wss.clients.size }));
    return;
  }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.resolve(PUB, `.${p}`);
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
});

// ---------- Utilidades ----------
const rooms = new Map();
let nextId = 1;
const clean = (s) => String(s == null ? '' : s).replace(/[<>&"'`\\\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
const num = (v, a, b) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function send(p, msg) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
function broadcast(r, msg) { const s = JSON.stringify(msg); for (const p of r.players) if (p.ws.readyState === 1) p.ws.send(s); }
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function weighted() {
  const total = ITEM_POOL.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of ITEM_POOL) { if ((r -= w) < 0) return id; }
  return 'adobe';
}

// ---------- Salas ----------
function createRoom() {
  const r = { code: newCode(), players: [], host: 0, phase: 'lobby', map: 0, win: RULES.defaultWin, placed: [], box: [], foods: [], order: [], round: 0, timer: null, adv: null, phaseEnd: 0, extra: {} };
  rooms.set(r.code, r);
  return r;
}
function roomInfo(r) {
  return {
    t: 'room', code: r.code, host: r.host, phase: r.phase, map: r.map, win: r.win, round: r.round,
    players: r.players.map((p) => ({ id: p.id, name: p.name, char: p.char, score: p.score, active: p.active, done: p.done, pick: p.pick, placed: p.placed })),
  };
}
const sendRoom = (r) => broadcast(r, roomInfo(r));
function joinRoom(p, r) {
  p.room = r; p.score = 0; p.active = false; p.done = null; p.pick = null; p.placed = false;
  const free = CHARS.find((c) => !r.players.some((o) => o.char === c.id));
  p.char = free ? free.id : CHARS[0].id;
  r.players.push(p);
  if (!r.host) r.host = p.id;
  send(p, { t: 'joined', code: r.code });
  if (r.phase !== 'lobby') {
    send(p, { t: 'placed', items: r.placed });
    send(p, { t: 'phase', phase: r.phase, dur: Math.max(0, (r.phaseEnd - Date.now()) / 1000), late: true, ...r.extra });
  }
  sendRoom(r);
}
function leave(p) {
  const r = p.room;
  if (!r) return;
  p.room = null;
  r.players = r.players.filter((o) => o !== p);
  if (!r.players.length) { clearTimeout(r.timer); clearTimeout(r.adv); rooms.delete(r.code); return; }
  if (r.host === p.id) r.host = r.players[0].id;
  if (r.phase === 'run') checkRunEnd(r);
  if (r.phase === 'pick') checkPickEnd(r);
  if (r.phase === 'place') checkPlaceEnd(r);
  if (r.phase !== 'lobby' && !r.players.some((o) => o.active)) toLobby(r);
  sendRoom(r);
}

// ---------- Fases ----------
function setPhase(r, phase, dur, extra = {}) {
  clearTimeout(r.timer); clearTimeout(r.adv);
  r.phase = phase; r.phaseEnd = Date.now() + dur * 1000; r.extra = extra;
  r.timer = setTimeout(() => advance(r), dur * 1000);
  broadcast(r, { t: 'phase', phase, dur, ...extra });
  sendRoom(r);
}
function soon(r, ms) { clearTimeout(r.adv); r.adv = setTimeout(() => advance(r), ms); }
function advance(r) {
  if (!rooms.has(r.code)) return;
  if (r.phase === 'pick') startPlace(r);
  else if (r.phase === 'place') startRun(r);
  else if (r.phase === 'run') endRun(r);
  else if (r.phase === 'score') afterScore(r);
  else if (r.phase === 'end') toLobby(r);
}
function startMatch(r) {
  r.placed = []; r.round = 0; r.lastReason = null;
  for (const p of r.players) p.score = 0;
  broadcast(r, { t: 'placed', items: r.placed });
  startPick(r);
}
function startPick(r) {
  r.round++;
  for (const p of r.players) { p.active = true; p.pick = null; p.placed = false; p.done = null; p.pollo = false; p.st = null; p.cur = null; }
  const n = r.players.length + 2;
  r.box = Array.from({ length: n }, () => ({ id: weighted(), by: 0 }));
  // Si nadie llegó a la bandera la ronda pasada, desde la ronda 3 la caja trae dinamita para borrar un objeto.
  const bomba = r.round >= 3 && r.lastReason === 'dificil' && r.placed.length > 0;
  if (bomba) r.box.push({ id: 'dinamita', by: 0 });
  setPhase(r, 'pick', RULES.pickTime, { box: r.box, round: r.round, bomba });
}
function checkPickEnd(r) {
  const act = r.players.filter((p) => p.active);
  if (act.length && act.every((p) => p.pick)) soon(r, 1000);
}
function startPlace(r) { setPhase(r, 'place', RULES.placeTime); checkPlaceEnd(r); }
function checkPlaceEnd(r) {
  const act = r.players.filter((p) => p.active);
  if (act.every((p) => !p.pick || p.placed)) soon(r, 900);
}
function startRun(r) {
  r.order = [];
  for (const p of r.players) { p.st = null; p.done = p.active ? null : p.done; }
  const kinds = ['picarones', 'ceviche', 'rocoto', 'chicha', 'picarones', 'ceviche', 'rocoto', 'chicha', 'pollo'];
  const spots = shuffle(MAPS[r.map].foods.slice()).slice(0, 3);
  r.foods = spots.map(([x, y], i) => ({ i, x, y, k: kinds[Math.floor(Math.random() * kinds.length)], by: 0 }));
  setPhase(r, 'run', RULES.runTime + RULES.countdown, { foods: r.foods });
}
function checkRunEnd(r) {
  if (r.phase !== 'run') return;
  const act = r.players.filter((p) => p.active);
  if (act.every((p) => p.done)) soon(r, 1500);
}
function endRun(r) {
  const act = r.players.filter((p) => p.active);
  const fin = r.order.map((id) => act.find((p) => p.id === id)).filter(Boolean);
  const results = [];
  let reason = 'ok';
  if (!fin.length) reason = 'dificil';
  else if (act.length > 1 && fin.length === act.length) reason = 'facil';
  else {
    fin.forEach((p, i) => {
      let g = RULES.finishPts;
      const why = ['Bandera'];
      if (i === 0 && act.length > 1) { g += RULES.firstPts; why.push('primero'); }
      if (p.pollo) { g += RULES.polloPts; why.push('pollo'); }
      p.score += g;
      results.push({ id: p.id, gain: g, why: why.join(' + ') });
    });
  }
  r.lastReason = reason;
  setPhase(r, 'score', RULES.scoreTime, { results, reason });
}
function afterScore(r) {
  const best = Math.max(...r.players.map((p) => p.score));
  if (best >= r.win) {
    const ranking = r.players.slice().sort((a, b) => b.score - a.score).map((p) => ({ id: p.id, name: p.name, char: p.char, score: p.score }));
    setPhase(r, 'end', RULES.endTime, { ranking });
  } else startPick(r);
}
function toLobby(r) {
  clearTimeout(r.timer); clearTimeout(r.adv);
  r.phase = 'lobby'; r.placed = []; r.round = 0; r.extra = {};
  for (const p of r.players) { p.active = false; p.done = null; p.pick = null; p.placed = false; }
  broadcast(r, { t: 'placed', items: [] });
  broadcast(r, { t: 'phase', phase: 'lobby', dur: 0 });
  sendRoom(r);
}

// ---------- Mensajes ----------
const POWER_KINDS = new Set(['stun', 'immune', 'blink', 'obra', 'knock', 'chalaca', 'glide', 'invert']);
function handle(p, m) {
  const r = p.room;
  switch (m.t) {
    case 'join': {
      if (r) return;
      p.name = clean(m.name) || `Causa${p.id}`;
      let room;
      if (m.code) {
        room = rooms.get(String(m.code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
        if (!room) { send(p, { t: 'err', msg: 'No existe esa sala. Revisa el código.' }); return; }
      } else {
        if (rooms.size >= 200) { send(p, { t: 'err', msg: 'El servidor está lleno, intenta en un rato.' }); return; }
        room = createRoom();
      }
      if (room.players.length >= RULES.maxPlayers) { send(p, { t: 'err', msg: 'La sala está llena (máximo 8 jugadores).' }); return; }
      joinRoom(p, room);
      return;
    }
    case 'leave': leave(p); send(p, { t: 'left' }); return;
    case 'char': {
      if (!r || r.phase !== 'lobby') return;
      const c = CHARS.find((x) => x.id === m.char);
      if (c && !r.players.some((o) => o !== p && o.char === c.id)) { p.char = c.id; sendRoom(r); }
      return;
    }
    case 'cfg':
      if (!r || r.phase !== 'lobby' || r.host !== p.id) return;
      if (m.map != null) r.map = Math.floor(num(m.map, 0, MAPS.length - 1));
      if (RULES.winOptions.includes(+m.win)) r.win = +m.win;
      sendRoom(r);
      return;
    case 'start':
      if (r && r.phase === 'lobby' && r.host === p.id) startMatch(r);
      return;
    case 'back':
      if (r && r.phase === 'end' && r.host === p.id) toLobby(r);
      return;
    case 'pick': {
      if (!r || r.phase !== 'pick' || !p.active || p.pick) return;
      const slot = r.box[Math.floor(num(m.i, 0, 99))];
      if (!slot || slot.by) return;
      slot.by = p.id; p.pick = slot.id;
      broadcast(r, { t: 'box', box: r.box });
      sendRoom(r);
      checkPickEnd(r);
      return;
    }
    case 'cur':
      if (r && r.phase === 'place' && p.pick && !p.placed) p.cur = [Math.round(num(m.x, -3, COLS + 3)), Math.round(num(m.y, -3, ROWS + 3)), Math.floor(num(m.r, 0, SH.rotsOf(p.pick) - 1))];
      return;
    case 'place': {
      if (!r || r.phase !== 'place' || !p.active || !p.pick || p.placed) return;
      const it = { id: p.pick, x: Math.round(num(m.x, -3, COLS)), y: Math.round(num(m.y, -3, ROWS)), rot: Math.floor(num(m.r, 0, SH.rotsOf(p.pick) - 1)), by: p.id };
      if (!SH.validPlacement(MAPS[r.map], r.placed, it)) { send(p, { t: 'bad' }); return; }
      if (ITEMS[it.id].kind === 'bomb') {
        const zone = SH.itemRect(it);
        r.placed = r.placed.filter((o) => !SH.overlap(SH.itemRect(o), zone));
        broadcast(r, { t: 'boom', x: it.x, y: it.y });
      } else r.placed.push(it);
      p.placed = true; p.cur = null;
      broadcast(r, { t: 'placed', items: r.placed });
      sendRoom(r);
      checkPlaceEnd(r);
      return;
    }
    case 'st':
      if (r && r.phase === 'run' && p.active) {
        p.st = [p.id, Math.round(num(m.x, -64, W + 64)), Math.round(num(m.y, -200, H + 200)), m.f < 0 ? -1 : 1, Math.floor(num(m.a, 0, 3)), Math.floor(num(m.fl, 0, 65535))];
      }
      return;
    case 'finish': {
      if (!r || r.phase !== 'run' || !p.active || p.done || !p.st) return;
      const map = MAPS[r.map], fx = map.flag[0] * T + 8, fy = map.flag[1] * T;
      if (Math.hypot(p.st[1] - fx, p.st[2] - fy) > 64) return; // debe estar cerca de la bandera
      p.done = 'win'; r.order.push(p.id);
      broadcast(r, { t: 'ev', k: 'win', id: p.id, n: r.order.length });
      sendRoom(r);
      checkRunEnd(r);
      return;
    }
    case 'die':
      if (!r || r.phase !== 'run' || !p.active || p.done) return;
      p.done = 'dead';
      broadcast(r, { t: 'ev', k: 'die', id: p.id, why: clean(m.why) });
      sendRoom(r);
      checkRunEnd(r);
      return;
    case 'eat': {
      if (!r || r.phase !== 'run' || !p.active || p.done) return;
      const f = r.foods.find((x) => x.i === m.i && !x.by);
      if (!f) return;
      f.by = p.id;
      if (f.k === 'pollo') p.pollo = true;
      broadcast(r, { t: 'ate', i: f.i, id: p.id });
      return;
    }
    case 'pw': {
      if (!r || r.phase !== 'run' || !p.active || p.done || !POWER_KINDS.has(m.k)) return;
      const to = Array.isArray(m.to) ? m.to.slice(0, 8).map((x) => Math.floor(+x)).filter((x) => r.players.some((o) => o.id === x && o !== p)) : [];
      broadcast(r, { t: 'fx', from: p.id, k: m.k, to, x: num(m.x, -64, W + 64), y: num(m.y, -200, H + 200), x2: num(m.x2, -64, W + 64), y2: num(m.y2, -200, H + 200), d: m.d < 0 ? -1 : 1 });
      return;
    }
    default:
  }
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
wss.on('connection', (ws) => {
  const p = { id: nextId++, ws, name: 'Causa', char: null, room: null, score: 0, active: false, done: null, pick: null, placed: false, pollo: false, st: null, cur: null, tokens: 80, last: Date.now(), alive: true };
  send(p, { t: 'hi', id: p.id });
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (raw) => {
    const now = Date.now();
    p.tokens = Math.min(80, p.tokens + (now - p.last) * 0.06); p.last = now;
    if (p.tokens < 1) return;
    p.tokens -= 1;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { handle(p, m); } catch (e) { console.error('error en mensaje', m.t, e); }
  });
  ws.on('close', () => leave(p));
  ws.on('error', () => {});
  ws.player = p;
});

// Estados de los jugadores (15 veces por segundo) y latido de conexión.
setInterval(() => {
  for (const r of rooms.values()) {
    if (r.phase === 'run') {
      const s = r.players.filter((p) => p.active && p.st).map((p) => p.st);
      if (s.length) broadcast(r, { t: 's', p: s });
    } else if (r.phase === 'place') {
      const c = r.players.filter((p) => p.cur).map((p) => [p.id, ...p.cur]);
      broadcast(r, { t: 'c', c });
    }
  }
}, 66);
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.player.alive) { ws.terminate(); continue; }
    ws.player.alive = false; ws.ping();
  }
}, 30000);

server.listen(PORT, '127.0.0.1', () => console.log(`¡Chapa la Bandera! escuchando en http://127.0.0.1:${PORT}`));
