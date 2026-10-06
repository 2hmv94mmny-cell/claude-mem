// CV templates. Each template renders the same structured CV twice: as an
// on-screen preview (DOM) and as a PDF (pdfmake). Both read one spec so the
// download matches what the user picked.
//
// The designs follow well-known public CV formats: the Harvard career
// services résumé, "Jake's Resume" and Awesome CV and ModernCV from the LaTeX
// world, the EU Europass layout, plus Modern, Minimal and Sidebar styles.

import { h } from './ui.js';
import { loadScript } from './files.js';
import { contactParts, dates } from './cvdoc.js';

const ACCENTS = ['#2b5797', '#0f766e', '#9b2c2c', '#6d28d9', '#b45309', '#1f2937'];

export const TEMPLATES = [
  { id: 'harvard', name: 'Harvard', blurb: 'The classic résumé from Harvard career services. Serif, centred, no colour.', ats: true, layout: 'single', font: 'serif', sep: '  •  ' },
  { id: 'jakes', name: "Jake's Resume", blurb: 'The popular LaTeX résumé used across tech. Dense and tidy.', ats: true, layout: 'single', font: 'serif', sep: '  |  ' },
  { id: 'modern', name: 'Modern', blurb: 'Clean sans serif with a colour accent.', ats: true, layout: 'single', font: 'sans', sep: '  ·  ', accent: '#3b3ad6', accents: ['#3b3ad6', ...ACCENTS] },
  { id: 'minimal', name: 'Minimal', blurb: 'Lots of white space and quiet headings.', ats: true, layout: 'single', font: 'sans', sep: '  ·  ' },
  { id: 'awesome', name: 'Awesome CV', blurb: 'The well-known LaTeX CV with a bold colour accent.', ats: true, layout: 'single', font: 'sans', sep: '  |  ', accent: '#dc3522', accents: ['#dc3522', ...ACCENTS] },
  { id: 'moderncv', name: 'ModernCV', blurb: 'LaTeX classic with dates in a left column.', ats: true, layout: 'datecol', font: 'sans', sep: '  ·  ', accent: '#3873b3', accents: ['#3873b3', ...ACCENTS] },
  { id: 'europass', name: 'Europass', blurb: 'The EU standard layout with labels on the left.', ats: true, layout: 'europass', font: 'sans', sep: '  ·  ', accent: '#004494', accents: ['#004494', ...ACCENTS] },
  { id: 'sidebar', name: 'Sidebar', blurb: 'Coloured sidebar for contact and skills. Eye-catching, but some ATS read two columns poorly.', ats: false, layout: 'sidebar', font: 'sans', sep: '\n', accent: '#1e3a5f', accents: ['#1e3a5f', ...ACCENTS] },
];

// Earlier template ids, kept so saved choices still work.
const ALIASES = { classic: 'harvard', compact: 'jakes' };

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === (ALIASES[id] || id)) || TEMPLATES[0];
}

/** The accent to use: the user's pick if the template supports it, else its default. */
export function accentFor(t, picked) {
  if (!t.accents) return '#111827';
  return /^#[0-9a-f]{6}$/i.test(picked || '') && t.accents.includes(picked) ? picked : t.accent;
}

const SECTION_TITLES = {
  summary: 'Profile',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Skills',
  certifications: 'Certifications',
  languages: 'Languages',
};

function sectionsFor(cv, t) {
  const has = {
    summary: Boolean(cv.summary),
    experience: cv.experience.length > 0,
    projects: cv.projects.length > 0,
    education: cv.education.length > 0,
    skills: cv.skills.length > 0,
    certifications: cv.certifications.length > 0,
    languages: cv.languages.length > 0,
  };
  const order =
    t.layout === 'sidebar'
      ? ['summary', 'experience', 'projects']
      : ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'languages'];
  return order.filter((k) => has[k]);
}

