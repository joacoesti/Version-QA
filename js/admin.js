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

  // Convierte el .docx a markdown EN EL NAVEGADOR usando mammoth.browser.
  // SKIP imagenes: el agente solo necesita texto, y las imagenes inflan mucho el payload.
  function fileToMarkdown(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = async function () {
        try {
          if (!window.mammoth || !window.mammoth.convertToMarkdown) {
            reject(new Error('mammoth.browser no esta cargado'));
            return;
          }
          // Funcion convertImage que devuelve un placeholder vacio (no embebe la imagen)
          const skipImages = window.mammoth.images.imgElement(function () {
            return { src: '' };
          });
          const result = await window.mammoth.convertToMarkdown(
            { arrayBuffer: reader.result },
            { convertImage: skipImages }
          );
          let md = result.value || '';
          // Limpieza extra: cualquier ![...](data:...) residual o ![]() vacio
          md = md.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '[imagen omitida]');
          md = md.replace(/!\[\]\(\s*\)/g, '');
          md = md.replace(/!\[[^\]]*\]\(\s*\)/g, '');
          resolve(md.trim());
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
      // 1) Pedir signed URL para subir el docx ORIGINAL directo a Supabase Storage
      $submit.textContent = 'Solicitando upload URL...';
      const urlRes = await apiFetch('/api/admin/get-upload-url', {
        method: 'POST',
        body: { fileName: file.name, sectorId },
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) {
        $err.textContent = 'Error pidiendo URL: ' + (urlData.error || '');
        return;
      }

      // 2) PUT directo del .docx (bypassa Vercel, sin limite de 4.5MB)
      $submit.textContent = 'Subiendo archivo original...';
      const putRes = await fetch(urlData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) {
        const t = await putRes.text();
        $err.textContent = 'Error subiendo a storage: ' + putRes.status + ' ' + t.slice(0, 200);
        return;
      }

      // 3) Convertir a markdown (en cliente, para RAG)
      $submit.textContent = 'Convirtiendo a markdown...';
      const markdown = await fileToMarkdown(file);
      if (!markdown || markdown.length < 20) {
        $err.textContent = 'No pude extraer texto del archivo. Verifica que sea un .docx valido.';
        return;
      }
      const mdSize = new Blob([markdown]).size;
      const mdSizeKB = Math.round(mdSize / 1024);
      const mdChars = markdown.length;
      const estimatedChunks = Math.max(1, Math.round(mdChars / 500));
      console.log('Extraccion: ' + mdChars + ' chars, ' + mdSizeKB + ' KB, ~' + estimatedChunks + ' chunks estimados');
      if (mdSizeKB > 4000) {
        $err.textContent = 'Markdown pesa ' + mdSizeKB + 'KB (limite 4MB).';
        return;
      }
      // Mostrar diagnostico antes del upload
      const $diag = document.getElementById('adm-diag') || (function(){
        const d = document.createElement('p');
        d.id = 'adm-diag';
        d.className = 'adm-muted';
        d.style.fontSize = '12px';
        $err.parentNode.insertBefore(d, $err);
        return d;
      })();
      $diag.innerHTML = 'Extraido del .docx: <b>' + mdChars.toLocaleString() + '</b> caracteres &middot; <b>' + mdSizeKB + ' KB</b> &middot; ~<b>' + estimatedChunks + ' chunks</b> esperados';

      // 4) Commitear markdown + actualizar index con originalUrl
      $submit.textContent = 'Commiteando al repo...';
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
          originalUrl: urlData.publicUrl,
          originalPath: urlData.path,
        },
      });
      // Lectura defensiva: si no es JSON, mostramos el texto crudo
      let data;
      const text = await res.text();
      try { data = JSON.parse(text); }
      catch {
        $err.textContent = 'Respuesta del servidor no es JSON (' + res.status + '): ' + text.slice(0, 200);
        return;
      }
      if (!res.ok) {
        $err.textContent = (data.error || 'Error') + (data.detail ? ' - ' + data.detail : '');
        return;
      }
      LAST_UPLOAD = data;
      showResult(data);

      // === NUEVO: re-ingesta automatica al agente ===
      $submit.textContent = 'Re-ingestando al agente...';
      const $reingMsg = document.getElementById('adm-reingest-msg');
      if ($reingMsg) $reingMsg.textContent = 'Re-ingestando automaticamente...';
      try {
        const rRes = await apiFetch('/api/admin/reingest-file', {
          method: 'POST',
          body: { path: data.path },
        });
        const rData = await rRes.json();
        if (rRes.ok) {
          if ($reingMsg) $reingMsg.innerHTML = '✅ Agente actualizado: <b>' + rData.chunks + ' chunks</b> cargados. Ya podes consultarlo en la pestaña Asistente.';
        } else {
          if ($reingMsg) $reingMsg.textContent = '⚠ El manual se commiteo pero la re-ingesta fallo: ' + (rData.detail || rData.error || '') + '. Apretá el boton "Re-ingestar al agente" manualmente en 1 min cuando termine el deploy.';
        }
      } catch (rErr) {
        if ($reingMsg) $reingMsg.textContent = '⚠ El manual se subio pero no pude re-ingestar automaticamente. Probá el boton manualmente: ' + rErr.message;
      }

      // Refrescar la lista de manuales y dropdowns
      try {
        await loadData();
      } catch (_) {}

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


  // ===== NUEVA SECCION: MANUALES EXISTENTES (delete) =====

  function renderDocsList() {
    const $list = document.getElementById('adm-docs-list');
    if (!$list) return;
    if (!DOCUMENTOS.length) {
      $list.innerHTML = '<p class="adm-muted">No hay manuales cargados.</p>';
      return;
    }
    $list.innerHTML = DOCUMENTOS
      .filter(function (d) { return d.disponible; })
      .map(function (d) {
        return (
          '<div class="adm-doc-row" data-doc-id="' + d.id + '">' +
          '  <div class="adm-doc-info">' +
          '    <div class="adm-doc-title">' + escapeHtml(d.titulo) + '</div>' +
          '    <div class="adm-doc-meta">' + escapeHtml(d.sectorId) + ' / ' + escapeHtml(d.roleId) + ' &mdash; <code>' + escapeHtml(d.id) + '</code></div>' +
          '  </div>' +
          '  <button class="adm-danger" data-action="delete" data-doc-id="' + d.id + '">Eliminar</button>' +
          '</div>'
        );
      })
      .join('');

    $list.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteDoc(btn.getAttribute('data-doc-id')); });
    });
  }

  async function deleteDoc(docId) {
    const doc = DOCUMENTOS.find(function (d) { return d.id === docId; });
    if (!doc) return;
    if (!confirm('Eliminar "' + doc.titulo + '"? Se borra del repo, de Supabase y del Storage. NO se puede deshacer.')) return;

    try {
      const res = await apiFetch('/api/admin/delete-doc', { method: 'POST', body: { docId: docId } });
      const data = await res.json();
      if (!res.ok) {
        alert('Error: ' + (data.error || 'desconocido') + ' - ' + (data.detail || ''));
        return;
      }
      alert('Eliminado. Esperá ~1 min al redeploy de Vercel y refrescá esta página.');
      await loadData();
      renderDocsList();
    } catch (err) {
      alert('Error de red: ' + err.message);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ===== NUEVA SECCION: CREAR ROL =====

  function populateNewRoleSectorDropdown() {
    const $sec = document.getElementById('adm-newrole-sector');
    if (!$sec) return;
    $sec.innerHTML = SECTORES.map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.label) + '</option>';
    }).join('');
  }

  async function createRole() {
    const $msg = document.getElementById('adm-newrole-msg');
    const $btn = document.getElementById('adm-newrole-submit');
    $msg.textContent = '';
    const sectorId = document.getElementById('adm-newrole-sector').value;
    const label = document.getElementById('adm-newrole-label').value.trim();
    const sub = document.getElementById('adm-newrole-sub').value.trim();
    const persona = document.getElementById('adm-newrole-persona').value.trim();
    const reporta = document.getElementById('adm-newrole-reporta').value.trim();
    const nivel = document.getElementById('adm-newrole-nivel').value;
    if (!label) { $msg.textContent = 'Falta nombre del rol'; return; }
    $btn.disabled = true; $btn.textContent = 'Creando...';
    try {
      const res = await apiFetch('/api/admin/create-role', {
        method: 'POST',
        body: { sectorId: sectorId, label: label, sub: sub, persona: persona, reporta: reporta, nivel: nivel },
      });
      const data = await res.json();
      if (!res.ok) {
        $msg.textContent = (data.error || 'Error') + ' - ' + (data.detail || '');
        return;
      }
      $msg.style.color = '#1a8a3a';
      $msg.textContent = 'Rol creado con ID: ' + data.roleId + '. Esperá ~1 min al redeploy de Vercel para verlo en la web.';
      document.getElementById('adm-newrole-label').value = '';
      document.getElementById('adm-newrole-sub').value = '';
      document.getElementById('adm-newrole-persona').value = '';
      document.getElementById('adm-newrole-reporta').value = '';
      await loadData();
      renderDocsList();
      populateNewRoleSectorDropdown();
    } catch (err) {
      $msg.textContent = 'Error de red: ' + err.message;
    } finally {
      $btn.disabled = false; $btn.textContent = 'Crear rol';
    }
  }

  // Wire-up post-login: cuando entramos al admin tambien renderizamos las dos secciones nuevas
  const originalLoadData = loadData;
  loadData = async function () {
    await originalLoadData();
    renderDocsList();
    populateNewRoleSectorDropdown();
    const $newroleBtn = document.getElementById('adm-newrole-submit');
    if ($newroleBtn && !$newroleBtn._wired) {
      $newroleBtn._wired = true;
      $newroleBtn.addEventListener('click', createRole);
    }
  };

  // INIT
  tryAutoLogin();
})();
