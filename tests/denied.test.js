// Una cuenta sin permiso ve el aviso de acceso y puede salir.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*>/g, '');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/' });
const w = dom.window, d = w.document; w.scrollTo = () => {};
Object.assign(globalThis, { window: w, document: d, requestAnimationFrame: w.requestAnimationFrame.bind(w), cancelAnimationFrame: w.cancelAnimationFrame.bind(w) });
const { start } = await import('../public/js/app.js');
let authCb;
start({
  onAuth(cb) { authCb = cb; cb(null); return () => {}; },
  signIn: async () => authCb({ uid: 'x', email: 'otra@example.test' }),
  signOut: async () => authCb(null),
  subscribeSongs(ok, err) { setTimeout(() => err({ code: 'permission-denied', message: 'x' }), 0); return () => {}; }
});
await new Promise((r) => setTimeout(r, 5));
const pideCuenta = !!d.querySelector('#signIn') && /pide una cuenta/.test(d.body.textContent);
console.log((pideCuenta ? 'ok    ' : 'FALLA ') + 'si las reglas no permiten leer sin cuenta, el invitado ve la invitación a entrar');
d.querySelector('#signIn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 5));
const sinAcceso = /Sin acceso/.test(d.querySelector('h1').textContent) && /otra@example\.test/.test(d.body.textContent);
console.log((sinAcceso ? 'ok    ' : 'FALLA ') + 'cuenta sin permiso ve "Sin acceso"');
d.querySelector('#signOut2').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 5));
const vuelve = !!d.querySelector('#signIn');
console.log((vuelve ? 'ok    ' : 'FALLA ') + 'salir lleva de nuevo al acceso');
process.exitCode = pideCuenta && sinAcceso && vuelve ? 0 : 1;
