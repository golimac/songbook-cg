import { handle, validateBody, buildRequest, normalizeSong, normalizeSegments, TOOLS } from '../api/_lib.js';

let fail = 0;
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fail++; };
const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const env = { ANTHROPIC_API_KEY: 'k', OWNER_EMAIL: 'Yo@Example.test' };
const calls = [];
const mkFetch = (opts = {}) => async (url, init) => {
  calls.push({ url, init });
  if (url.includes('identitytoolkit')) {
    return { ok: true, json: async () => ({ users: [{ email: opts.email || 'yo@example.test', emailVerified: opts.verified !== false }] }) };
  }
  if (opts.modelStatus) return { ok: false, status: opts.modelStatus, json: async () => ({ error: { message: 'saldo insuficiente' } }) };
  return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: opts.tool, input: opts.input }] }) };
};
const req = (b, t = 'tok', m = 'POST') => ({ method: m, headers: { authorization: t ? 'Bearer ' + t : '' }, body: b });

// validación
ok('rechaza modo desconocido', !!validateBody({ mode: 'x', images: [img] }).error);
ok('rechaza imagen que no es data URL', !!validateBody({ mode: 'transcribe', images: ['http://x/y.jpg'] }).error);
ok('rechaza más de 4 imágenes', !!validateBody({ mode: 'transcribe', images: [img, img, img, img, img] }).error);
ok('segmentar acepta solo una imagen', !!validateBody({ mode: 'segment', images: [img, img] }).error);
ok('acepta transcribir con 2 imágenes', !validateBody({ mode: 'transcribe', images: [img, img] }).error);
ok('rechaza imágenes enormes', !!validateBody({ mode: 'transcribe', images: ['data:image/jpeg;base64,' + 'A'.repeat(4_100_000)] }).error);

// solicitud al modelo
const rq = buildRequest({ mode: 'transcribe', images: [{ media_type: 'image/jpeg', data: 'AA' }, { media_type: 'image/jpeg', data: 'BB' }], hint: 'Cancionero 1' }, env);
ok('transcripción usa el modelo grande por defecto', rq.model === 'claude-opus-5-5');
ok('segmentación usa el modelo medio por defecto', buildRequest({ mode: 'segment', images: [{ media_type: 'image/png', data: 'A' }], hint: '' }, env).model === 'claude-sonnet-5-5');
ok('variables de entorno cambian el modelo', buildRequest({ mode: 'transcribe', images: [{ media_type: 'image/png', data: 'A' }], hint: '' }, { ANTHROPIC_MODEL: 'otro' }).model === 'otro');
ok('pide la herramienta sin forzarla (tool_choice auto)', rq.tool_choice.type === 'auto' && rq.tools.length === 1 && rq.system.includes('report_song'));
ok('el reintento recuerda la herramienta', /no llamó a la herramienta/.test(buildRequest({ mode: 'transcribe', images: [{ media_type: 'image/png', data: 'A' }], hint: '' }, env, true).messages[0].content[1].text));
ok('manda las imágenes y luego el texto', rq.messages[0].content.length === 3 && rq.messages[0].content[2].type === 'text' && /Cancionero 1/.test(rq.messages[0].content[2].text) && /partes consecutivas/.test(rq.messages[0].content[2].text));

// normalización
const ns = normalizeSong({ title: ' T ', artist: '', key: '', tuning: '', body: 'a – b\r\n[Am]c  \n\n', doubts: [{ text: 'Sld7', note: 'n', box: { x: 0.5, y: 0.5, w: 0.9, h: 0.9 } }, { text: '', note: 'x' }], remarks: '' });
ok('normaliza raya larga, finales y dudas vacías', ns.body === 'a - b\n[Am]c' && ns.title === 'T' && ns.doubts.length === 1);
ok('recorta el recuadro a la imagen', Math.abs(ns.doubts[0].box.w - 0.5) < 1e-9 && Math.abs(ns.doubts[0].box.h - 0.5) < 1e-9);
const sg = normalizeSegments({ page_number: '52', page_header: '52 "E.C."', songs: [
  { title: 'A', box: { x: 0.1, y: 0.1, w: 0.4, h: 0.5 }, continues: null, note: '' },
  { title: 'B', box: { x: 0.5, y: 0.1, w: 0.4, h: 0.3 }, continues: 5, note: '' },
  { title: 'A2', box: { x: 0.5, y: 0.6, w: 0.4, h: 0.3 }, continues: 0, note: 'continúa A' },
  { title: 'sin caja', box: null, continues: null, note: '' }] });
