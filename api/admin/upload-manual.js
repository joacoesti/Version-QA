// api/admin/upload-manual.js
// POST con JSON: { fileBase64, fileName, sectorId, roleId, titulo, descripcion, badge?, replaceDocId? }
// 1) Convierte .docx (base64) -> markdown via mammoth
// 2) Guarda en docs/{sector}/{slug}.md via GitHub API
// 3) Actualiza data/documentos-index.json (agrega o reemplaza entry)
// Respuesta: { path, docId, commitUrl }

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { getFile, putFile, getDocsIndex, REPO_INFO } from '../../lib/github.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function slugify(s) {
  return (s || 'manual')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'manual';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifyToken(tokenFromReq(req))) return res.status(401).json({ error: 'No autorizado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { fileBase64, fileName, sectorId, roleId, titulo, descripcion, badge, replaceDocId } = body || {};

    if (!fileBase64 || !fileName) return res.status(400).json({ error: 'Falta archivo (fileBase64/fileName)' });
    if (!sectorId) return res.status(400).json({ error: 'Falta sectorId' });
    if (!roleId) return res.status(400).json({ error: 'Falta roleId' });
    if (!titulo) return res.status(400).json({ error: 'Falta titulo' });

    // 1) Decodificar y convertir docx -> markdown
    const buf = Buffer.from(fileBase64, 'base64');
    const mammoth = (await import('mammoth')).default;
    let mdResult;
    try {
      mdResult = await mammoth.convertToMarkdown({ buffer: buf });
    } catch (e) {
      return res.status(400).json({ error: 'No pude convertir el .docx', detail: e.message });
    }
    const markdown = (mdResult.value || '').trim();
    if (markdown.length < 20) {
      return res.status(400).json({ error: 'El documento esta vacio o no se pudo extraer texto' });
    }

    // 2) Determinar path destino: si reemplazo, mantener el path existente
    const { sha: indexSha, data: index } = await getDocsIndex();
    let targetPath;
    let entry;
    if (replaceDocId) {
      entry = index.find((d) => d.id === replaceDocId);
      if (!entry) return res.status(400).json({ error: 'replaceDocId no existe: ' + replaceDocId });
      targetPath = entry.path || 'docs/' + sectorId + '/' + slugify(titulo) + '.md';
      entry.titulo = titulo;
      if (descripcion) entry.descripcion = descripcion;
      if (badge) entry.badge = badge;
      entry.disponible = true;
      entry.tipo = 'markdown';
      entry.path = targetPath;
    } else {
      const slug = slugify(roleId + '-' + titulo);
      targetPath = 'docs/' + sectorId + '/' + slug + '.md';
      const newId = slug.startsWith(sectorId) ? slug : sectorId + '-' + slug;
      // Si ya existe un doc con ese id, le agregamos sufijo
      let finalId = newId;
      let counter = 2;
      while (index.find((d) => d.id === finalId)) {
        finalId = newId + '-' + counter;
        counter++;
      }
      entry = {
        id: finalId,
        documentoId: 'tareas-diarias',
        sectorId,
        roleId,
        badge: badge || 'Documento',
        titulo,
        descripcion: descripcion || '',
        disponible: true,
        tipo: 'markdown',
        path: targetPath,
      };
      index.push(entry);
    }

    // 3) Subir el .md (si existe lo actualizamos con su SHA)
    const existingMd = await getFile(targetPath);
    const mdContentB64 = Buffer.from(markdown, 'utf-8').toString('base64');
    const mdResp = await putFile({
      path: targetPath,
      contentBase64: mdContentB64,
      message: (existingMd.exists ? 'admin: actualizar ' : 'admin: agregar ') + entry.titulo,
      sha: existingMd.exists ? existingMd.sha : undefined,
    });

    // 4) Subir el index actualizado (SIEMPRE update porque ya existe)
    const indexJson = JSON.stringify(index, null, 2) + '\n';
    const indexB64 = Buffer.from(indexJson, 'utf-8').toString('base64');
    const indexResp = await putFile({
      path: 'data/documentos-index.json',
      contentBase64: indexB64,
      message: 'admin: actualizar indice (' + entry.titulo + ')',
      sha: indexSha,
    });

    return res.status(200).json({
      ok: true,
      path: targetPath,
      docId: entry.id,
      commitUrl: mdResp.commit?.html_url || null,
      indexCommitUrl: indexResp.commit?.html_url || null,
      markdown_preview: markdown.slice(0, 500),
      repo: REPO_INFO,
    });
  } catch (err) {
    console.error('Error en upload-manual:', err);
    return res.status(500).json({ error: 'Error procesando el upload', detail: err.message });
  }
}
