// POST /api/album  { title, artist }  con Authorization: Bearer <token de Firebase>. Variable en Vercel: OWNER_EMAIL.
import { handleAlbum } from './_album.js';

export default async function handler(req, res) {
  const out = await handleAlbum(req, process.env, fetch);
  res.status(out.status).json(out.body);
}