// How the two lines of an experience entry are arranged, per template:
// [[line1 left, line1 right], [line2 left, line2 right]]
function expRows(t, e) {
  const where = [e.company, e.location].filter(Boolean).join(', ');
  switch (t.id) {
    case 'harvard':
    case 'awesome':
      return [[e.company || e.title, e.location], [e.company ? e.title : '', dates(e)]];
    case 'jakes':
      return [[e.title, dates(e)], [e.company, e.location]];
    default:
      return [[e.title, dates(e)], [where, '']];
  }
}

function eduRows(t, e) {
  switch (t.id) {
    case 'harvard':
    case 'awesome':
      return [[e.school || e.degree, e.location], [e.school ? e.degree : '', dates(e)]];
    case 'jakes':
      return [[e.school || e.degree, e.location], [e.school ? e.degree : '', dates(e)]];
    default:
      return [[e.degree, dates(e)], [[e.school, e.location].filter(Boolean).join(', '), '']];
  }
}

const splitName = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? [parts.slice(0, -1).join(' '), parts.at(-1)] : ['', parts[0] || ''];
};

// ===========================================================================
// On-screen preview
// ===========================================================================

export function renderCV(cv, templateId = 'harvard', pickedAccent) {
  const t = getTemplate(templateId);
  const accent = accentFor(t, pickedAccent);
  const page = h('article', { class: `cv-page tpl-${t.id} lay-${t.layout}`, style: `--cv-accent:${accent}` });

  if (t.layout === 'sidebar') {
    page.append(sidebarPreview(cv, t));
    return page;
  }

  page.append(headerPreview(cv, t));
  for (const key of sectionsFor(cv, t)) {
    if (t.layout === 'single') page.append(h('section', { class: 'cv-section' }, headingPreview(t, SECTION_TITLES[key]), ...bodyPreview(cv, t, key)));
    else page.append(h('section', { class: 'cv-section cv-grid' }, h('div', { class: 'cv-label' }, t.layout === 'datecol' ? h('span', { class: 'cv-bar' }) : SECTION_TITLES[key]), h('div', {}, t.layout === 'datecol' ? headingPreview(t, SECTION_TITLES[key]) : '', ...bodyPreview(cv, t, key))));
  }
  return page;
}

function headerPreview(cv, t) {
  const [first, last] = splitName(cv.name);
  const name = t.id === 'awesome' ? h('h2', {}, h('span', { class: 'light' }, first ? `${first} ` : ''), last) : h('h2', {}, cv.name || 'Your name');
  const contact = contactParts(cv);
  if (t.layout === 'europass') {
    const c = cv.contact;
    const rows = [
      ['Email', c.email],
      ['Phone', c.phone],
      ['Location', c.location],
      ['Links', c.links.join(', ')],
    ].filter(([, v]) => v);
    return h(
      'header',
      { class: 'cv-head' },
      h('div', { class: 'cv-grid' }, h('div', { class: 'cv-label' }, 'Personal'), h('div', {}, name, cv.headline && h('p', { class: 'cv-headline' }, cv.headline))),
      ...rows.map(([k, v]) => h('div', { class: 'cv-grid cv-contact-row' }, h('div', { class: 'cv-label sub' }, k), h('div', {}, v))),
    );
  }
  return h(
    'header',
    { class: 'cv-head' },
    name,
    cv.headline && h('p', { class: 'cv-headline' }, cv.headline),
    h('p', { class: 'cv-contact' }, contact.join(t.sep)),
  );
}

function headingPreview(t, title) {
  if (t.id === 'awesome') return h('h3', {}, h('span', { class: 'acc' }, title.slice(0, 3)), title.slice(3));
  return h('h3', {}, title);
}

function rowsPreview(rows) {
  return rows
    .filter(([l, r]) => l || r)
    .map(([l, r], i) => h('div', { class: `cv-row r${i + 1}` }, h('span', { class: 'l' }, l || ''), r ? h('span', { class: 'r' }, r) : ''));
}

