// api/admin/create-role.js
// POST { sectorId, label, sub?, puesto?, persona?, reporta?, nivel?, levelClass? }
// Agrega un rol nuevo a:
//   - data/roles.json
//   - data/jerarquia.json
//   - data/sectores.json (si hay un campo roles[], lo actualizamos)

import { verifyToken, tokenFromReq } from '../../lib/auth.js';
import { getFile, putFile } from '../../lib/github.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function slugify(s) {
  return (s || 'rol')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'rol';
}

async function getJson(path) {
  const f = await getFile(path);
  if (!f.exists) throw new Error('No existe ' + path);
  return { sha: f.sha, data: JSON.parse(Buffer.from(f.content, 'base64').toString('utf-8')) };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyToken(tokenFromReq(req))) return res.status(401).json({ error: 'No autorizado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { sectorId, label, sub, puesto, persona, reporta, nivel, levelClass } = body || {};

    if (!sectorId) return res.status(400).json({ error: 'Falta sectorId' });
    if (!label) return res.status(400).json({ error: 'Falta label' });

    const roleId = slugify(label);

    // 1) Cargar archivos
    const rolesFile = await getJson('data/roles.json');
    const jerarquiaFile = await getJson('data/jerarquia.json');
    const sectoresFile = await getJson('data/sectores.json');

    // Validar sector
    const sector = sectoresFile.data.find((s) => s.id === sectorId);
    if (!sector) return res.status(400).json({ error: 'sectorId no existe: ' + sectorId });

    // Validar duplicado
    let finalId = roleId;
    let counter = 2;
    while (rolesFile.data.find((r) => r.id === finalId)) {
      finalId = roleId + '-' + counter;
      counter++;
    }

    // 2) Agregar a roles.json
    const newRole = {
      id: finalId,
      sectorId,
      label,
      sub: sub || '',
      documentos: [],
      puesto: puesto || label,
      persona: persona || 'Pendiente de asignación',
      estado: 'Rol operativo cargado',
      reporta: reporta || 'Pendiente de definición',
      nivel: nivel || 'Operativo',
    };
    rolesFile.data.push(newRole);

    // 3) Agregar a jerarquia.json
    jerarquiaFile.data[finalId] = {
      reporta: reporta || 'Pendiente de definición',
      nivel: levelClass || 'level-ayudante',
      label: nivel || 'Rol',
    };

    // 4) Agregar a sectores.json (si tiene roles[])
    let sectoresUpdated = false;
    if (Array.isArray(sector.roles) && !sector.roles.includes(finalId)) {
      sector.roles.push(finalId);
      sectoresUpdated = true;
    }

    // 5) Commitear los archivos modificados
    const commitMsg = 'admin: agregar rol ' + label + ' (' + finalId + ')';

    await putFile({
      path: 'data/roles.json',
      contentBase64: Buffer.from(JSON.stringify(rolesFile.data, null, 2) + '\n', 'utf-8').toString('base64'),
      message: commitMsg,
      sha: rolesFile.sha,
    });

    await putFile({
      path: 'data/jerarquia.json',
      contentBase64: Buffer.from(JSON.stringify(jerarquiaFile.data, null, 2) + '\n', 'utf-8').toString('base64'),
      message: commitMsg,
      sha: jerarquiaFile.sha,
    });

    if (sectoresUpdated) {
      await putFile({
        path: 'data/sectores.json',
        contentBase64: Buffer.from(JSON.stringify(sectoresFile.data, null, 2) + '\n', 'utf-8').toString('base64'),
        message: commitMsg,
        sha: sectoresFile.sha,
      });
    }

    return res.status(200).json({ ok: true, roleId: finalId, sectorId, sectoresUpdated });
  } catch (err) {
    console.error('Error en create-role:', err);
    return res.status(500).json({ error: 'Error creando rol', detail: err.message });
  }
}
