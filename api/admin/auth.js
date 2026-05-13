// api/admin/auth.js - POST { password } -> { token } | 401
import { checkPassword, signToken } from '../../lib/auth.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const password = body?.password;
    if (!checkPassword(password)) {
      return res.status(401).json({ error: 'Password incorrecta' });
    }
    const token = signToken();
    return res.status(200).json({ token, expires_in_hours: 8 });
  } catch (err) {
    return res.status(500).json({ error: 'Error de autenticacion', detail: err.message });
  }
}
