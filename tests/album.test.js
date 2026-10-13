import { handleAlbum, normalizeResults, cleanTerm } from '../api/_album.js';
let fail = 0;
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fail++; };
const env = { OWNER_EMAIL: 'yo@example.test' };
const calls = [];
const ITUNES = { results: [
  { trackName: 'Wish You Were Here', artistName: 'Pink Floyd', collectionName: 'Wish You Were Here', releaseDate: '1975-09-12T07:00:00Z', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/y/100x100bb.jpg' },
  { trackName: 'Wish You Were Here', artistName: 'Pink Floyd', collectionName: 'Wish You Were Here', releaseDate: '2011-09-26T07:00:00Z', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/z/100x100bb.jpg' },
  { trackName: 'Sin carátula', artistName: 'X', collectionName: 'Y', releaseDate: '2000-01-01T00:00:00Z' },
  { trackName: 'Echoes', artistName: 'Pink Floyd', collectionName: 'Meddle', releaseDate: '1971-10-30T07:00:00Z', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/m/n/100x100bb.jpg' }] };
const mk = (o = {}) => async (url) => {
  calls.push(url);
  if (url.includes('identitytoolkit')) return { ok: true, json: async () => ({ users: [{ email: o.email || 'yo@example.test', emailVerified: true }] }) };
  if (o.status) return { ok: false, status: o.status };
  return { ok: true, json: async () => ITUNES };
};
const req = (b, t = 'tok', m = 'POST') => ({ method: m, headers: { authorization: t ? 'Bearer ' + t : '' }, body: b });

const n = normalizeResults(ITUNES);
ok('quita repetidos y los que no traen carátula', n.length === 2 && n[0].album === 'Wish You Were Here' && n[1].album === 'Meddle');
ok('año de 4 dígitos y carátula grande', n[0].year === '1975' && /600x600bb\.jpg$/.test(n[0].cover) && n[0].cover.startsWith('https://'));
ok('limpia el término', cleanTerm('  a\n\tb   c ') === 'a b c');

let o = await handleAlbum(req({ title: 'Wish You Were Here', artist: 'Pink Floyd' }), env, mk());
ok('busca con título y artista', o.status === 200 && o.body.results.length === 2 && calls.some((c) => /itunes\.apple\.com\/search.*Wish%20You%20Were%20Here%20Pink%20Floyd/.test(c)));
ok('sin sesión rechaza', (await handleAlbum(req({ title: 'x' }, ''), env, mk())).status === 401);
ok('otra cuenta rechaza', (await handleAlbum(req({ title: 'x' }), env, mk({ email: 'otro@example.test' }))).status === 401);
ok('sin término pide el título', (await handleAlbum(req({ title: '', artist: '' }), env, mk())).status === 400);
ok('GET no se acepta', (await handleAlbum(req({}, 'tok', 'GET'), env, mk())).status === 405);
ok('error del catálogo se informa', (await handleAlbum(req({ title: 'x' }), env, mk({ status: 503 }))).status === 502);
console.log(fail ? '\nFALLARON ' + fail : '\nsin errores');
process.exitCode = fail ? 1 : 0;