function bodyPreview(cv, t, key) {
  const dateCol = t.layout === 'datecol' || t.layout === 'europass';
  const entry = (rows, bullets, when) =>
    dateCol
      ? h(
          'div',
          { class: 'cv-item cv-grid' },
          h('div', { class: 'cv-label date' }, when),
          h('div', {}, ...rowsPreview(rows.map(([l]) => [l, ''])), bullets),
        )
      : h('div', { class: 'cv-item' }, ...rowsPreview(rows), bullets);
  const list = (items) => (items.length ? h('ul', {}, ...items.map((b) => h('li', {}, b))) : '');

  switch (key) {
    case 'summary':
      return [h('p', {}, cv.summary)];
    case 'experience':
      return cv.experience.map((e) =>
        dateCol ? entry([[e.title], [[e.company, e.location].filter(Boolean).join(', ')]], list(e.bullets), dates(e)) : entry(expRows(t, e), list(e.bullets)),
      );
    case 'education':
      return cv.education.map((e) =>
        dateCol
          ? entry([[e.degree], [[e.school, e.location].filter(Boolean).join(', ')], [e.details]], '', dates(e))
          : h('div', { class: 'cv-item' }, ...rowsPreview(eduRows(t, e)), e.details && h('p', { class: 'cv-muted' }, e.details)),
      );
    case 'projects':
      return cv.projects.map((p) => h('div', { class: 'cv-item' }, h('div', { class: 'cv-row r1' }, h('span', { class: 'l' }, p.name), p.link ? h('span', { class: 'r' }, p.link) : ''), p.description && h('p', {}, p.description)));
    case 'skills':
      return cv.skills.map((s) => h('p', { class: 'cv-skill' }, s.label && h('strong', {}, `${s.label}: `), s.items.join(', ')));
    case 'certifications':
      return [h('p', {}, cv.certifications.join(t.sep.trim() === '|' ? '  |  ' : '  ·  '))];
    case 'languages':
      return [h('p', {}, cv.languages.join('  ·  '))];
    default:
      return [];
  }
}

function sidebarPreview(cv, t) {
  const c = cv.contact;
  const side = h(
    'aside',
    { class: 'cv-side' },
    h('h4', {}, 'Contact'),
    ...[c.email, c.phone, c.location, ...c.links].filter(Boolean).map((x) => h('p', {}, x)),
    ...(cv.skills.length ? [h('h4', {}, 'Skills'), ...cv.skills.flatMap((s) => [s.label ? h('p', { class: 'side-label' }, s.label) : '', h('p', {}, s.items.join(', '))])] : []),
    ...(cv.education.length
      ? [h('h4', {}, 'Education'), ...cv.education.flatMap((e) => [h('p', { class: 'side-label' }, e.degree), h('p', {}, [e.school, dates(e)].filter(Boolean).join(', '))])]
      : []),
    ...(cv.languages.length ? [h('h4', {}, 'Languages'), ...cv.languages.map((l) => h('p', {}, l))] : []),
    ...(cv.certifications.length ? [h('h4', {}, 'Certifications'), ...cv.certifications.map((l) => h('p', {}, l))] : []),
  );
  const main = h(
    'div',
    { class: 'cv-main' },
    h('header', { class: 'cv-head' }, h('h2', {}, cv.name || 'Your name'), cv.headline && h('p', { class: 'cv-headline' }, cv.headline)),
    ...sectionsFor(cv, t).map((key) => h('section', { class: 'cv-section' }, h('h3', {}, SECTION_TITLES[key]), ...bodyPreview(cv, t, key))),
  );
  return h('div', { class: 'cv-sidebar-wrap' }, side, main);
}

// ===========================================================================
// PDF (pdfmake)
// ===========================================================================

const PDFMAKE = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/pdfmake.min.js';
const OWN_FONTS = 'js/cv-fonts.js';

