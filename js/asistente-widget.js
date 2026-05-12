// js/asistente-widget.js
// Widget de consultas (chat con manuales). Se monta dentro de #root cuando se selecciona la pestana "Asistente".
// Reutiliza la API /api/ask del backend.

(function (global) {
  'use strict';

  const ENDPOINT = '/api/ask';

  // Estado conversacional (se mantiene mientras la pestana este montada)
  const state = {
    history: [],
    lastSources: [],
  };

  // Busca el docId en el indice del SPA dado el source de un chunk.
  // source en Supabase: "abastecimiento/encargado-abastecimiento-tareas-diarias.md"
  // path en docs-index:  "docs/abastecimiento/encargado-abastecimiento-tareas-diarias.md"
  function resolveDocIdFromSource(source) {
    if (!source) return null;
    const state = window.UNISOL && window.UNISOL.state;
    if (!state || !Array.isArray(state.documentos)) return null;
    const target1 = source.replace(/\\/g, '/');
    const target2 = 'docs/' + target1;
    const match = state.documentos.find(function (d) {
      if (!d.path) return false;
      const p = d.path.replace(/\\/g, '/');
      return p === target1 || p === target2 || p.endsWith('/' + target1);
    });
    return match && match.disponible ? match.id : null;
  }

  // Normaliza texto para matching (sin tildes, lowercase, espacios colapsados)
  function normalizeForMatch(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Despues de abrir un documento, busca el chunk citado en el DOM renderizado
  // y scrollea a la seccion correspondiente (header mas cercano arriba del texto).
  function scrollToChunkInDoc(chunkSnippet) {
    if (!chunkSnippet) return;
    const root = document.getElementById('root');
    if (!root) return;

    // Tomamos los primeros ~80 caracteres del snippet como "huella" del chunk
    const needle = normalizeForMatch(chunkSnippet).slice(0, 80);
    if (needle.length < 20) return;

    const observer = new MutationObserver(function (mutations, obs) {
      // Cuando aparece el contenido markdown renderizado, intentamos el match
      const md = root.querySelector('.content-block.markdown');
      if (!md) return;

      // Buscamos el elemento que contenga el needle
      const candidates = md.querySelectorAll('p, li, h1, h2, h3, h4, td, th, blockquote');
      let matchEl = null;
      for (const el of candidates) {
        if (normalizeForMatch(el.textContent).includes(needle.slice(0, 50))) {
          matchEl = el;
          break;
        }
      }

      // Si no encontramos por texto, no hacemos nada (el doc ya esta abierto al menos)
      if (matchEl) {
        // Encontrar el header mas cercano hacia arriba (h1-h4)
        let target = matchEl;
        let prev = matchEl.previousElementSibling;
        while (prev) {
          if (/^H[1-4]$/.test(prev.tagName)) { target = prev; break; }
          prev = prev.previousElementSibling;
        }

        // Scrollear y resaltar el elemento del match (no el header, mas precision)
        setTimeout(function () {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          matchEl.classList.add('cs-highlighted-chunk');
          setTimeout(function () {
            matchEl.classList.remove('cs-highlighted-chunk');
          }, 3500);
        }, 200);
      }

      obs.disconnect();
    });

    observer.observe(root, { childList: true, subtree: true });
    // Safety: desconectar despues de 5 segundos por si algo no se renderiza
    setTimeout(function () { observer.disconnect(); }, 5000);
  }

  function openDocFromCitation(ref) {
    const src = state.lastSources.find(function (s) { return s.ref === ref; });
    if (!src) return false;
    const docId = resolveDocIdFromSource(src.source);
    if (docId && typeof window.openDoc === 'function') {
      window.openDoc(docId);
      // Disparamos el scroll-to-chunk despues de la navegacion
      scrollToChunkInDoc(src.snippet);
      return true;
    }
    return false;
  }



  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderAnswerHtml(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\[(\d+)\]/g, function (_, n) {
      return '<span class="cs-cite" data-ref="' + n + '">' + n + '</span>';
    });
    const lines = html.split('\n');
    const out = [];
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^\s*[-*]\s+(.+)$/);
      if (m) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + m[1] + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  }

  function ensureStylesLoaded() {
    if (document.querySelector('link[data-asistente-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/consultas.css';
    link.setAttribute('data-asistente-css', 'true');
    document.head.appendChild(link);
  }

  function buildLayout(root) {
    root.innerHTML = ''
      + '<section class="screen active" id="cs-root">'
      + '  <div class="cs-embed">'
      + '    <div class="cs-chat">'
      + '      <div id="cs-messages" class="cs-messages">'
      + '        <div class="cs-welcome">'
      + '          <h2>Asistente UNISOL</h2>'
      + '          <p>Respondo consultas sobre los manuales de procesos cargados (abastecimiento, cocina, panificadora). Si la informacion no esta en los manuales, te lo digo claramente.</p>'
      + '          <div class="cs-suggested" id="cs-suggested-initial">'
      + '            <button class="cs-suggestion">Cuales son las tareas diarias de abastecimiento?</button>'
      + '            <button class="cs-suggestion">Como se gestionan los pedidos de mercaderia?</button>'
      + '            <button class="cs-suggestion">Que tareas realiza el Jefe de Cocina?</button>'
      + '            <button class="cs-suggestion">Como funciona el ingreso al sector de panificadora?</button>'
      + '          </div>'
      + '        </div>'
      + '      </div>'
      + '      <form id="cs-form" class="cs-form" autocomplete="off">'
      + '        <textarea id="cs-input" class="cs-input" placeholder="Escribi tu pregunta..." rows="1" required></textarea>'
      + '        <button type="submit" id="cs-send" class="cs-send" aria-label="Enviar">'
      + '          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>'
      + '        </button>'
      + '      </form>'
      + '      <p class="cs-disclaimer">Las respuestas se generan solo con base en los manuales cargados. No reemplaza la consulta con el responsable del area.</p>'
      + '    </div>'
      + '    <aside class="cs-sources" id="cs-sources">'
      + '      <h2 class="cs-sources-title">Fuentes</h2>'
      + '      <p class="cs-sources-empty" id="cs-sources-empty">Hace una pregunta para ver de que manual se sacaron las respuestas.</p>'
      + '      <ol class="cs-sources-list" id="cs-sources-list"></ol>'
      + '    </aside>'
      + '  </div>'
      + '</section>';
  }

  function mount(root) {
    ensureStylesLoaded();
    buildLayout(root);

    const $messages = root.querySelector('#cs-messages');
    const $form = root.querySelector('#cs-form');
    const $input = root.querySelector('#cs-input');
    const $send = root.querySelector('#cs-send');
    const $sourcesList = root.querySelector('#cs-sources-list');
    const $sourcesEmpty = root.querySelector('#cs-sources-empty');

    function scrollToBottom() {
      requestAnimationFrame(function () { $messages.scrollTop = $messages.scrollHeight; });
    }
    function autoresize() {
      $input.style.height = 'auto';
      $input.style.height = Math.min($input.scrollHeight, 200) + 'px';
    }
    function clearWelcome() {
      const w = $messages.querySelector('.cs-welcome');
      if (w) w.remove();
    }
    function addUserMsg(text) {
      clearWelcome();
      const wrap = document.createElement('div');
      wrap.className = 'cs-msg cs-msg-user';
      wrap.innerHTML = '<div class="cs-msg-bubble">' + escapeHtml(text) + '</div>';
      $messages.appendChild(wrap);
      scrollToBottom();
    }
    function addLoadingMsg() {
      const wrap = document.createElement('div');
      wrap.className = 'cs-msg cs-msg-agent cs-loading';
      wrap.id = 'cs-loading-msg';
      wrap.innerHTML = '<div class="cs-msg-bubble">Buscando en los manuales<span class="cs-dot">.</span><span class="cs-dot">.</span><span class="cs-dot">.</span></div>';
      $messages.appendChild(wrap);
      scrollToBottom();
    }
    function removeLoadingMsg() {
      const el = document.getElementById('cs-loading-msg');
      if (el) el.remove();
    }
    function highlightSource(ref) {
      document.querySelectorAll('.cs-source-item.cs-highlighted').forEach(function (el) { el.classList.remove('cs-highlighted'); });
      const el = document.getElementById('cs-source-' + ref);
      if (el) {
        el.classList.add('cs-highlighted');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(function () { el.classList.remove('cs-highlighted'); }, 2500);
      }
    }
    function addAgentMsg(answer, suggestions) {
      const wrap = document.createElement('div');
      wrap.className = 'cs-msg cs-msg-agent';
      const bubble = document.createElement('div');
      bubble.className = 'cs-msg-bubble';
      bubble.innerHTML = renderAnswerHtml(answer);
      wrap.appendChild(bubble);

      if (Array.isArray(suggestions) && suggestions.length > 0) {
        const sugWrap = document.createElement('div');
        sugWrap.className = 'cs-msg-suggestions';
        suggestions.forEach(function (s) {
          const btn = document.createElement('button');
          btn.className = 'cs-suggestion';
          btn.textContent = s;
          btn.addEventListener('click', function () {
            $input.value = s; autoresize();
            $form.dispatchEvent(new Event('submit'));
          });
          sugWrap.appendChild(btn);
        });
        wrap.appendChild(sugWrap);
      }
      $messages.appendChild(wrap);
      bubble.querySelectorAll('.cs-cite').forEach(function (chip) {
        chip.addEventListener('click', function () {
          const ref = parseInt(chip.getAttribute('data-ref'), 10);
          // Si el documento existe en el indice, navegamos. Si no, solo resaltamos.
          if (!openDocFromCitation(ref)) {
            highlightSource(ref);
          }
        });
      });
      scrollToBottom();
    }
    function renderSources(sources) {
      state.lastSources = sources || [];
      $sourcesList.innerHTML = '';
      if (!sources || sources.length === 0) {
        $sourcesEmpty.style.display = '';
        return;
      }
      $sourcesEmpty.style.display = 'none';
      sources.forEach(function (s) {
        const li = document.createElement('li');
        li.className = 'cs-source-item';
        li.id = 'cs-source-' + s.ref;
        const docId = resolveDocIdFromSource(s.source);
        const linkClass = docId ? ' cs-source-clickable' : '';
        const linkHint = docId ? '<span class="cs-source-hint">Click para abrir &rarr;</span>' : '';
        li.className = 'cs-source-item' + linkClass;
        li.innerHTML =
          '<div><span class="cs-source-ref">' + s.ref + '</span>' +
          '<span class="cs-source-name">' + escapeHtml(s.source) + '</span></div>' +
          '<div class="cs-source-snippet">' + escapeHtml(s.snippet) + '</div>' +
          '<span class="cs-source-sim">Relevancia: ' + (s.similarity * 100).toFixed(0) + '%</span>' +
          linkHint;
        if (docId && typeof window.openDoc === 'function') {
          li.addEventListener('click', function () {
            window.openDoc(docId);
            scrollToChunkInDoc(s.snippet);
          });
        }
        $sourcesList.appendChild(li);
      });
    }

    async function ask(question) {
      addUserMsg(question);
      state.history.push({ role: 'user', content: question });
      addLoadingMsg();
      $send.disabled = true;
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question, history: state.history.slice(0, -1) }),
        });
        const data = await res.json();
        removeLoadingMsg();
        if (!res.ok) {
          if (res.status === 429) {
            addAgentMsg('Se alcanzo el limite de consultas diarias del agente. Volvé a intentarlo manana. (' + (data.detail || '') + ')', []);
          } else {
            addAgentMsg('Hubo un error consultando los manuales: ' + (data.error || 'desconocido'), []);
          }
          return;
        }
        addAgentMsg(data.answer || 'Sin respuesta.', data.suggestions || []);
        renderSources(data.sources || []);
        state.history.push({ role: 'assistant', content: data.answer || '' });
      } catch (err) {
        removeLoadingMsg();
        addAgentMsg('No pude conectarme al servidor. Revisa tu conexion.', []);
        console.error(err);
      } finally {
        $send.disabled = false;
        $input.focus();
      }
    }

    $form.addEventListener('submit', function (e) {
      e.preventDefault();
      const q = $input.value.trim();
      if (q.length < 3) return;
      $input.value = '';
      autoresize();
      ask(q);
    });
    $input.addEventListener('input', autoresize);
    $input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $form.dispatchEvent(new Event('submit'));
      }
    });
    root.querySelectorAll('#cs-suggested-initial .cs-suggestion').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $input.value = btn.textContent;
        autoresize();
        $form.dispatchEvent(new Event('submit'));
      });
    });
    $input.focus();
  }

  global.AsistenteWidget = { mount: mount };
})(window);
