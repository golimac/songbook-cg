// POST /api/audio  { action: 'list', q } | { action: 'url', key }  con Authorization: Bearer <token de Firebase>.
// Variables en Vercel: OWNER_EMAIL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { handleAudio } from './_audio.js';

export default async function handler(req, res) {
  const out = await handleAudio(req, process.env, fetch);
  res.status(out.status).json(out.body);
}
