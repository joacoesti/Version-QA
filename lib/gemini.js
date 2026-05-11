// lib/gemini.js
// Wrapper del SDK nuevo de Google Gemini (@google/genai).
// Modelos vigentes:
//   - Embeddings: gemini-embedding-001 (outputDimensionality=768 para matchear el schema)
//   - Chat:       gemini-2.5-flash (free tier, con thinking deshabilitado para no gastar budget)

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY no esta seteada en las env vars.');
}

const ai = new GoogleGenAI({ apiKey });

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;
const CHAT_MODEL = 'gemini-2.5-flash';

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

export async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    out.push(await embed(texts[i]));
    if (i < texts.length - 1) await sleep(150);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
