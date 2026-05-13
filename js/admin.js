// js/admin.js - Logica de la pagina admin: login, upload de .docx, re-ingest
(function () {
  'use strict';

  const TOKEN_KEY = 'unisol_admin_token';
  let SECTORES = [];
  let ROLES = [];
  let DOCUMENTOS = [];
  let LAST_UPLOAD = null;

  // ===== Helpers de fetch con token =====

  function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

  async function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = 'Bearer ' + getToken();
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return await fetch(path, opts);
  }

  // ===== LOGIN =====

  const $loginForm = document.getElementById('adm-login-form');
  const $pwd = document.getElementById('adm-pwd');
  const $loginErr = document.getElementById('adm-login-err');
  const $login = document.getElementById('adm-login');
  const $main = document.getElementById('adm-main');

  $loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    $loginErr.textContent = '';
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $pwd.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        $loginErr.textContent = data.error || 'Error';
        return;
      }
      setToken(data.token);
      $pwd.value = '';
      await enterAdmin();
    } catch (err) {
      $loginErr.textContent = 'Error de red: ' + err.message;
    }
  });

  async function enterAdmin() {
    $login.style.display = 'none';
    $main.style.display = '';
    await loadData();
  }

  // ===== AUTO-LOGIN si hay token =====

  async function tryAutoLogin() {
    if (!getToken()) return;
    try {
      const res = await apiFetch('/api/admin/list-data');
      if (res.ok) {
        await enterAdmin();
      } else {
        clearToken();
      }
    } catch {
      clearToken();
    }
  }

  // ===== LOGOUT =====

  document.getElementById('adm-logout').addEventListener('click', function () {
    clearToken();
    $main.style.display = 'none';
    $login.style.display = '';
  });

  // ===== DATA: sectores, roles, documentos =====

  async function loadData() {
    const res = await apiFetch('/api/admin/list-data');
    if (!res.ok) {
      alert('Error cargando data');
      return;
    }
    const data = await res.json();
    SECTORES = data.sectores;
    ROLES = data.roles;
    DOCUMENTOS = data.documentos;

    const $sec = document.getElementById('adm-sector');
    $sec.innerHTML = SECTORES.map(s => '<option value="' + s.id + '">' + s.label + '</option>').join('');
    $sec.addEventListener('change', updateRoles);

    const $rep = document.getElementById('adm-replace-doc');
    $rep.innerHTML = DOCUMENTOS
      .filter(d => d.disponible && d.path)
      .map(d => '<option value="' + d.id + '">' + d.titulo + ' (' + d.sectorId + '/' + d.roleId + ')</option>')
      .join('');

    updateRoles();
  }

  function updateRoles() {
    const sectorId = document.getElementById('adm-sector').value;
    const filteredRoles = ROLES.filter(r => r.sectorId === sectorId);
    const $role = document.getElementById('adm-role');
    $role.innerHTML = filteredRoles.length
      ? filteredRoles.map(r => '<option value="' + r.id + '">' + r.label + '</option>').join('')
      : '<option value="">(Sin roles definidos para este sector)</option>';
  }

  // ===== Toggle nuevo / reemplazar =====

  document.querySelectorAll('input[name="adm-op"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      const isReplace = document.querySelector('input[name="adm-op"]:checked').value === 'replace';
      document.getElementById('adm-replace-block').style.display = isReplace ? '' : 'none';
      document.getElementById('adm-new-block').style.display = isReplace ? 'none' : '';
    });
  });

  // ===== FILE INPUT / DROPZONE =====

  const $dropzone = document.getElementById('adm-dropzone');
  const $file = document.getElementById('adm-file');
  const $filename = document.getElementById('adm-filename');
  const $submit = document.getElementById('adm-submit');

  function setFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      alert('Solo se admiten archivos .docx');
      return;
    }
    if (file.size > 9 * 1024 * 1024) {
      alert('El archivo no puede pesar mas de 9 MB');
      return;
    }
    $file._file = file;
    $filename.textContent = file.name;
    $submit.disabled = false;
  }

  $dropzone.addEventListener('click', function () { $file.click(); });
  $file.addEventListener('change', function (e) { if (e.target.files[0]) setFile(e.target.files[0]); });
  $dropzone.addEventListener('dragover', function (e) { e.preventDefault(); $dropzone.classList.add('adm-dragover'); });
  $dropzone.addEventListener('dragleave', function () { $dropzone.classList.remove('adm-dragover'); });
  $dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    $dropzone.classList.remove('adm-dragover');
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });

  // ===== SUBMIT =====

  // Convierte el .docx a markdown EN EL NAVEGADOR usando mammoth.browser
  // Esto evita el limite de 4.5MB de body en Vercel (el md es mucho mas chico que el docx)
  function fileToMarkdown(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = async function () {
        try {
          if (!window.mammoth || !window.mammoth.convertToMarkdown) {
            reject(new Error('mammoth no esta cargado'));
            return;
          }
          const result = await window.mammoth.convertToMarkdown({ arrayBuffer: reader.result });
          resolve(result.value || '');
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  $submit.addEventListener('click', async function (e) {
    e.preventDefault();
    const $err = document.getElementById('adm-err');
    $err.textContent = '';

    const file = $file._file;
    if (!file) { $err.textContent = 'Falta el archivo'; return; }

    const isReplace = document.querySelector('input[name="adm-op"]:checked').value === 'replace';
    const replaceDocId = isReplace ? document.getElementById('adm-replace-doc').value : null;
    let sectorId, roleId, titulo, descripcion, badge;

    if (isReplace) {
      const existing = DOCUMENTOS.find(d => d.id === replaceDocId);
      if (!existing) { $err.textContent = 'Documento a reemplazar invalido'; return; }
      sectorId = existing.sectorId;
      roleId = existing.roleId;
      titulo = existing.titulo;
      descripcion = existing.descripcion;
      badge = existing.badge;
    } else {
      sectorId = document.getElementById('adm-sector').value;
      roleId = document.getElementById('adm-role').value;
      titulo = document.getElementById('adm-titulo').value.trim();
      descripcion = document.getElementById('adm-desc').value.trim();
      badge = document.getElementById('adm-badge').value.trim();
      if (!sectorId || !roleId || !titulo) {
        $err.textContent = 'Faltan campos: sector, rol o titulo';
        return;
      }
    }

    $submit.disabled = true;
    $submit.textContent = 'Subiendo...';

    try {
      const markdown = await fileToMarkdown(file);
      if (!markdown || markdown.length < 20) {
        $err.textContent = 'No pude extraer texto del archivo. Verificá que sea un .docx válido.';
        return;
      }
      const res = await apiFetch('/api/admin/upload-manual', {
        method: 'POST',
        body: {
          markdown,
          fileName: file.name,
          sectorId,
          roleId,
          titulo,
          descripcion,
          badge,
          replaceDocId,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        $err.textContent = data.error + (data.detail ? ' - ' + data.detail : '');
        return;
      }
      LAST_UPLOAD = data;
      showResult(data);
    } catch (err) {
      $err.textContent = 'Error: ' + err.message;
    } finally {
      $submit.disabled = false;
      $submit.textContent = 'Subir y commitear';
    }
  });

  function showResult(data) {
    document.getElementById('adm-result').style.display = '';
    document.getElementById('adm-result-msg').innerHTML =
      'Subido y commiteado. Path: <code>' + data.path + '</code> · docId: <code>' + data.docId + '</code>';
    document.getElementById('adm-preview').textContent = data.markdown_preview || '(sin preview)';
    if (data.commitUrl) {
      const $link = document.getElementById('adm-commit-link');
      $link.href = data.commitUrl;
      $link.style.display = '';
    }
    document.getElementById('adm-result').scrollIntoView({ behavior: 'smooth' });
  }

  // ===== RE-INGEST =====

  document.getElementById('adm-reingest').addEventListener('click', async function () {
    if (!LAST_UPLOAD) return;
    const $msg = document.getElementById('adm-reingest-msg');
    const $btn = document.getElementById('adm-reingest');
    $msg.textContent = 'Re-ingestando, puede tardar 10-30 seg...';
    $btn.disabled = true;
    try {
      const res = await apiFetch('/api/admin/reingest-file', {
        method: 'POST',
        body: { path: LAST_UPLOAD.path },
      });
      const data = await res.json();
      if (!res.ok) {
        $msg.textContent = 'Error: ' + (data.error || 'desconocido') + ' (' + (data.detail || '') + ')';
        return;
      }
      $msg.innerHTML = 'Listo: <b>' + data.chunks + ' chunks</b> cargados en el agente. Ya podes probarlo en la pestaña Asistente.';
    } catch (err) {
      $msg.textContent = 'Error de red: ' + err.message;
    } finally {
      $btn.disabled = false;
    }
  });

  // INIT
  tryAutoLogin();
})();
