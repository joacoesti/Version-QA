function escapeHTML(s) {
  return (s || "").replace(/[&<>"']/g, function(c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

function inlineMD(s) {
  return escapeHTML(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function mdToHTML(md) {
  const lines = md.split(/\r?\n/);
  let html = "";
  let inOl = false, inUl = false;
  function closeLists(){ if(inOl){html += "</ol>"; inOl=false;} if(inUl){html += "</ul>"; inUl=false;} }
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { closeLists(); continue; }
    if (line.startsWith("# ")) { closeLists(); html += `<h1>${inlineMD(line.slice(2))}</h1>`; continue; }
    if (line.startsWith("## ")) { closeLists(); html += `<h2>${inlineMD(line.slice(3))}</h2>`; continue; }
    if (line.startsWith("> ")) { closeLists(); html += `<blockquote>${inlineMD(line.slice(2))}</blockquote>`; continue; }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if(!inOl){ closeLists(); html += "<ol>"; inOl=true; } html += `<li>${inlineMD(ol[1])}</li>`; continue; }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if(!inUl){ closeLists(); html += "<ul>"; inUl=true; } html += `<li>${inlineMD(ul[1])}</li>`; continue; }
    closeLists();
    html += `<p>${inlineMD(line)}</p>`;
  }
  closeLists();
  return html;
}

async function loadMarkdown(path) {
  const r = await fetch(path + "?t=" + Date.now());
  if (!r.ok) throw new Error("No se pudo cargar " + path);
  return await r.text();
}
