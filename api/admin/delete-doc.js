// api/admin/delete-doc.js
// POST { docId }
// 1) Borra entry de documentos-index.json (commit)
// 2) Borra el .md del repo (commit)
// 3) Borra los chunks correspondientes de Supabase
// 4) Borra el original de Supabase Storage (si existe)

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { getFile, getDocsIndex, putFile, deleteFile } from '../../lib/github.js';
import { supabase, deleteBySource } from '../../lib/supabase.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(tokenFromReq(req))) return res.status(401).json({ error: 'No autorizado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { docId } = body || {};
    if (!docId) return res.status(400).json({ error: 'Falta docId' });

    // 1) Cargar index
    const { sha: indexSha, data: index } = await getDocsIndex();
    const idx = index.findIndex((d) => d.id === docId);
    if (idx === -1) return res.status(404).json({ error: 'docId no existe: ' + docId });

    const entry = index[idx];
    const mdPath = entry.path;
    const originalPath = entry.originalPath;

    // 2) Sacar del index y commitear
    index.splice(idx, 1);
    const indexJson = JSON.stringify(index, null, 2) + '\n';
    await putFile({
      path: 'data/documentos-index.json',
      contentBase64: Buffer.from(indexJson, 'utf-8').toString('base64'),
      message: 'admin: borrar ' + entry.titulo,
      sha: indexSha,
    });

    const results = { index: true };

    // 3) Borrar el .md si existe en repo
    if (mdPath) {
      try {
        const mdFile = await getFile(mdPath);
        if (mdFile.exists) {
          await deleteFile({
            path: mdPath,
            sha: mdFile.sha,
            message: 'admin: eliminar ' + entry.titulo,
          });
          results.markdown_deleted = true;
        }
      } catch (e) {
        results.markdown_error = e.message;
      }
    }

    // 4) Borrar chunks de Supabase
    try {
      const source = (mdPath || '').replace(/^docs\//, '');
      if (source) {
        await deleteBySource(source);
        results.chunks_deleted = true;
      }
    } catch (e) {
      results.chunks_error = e.message;
    }

    // 5) Borrar original de Storage
    if (originalPath) {
      try {
        const { error } = await supabase.storage.from('manuales-originales').remove([originalPath]);
        if (!error) results.storage_deleted = true;
        else results.storage_error = error.message;
      } catch (e) {
        results.storage_error = e.message;
      }
    }

    return res.status(200).json({ ok: true, docId, ...results });
  } catch (err) {
    return res.status(500).json({ error: 'Error borrando documento', detail: err.message });
  }
}