const FONTS = {
  Tinos: { normal: 'Tinos-Regular.ttf', bold: 'Tinos-Bold.ttf', italics: 'Tinos-Italic.ttf', bolditalics: 'Tinos-BoldItalic.ttf' },
  SourceSans: { normal: 'SourceSans-Regular.ttf', bold: 'SourceSans-Bold.ttf', italics: 'SourceSans-Italic.ttf', bolditalics: 'SourceSans-BoldItalic.ttf' },
  SourceSansLight: { normal: 'SourceSans-Light.ttf', bold: 'SourceSans-SemiBold.ttf', italics: 'SourceSans-Italic.ttf', bolditalics: 'SourceSans-BoldItalic.ttf' },
};
const FAMILY = { serif: 'Tinos', sans: 'SourceSans' };

const INK = '#1f2937';
const MUTED = '#6b7280';
const A4_W = 595.28;

/** Build a PDF Blob from a pdfmake definition. */
export async function makePDF(definition) {
  await loadScript(PDFMAKE);
  await loadScript(OWN_FONTS);
  const pm = window.pdfMake;
  // addVirtualFileSystem replaces pdfmake's font set, so register ours once and only ours.
  if (!pm.__ajhFonts) {
    pm.addVirtualFileSystem(window.AJH_PDF_FONTS);
    pm.__ajhFonts = true;
  }
  return new Promise((resolve, reject) => {
    try {
      pm.createPdf(definition, null, FONTS).getBlob(resolve);
    } catch (err) {
      reject(err);
    }
  });
}

function pdfLook(t, accent) {
  const serif = t.font === 'serif';
  const base = t.id === 'jakes' ? 9.5 : serif ? 10.5 : 10;
  return {
    font: FAMILY[t.font],
    base,
    accent,
    headColor: { harvard: '#111111', jakes: '#111111', modern: accent, minimal: '#6b7280', awesome: '#222222', moderncv: accent, europass: accent, sidebar: accent }[t.id],
    nameSize: { harvard: 20, jakes: 24, modern: 22, minimal: 24, awesome: 28, moderncv: 26, europass: 20, sidebar: 24 }[t.id],
    center: ['harvard', 'jakes', 'awesome'].includes(t.id),
  };
}

function pdfHeading(t, L, title, width) {
  const rule = (color, w = 0.7) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: w, lineColor: color }], margin: [0, 1, 0, 4] });
  switch (t.id) {
    case 'harvard':
      return [{ text: title.toUpperCase(), bold: true, fontSize: L.base + 0.5, margin: [0, 10, 0, 1] }, rule('#111111', 0.8)];
    case 'jakes':
      return [{ text: title.toUpperCase(), fontSize: L.base + 2, characterSpacing: 0.6, margin: [0, 9, 0, 1] }, rule('#111111', 0.6)];
    case 'minimal':
      return [{ text: title.toUpperCase(), fontSize: L.base - 1, bold: true, color: L.headColor, characterSpacing: 1.6, margin: [0, 14, 0, 5] }];
    case 'awesome':
      return [{ text: [{ text: title.slice(0, 3), color: L.accent }, title.slice(3)], bold: true, fontSize: L.base + 5, margin: [0, 12, 0, 1] }, rule('#999999', 0.5)];
    case 'sidebar':
      return [{ text: title.toUpperCase(), bold: true, fontSize: L.base + 1, color: L.accent, characterSpacing: 1, margin: [0, 12, 0, 1] }, rule(L.accent, 1.2)];
    default:
      return [{ text: title, bold: true, fontSize: L.base + 2, color: L.headColor, margin: [0, 12, 0, 1] }, rule(L.accent, 0.8)];
  }
}

function pdfRows(t, L, rows) {
  return rows
    .filter(([l, r]) => l || r)
    .map(([l, r], i) => {
      const style =
        i === 0
          ? { bold: true }
          : t.id === 'harvard' || t.id === 'jakes'
            ? { italics: true }
            : t.id === 'awesome'
              ? { color: MUTED, fontSize: L.base - 0.5 }
              : { color: MUTED };
      const rStyle = i === 0 && (t.id === 'harvard' || t.id === 'awesome') ? { bold: false, italics: t.id === 'awesome', color: t.id === 'awesome' ? L.accent : INK } : { ...style, bold: false };
      return {
        columns: [
          { text: l || '', width: '*', ...style },
          r ? { text: r, width: 'auto', alignment: 'right', ...rStyle } : { text: '', width: 0 },
        ],
        columnGap: 8,
        margin: [0, i === 0 ? 5 : 0, 0, 0],
      };
    });
}

