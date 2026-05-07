function setHeader() {
  const state = window.UNISOL.state;
  const c = state.current;
  const logoRow = document.getElementById("logoRow");
  const detail = document.getElementById("headerDetailTitle");
  const sub = document.getElementById("headerSub");
  const back = document.getElementById("backBtn");
  const tabs = document.getElementById("tabs");
  const showBack = !!(c.sectorId || c.roleId || c.docId);
  back.style.display = showBack ? "inline-block" : "none";
  tabs.style.display = showBack ? "none" : "flex";

  let title = "";
  let subtitle = "";
  if (c.docId) {
    const d = byId(state.documentos, c.docId);
    const r = byId(state.roles, d.roleId);
    title = d.titulo; subtitle = r.label;
  } else if (c.roleId) {
    const r = byId(state.roles, c.roleId);
    title = r.label; subtitle = r.sub || "";
  } else if (c.sectorId) {
    const s = byId(state.sectores, c.sectorId);
    title = s.label; subtitle = "Roles y documentos";
  }
  if (showBack) {
    logoRow.style.display = "none";
    detail.style.display = "block";
    detail.textContent = title;
    sub.style.display = subtitle ? "block" : "none";
    sub.textContent = subtitle;
  } else {
    logoRow.style.display = "flex";
    detail.style.display = "none";
    sub.style.display = "none";
  }

  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const active = document.querySelector(`[data-tab="${c.tab}"]`);
  if (active) active.classList.add("active");
}

function renderApp() {
  setHeader();
  const c = window.UNISOL.state.current;
  const root = document.getElementById("root");
  if (c.docId) return renderDocument(root, c.docId);
  if (c.roleId) return renderRole(root, c.roleId);
  if (c.sectorId) return renderSector(root, c.sectorId);

  if (c.tab === "roles") return renderHomeRoles(root);
  if (c.tab === "procedimientos") return renderProcedimientos(root);
  if (c.tab === "organigrama") return renderOrganigrama(root);
  if (c.tab === "planillas") return renderPlanillas(root);
}

function renderHomeRoles(root) {
  const state = window.UNISOL.state;
  let html = `<section class="screen active"><div class="section-label">Sectores</div><div class="sector-grid">`;
  state.sectores.forEach(s => {
    const count = sectorRoles(s.id).length;
    html += `<div class="sector-card" onclick="openSector('${s.id}')">
      <div class="sector-icon">${s.icono || "🏪"}</div>
      <div class="sector-name">${s.label}</div>
      <div class="sector-sub">${count} roles cargados</div>
    </div>`;
  });
  html += `</div><div class="quick-section"><div class="section-label">Accesos rápidos</div><div class="quick-list">`;
  state.documentos.filter(d => d.disponible).slice(0, 9).forEach(d => {
    const r = byId(state.roles, d.roleId);
    const s = byId(state.sectores, d.sectorId);
    html += `<div class="quick-card" onclick="openDoc('${d.id}')">
      <div class="quick-icon">📄</div><div class="quick-info">
      <div class="quick-title">${d.titulo}</div><div class="quick-sector">${s.label} · ${r.label}</div>
      </div><div class="quick-badge">Listo</div></div>`;
  });
  html += `</div></div></section>`;
  root.innerHTML = html;
}

function renderSector(root, sectorId) {
  const state = window.UNISOL.state;
  const roles = sectorRoles(sectorId);
  let html = `<section class="screen active"><div class="section-label">Roles del sector</div><div class="hierarchy-wrap">`;
  roles.forEach((r, i) => {
    const j = state.jerarquia[r.id] || { nivel:"level-ayudante", label:"Rol", reporta:"Pendiente" };
    html += `<div class="hierarchy-item"><div class="hierarchy-line-col"><div class="h-dot"></div>${i < roles.length-1 ? '<div class="h-line"></div>' : ''}</div>
      <div class="hierarchy-card ${i===0?'top':''}" onclick="openRole('${r.id}')">
      <div class="hierarchy-card-left"><div class="hierarchy-avatar">👤</div><div class="hierarchy-info">
      <div class="hierarchy-name">${r.label}</div><div class="hierarchy-sub">${r.sub || ""}</div>
      </div></div><div class="hierarchy-level ${j.nivel}">${j.label}</div></div></div>`;
  });
  html += `</div></section>`;
  root.innerHTML = html;
}

