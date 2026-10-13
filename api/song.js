// GET /c/<id> (reescrito por vercel.json a /api/song?id=<id>): la aplicación con la vista previa de la canción.
import { handleSong } from './_song.js';

export default async function handler(req, res) {
  const out = await handleSong(req, fetch);
  res.setHeader('content-type', out.type);
  if (out.status === 200) res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(out.status).send(out.body);
}
