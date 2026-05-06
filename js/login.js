function getAccessKey(){ return "unisol-acceso"; }

function hasAccess() {
  const key = getAccessKey();
  return sessionStorage.getItem(key) === "1" || localStorage.getItem(key) === "1";
}

function logAccess(tipo) {
  const cfg = window.UNISOL.state.config;
  if (!cfg || !cfg.logURL) return;
  const nombre = localStorage.getItem("unisol-nombre") || "Anónimo";
  try {
    fetch(cfg.logURL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ fecha: new Date().toISOString(), nombre, tipo, ua: navigator.userAgent })
    }).catch(function(){});
  } catch(e) {}
}

function renderLoginIfNeeded() {
  if (hasAccess()) {
    logAccess("acceso");
    return false;
  }
  const bg = document.createElement("div");
  bg.id = "loginBg";
  bg.className = "login-bg";
  const logo = window.UNISOL.state.config.assets.logo;
  bg.innerHTML = `
    <div class="login-card">
      <img src="${logo}" onerror="this.style.display='none'">
      <div class="login-title">UNISOL</div>
      <div class="login-sub">Instructivos operativos</div>
      <input id="unisolNombre" type="text" placeholder="Tu nombre o sector" autocomplete="name">
      <input id="unisolPwd" type="password" placeholder="Clave de acceso" autocomplete="off">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666;margin-bottom:14px;justify-content:center;cursor:pointer">
        <input type="checkbox" id="unisolRecordar" checked> Recordar en este dispositivo
      </label>
      <button id="unisolEntrar">Entrar</button>
      <div class="login-error" id="unisolErr">Clave incorrecta</div>
    </div>`;
  document.body.appendChild(bg);
  const nombreIn = document.getElementById("unisolNombre");
  const pwd = document.getElementById("unisolPwd");
  const btn = document.getElementById("unisolEntrar");
  const err = document.getElementById("unisolErr");
  const rem = document.getElementById("unisolRecordar");
  nombreIn.value = localStorage.getItem("unisol-nombre") || "";

  function intentar(){
    if (pwd.value === window.UNISOL.state.config.clave) {
      const nombre = (nombreIn.value || "").trim() || "Anónimo";
      localStorage.setItem("unisol-nombre", nombre);
      if (rem.checked) localStorage.setItem(getAccessKey(), "1");
      else sessionStorage.setItem(getAccessKey(), "1");
      bg.remove();
      logAccess("login");
      renderApp();
    } else {
      err.style.display = "block";
    }
  }
  btn.addEventListener("click", intentar);
  pwd.addEventListener("keypress", e => { if(e.key === "Enter") intentar(); });
  nombreIn.focus();
  return true;
}
