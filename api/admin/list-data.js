// api/admin/list-data.js - GET -> { sectores, roles, documentos }
// Devuelve los datos actuales para llenar dropdowns del form admin

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { getRawFile } from '../../lib/github.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifyToken(tokenFromReq(req))) return res.status(401).json({ error: 'No autorizado' });

  try {
    const [sec, rol, doc] = await Promise.all([
      getRawFile('data/sectores.json'),
      getRawFile('data/roles.json'),
      getRawFile('data/documentos-index.json'),
    ]);
    return res.status(200).json({
      sectores: JSON.parse(sec),
      roles: JSON.parse(rol),
      documentos: JSON.parse(doc),
    });
  } catch (err) {
    return res.status(500).json({ error: 'No pude leer la data', detail: err.message });
  }
}
