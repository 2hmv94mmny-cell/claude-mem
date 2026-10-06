// Reading CV files in the browser. Nothing is uploaded anywhere: PDFs and
// Word files are parsed on the device, and only the extracted text (or, for
// photos and scanned PDFs, page images) is sent to Claude.
//
// Libraries load on first use from jsDelivr as plain scripts that define a
// global, which works both standalone and inside the artifact viewer.

const LIBS = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js',
};

const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => {
          loaded.delete(src);
          reject(new Error('Could not load a helper library. Check your connection and try again.'));
        };
        document.head.append(s);
      }),
    );
  }
  return loaded.get(src);
}

async function pdfjs() {
  // Load the worker code on the main thread too: pdf.js then runs without a
  // separate Worker, which the artifact viewer would not allow from a CDN.
  await loadScript(LIBS.pdf);
  await loadScript(LIBS.pdfWorker);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  return lib;
}

export const ACCEPT = '.pdf,.docx,.txt,.md,.rtf,image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

/**
 * Read a CV file.
 * @returns {Promise<{text: string, images: Blob[], kind: string}>}
 *   `text` when the file has a text layer; otherwise `images` of its pages.
 */
export async function readCVFile(file) {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) {
    return { text: '', images: [file], kind: 'image' };
  }

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageText(content.items));
    }
    const text = tidy(pages.join('\n\n'));
    if (text.replace(/\s/g, '').length > 80) return { text, images: [], kind: 'pdf' };
    // Scanned PDF with no text layer: send page images instead.
    const images = [];
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) images.push(await renderPage(await doc.getPage(i)));
    return { text: '', images, kind: 'scanned-pdf' };
  }

  if (name.endsWith('.docx') || type.includes('wordprocessingml')) {
    await loadScript(LIBS.mammoth);
    const { value } = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: tidy(value), images: [], kind: 'docx' };
  }

  if (name.endsWith('.doc')) {
    throw new Error('Old .doc files cannot be read. Save it as .docx or PDF and upload that.');
  }

  // Plain text, Markdown, RTF (RTF control words stripped roughly).
  let text = await file.text();
  if (name.endsWith('.rtf')) text = text.replace(/\\[a-z]+-?\d* ?|[{}]/gi, '');
  return { text: tidy(text), images: [], kind: 'text' };
}

// Rebuild lines from pdf.js text items using their vertical position.
function pageText(items) {
  const lines = [];
  let lastY = null;
  let line = '';
  for (const it of items) {
    const y = Math.round(it.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      lines.push(line);
      line = '';
    }
    line += (line && !line.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
    if (it.hasEOL) {
      lines.push(line);
      line = '';
      lastY = null;
      continue;
    }
    lastY = y;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

async function renderPage(page) {
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

function tidy(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
