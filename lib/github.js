// lib/github.js
// Helpers para commitear archivos al repo via GitHub REST API.
// Requiere env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH (default: main)

const OWNER = process.env.GITHUB_OWNER || 'joacoesti';
const REPO = process.env.GITHUB_REPO || 'Version-QA';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

function headers() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN no esta seteada en env vars de Vercel.');
  return {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'unisol-admin-uploader',
  };
}

const API = 'https://api.github.com';

// GET contenido de un archivo en el repo. Devuelve { sha, content (base64), exists }
export async function getFile(path) {
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return { exists: false, sha: null, content: null };
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('GitHub getFile ' + res.status + ': ' + txt);
  }
  const data = await res.json();
  return { exists: true, sha: data.sha, content: data.content };
}

// Lee el JSON de documentos-index.json del repo
export async function getDocsIndex() {
  const f = await getFile('data/documentos-index.json');
  if (!f.exists) throw new Error('data/documentos-index.json no existe en el repo');
  const json = Buffer.from(f.content, 'base64').toString('utf-8');
  return { sha: f.sha, data: JSON.parse(json) };
}

// PUT (crea o actualiza) un archivo. Si actualiza, se necesita el sha previo.
export async function putFile({ path, contentBase64, message, sha }) {
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: contentBase64,
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('GitHub putFile ' + res.status + ': ' + txt);
  }
  return await res.json();
}

// Helper para obtener el contenido raw de un archivo (sin pasar por la API de contenidos)
export async function getRawFile(path) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'unisol-admin' } });
  if (!res.ok) throw new Error('No se pudo leer raw ' + path + ': HTTP ' + res.status);
  return await res.text();
}

export const REPO_INFO = { owner: OWNER, repo: REPO, branch: BRANCH };

// DELETE archivo en el repo (necesita el sha actual)
export async function deleteFile({ path, sha, message }) {
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('GitHub deleteFile ' + res.status + ': ' + txt);
  }
  return await res.json();
}