ok('descarta recuadros inválidos y continuaciones imposibles', sg.songs.length === 3 && sg.songs[1].continues === null && sg.songs[2].continues === 0);

// flujo completo
const input = { title: 'X', artist: '', key: '', tuning: '', body: '[LAm]hola', doubts: [], remarks: '' };
let r = await handle(req({ mode: 'transcribe', images: [img] }), env, mkFetch({ tool: 'report_song', input }));
ok('flujo feliz devuelve la canción', r.status === 200 && r.body.body === '[LAm]hola');
const callM = calls.filter((c) => c.url.includes('anthropic'))[0];
ok('llama a Anthropic con la llave y la versión', callM.init.headers['x-api-key'] === 'k' && callM.init.headers['anthropic-version'] === '2023-06-01');
r = await handle(req({ mode: 'transcribe', images: [img] }, ''), env, mkFetch({}));
ok('sin token responde 401', r.status === 401);
r = await handle(req({ mode: 'transcribe', images: [img] }), env, mkFetch({ email: 'otro@example.test' }));
ok('otra cuenta responde 401', r.status === 401);
r = await handle(req({ mode: 'transcribe', images: [img] }), env, mkFetch({ verified: false }));
ok('correo sin verificar responde 401', r.status === 401);
const before = calls.length;
r = await handle(req({ mode: 'transcribe', images: [img] }, 'tok'), env, mkFetch({ email: 'otro@example.test' }));
ok('una cuenta ajena nunca llega al modelo', !calls.slice(before).some((c) => c.url.includes('anthropic')));
r = await handle(req({ mode: 'transcribe' }), env, mkFetch({}));
ok('solicitud inválida responde 400', r.status === 400);
r = await handle(req({}, 't', 'GET'), env, mkFetch({}));
ok('GET responde 405', r.status === 405);
r = await handle(req({ mode: 'transcribe', images: [img] }), {}, mkFetch({}));
ok('sin llave de Anthropic avisa qué falta', r.status === 500 && /ANTHROPIC_API_KEY/.test(r.body.error));
r = await handle(req({ mode: 'transcribe', images: [img] }), env, mkFetch({ modelStatus: 402 }));
ok('error del modelo llega con su mensaje', r.status === 502 && /402/.test(r.body.error) && /saldo/.test(r.body.error));
r = await handle(req({ mode: 'transcribe', images: [img] }), env, mkFetch({ modelStatus: 401 }));
ok('llave vencida explica cómo reemplazarla', r.status === 502 && /venció/.test(r.body.error) && /ANTHROPIC_API_KEY/.test(r.body.error));
r = await handle(req({ mode: 'segment', images: [img] }), env, mkFetch({ tool: 'otra', input: {} }));
ok('respuesta sin la herramienta esperada, tras reintentar, es error 502', r.status === 502);
// primer intento con texto, segundo con la herramienta
let n = 0;
const flaky = async (url, init) => {
  if (url.includes('identitytoolkit')) return { ok: true, json: async () => ({ users: [{ email: 'yo@example.test', emailVerified: true }] }) };
  n++;
  return { ok: true, json: async () => ({ content: n === 1 ? [{ type: 'text', text: 'Aquí está' }] : [{ type: 'tool_use', name: 'report_song', input: { title: 'X', artist: '', key: '', tuning: '', body: 'hola', doubts: [], remarks: '' } }] }) };
};
r = await handle(req({ mode: 'transcribe', images: [img] }), env, flaky);
ok('si el modelo responde con texto, reintenta y obtiene la canción', r.status === 200 && n === 2 && r.body.body === 'hola');
r = await handle(req({ mode: 'segment', images: [img] }), env, mkFetch({ tool: 'report_segments', input: { page_number: '52', page_header: '', songs: [{ title: 'A', box: { x: 0, y: 0, w: 0.5, h: 0.5 }, continues: null, note: '' }] } }));
ok('segmentar devuelve recuadros', r.status === 200 && r.body.songs.length === 1 && r.body.page_number === '52');

console.log(fail ? '\n' + fail + ' pruebas fallaron' : '\ntodas las pruebas pasan');
process.exitCode = fail ? 1 : 0;
