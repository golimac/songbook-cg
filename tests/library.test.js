// Biblioteca: portada, Todas, Artistas, Pendientes, buscador de la barra y visto recientemente.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/' });
const w = dom.window, d = w.document;
w.scrollTo = () => {};
Object.assign(globalThis, { window: w, document: d, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
const { start } = await import('../public/js/app.js');

const now = Date.now();
const mk = (id, title, artist, status, doubts, mins) => ({ id, title, artist, key: 'Am', status, doubts, updatedAt: now - mins * 60000 });
const list = [
  mk('a', 'Años', 'Silvio Rodríguez', 'revisada', 0, 5),
  mk('b', 'Ojalá', 'Silvio Rodríguez', 'dudas', 2, 60 * 30),
  mk('c', 'Ojalá', 'Silvio Rodríguez', 'pendiente', 0, 60 * 24 * 3),
  mk('d', 'Zapatos', 'Joaquín Sabina', 'pendiente', 0, 10),
  mk('e', '¿Quién fue?', '', 'revisada', 0, 20)
];
for (let i = 0; i < 25; i++) list.push(mk('x' + i, 'Canción ' + String.fromCharCode(66 + (i % 20)) + i, 'Grupo ' + (i % 3), 'pendiente', 0, 100 + i));

let chordCb = null; const saved = [];
const api = {
  onAuth(cb) { cb({ uid: 'u', email: 'yo@example.test' }); return () => {}; },
  async signIn() {}, async signOut() {},
  subscribeSongs(ok) { setTimeout(() => ok(list.map((s) => ({ ...s }))), 0); return () => {}; },
  async getBody() { return { body: '', diagrams: {} }; },
  subscribeChords(ok2) { chordCb = ok2; return () => {}; },
  saveChord(n, sh) { saved.push([n, sh]); return Promise.resolve(); }, deleteChord(n) { saved.push([n, null]); return Promise.resolve(); },
  saveSong() { return Promise.resolve(); }, deleteSong() { return Promise.resolve(); }, saveMany() { return Promise.resolve(); }
};

const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
const wait = () => new Promise((r) => setTimeout(r, 5));
const fails = [];
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fails.push(n); };
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

start(api); await wait();
w.Element.prototype.scrollIntoView = function () { w.__scrolledTo = this.id; };

// ---- portada ----
ok('la portada resume el total en la cabecera', /30 canciones/.test($('.hero').textContent));
ok('las cajas muestran hasta 7 filas y "Ver más"', ['b-new', 'b-pend', 'b-todas'].every((c) => $$('.' + c + ' .mini').length === 7) && $$('.b-art .mini').length === 6 && ['nuevas', 'pendientes', 'todas', 'artistas'].every((p) => /Ver más/.test($('[data-lib="' + p + '"]').textContent)));
ok('Pendientes anuncia 28 por revisar', /28 por revisar/.test($('.b-pend header').textContent));
ok('Nuevas muestra la tonalidad y no el tiempo', !/hace/.test($('.b-new').textContent) && $$('.b-new .mini .mi-m').some((n) => /^[A-G][#b]?m?/.test(n.textContent)));
click($('[data-lib="nuevas"]'));
ok('Ver más de Nuevas lista todas, la más reciente primero', /Nuevas30/.test($('.crumb h1').textContent) && $$('.item').length === 30);
click($('[data-lib="home"]'));
const th0 = d.documentElement.getAttribute('data-theme');
click($('#theme'));
ok('el interruptor cambia el tema y lo recuerda', d.documentElement.getAttribute('data-theme') !== th0 && w.localStorage.getItem('songbookcg.tema') === d.documentElement.getAttribute('data-theme'));
click($('#theme'));
ok('un segundo toque lo devuelve', d.documentElement.getAttribute('data-theme') === th0);
ok('la portada no muestra avance ni conteos de revisadas o dudas', !$('.prog') && !/revisadas|con dudas/.test($('#lib').textContent));
ok('la portada no lista canciones', $$('.item').length === 0);
ok('sin historial "Visto recientemente" sigue visible con un aviso', /Visto recientemente/.test($('.seenbox').textContent) && !$('.vstrip') && /últimas canciones/.test($('.seenbox').textContent));
ok('fila de letras con las que existen activas', $$('.az').length === 27 && !$('[data-letter="Z"]').disabled && !$('[data-letter="K"]').disabled === false && $('[data-letter="Q"]').disabled === false);

// ---- letras ----
click($('[data-letter="Z"]'));
ok('una letra abre Todas y salta a ella', !!$('h2.lg#g-Z') && w.__scrolledTo === 'g-Z');

// ---- Todas ----
ok('Todas con letras, cuenta y versiones agrupadas', /Todas30/.test($('.crumb h1').textContent) && $$('.item').length === 30 && $$('h2.lg').length >= 4 && $('.vgroup .vg-l').textContent === '2 versiones' && $$('.vgroup .item').length === 2);
ok('"¿Quién fue?" cae en la Q y no en #', $$('h2.lg').some((h) => h.textContent === 'Q') && !$$('h2.lg').some((h) => h.textContent === '#'));
ok('con 24 o más canciones hay índice lateral', $$('.rail [data-jump]').length >= 4);
ok('el índice lateral salta a la letra', (() => { click($('.rail [data-jump="A"]')); return w.__scrolledTo === 'g-A'; })());
ok('Todas muestra el estado de cada canción', $$('.item').some((i) => /Con dudas/.test(i.textContent)));

// ---- visto recientemente ----
click($$('.item').find((i) => /Zapatos/.test(i.textContent))); await wait();
ok('abrir una canción', !!$('#songBody'));
click($('#goHome'));
ok('el logo vuelve a la portada', !!$('[data-lib="todas"]') && $$('.item').length === 0);
ok('la portada muestra lo visto recientemente', $$('.vcard').length === 1 && /Zapatos/.test($('.vcard').textContent));
click($$('.item, .vcard')[0]); await wait();
click($('[data-act="back"]')); click($('#goHome'));
click($('[data-lib="todas"]'));
click($$('.item').find((i) => /Ojalá/.test(i.textContent))); await wait();
click($('#goHome'));
ok('lo último que abres va primero y sin repetir', $$('.vcard').length === 2 && /Ojalá/.test($$('.vcard')[0].textContent) && /Zapatos/.test($$('.vcard')[1].textContent));
click($('.vcard')); await wait();
ok('tocar una tarjeta abre la canción', !!$('#songBody'));

// ---- buscador de la barra ----
type($('#q'), 'silvio ojala');
ok('buscar desde una canción muestra resultados', !$('#songBody') && $$('.item').length === 2 && /2 resultados/.test($('#count').textContent));
type($('#q'), 'sabina');
ok('búsqueda por artista', $$('.item').length === 1 && /Zapatos/.test($('.item').textContent));
type($('#q'), 'zzzz');
ok('sin coincidencias lo dice', /No hay canciones que coincidan/.test($('#lib').textContent));
click($('[data-lib="clear"]'));
ok('limpiar la búsqueda vacía el cuadro y vuelve a la página', $('#q').value === '' && !!$('[data-lib="todas"]'));

// ---- Artistas ----
click($('[data-lib="artistas"]'));
const names = $$('.artist').map((a) => a.textContent.replace(/\s+/g, ' ').trim());
ok('directorio de artistas con su conteo y "Sin artista" al final', names.includes('Silvio Rodríguez3') && names.includes('Joaquín Sabina1') && names[names.length - 1] === 'Sin artista1');
ok('el directorio no lista canciones', $$('.item').length === 0);
click($$('.artist').find((a) => /Silvio/.test(a.textContent)));
ok('un artista muestra sus canciones', $$('.item').length === 3 && /Silvio Rodríguez3/.test($('.crumb h1').textContent));
ok('las dos versiones de Ojalá se agrupan', $$('.vgroup .item').length === 2);
click($('[data-lib="artistas"]'));
ok('volver regresa al directorio', $$('.artist').length > 3);

// ---- Pendientes ----
click($('[data-lib="home"]'));
click($('[data-lib="pendientes"]'));
ok('Pendientes: todo lo que no está revisado', $$('.item').length === 28 && !$$('.item').some((i) => /Revisada/.test(i.textContent)) && $$('.item').some((i) => /Con dudas/.test(i.textContent)));

// ---- biblioteca de acordes ----
click($('[data-lib="home"]'));
ok('la portada tiene la caja Acordes para el editor', !!$('.b-ch'));
click($('.b-ch .more'));
ok('la página Acordes ofrece el formulario al editor', !!$('#chAdd') && /Escribe el nombre/.test($('#lib').textContent));
$('#chName').value = 'zzz';
$('#chAdd').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
ok('un nombre que no es acorde se avisa', /No reconozco/.test($('#chMsg').textContent) && $('#dgModal').hidden);
$('#chName').value = 'Am7';
$('#chAdd').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
ok('un acorde válido abre el editor de diagramas', !$('#dgModal').hidden && /Am7/.test($('#dgTitle').textContent) && $('#dgDel').hidden);
click($('#dgSave'));
ok('guardar manda la forma a la biblioteca', saved.length === 1 && saved[0][0] === 'Am7' && saved[0][1].length === 1 && $('#dgModal').hidden);
ok('la tarjeta del acorde aparece en la página', $$('.chcard h3').some((h) => h.textContent === 'Am7') && $$('.chcard svg').length === 1);
chordCb([{ name: 'Am7', shapes: saved[0][1] }, { name: 'C4', shapes: [{ frets: [-1, 3, 3, 0, 1, 0], base: 1, barre: null }] }]);
ok('la suscripción reemplaza la biblioteca', $$('.chcard h3').map((h) => h.textContent).join() === 'C4,Am7');
click($('[data-chedit="C4"]'));
ok('Editar abre la forma guardada', !$('#dgModal').hidden && !$('#dgDel').hidden);
click($('#dgDel'));
ok('Quitar la última forma borra el acorde', saved[saved.length - 1][0] === 'C4' && saved[saved.length - 1][1] === null && $$('.chcard h3').map((h) => h.textContent).join() === 'Am7');
click($('[data-lib="home"]'));
click($('[data-lib="pendientes"]'));

// ---- editar bloquea el buscador ----
click($$('.item')[0]); await wait();
click($('[data-act="edit"]'));
type($('#q'), 'algo');
ok('al editar el buscador no actúa', !!$('#fBody') && $('#q').value === '' && !!$('.toast.err'));

console.log(fails.length ? '\nFALLARON:\n' + fails.join('\n') : '\nsin errores');
process.exitCode = fails.length ? 1 : 0;
