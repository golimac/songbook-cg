// Vista previa de un enlace /c/<id>: sirve index.html con etiquetas Open Graph de la canción (título, artista, carátula).
// Sin dependencias, para probarla con fetch simulado. Lee la canción con la API REST de Firestore, sin sesión:
// las reglas solo dejan leer las canciones revisadas, así que una pendiente cae en la vista genérica.
import { firebaseConfig } from '../public/js/firebase-config.js';

export const SITE = 'Songbook CG';

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function fromFirestore(doc) {
  const f = (doc && doc.fields) || {};
  const out = {};
  for (const k of Object.keys(f)) {
    const v = f[k];
    out[k] = v.stringValue != null ? v.stringValue : v.integerValue != null ? Number(v.integerValue) : '';
  }
  return out;
}

export function describe(song) {
  const bits = [];
  if (song.album) bits.push(song.album + (song.year ? ' (' + song.year + ')' : ''));
  if (song.key) bits.push('Tonalidad ' + song.key);
  return ['Letra y acordes', ...bits].join(' · ');
}

export function buildTags(song, url) {
  const title = song && song.title ? song.title + (song.artist ? ' — ' + song.artist : '') : SITE;
  const desc = song && song.title ? describe(song) : 'Cancionero personal con letras y acordes.';
  const cover = song && /^https:\/\/[^\s"'<>]+$/.test(song.cover || '') ? song.cover : '';
  const tags = [
    ['og:site_name', SITE], ['og:type', 'website'], ['og:title', title], ['og:description', desc], ['og:url', url],
    ...(cover ? [['og:image', cover]] : []),
    ['twitter:card', 'summary'], ['twitter:title', title], ['twitter:description', desc],
    ...(cover ? [['twitter:image', cover]] : [])
  ];
  return { title: (song && song.title ? song.title + ' · ' : '') + SITE, desc, tags };
}

export function injectMeta(html, t) {
  const meta = t.tags.map(([k, v]) => '<meta ' + (k.startsWith('og:') ? 'property' : 'name') + '="' + k + '" content="' + esc(v) + '">').join('\n') +
    '\n<meta name="description" content="' + esc(t.desc) + '">';
  let out = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(t.title) + '</title>');
  out = out.replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="noindex, nofollow">\n' + meta);
  return out;
}

export async function handleSong(req, fetchFn) {
  const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
  const id = String((req.query && req.query.id) || '');
  const origin = 'https://' + host;
  if (!host) return { status: 400, type: 'text/plain; charset=utf-8', body: 'Falta el host.' };
  let html;
  try {
    const r = await fetchFn(origin + '/index.html');
    if (!r.ok) throw new Error('index ' + r.status);
    html = await r.text();
  } catch (e) { return { status: 502, type: 'text/plain; charset=utf-8', body: 'No se pudo cargar la aplicación.' }; }
  let song = null;
  if (/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    try {
      const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(firebaseConfig.projectId) +
        '/databases/(default)/documents/songs/' + encodeURIComponent(id) + '?key=' + encodeURIComponent(firebaseConfig.apiKey);
      const r = await fetchFn(url);
      if (r.ok) { const s = fromFirestore(await r.json()); if (s.status === 'revisada') song = s; }
    } catch (e) { /* vista genérica */ }
  }
  const tags = buildTags(song, origin + '/c/' + encodeURIComponent(id));
  return { status: 200, type: 'text/html; charset=utf-8', body: injectMeta(html, tags) };
}
