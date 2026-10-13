// Búsqueda de álbum, año y carátula en el catálogo público de iTunes. Sin dependencias, para probarla con fetch simulado.
import { verifyOwner } from './_lib.js';

export function cleanTerm(s) { return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }

export function normalizeResults(json) {
  const seen = new Set(), out = [];
  for (const r of (json && json.results) || []) {
    if (!r || !r.collectionName || !r.artworkUrl100) continue;
    const key = (r.collectionName + '|' + r.artistName).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const m = /^(\d{4})/.exec(r.releaseDate || '');
    out.push({
      song: String(r.trackName || ''), artist: String(r.artistName || ''), album: String(r.collectionName),
      year: m ? m[1] : '', cover: String(r.artworkUrl100).replace(/\/\d+x\d+(bb)?\./, '/600x600bb.')
    });
    if (out.length >= 8) break;
  }
  return out;
}

export async function handleAlbum(req, env, fetchFn) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Usa POST.' } };
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let owner = false;
  try { owner = await verifyOwner(token, env, fetchFn); } catch (e) { return { status: 502, body: { error: 'No se pudo verificar la sesión.' } }; }
  if (!owner) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const b = req.body || {};
  const term = cleanTerm([b.title, b.artist].filter(Boolean).join(' '));
  if (!term) return { status: 400, body: { error: 'Escribe al menos el título.' } };
  let r;
  try {
    r = await fetchFn('https://itunes.apple.com/search?media=music&entity=song&limit=25&term=' + encodeURIComponent(term));
  } catch (e) { return { status: 502, body: { error: 'No se pudo contactar al catálogo de música.' } }; }
  if (!r.ok) return { status: 502, body: { error: 'El catálogo respondió con error ' + r.status + '.' } };
  let j = null;
  try { j = await r.json(); } catch (e) { return { status: 502, body: { error: 'Respuesta ilegible del catálogo.' } }; }
  return { status: 200, body: { results: normalizeResults(j) } };
}
