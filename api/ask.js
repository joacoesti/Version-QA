// api/ask.js
// Vercel Serverless Function - POST /api/ask
// Body: { question, mode?: 'user'|'creator', top_k?, history?: [{role, content}] }
// Respuesta: { answer, sources: [{ source, chunk_index, similarity, snippet }], no_match, suggestions: string[] }

import { embed, chat } from '../lib/gemini.js';
import { matchDocuments, logQuery } from '../lib/supabase.js';

const DEFAULT_TOP_K = parseInt(process.env.TOP_K || '6', 10);

const SYSTEM_PROMPT = `Sos el asistente interno de UNISOL. Respondes a empleados consultas sobre los manuales de procesos cargados.

REGLAS ESTRICTAS:
1. Respondé UNICAMENTE con informacion presente en los FRAGMENTOS que te paso a continuacion.
2. Cuando uses informacion de un fragmento, citalo INLINE con su numero entre corchetes. Ejemplo: "Los pedidos se hacen los lunes [1] y los miercoles [2]."
3. Podes citar el mismo fragmento varias veces si corresponde. Usa los numeros que te indico en cada fragmento.
4. Si la respuesta NO esta en los fragmentos, decí exactamente: "No encuentro esta informacion en los manuales cargados." y sugeri a quien podria consultar el usuario.
5. NUNCA inventes datos, nombres, plazos, ni procedimientos.
6. Respondé en español, claro y bien estructurado. Si la respuesta tiene multiples puntos, usa listas con guiones.
7. Despues de tu respuesta, en una linea aparte que empiece con "SUGERENCIAS:" proponé 3 preguntas de seguimiento cortas que el usuario podria hacer a continuacion, separadas por " | ". Ejemplo: SUGERENCIAS: Que pasa si no hay stock? | Quien aprueba pedidos extra? | Como se registra el ingreso?`;

const CREATOR_EXTRA = `

MODO CREADOR ACTIVADO: ademas de responder con base en los manuales, al final agregá una seccion "SUGERENCIAS DE MEJORA" donde propongas mejores practicas externas. Etiquetala claramente como sugerencia tuya, NO como parte del manual.`;

function buildHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const recent = history.slice(-6); // ultimas 6 entradas (3 pares pregunta/respuesta)
  const lines = recent.map((m) => {
    const role = m.role === 'assistant' ? 'AGENTE' : 'USUARIO';
    return role + ': ' + m.content;
  });
  return '\n=== HISTORIAL DE CONVERSACION ===\n' + lines.join('\n') + '\n';
}

function buildPrompt(question, chunks, mode, history) {
  const context = chunks
    .map((c, i) => '[' + (i + 1) + '] (fuente: ' + c.source + ')\n' + c.content)
    .join('\n\n---\n\n');
  const extra = mode === 'creator' ? CREATOR_EXTRA : '';
  const historyBlock = buildHistoryBlock(history);

  return SYSTEM_PROMPT + extra + '\n' + historyBlock + '\n=== FRAGMENTOS DE MANUALES ===\n' + context + '\n\n=== PREGUNTA DEL USUARIO ===\n' + question + '\n\n=== TU RESPUESTA ===';
}

function parseAnswerAndSuggestions(raw) {
  // Separa la respuesta principal de la linea "SUGERENCIAS: a | b | c"
  const match = raw.match(/^([\s\S]*?)\n\s*SUGERENCIAS:\s*(.+?)\s*$/);
  if (!match) return { answer: raw.trim(), suggestions: [] };
  const answer = match[1].trim();
  const suggestions = match[2]
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);
  return { answer, suggestions };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Usa POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { question, mode = 'user', top_k = DEFAULT_TOP_K, history = [] } = body || {};

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Pregunta invalida.' });
    }

    const queryEmbedding = await embed(question);
    const chunks = await matchDocuments(queryEmbedding, top_k);

    if (chunks.length === 0) {
      const answer = 'No encuentro esta informacion en los manuales cargados. Te recomiendo consultarlo con el responsable del area.';
      await logQuery({ question, answer, sources: [], mode });
      return res.status(200).json({ answer, sources: [], suggestions: [], no_match: true });
    }

    const prompt = buildPrompt(question, chunks, mode, history);
    const raw = await chat(prompt);
    const { answer, suggestions } = parseAnswerAndSuggestions(raw);

    const sources = chunks.map((c, i) => ({
      ref: i + 1, // numero de cita (matchea con los [1], [2] del answer)
      source: c.source,
      chunk_index: c.chunk_index,
      similarity: Number(c.similarity.toFixed(3)),
      snippet: c.content.slice(0, 350) + (c.content.length > 350 ? '...' : ''),
    }));

    logQuery({ question, answer, sources, mode });
    return res.status(200).json({ answer, sources, suggestions, no_match: false });
  } catch (err) {
    console.error('Error en /api/ask:', err);
    return res.status(500).json({
      error: 'Error procesando la pregunta.',
      detail: err.message,
    });
  }
}