function pdfBody(cv, t, L, key) {
  const ul = (items) => (items.length ? [{ ul: items, margin: [10, 2, 0, 2], markerColor: t.id === 'awesome' || t.id === 'modern' ? L.accent : INK }] : []);
  switch (key) {
    case 'summary':
      return [{ text: cv.summary, margin: [0, 2, 0, 0] }];
    case 'experience':
      return cv.experience.flatMap((e) => [...pdfRows(t, L, expRows(t, e)), ...ul(e.bullets)]);
    case 'education':
      return cv.education.flatMap((e) => [...pdfRows(t, L, eduRows(t, e)), ...(e.details ? [{ text: e.details, color: MUTED }] : [])]);
    case 'projects':
      return cv.projects.flatMap((p) => [...pdfRows(t, L, [[p.name, p.link]]), ...(p.description ? [{ text: p.description }] : [])]);
    case 'skills':
      return cv.skills.map((s) => ({ text: [s.label ? { text: `${s.label}: `, bold: true } : '', s.items.join(', ')], margin: [0, 1, 0, 1] }));
    case 'certifications':
      return [{ text: cv.certifications.join('  ·  ') }];
    case 'languages':
      return [{ text: cv.languages.join('  ·  ') }];
    default:
      return [];
  }
}

function pdfName(cv, t, L) {
  if (t.id === 'awesome') {
    const [first, last] = splitName(cv.name);
    return { text: [{ text: first ? `${first} ` : '', font: 'SourceSansLight', color: '#555555' }, { text: last, bold: true }], fontSize: L.nameSize, alignment: 'center' };
  }
  if (t.id === 'minimal') return { text: cv.name, font: 'SourceSansLight', fontSize: L.nameSize, color: INK };
  if (t.id === 'jakes') return { text: cv.name, fontSize: L.nameSize, alignment: 'center' };
  return { text: cv.name, bold: true, fontSize: L.nameSize, color: t.id === 'moderncv' ? '#333333' : t.id === 'modern' ? L.accent : '#111111', alignment: L.center ? 'center' : 'left' };
}

export function cvPDFDefinition(cv, templateId = 'harvard', pickedAccent) {
  const t = getTemplate(templateId);
  const L = pdfLook(t, accentFor(t, pickedAccent));
  const defaults = { font: L.font, fontSize: L.base, lineHeight: 1.22, color: INK };
  const info = { title: `${cv.name} CV`, author: cv.name };

  if (t.layout === 'sidebar') return sidebarPDF(cv, t, L, defaults, info);

  const margins = t.id === 'jakes' ? [40, 34, 40, 34] : [48, 42, 48, 42];
  const width = A4_W - margins[0] - margins[2];
  const content = [];

  if (t.layout === 'europass' || t.layout === 'datecol') return gridPDF(cv, t, L, defaults, info, margins, width);

  content.push(pdfName(cv, t, L));
  if (cv.headline) {
    content.push({
      text: t.id === 'awesome' ? cv.headline.toUpperCase() : cv.headline,
      color: t.id === 'awesome' ? L.accent : '#374151',
      fontSize: t.id === 'awesome' ? L.base - 1 : L.base + 1,
      characterSpacing: t.id === 'awesome' ? 1 : 0,
      alignment: L.center ? 'center' : 'left',
      margin: [0, 2, 0, 0],
    });
  }
  content.push({ text: contactParts(cv).join(t.sep), color: t.id === 'harvard' || t.id === 'jakes' ? INK : MUTED, fontSize: L.base - 0.5, alignment: L.center ? 'center' : 'left', margin: [0, 4, 0, 2] });

  for (const key of sectionsFor(cv, t)) content.push(...pdfHeading(t, L, SECTION_TITLES[key], width), ...pdfBody(cv, t, L, key));

  return { pageSize: 'A4', pageMargins: margins, info, content, defaultStyle: defaults };
}

