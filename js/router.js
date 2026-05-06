function setTab(tab) {
  const state = window.UNISOL.state;
  state.current = { tab, sectorId: null, roleId: null, docId: null };
  renderApp();
}

function openSector(sectorId) {
  const state = window.UNISOL.state;
  state.current.sectorId = sectorId;
  state.current.roleId = null;
  state.current.docId = null;
  renderApp();
}

function openRole(roleId) {
  const state = window.UNISOL.state;
  state.current.roleId = roleId;
  state.current.docId = null;
  renderApp();
}

function openDoc(docId) {
  const state = window.UNISOL.state;
  state.current.docId = docId;
  renderApp();
}

function goBack() {
  const c = window.UNISOL.state.current;
  if (c.docId) c.docId = null;
  else if (c.roleId) c.roleId = null;
  else if (c.sectorId) c.sectorId = null;
  renderApp();
}

function roleDocs(roleId) {
  return window.UNISOL.state.documentos.filter(d => d.roleId === roleId);
}
function sectorRoles(sectorId) {
  return window.UNISOL.state.roles.filter(r => r.sectorId === sectorId);
}
function byId(arr, id) { return arr.find(x => x.id === id); }
