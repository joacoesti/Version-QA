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

function mdToHTML(md) {
  const lines = md.split(/\r?\n/);
  let html = "";
  let inOl = false, inUl = false, inTable = false, tableHeaderEmitted = false;
  function closeLists(){ if(inOl){html += "</ol>"; inOl=false;} if(inUl){html += "</ul>"; inUl=false;} }
  function closeTable(){ if(inTable){ html += "</table>"; inTable=false; tableHeaderEmitted=false; } }
  function closeAll(){ closeLists(); closeTable(); }

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { closeAll(); continue; }

    // tablas markdown: lineas que empiezan y terminan con |
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map(c => c.trim());
      const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
      if (isSeparator) { tableHeaderEmitted = true; continue; }
      if (!inTable) { closeLists(); html += '<table class="md-table">'; inTable = true; tableHeaderEmitted = false; }
      const tag = tableHeaderEmitted ? "td" : "th";
      html += "<tr>" + cells.map(c => `<${tag}>${inlineMD(c)}</${tag}>`).join("") + "</tr>";
      if (!tableHeaderEmitted) tableHeaderEmitted = true; // primera fila es header si no hay separador
      continue;
    } else if (inTable) {
      closeTable();
    }

    if (line.startsWith("#### ")) { closeAll(); html += `<h4>${inlineMD(line.slice(5))}</h4>`; continue; }
    if (line.startsWith("### "))  { closeAll(); html += `<h3>${inlineMD(line.slice(4))}</h3>`; continue; }
    if (line.startsWith("## "))   { closeAll(); html += `<h2>${inlineMD(line.slice(3))}</h2>`; continue; }
    if (line.startsWith("# "))    { closeAll(); html += `<h1>${inlineMD(line.slice(2))}</h1>`; continue; }
    if (line.startsWith("> "))    { closeAll(); html += `<blockquote>${inlineMD(line.slice(2))}</blockquote>`; continue; }

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

async function loadMarkdown(path) {
  const r = await fetch(path + "?t=" + Date.now());
  if (!r.ok) throw new Error("No se pudo cargar " + path);
  return await r.text();
}