// ModernCV and Europass: a narrow left column (dates or labels) beside the content.
function gridPDF(cv, t, L, defaults, info, margins, width) {
  const LEFT = t.layout === 'europass' ? 118 : 96;
  const GAP = 14;
  const row = (left, stack, extra = {}) => ({ columns: [{ width: LEFT, ...left }, { width: '*', stack }], columnGap: GAP, ...extra });
  const label = (text) => ({ text: text.toUpperCase(), color: L.accent, fontSize: L.base - 1, bold: true, alignment: 'right', characterSpacing: 0.5, margin: [0, 1, 0, 0] });
  const content = [];

  if (t.layout === 'europass') {
    const c = cv.contact;
    content.push(row(label('Personal'), [{ text: cv.name, bold: true, fontSize: L.nameSize }, ...(cv.headline ? [{ text: cv.headline, color: '#374151', fontSize: L.base + 1 }] : [])], { margin: [0, 0, 0, 6] }));
    for (const [k, v] of [['Email', c.email], ['Phone', c.phone], ['Location', c.location], ['Links', c.links.join(', ')]].filter(([, v]) => v)) {
      content.push(row({ text: k, color: MUTED, alignment: 'right', fontSize: L.base - 1 }, [{ text: v }], { margin: [0, 1, 0, 0] }));
    }
  } else {
    content.push({ text: cv.name, fontSize: L.nameSize, color: '#333333' });
    if (cv.headline) content.push({ text: cv.headline, italics: true, color: MUTED, fontSize: L.base + 2, margin: [0, 1, 0, 0] });
    content.push({ text: contactParts(cv).join('   ·   '), color: MUTED, fontSize: L.base - 0.5, margin: [0, 6, 0, 0] });
  }

  for (const key of sectionsFor(cv, t)) {
    const title = SECTION_TITLES[key];
    if (t.layout === 'europass') {
      content.push({ canvas: [{ type: 'line', x1: LEFT + GAP, y1: 0, x2: width, y2: 0, lineWidth: 0.6, lineColor: L.accent }], margin: [0, 12, 0, 4] });
    } else {
      content.push(row({ canvas: [{ type: 'rect', x: 0, y: 4, w: LEFT, h: 6, color: L.accent }] }, [{ text: title, fontSize: L.base + 4, color: L.accent }], { margin: [0, 12, 0, 4] }));
    }
    const lead = t.layout === 'europass' ? label(title) : { text: '' };
    const items = [];

    if (key === 'experience' || key === 'education') {
      const list = key === 'experience' ? cv.experience : cv.education;
      list.forEach((e, i) => {
        const lines =
          key === 'experience'
            ? [{ text: e.title, bold: true }, { text: [e.company, e.location].filter(Boolean).join(', '), italics: true, color: '#374151' }, ...(e.bullets.length ? [{ ul: e.bullets, margin: [8, 2, 0, 0] }] : [])]
            : [{ text: e.degree, bold: true }, { text: [e.school, e.location].filter(Boolean).join(', '), italics: true, color: '#374151' }, ...(e.details ? [{ text: e.details, color: MUTED }] : [])];
        const when = { text: dates(e), color: t.layout === 'europass' ? L.accent : MUTED, fontSize: L.base - 1, alignment: 'right' };
        if (t.layout === 'europass') {
          items.push(row(i === 0 ? lead : { text: '' }, [{ text: dates(e), color: L.accent, fontSize: L.base - 1 }, ...lines], { margin: [0, i ? 6 : 0, 0, 0] }));
        } else {
          items.push(row(when, lines, { margin: [0, i ? 6 : 0, 0, 0] }));
        }
      });
    } else {
      const body = pdfBody(cv, t, L, key);
      items.push(row(t.layout === 'europass' ? lead : { text: '' }, body));
    }
    content.push(...items);
  }
  return { pageSize: 'A4', pageMargins: margins, info, content, defaultStyle: defaults };
}

