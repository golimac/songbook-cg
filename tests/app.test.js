// Prueba de interfaz con jsdom y una capa de datos simulada en memoria.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/' });
const w = dom.window, d = w.document;
w.scrollTo = () => {};
Object.assign(globalThis, { window: w, document: d, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
const { start } = await import('../public/js/app.js');

/* ---- capa de datos simulada ---- */
function mockApi(allowed = true) {
  const metas = new Map(), bodies = new Map();
  let authCb = null, listCb = null, listErr = null;
  const emit = () => listCb && listCb([...metas].map(([id, m]) => ({ id, ...m })));
  const api = {
    metas, bodies, writes: 0,
    onAuth(cb) { authCb = cb; cb(null); return () => {}; },
    async signIn() { authCb({ uid: 'u1', email: 'yo@example.test' }); },
    async signOut() { authCb(null); },
    subscribeSongs(ok, err) {
      listCb = ok; listErr = err;
      setTimeout(() => { if (!allowed) err({ code: 'permission-denied', message: 'denegado' }); else emit(); }, 0);
      return () => { listCb = null; };
    },
    async getBody(id) { return bodies.get(id) || { body: '', diagrams: {} }; },
    saveSong(s) {
      api.writes++;
      const { body, diagrams, id, ...meta } = s;
      metas.set(id, meta); bodies.set(id, { body, diagrams: diagrams || {} }); emit();
      return Promise.resolve();
    },
    deleteSong(id) { metas.delete(id); bodies.delete(id); emit(); return Promise.resolve(); },
    saveMany(list) { list.forEach((s) => api.saveSong(s)); return Promise.resolve(); }
  };
  return api;
}

const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
const wait = () => new Promise((r) => setTimeout(r, 5));
const fails = [];
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fails.push(n); };
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

const api = mockApi();
start(api);

// ---- modo invitado ----
await wait();
ok('sin sesión se ve la biblioteca', !!$('#q') && !$('#signIn'));
ok('invitado no ve controles de edición', $('#newSong').hidden === true && $('#importBtn').hidden === true && $('#signOut').hidden === true && $('#signInTop').hidden === false);
ok('invitado no ve el botón de cargar ejemplos', !$('#seed'));
// ---- acceso ----
click($('#signInTop')); await wait();
ok('con sesión muestra la biblioteca y el correo', !!$('#q') && $('#who').textContent === 'yo@example.test' && $('#newSong').hidden === false);
ok('biblioteca vacía ofrece cargar ejemplos', !!$('#seed'));
click($('#seed')); await wait();
ok('biblioteca con 3 canciones', $$('.item').length === 3);
ok('el cuerpo se guarda aparte de los datos livianos', api.metas.get('ej1').body === undefined && /Camino|Cuando/.test(api.bodies.get('ej1').body));
ok('las dudas se muestran desde los datos livianos', /dudas/.test($$('.item').find((i) => /Luz de enero/.test(i.textContent)).textContent));

// ---- búsqueda ----
const q = $('#q'); type(q, 'camino');
ok('búsqueda sin tildes filtra', $$('.item').length === 1);
type(q, '');

// ---- vista de canción ----
click($$('.item').find((i) => /Camino/.test(i.textContent))); await wait();
ok('vista de canción', !!$('#songBody'));
ok('acordes sobre sílabas', $$('#songBody .seg .c').some((c) => c.textContent === 'D'));
ok('tablatura en pre', !!$('#songBody pre.tab'));
ok('línea alternativa oculta al tocar', !/alternativa/.test($('#songBody').textContent));
ok('tira de diagramas con G', $$('#dgStrip .dg b').some((b) => b.textContent === 'G'));
const chordsOf = () => $$('#songBody .seg .c').map((c) => c.textContent.trim()).filter(Boolean);
const before = chordsOf();
click($('[data-act="tp"]'));
ok('+1 semitono: G -> Ab', chordsOf().includes('Ab') && /Suena en Ab/.test($('#info').textContent));
ok('aviso de figuras sin transponer', /conservan su posición/.test($('#info').textContent));
click($('[data-act="t0"]'));
ok('original restaura', JSON.stringify(chordsOf()) === JSON.stringify(before));
const capo = $('#capo'); capo.value = '3'; capo.dispatchEvent(new w.Event('change', { bubbles: true }));
ok('cejilla 3: G suena como E', chordsOf().includes('E') && /formas en E/.test($('#info').textContent));
click($('[data-act="t0"]'));
click($('[data-act="fp"]'));
ok('A+ sube el tamaño', $('#songBody').style.getPropertyValue('--fs') === '14px');
const tg = $('#dgToggle'); tg.checked = false; tg.dispatchEvent(new w.Event('change', { bubbles: true }));
ok('ocultar diagramas', $('#dgStrip').hidden === true);
tg.checked = true; tg.dispatchEvent(new w.Event('change', { bubbles: true }));
click($('#autoBtn')); ok('autoscroll inicia', /Pausar/.test($('#autoBtn').textContent));
click($('#autoBtn')); ok('autoscroll pausa', /Iniciar/.test($('#autoBtn').textContent));

// ---- Luz de enero: dudas, variante A*, diagrama propio ----
click($('[data-act="back"]'));
click($$('.item').find((i) => /Luz de enero/.test(i.textContent))); await wait();
ok('banner de dudas (3)', /3 marcas/.test($('#info').textContent));
ok('Sld7 resaltado', $$('#songBody .doubt').some((x) => x.textContent === 'Sld7'));
ok('figura incompleta resaltada', $$('#songBody .fig.doubt').length === 1);
ok('A* con diagrama propio', $$('#dgStrip .dg').some((x) => /A\*/.test(x.textContent) && /propio/.test(x.textContent)));
click($('[data-act="tp"]')); click($('[data-act="tp"]'));
ok('+2: A* pasa a B* con diagrama movido', $$('#dgStrip .dg').some((x) => /B\*/.test(x.textContent) && /propio/.test(x.textContent)));
ok('en transposición no se puede dibujar', $$('#dgStrip [data-edit]').length === 0);
click($('[data-act="t0"]'));

// ---- editor de diagramas: se guarda en la base ----
const writes0 = api.writes;
click($$('#dgStrip [data-edit]').find((x) => /E7/.test(x.textContent)));
ok('modal de diagrama abre', $('#dgModal').hidden === false);
click($$('#dgBig .cell[data-i]').find((c) => c.dataset.i === '5' && c.dataset.r === '2'));
$('#dgSave').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('modal cierra al guardar', $('#dgModal').hidden === true);
ok('E7 quedó como propio', $$('#dgStrip .dg').some((x) => /E7/.test(x.textContent) && /propio/.test(x.textContent)));
ok('el diagrama propio se escribió en la base', api.writes === writes0 + 1 && !!api.bodies.get('ej2').diagrams.E7);

// ---- exportar ----
click($('[data-act="export"]'));
ok('exportar ChordPro', /\{title: Luz de enero\}/.test($('#exTa').value) && /\[A\*\]/.test($('#exTa').value));
click($('#exClose'));

// ---- editor ----
click($('[data-act="edit"]'));
ok('editor con vista previa', !!$('#pv') && $$('#pv .seg').length > 0);
ok('editor con cancionero y página', !!$('#fSource') && !!$('#fPage'));
type($('#fPage'), '52'); type($('#fSource'), 'Cancionero 1');
type($('#fBody'), '[C]Hola [G7]mundo\n{alt: otra}\n[Zz]raro');
ok('vista previa se actualiza', $$('#pv .seg .c').length === 3 && $('#pvN').textContent.includes('1 duda'));
ok('alt visible en editor', /alternativa/.test($('#pv').textContent));
$('#edForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
ok('guardar vuelve a la canción', !!$('#songBody') && /Hola/.test($('#songBody').textContent));
ok('se escribió cuerpo, página y conteo de dudas', /Hola/.test(api.bodies.get('ej2').body) && api.metas.get('ej2').page === '52' && api.metas.get('ej2').doubts === 1);
click($('[data-act="back"]'));
ok('la lista muestra cancionero y página', /Cancionero 1 · p\. 52/.test($$('.item').find((i) => /Luz de enero/.test(i.textContent)).textContent));

// ---- diagrama emergente ----
click($('#goHome'));
click($$('.item').find((i) => /Camino/.test(i.textContent))); await wait();
const pop = $('#pop');
const chEl = (t) => $$('#songBody [data-ch]').find((x) => x.textContent === t);
chEl('G').dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
ok('hover abre el diagrama', pop.hidden === false && /<h3>G<\/h3>/.test(pop.innerHTML) && !!pop.querySelector('svg'));
const m = /(\d+) de (\d+)/.exec(pop.textContent);
ok('muestra "1 de N" con varias posiciones', m && m[1] === '1' && parseInt(m[2], 10) >= 4);
const tile = () => $$('#dgStrip .dg').find((x) => x.querySelector('b').textContent === 'G').innerHTML;
const tileBefore = tile();
click(pop.querySelector('[data-pop="next"]'));
ok('flecha derecha pasa a la posición 2', /2 de/.test(pop.textContent));
ok('la tira de diagramas sigue la posición elegida', tileBefore !== tile());
click(pop.querySelector('[data-pop="prev"]')); click(pop.querySelector('[data-pop="prev"]'));
ok('flecha izquierda da la vuelta al final', new RegExp(m[2] + ' de ' + m[2]).test(pop.textContent));
chEl('G').dispatchEvent(new w.MouseEvent('mouseout', { bubbles: true }));
pop.dispatchEvent(new w.MouseEvent('mouseenter'));
ok('entrar al diagrama lo mantiene abierto', pop.hidden === false);
const introCh = $$('#songBody .cl [data-ch]')[0];
click(introCh);
ok('tocar un acorde de la intro abre su diagrama', pop.hidden === false && pop.textContent.includes(introCh.textContent));
click(pop.querySelector('[data-pop="edit"]'));
ok('"Editar esta forma" abre el editor y cierra el emergente', pop.hidden === true && $('#dgModal').hidden === false);
click($('#dgCancel'));
click($('[data-act="tp"]'));
chEl('Ab').dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
ok('transpuesto: diagrama de Ab sin botón de edición', /<h3>Ab<\/h3>/.test(pop.innerHTML) && !pop.querySelector('[data-pop="edit"]'));
ok('transponer cierra el emergente al redibujar', (click($('[data-act="tp"]')), pop.hidden === true));
click($('[data-act="t0"]'));
click($('[data-act="back"]'));
click($$('.item').find((i) => /Marea/.test(i.textContent))); await wait();
click($$('#songBody [data-ch]').find((x) => x.textContent === 'G7/9'));
ok('acorde sin forma lo dice y ofrece dibujar', /No hay una forma conocida/.test(pop.textContent) && !!pop.querySelector('[data-pop="edit"]'));
const slash = $$('#songBody [data-ch]').find((x) => x.textContent === 'F/A');
click(slash);
ok('F/A tiene forma de biblioteca', !!pop.querySelector('svg'));
d.body.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('clic fuera cierra', pop.hidden === true);
click(slash); w.dispatchEvent(new w.Event('scroll'));
ok('el scroll cierra el emergente', pop.hidden === true);
slash.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
ok('Enter abre el diagrama con el teclado', pop.hidden === false);
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
ok('Escape lo cierra', pop.hidden === true);
click($('[data-act="edit"]'));
$$('#pv [data-ch]')[0].dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
ok('el emergente funciona en la vista previa del editor', pop.hidden === false);
click($('#goHome'));

// ---- nueva canción y eliminar ----
click($('#newSong'));
ok('nueva canción abre editor', /Nueva canción/.test($('h1').textContent));
click($('#edCancel'));
ok('cancelar vuelve a la biblioteca', $$('.item').length === 3);
click($$('.item')[0]); await wait(); click($('[data-act="edit"]'));
click($('#edDel')); ok('primer clic pide confirmar', /Confirmar/.test($('#edDel').textContent));
click($('#edDel')); ok('segundo clic elimina', $$('.item').length === 2 && api.metas.size === 2 && api.bodies.size === 2);

// ---- salir: de vuelta al modo invitado ----
click($('#signOut')); await wait();
ok('salir deja la biblioteca visible y oculta los controles', !!$('#q') && $$('.item').length === 2 && $('#newSong').hidden === true && $('#who').hidden === true && $('#signInTop').hidden === false);
click($$('.item').find((i) => /Luz de enero/.test(i.textContent))); await wait();
ok('invitado abre la canción y no ve Editar', !!$('#songBody') && !$('[data-act="edit"]') && !!$('[data-act="export"]'));
const g0 = [...$$('#songBody .seg .c')].map((c) => c.textContent.trim()).filter(Boolean);
click($('[data-act="tp"]'));
ok('invitado puede transponer', JSON.stringify([...$$('#songBody .seg .c')].map((c) => c.textContent.trim()).filter(Boolean)) !== JSON.stringify(g0));
click($('[data-act="t0"]'));
ok('invitado no tiene diagramas para editar', $$('#dgStrip [data-edit]').length === 0 && $$('#dgStrip .dg.none i').every((i) => !/dibujar/.test(i.textContent)));
const gch = $$('#songBody [data-ch]')[0];
gch.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
ok('invitado ve el diagrama emergente sin botón de edición', $('#pop').hidden === false && !$('#pop [data-pop="edit"]') && !!$('#pop svg'));
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const w0 = api.writes;
click($('[data-act="back"]'));
ok('invitado no escribe nada', api.writes === w0);

console.log(fails.length ? '\nFALLARON:\n' + fails.join('\n') : '\nsin errores');
process.exitCode = fails.length ? 1 : 0;
