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

let authCb;
const list = [
  { id: 's1', title: 'Camino', artist: 'A', key: 'G', status: 'revisada', doubts: 0 },
  { id: 's2', title: 'Borrador', artist: 'A', key: 'G', status: 'pendiente', doubts: 0 },
  { id: 's3', title: 'Otra', artist: 'B', key: 'Am', status: 'revisada', doubts: 0 }
];
const api = {
  onAuth(cb) { authCb = cb; cb(null); return () => {}; },
  async signIn() { authCb({ uid: 'u', email: 'yo@example.test' }); }, async signOut() { authCb(null); },
  subscribeSongs(ok2) { setTimeout(() => ok2(list.map((s) => ({ ...s }))), 0); return () => {}; },
  async getBody() { return { body: '[G]Hola', diagrams: {} }; },
  saveSong() { return Promise.resolve(); }, deleteSong() { return Promise.resolve(); }, saveMany() { return Promise.resolve(); }
};
start(api); await wait(30);

ok('al cargar /c/s1 abre esa canción', !!$('#songBody') && /Camino/.test($('h1').textContent) && w.location.pathname === '/c/s1');
ok('el título de la pestaña lleva la canción', /Camino · Songbook CG/.test(d.title));
click($('[data-act="back"]'));
ok('volver a la biblioteca cambia la dirección a /', w.location.pathname === '/' && !!$('.hero') && d.title === 'Songbook CG');
go('/c/s3'); await wait(20);
ok('el historial abre otra canción', !!$('#songBody') && /Otra/.test($('h1').textContent));
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

// editor: ya con sesión
click($('#signInTop')); await wait(20);
go('/c/s2'); await wait(20);
ok('el editor ve la pendiente por enlace', !!$('#songBody') && /Borrador/.test($('h1').textContent));
click($('[data-act="edit"]'));
go('/'); await wait();
ok('al editar el botón Atrás no sale y avisa', !!$('#fBody') && w.location.pathname === '/c/s2' && $$('.toast.err').length > 0);

console.log(fails.length ? '\nFALLARON:\n' + fails.join('\n') : '\nsin errores');
process.exitCode = fails.length ? 1 : 0;
