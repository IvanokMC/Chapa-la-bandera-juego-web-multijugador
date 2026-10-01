# ¡Chapa la Bandera! · Perú Party 🇵🇪

Juego de plataformas **multijugador en línea (hasta 8 jugadores)** al estilo *Ultimate Chicken Horse*, con temática peruana. En cada ronda abres una caja de objetos, colocas trampas o bloques en el mapa y luego todos corren a **chapar la bandera del Perú**. Las trampas se acumulan ronda tras ronda.

## Cómo se juega

1. **La caja:** aparecen objetos; elige uno antes de que te lo ganen.
2. **Colócalo** en el mapa: un bloque para ayudarte o una trampa para los demás. Las líneas guía muestran cómo se mueve cada trampa.
3. **¡Corre!** Todos van por la bandera. Llegar da 10 puntos, el primero suma +5 y el pollo a la brasa +5.
   - Si **todos** llegan ("muy fácil") o **nadie** llega, nadie suma.
4. Gana quien llegue primero a la meta (30, 50 u 80 puntos).

Desde la ronda 3, si nadie llegó en la ronda anterior, la caja trae **dinamita** para borrar un objeto del mapa.

### Personajes y poderes

| Personaje | Poder |
|---|---|
| La Vedette | Beso volado: paraliza al rival más cercano |
| El Congresista | Inmunidad parlamentaria: inmune a trampas y poderes |
| El Presidente | Vacancia exprés: teletransporte hacia adelante |
| El Alcalde | Obra inaugurada: plataforma temporal |
| La Chola Cusqueña | Warak'a: piedra que empuja al rival |
| El Futbolista | Chalaca: súper salto |
| El Cóndor | Vuelo andino: planea |
| El Cómico Ambulante | Chiste malo: invierte los controles de los rivales |

### Objetos

Adobe, viga de fierro, colchón viejo, chicha derramada, balsa de totora, cóndor jetpack, viento Paracas, tuna, parrilla anticuchera, cable pelado, combi desbocada, carro de néctar, perro chusco, llama escupidora, sicario, quebrada (huaico) y dinamita.

### Comidas

Picarones (doble salto), ceviche (velocidad), rocoto relleno (escudo), chicha morada (salto alto) y pollo a la brasa (+5 puntos).

### Mapas

Plaza de Armas del Cusco, Calle Hatun Rumiyoq, Lima: Costa Verde, Machu Picchu, Líneas de Nazca y Paititi.

## Controles

- **PC:** A/D o flechas para moverse, Espacio/W para saltar (mantener = más alto, contra la pared = rebote), E/Shift para el poder. Al colocar: clic para poner, R/Q o clic derecho para girar, rueda para zoom, H para mostrar la ayuda.
- **Celular:** pad de dirección ◀ ▶ (se puede deslizar), botones de saltar y poder. Al colocar: arrastra para mover, pellizca para hacer zoom, botón "Colocar" y botón "Girar".

## Ejecutar en local

Requiere **Node.js 18 o superior**.

```bash
cd server
npm install
node server.js
```

Luego abre <http://127.0.0.1:3100/>. Para probar con varios jugadores, abre varias pestañas y únete con el código de la sala.

El puerto se cambia con la variable de entorno `PORT`.

## Estructura

```
public/
  index.html   interfaz
  style.css    estilos (incluye la versión para celular)
  shared.js    datos y reglas compartidos por servidor y navegador: mapas, objetos, personajes, puntos
  art.js       pixel art dibujado en código (personajes, objetos, comidas, efectos)
  scenery.js   fondos de los mapas, plataformas y animaciones del fondo
  game.js      cliente: red, física del plataformero, cámara, poderes, dibujo y sonido
server/
  server.js    servidor Node + WebSocket: salas, fases de la ronda, colocación y puntaje
  package.json
```

El servidor manda en las fases, la colocación de objetos y el puntaje. Cada navegador simula solo a su propio jugador. Las trampas que se mueven o disparan se calculan a partir del tiempo de la ronda, así que todos los clientes las ven igual sin sincronizarlas.

## Publicar en un servidor

El servidor de Node escucha en `127.0.0.1:3100`. Para publicarlo, pon delante un proxy inverso (por ejemplo Nginx) que reenvíe una ruta como `/bandera/` y deje pasar las cabeceras de WebSocket (`Upgrade` y `Connection`). En el repositorio `juegardo-deploy` hay una configuración de ejemplo y scripts de instalación.
# Chapa-la-bandera-juego-web-multijugador
# Chapa-la-bandera-juego-web-multijugador