function renderRole(root, roleId) {
  const state = window.UNISOL.state;
  const role = byId(state.roles, roleId);
  const j = state.jerarquia[roleId] || { reporta: "Pendiente de definición" };
  const docs = roleDocs(roleId);
  let html = `<section class="screen active">
    <div class="reports-to">↳ Reporta a: ${j.reporta}</div>
    <div class="section-label">Documentos disponibles</div>`;
  docs.forEach(d => {
    html += `<div class="doc-card ${d.disponible ? '' : 'disabled'}" ${d.disponible ? `onclick="openDoc('${d.id}')"` : ''}>
      <span class="doc-badge">${d.badge || "Documento"}</span>
      <div class="doc-title">${d.titulo}</div>
      <div class="doc-desc">${d.descripcion || ""}</div>
    </div>`;
  });
  html += `</section>`;
  root.innerHTML = html;
}

async function renderDocument(root, docId) {
  const d = byId(window.UNISOL.state.documentos, docId);
  root.innerHTML = `<section class="screen active"><div class="content-block">Cargando documento...</div></section>`;
  try {
    const md = await loadMarkdown(d.path);
    root.innerHTML = `<section class="screen active"><div class="content-block markdown">${mdToHTML(md)}</div></section>`;
    root.querySelectorAll(".doc-link").forEach(a => {
      a.addEventListener("click", function(e){
        e.preventDefault();
        const id = this.getAttribute("data-doc-id");
        if (id) openDoc(id);
      });
    });
  } catch(e) {
    root.innerHTML = `<section class="screen active"><div class="coming-card"><div class="coming-icon">⚠️</div><div class="coming-title">No se pudo abrir el documento</div><div class="coming-desc">${e.message}</div></div></section>`;
  }
}

function renderProcedimientos(root) {
  const state = window.UNISOL.state;
  let html = `<section class="screen active">
    <div class="section-label">Procedimientos por sector y rol</div>
    <div class="coming-card" style="text-align:left;padding:1rem 1.1rem">
      <div class="coming-title">Vista documental ordenada</div>
      <div class="coming-desc">Cada procedimiento queda agrupado por sector y por puesto/persona. Esto permite que cada click cargue solo el documento correspondiente.</div>
    </div>`;

  state.sectores.forEach(s => {
    const sr = sectorRoles(s.id);
    if (!sr.length) return;
    html += `<div class="proc-sector">
      <div class="proc-sector-title">${s.icono || "🏪"} ${s.label}</div>`;

    sr.forEach(r => {
      const docs = roleDocs(r.id);
      const disponibles = docs.filter(d => d.disponible).length;
      html += `<div class="proc-role-group">
        <div class="proc-role-head">
          <div class="proc-role-main">
            <div class="proc-role-title">${r.puesto || r.label}</div>
            <div class="proc-role-meta">
              Persona/referente: ${r.persona || "Pendiente de asignación"} · ${r.sub || "Sin turno definido"}
            </div>
          </div>
          <div class="proc-role-pill">${disponibles}/${docs.length} listos</div>
        </div>
        <div class="proc-doc-list">`;

      docs.forEach(d => {
        html += `<div class="proc-doc-item ${d.disponible ? "" : "disabled"}" ${d.disponible ? `onclick="openDoc('${d.id}')"` : ""}>
          <div class="proc-doc-top">
            <div class="proc-doc-title">${d.titulo}</div>
            <div class="proc-doc-badge">${d.disponible ? d.badge || "Listo" : "Próx."}</div>
          </div>
          <div class="proc-doc-desc">${d.descripcion || "Sin descripción cargada."}</div>
        </div>`;
      });

      html += `</div></div>`;
    });

    html += `</div>`;
  });

  html += `</section>`;
  root.innerHTML = html;
}

function orgaShow(icono, nombre, cargo, info) {
  const modal = document.getElementById("orgaModal");
  if (!modal) return;
  document.getElementById("orga-m-icon").textContent = icono || "👤";
  document.getElementById("orga-m-title").textContent = nombre || "—";
  document.getElementById("orga-m-cargo").textContent = cargo || "—";
  document.getElementById("orga-m-info").textContent = info || "Sin descripción cargada.";
  modal.classList.add("show");
}

function orgaHide() {
  const modal = document.getElementById("orgaModal");
  if (modal) modal.classList.remove("show");
}

function orgaToggleById(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("collapsed");
}

