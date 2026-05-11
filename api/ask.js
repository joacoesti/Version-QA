// api/ask.js
// Vercel Serverless Function - POST /api/ask
// Body: { question: string, mode?: 'user' | 'creator', top_k?: number }
// Respuesta: { answer, sources: [{ source, chunk_index, similarity, snippet }], no_match }

import { embed, chat } from '../lib/gemini.js';
import { matchDocuments, logQuery } from '../lib/supabase.js';

const DEFAULT_TOP_K = parseInt(process.env.TOP_K || '5', 10);

const SYSTEM_PROMPT = `Sos un asistente que responde preguntas sobre los manuales de procesos de la empresa.

REGLAS ESTRICTAS:
1. Respondé ÚNICAMENTE con información presente en los fragmentos de manual que te paso a continuación.
2. Si la respuesta NO está en los fragmentos, decí literalmente: "No encuentro esta información en los manuales cargados." y sugerí a quién podría consultar el usuario.
3. NUNCA inventes datos, nombres, plazos, ni procedimientos.
4. Citá la fuente al final de la respuesta, indicando de qué documento sale.
5. Si la pregunta es ambigua, pedí aclaración antes de responder.
6. Respondé en español, claro y completo, cubriendo todos los detalles relevantes presentes en los fragmentos.`;

const CREATOR_EXTRA = `

MODO CREADOR ACTIVADO: además de responder con base en los manuales, al final agregá una sección "SUGERENCIAS DE MEJORA" donde propongas mejores prácticas externas para este proceso/rol. Etiquetá claramente esa sección como sugerencia tuya, NO como parte del manual actual.`;

function buildPrompt(question, chunks, mode) {
  const context = chunks
    .map((c, i) => `[FRAGMENTO ${i + 1} - fuente: ${c.source}]\n${c.content}`)
    .join('\n\n---\n\n');
  const extra = mode === 'creator' ? CREATOR_EXTRA : '';
  return `${SYSTEM_PROMPT}${extra}

=== FRAGMENTOS DE MANUALES ===
${context}

=== PREGUNTA DEL USUARIO ===
${question}

=== TU RESPUESTA ===`;
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
    const { question, mode = 'user', top_k = DEFAULT_TOP_K } = body || {};

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Pregunta invalida.' });
    }

    const queryEmbedding = await embed(question);
    const chunks = await matchDocuments(queryEmbedding, top_k);

    if (chunks.length === 0) {
      const answer = 'No encuentro esta informacion en los manuales cargados. Te recomiendo consultarlo con el responsable del area.';
      await logQuery({ question, answer, sources: [], mode });
      return res.status(200).json({ answer, sources: [], no_match: true });
    }

    const prompt = buildPrompt(question, chunks, mode);
    const answer = await chat(prompt);

    const sources = chunks.map((c) => ({
      source: c.source,
      chunk_index: c.chunk_index,
      similarity: Number(c.similarity.toFixed(3)),
      snippet: c.content.slice(0, 200) + (c.content.length > 200 ? '...' : ''),
    }));

    logQuery({ question, answer, sources, mode });
    return res.status(200).json({ answer, sources, no_match: false });
  } catch (err) {
    console.error('Error en /api/ask:', err);
    return res.status(500).json({
      error: 'Error procesando la pregunta.',
      detail: err.message,
    });
  }
}
