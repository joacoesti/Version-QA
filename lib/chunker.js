// lib/chunker.js
// Divide un texto largo en fragmentos manejables con overlap.
// Estrategia: cortar primero por párrafos, después por oraciones, después por caracteres.

const DEFAULT_SIZE = parseInt(process.env.CHUNK_SIZE || '500', 10);
const DEFAULT_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '120', 10);

/**
 * Trocea un texto en chunks de ~chunkSize caracteres con overlap.
 * @param {string} text
 * @param {{ chunkSize?: number, overlap?: number }} opts
 * @returns {string[]}
 */
export function chunkText(text, { chunkSize = DEFAULT_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= chunkSize) return [clean];

  // 1) Dividir por párrafos
  const paragraphs = clean.split(/\n\n+/);

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= chunkSize) {
      current = current ? current + '\n\n' + para : para;
    } else {
      flush();
      if (para.length <= chunkSize) {
        current = para;
      } else {
        // Párrafo largo: dividir por oraciones
        const sentences = para.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          if ((current + ' ' + s).length <= chunkSize) {
            current = current ? current + ' ' + s : s;
          } else {
            flush();
            if (s.length <= chunkSize) {
              current = s;
            } else {
              // Oración eterna: cortar a la fuerza
              for (let i = 0; i < s.length; i += chunkSize) {
                chunks.push(s.slice(i, i + chunkSize));
              }
            }
          }
        }
      }
    }
  }
  flush();

  // 2) Agregar overlap (cada chunk arranca con las últimas N chars del anterior)
  if (overlap > 0 && chunks.length > 1) {
    const withOverlap = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const tail = prev.slice(-overlap);
      withOverlap.push(tail + ' ' + chunks[i]);
    }
    return withOverlap;
  }

  return chunks;
}