function renderOrganigrama(root) {
  const org = window.UNISOL.state.organigrama || {};
  const direccion = org.direccion || [];
  const bloques = org.bloques || [];

  let html = `<section class="screen active">
    <div class="section-label">Organigrama global</div>

    <div class="orga-direccion">
      <div class="orga-direccion-titulo">👔 Dirección estratégica</div>
      <div class="orga-direccion-list">`;

  direccion.forEach((r, i) => {
    html += `<div class="orga-rol" onclick='orgaShow(${JSON.stringify(r.icono)},${JSON.stringify(r.nombre)},${JSON.stringify(r.cargo)},${JSON.stringify(r.detalle)})'>
      <div class="orga-rol-avatar naranja">${r.icono || "👤"}</div>
      <div class="orga-rol-info">
        <div class="orga-rol-nombre">${r.nombre}</div>
        <div class="orga-rol-cargo">${r.cargo}</div>
      </div>
    </div>`;
  });

  html += `</div></div>`;

  bloques.forEach((b, bi) => {
    const id = `orga-bloque-${bi}`;
    html += `<div class="orga-bloque ${b.clase || ""}" id="${id}">
      <div class="orga-bloque-header" onclick="orgaToggleById('${id}')">
        <span>${b.titulo}</span><span class="orga-chev">▾</span>
      </div>
      <div class="orga-bloque-body">`;

    (b.roles || []).forEach(r => {
      const cls = `orga-rol ${r.destacado ? "destacado" : ""} ${r.equipo ? "equipo" : ""}`.trim();
      let avatarClass = "";
      if ((b.clase || "").includes("prod")) avatarClass = "naranja";
      if ((b.clase || "").includes("salon")) avatarClass = "azul";
      if ((b.clase || "").includes("soporte")) avatarClass = "violeta";
      if (r.destacado) avatarClass = "verde";

      html += `<div class="${cls}" onclick='orgaShow(${JSON.stringify(r.icono)},${JSON.stringify(r.nombre)},${JSON.stringify(r.cargo)},${JSON.stringify(r.detalle)})'>
        <div class="orga-rol-avatar ${avatarClass}">${r.icono || "👤"}</div>
        <div class="orga-rol-info">
          <div class="orga-rol-nombre">${r.nombre}</div>
          <div class="orga-rol-cargo">${r.cargo}</div>
        </div>
      </div>`;
    });

    html += `</div></div>`;
  });

  html += `</section>`;
  root.innerHTML = html;
}

function renderPlanillas(root) {
  const cfg = window.UNISOL.state.config;
  root.innerHTML = `<section class="screen active">
    <div class="planilla-header"><div class="planilla-header-icon">📊</div><div class="planilla-header-info">
      <div class="planilla-header-title">Planillas operativas</div>
      <div class="planilla-header-desc">Descarga de planillas vinculadas al sistema documental.</div>
    </div></div>
    <div class="sheet-list">
      <div class="sheet-list-item"><span class="sheet-dot"></span> Reposición y control operativo</div>
      <div class="sheet-list-item"><span class="sheet-dot"></span> Registros de abastecimiento</div>
      <div class="sheet-list-item"><span class="sheet-dot"></span> Base para seguimiento interno</div>
    </div>
    <a class="btn-download" href="${cfg.assets.planillas}" download>⬇ Descargar planillas</a>
  </section>`;
}

function wireSearch() {
  const input = document.getElementById("searchInput");
  const clear = document.getElementById("searchClear");
  input.addEventListener("input", function(){
    const q = input.value.trim().toLowerCase();
    clear.style.display = q ? "block" : "none";
    if (!q) { renderApp(); return; }
    renderSearch(q);
  });
  clear.addEventListener("click", function(){ input.value = ""; clear.style.display = "none"; renderApp(); });
}

function renderSearch(q) {
  const state = window.UNISOL.state;
  const root = document.getElementById("root");
  const results = state.documentos.filter(d => {
    const r = byId(state.roles, d.roleId) || {};
    const s = byId(state.sectores, d.sectorId) || {};
    return [d.titulo,d.descripcion,r.label,s.label].join(" ").toLowerCase().includes(q);
  });
  let html = `<section class="screen active"><div class="section-label">Resultados</div>`;
  if (!results.length) html += `<div class="no-results">No se encontraron resultados para “${q}”.</div>`;
  results.forEach(d => {
    const r = byId(state.roles, d.roleId), s = byId(state.sectores, d.sectorId);
    html += `<div class="result-item" onclick="openDoc('${d.id}')"><div class="result-path"><b>${s.label}</b> · ${r.label}</div><div class="result-title">${d.titulo}</div><div class="result-snippet">${d.descripcion || ""}</div></div>`;
  });
  html += `</section>`;
  root.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", async function(){
  try {
    await bootData();
    document.getElementById("logoImg").src = window.UNISOL.state.config.assets.logo;
    document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
    document.getElementById("backBtn").addEventListener("click", goBack);
    wireSearch();
    if (!renderLoginIfNeeded()) renderApp();
  } catch(e) {
    document.body.innerHTML = `<div style="padding:20px;font-family:sans-serif"><h2>Error de carga</h2><p>${e.message}</p><p>Verificá que estés abriendo la web con servidor local o Vercel, no con doble click.</p></div>`;
  }
});
