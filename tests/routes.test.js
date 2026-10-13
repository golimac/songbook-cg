// Enlaces directos: /c/<id> abre la canción al cargar, el historial funciona y el enlace se copia.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/c/s1' });
const w = dom.window, d = w.document;
w.scrollTo = () => {};
Object.assign(globalThis, { window: w, document: d, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
const { start } = await import('../public/js/app.js');

const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fails.push(n); };
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const go = (path) => { w.history.pushState(null, '', path); w.dispatchEvent(new w.PopStateEvent('popstate')); };

let authCb; const saved = [];
const list = [
  { id: 's1', title: 'Camino', artist: 'A', tuning: 'Afinación del campo', key: 'G', status: 'revisada', doubts: 0 },
  { id: 's2', title: 'Borrador', artist: 'A', key: 'G', status: 'pendiente', doubts: 0 },
  { id: 's3', title: 'Otra', artist: 'B', key: 'Am', status: 'revisada', doubts: 0 },
  { id: 's4', title: 'Dueto', artist: 'Silvio Rodríguez; Piero', key: 'C', status: 'revisada', doubts: 0 },
  { id: 's5', title: 'Solo', artist: 'silvio rodriguez', key: 'C', status: 'revisada', doubts: 0 },
  { id: 's6', title: 'Trío', artist: 'Ana;Beto ; Carlos;', key: 'C', status: 'revisada', doubts: 0 }
];
const api = {
  onAuth(cb) { authCb = cb; cb(null); return () => {}; },
  async signIn() { authCb({ uid: 'u', email: 'yo@example.test' }); }, async signOut() { authCb(null); },
  subscribeSongs(ok2) { setTimeout(() => ok2(list.map((s) => ({ ...s }))), 0); return () => {}; },
  async getBody(id) { const sv = saved.filter((x) => x.id === id).pop(); return { prefs: sv ? sv.prefs : {}, body: (id === 's3' ? '[C (C4-C-G7-C)]Hola [C-F-C]mundo [Zz]raro\n' : '{c: Afinar un tono más bajo}\n') + '[G]Hola', diagrams: {} }; },
  saveSong(s) { saved.push(JSON.parse(JSON.stringify(s))); return Promise.resolve(); }, deleteSong() { return Promise.resolve(); }, saveMany() { return Promise.resolve(); }
};
start(api); await wait(30);

ok('al cargar /c/s1 abre esa canción', !!$('#songBody') && /Camino/.test($('h1').textContent) && w.location.pathname === '/c/s1');
ok('la nota del inicio va bajo la tonalidad, en cursiva, y no se repite ni sale en el encabezado', /Nota: Afinar un tono más bajo/.test($('#info').textContent) && $('#info i').textContent === 'Afinar un tono más bajo' && !$('#songBody .note') && !/Afinaci|Afinar/.test($('.meta').textContent));
ok('el título de la pestaña lleva la canción', /Camino · Songbook CG/.test(d.title));
click($('[data-act="back"]'));
ok('volver a la biblioteca cambia la dirección a /', w.location.pathname === '/' && !!$('.hero') && d.title === 'Songbook CG');
go('/c/s3'); await wait(20);
ok('el historial abre otra canción', !!$('#songBody') && /Otra/.test($('h1').textContent));
ok('una sucesión rápida dentro del acorde se dibuja entera y sin ámbar', $('.seg .c.cs') && $('.seg .c.cs').textContent === 'C (C4-C-G7-C)' && !$('#songBody .doubt') && $$('#dgStrip .dg').length === 5 && $$('.seg .c.cs')[1].textContent === 'C-F-C');
click($('[data-act="tp"]')); click($('[data-act="tp"]'));
ok('el invitado no ve marcas de duda ni el aviso del editor', !$('.banner') && !$('#songBody [title="Lectura dudosa"]') && !!$$('#songBody .c').find((c) => c.textContent === 'Zz'));
ok('y se transpone completa', $('.seg .c.cs').textContent === 'D (D4-D-A7-D)');
click($('[data-act="t0"]'));
ok('sin nota en la letra no sale la línea de nota', !/Nota:/.test($('#info').textContent));
go('/'); await wait();
ok('y vuelve a la biblioteca', !!$('.hero'));
go('/c/s2'); await wait();
ok('una canción que el invitado no ve sale como no disponible', /no disponible/.test($('h1').textContent) && !$('#songBody'));
click($('[data-lib="home"]'));
ok('desde ahí se vuelve a la biblioteca', !!$('.hero') && w.location.pathname === '/');
click($('[data-open="s1"]')); await wait();
ok('abrir una canción pone su dirección', w.location.pathname === '/c/s1');
click($('[data-act="share"]'));
await wait(10);
ok('copiar enlace avisa con la dirección completa', $$('.toast').some((t) => /s1|Enlace copiado/.test(t.textContent)));

// ---- varios artistas ----
click($('[data-act="back"]'));
click($('[data-lib="artistas"]'));
const names = $$('.artist span').map((x) => x.textContent);
ok('cada artista separado por ; cuenta aparte, sin repetidos por mayúsculas o tildes', names.includes('Piero') && names.includes('Silvio Rodríguez') && !names.some((n) => /;/.test(n)) && names.filter((n) => /silvio/i.test(n)).length === 1);
ok('Silvio suma sus dos canciones y Piero la suya', $$('.artist').find((a) => /Silvio/.test(a.textContent)).querySelector('i').textContent === '2' && $$('.artist').find((a) => /Piero/.test(a.textContent)).querySelector('i').textContent === '1');
click($$('.artist').find((a) => /Piero/.test(a.textContent)));
ok('la página de Piero lista el dueto y lo escribe con punto y coma', $$('.item').length === 1 && /Dueto/.test($('.item').textContent) && /Silvio Rodríguez; Piero/.test($('.item').textContent));
click($('#goHome'));
click($('[data-lib="todas"]'));
ok('tres artistas se leen "A; B; C"', $$('.item').some((i) => /Ana; Beto; Carlos/.test(i.textContent)));
click($('#goHome'));
click($('[data-open="s1"]')); await wait();

// ---- impresión ----
let printed = 0; w.print = () => { printed++; };
click($('[data-act="tp"]')); click($('[data-act="tp"]'));
click($('[data-act="print"]'));
ok('abre la hoja de impresión con título, datos y diagramas', !!$('.sheet') && /Camino/.test($('.sheet h1').textContent) && /Tonalidad/.test($('.sh-meta').textContent) && /A/.test($('.sh-meta').textContent) && $$('.pdg .dg').length > 0 && !$('.pdg button'));
ok('imprime transpuesta', /original G/.test($('.sh-meta').textContent) && /Nota: Afinar un tono más bajo/.test($('.sh-meta').textContent) && !$('#prBody .note'));
ok('el panel no se imprime y ofrece las opciones', !!$('.opts') && !!$('#prPaper') && !!$('#prMeta') && !!$('#prDg') && !!$('#prCols'));
const tg = (id, v) => { const el = $('#' + id); if (v !== undefined) el.value = v; else el.checked = !el.checked; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
tg('prMeta'); ok('sin datos no sale el bloque de datos', !$('.sh-meta'));
tg('prMeta'); tg('prDg'); ok('sin diagramas no salen', !$('.pdg'));
tg('prDg'); tg('prCols'); ok('dos columnas', $('.sheet').classList.contains('two'));
tg('prPaper', 'a4'); ok('A4 ajusta el tamaño de la página', /A4/.test(d.getElementById('pgsz').textContent) && $('.sheet').classList.contains('a4'));
const fs0 = $('#prBody').getAttribute('style'); click($('[data-act="pfp"]'));
ok('el tamaño de letra sube', $('#prBody').getAttribute('style') !== fs0);
ok('las opciones se recuerdan', JSON.parse(w.localStorage.getItem('songbookcg.imprimir')).paper === 'a4');
click($('[data-act="doprint"]')); ok('imprimir abre el diálogo', printed === 1);
click($('[data-act="unprint"]'));
ok('volver conserva la transposición', !!$('#songBody') && $('#tval').textContent === '+2');
click($('[data-act="back"]')); click($('[data-open="s1"]')); await wait();

// editor: ya con sesión
click($('#signInTop')); await wait(20);
go('/c/s2'); await wait(20);
ok('el editor ve la pendiente por enlace', !!$('#songBody') && /Borrador/.test($('h1').textContent));
// ---- posición principal de un acorde ----
const tile0 = () => $('#dgStrip .dg').innerHTML;
const before = tile0();
click($$('#songBody [data-ch]')[0]);
ok('sin preferencia no ofrece "Quitar" y con la primera forma no ofrece "Usar"', !$('#pop [data-pop="pref"]') && !$('#pop [data-pop="unpref"]'));
click($('#pop [data-pop="next"]'));
ok('en otra posición ofrece usarla como principal', !!$('#pop [data-pop="pref"]'));
click($('#pop [data-pop="pref"]'));
ok('la guarda en la canción', saved.length > 0 && saved[saved.length - 1].prefs && typeof saved[saved.length - 1].prefs.G === 'string');
ok('el diagrama principal cambia', tile0() !== before);
click($('[data-act="back"]')); click($('[data-open="s2"]')); await wait(20);
ok('al reabrir la canción sigue como principal', tile0() !== before);
click($$('#songBody [data-ch]')[0]);
ok('y se puede quitar', !!$('#pop [data-pop="unpref"]'));
click($('#pop [data-pop="unpref"]'));
ok('quitarla devuelve la forma de siempre', tile0() === before && Object.keys(saved[saved.length - 1].prefs).length === 0);

click($('[data-act="edit"]'));
go('/'); await wait();
ok('al editar el botón Atrás no sale y avisa', !!$('#fBody') && w.location.pathname === '/c/s2' && $$('.toast.err').length > 0);

console.log(fails.length ? '\nFALLARON:\n' + fails.join('\n') : '\nsin errores');
process.exitCode = fails.length ? 1 : 0;
