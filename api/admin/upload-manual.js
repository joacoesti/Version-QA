// api/admin/upload-manual.js
// POST con JSON: { markdown, fileName, sectorId, roleId, titulo, descripcion, badge?, replaceDocId? }
// Recibe el markdown YA CONVERTIDO en el cliente (mammoth.browser) y solo se encarga de commitear.
// Esto evita el limite de 4.5MB de body de Vercel (el .docx puede ser grande, el .md es chico).

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { getFile, putFile, getDocsIndex, REPO_INFO } from '../../lib/github.js';

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
    const { markdown, fileName, sectorId, roleId, titulo, descripcion, badge, replaceDocId, originalUrl, originalPath } = body || {};

    if (!markdown || markdown.trim().length < 20) {
      return res.status(400).json({ error: 'Markdown vacio o muy corto' });
    }
    if (!sectorId) return res.status(400).json({ error: 'Falta sectorId' });
    if (!roleId) return res.status(400).json({ error: 'Falta roleId' });
    if (!titulo) return res.status(400).json({ error: 'Falta titulo' });

    const cleanMarkdown = markdown.trim();

    // 1) Determinar path destino y entrada en el index
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
      if (originalUrl) entry.originalUrl = originalUrl;
      if (originalPath) entry.originalPath = originalPath;
    } else {
      const slug = slugify(roleId + '-' + titulo);
      targetPath = 'docs/' + sectorId + '/' + slug + '.md';
      const newId = slug.startsWith(sectorId) ? slug : sectorId + '-' + slug;
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
      if (originalUrl) entry.originalUrl = originalUrl;
      if (originalPath) entry.originalPath = originalPath;
      index.push(entry);
    }

    // 2) Subir el .md (si existe lo actualizamos con su SHA)
    const existingMd = await getFile(targetPath);
    const mdContentB64 = Buffer.from(cleanMarkdown, 'utf-8').toString('base64');
    const mdResp = await putFile({
      path: targetPath,
      contentBase64: mdContentB64,
      message: (existingMd.exists ? 'admin: actualizar ' : 'admin: agregar ') + entry.titulo,
      sha: existingMd.exists ? existingMd.sha : undefined,
    });

    // 3) Subir el index actualizado
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
      markdown_preview: cleanMarkdown.slice(0, 500),
      repo: REPO_INFO,
    });
  } catch (err) {
    console.error('Error en upload-manual:', err);
    return res.status(500).json({ error: 'Error procesando el upload', detail: err.message });
  }
}
