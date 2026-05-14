// api/admin/reingest-file.js
// POST { path: "abastecimiento/encargado-x.md" }  (sin "docs/" prefix)
// Lee el .md del repo, lo chunkea, genera embeddings y upserta en Supabase.

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { getFile } from '../../lib/github.js';
import { chunkText } from '../../lib/chunker.js';
import { embedBatch } from '../../lib/gemini.js';
import { deleteBySource, insertChunks } from '../../lib/supabase.js';

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
    let { path: relativePath } = body || {};
    if (!relativePath) return res.status(400).json({ error: 'Falta path' });

    // Normalizar: aceptar tanto "docs/abc.md" como "abc.md"
    relativePath = relativePath.replace(/\\/g, '/');
    const fullPath = relativePath.startsWith('docs/') ? relativePath : 'docs/' + relativePath;
    const source = fullPath.replace(/^docs\//, '');

    // 1) Bajar el .md del repo via API (siempre fresca, sin delay de CDN despues de un commit reciente)
    const fileObj = await getFile(fullPath);
    if (!fileObj.exists) {
      return res.status(404).json({ error: 'No existe en el repo: ' + fullPath });
    }
    const text = Buffer.from(fileObj.content, 'base64').toString('utf-8');
    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: 'Documento vacio' });
    }

    // 2) Chunkear
    const chunks = chunkText(text);

    // 3) Embeddings (sin throttling agresivo - solo 1 doc, free tier alcanza)
    const embeddings = await embedBatch(chunks);

    // 4) Borrar chunks viejos de este source
    await deleteBySource(source);

    // 5) Insertar nuevos
    const records = chunks.map((content, i) => ({
      source,
      chunk_index: i,
      content,
      embedding: embeddings[i],
      metadata: { ext: '.md', folder: source.split('/').slice(0, -1).join('/') },
    }));
    await insertChunks(records);

    return res.status(200).json({
      ok: true,
      source,
      chunks: records.length,
    });
  } catch (err) {
    console.error('Error en reingest-file:', err);
    return res.status(500).json({ error: 'Error reingestando', detail: err.message });
  }
}
