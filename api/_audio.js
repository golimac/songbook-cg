// Audio propio en Cloudflare R2 (compatible con S3). Solo la sesión del dueño puede listar y pedir enlaces.
// Firma las solicitudes con AWS Signature V4 en el servidor, sin dependencias, para probarlas sin red.
import { createHash, createHmac } from 'node:crypto';
import { verifyOwner } from './_lib.js';
import { fromFirestore } from './_song.js';
import { firebaseConfig } from '../public/js/firebase-config.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Devuelve la URL firmada (firma en la cadena de consulta) para un GET.
export function presign({ host, path, query = {}, accessKey, secretKey, region = 'auto', service = 's3', now = new Date(), expires = 21600 }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = stamp.slice(0, 8);
  const scope = day + '/' + region + '/' + service + '/aws4_request';
  const q = { ...query, 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': accessKey + '/' + scope, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
  const canonQuery = Object.keys(q).sort().map((k) => enc(k) + '=' + enc(q[k])).join('&');
  const canonPath = path.split('/').map(enc).join('/');
  const canonical = ['GET', canonPath, canonQuery, 'host:' + host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), service), 'aws4_request');
  const sig = createHmac('sha256', key).update(toSign).digest('hex');
  return 'https://' + host + canonPath + '?' + canonQuery + '&X-Amz-Signature=' + sig;
}

export const AUDIO_RE = /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i;
const xmlDecode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function parseList(xml) {
  const files = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(xml))) {
    const k = /<Key>([\s\S]*?)<\/Key>/.exec(m[1]);
    const sz = /<Size>(\d+)<\/Size>/.exec(m[1]);
    if (k) files.push({ key: xmlDecode(k[1]), size: sz ? Number(sz[1]) : 0 });
  }
  const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  return { files, next: /<IsTruncated>true<\/IsTruncated>/.test(xml) && next ? xmlDecode(next[1]) : '' };
}

export function filterFiles(files, q) {
  const words = norm(q).split(/[^a-z0-9ñ]+/).filter(Boolean);
  return files.filter((f) => AUDIO_RE.test(f.key) && words.every((w) => norm(f.key).includes(w)))
    .sort((a, b) => a.key.localeCompare(b.key)).slice(0, 30);
}

export function r2Config(env) {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) return { error: 'Falta configurar en Vercel: ' + missing.join(', ') + '.' };
  return { host: env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com', bucket: env.R2_BUCKET, accessKey: env.R2_ACCESS_KEY_ID, secretKey: env.R2_SECRET_ACCESS_KEY };
}

export async function handleAudio(req, env, fetchFn, now = new Date()) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Usa POST.' } };
  const b = req.body || {};
  const cfg = r2Config(env);
  // Reproducir una canción: no pide sesión. Solo entrega el audio de una canción revisada, que es la que ya se ve sin sesión.
  if (b.action === 'play') {
    if (cfg.error) return { status: 500, body: { error: cfg.error } };
    const id = String(b.id || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { status: 400, body: { error: 'Canción no válida.' } };
    let song = null;
    try {
      const r = await fetchFn('https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(firebaseConfig.projectId) +
        '/databases/(default)/documents/songs/' + encodeURIComponent(id) + '?key=' + encodeURIComponent(firebaseConfig.apiKey), { headers: { referer: 'https://' + String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '') + '/' } });
      if (r.ok) song = fromFirestore(await r.json());
    } catch (e) { return { status: 502, body: { error: 'No se pudo leer la canción.' } }; }
    if (!song || song.status !== 'revisada' || !song.audio || !AUDIO_RE.test(song.audio)) return { status: 404, body: { error: 'Esta canción no tiene audio.' } };
    return { status: 200, body: { url: presign({ host: cfg.host, path: '/' + cfg.bucket + '/' + song.audio, accessKey: cfg.accessKey, secretKey: cfg.secretKey, now, expires: 21600 }) } };
  }
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let owner = false;
  try { owner = await verifyOwner(token, env, fetchFn); } catch (e) { return { status: 502, body: { error: 'No se pudo verificar la sesión.' } }; }
  if (!owner) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  if (cfg.error) return { status: 500, body: { error: cfg.error } };
  const sign = (path, query, expires) => presign({ host: cfg.host, path, query, accessKey: cfg.accessKey, secretKey: cfg.secretKey, now, expires });
  if (b.action === 'url') {
    const key = String(b.key || '');
    if (!key || key.length > 300 || /[\u0000-\u001f]/.test(key) || !AUDIO_RE.test(key)) return { status: 400, body: { error: 'Archivo de audio no válido.' } };
    return { status: 200, body: { url: sign('/' + cfg.bucket + '/' + key, {}, 21600) } };
  }
  if (b.action === 'list') {
    const all = [];
    let token2 = '';
    try {
      for (let i = 0; i < 10; i++) {
        const query = { 'list-type': '2', 'max-keys': '1000' };
        if (token2) query['continuation-token'] = token2;
        const r = await fetchFn(sign('/' + cfg.bucket, query, 300));
        if (!r.ok) return { status: 502, body: { error: 'R2 respondió con error ' + r.status + '. Revisa el bucket y las llaves en Vercel.' } };
        const p = parseList(await r.text());
        all.push(...p.files);
        if (!p.next) break;
        token2 = p.next;
      }
    } catch (e) { return { status: 502, body: { error: 'No se pudo contactar a R2.' } }; }
    return { status: 200, body: { files: filterFiles(all, b.q), total: all.length } };
  }
  return { status: 400, body: { error: 'Acción no válida.' } };
}
