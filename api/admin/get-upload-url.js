// api/admin/get-upload-url.js
// POST { fileName, sectorId } -> { signedUrl, token, path, publicUrl }
// El cliente usa la signedUrl para hacer PUT directo a Supabase Storage (evita el limite 4.5MB de Vercel).

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { supabase } from '../../lib/supabase.js';

const BUCKET = 'manuales-originales';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function slugify(s) {
  return (s || 'archivo')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100) || 'archivo';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(tokenFromReq(req))) return res.status(401).json({ error: 'No autorizado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { fileName, sectorId } = body || {};
    if (!fileName) return res.status(400).json({ error: 'Falta fileName' });
    if (!sectorId) return res.status(400).json({ error: 'Falta sectorId' });

    const ts = Date.now();
    const path = (sectorId || 'general') + '/' + ts + '-' + slugify(fileName);

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) return res.status(500).json({ error: 'No pude firmar URL', detail: error.message });

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return res.status(200).json({
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: pub.publicUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error generando upload URL', detail: err.message });
  }
}
