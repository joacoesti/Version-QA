// lib/gemini.js
// Wrapper del SDK @google/genai con BATCH embeddings para soportar documentos grandes.
// Modelos:
//   - Embeddings: gemini-embedding-001 (con outputDimensionality=768 para matchear schema Supabase)
//   - Chat:       gemini-2.5-flash (thinking deshabilitado para mejor speed/tokens)

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY no esta seteada en env vars.');
}

const ai = new GoogleGenAI({ apiKey });

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;
const CHAT_MODEL = 'gemini-2.5-flash';

// Tamano del batch para embedContent. La API acepta hasta ~100 por call.
const BATCH_SIZE = 50;

export async function embed(text) {
  const result = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { outputDimensionality: EMBED_DIMS },
  });
  const values = result?.embeddings?.[0]?.values;
  if (!values || !Array.isArray(values)) {
    throw new Error('Respuesta inesperada de embedContent: ' + JSON.stringify(result));
  }
  return values;
}

/**
 * Genera embeddings para un array de textos en BATCH (una sola request por batch).
 * Para docs grandes esto es ordenes de magnitud mas rapido que llamar 1 por 1.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: batch,
      config: { outputDimensionality: EMBED_DIMS },
    });
    const embeddings = result?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
      throw new Error('Batch embed devolvio cantidad inesperada: ' + (embeddings ? embeddings.length : 'null') + ' (esperaba ' + batch.length + ')');
    }
    for (const e of embeddings) {
      if (!e?.values || !Array.isArray(e.values)) {
        throw new Error('Batch embed: item sin values');
      }
      out.push(e.values);
    }
  }
  return out;
}

export async function chat(prompt) {
  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = response?.text;
  if (typeof text !== 'string') {
    throw new Error('Respuesta inesperada de generateContent: ' + JSON.stringify(response));
  }
  return text;
}
