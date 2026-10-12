// POST /api/read  { mode: 'segment' | 'transcribe', images: [dataUrl], hint? }
// Cabecera: Authorization: Bearer <token de Firebase>. Variables en Vercel: ANTHROPIC_API_KEY, OWNER_EMAIL,
// (el tiempo máximo de 60 s se define en vercel.json) y opcionales ANTHROPIC_MODEL (transcripción, por defecto claude-opus-5-5) y ANTHROPIC_MODEL_SEGMENT (por defecto claude-sonnet-5-5).
import { handle } from './_lib.js';

export default async function handler(req, res) {
  const out = await handle(req, process.env, fetch);
  res.status(out.status).json(out.body);
}
