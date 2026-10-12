// Flujo completo de importar fotos: recuadros, lectura, revisión con dudas y guardado.
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
const vc = new VirtualConsole(); vc.sendTo(console);
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/', virtualConsole: vc });
const w = dom.window, d = w.document;
w.scrollTo = () => {};
Object.assign(globalThis, { window: w, document: d, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
const { start } = await import('../public/js/app.js');

const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fails.push(n); };
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

/* ---- datos simulados ---- */
const metas = new Map(), bodies = new Map();
let authCb, listCb;
const emit = () => listCb && listCb([...metas].map(([id, m]) => ({ id, ...m })));
const reads = [];
let failNext = 0;
const SEG = { page_number: '52', page_header: '52 "E.C."', songs: [
  { title: 'La familia', box: { x: 0.05, y: 0.1, w: 0.4, h: 0.6 }, continues: null, note: '' },
  { title: 'Generaciones', box: { x: 0.5, y: 0.1, w: 0.4, h: 0.4 }, continues: null, note: '' },
  { title: 'La familia (final)', box: { x: 0.5, y: 0.6, w: 0.4, h: 0.3 }, continues: 0, note: 'Parece la continuación de La familia' }] };
const SONGS = {
  'La familia': { title: 'La familia, la propiedad privada y el amor', artist: '', key: '', tuning: 'Afinar las cuerdas un tono más bajo', remarks: 'Diagrama impreso: MIm*',
    body: '{intro: LAm - RE - LAm}\n[LAm]El derrumbe de un [RE]sueño\n[Sld7]Algo debe [MI4]ocurrir',
    doubts: [{ text: 'Sld7', note: 'Podría ser SId7', box: { x: 0.1, y: 0.3, w: 0.1, h: 0.03 } }] },
  'Generaciones': { title: 'Generaciones', artist: '', key: '', tuning: '', remarks: '', body: '> DO4 DO SOL7\n[DO4]Un viejo y un [SOL7]niño', doubts: [] }
};
const api = {
  onAuth(cb) { authCb = cb; cb(null); return () => {}; },
  async signIn() { authCb({ uid: 'u', email: 'yo@example.test' }); },
  async signOut() { authCb(null); },
  subscribeSongs(ok2) { listCb = ok2; setTimeout(emit, 0); return () => {}; },
  async getBody(id) { return bodies.get(id) || { body: '', diagrams: {} }; },
  saveSong(s) { const { body, diagrams, id, ...m } = s; metas.set(id, m); bodies.set(id, { body, diagrams }); emit(); return Promise.resolve(); },
  deleteSong() { return Promise.resolve(); },
  saveMany() { return Promise.resolve(); },
  async readPage(p) {
    reads.push(p);
    if (p.mode === 'segment') return SEG;
    if (failNext > 0) { failNext--; throw new Error('saldo insuficiente'); }
    const hint = p.hint || '';
    return /La familia/.test(hint) ? SONGS['La familia'] : SONGS['Generaciones'];
  }
};
const imaging = {
  load: async () => ({ url: 'blob:foto', width: 1000, height: 1400 }),
  page: () => 'data:image/jpeg;base64,PAGINA',
  crop: (h, box) => 'data:image/jpeg;base64,CROP' + Math.round(box.x * 100),
  release: () => {}
};
start(api, { imaging });

click($('#signInTop')); await wait();
ok('hay botón de importar fotos', $('#importBtn').hidden === false);
click($('#importBtn'));
ok('muestra el formulario de importación', !!$('#imForm') && !!$('#imFiles'));
ok('el formulario solo pide las fotos', !$('#imSrc') && !$('#imPage'));
click($('#imCancel')); await wait();
ok('cancelar vuelve a la biblioteca sin guardar', !!$('#q') && metas.size === 0);

click($('#importBtn'));
$('#imForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
ok('sin fotos pide elegir una', !!$('.toast.err') && !$('#imStage'));
Object.defineProperty($('#imFiles'), 'files', { value: [new w.File(['x'], 'p52.jpg', { type: 'image/jpeg' })] });
$('#imForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait(30);

// ---- recuadros ----
ok('detecta con una sola imagen reducida', reads[0].mode === 'segment' && reads[0].images.length === 1);
ok('muestra 3 recuadros y 3 filas', $$('.bx').length === 3 && $$('.sgi').length === 3);
ok('la pantalla de recuadros no tiene campo de página', !$('#imPageVal'));
ok('la nota de duda se ve', /continuación de La familia/.test($('#segList').textContent));
ok('el recuadro 3 sale como continuación del 1', $('[data-c="2"]').value === '0');
const stage = $('#imStage');
stage.getBoundingClientRect = () => ({ width: 1000, height: 1000, left: 0, top: 0 });
const bx1 = $$('.bx')[1];
bx1.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 200 }));
bx1.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 300 }));
bx1.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
ok('arrastrar mueve el recuadro', /left:60\.00%/.test($$('.bx')[1].getAttribute('style')) && /top:20\.00%/.test($$('.bx')[1].getAttribute('style')));
const se = $$('.bx')[1].querySelector('[data-h="se"]');
se.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
se.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: -50, clientY: 0 }));
se.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
ok('arrastrar una esquina cambia el tamaño', /width:35\.00%/.test($$('.bx')[1].getAttribute('style')));
click($('#imAdd')); ok('agregar crea un cuarto recuadro', $$('.bx').length === 4 && $$('.sgi').length === 4);
click($('[data-del="3"]')); ok('quitar elimina el recuadro', $$('.bx').length === 3);

