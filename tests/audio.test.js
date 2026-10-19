import { handleAudio, presign, parseList, filterFiles } from '../api/_audio.js';
let fail = 0;
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fail++; };

// Ejemplo oficial de AWS para URL prefirmada (GET test.txt, 86400 s): la firma publicada es esta.
const u = presign({ host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1', now: new Date('2013-05-24T00:00:00Z'), expires: 86400 });
ok('la firma coincide con el ejemplo oficial de AWS', u.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));

const XML = '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok&amp;1</NextContinuationToken>' +
  '<Contents><Key>Silvio Rodríguez - Resumen de noticias.mp3</Key><Size>5000</Size></Contents>' +
  '<Contents><Key>La Unión - La casa de los sueños.mp3</Key><Size>6000</Size></Contents>' +
  '<Contents><Key>notas.txt</Key><Size>10</Size></Contents></ListBucketResult>';
const p = parseList(XML);
ok('lee claves y tamaños', p.files.length === 3 && p.files[0].size === 5000);
ok('lee el token de continuación con entidades', p.next === 'tok&1');
ok('filtra por palabras sin tildes ni mayúsculas', filterFiles(p.files, 'rodriguez resumen').length === 1 && filterFiles(p.files, 'UNION casa')[0].key.startsWith('La Unión'));
ok('ignora lo que no es audio', filterFiles(p.files, 'notas').length === 0);

const env = { OWNER_EMAIL: 'yo@example.test', R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'AK', R2_SECRET_ACCESS_KEY: 'SK', R2_BUCKET: 'songbook-audio' };
const calls = [];
const mk = (o = {}) => async (url) => {
  calls.push(url);
  if (url.includes('identitytoolkit')) return { ok: true, json: async () => ({ users: [{ email: o.email || 'yo@example.test', emailVerified: true }] }) };
  if (url.includes('firestore.googleapis.com')) {
    const doc = o.song || { status: 'revisada', audio: 'La Unión - La casa de los sueños.mp3' };
    return { ok: true, json: async () => ({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, { stringValue: v }])) }) };
  }
  if (o.status) return { ok: false, status: o.status };
  return { ok: true, text: async () => XML.replace('<IsTruncated>true</IsTruncated><NextContinuationToken>tok&amp;1</NextContinuationToken>', '<IsTruncated>false</IsTruncated>') };
};
const req = (b, t = 'tok', m = 'POST') => ({ method: m, headers: { authorization: t ? 'Bearer ' + t : '' }, body: b });
const now = new Date('2026-10-18T12:00:00Z');

let o = await handleAudio(req({ action: 'list', q: 'resumen' }), env, mk(), now);
ok('lista y filtra', o.status === 200 && o.body.files.length === 1 && o.body.total === 3);
ok('la lista se pide firmada al bucket', calls.some((c) => /^https:\/\/acc\.r2\.cloudflarestorage\.com\/songbook-audio\?.*list-type=2.*X-Amz-Signature=/.test(c)));
o = await handleAudio(req({ action: 'url', key: 'Silvio Rodríguez - Resumen de noticias.mp3' }), env, mk(), now);
ok('entrega un enlace firmado y codificado', o.status === 200 && /^https:\/\/acc\.r2\.cloudflarestorage\.com\/songbook-audio\/Silvio%20Rodr%C3%ADguez%20-%20Resumen%20de%20noticias\.mp3\?.*X-Amz-Expires=21600/.test(o.body.url));
ok('rechaza lo que no es audio', (await handleAudio(req({ action: 'url', key: 'secreto.txt' }), env, mk(), now)).status === 400);
ok('sin sesión rechaza', (await handleAudio(req({ action: 'list' }, ''), env, mk(), now)).status === 401);
ok('otra cuenta rechaza', (await handleAudio(req({ action: 'list' }), env, mk({ email: 'otro@example.test' }), now)).status === 401);
ok('sin variables avisa cuáles faltan', /R2_BUCKET/.test((await handleAudio(req({ action: 'list' }), { ...env, R2_BUCKET: '' }, mk(), now)).body.error));
ok('error de R2 se informa', (await handleAudio(req({ action: 'list' }), env, mk({ status: 403 }), now)).status === 502);
ok('GET no se acepta', (await handleAudio(req({}, 'tok', 'GET'), env, mk(), now)).status === 405);
const rq2 = (id) => ({ method: 'POST', headers: { host: 'songbook.example' }, body: { action: 'play', id } });
o = await handleAudio(rq2('abc123'), env, mk(), now);
ok('sin sesión entrega el audio de una canción revisada', o.status === 200 && /La%20Uni%C3%B3n%20-%20La%20casa%20de%20los%20sue%C3%B1os\.mp3\?.*X-Amz-Signature=/.test(o.body.url));
ok('una canción pendiente no entrega audio', (await handleAudio(rq2('abc123'), env, mk({ song: { status: 'pendiente', audio: 'x.mp3' } }), now)).status === 404);
ok('una canción sin audio no entrega nada', (await handleAudio(rq2('abc123'), env, mk({ song: { status: 'revisada' } }), now)).status === 404);
ok('el identificador de la canción se valida', (await handleAudio(rq2('../x'), env, mk(), now)).status === 400);
ok('sin sesión no se puede listar ni pedir un archivo suelto', (await handleAudio({ method: 'POST', headers: {}, body: { action: 'url', key: 'x.mp3' } }, env, mk(), now)).status === 401);
if (fail) { console.log('FALLARON ' + fail); process.exit(1); }
