import { clampBox, dragBox, groupSongs, removeBox, zoomStyle, padBox, MIN_BOX } from '../public/js/photo.js';
let fail = 0;
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fail++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

let b = dragBox({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'move', 0.1, -0.5);
ok('mover queda dentro de la foto', near(b.x, 0.3) && near(b.y, 0) && near(b.w, 0.3));
b = dragBox({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'move', 2, 2);
ok('mover no se sale por el borde', near(b.x + b.w, 1) && near(b.y + b.h, 1));
b = dragBox({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'se', 0.1, 0.2);
ok('esquina inferior derecha crece', near(b.x, 0.2) && near(b.w, 0.4) && near(b.h, 0.5));
b = dragBox({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'nw', 0.1, 0.1);
ok('esquina superior izquierda achica sin mover la opuesta', near(b.x + b.w, 0.5) && near(b.y + b.h, 0.5) && near(b.w, 0.2));
b = dragBox({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'se', -1, -1);
ok('no baja del tamaño mínimo', near(b.w, MIN_BOX) && near(b.h, MIN_BOX));
ok('padBox no sale de la imagen', (() => { const p = padBox({ x: 0, y: 0.95, w: 0.2, h: 0.05 }, 0.02); return p.x === 0 && near(p.y + p.h, 1); })());

const boxes = [
  { title: 'A', continues: null }, { title: 'B', continues: null }, { title: 'A2', continues: 0 }, { title: 'A3', continues: 2 }
];
const g = groupSongs(boxes);
ok('agrupa continuaciones, también en cadena', JSON.stringify(g.map((x) => x.indices)) === '[[0,2,3],[1]]' && g[0].title === 'A');
ok('referencias rotas se tratan como inicio', groupSongs([{ title: 'X', continues: 7 }]).length === 1);
ok('un ciclo no cuelga', groupSongs([{ title: 'X', continues: 1 }, { title: 'Y', continues: 0 }]).length >= 1);

const r = removeBox(boxes, 0);
ok('borrar una raíz reasigna sus continuaciones', JSON.stringify(r.map((x) => x.continues)) === '[null,null,1]' || JSON.stringify(r.map((x) => x.continues)) === '[null,null,0]' ? true : false);
const r2 = removeBox([{ continues: null }, { continues: 0 }, { continues: 1 }], 1);
ok('borrar el del medio enlaza con el anterior', JSON.stringify(r2.map((x) => x.continues)) === '[null,0]');
const z = zoomStyle({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 });
ok('zoom: tamaño y posición de fondo', z.size === '200.00% auto' && z.pos === '100.00% 50.00%');
ok('clampBox corrige valores locos', (() => { const c = clampBox({ x: -1, y: 5, w: 3, h: 0 }); return c.x === 0 && c.w === 1 && c.h === MIN_BOX && c.y <= 1 - MIN_BOX; })());

console.log(fail ? '\n' + fail + ' pruebas fallaron' : '\ntodas las pruebas pasan');
process.exitCode = fail ? 1 : 0;
