// Pixel art en alta resolución (2 píxeles de arte por píxel del mundo), dibujado en código.
// Cada figura se pinta con materiales de 3 tonos (luz, base, sombra) y recibe un contorno oscuro automático.
const ART = (() => {
  'use strict';
  const OUT = '#1b1426';

  // ---------- Pintor de píxeles ----------
  function P(w, h) { return { w, h, d: new Array(w * h).fill(0) }; }
  function set(p, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < p.w && y < p.h) p.d[y * p.w + x] = c; }
  function get(p, x, y) { return x >= 0 && y >= 0 && x < p.w && y < p.h ? p.d[y * p.w + x] : 0; }
  function rect(p, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(p, x + i, y + j, c); }
  function ell(p, cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(p, x, y, c);
      }
    }
  }
  function box(p, x, y, w, h, m) {
    rect(p, x, y, w, h, m[1]);
    rect(p, x, y, w, 1, m[0]); rect(p, x, y, 1, h, m[0]);
    rect(p, x, y + h - 1, w, 1, m[2]); rect(p, x + w - 1, y, 1, h, m[2]);
  }
  function ball(p, cx, cy, rx, ry, m) {
    ell(p, cx, cy, rx, ry, m[2]);
    ell(p, cx - 0.7, cy - 0.7, Math.max(0.6, rx - 0.8), Math.max(0.6, ry - 0.8), m[1]);
    ell(p, cx - rx * 0.38, cy - ry * 0.42, Math.max(0.7, rx * 0.28), Math.max(0.7, ry * 0.24), m[0]);
  }
  function line(p, x0, y0, x1, y1, c, t = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) rect(p, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), t, t, c);
  }
  const rgbCache = {};
  function rgb(h) {
    if (rgbCache[h]) return rgbCache[h];
    const n = parseInt(h.slice(1), 16);
    return (rgbCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  // Aclara (f > 0) u oscurece (f < 0) un color, con un leve giro de tono hacia cálido/frío (estilo 32 bits).
  const adjCache = {};
  function adj(h, f) {
    const k = `${h}|${f}`;
    if (adjCache[k]) return adjCache[k];
    const [r, g, b] = rgb(h);
    const m = (v, w) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f * w : v * (1 + f * w))));
    const out = f > 0 ? [m(r, 1.1), m(g, 1), m(b, 0.8)] : [m(r, 1), m(g, 1.05), m(b, 0.8)];
    return (adjCache[k] = `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  }
  // Pulido: borde inferior/derecho más oscuro y superior/izquierdo más claro = volumen con más tonos.
  function polish(p) {
    const d = p.d.slice();
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const c = get(p, x, y); if (!c) continue;
      const b = !get(p, x, y + 1) || !get(p, x + 1, y), t = !get(p, x, y - 1) || !get(p, x - 1, y);
      if (b) d[y * p.w + x] = adj(c, -0.2); else if (t) d[y * p.w + x] = adj(c, 0.16);
    }
    p.d = d;
    return p;
  }
  // Contorno "selout": cada borde toma una versión oscura del color vecino en vez de negro plano.
  function outline(p, c = OUT) {
    polish(p);
    const add = [];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (get(p, x, y)) continue;
      const n = get(p, x, y + 1) || get(p, x - 1, y) || get(p, x + 1, y) || get(p, x, y - 1);
      if (n) add.push(x, y, y > 0 && get(p, x, y - 1) ? c : adj(n, -0.7));
    }
    for (let i = 0; i < add.length; i += 3) set(p, add[i], add[i + 1], add[i + 2]);
    return p;
  }
  function toCanvas(p) {
    const c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
    const x = c.getContext('2d'), img = x.createImageData(p.w, p.h);
    for (let i = 0; i < p.d.length; i++) {
      const col = p.d[i]; if (!col) continue;
      const [r, g, b] = rgb(col); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function flip(src) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c;
  }
  function rot90(src) {
    const c = document.createElement('canvas'); c.width = src.height; c.height = src.width;
    const x = c.getContext('2d'); x.translate(src.height, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0); return c;
  }
  function tint(src, color) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function scaled(src, s) {
    const c = document.createElement('canvas'); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); return c;
  }
  // Semilla fija para detalles "aleatorios" repetibles.
  function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // ---------- Materiales [luz, base, sombra] ----------
  const M = {
    piel: ['#f7cda6', '#dea070', '#a86b43'], morena: ['#e4ab7c', '#c07e4c', '#86502d'], pintura: ['#ffffff', '#f1ece4', '#c7bdb0'],
    rojo: ['#ff7070', '#d8303a', '#8a1a24'], blanco: ['#ffffff', '#e8e3da', '#b0a89c'], negro: ['#57506a', '#2e293a', '#18131f'],
    gris: ['#b8bfcc', '#858d9d', '#555b69'], traje: ['#67708a', '#434a60', '#282d3d'], amarillo: ['#fff07a', '#f6c90e', '#b88600'],
    naranja: ['#ffb866', '#f2842a', '#a8520f'], azul: ['#7cb4f7', '#3b72c9', '#22478a'], verde: ['#8ae07f', '#3fa34a', '#1f5f2a'],
    morado: ['#d38be3', '#8e44ad', '#57216e'], rosa: ['#ffa6da', '#e0559f', '#992c68'], marron: ['#c28f62', '#8a5a33', '#57361b'],
    rubio: ['#fff4a8', '#f2cf55', '#bd8f24'], oro: ['#fff39a', '#e7b52c', '#a6751a'], jean: ['#78a0e0', '#40679f', '#27436d'],
    adobe: ['#e2a36d', '#b8743f', '#7a4623'], acero: ['#c3cad6', '#8a93a3', '#565d6b'], paja: ['#f7df8a', '#dcb857', '#a07b2c'],
    crema: ['#fffaf0', '#efe6d4', '#bfb198'], carmin: ['#ff8f8f', '#e0344a', '#9a1d33'], lima: ['#f4ffc8', '#b9f25a', '#6aa81e'],
  };

  // ---------- Personajes (24x32, pies en la fila 30) ----------
  const EYE = '#1d1626';
  function chibi(frame, o) {
    const p = P(24, 32);
    if (o.back) o.back(p, frame);
    const L = frame === 1 ? [-1, 1] : frame === 2 ? [1, -1] : [0, 0];
    if (frame === 3) {
      box(p, 8, 22, 3, 4, o.pants); box(p, 13, 22, 3, 4, o.pants);
      box(p, 7, 25, o.bigShoes ? 5 : 4, 3, o.shoes); box(p, 13, 25, o.bigShoes ? 5 : 4, 3, o.shoes);
    } else {
      box(p, 9 + L[0], 22, 3, 6, o.pants); box(p, 12 + L[1], 22, 3, 6, o.pants);
      box(p, 8 + L[0] - (o.bigShoes ? 1 : 0), 27, o.bigShoes ? 6 : 4, 3, o.shoes); box(p, 12 + L[1], 27, o.bigShoes ? 6 : 4, 3, o.shoes);
    }
    box(p, 7, 14, 10, 9, o.shirt);
    if (o.torso) o.torso(p, frame);
    const sw = frame === 1 ? 1 : frame === 2 ? -1 : 0, up = frame === 3 ? -3 : 0;
    box(p, 5, 15 + sw + up, 2, 6, o.sleeve || o.shirt); box(p, 17, 15 - sw + up, 2, 6, o.sleeve || o.shirt);
    box(p, 5, 20 + sw + up, 2, 2, o.skin); box(p, 17, 20 - sw + up, 2, 2, o.skin);
    ball(p, 12, 9, 6.5, 6, o.skin);
    if (!o.noEyes) {
      rect(p, 9, 9, 1, 2, EYE); rect(p, 14, 9, 1, 2, EYE);
      set(p, 8, 11, o.skin[0]); set(p, 15, 11, o.skin[2]);
      set(p, 8, 12, '#f09a9a'); set(p, 15, 12, '#f09a9a');
    }
    rect(p, 11, 12, 2, 1, o.mouth || '#8a3a3a');
    if (o.head) o.head(p, frame);
    return toCanvas(outline(p));
  }

  const CHAR_DEF = {
    vedette: {
      skin: M.piel, shirt: M.rojo, pants: M.piel, shoes: M.rojo, sleeve: M.piel, mouth: '#e0306a',
      back: (p) => { ball(p, 12, 10, 9.5, 9, M.rubio); ell(p, 12, 16, 8, 3, M.rubio[1]); },
      torso: (p) => {
        box(p, 6, 19, 12, 5, M.rojo);
        const r = rnd(7); for (let i = 0; i < 8; i++) set(p, 7 + Math.floor(r() * 10), 15 + Math.floor(r() * 8), '#ffe3ea');
        rect(p, 9, 14, 6, 1, M.rojo[0]);
      },
      head: (p) => {
        ball(p, 12, 5, 7, 3.4, M.rubio); rect(p, 6, 6, 3, 5, M.rubio[1]); rect(p, 15, 6, 3, 5, M.rubio[1]);
        set(p, 8, 8, EYE); set(p, 15, 8, EYE); set(p, 5, 12, M.oro[1]); set(p, 19, 12, M.oro[1]); set(p, 5, 13, M.oro[0]); set(p, 19, 13, M.oro[0]);
      },
    },
    congresista: {
      skin: M.piel, shirt: M.traje, pants: M.traje, shoes: M.negro,
      torso: (p) => {
        rect(p, 10, 14, 4, 6, M.blanco[1]); rect(p, 11, 15, 2, 6, M.rojo[1]); set(p, 11, 15, M.rojo[0]);
        line(p, 9, 14, 11, 19, M.traje[2]); line(p, 14, 14, 12, 19, M.traje[2]);
        set(p, 8, 16, M.rojo[1]); set(p, 8, 17, '#ffffff'); set(p, 8, 18, M.rojo[1]);
      },
      head: (p) => {
        rect(p, 5, 7, 2, 5, M.gris[1]); rect(p, 17, 7, 2, 5, M.gris[1]); set(p, 5, 7, M.gris[0]);
        rect(p, 7, 8, 4, 4, EYE); rect(p, 13, 8, 4, 4, EYE); rect(p, 8, 9, 2, 2, '#bfe6ff'); rect(p, 14, 9, 2, 2, '#bfe6ff');
        set(p, 8, 9, '#ffffff'); set(p, 14, 9, '#ffffff'); rect(p, 11, 9, 2, 1, EYE); rect(p, 10, 13, 4, 1, '#7a3a3a');
      },
      noEyes: true,
    },
    presidente: {
      skin: M.morena, shirt: M.traje, pants: M.traje, shoes: M.negro,
      torso: (p) => {
        rect(p, 11, 14, 2, 3, M.blanco[1]);
        for (let i = 0; i < 9; i++) { set(p, 16 - i, 14 + i, M.rojo[1]); set(p, 15 - i, 14 + i, '#ffffff'); set(p, 14 - i, 14 + i, M.rojo[1]); set(p, 17 - i, 14 + i, M.rojo[2]); }
        ball(p, 10, 19, 1.6, 1.6, M.oro);
      },
      head: (p) => { ball(p, 12, 5, 7, 3.2, M.negro); rect(p, 5, 5, 2, 5, M.negro[1]); rect(p, 17, 5, 2, 5, M.negro[1]); line(p, 9, 3, 13, 3, M.negro[0]); },
    },
    alcalde: {
      skin: M.morena, shirt: M.naranja, sleeve: M.azul, pants: M.jean, shoes: M.marron,
      torso: (p) => { rect(p, 7, 17, 10, 1, '#eaf7ff'); rect(p, 7, 20, 10, 1, '#eaf7ff'); rect(p, 11, 14, 2, 9, M.naranja[2]); },
      head: (p) => {
        ball(p, 12, 5, 7.5, 4.2, M.amarillo); rect(p, 3, 6, 18, 2, M.amarillo[2]); rect(p, 3, 6, 18, 1, M.amarillo[1]);
        rect(p, 11, 1, 2, 5, M.amarillo[0]); rect(p, 9, 11, 6, 1, '#3a2618'); set(p, 8, 11, '#3a2618'); set(p, 15, 11, '#3a2618');
      },
    },
    chola: {
      skin: M.morena, shirt: M.rosa, sleeve: M.rosa, pants: M.morena, shoes: M.negro,
      back: (p) => { rect(p, 4, 9, 2, 13, M.negro[1]); rect(p, 18, 9, 2, 13, M.negro[1]); rect(p, 4, 21, 2, 2, M.rojo[1]); rect(p, 18, 21, 2, 2, M.verde[1]); },
      torso: (p) => {
        rect(p, 7, 16, 10, 1, M.amarillo[1]); rect(p, 7, 18, 10, 1, M.verde[1]); for (let x = 8; x < 17; x += 2) set(p, x, 17, '#ffffff');
        box(p, 5, 20, 14, 5, M.rojo); rect(p, 5, 23, 14, 1, M.amarillo[1]); for (let x = 6; x < 18; x += 3) set(p, x, 22, M.verde[0]);
      },
      head: (p) => {
        rect(p, 6, 5, 12, 2, M.negro[1]);
        box(p, 2, 2, 20, 3, M.rojo); rect(p, 2, 4, 20, 1, M.negro[1]); rect(p, 7, 0, 10, 2, M.negro[1]);
        for (let x = 3; x < 21; x += 2) set(p, x, 5, M.amarillo[1]);
      },
    },
    futbolista: {
      skin: M.morena, shirt: M.blanco, pants: M.blanco, shoes: M.negro,
      torso: (p) => { for (let i = 0; i < 10; i++) { rect(p, 7 + i, 14 + i * 0.85, 3, 1, M.rojo[1]); } box(p, 7, 20, 10, 3, M.negro); rect(p, 9, 25, 3, 1, M.rojo[1]); rect(p, 12, 25, 3, 1, M.rojo[1]); },
      head: (p) => { ball(p, 12, 5, 6.8, 3, M.negro); rect(p, 6, 5, 12, 2, M.negro[1]); rect(p, 5, 6, 2, 3, M.negro[2]); rect(p, 17, 6, 2, 3, M.negro[2]); },
    },
    comico: {
      skin: M.pintura, shirt: M.amarillo, sleeve: M.amarillo, pants: M.azul, shoes: M.rojo, bigShoes: true, mouth: M.rojo[1],
      back: (p) => { ball(p, 6, 7, 4.5, 4.5, M.rojo); ball(p, 12, 4, 5.5, 4, M.verde); ball(p, 18, 7, 4.5, 4.5, M.azul); ball(p, 9, 3, 3, 2.5, M.amarillo); ball(p, 15, 3, 3, 2.5, M.morado); },
      torso: (p) => { const d = [[9, 16, M.rojo], [14, 17, M.azul], [11, 19, M.verde], [15, 21, M.rojo], [8, 21, M.azul]]; for (const [x, y, m] of d) { rect(p, x, y, 2, 2, m[1]); } },
      head: (p) => { ball(p, 12, 11, 1.8, 1.6, M.rojo); rect(p, 9, 13, 6, 1, M.rojo[1]); set(p, 9, 12, M.rojo[1]); set(p, 14, 12, M.rojo[1]); set(p, 9, 7, M.azul[1]); set(p, 14, 7, M.azul[1]); },
    },
  };

  function condorChar(frame) {
    const p = P(24, 32);
    const L = frame === 1 ? [-1, 1] : frame === 2 ? [1, -1] : [0, 0];
    rect(p, 9 + L[0], 23, 2, 5, M.gris[1]); rect(p, 13 + L[1], 23, 2, 5, M.gris[1]);
    rect(p, 8 + L[0], 28, 4, 2, M.amarillo[2]); rect(p, 12 + L[1], 28, 4, 2, M.amarillo[2]);
    if (frame === 3) { // alas abiertas
      for (let i = 0; i < 9; i++) { rect(p, 1 + i * 0.3, 11 + i, 7, 1, M.negro[1]); rect(p, 16 - i * 0.3, 11 + i, 7, 1, M.negro[1]); }
      rect(p, 1, 17, 6, 1, '#ffffff'); rect(p, 17, 17, 6, 1, '#ffffff');
    }
    ball(p, 12, 18, 7, 6.5, M.negro);
    rect(p, 6, 16, 2, 5, M.negro[2]); rect(p, 16, 16, 2, 5, M.negro[2]);
    rect(p, 7, 19, 3, 1, '#ffffff'); rect(p, 14, 19, 3, 1, '#ffffff');
    ell(p, 12, 12, 6, 2.2, '#f7f4ee'); ell(p, 12, 12.6, 5, 1.4, '#d8d2c6');
    ball(p, 12, 7, 4.5, 4.2, ['#f3a39a', '#d9776b', '#9e4a42']);
    rect(p, 10, 2, 4, 2, '#8e3a34'); set(p, 11, 1, '#8e3a34');
    rect(p, 10, 6, 1, 2, EYE); set(p, 10, 6, '#ffffff');
    rect(p, 15, 7, 3, 2, '#efe2c0'); set(p, 17, 9, '#cbb88a');
    return toCanvas(outline(p));
  }

  // ---------- Objetos (32 px de arte por casilla) ----------
  function adobe() {
    const p = P(32, 32); rect(p, 0, 0, 32, 32, '#5a3522');
    const r = rnd(3);
    for (let row = 0; row < 4; row++) {
      const y = row * 8 + 1, offs = row % 2 ? [[0, 7], [9, 14], [25, 7]] : [[1, 14], [17, 14]];
      for (const [x, w] of offs) { box(p, x, y, w, 7, M.adobe); for (let k = 0; k < 3; k++) set(p, x + 1 + Math.floor(r() * (w - 2)), y + 1 + Math.floor(r() * 5), '#efcf8a'); }
    }
    return toCanvas(p);
  }
  function viga() {
    const p = P(96, 32);
    box(p, 0, 6, 96, 5, M.acero); box(p, 0, 21, 96, 5, M.acero); rect(p, 0, 11, 96, 10, '#6d7482'); rect(p, 0, 11, 96, 1, '#8a93a3');
    for (let x = 8; x < 96; x += 16) { ell(p, x, 16, 3.2, 3.2, '#23262e'); set(p, x - 1, 15, '#454a55'); set(p, x + 6, 8, '#e1e6ee'); set(p, x + 6, 23, '#e1e6ee'); }
    const r = rnd(9); for (let i = 0; i < 10; i++) rect(p, Math.floor(r() * 92), 11 + Math.floor(r() * 9), 2, 1, '#a0522d');
    return toCanvas(outline(p));
  }
  function colchon() {
    const p = P(64, 32);
    for (let x = 4; x < 62; x += 6) line(p, x, 26, x + 3, 30, M.gris[1]);
    box(p, 1, 9, 62, 17, M.crema);
    for (let x = 4; x < 60; x += 6) rect(p, x, 10, 2, 15, '#6c9be0');
    for (let x = 4; x < 62; x += 8) ell(p, x + 2, 9.5, 4, 2, M.crema[0]);
    for (let x = 8; x < 60; x += 12) set(p, x, 17, '#9a8f80');
    ell(p, 40, 20, 5, 2.5, '#e8d9a0');
    return toCanvas(outline(p));
  }
  function chicha() {
    const p = P(96, 32);
    box(p, 0, 14, 96, 18, ['#b9b9c6', '#8f8fa0', '#5f5f70']);
    for (let x = 4; x < 96; x += 14) rect(p, x, 22, 8, 1, '#7a7a8a');
    ell(p, 50, 13, 38, 3.2, M.morado[1]); ell(p, 50, 12.5, 30, 2, M.morado[0]); rect(p, 28, 12, 6, 1, '#f6dcff'); rect(p, 62, 13, 4, 1, '#f6dcff');
    ell(p, 12, 11, 7, 4, '#d8eef5'); ell(p, 12, 12, 5, 2.5, M.morado[1]); rect(p, 18, 9, 4, 3, '#d8eef5');
    return toCanvas(outline(p));
  }
  function totora() {
    const p = P(64, 32);
    ell(p, 32, 18, 30, 8, M.paja[2]); ell(p, 32, 17, 29, 7, M.paja[1]);
    for (let y = 12; y < 25; y += 3) rect(p, 5, y, 54, 1, M.paja[2]);
    rect(p, 6, 13, 50, 1, M.paja[0]);
    for (const x of [16, 32, 48]) rect(p, x, 10, 2, 16, '#6b4b22');
    ell(p, 4, 9, 3, 5, M.paja[1]); ell(p, 60, 9, 3, 5, M.paja[1]); set(p, 3, 5, M.paja[0]); set(p, 60, 5, M.paja[0]);
    return toCanvas(outline(p));
  }
  function condorPerch(frame = 0) {
    const p = P(32, 32);
    ball(p, 16, 28, 12, 5, M.gris);
    const w = frame ? 2 : 0;
    ball(p, 15, 18, 8, 7.5, M.negro);
    rect(p, 8 - w, 17, 3, 6, M.negro[2]); rect(p, 20 + w, 17, 3, 6, M.negro[2]);
    rect(p, 9, 20, 4, 1, '#ffffff'); rect(p, 18, 20, 4, 1, '#ffffff');
    ell(p, 17, 11, 6, 2.2, '#f7f4ee');
    ball(p, 20, 7, 4, 3.8, ['#f3a39a', '#d9776b', '#9e4a42']); rect(p, 18, 2, 3, 2, '#8e3a34');
    rect(p, 21, 6, 1, 2, EYE); rect(p, 24, 7, 3, 2, '#efe2c0');
    rect(p, 12, 25, 2, 3, M.amarillo[2]); rect(p, 17, 25, 2, 3, M.amarillo[2]);
    return toCanvas(outline(p));
  }
  function tuna() {
    const p = P(32, 32);
    rect(p, 13, 27, 6, 5, M.marron[1]);
    ball(p, 16, 21, 8, 8, M.verde); ball(p, 8, 12, 5.5, 6, M.verde); ball(p, 24, 11, 5.5, 6, M.verde);
    const r = rnd(4); for (let i = 0; i < 16; i++) set(p, 4 + Math.floor(r() * 24), 6 + Math.floor(r() * 22), '#ffffff');
    ball(p, 8, 5, 2.4, 2.2, M.carmin); ball(p, 24, 4, 2.4, 2.2, M.carmin); ball(p, 16, 12, 2.2, 2, M.morado);
    return toCanvas(outline(p));
  }
  function parrilla() {
    const p = P(32, 32);
    line(p, 6, 22, 3, 31, M.negro[1], 2); line(p, 25, 22, 28, 31, M.negro[1], 2);
    box(p, 3, 17, 26, 6, M.negro); for (let x = 5; x < 28; x += 3) set(p, x, 19, '#ff8a2a');
    for (let i = 0; i < 3; i++) {
      const y = 9 + i * 3; line(p, 2, y + 2, 29, y, '#e0c08a');
      for (let k = 0; k < 4; k++) box(p, 6 + k * 6 + i, y - 1, 4, 3, k % 2 ? M.marron : ['#c65a3a', '#9a3a26', '#5e2012']);
    }
    return toCanvas(outline(p));
  }
  function cable() {
    const p = P(96, 32);
    rect(p, 0, 9, 4, 12, M.gris[1]); rect(p, 92, 9, 4, 12, M.gris[1]);
    for (let x = 0; x < 96; x++) { const y = 14 + Math.round(Math.sin((x / 95) * Math.PI) * 3); rect(p, x, y, 1, 3, '#1f1f26'); }
    for (const [a, b] of [[28, 38], [58, 66]]) for (let x = a; x < b; x++) { const y = 14 + Math.round(Math.sin((x / 95) * Math.PI) * 3); rect(p, x, y, 1, 3, '#e8963d'); set(p, x, y, '#ffd08a'); }
    rect(p, 40, 18, 12, 6, M.amarillo[1]); rect(p, 45, 19, 2, 3, EYE); set(p, 45, 23, EYE);
    return toCanvas(outline(p));
  }
  function combi() {
    const p = P(64, 32);
    box(p, 16, 1, 30, 5, M.amarillo); rect(p, 20, 3, 22, 1, '#3a2d10');
    box(p, 1, 6, 60, 18, M.blanco);
    rect(p, 2, 17, 58, 2, M.amarillo[1]); rect(p, 2, 19, 58, 2, M.rojo[1]); rect(p, 2, 21, 58, 1, M.verde[1]);
    for (let i = 0; i < 6; i++) { box(p, 4 + i * 8, 8, 7, 7, ['#d6f2ff', '#8ec9e6', '#5a8fae']); ball(p, 7.5 + i * 8, 12.5, 1.8, 1.8, i % 2 ? M.negro : M.marron); }
    box(p, 52, 8, 9, 8, ['#e8f8ff', '#a8dcf0', '#6fa5bd']);
    rect(p, 58, 17, 3, 2, '#fff3a0');
    ball(p, 14, 26, 5, 5, M.negro); ball(p, 48, 26, 5, 5, M.negro); ell(p, 14, 26, 2, 2, M.gris[1]); ell(p, 48, 26, 2, 2, M.gris[1]);
    return toCanvas(outline(p));
  }
  function nectar() {
    const p = P(64, 32);
    box(p, 2, 17, 44, 6, M.gris);
    const cols = [M.naranja, M.amarillo, M.verde, M.naranja, M.carmin, M.amarillo];
    for (let i = 0; i < 6; i++) { const x = 4 + (i % 3) * 13, y = i < 3 ? 9 : 1; box(p, x, y + 0, 12, 8, cols[i]); rect(p, x + 3, y + 3, 5, 3, '#ffffff'); ball(p, x + 5.5, y + 4.5, 1.5, 1.4, cols[(i + 2) % 6]); }
    box(p, 46, 8, 16, 15, M.rojo); box(p, 50, 10, 10, 6, ['#e8f8ff', '#a8dcf0', '#6fa5bd']); rect(p, 60, 18, 2, 2, '#fff3a0');
    ball(p, 12, 26, 5, 5, M.negro); ball(p, 52, 26, 5, 5, M.negro); ell(p, 12, 26, 2, 2, M.gris[1]); ell(p, 52, 26, 2, 2, M.gris[1]);
    return toCanvas(outline(p));
  }
  function perro(frame) {
    const p = P(32, 32);
    const k = frame ? 1 : 0;
    rect(p, 8 + k, 24, 3, 6, M.marron[2]); rect(p, 13 - k, 24, 3, 6, M.marron[2]); rect(p, 19 + k, 24, 3, 6, M.marron[2]); rect(p, 23 - k, 24, 3, 6, M.marron[2]);
    ball(p, 16, 21, 11, 5.5, ['#d6a26c', '#a8723f', '#6e4520']); ell(p, 13, 22, 4, 2.2, '#5b3a1e');
    ell(p, 17, 24, 7, 1.6, '#e8c9a0');
    line(p, 6, 19, 2, 12 + k * 2, '#a8723f', 2);
    ball(p, 26, 14, 5.5, 5, ['#d6a26c', '#a8723f', '#6e4520']); ell(p, 30, 16, 2.4, 2, '#e8c9a0'); set(p, 31, 15, EYE);
    ell(p, 23, 11, 2, 4, '#5b3a1e'); rect(p, 27, 12, 1, 2, EYE); set(p, 27, 12, '#ffffff'); rect(p, 29, 18, 2, 1, '#e0445a');
    return toCanvas(outline(p));
  }
  function llama(frame) {
    const p = P(32, 32);
    const hx = frame ? 21 : 23, hy = frame ? 5 : 6;
    for (const x of [6, 10, 17, 21]) rect(p, x, 23, 2, 8, '#d8cfbd');
    ball(p, 13, 19, 10, 6, M.crema);
    rect(p, 8, 14, 12, 3, M.rojo[1]); rect(p, 8, 17, 12, 1, M.amarillo[1]); rect(p, 8, 18, 12, 1, M.verde[1]); for (let x = 8; x < 20; x += 3) set(p, x, 15, '#ffffff');
    box(p, 19, 7, 5, 12, M.crema);
    ball(p, hx, hy, 4.5, 3.8, M.crema); ell(p, hx + 4, hy + 1.2, 2.2, 1.8, M.crema[1]);
    rect(p, hx - 2, hy - 7, 2, 4, M.crema[1]); rect(p, hx + 1, hy - 7, 2, 4, M.crema[1]);
    ball(p, hx - 1, hy - 8, 1.6, 1.4, M.rosa); ball(p, hx + 2, hy - 8, 1.6, 1.4, M.carmin);
    rect(p, hx + 1, hy - 1, 1, 2, EYE); set(p, hx + 5, hy + 1, EYE);
    if (frame) { ball(p, hx + 3, hy + 3, 2.2, 1.8, M.lima); }
    return toCanvas(outline(p));
  }
  function sicario(frame) {
    const p = P(32, 64);
    box(p, 11, 48, 5, 12, M.jean); box(p, 17, 48, 5, 12, M.jean); box(p, 9, 59, 7, 4, M.blanco); box(p, 17, 59, 7, 4, M.blanco);
    box(p, 9, 30, 14, 19, M.negro); rect(p, 15, 30, 2, 19, M.negro[2]); rect(p, 10, 44, 12, 2, M.rojo[1]);
    ball(p, 16, 22, 7, 7, M.morena); rect(p, 9, 22, 14, 6, '#2c3e5c'); for (let x = 10; x < 22; x += 3) set(p, x, 25, '#ffffff');
    ball(p, 16, 17, 7.5, 4, M.negro); rect(p, 16, 17, 11, 2, M.negro[1]);
    rect(p, 18, 20, 2, 2, EYE);
    const rx = frame ? -1 : 0;
    box(p, 20 + rx, 34, 8, 3, M.negro); box(p, 26 + rx, 32, 4, 5, M.morena); rect(p, 27 + rx, 30, 5, 3, '#3a3d46'); rect(p, 30 + rx, 30, 2, 2, '#23252b');
    return toCanvas(outline(p));
  }
  function huaico() {
    const p = P(32, 32);
    rect(p, 0, 0, 32, 26, '#6d4a2a');
    ball(p, 8, 8, 7, 6, M.marron); ball(p, 22, 7, 8, 6, ['#b0a28c', '#857760', '#574b3a']); ball(p, 14, 17, 8, 6, M.marron); ball(p, 26, 19, 5, 5, ['#b0a28c', '#857760', '#574b3a']);
    ell(p, 16, 28, 8, 4, '#4a3018'); ell(p, 16, 27, 5, 2.5, '#21140a');
    for (const x of [9, 16, 23]) rect(p, x, 26, 1, 4, '#6d4a2a');
    return toCanvas(outline(p));
  }
  function dinamita() {
    const p = P(96, 96);
    for (let i = 0; i < 3; i++) { box(p, 28 + i * 13, 30, 12, 50, M.rojo); rect(p, 31 + i * 13, 34, 2, 42, M.rojo[0]); }
    box(p, 24, 44, 48, 6, M.marron); box(p, 24, 66, 48, 6, M.marron);
    rect(p, 30 + 13, 34, 8, 3, '#f7f0e0'); line(p, 47, 30, 52, 18, '#2b2b2b', 2); line(p, 52, 18, 58, 12, '#2b2b2b', 2);
    ball(p, 60, 10, 4, 4, M.amarillo); set(p, 64, 6, '#ffffff'); set(p, 56, 5, M.naranja[1]); set(p, 66, 12, M.naranja[1]);
    return toCanvas(outline(p));
  }
  function vientoIcon() {
    const p = P(48, 48);
    ball(p, 18, 22, 13, 11, M.blanco); ball(p, 10, 18, 7, 6, M.blanco); ball(p, 26, 15, 8, 7, M.blanco);
    rect(p, 13, 20, 2, 3, EYE); rect(p, 21, 20, 2, 3, EYE); ell(p, 28, 26, 3, 2.4, '#5b6b8a'); set(p, 11, 26, '#f7a8b8'); set(p, 24, 26, '#f7a8b8');
    for (const [y, l] of [[18, 12], [26, 14], [34, 10]]) { rect(p, 33, y, l, 2, '#bfefff'); set(p, 33 + l, y - 1, '#bfefff'); }
    return toCanvas(outline(p));
  }

  // ---------- Comidas (20x20) ----------
  function food(k) {
    const p = P(22, 22);
    if (k === 'picarones') {
      for (const [cx, cy] of [[8, 12], [14, 9]]) { ball(p, cx, cy, 6.5, 5, ['#e9a860', '#c77a33', '#8a4d1a']); ell(p, cx, cy, 2.4, 1.8, 0); }
      ell(p, 8, 12, 2.4, 1.8, 0); line(p, 4, 7, 17, 5, '#5a2a0a'); line(p, 5, 15, 18, 12, '#6e3510');
    } else if (k === 'ceviche') {
      ell(p, 11, 13, 9, 6, '#ffffff'); ell(p, 11, 15, 8, 4, M.azul[1]); ell(p, 11, 11, 8, 3.4, '#f4efe4');
      rect(p, 6, 10, 3, 2, '#ffffff'); rect(p, 11, 9, 3, 2, '#ffffff'); line(p, 7, 12, 11, 10, M.morado[1]); line(p, 12, 12, 16, 10, M.morado[1]);
      set(p, 9, 9, M.verde[1]); set(p, 15, 11, M.verde[1]); ball(p, 17, 7, 3, 3, M.verde); ball(p, 4, 9, 2.4, 2.4, M.naranja);
    } else if (k === 'rocoto') {
      ball(p, 11, 13, 8, 7.5, M.rojo); ell(p, 11, 7, 6, 2.2, '#8a5a33'); ell(p, 11, 6.5, 4.5, 1.4, '#fff4d6'); rect(p, 10, 1, 2, 4, M.verde[1]); set(p, 12, 1, M.verde[1]);
    } else if (k === 'chicha') {
      rect(p, 5, 3, 12, 17, '#e6f6fb'); rect(p, 6, 7, 10, 12, M.morado[1]); rect(p, 6, 7, 10, 2, M.morado[0]); rect(p, 7, 10, 2, 2, '#ffffff');
      ball(p, 16, 6, 3, 3, M.lima); rect(p, 5, 19, 12, 2, M.gris[1]);
    } else if (k === 'pollo') {
      ell(p, 11, 18, 10, 3, '#ffffff');
      ball(p, 9, 11, 7, 6, ['#f4b25a', '#c9761f', '#7e4410']); rect(p, 14, 13, 5, 2, '#f2e0c0'); ball(p, 19, 13, 2, 2, '#fff4e0');
      for (const x of [3, 6, 15, 18]) rect(p, x, 14, 2, 5, M.amarillo[1]);
    }
    return toCanvas(outline(p));
  }

  // ---------- Bandera y efectos ----------
  function bandera(frame) {
    const p = P(28, 20);
    for (let x = 0; x < 26; x++) {
      const dy = Math.round(Math.sin(x / 5 + frame * 2.1) * 1.4);
      const col = x < 9 ? M.rojo : x < 17 ? M.blanco : M.rojo;
      for (let y = 2; y < 16; y++) set(p, x + 1, y + dy, y === 2 ? col[0] : y === 15 ? col[2] : col[1]);
    }
    ell(p, 14, 9 + Math.round(Math.sin(14 / 5 + frame * 2.1) * 1.4), 2.4, 2.8, M.verde[1]);
    set(p, 14, 9 + Math.round(Math.sin(14 / 5 + frame * 2.1) * 1.4), M.amarillo[1]);
    return toCanvas(outline(p));
  }
  function simple(w, h, fn) { const p = P(w, h); fn(p); return toCanvas(outline(p)); }
  const escupitajo = () => simple(14, 14, (p) => { ball(p, 7, 7, 5.5, 5, M.lima); set(p, 5, 5, '#ffffff'); set(p, 6, 5, '#ffffff'); });
  const bala = () => simple(14, 8, (p) => { rect(p, 1, 3, 7, 2, M.naranja[1]); ball(p, 9, 4, 3.5, 2.5, ['#ffffff', '#fff3a0', '#e0a020']); });
  const roca = () => simple(16, 16, (p) => { ball(p, 8, 8, 6.5, 6, M.marron); set(p, 6, 5, '#e0b890'); });
  const corazon = () => simple(12, 11, (p) => { ball(p, 4, 4, 3, 3, M.rosa); ball(p, 8, 4, 3, 3, M.rosa); for (let i = 0; i < 5; i++) rect(p, 2 + i, 5 + i, 8 - i * 2, 1, M.rosa[1]); });
  const estrella = () => simple(12, 12, (p) => { rect(p, 5, 1, 2, 10, M.amarillo[1]); rect(p, 1, 5, 10, 2, M.amarillo[1]); rect(p, 3, 3, 6, 6, M.amarillo[0]); });
  const piedra = () => simple(10, 10, (p) => ball(p, 5, 5, 4, 3.6, M.gris));
  const mano = () => simple(18, 20, (p) => {
    rect(p, 5, 1, 3, 10, '#ffffff'); rect(p, 8, 5, 3, 7, '#ffffff'); rect(p, 11, 6, 3, 6, '#ffffff'); rect(p, 14, 7, 2, 5, '#ffffff');
    rect(p, 3, 9, 3, 4, '#ffffff'); rect(p, 4, 11, 12, 5, '#ffffff'); rect(p, 5, 15, 10, 3, '#c9c9d6');
  });

  // ---------- Caché y API ----------
  const cache = {};
  const memo = (k, fn) => cache[k] || (cache[k] = fn());
  const CHAR_IDS = ['vedette', 'congresista', 'presidente', 'alcalde', 'chola', 'futbolista', 'condor', 'comico'];
  function char(id, frame = 0, flipped = false) {
    const f = ((frame % 4) + 4) % 4;
    return memo(`c|${id}|${f}|${flipped}`, () => {
      const base = memo(`c|${id}|${f}|false`, () => (id === 'condor' ? condorChar(f) : chibi(f, CHAR_DEF[id] || CHAR_DEF.congresista)));
      return flipped ? flip(base) : base;
    });
  }
  const ITEM_ART = { adobe, viga, colchon, chicha, totora, condor: () => condorPerch(0), tuna, parrilla, cable, combi, nectar, perro: () => perro(0), llama: () => llama(0), sicario: () => sicario(0), huaico, dinamita };
  // Arte del objeto según su rotación (ya girado/volteado).
  function item(id, rot = 0, frame = 0) {
    return memo(`i|${id}|${rot}|${frame}`, () => {
      if (id === 'viento') return document.createElement('canvas');
      let base;
      if (id === 'perro') base = memo(`i|perro|b${frame}`, () => perro(frame));
      else if (id === 'llama') base = memo(`i|llama|b${frame}`, () => llama(frame));
      else if (id === 'sicario') base = memo(`i|sicario|b${frame}`, () => sicario(frame));
      else if (id === 'condor') base = memo(`i|condor|b${frame}`, () => condorPerch(frame));
      else base = memo(`i|${id}|base`, ITEM_ART[id]);
      if ((id === 'viga' || id === 'cable') && rot % 2 === 1) return rot90(base);
      if (['llama', 'sicario', 'nectar', 'perro'].includes(id) && rot === 1) return flip(base);
      return base;
    });
  }
  function icon(id) { return memo(`icon|${id}`, () => (id === 'viento' ? vientoIcon() : item(id, 0))); }
  const FX = { escupitajo, bala, roca, corazon, estrella, piedra, mano };
  function fx(k) { return memo(`fx|${k}`, FX[k]); }
  function foodArt(k) { return memo(`f|${k}`, () => food(k)); }
  function flag(frame) { return memo(`flag|${((frame % 3) + 3) % 3}`, () => bandera(((frame % 3) + 3) % 3)); }
  function tinted(src, color, key) { return memo(`t|${key}|${color}`, () => tint(src, color)); }
  function url(src, s = 2) { const k = src.__url || (src.__url = {}); return k[s] || (k[s] = scaled(src, s).toDataURL()); }
  // Brillo suave (degradado radial) para luces: fuego, chispas, disparos, bandera.
  function glow(color) {
    return memo(`g|${color}`, () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color); g.addColorStop(0.35, color.replace(/[\d.]+\)$/, (a) => `${parseFloat(a) * 0.45})`)); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c;
    });
  }
  return { char, item, icon, fx, foodArt, flag, tinted, url, glow, adj, CHAR_IDS, M, P, set, rect, ell, box, ball, line, outline, toCanvas, rnd };
})();
