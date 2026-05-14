// api/ask.js
// POST /api/ask
// Body: { question, mode?: 'user'|'creator', top_k?, history?: [{role, content}] }

import { embed, chat } from '../lib/gemini.js';
import { matchDocuments, logQuery, countQueriesToday } from '../lib/supabase.js';

const DEFAULT_TOP_K = parseInt(process.env.TOP_K || '8', 10);
const MAX_DAILY_QUERIES = parseInt(process.env.MAX_DAILY_QUERIES || '200', 10);

// Sectores (matchean con las carpetas de docs/)
const SECTORS = ['abastecimiento', 'cocina', 'panificadora', 'fiambreria'];

// Sinonimos para detectar el sector en la pregunta (todo minusculas, sin tildes)
const SECTOR_SYNONYMS = {
  abastecimiento: ['abastecimiento', 'compras', 'pedido', 'pedidos', 'insumos', 'mercaderia', 'mercaderia general', 'papeleria', 'proveedor', 'proveedores', 'modulo', 'modulos', 'isla', 'gondola', 'gondolas', 'stock', 'reposicion', 'productos', 'etiqueta', 'etiquetas', 'vida util', 'control de modulos', 'isla congelados', 'congelados'],
  cocina: ['cocina', 'cocinero', 'cocineros', 'jefe de cocina', 'auxiliar de cocina', 'ayudante de cocina', 'platos', 'guarnicion', 'guarniciones'],
  panificadora: ['panificadora', 'pan', 'panes', 'panadero', 'panaderia', 'factura', 'facturas', 'productor', 'camara de frio', 'camaras de frio', 'ingreso sector', 'jefe operativo', 'masa', 'masas'],
  fiambreria: ['fiambreria', 'fiambre', 'fiambres', 'jamon', 'queso', 'embutido'],
};

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function detectSector(question) {
  const q = normalize(question);
  for (const sector of SECTORS) {
    const syns = SECTOR_SYNONYMS[sector] || [sector];
    for (const syn of syns) {
      // Buscar como palabra completa
      const re = new RegExp('\\b' + syn.replace(/\s+/g, '\\s+') + '\\b');
      if (re.test(q)) return sector;
    }
  }
  return null;
}

const SYSTEM_PROMPT = `Sos el asistente interno de UNISOL. Respondes a empleados consultas sobre los manuales de procesos cargados.

REGLAS ESTRICTAS:
1. Respondé UNICAMENTE con informacion presente en los FRAGMENTOS que te paso a continuacion.
2. Cuando uses informacion de un fragmento, citalo INLINE con su numero entre corchetes. Ejemplo: "Los pedidos se hacen los lunes [1] y los miercoles [2]."
3. Podes citar el mismo fragmento varias veces si corresponde. Usa los numeros que te indico en cada fragmento.
4. Si la respuesta NO esta en los fragmentos, decí exactamente: "No encuentro esta informacion en los manuales cargados." y sugeri a quien podria consultar el usuario.
5. Si los fragmentos hablan de un sector DIFERENTE al que pregunta el usuario, NO mezcles: aclara que no tenes info especifica de ese sector.
6. NUNCA inventes datos, nombres, plazos, ni procedimientos.
7. Respondé en español, claro y bien estructurado. Si la respuesta tiene multiples puntos, usa listas con guiones.
8. Despues de tu respuesta, en una linea aparte que empiece con "SUGERENCIAS:" proponé 3 preguntas de seguimiento cortas separadas por " | ". Ejemplo: SUGERENCIAS: Que pasa si no hay stock? | Quien aprueba pedidos extra? | Como se registra el ingreso?`;

const CREATOR_EXTRA = `

MODO CREADOR ACTIVADO: ademas de responder con base en los manuales, al final agregá una seccion "SUGERENCIAS DE MEJORA" donde propongas mejores practicas externas. Etiquetala claramente como sugerencia tuya, NO como parte del manual.`;

function buildHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const recent = history.slice(-6);
  const lines = recent.map((m) => (m.role === 'assistant' ? 'AGENTE: ' : 'USUARIO: ') + m.content);
  return '\n=== HISTORIAL DE CONVERSACION ===\n' + lines.join('\n') + '\n';
}