function sidebarPDF(cv, t, L, defaults, info) {
  const LEFT_MARGIN = 26;
  const SIDE_W = 150;
  const GAP = 28;
  const c = cv.contact;
  const sideHead = (s) => ({ text: s.toUpperCase(), bold: true, color: '#ffffff', fontSize: L.base - 0.5, characterSpacing: 1, margin: [0, 14, 0, 4] });
  const sideText = (s, extra = {}) => ({ text: s, color: '#e5e7eb', fontSize: L.base - 1, margin: [0, 1, 0, 1], ...extra });
  const side = [
    sideHead('Contact'),
    ...[c.email, c.phone, c.location, ...c.links].filter(Boolean).map((x) => sideText(x)),
    ...(cv.skills.length ? [sideHead('Skills'), ...cv.skills.flatMap((s) => [...(s.label ? [sideText(s.label, { bold: true, color: '#ffffff' })] : []), sideText(s.items.join(', '))])] : []),
    ...(cv.education.length ? [sideHead('Education'), ...cv.education.flatMap((e) => [sideText(e.degree, { bold: true, color: '#ffffff' }), sideText([e.school, dates(e)].filter(Boolean).join(', '))])] : []),
    ...(cv.languages.length ? [sideHead('Languages'), ...cv.languages.map((l) => sideText(l))] : []),
    ...(cv.certifications.length ? [sideHead('Certifications'), ...cv.certifications.map((l) => sideText(l))] : []),
  ];
  const mainWidth = A4_W - LEFT_MARGIN - SIDE_W - GAP - 36;
  const main = [
    { text: cv.name, bold: true, fontSize: L.nameSize, color: '#111111' },
    ...(cv.headline ? [{ text: cv.headline, color: L.accent, fontSize: L.base + 1.5, margin: [0, 2, 0, 0] }] : []),
    ...sectionsFor(cv, t).flatMap((key) => [...pdfHeading(t, L, SECTION_TITLES[key], mainWidth), ...pdfBody(cv, t, L, key)]),
  ];
  return {
    pageSize: 'A4',
    pageMargins: [LEFT_MARGIN, 36, 36, 36],
    info,
    background: (_page, size) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: LEFT_MARGIN + SIDE_W + GAP / 2, h: size.height, color: L.accent }] }),
    content: [{ columns: [{ width: SIDE_W, stack: side }, { width: '*', stack: main }], columnGap: GAP }],
    defaultStyle: defaults,
  };
}

/** Cover letter PDF in the same font and header style as the chosen CV template. */
export function letterPDFDefinition(cv, letterText, templateId = 'harvard', pickedAccent) {
  const t = getTemplate(templateId);
  const L = pdfLook(t, accentFor(t, pickedAccent));
  const paragraphs = letterText
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .split(/\n{2,}/)
    .map((p) => ({ text: p.replace(/\n/g, ' ').trim(), margin: [0, 0, 0, 9] }))
    .filter((p) => p.text);
  const align = L.center ? 'center' : 'left';
  return {
    pageSize: 'A4',
    pageMargins: [64, 56, 64, 56],
    info: { title: `${cv.name} cover letter`, author: cv.name },
    content: [
      { ...pdfName(cv, t, L), fontSize: Math.min(L.nameSize, 22), alignment: align, ...(t.id === 'sidebar' ? { color: L.accent } : {}) },
      { text: contactParts(cv).join(t.sep === '\n' ? '  ·  ' : t.sep), color: MUTED, fontSize: L.base - 0.5, alignment: align, margin: [0, 4, 0, 6] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: A4_W - 128, y2: 0, lineWidth: 0.6, lineColor: t.accents ? L.accent : '#9ca3af' }], margin: [0, 0, 0, 22] },
      ...paragraphs,
    ],
    defaultStyle: { font: L.font, fontSize: L.base + 0.5, lineHeight: 1.35, color: INK },
  };
}