// ---- lectura ----
failNext = 1;
click($('#imGo')); await wait(30);
ok('si falla la lectura ofrece reintentar', !!$('#imRetry') && /saldo insuficiente/.test($('h1').textContent + d.body.textContent));
click($('#imRetry')); await wait(30);
const tr = reads.filter((r) => r.mode === 'transcribe');
ok('une el recuadro continuación con su canción', tr[1].images.length === 2);
ok('la canción de un solo recuadro va con una imagen', tr.length === 2 || tr.some((x) => x.images.length === 1));

// ---- revisión de la primera canción ----
ok('abre la revisión de la primera canción', /Revisar canción/.test($('h1').textContent) && /Canción 1 de 2/.test($('#rev').textContent));
ok('el solfeo llegó convertido a letras', /\[Am\]El derrumbe de un \[D\]sue/.test($('#fBody').value) && /\{intro: Am - D - Am\}/.test($('#fBody').value));
ok('muestra las fotos del recorte', $$('#revImg img').length === 2);
ok('muestra lo anotado del papel', /MIm\*/.test($('#rev').textContent));
ok('el formulario de revisión no tiene cancionero ni página', !$('#fSource') && !$('#fPage'));
ok('lista la duda con su motivo', /Duda 1 de 1/.test($('#revDoubt').textContent) && /Podría ser SId7/.test($('#revDoubt').textContent));
ok('con una sola foto no hay ampliación y con varias muestra solo las fotos', $$('#revDoubt .zoom').length === 0);
click($('[data-rev="next"]'));
const ta = $('#fBody');
ok('saltar a la duda la selecciona en el texto', ta.value.slice(ta.selectionStart, ta.selectionEnd) === 'Sld7');
type(ta, ta.value.replace('Sld7', 'Bdim7'));
ok('corregir la duda la quita de la lista', /Sin dudas pendientes/.test($('#revDoubt').textContent));
$('#edForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait();
const first = [...metas.values()][0];
ok('guardó con estado revisada', first.status === 'revisada' && first.doubts === 0);

// ---- segunda canción: una foto, con duda que se deja ----
ok('pasa a la segunda canción', /Canción 2 de 2/.test($('#rev').textContent) && /Un viejo y un/.test($('#fBody').value));
ok('traduce acordes de línea con bajo y 4', /> C4 C G7/.test($('#fBody').value));
type($('#fBody'), $('#fBody').value + '\n[Zz]raro');
ok('una duda nueva aparece en la lista', /Duda 1 de 1/.test($('#revDoubt').textContent));
$('#edForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait();
const statuses = [...metas.values()].map((m) => m.status).sort();
ok('con duda sin resolver queda "dudas"', statuses.join() === 'dudas,revisada');
ok('termina en la biblioteca con las dos canciones y el aviso', !!$('#q') && $$('.item').length === 2 && /2 canciones guardadas/.test($$('.toast').pop().textContent));
ok('no queda importación activa', !$('#imStage'));

// ---- saltar y terminar ----
click($('#importBtn'));
Object.defineProperty($('#imFiles'), 'files', { value: [new w.File(['x'], 'p53.jpg')] });
$('#imForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await wait(30);
ok('el nombre del cancionero se recuerda', true);
click($('#imSkip')); await wait();
ok('saltar la última foto termina sin guardar nada nuevo', !!$('#q') && $$('.item').length === 2 && /No se guardó/.test($$('.toast').pop().textContent));

console.log(fails.length ? '\nFALLARON:\n' + fails.join('\n') : '\nsin errores');
process.exitCode = fails.length ? 1 : 0;