function buildPrompt(question, chunks, mode, history, detectedSector) {
  const context = chunks
    .map((c, i) => '[' + (i + 1) + '] (fuente: ' + c.source + ')\n' + c.content)
    .join('\n\n---\n\n');
  const extra = mode === 'creator' ? CREATOR_EXTRA : '';
  const historyBlock = buildHistoryBlock(history);
  const sectorHint = detectedSector
    ? '\nNOTA: El usuario pregunta sobre el sector "' + detectedSector + '". Los fragmentos siguientes son de ese sector.\n'
    : '';

  return SYSTEM_PROMPT + extra + sectorHint + historyBlock + '\n=== FRAGMENTOS DE MANUALES ===\n' + context + '\n\n=== PREGUNTA DEL USUARIO ===\n' + question + '\n\n=== TU RESPUESTA ===';
}

function parseAnswerAndSuggestions(raw) {
  const match = raw.match(/^([\s\S]*?)\n\s*SUGERENCIAS:\s*(.+?)\s*$/);
  if (!match) return { answer: raw.trim(), suggestions: [] };
  return {
    answer: match[1].trim(),
    suggestions: match[2].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3),
  };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Usa POST.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { question, mode = 'user', top_k = DEFAULT_TOP_K, history = [] } = body || {};

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Pregunta invalida.' });
    }

    // Rate limit diario: si se supera el cap, rechazamos
    const queriesToday = await countQueriesToday();
    if (queriesToday >= MAX_DAILY_QUERIES) {
      return res.status(429).json({
        error: 'Limite diario alcanzado',
        detail: 'Se alcanzo el limite de ' + MAX_DAILY_QUERIES + ' consultas diarias para hoy. Volvé a intentarlo manana.',
        queries_today: queriesToday,
        daily_limit: MAX_DAILY_QUERIES,
      });
    }

    const detectedSector = detectSector(question);
    const queryEmbedding = await embed(question);

    // Si detectamos sector, pedimos extra y filtramos
    const searchTopK = detectedSector ? top_k * 3 : top_k;
    let chunks = await matchDocuments(queryEmbedding, searchTopK, 0.2);

    if (detectedSector) {
      const filtered = chunks.filter((c) => {
        const src = (c.source || '').toLowerCase();
        const folder = (c.metadata?.folder || '').toLowerCase();
        return src.startsWith(detectedSector + '/') || folder.startsWith(detectedSector);
      });
      // Si el filtrado deja al menos un chunk razonable, lo usamos. Si queda vacio, mantenemos los originales pero advertimos al modelo
      if (filtered.length > 0) {
        chunks = filtered.slice(0, top_k);
      } else {
        chunks = chunks.slice(0, top_k);
      }
    } else {
      chunks = chunks.slice(0, top_k);
    }

    if (chunks.length === 0) {
      const answer = 'No encuentro esta informacion en los manuales cargados. Te recomiendo consultarlo con el responsable del area.';
      await logQuery({ question, answer, sources: [], mode });
      return res.status(200).json({ answer, sources: [], suggestions: [], no_match: true, detected_sector: detectedSector });
    }

    const prompt = buildPrompt(question, chunks, mode, history, detectedSector);
    const raw = await chat(prompt);
    const { answer, suggestions } = parseAnswerAndSuggestions(raw);

    const sources = chunks.map((c, i) => ({
      ref: i + 1,
      source: c.source,
      chunk_index: c.chunk_index,
      similarity: Number(c.similarity.toFixed(3)),
      snippet: c.content.slice(0, 350) + (c.content.length > 350 ? '...' : ''),
    }));

    logQuery({ question, answer, sources, mode });
    return res.status(200).json({
      answer,
      sources,
      suggestions,
      no_match: false,
      detected_sector: detectedSector,
      queries_today: queriesToday + 1,
      daily_limit: MAX_DAILY_QUERIES,
    });
  } catch (err) {
    console.error('Error en /api/ask:', err);
    return res.status(500).json({ error: 'Error procesando la pregunta.', detail: err.message });
  }
}
