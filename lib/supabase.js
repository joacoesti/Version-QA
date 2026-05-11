// lib/supabase.js
// Cliente de Supabase. Usa SUPABASE_SERVICE_KEY (clave secreta), nunca exponerla al frontend.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en las env vars.');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export async function deleteBySource(source) {
  const { error } = await supabase.from('documents').delete().eq('source', source);
  if (error) throw error;
}

export async function insertChunks(records) {
  const { error } = await supabase.from('documents').insert(records);
  if (error) throw error;
}

export async function matchDocuments(queryEmbedding, topK = 5, threshold = 0.35) {
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_count: topK,
    similarity_threshold: threshold,
  });
  if (error) throw error;
  return data || [];
}

export async function logQuery({ question, answer, sources, mode }) {
  try {
    await supabase.from('query_logs').insert({ question, answer, sources, mode });
  } catch {
    // log no debe romper la respuesta
  }
}
