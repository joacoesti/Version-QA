// api/debug-env.js
// ENDPOINT TEMPORAL DE DIAGNOSTICO - BORRAR DESPUES DE USAR
// Solo expone presencia y longitudes de las env vars, NUNCA los valores.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const gemini = process.env.GEMINI_API_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  res.status(200).json({
    GEMINI_API_KEY: {
      present: !!gemini,
      length: gemini?.length || 0,
      starts_with: gemini ? gemini.slice(0, 4) + '...' : null,
      has_whitespace: gemini ? /\s/.test(gemini) : false,
      has_quotes: gemini ? /["']/.test(gemini) : false,
    },
    SUPABASE_URL: {
      present: !!supaUrl,
      value_starts_with: supaUrl ? supaUrl.slice(0, 20) + '...' : null,
      ends_in_supabase_co: supaUrl ? supaUrl.endsWith('.supabase.co') : false,
    },
    SUPABASE_SERVICE_KEY: {
      present: !!supaKey,
      length: supaKey?.length || 0,
      starts_with: supaKey ? supaKey.slice(0, 4) + '...' : null,
    },
    node_version: process.version,
    deployed_at: new Date().toISOString(),
  });
}
