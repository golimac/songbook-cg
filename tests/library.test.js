// Biblioteca: grupos A–Z, artistas, recientes, filtros por estado y versiones agrupadas.
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

const api = {
  onAuth(cb) { cb({ uid: 'u', email: 'yo@example.test' }); return () => {}; },
  async signIn() {}, async signOut() {},
  subscribeSongs(ok) { setTimeout(() => ok(list.map((s) => ({ ...s }))), 0); return () => {}; },
  async getBody() { return { body: '', diagrams: {} }; },
  saveSong() { return Promise.resolve(); }, deleteSong() { return Promise.resolve(); }, saveMany() { return Promise.resolve(); }
};

const $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
const wait = () => new Promise((r) => setTimeout(r, 5));
const fails = [];
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fails.push(n); };
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

start(api); await wait();

const stats = () => $$('.stb').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
ok('contador de estado', stats()[0] === '30 en total' && stats()[1] === '2 revisadas' && stats()[2] === '1 con dudas' && stats()[3] === '27 pendientes');
ok('barra de avance dibujada', $$('.prog i').length === 2);
ok('vista A–Z por defecto con letras', $('.tab-b[aria-selected="true"]').textContent === 'A–Z' && $$('h2.lg').length >= 4);
ok('"¿Quién fue?" cae en la Q y no en #', $$('h2.lg').some((h) => h.textContent === 'Q') && !$$('h2.lg').some((h) => h.textContent === '#'));
ok('las dos versiones de Ojalá van en un marco', $$('.vgroup').length === 1 && $('.vgroup .vg-l').textContent === '2 versiones' && $$('.vgroup .item').length === 2);
ok('con 24 o más canciones hay índice de letras', $$('#rail [data-jump]').length >= 4);
ok('el índice salta a la letra', (() => { let hit = false; const g = d.getElementById('g-Z'); g.scrollIntoView = () => { hit = true; }; click($('#rail [data-jump="Z"]')); return hit; })());

click($('[data-st="dudas"]'));
ok('filtrar por con dudas', $$('.item').length === 1 && /Ojalá/.test($('.item').textContent) && $('#count').textContent === '1 canción');
click($('[data-st="dudas"]'));
ok('tocar otra vez quita el filtro', $$('.item').length === 30);
click($('[data-st="revisada"]'));
ok('filtrar por revisadas', $$('.item').length === 2);
click($('[data-st="todas"]'));

type($('#q'), 'silvio ojala');
ok('búsqueda por varias palabras sin tildes', $$('.item').length === 2);
type($('#q'), 'sabina'); ok('búsqueda por artista', $$('.item').length === 1 && /Zapatos/.test($('.item').textContent));
type($('#q'), '');

click($('[data-lv="artistas"]'));
const heads = $$('h2.lg').map((h) => h.textContent);
ok('vista por artistas con conteo', heads.includes('Silvio Rodríguez3') && heads.includes('Joaquín Sabina1') && heads[heads.length - 1] === 'Sin artista1');
ok('sin índice de letras en artistas', $$('#rail [data-jump]').length === 0);

click($('[data-lv="recientes"]'));
const first = $$('.item')[0];
ok('recientes: la más nueva primero con su hora', /Años/.test(first.textContent) && /hace 5 min/.test(first.textContent));
ok('recientes: máximo 40', $$('.item').length <= 40);
ok('recientes: ayer y días', $$('.item').some((i) => /hace 3 días/.test(i.textContent)));

click($('[data-lv="az"]'));
click($$('.item').find((i) => /Zapatos/.test(i.textContent))); await wait();
ok('abrir una canción desde la lista', !!$('#songBody'));

console.log(fails.length ? '\nFALLARON:\n' + fails.join('\n') : '\nsin errores');
process.exitCode = fails.length ? 1 : 0;
