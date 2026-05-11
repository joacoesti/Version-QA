// js/consultas-agent.js
// Logica del chat: enviar pregunta al /api/ask, renderizar respuesta con citas inline,
// historial de conversacion, sidebar de fuentes, preguntas sugeridas.

(function () {
  'use strict';

  const ENDPOINT = '/api/ask';

  const $messages = document.getElementById('cs-messages');
  const $form = document.getElementById('cs-form');
  const $input = document.getElementById('cs-input');
  const $send = document.getElementById('cs-send');
  const $sourcesList = document.getElementById('cs-sources-list');
  const $sourcesEmpty = document.getElementById('cs-sources-empty');

  // Estado conversacional (lo que mandamos al backend como history)
  const history = [];
  // Ultimas fuentes recibidas (para resaltar al clickear cita)
  let lastSources = [];

  // ===== UTILIDADES =====

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Convierte el texto del modelo a HTML:
  // - Reemplaza [1], [2] por chips clicables
  // - Soporta **negrita**, listas con - o *, saltos de linea
  function renderAnswerHtml(text) {
    let html = escapeHtml(text);
    // Negrita **texto**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Citas [n]
    html = html.replace(/\[(\d+)\]/g, function (_, n) {
      return '<span class="cs-cite" data-ref="' + n + '">' + n + '</span>';
    });
    // Listas: lineas que empiezan con "- " o "* "
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

  function scrollToBottom() {
    requestAnimationFrame(function () {
      $messages.scrollTop = $messages.scrollHeight;
    });
  }

  function autoresize() {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 200) + 'px';
  }

  // ===== RENDER MENSAJES =====

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
    wrap.innerHTML =
      '<div class="cs-msg-bubble">Buscando en los manuales' +
      '<span class="cs-dot">.</span><span class="cs-dot">.</span><span class="cs-dot">.</span>' +
      '</div>';
    $messages.appendChild(wrap);
    scrollToBottom();
  }

  function removeLoadingMsg() {
    const el = document.getElementById('cs-loading-msg');
    if (el) el.remove();
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
          $input.value = s;
          autoresize();
          $form.dispatchEvent(new Event('submit'));
        });
        sugWrap.appendChild(btn);
      });
      wrap.appendChild(sugWrap);
    }

    $messages.appendChild(wrap);

    // Wire up citas
    bubble.querySelectorAll('.cs-cite').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const ref = parseInt(chip.getAttribute('data-ref'), 10);
        highlightSource(ref);
      });
    });

    scrollToBottom();
  }

  function renderSources(sources) {
    lastSources = sources || [];
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
      li.innerHTML =
        '<div><span class="cs-source-ref">' + s.ref + '</span>' +
        '<span class="cs-source-name">' + escapeHtml(s.source) + '</span></div>' +
        '<div class="cs-source-snippet">' + escapeHtml(s.snippet) + '</div>' +
        '<span class="cs-source-sim">Relevancia: ' + (s.similarity * 100).toFixed(0) + '%</span>';
      $sourcesList.appendChild(li);
    });
  }

  function highlightSource(ref) {
    document.querySelectorAll('.cs-source-item.cs-highlighted').forEach(function (el) {
      el.classList.remove('cs-highlighted');
    });
    const el = document.getElementById('cs-source-' + ref);
    if (el) {
      el.classList.add('cs-highlighted');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(function () { el.classList.remove('cs-highlighted'); }, 2500);
    }
  }

  // ===== ENVIO AL BACKEND =====

  async function ask(question) {
    addUserMsg(question);
    history.push({ role: 'user', content: question });

    addLoadingMsg();
    $send.disabled = true;

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question, history: history.slice(0, -1) }),
      });
      const data = await res.json();
      removeLoadingMsg();

      if (!res.ok) {
        addAgentMsg('Hubo un error consultando los manuales: ' + (data.error || 'desconocido') + '. Intentalo de nuevo en unos segundos.', []);
        return;
      }

      addAgentMsg(data.answer || 'Sin respuesta.', data.suggestions || []);
      renderSources(data.sources || []);
      history.push({ role: 'assistant', content: data.answer || '' });
    } catch (err) {
      removeLoadingMsg();
      addAgentMsg('No pude conectarme al servidor. Revisá tu conexión y volvé a intentar.', []);
      console.error(err);
    } finally {
      $send.disabled = false;
      $input.focus();
    }
  }

  // ===== EVENT WIRING =====

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

  // Sugerencias iniciales
  document.querySelectorAll('#cs-suggested-initial .cs-suggestion').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $input.value = btn.textContent;
      autoresize();
      $form.dispatchEvent(new Event('submit'));
    });
  });

  $input.focus();
})();
