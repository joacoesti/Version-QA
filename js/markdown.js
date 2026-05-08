function escapeHTML(s) {
  return (s || "").replace(/[&<>"']/g, function(c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

function inlineMD(s) {
  return escapeHTML(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="javascript:void(0)" class="doc-link" data-doc-id="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function mdSlug(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/[^a-z0-9\s-]/g,"")
    .trim().replace(/\s+/g,"-").slice(0,60) || "h";
}

function mdToHTML(md) {
  const lines = md.split(/\r?\n/);
  let html = "";
  let inOl = false, inUl = false, inTable = false, tableHeaderEmitted = false;
  const idCount = {};
  function uniqueId(base){ idCount[base]=(idCount[base]||0)+1; return idCount[base]>1?`${base}-${idCount[base]}`:base; }
  function closeLists(){ if(inOl){html += "</ol>"; inOl=false;} if(inUl){html += "</ul>"; inUl=false;} }
  function closeTable(){ if(inTable){ html += "</table>"; inTable=false; tableHeaderEmitted=false; } }
  function closeAll(){ closeLists(); closeTable(); }

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { closeAll(); continue; }

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map(c => c.trim());
      const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
      if (isSeparator) { tableHeaderEmitted = true; continue; }
      if (!inTable) { closeLists(); html += '<table class="md-table">'; inTable = true; tableHeaderEmitted = false; }
      const tag = tableHeaderEmitted ? "td" : "th";
      html += "<tr>" + cells.map(c => `<${tag}>${inlineMD(c)}</${tag}>`).join("") + "</tr>";
      if (!tableHeaderEmitted) tableHeaderEmitted = true;
      continue;
    } else if (inTable) {
      closeTable();
    }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      closeAll();
      const lvl = m[1].length, txt = m[2];
      const id = uniqueId(mdSlug(txt));
      html += `<h${lvl} id="${id}">${inlineMD(txt)}</h${lvl}>`;
      continue;
    }
    if (line.startsWith("> ")) { closeAll(); html += `<blockquote>${inlineMD(line.slice(2))}</blockquote>`; continue; }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if(!inOl){ closeLists(); html += "<ol>"; inOl=true; } html += `<li>${inlineMD(ol[1])}</li>`; continue; }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if(!inUl){ closeLists(); html += "<ul>"; inUl=true; } html += `<li>${inlineMD(ul[1])}</li>`; continue; }

    closeLists();
    html += `<p>${inlineMD(line)}</p>`;
  }
  closeAll();
  return html;
}

function mdExtractTOC(md) {
  const lines = md.split(/\r?\n/);
  const items = [];
  const idCount = {};
  for (let raw of lines) {
    const m = raw.trim().match(/^(#{1,4})\s+(.*)$/);
    if (!m) continue;
    const lvl = m[1].length;
    if (lvl === 1) continue; // h1 no va en TOC (es el título)
    const txt = m[2];
    const baseId = mdSlug(txt);
    idCount[baseId] = (idCount[baseId] || 0) + 1;
    const id = idCount[baseId] > 1 ? `${baseId}-${idCount[baseId]}` : baseId;
    items.push({ level: lvl, text: txt, id });
  }
  if (!items.length) return "";
  let html = '<nav class="md-toc"><div class="md-toc-title" onclick="this.parentElement.classList.toggle(\'collapsed\')">📑 En esta página <span class="md-toc-chev">▾</span></div><ul class="md-toc-list">';
  for (const it of items) {
    html += `<li class="md-toc-l${it.level}"><a href="#${it.id}" data-toc-id="${it.id}">${escapeHTML(it.text)}</a></li>`;
  }
  html += '</ul></nav>';
  return html;
}

async function loadMarkdown(path) {
  const r = await fetch(path + "?t=" + Date.now());
  if (!r.ok) throw new Error("No se pudo cargar " + path);
  return await r.text();
}
