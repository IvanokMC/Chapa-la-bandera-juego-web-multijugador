// Fondos y plataformas de los mapas, dibujados en alta resolución (2 px de arte por px del mundo).
const SCENERY = (() => {
  'use strict';
  const { T, COLS, ROWS, MAPS } = SHARED;
  const S = 2, TA = T * S, BW = COLS * TA, BH = ROWS * TA;
  const OUT = '#1b1426';
  const rnd = ART.rnd;

  // ---------- Ayudas de dibujo ----------
  function fill(x, c, a, b, w, h) { x.fillStyle = c; x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h)); }
  function sky(x, cols, y0 = 0, y1 = BH) {
    const n = cols.length, bh = (y1 - y0) / n;
    cols.forEach((c, i) => fill(x, c, 0, y0 + i * bh, BW, bh + 1));
    // tramado (dither) entre bandas
    for (let i = 1; i < n; i++) {
      const y = Math.round(y0 + i * bh);
      x.fillStyle = cols[i - 1];
      for (let k = 0; k < BW; k += 4) { x.fillRect(k, y, 2, 2); x.fillRect(k + 2, y + 4, 2, 2); }
    }
  }
  function circ(x, cx, cy, r, c) {
    x.fillStyle = c;
    for (let y = -r; y <= r; y += 2) { const w = Math.floor(Math.sqrt(r * r - y * y)); x.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 2); }
  }
  function ridge(x, c, base, amp, f1, f2, seed, from = 0, to = BW) {
    x.fillStyle = c;
    for (let i = from; i < to; i += 2) { const h = base - (Math.sin(i * f1 + seed) * amp + Math.sin(i * f2 + seed * 2.3) * amp * 0.45); x.fillRect(i, Math.floor(h / 2) * 2, 2, BH); }
  }
  function cloud(x, cx, cy, s, c, sh) {
    circ(x, cx, cy + 4, 18 * s, sh); circ(x, cx - 22 * s, cy + 8, 13 * s, sh); circ(x, cx + 24 * s, cy + 8, 14 * s, sh);
    circ(x, cx, cy, 18 * s, c); circ(x, cx - 22 * s, cy + 5, 12 * s, c); circ(x, cx + 24 * s, cy + 5, 13 * s, c);
    fill(x, sh, cx - 34 * s, cy + 14 * s, 70 * s, 4);
  }
  function tri(x, c, ax, ay, bx, by, cx2) { // triángulo con base horizontal (ay=by) y punta en (cx2, cy)
    const cy = arguments[7];
    x.fillStyle = c;
    for (let y = Math.min(ay, cy); y <= Math.max(ay, cy); y += 2) {
      const k = (y - cy) / (ay - cy), l = cx2 + (ax - cx2) * k, r = cx2 + (bx - cx2) * k;
      x.fillRect(Math.round(l), y, Math.round(r - l), 2);
    }
  }
  function arch(x, ax, ay, w, h, c) { fill(x, c, ax, ay + w / 2, w, h - w / 2); circ(x, ax + w / 2, ay + w / 2, w / 2, c); }
  function haze(x, c) { x.fillStyle = c; x.fillRect(0, 0, BW, BH); }
  function lineP(x, pts, c, t = 4) {
    x.fillStyle = c;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
      for (let k = 0; k <= n; k++) x.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), t, t);
    }
  }

  // ---------- Temas ----------
  const THEMES = {
    plaza: {
      scenery(x) {
        sky(x, ['#5aaee6', '#72bcea', '#8dcaef', '#a9d8f3', '#c6e6f7'], 0, 620);
        fill(x, '#c6e6f7', 0, 620, BW, BH);
        const r = rnd(11);
        cloud(x, 300, 110, 1.3, '#ffffff', '#d6ecf7'); cloud(x, 1050, 70, 1, '#ffffff', '#d6ecf7'); cloud(x, 1540, 150, 1.2, '#ffffff', '#d6ecf7');
        ridge(x, '#a9bfd3', 430, 50, 0.004, 0.011, 1);
        ridge(x, '#8fb07a', 520, 38, 0.006, 0.017, 4);
        for (let i = 0; i < 260; i++) { // casitas en los cerros
          const hx = Math.floor(r() * BW), hy = 470 + Math.floor(r() * 120);
          fill(x, '#efe9dc', hx, hy, 6, 4); fill(x, '#b8462e', hx - 1, hy - 2, 8, 2);
        }
        fill(x, '#f4f1ea', 1330, 470, 4, 12); fill(x, '#f4f1ea', 1340, 470, 4, 12); fill(x, '#f4f1ea', 1350, 470, 8, 4); // "VIVA EL PERÚ" lejano
        // Catedral
        const stone = '#a98568', stoneD = '#8a6a50', stoneL = '#c29e80';
        fill(x, stone, 230, 440, 470, 420); fill(x, stoneD, 660, 440, 40, 420); fill(x, stoneL, 230, 440, 470, 6);
        fill(x, '#b99474', 380, 360, 180, 500); fill(x, stoneL, 380, 360, 180, 6);
        tri(x, '#b99474', 380, 360, 560, 360, 470, 310);
        arch(x, 430, 620, 80, 240, '#3a2a22'); arch(x, 440, 636, 60, 224, '#553e30');
        for (const cx of [398, 530]) { fill(x, stoneL, cx, 400, 10, 460); fill(x, stoneD, cx + 10, 400, 4, 460); }
        arch(x, 450, 420, 40, 70, '#3a2a22');
        for (const tx of [170, 690]) {
          fill(x, '#9a7458', tx, 290, 100, 570); fill(x, '#7c5c44', tx + 84, 290, 16, 570); fill(x, stoneL, tx, 290, 100, 6);
          arch(x, tx + 22, 330, 56, 90, '#3a2a22'); fill(x, '#e0b24a', tx + 44, 360, 12, 22);
          fill(x, '#8a6a50', tx - 6, 282, 112, 10); circ(x, tx + 50, 262, 34, '#8a6a50'); circ(x, tx + 44, 256, 22, '#a07a5c');
          fill(x, '#8a6a50', tx + 44, 196, 12, 40); fill(x, '#e0b24a', tx + 48, 170, 4, 28); fill(x, '#e0b24a', tx + 40, 178, 20, 4);
          for (let wy = 470; wy < 800; wy += 110) arch(x, tx + 34, wy, 32, 52, '#4a3629');
        }
        fill(x, '#e0b24a', 466, 280, 8, 34); fill(x, '#e0b24a', 456, 290, 28, 6);
        // Bandera del Tawantinsuyu
        fill(x, '#6b6b6b', 812, 470, 6, 400);
        ['#e03a3a', '#f28c28', '#f6d42a', '#3fae4a', '#4fb5e6', '#2f55b8', '#8a4bbf'].forEach((c, i) => fill(x, c, 818, 474 + i * 8, 86, 8));
        // La Compañía de Jesús
        const cs = '#bb9676', csD = '#977455', csL = '#d6b18f';
        fill(x, cs, 1240, 450, 290, 410); fill(x, csD, 1500, 450, 30, 410); fill(x, csL, 1240, 450, 290, 6);
        arch(x, 1350, 600, 70, 260, '#3a2a22'); arch(x, 1330, 470, 110, 120, '#8e6c50'); arch(x, 1350, 490, 70, 90, '#3a2a22');
        for (const cx of [1300, 1450]) { fill(x, csL, cx, 470, 12, 390); fill(x, csD, cx + 12, 470, 4, 390); }
        for (const tx of [1170, 1520]) {
          fill(x, '#a8845f', tx, 330, 90, 530); fill(x, '#86674a', tx + 76, 330, 14, 530); fill(x, csL, tx, 330, 90, 6);
          for (const wy of [360, 470, 590]) arch(x, tx + 24, wy, 42, 64, '#3a2a22');
          circ(x, tx + 45, 300, 36, '#9a7858'); circ(x, tx + 38, 294, 24, '#b8946e'); fill(x, '#9a7858', tx + 36, 230, 18, 40);
          circ(x, tx + 45, 226, 12, '#b8946e'); fill(x, '#e0b24a', tx + 43, 196, 4, 22); fill(x, '#e0b24a', tx + 37, 202, 16, 4);
        }
        // Portales con balcones de madera
        for (const [ax, aw] of [[0, 160], [1600, 192]]) {
          fill(x, '#b5452f', ax, 560, aw, 16); fill(x, '#8e3322', ax, 574, aw, 6);
          fill(x, '#ece4d6', ax, 580, aw, 300); fill(x, '#cfc6b6', ax, 580, aw, 6);
          fill(x, '#6e4226', ax + 10, 610, aw - 20, 60); for (let k = ax + 14; k < ax + aw - 14; k += 10) fill(x, '#8e5a34', k, 616, 5, 50);
          fill(x, '#4a2c18', ax + 6, 668, aw - 12, 8);
          for (let k = ax + 8; k < ax + aw - 40; k += 50) arch(x, k, 740, 40, 140, '#4a3a30');
        }
        // Pileta con el Inca dorado
        fill(x, '#9c9c9c', 900, 820, 200, 40); fill(x, '#bdbdbd', 900, 820, 200, 6); fill(x, '#7a7a7a', 900, 854, 200, 6);
        fill(x, '#a8a8a8', 975, 740, 50, 80); fill(x, '#c8c8c8', 975, 740, 50, 6);
        fill(x, '#e7b52c', 988, 680, 24, 60); circ(x, 1000, 672, 12, '#e7b52c'); fill(x, '#fff39a', 990, 684, 6, 40); fill(x, '#e7b52c', 1010, 690, 18, 6);
        fill(x, '#e7b52c', 1024, 660, 4, 36); fill(x, '#a6751a', 1006, 700, 6, 40);
        for (const [dx, dy] of [[-40, 800], [40, 800], [-70, 812], [70, 812]]) circ(x, 1000 + dx, dy, 6, '#bfe8ff');
        for (const bx of [860, 1130, 60, 1690]) { circ(x, bx, 880, 26, '#3f8a45'); circ(x, bx - 8, 872, 16, '#5aa85a'); }
        haze(x, 'rgba(210,235,248,0.22)');
      },
      tile(x, px, py, n, h) {
        fill(x, '#8a7d70', px, py, TA, TA);
        const r = rnd(Math.floor(h * 1e6));
        const cut = 10 + Math.floor(r() * 12), cut2 = 8 + Math.floor(r() * 16);
        fill(x, '#a09385', px + 2, py + 2, cut - 3, 13); fill(x, '#9a8c7e', px + cut + 1, py + 2, TA - cut - 3, 13);
        fill(x, '#958779', px + 2, py + 17, cut2 - 3, 13); fill(x, '#a39688', px + cut2 + 1, py + 17, TA - cut2 - 3, 13);
        fill(x, '#b8ab9c', px + 2, py + 2, cut - 3, 2); fill(x, '#b8ab9c', px + cut2 + 1, py + 17, TA - cut2 - 3, 2);
        fill(x, '#5e5249', px, py + 15, TA, 2); fill(x, '#5e5249', px + cut - 1, py, 2, 15); fill(x, '#5e5249', px + cut2 - 1, py + 15, 2, 17);
        if (n.top) {
          fill(x, '#b3a89a', px, py, TA, 8);
          for (let k = 0; k < TA; k += 8) { fill(x, '#cfc5b8', px + k + 1, py + 1, 5, 3); fill(x, '#6e6358', px + k, py + 6, 8, 2); }
          if (h < 0.4) { fill(x, '#6fa04e', px + 6, py - 4, 2, 4); fill(x, '#6fa04e', px + 9, py - 6, 2, 6); fill(x, '#8cc063', px + 12, py - 3, 2, 3); }
        }
      },
    },
    hatun: {
      scenery(x) {
        sky(x, ['#5aaee6', '#79c0ec', '#9ad0f1'], 0, 220);
        cloud(x, 500, 80, 1, '#ffffff', '#d6ecf7'); cloud(x, 1400, 120, 1.2, '#ffffff', '#d6ecf7');
        // pisos coloniales encima del muro inca
        for (let bx = 0; bx < BW; bx += 300) {
          fill(x, '#b5452f', bx, 196, 300, 18); fill(x, '#8e3322', bx, 212, 300, 6);
          fill(x, '#f2ece0', bx, 218, 300, 180); fill(x, '#d8d0c0', bx + 296, 218, 4, 180);
          fill(x, '#3f7fbf', bx + 60, 270, 120, 70); fill(x, '#2c5f96', bx + 60, 334, 120, 8);
          for (let k = bx + 64; k < bx + 176; k += 12) fill(x, '#6fa6e0', k, 276, 6, 56);
          fill(x, '#355d88', bx + 210, 250, 50, 90); fill(x, '#4a78a8', bx + 214, 254, 42, 80);
        }
        // muro inca de piedras poligonales
        fill(x, '#8f9489', 0, 398, BW, BH);
        const r = rnd(21);
        for (let y = 400; y < BH; y += 0) {
          const hh = 60 + Math.floor(r() * 50);
          for (let bx = -Math.floor(r() * 60); bx < BW;) {
            const w = 70 + Math.floor(r() * 110);
            const base = ['#b7bcb4', '#aeb3aa', '#bfc4bb', '#a7aca2'][Math.floor(r() * 4)];
            fill(x, base, bx + 4, y + 4, w - 8, hh - 8); fill(x, base, bx + 8, y + 2, w - 16, hh - 4); fill(x, base, bx + 2, y + 8, w - 4, hh - 16);
            fill(x, '#d0d5cc', bx + 8, y + 4, w - 18, 4); fill(x, '#959a8f', bx + 8, y + hh - 8, w - 16, 4);
            bx += w;
          }
          y += hh;
        }
        // la piedra de los 12 ángulos
        const cx = 900, cy = 640, pts = [];
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.2, rr = 95 + (i % 3) * 16; pts.push([cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr * 0.8]); }
        x.fillStyle = '#7d8278'; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill();
        x.fillStyle = '#c9cec3'; x.beginPath(); pts.forEach(([a, b], i) => { const aa = cx + (a - cx) * 0.93, bb = cy + (b - cy) * 0.93; i ? x.lineTo(aa, bb) : x.moveTo(aa, bb); }); x.closePath(); x.fill();
        x.fillStyle = '#dde2d7'; x.beginPath(); pts.slice(6, 11).forEach(([a, b], i) => { const aa = cx + (a - cx) * 0.8, bb = cy + (b - cy) * 0.8; i ? x.lineTo(aa, bb) : x.moveTo(aa, bb); }); x.lineTo(cx, cy); x.closePath(); x.fill();
        haze(x, 'rgba(235,242,248,0.3)');
      },
      tile(x, px, py, n, h) {
        fill(x, '#3a2c22', px, py, TA, TA);
        const r = rnd(Math.floor(h * 1e6) + 5);
        const a = 8 + Math.floor(r() * 16);
        fill(x, '#7a6250', px + 2, py + 2, a - 3, TA - 4); fill(x, '#6f5848', px + a + 1, py + 2, TA - a - 3, 18); fill(x, '#86705c', px + a + 1, py + 22, TA - a - 3, 8);
        fill(x, '#a38a70', px + 3, py + 2, a - 6, 2); fill(x, '#a38a70', px + a + 2, py + 2, TA - a - 6, 2);
        fill(x, '#4e3c30', px + 2, py + TA - 4, a - 4, 2);
        if (n.top) { fill(x, '#b39a7c', px, py, TA, 6); fill(x, '#d9c2a0', px, py, TA, 2); fill(x, '#4e3c30', px, py + 6, TA, 2); }
      },
    },
    lima: {
      scenery(x) {
        sky(x, ['#98a1ab', '#a7afb8', '#b6bdc5', '#c5cbd1', '#d3d8dc'], 0, 560);
        // parapentes
        for (const [cx, cy, c1, c2] of [[340, 120, '#ff5a5a', '#ffd23f'], [980, 80, '#4fc3ff', '#ffffff'], [1500, 150, '#5ee06a', '#ff9f40']]) {
          for (let i = -30; i <= 30; i += 2) fill(x, i % 6 === 0 ? c2 : c1, cx + i, cy + Math.round((i * i) / 90), 2, 8);
          fill(x, '#2b2635', cx - 1, cy + 30, 2, 12); fill(x, '#2b2635', cx - 26, cy + 12, 1, 22); fill(x, '#2b2635', cx + 26, cy + 12, 1, 22);
        }
        // mar
        fill(x, '#5a8fb0', 0, 560, BW, BH); fill(x, '#6ea2c1', 0, 560, BW, 10);
        for (let y = 600; y < BH; y += 30) for (let k = (y * 7) % 60; k < BW; k += 80) fill(x, '#a9d0e6', k, y, 26, 2);
        // acantilado con malla verde
        const cliffTop = (i) => 300 + Math.sin(i * 0.004) * 30 + Math.sin(i * 0.013) * 12;
        x.fillStyle = '#a8927a';
        for (let i = 0; i < BW; i += 2) { const top = cliffTop(i); x.fillRect(i, Math.round(top), 2, 580 - top); }
        for (let y = 330; y < 560; y += 22) for (let i = 0; i < BW; i += 2) { if (y > cliffTop(i) + 8) fill(x, (y / 22) % 2 ? '#957f68' : '#b8a38a', i, y + Math.round(Math.sin(i * 0.02 + y) * 3), 2, 3); }
        // malla verde de contención de la Costa Verde
        for (let k = -600; k < BW; k += 22) {
          for (let s = 0; s < 260; s += 2) {
            for (const [px, py] of [[k + s, 300 + s], [k + 260 - s, 300 + s]]) if (px >= 0 && px < BW && py > cliffTop(px) + 10 && py < 556) fill(x, '#6f9a58', px, py, 2, 2);
          }
        }
        // pista de la Costa Verde
        fill(x, '#3b3b45', 0, 560, BW, 40); fill(x, '#e8c547', 0, 578, BW, 0);
        for (let k = 0; k < BW; k += 60) fill(x, '#e8c547', k, 578, 30, 3);
        [[200, '#d62828'], [640, '#3b72c9'], [1100, '#f6c90e'], [1480, '#f4f1ea']].forEach(([cx, c]) => { fill(x, c, cx, 566, 36, 12); fill(x, '#1b1b1f', cx + 4, 576, 8, 6); fill(x, '#1b1b1f', cx + 24, 576, 8, 6); });
        // Miraflores arriba del acantilado + faro
        const r = rnd(33);
        for (let bx = 0; bx < BW; bx += 70 + Math.floor(r() * 40)) {
          const bw = 50 + Math.floor(r() * 50), bh = 90 + Math.floor(r() * 170), top = 300 - bh;
          fill(x, r() < 0.5 ? '#c8c3b8' : '#b5bcc5', bx, top, bw, bh + 20);
          for (let wy = top + 10; wy < 300; wy += 16) for (let wx = bx + 6; wx < bx + bw - 8; wx += 12) fill(x, r() < 0.15 ? '#f1d98a' : '#7d8894', wx, wy, 6, 8);
        }
        fill(x, '#f4f1ea', 1380, 170, 34, 140); fill(x, '#d62828', 1380, 210, 34, 16); fill(x, '#d62828', 1380, 260, 34, 16); fill(x, '#3b3b45', 1374, 160, 46, 12); fill(x, '#f6d42a', 1388, 148, 18, 12);
        haze(x, 'rgba(220,225,230,0.25)');
      },
      tile(x, px, py, n, h) {
        fill(x, '#8e8e94', px, py, TA, TA);
        fill(x, '#76767c', px, py + 15, TA, 2); fill(x, '#76767c', px + (h < 0.5 ? 10 : 20), py, 2, 15); fill(x, '#76767c', px + (h < 0.5 ? 22 : 6), py + 17, 2, 15);
        fill(x, '#a6a6ac', px + 2, py + 2, 6, 2); fill(x, '#a6a6ac', px + 14, py + 20, 8, 2);
        if (n.top) { fill(x, '#3b3b45', px, py, TA, 8); fill(x, '#55555f', px, py, TA, 2); fill(x, '#f2c94c', px, py + 8, TA, 3); fill(x, '#1b1b1f', px + (Math.floor(px / TA) % 2 ? 0 : 16), py + 8, 16, 3); }
      },
    },
    machupicchu: {
      scenery(x) {
        sky(x, ['#4f9fde', '#6aafe3', '#86bfe9', '#a3cfef', '#c1e0f5']);
        cloud(x, 260, 120, 1.1, '#ffffff', '#d9ecf8'); cloud(x, 860, 60, 0.9, '#ffffff', '#d9ecf8');
        ridge(x, '#95a3cf', 420, 60, 0.005, 0.013, 2);
        x.fillStyle = '#6f9a86';
        for (let i = 0; i < BW; i += 2) { const d = Math.abs(i - 1300), hh = Math.max(0, 560 - d * 1.2 + Math.sin(i * 0.03) * 10); x.fillRect(i, BH - hh, 2, hh); }
        x.fillStyle = '#3f8052';
        for (let i = 0; i < BW; i += 2) { const d = Math.abs(i - 1250), hh = Math.max(0, 790 - d * 2.4 + Math.sin(i * 0.05) * 8); x.fillRect(i, BH - hh, 2, hh); }
        x.fillStyle = '#2f6440';
        for (let i = 1250; i < BW; i += 2) { const d = Math.abs(i - 1250), hh = Math.max(0, 770 - d * 2.4); x.fillRect(i, BH - hh, 2, hh); }
        for (let y = 300; y < 900; y += 28) { const w = Math.max(0, (y - 170) * 0.8); fill(x, '#4f9a62', 1250 - w / 2, y, w, 2); }
        // ruinas
        for (let i = 0; i < 7; i++) {
          const bx = 120 + i * 120, by = 640 - (i % 3) * 30;
          fill(x, '#b3aa98', bx, by, 90, 70); fill(x, '#cfc6b3', bx, by, 90, 4); fill(x, '#8e8676', bx + 84, by, 6, 70);
          for (const wx of [14, 50]) { x.fillStyle = '#4a4438'; x.beginPath(); x.moveTo(bx + wx, by + 50); x.lineTo(bx + wx + 22, by + 50); x.lineTo(bx + wx + 18, by + 20); x.lineTo(bx + wx + 4, by + 20); x.closePath(); x.fill(); }
          if (i % 2) tri(x, '#c9a24a', bx - 6, by, bx + 96, by, bx + 45, by - 46);
        }
        for (const [cx, cy] of [[1560, 700], [420, 560]]) { fill(x, '#f4f1ea', cx, cy, 30, 16); fill(x, '#f4f1ea', cx + 24, cy - 22, 8, 26); fill(x, '#f4f1ea', cx + 26, cy - 30, 10, 8); for (const lx of [2, 10, 18, 26]) fill(x, '#e8e2d4', cx + lx, cy + 16, 3, 12); }
        fill(x, 'rgba(255,255,255,0.35)', 0, 760, BW, 30); fill(x, 'rgba(255,255,255,0.25)', 0, 800, BW, 20);
        haze(x, 'rgba(215,235,248,0.2)');
      },
      tile(x, px, py, n, h) {
        fill(x, '#a39b8a', px, py, TA, TA);
        fill(x, '#7c7566', px, py + 14, TA, 2); fill(x, '#7c7566', px, py + 30, TA, 2);
        fill(x, '#7c7566', px + (h < 0.5 ? 10 : 20), py, 2, 14); fill(x, '#7c7566', px + (h < 0.5 ? 24 : 6), py + 16, 2, 14);
        fill(x, '#bdb5a3', px + 2, py + 2, 7, 2); fill(x, '#bdb5a3', px + 12, py + 18, 9, 2);
        if (n.top) {
          fill(x, '#5caa4a', px, py, TA, 7); fill(x, '#7fcc62', px, py, TA, 2); fill(x, '#3f7f35', px, py + 7, TA, 2);
          for (let k = 2; k < TA; k += 7) fill(x, '#3f7f35', px + k, py + 9, 2, 3 + ((k * 3) % 4));
        }
      },
    },
    nazca: {
      scenery(x) {
        sky(x, ['#f29e6a', '#f5b07c', '#f7c08f', '#f9d0a6', '#fbdfbd']);
        circ(x, 1420, 200, 70, '#ffe7a6'); circ(x, 1420, 200, 54, '#fff3c8');
        ridge(x, '#e2ac72', 520, 40, 0.004, 0.012, 2);
        ridge(x, '#d39a5f', 600, 26, 0.007, 0.02, 5);
        ridge(x, '#c4884f', 700, 18, 0.01, 0.03, 8);
        // el colibrí de Nazca
        const k = 2, ox = 330, oy = 380;
        const pts = [[250, 250], [262, 232], [276, 226], [292, 232], [298, 246], [290, 256], [276, 262], [262, 262], [250, 250], [236, 244], [212, 230], [196, 232], [216, 246], [238, 254], [250, 250], [262, 268], [256, 290], [268, 300], [276, 282], [276, 262], [292, 232], [316, 212], [338, 204], [360, 206], [334, 220], [298, 246]]
          .map(([a, b]) => [ox + (a - 196) * k * 1.6, oy + (b - 204) * k * 1.4]);
        lineP(x, pts, '#f7dcb2', 4);
        for (let i = 0; i < 6; i++) lineP(x, [[1000, 760 + i * 16], [1700, 700 + i * 16]], '#e7c190', 2);
        // mirador
        fill(x, '#5b4a3c', 1580, 560, 8, 240); fill(x, '#5b4a3c', 1640, 560, 8, 240); for (let y = 580; y < 800; y += 40) { fill(x, '#5b4a3c', 1580, y, 68, 4); }
        fill(x, '#6e5a48', 1570, 548, 88, 14);
        for (const [cx, cy] of [[120, 760], [760, 800], [1250, 770]]) { fill(x, '#6f8a4a', cx, cy - 60, 12, 60); fill(x, '#6f8a4a', cx - 16, cy - 44, 10, 24); fill(x, '#6f8a4a', cx + 16, cy - 52, 10, 30); }
        haze(x, 'rgba(255,230,200,0.18)');
      },
      tile(x, px, py, n, h) {
        fill(x, '#c48956', px, py, TA, TA);
        fill(x, '#ae7442', px, py + 10, TA, 3); fill(x, '#d69b66', px, py + 18, TA, 2); fill(x, '#ae7442', px, py + 26, TA, 2);
        const r = rnd(Math.floor(h * 1e6) + 9); fill(x, '#9a6538', px + Math.floor(r() * 24), py + 14 + Math.floor(r() * 10), 6, 4);
        if (n.top) { fill(x, '#ebc28a', px, py, TA, 8); fill(x, '#f7dcb0', px, py, TA, 2); fill(x, '#d6a56c', px + 4, py + 4, 10, 2); fill(x, '#d6a56c', px + 20, py + 5, 8, 2); fill(x, '#a8723f', px, py + 8, TA, 2); }
      },
    },
    paititi: {
      scenery(x) {
        sky(x, ['#0f3322', '#133d2a', '#184832', '#1d533a', '#225f43']);
        x.fillStyle = 'rgba(255,240,160,0.07)';
        for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(200 + i * 330, 0); x.lineTo(280 + i * 330, 0); x.lineTo(520 + i * 330, BH); x.lineTo(400 + i * 330, BH); x.closePath(); x.fill(); }
        const r = rnd(44);
        for (let i = 0; i < 26; i++) { const tx = Math.floor(r() * BW), th = 300 + Math.floor(r() * 400); fill(x, '#173f2a', tx, BH - th, 14, th); circ(x, tx + 7, BH - th, 40 + Math.floor(r() * 30), '#1c4a32'); }
        // templo de oro escalonado
        const gx = 720, gy = 300;
        for (let s = 0; s < 6; s++) { const w = 560 - s * 80; fill(x, '#b88f2c', gx + s * 40, gy + 460 - s * 70, w, 70); fill(x, '#d8b048', gx + s * 40, gy + 460 - s * 70, w, 6); fill(x, '#8a6a1c', gx + s * 40 + w - 10, gy + 460 - s * 70, 10, 70); }
        fill(x, '#2a1d08', gx + 240, gy + 110, 80, 90); fill(x, '#f2d36a', gx + 262, gy + 70, 36, 36); circ(x, gx + 280, gy + 88, 12, '#fff3b0');
        for (const sx of [gx + 80, gx + 460]) { fill(x, '#c9a032', sx, gy + 400, 24, 60); circ(x, sx + 12, gy + 392, 16, '#c9a032'); fill(x, '#2a1d08', sx + 6, gy + 388, 4, 4); fill(x, '#2a1d08', sx + 14, gy + 388, 4, 4); }
        for (let v = 0; v < 30; v++) { const vx = Math.floor(r() * BW), vl = 80 + Math.floor(r() * 260); fill(x, '#2f7a45', vx, 0, 4, vl); for (let k = 12; k < vl; k += 24) fill(x, '#46a060', vx - 6, k, 8, 4); }
        for (let b = 0; b < 8; b++) { const bx = Math.floor(r() * BW), by = 120 + Math.floor(r() * 400), c = ['#e0303a', '#3b72c9', '#f6c90e'][b % 3]; fill(x, c, bx, by, 8, 6); fill(x, c, bx - 6, by + 2, 6, 3); fill(x, '#f6c90e', bx + 8, by + 2, 3, 2); }
        for (let f = 0; f < 30; f++) fill(x, '#d8ff8a', Math.floor(r() * BW), Math.floor(r() * BH), 2, 2);
        haze(x, 'rgba(8,36,22,0.34)');
      },
      tile(x, px, py, n, h) {
        fill(x, '#c79c2e', px, py, TA, TA);
        fill(x, '#8f6c18', px, py + 15, TA, 2); fill(x, '#8f6c18', px, py + 31, TA, 1);
        fill(x, '#8f6c18', px + (h < 0.5 ? 12 : 22), py, 2, 15); fill(x, '#8f6c18', px + (h < 0.5 ? 26 : 6), py + 17, 2, 14);
        fill(x, '#ecc95a', px + 2, py + 2, 8, 2); fill(x, '#ecc95a', px + 16, py + 19, 6, 2);
        if (n.top) {
          fill(x, '#3f8f47', px, py, TA, 7); fill(x, '#6fc25e', px, py, TA, 2);
          for (let k = 3; k < TA; k += 9) fill(x, '#3f8f47', px + k, py + 7, 3, 4 + ((k * 5) % 7));
        }
      },
    },
  };

  // ---------- Construcción del fondo de cada mapa ----------
  const cache = {};
  // Devuelve { back: fondo lejano, terrain: plataformas con transparencia }.
  function build(mi) {
    if (cache[mi]) return cache[mi];
    const map = MAPS[mi], th = THEMES[map.id];
    const back = document.createElement('canvas'); back.width = BW; back.height = BH;
    th.scenery(back.getContext('2d'));
    const c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const x = c.getContext('2d');
    const solid = new Set();
    for (const s of map.solids) for (let i = s.x; i < s.x + s.w; i++) for (let j = s.y; j < s.y + s.h; j++) solid.add(`${i},${j}`);
    const has = (i, j) => solid.has(`${i},${j}`);
    // sombra proyectada sobre el fondo
    x.fillStyle = 'rgba(10,6,20,0.28)';
    for (const key of solid) { const [i, j] = key.split(',').map(Number); x.fillRect(i * TA + 10, j * TA + 10, TA, TA); }
    for (const key of solid) {
      const [i, j] = key.split(',').map(Number);
      const hh = ((i * 73856093) ^ (j * 19349663)) >>> 0;
      th.tile(x, i * TA, j * TA, { top: !has(i, j - 1), bottom: !has(i, j + 1), left: !has(i - 1, j), right: !has(i + 1, j) }, (hh % 10000) / 10000);
    }
    // contorno de las plataformas
    x.fillStyle = OUT;
    for (const key of solid) {
      const [i, j] = key.split(',').map(Number), px = i * TA, py = j * TA;
      if (!has(i, j - 1)) x.fillRect(px, py, TA, 2);
      if (!has(i, j + 1)) x.fillRect(px, py + TA - 2, TA, 2);
      if (!has(i - 1, j)) x.fillRect(px, py, 2, TA);
      if (!has(i + 1, j)) x.fillRect(px + TA - 2, py, 2, TA);
    }
    for (const s of map.spikes) for (let i = s.x; i < s.x + s.w; i++) x.drawImage(ART.item('tuna'), i * TA, s.y * TA);
    return (cache[mi] = { back, terrain: c });
  }
  // Fondo completo en un solo lienzo (para miniaturas y la pantalla de inicio).
  const flat = {};
  function flatten(mi) {
    if (flat[mi]) return flat[mi];
    const b = build(mi), c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const x = c.getContext('2d'); x.drawImage(b.back, 0, 0); x.drawImage(b.terrain, 0, 0);
    return (flat[mi] = c);
  }

  // ---------- Vida en el fondo (nubes, aves, parapentes, luciérnagas) ----------
  const W = COLS * T, H = ROWS * T;
  const clouds = [];
  function cloudArt(s) {
    const c = document.createElement('canvas'); c.width = 200; c.height = 70;
    const x = c.getContext('2d');
    cloud(x, 100, 34, s, '#ffffff', '#d4e8f4');
    return c;
  }
  function drift(v, speed, span) { return ((v + speed) % span + span) % span; }
  function bird(ctx, bx, by, t, col, s = 1) {
    const up = Math.floor(t * 8) % 2;
    ctx.fillStyle = col;
    ctx.fillRect(bx - 3 * s, by - (up ? 1.5 : 0) * s, 3 * s, 1 * s); ctx.fillRect(bx, by, 1 * s, 1 * s); ctx.fillRect(bx + 1 * s, by - (up ? 1.5 : 0) * s, 3 * s, 1 * s);
  }
  function ambient(ctx, id, t) {
    if (!clouds.length) for (const s of [0.9, 1.2, 0.7]) clouds.push(cloudArt(s));
    const cloudy = { plaza: 1, hatun: 1, machupicchu: 1, lima: 0.6 }[id];
    if (cloudy) {
      clouds.forEach((cv, i) => {
        const x = drift(i * 330, t * (5 + i * 2.5), W + 220) - 110, y = 18 + i * 22;
        ctx.globalAlpha = 0.85 * cloudy; ctx.drawImage(cv, x, y, 100, 35); ctx.globalAlpha = 1;
      });
    }
    if (id === 'plaza' || id === 'hatun') for (let i = 0; i < 4; i++) bird(ctx, drift(i * 230, t * (26 + i * 4), W + 60) - 30, 60 + i * 14 + Math.sin(t * 2 + i) * 4, t + i, '#4a4458');
    if (id === 'machupicchu') {
      const cx = drift(0, t * 14, W + 120) - 60, cy = 90 + Math.sin(t * 0.7) * 20;
      ctx.drawImage(ART.char('condor', 3), cx, cy, 18, 24);
      for (let i = 0; i < 3; i++) bird(ctx, drift(i * 300 + 100, t * 20, W + 60) - 30, 50 + i * 18, t + i, '#3d4a66');
    }
    if (id === 'lima') {
      for (let i = 0; i < 3; i++) {
        const px = drift(i * 300, t * (6 + i * 3), W + 80) - 40, py = 40 + i * 26 + Math.sin(t + i) * 5, cols = ['#ff5a5a', '#4fc3ff', '#5ee06a'];
        ctx.fillStyle = cols[i]; for (let k = -14; k <= 14; k += 1) ctx.fillRect(px + k, py + (k * k) / 40, 1, 3);
        ctx.fillStyle = '#2b2635'; ctx.fillRect(px - 0.5, py + 14, 1.5, 5); ctx.fillRect(px - 12, py + 6, 0.5, 10); ctx.fillRect(px + 12, py + 6, 0.5, 10);
      }
      for (let i = 0; i < 4; i++) bird(ctx, drift(i * 210, -t * 22, W + 60) - 30, 100 + i * 10, t + i, '#f4f1ea');
    }
    if (id === 'nazca') {
      ctx.fillStyle = 'rgba(255,236,200,0.7)';
      for (let i = 0; i < 26; i++) ctx.fillRect(drift(i * 67, t * (30 + (i % 5) * 8), W), 150 + ((i * 53) % 280) + Math.sin(t * 3 + i) * 3, 1, 1);
    }
    if (id === 'paititi') {
      for (let i = 0; i < 26; i++) {
        const on = Math.sin(t * 2.5 + i * 1.7) > 0.2;
        if (!on) continue;
        const fx = (i * 97) % W + Math.sin(t * 0.8 + i) * 10, fy = 40 + ((i * 61) % 360) + Math.cos(t * 0.9 + i) * 8;
        ctx.drawImage(ART.glow('rgba(210,255,120,0.9)'), fx - 4, fy - 4, 8, 8); ctx.fillStyle = '#eaffb0'; ctx.fillRect(fx - 0.5, fy - 0.5, 1, 1);
      }
      for (let i = 0; i < 2; i++) { const px = drift(i * 400, t * 34, W + 80) - 40, py = 90 + i * 60 + Math.sin(t * 3) * 6; ctx.fillStyle = ['#e0303a', '#3b72c9'][i]; ctx.fillRect(px, py, 4, 2.5); ctx.fillStyle = '#f6c90e'; ctx.fillRect(px + 4, py + 0.5, 1.5, 1); ctx.fillRect(px - 3, py + (Math.floor(t * 8) % 2 ? -1.5 : 1), 3, 1); }
    }
  }
  // Viñeteado y tono de color por mapa (se dibuja encima de todo el mundo).
  const GRADE = { plaza: 'rgba(255,225,170,0.07)', hatun: 'rgba(255,225,170,0.06)', lima: 'rgba(170,190,215,0.08)', machupicchu: 'rgba(190,225,255,0.06)', nazca: 'rgba(255,170,110,0.1)', paititi: 'rgba(110,255,160,0.05)' };
  const grades = {};
  function grade(id) {
    if (grades[id]) return grades[id];
    const c = document.createElement('canvas'); c.width = BW / 2; c.height = BH / 2;
    const x = c.getContext('2d'), w = c.width, h = c.height;
    const lg = x.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, GRADE[id]); lg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lg; x.fillRect(0, 0, w, h);
    const rg = x.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, w * 0.62);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(12,6,28,0.38)');
    x.fillStyle = rg; x.fillRect(0, 0, w, h);
    return (grades[id] = c);
  }

  const thumbs = {};
  function thumb(mi) {
    if (thumbs[mi]) return thumbs[mi];
    const c = document.createElement('canvas'); c.width = 224; c.height = 120;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(flatten(mi), 0, 0, 224, 120);
    const m = MAPS[mi]; x.drawImage(ART.flag(0), Math.round(((m.flag[0] + 0.5) * TA * 224) / BW), Math.round(((m.flag[1] - 3) * TA * 120) / BH), 10, 7);
    return (thumbs[mi] = c.toDataURL());
  }
  return { build, flatten, ambient, grade, thumb, BW, BH, S, TA };
})();
