import { caps, inArtifact } from './runtime.js';

// Tiny DOM helpers. No framework: keeps the app small, fast and easy to wrap
// as a native app later.

const PROPS = new Set(['checked', 'disabled', 'hidden', 'selected', 'required', 'value', 'draggable']);

/** h('div', {class: 'x', onclick: fn}, child, 'text', [moreChildren]) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = k === 'draggable' ? v === true || v === 'true' : v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * Minimal, safe Markdown renderer for AI output. All text is HTML-escaped
 * before any tags are added, so model output can never inject markup.
 */
export function md(src = '') {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara();
      closeList();
      const level = Math.min(m[1].length + 1, 5);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushPara();
      closeList();
      out.push('<hr>');
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();

  const tpl = document.createElement('template');
  tpl.innerHTML = out.join('');
  const wrap = document.createElement('div');
  wrap.className = 'md';
  wrap.append(tpl.content);
  return wrap;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Could not copy. Select the text and copy it manually.');
  }
}

export async function download(filename, text, type = 'text/markdown') {
  if (caps.downloads) {
    try {
      await caps.downloads.save({ filename, data: text });
      toast('Saved');
    } catch (e) {
      if (e?.code !== 'declined') toast('Could not save the file here. Use Copy instead.');
    }
    return;
  }
  if (inArtifact) {
    toast('Saving files is not available here. Use Copy instead.');
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Whether this view can print (artifact viewers cannot). */
export const canPrint = !inArtifact;

/**
 * Two-step confirm built into the button itself (the artifact viewer
 * blocks window.confirm). First click arms it; a second click within a few
 * seconds runs `action`.
 */
export function confirmButton(label, armedLabel, action, cls = 'btn danger') {
  const btn = h('button', { class: cls, type: 'button' }, label);
  let timer;
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) {
      clearTimeout(timer);
      action();
      return;
    }
    btn.dataset.armed = '1';
    btn.textContent = armedLabel;
    timer = setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = label;
    }, 4000);
  });
  return btn;
}

/** Open a clean, print-ready page so the user can "Save as PDF". */
export function printDoc(title, node) {
  const win = window.open('', '_blank');
  if (!win) {
    toast('Allow pop-ups to print or save as PDF.');
    return;
  }
  const d = win.document;
  d.title = title;
  const style = d.createElement('style');
  style.textContent = `
    body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #111; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.5rem; }
    h2 { font-size: 1.7em; margin: 0 0 .2em; } h3 { font-size: 1.1em; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #ccc; padding-bottom: .2em; margin-top: 1.4em; }
    h4, h5 { margin: 1em 0 .2em; } ul, ol { padding-left: 1.2em; } li { margin: .15em 0; } p { margin: .5em 0; } a { color: inherit; }
    @page { margin: 1.6cm; }`;
  d.head.append(style);
  d.body.append(d.importNode(node, true));
  win.focus();
  setTimeout(() => win.print(), 250);
}

export function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
