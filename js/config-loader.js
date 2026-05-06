window.UNISOL = window.UNISOL || {};
window.UNISOL.state = {
  config: null,
  sectores: [],
  roles: [],
  documentos: [],
  jerarquia: {},
  organigrama: {},
  current: { tab: "roles", sectorId: null, roleId: null, docId: null }
};

async function loadJSON(path) {
  const r = await fetch(path + "?t=" + Date.now());
  if (!r.ok) throw new Error("No se pudo cargar " + path + " (" + r.status + ")");
  return await r.json();
}

async function bootData() {
  const state = window.UNISOL.state;
  state.config = await loadJSON("config/config.json");
  state.sectores = await loadJSON(state.config.data.sectores);
  state.roles = await loadJSON(state.config.data.roles);
  state.documentos = await loadJSON(state.config.data.documentos);
  state.jerarquia = await loadJSON(state.config.data.jerarquia);
  if (state.config.data.organigrama) state.organigrama = await loadJSON(state.config.data.organigrama);
}
