// UNISOL Editor — guarda directo a GitHub via API
const REPO = "joacoesti/Version-QA";
const BRANCH = "main";
const TOKEN_KEY = "unisol-gh-token";
const AUTHOR_KEY = "unisol-gh-author";

const $ = id => document.getElementById(id);
const screen = () => $("edScreen");
const backBtn = () => $("edBack");

let state = { token: null, author: null, documentos: [], current: null };

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }
function getAuthor(){ return localStorage.getItem(AUTHOR_KEY) || ""; }
function setAuthor(a){ localStorage.setItem(AUTHOR_KEY, a); }

// === API helpers ===
async function ghGet(path){
  const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  const r = await fetch(url, { headers: { "Authorization": `Bearer ${state.token}`, "Accept": "application/vnd.github+json" }});
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}
async function ghPut(path, contentText, sha, message){
  const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const body = {
    message: message || `Editar ${path}`,
    content: utf8ToBase64(contentText),
    branch: BRANCH,
    sha: sha
  };
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${state.token}`, "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const e = await r.text();
    throw new Error(`PUT ${path} → ${r.status} · ${e.slice(0,200)}`);
  }
  return r.json();
}
function utf8ToBase64(s){ return btoa(unescape(encodeURIComponent(s))); }
function base64ToUtf8(s){ return decodeURIComponent(escape(atob(s.replace(/\s/g,"")))); }

// === Pantallas ===
function renderTokenScreen(msg){
  backBtn().style.display = "none";
  screen().innerHTML = `
    <div class="content-block">
      <h2 style="font-size:16px;margin-bottom:8px">Configurar acceso a GitHub</h2>
      ${msg ? `<div style="background:var(--rojo-suave);color:var(--rojo);padding:8px 10px;border-radius:8px;margin-bottom:10px;font-size:13px">${msg}</div>` : ""}
      <p style="font-size:13px;color:var(--gris-texto);margin-bottom:10px">Pegá tu Personal Access Token (formato <code>github_pat_...</code>). Se guarda solo en este navegador, no se sube al repo.</p>
      <input id="tokenInput" type="password" placeholder="github_pat_..." value="${getToken()||""}" style="width:100%;padding:10px;border:1px solid var(--borde);border-radius:8px;font-family:monospace;font-size:12px;margin-bottom:8px"/>
      <input id="authorInput" type="text" placeholder="Tu nombre (aparece en los commits)" value="${getAuthor()}" style="width:100%;padding:10px;border:1px solid var(--borde);border-radius:8px;font-size:13px;margin-bottom:10px"/>
      <button id="saveTokenBtn" class="btn-download" style="margin-bottom:6px">Guardar y continuar</button>
      ${getToken() ? `<button id="clearTokenBtn" style="width:100%;background:transparent;color:var(--rojo);border:1px solid var(--rojo);border-radius:10px;padding:10px;font-size:13px;cursor:pointer;font-family:inherit">Borrar token guardado</button>` : ""}
    </div>`;
  $("saveTokenBtn").onclick = () => {
    const t = $("tokenInput").value.trim();
    const a = $("authorInput").value.trim();
    if (!t.startsWith("github_pat_") && !t.startsWith("ghp_")) {
      return renderTokenScreen("Token con formato inválido");
    }
    setToken(t);
    if (a) setAuthor(a);
    state.token = t;
    state.author = a;
    bootDocs();
  };
  if ($("clearTokenBtn")) $("clearTokenBtn").onclick = () => { clearToken(); state.token = null; renderTokenScreen("Token borrado."); };
}

async function bootDocs(){
  backBtn().style.display = "none";
  screen().innerHTML = `<div class="content-block"><p>Cargando documentos…</p></div>`;
  try {
    const r = await fetch("data/documentos-index.json?t=" + Date.now());
    const data = await r.json();
    state.documentos = data.filter(d => d.path && d.tipo === "markdown");
    renderDocList();
  } catch(e) {
    screen().innerHTML = `<div class="content-block"><p style="color:var(--rojo)">Error cargando lista: ${e.message}</p></div>`;
  }
}

function renderDocList(){
  backBtn().style.display = "none";
  let html = `<div class="section-label">Documentos editables</div>`;
  const bySector = {};
  state.documentos.forEach(d => { (bySector[d.sectorId] = bySector[d.sectorId] || []).push(d); });
  for (const sec of Object.keys(bySector).sort()){
    html += `<div class="proc-sector"><div class="proc-sector-title">${sec}</div>`;
    bySector[sec].forEach(d => {
      html += `<div class="doc-card" data-id="${d.id}" style="cursor:pointer">
        <span class="doc-badge">${d.badge || "Doc"}</span>
        <div class="doc-title">${d.titulo}</div>
        <div class="doc-desc">${d.path}</div>
      </div>`;
    });
    html += `</div>`;
  }
  screen().innerHTML = html;
  screen().querySelectorAll(".doc-card[data-id]").forEach(el => {
    el.onclick = () => loadDoc(el.dataset.id);
  });
}

async function loadDoc(docId){
  const d = state.documentos.find(x => x.id === docId);
  if (!d) return;
  state.current = d;
  backBtn().style.display = "inline-block";
  screen().innerHTML = `<div class="content-block"><p>Cargando ${d.titulo}…</p></div>`;
  try {
    const r = await ghGet(d.path);
    const text = base64ToUtf8(r.content);
    renderEditor(d, text, r.sha);
  } catch(e) {
    screen().innerHTML = `<div class="content-block"><p style="color:var(--rojo)">No se pudo cargar: ${e.message}</p>
      <p style="font-size:12px;color:var(--gris-texto)">Verificá que el token tenga permiso <code>Contents: Read and write</code> sobre <code>${REPO}</code>.</p></div>`;
  }
}

function renderEditor(doc, text, sha){
  screen().innerHTML = `
    <div class="ed-toolbar">
      <div class="ed-tabs">
        <button class="ed-tab active" data-mode="edit">✏️ Editar</button>
        <button class="ed-tab" data-mode="preview">👁 Vista previa</button>
      </div>
      <button id="edSaveBtn" class="ed-save">💾 Guardar</button>
    </div>
    <div id="edStatus" class="ed-status"></div>
    <div id="edEdit" class="ed-pane active">
      <textarea id="edText" spellcheck="true"></textarea>
    </div>
    <div id="edPreview" class="ed-pane content-block markdown" style="display:none"></div>
  `;
  $("edText").value = text;
  $("edText").dataset.sha = sha;
  $("edText").dataset.path = doc.path;
  $("edText").dataset.titulo = doc.titulo;

  screen().querySelectorAll(".ed-tab").forEach(b => {
    b.onclick = () => {
      screen().querySelectorAll(".ed-tab").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      const mode = b.dataset.mode;
      $("edEdit").style.display = mode === "edit" ? "block" : "none";
      $("edPreview").style.display = mode === "preview" ? "block" : "none";
      if (mode === "preview") $("edPreview").innerHTML = mdToHTML($("edText").value);
    };
  });
  $("edSaveBtn").onclick = saveCurrent;
}

async function saveCurrent(){
  const text = $("edText").value;
  const sha = $("edText").dataset.sha;
  const path = $("edText").dataset.path;
  const titulo = $("edText").dataset.titulo;
  const author = state.author || getAuthor() || "editor";
  const status = $("edStatus");
  status.textContent = "Guardando…";
  status.className = "ed-status ed-status-info";
  try {
    const res = await ghPut(path, text, sha, `Editar "${titulo}" desde editor (${author})`);
    $("edText").dataset.sha = res.content.sha;
    status.textContent = `✅ Guardado. Vercel desplegará en ~30-60s. Commit: ${res.commit.sha.slice(0,7)}`;
    status.className = "ed-status ed-status-ok";
  } catch(e){
    status.textContent = `❌ Error: ${e.message}`;
    status.className = "ed-status ed-status-err";
  }
}

// === Init ===
$("edConfig").onclick = () => renderTokenScreen();
$("edBack").onclick = () => { state.current = null; renderDocList(); };

const tk = getToken();
if (!tk) {
  renderTokenScreen("Pegá tu Personal Access Token de GitHub para empezar.");
} else {
  state.token = tk;
  state.author = getAuthor();
  bootDocs();
}
