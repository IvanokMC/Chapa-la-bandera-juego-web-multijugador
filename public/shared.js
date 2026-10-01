// Datos y reglas compartidas entre el servidor (Node) y el navegador.
(function (root) {
  'use strict';
  const T = 16, COLS = 56, ROWS = 30;
  const R = (x, y, w, h) => ({ x, y, w, h });

  // Mapas en casillas (56x30). start/flag = [columna, fila del piso]. foods = casillas donde puede aparecer comida.
  // Física de referencia: salto ≈ 3.6 casillas de alto y ≈ 5 de largo.
  const MAPS = [
    { id: 'plaza', name: 'Plaza de Armas del Cusco', desc: 'La Catedral, la Compañía, la pileta del Inca y los portales.',
      solids: [R(0, 24, 9, 6), R(12, 24, 6, 6), R(20, 22, 3, 1), R(24, 25, 10, 5), R(26, 22, 4, 3), R(34, 22, 3, 1), R(39, 24, 5, 6), R(46, 22, 10, 8),
        R(5, 17, 6, 1), R(15, 15, 4, 1), R(24, 13, 4, 1), R(33, 15, 4, 1), R(41, 17, 4, 1)],
      spikes: [], water: [], start: [3, 24], flag: [51, 22], foods: [[21, 21], [28, 21], [35, 21], [25, 12], [42, 23]] },
    { id: 'hatun', name: 'Calle Hatun Rumiyoq', desc: 'Muros incas y la piedra de los 12 ángulos. Mucho sube y baja.',
      solids: [R(0, 25, 8, 5), R(10, 23, 4, 7), R(16, 20, 3, 10), R(21, 23, 5, 7), R(28, 20, 2, 10), R(32, 22, 4, 1), R(38, 19, 3, 1),
        R(43, 21, 4, 9), R(49, 19, 7, 11), R(10, 15, 4, 1), R(22, 13, 3, 1), R(33, 14, 3, 1)],
      spikes: [], water: [], start: [3, 25], flag: [52, 19], foods: [[12, 22], [23, 22], [33, 21], [23, 12], [39, 18]] },
    { id: 'lima', name: 'Lima: Costa Verde', desc: 'Acantilados, parapentes y el mar. No te caigas al agua.',
      solids: [R(0, 23, 8, 7), R(11, 25, 5, 3), R(18, 22, 3, 1), R(23, 25, 7, 3), R(32, 22, 3, 1), R(37, 20, 3, 1), R(42, 23, 4, 5), R(48, 20, 8, 10),
        R(12, 17, 4, 1), R(26, 16, 4, 1)],
      spikes: [], water: [R(0, 28, 56, 2)], start: [3, 23], flag: [52, 20], foods: [[13, 24], [19, 21], [26, 24], [27, 15], [38, 19]] },
    { id: 'machupicchu', name: 'Machu Picchu', desc: 'Andenes en las nubes. La bandera está en la cima.',
      solids: [R(0, 26, 7, 4), R(7, 24, 4, 6), R(11, 22, 4, 8), R(18, 21, 3, 1), R(24, 19, 3, 1), R(29, 21, 4, 1), R(35, 18, 3, 1),
        R(39, 16, 3, 1), R(43, 14, 2, 1), R(45, 13, 11, 1), R(48, 14, 5, 16), R(20, 27, 14, 3)],
      spikes: [], water: [], start: [3, 26], flag: [52, 13], foods: [[19, 20], [25, 18], [30, 20], [40, 15], [26, 26]] },
    { id: 'nazca', name: 'Líneas de Nazca', desc: 'El colibrí gigante en el desierto. Cuidado con las tunas.',
      solids: [R(0, 24, 10, 6), R(13, 24, 6, 6), R(21, 21, 3, 1), R(27, 24, 7, 6), R(37, 22, 3, 1), R(43, 24, 4, 6), R(49, 23, 7, 7),
        R(8, 18, 4, 1), R(30, 17, 4, 1)],
      spikes: [R(15, 23, 1, 1), R(30, 23, 1, 1)], water: [], start: [3, 24], flag: [53, 23], foods: [[14, 23], [22, 20], [31, 16], [38, 21], [44, 23]] },
    { id: 'paititi', name: 'Paititi, la ciudad perdida', desc: 'El templo de oro escondido en la selva. Abajo, el río.',
      solids: [R(0, 22, 7, 8), R(9, 23, 4, 1), R(15, 21, 3, 1), R(20, 23, 3, 1), R(25, 20, 3, 1), R(30, 18, 3, 1), R(35, 21, 3, 1),
        R(40, 18, 3, 1), R(45, 16, 11, 12), R(17, 15, 3, 1)],
      spikes: [], water: [R(0, 28, 56, 2)], start: [3, 22], flag: [51, 16], foods: [[10, 22], [21, 22], [26, 19], [18, 14], [36, 20]] },
  ];

  // Objetos de la caja.
  // cat: bloque (ayuda) | trampa | especial. rots = cuántas orientaciones tiene. swap = girar intercambia ancho/alto.
  const ITEMS = {
    adobe: { name: 'Adobe', w: 1, h: 1, kind: 'solid', cat: 'bloque', desc: 'Bloque de barro. Piso o pared.' },
    viga: { name: 'Viga de fierro', w: 3, h: 1, kind: 'solid', cat: 'bloque', rots: 2, swap: true, desc: 'Plataforma larga. Girada es pared.' },
    colchon: { name: 'Colchón viejo', w: 2, h: 1, kind: 'bounce', cat: 'bloque', desc: 'Rebota altísimo.' },
    chicha: { name: 'Chicha derramada', w: 3, h: 1, kind: 'slip', cat: 'bloque', desc: 'Plataforma resbalosa.' },
    totora: { name: 'Balsa de totora', w: 2, h: 1, kind: 'mover', cat: 'bloque', rots: 2, desc: 'Sube y baja. Girada, va de lado.' },
    condor: { name: 'Cóndor jetpack', w: 1, h: 1, kind: 'jetpack', cat: 'especial', desc: 'Tócalo y te lleva volando: mantén saltar.' },
    viento: { name: 'Viento Paracas', w: 3, h: 3, kind: 'wind', cat: 'especial', rots: 4, desc: 'Zona de viento que empuja. Gíralo para cambiar de dirección.' },
    tuna: { name: 'Tuna con espinas', w: 1, h: 1, kind: 'deadly', cat: 'trampa', desc: 'Cactus. Si lo tocas, pierdes.' },
    parrilla: { name: 'Parrilla anticuchera', w: 1, h: 1, kind: 'deadly', cat: 'trampa', desc: 'Quema. Pero huele rico.' },
    cable: { name: 'Cable pelado', w: 3, h: 1, kind: 'blinker', cat: 'trampa', rots: 2, swap: true, desc: 'Se electrifica a ratos. Mira cuándo chispea.' },
    combi: { name: 'Combi desbocada', w: 2, h: 1, kind: 'moverDeadly', cat: 'trampa', rots: 2, desc: 'Va y viene sin frenar. Girada, sube y baja.' },
    nectar: { name: 'Carro de néctar', w: 2, h: 1, kind: 'walker', cat: 'trampa', rots: 2, desc: 'Avanza solo. Si hay hueco se cae. Te atropella.' },
    perro: { name: 'Perro chusco', w: 1, h: 1, kind: 'patrol', cat: 'trampa', rots: 2, desc: 'Patrulla su plataforma de lado a lado. Muerde.' },
    llama: { name: 'Llama escupidora', w: 1, h: 1, kind: 'shooter', cat: 'trampa', rots: 2, desc: 'Escupe cada 2 s. Gírala para cambiar de lado.' },
    sicario: { name: 'Sicario de Los Pulpos', w: 1, h: 2, kind: 'shooter', cat: 'trampa', rots: 2, desc: 'Dispara ráfagas rápidas. Gíralo para cambiar de lado.' },
    huaico: { name: 'Quebrada activa', w: 1, h: 1, kind: 'dropper', cat: 'trampa', desc: 'Suelta piedras hacia abajo.' },
    dinamita: { name: 'Dinamita', w: 1, h: 1, kind: 'bomb', cat: 'especial', desc: 'Borra un objeto del mapa. Solo sale desde la ronda 3 si nadie llegó.' },
  };
  const ITEM_POOL = [['adobe', 3], ['viga', 3], ['colchon', 2], ['chicha', 1], ['totora', 2], ['condor', 2], ['viento', 2], ['tuna', 2],
    ['parrilla', 2], ['cable', 2], ['combi', 2], ['nectar', 2], ['perro', 2], ['llama', 2], ['sicario', 2], ['huaico', 2]]; // la dinamita no sale al azar
  // Nombre de cada orientación (para la ayuda en pantalla).
  const ROT_NAMES = {
    viga: ['horizontal', 'vertical'], totora: ['sube y baja', 'de lado a lado'], combi: ['de lado a lado', 'sube y baja'],
    cable: ['horizontal', 'vertical'], nectar: ['avanza a la derecha', 'avanza a la izquierda'], perro: ['empieza a la derecha', 'empieza a la izquierda'],
    llama: ['escupe a la derecha', 'escupe a la izquierda'], sicario: ['dispara a la derecha', 'dispara a la izquierda'],
    viento: ['sopla a la derecha', 'sopla hacia arriba', 'sopla a la izquierda', 'sopla hacia abajo'],
  };

  // Personajes (caricaturas de arquetipos peruanos). cd = recarga del poder en segundos.
  const CHARS = [
    { id: 'vedette', name: 'La Vedette', power: 'Beso volado', pdesc: 'Deja paralizado al rival más cercano.', cd: 8, color: '#ff4f6d' },
    { id: 'congresista', name: 'El Congresista', power: 'Inmunidad parlamentaria', pdesc: 'Unos segundos inmune a trampas y poderes.', cd: 12, color: '#9aa8ff' },
    { id: 'presidente', name: 'El Presidente', power: 'Vacancia exprés', pdesc: 'Se teletransporta hacia adelante.', cd: 5, color: '#ff9b3d' },
    { id: 'alcalde', name: 'El Alcalde', power: 'Obra inaugurada', pdesc: 'Crea una plataforma temporal bajo sus pies.', cd: 9, color: '#ffd23f' },
    { id: 'chola', name: 'La Chola Cusqueña', power: "Warak'a", pdesc: 'Lanza una piedra que empuja al rival de adelante.', cd: 5, color: '#e36bd8' },
    { id: 'futbolista', name: 'El Futbolista', power: 'Chalaca', pdesc: 'Súper salto, incluso en el aire.', cd: 4, color: '#f4f4f4' },
    { id: 'condor', name: 'El Cóndor', power: 'Vuelo andino', pdesc: 'Planea lento por unos segundos.', cd: 7, color: '#5ee0a0' },
    { id: 'comico', name: 'El Cómico Ambulante', power: 'Chiste malo', pdesc: 'Invierte los controles de los rivales cercanos.', cd: 10, color: '#4fc3ff' },
  ];

  const FOODS = {
    picarones: { name: 'Picarones', desc: 'Doble salto' },
    ceviche: { name: 'Ceviche', desc: 'Más velocidad' },
    rocoto: { name: 'Rocoto relleno', desc: 'Escudo: te salva de una trampa' },
    chicha: { name: 'Chicha morada', desc: 'Salto más alto' },
    pollo: { name: 'Pollo a la brasa', desc: '+5 puntos si llegas a la bandera' },
  };

  const RULES = {
    maxPlayers: 8, winOptions: [30, 50, 80], defaultWin: 50,
    pickTime: 15, placeTime: 22, runTime: 60, countdown: 3, scoreTime: 6, endTime: 14,
    finishPts: 10, firstPts: 5, polloPts: 5,
  };

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  const rotsOf = (id) => (ITEMS[id] && ITEMS[id].rots) || 1;
  function itemRect(it) {
    const d = ITEMS[it.id];
    const swap = d.swap && (it.rot % 2 === 1);
    return { x: it.x, y: it.y, w: swap ? d.h : d.w, h: swap ? d.w : d.h };
  }
  function protectedZones(map) {
    return [R(map.start[0] - 2, map.start[1] - 4, 5, 4), R(map.flag[0] - 1, map.flag[1] - 4, 3, 4)];
  }
  function validPlacement(map, placed, it) {
    if (!ITEMS[it.id]) return false;
    if (!Number.isInteger(it.rot) || it.rot < 0 || it.rot >= rotsOf(it.id)) return false;
    const r = itemRect(it);
    if (!Number.isInteger(r.x) || !Number.isInteger(r.y)) return false;
    // la dinamita tiene que caer encima de un objeto colocado
    if (ITEMS[it.id].kind === 'bomb') return r.x >= 0 && r.y >= 0 && r.x < COLS && r.y < ROWS && placed.some((o) => overlap(r, itemRect(o)));
    if (r.x < 0 || r.y < 0 || r.x + r.w > COLS || r.y + r.h > ROWS) return false;
    for (const z of protectedZones(map)) if (overlap(r, z)) return false;
    for (const s of map.solids) if (overlap(r, s)) return false;
    for (const s of map.spikes) if (overlap(r, s)) return false;
    for (const o of placed) if (overlap(r, itemRect(o))) return false;
    return true;
  }

  const API = { T, COLS, ROWS, MAPS, ITEMS, ITEM_POOL, ROT_NAMES, CHARS, FOODS, RULES, overlap, itemRect, rotsOf, protectedZones, validPlacement };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SHARED = API;
})(typeof window !== 'undefined' ? window : globalThis);
