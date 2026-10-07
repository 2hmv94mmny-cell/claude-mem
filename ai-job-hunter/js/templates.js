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
import { writtenIn } from './match.js';

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

// Fonts the user can pick for a CV or letter. On screen they come from Google
// Fonts; in the PDF the same fonts are embedded (js/cv-fonts.js for the two
// built in, js/fonts/<id>.js for the rest, loaded only when picked).
export const FONT_CHOICES = [
  { id: '', name: 'Template font', note: 'As the template was designed' },
  { id: 'Carlito', name: 'Calibri style', note: 'Carlito', css: "'Carlito', 'Calibri', sans-serif", kind: 'Sans' },
  { id: 'Arimo', name: 'Arial style', note: 'Arimo', css: "'Arimo', 'Arial', sans-serif", kind: 'Sans' },
  { id: 'Inter', name: 'Inter', note: 'Modern, very clear', css: "'Inter', sans-serif", kind: 'Sans' },
  { id: 'Roboto', name: 'Roboto', note: 'Clean and neutral', css: "'Roboto', sans-serif", kind: 'Sans' },
  { id: 'Lato', name: 'Lato', note: 'Friendly and warm', css: "'Lato', sans-serif", kind: 'Sans' },
  { id: 'Montserrat', name: 'Montserrat', note: 'Bold and contemporary', css: "'Montserrat', sans-serif", kind: 'Sans' },
  { id: 'SourceSans', name: 'Source Sans', note: 'Compact and readable', css: "'Source Sans 3', sans-serif", kind: 'Sans', builtin: true },
  { id: 'Tinos', name: 'Times style', note: 'Tinos', css: "'Tinos', 'Times New Roman', serif", kind: 'Serif', builtin: true },
  { id: 'EBGaramond', name: 'Garamond', note: 'EB Garamond, elegant', css: "'EB Garamond', 'Garamond', serif", kind: 'Serif' },
  { id: 'Lora', name: 'Lora', note: 'Classic and soft', css: "'Lora', serif", kind: 'Serif' },
];
export const fontChoice = (id) => FONT_CHOICES.find((f) => f.id === id) || FONT_CHOICES[0];

/** Put the picked font on a page (screen). */
function applyFont(page, fontId) {
  const f = fontChoice(fontId);
  if (!f.id) return;
  page.classList.add('custom-font');
  page.style.setProperty('--cv-font', f.css);
}

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
  return EDIT ? order : order.filter((k) => has[k]);
}

// ---------------------------------------------------------------------------
// Editing on the page ("like a Word page")
//
// With { editable: true } the same preview is drawn, but every piece of text
// is its own contenteditable field carrying the data path it came from
// (data-path="experience.0.bullets.2"). The app listens for input on the page
// and writes the text straight back into the structured CV, so the PDF, which
// is built from that data, always matches what was typed.
// ---------------------------------------------------------------------------

let EDIT = false;

/** A text field: the plain value normally, an editable span while editing. */
function F(path, value, { tag = 'span', cls = '', ph = '', list = '', multi = false } = {}) {
  if (!EDIT) return value || '';
  return h(
    tag,
    {
      class: `ed ${cls}`.trim(),
      contenteditable: 'plaintext-only',
      spellcheck: 'true',
      'data-path': path,
      'data-ph': ph || 'Type here',
      'data-list': list || null,
      'data-multi': multi ? '1' : null,
    },
    value || '',
  );
}
/** A block element holding one field (skipped when empty, unless editing). */
function P(tag, cls, path, value, ph, opts = {}) {
  if (EDIT) return F(path, value, { tag, cls, ph, ...opts });
  return value ? h(tag, { class: cls }, value) : '';
}
/** Fields joined by a separator; empty ones are dropped, but kept while editing so they can be filled. */
function J(fields, sep) {
  if (!EDIT) return fields.map(([, v]) => v).filter(Boolean).join(sep);
  const out = [];
  fields.forEach(([path, v, ph, opts], i) => {
    if (i) out.push(h('span', { class: 'ed-sep' }, sep));
    out.push(F(path, v, { ph, ...(opts || {}) }));
  });
  return out;
}
/** Start – end, each editable. */
function D(base, e) {
  if (!EDIT) return dates(e);
  return [F(`${base}.start`, e.start, { ph: 'Start' }), ' – ', F(`${base}.end`, e.end, { ph: 'End' })];
}
/** Small editing controls that never reach the PDF. */
function ctl(action, path, label, cls = '') {
  if (!EDIT) return '';
  return h('button', { type: 'button', class: `ed-ctl ${cls}`.trim(), contenteditable: 'false', 'data-action': action, 'data-path': path, 'aria-label': label, title: label }, action === 'remove' ? '×' : `+ ${label}`);
}

export const SECTION_NAMES = { ...SECTION_TITLES, contact: 'Contact' };
/** A section title: the user's own wording if they changed it on the page. */
export const sectionTitle = (cv, key) => cv.titles?.[key] || SECTION_NAMES[key];

const ADD_LABEL = { experience: 'Add job', education: 'Add education', projects: 'Add project', skills: 'Add skill group' };

// How the two lines of an experience entry are arranged, per template:
// [[line1 left, line1 right], [line2 left, line2 right]]
function expRows(t, e, i = 0) {
  const b = `experience.${i}`;
  if (EDIT) {
    const title = [`${b}.title`, e.title, 'Job title'];
    const company = [`${b}.company`, e.company, 'Company'];
    const place = [`${b}.location`, e.location, 'Location'];
    switch (t.id) {
      case 'harvard':
      case 'awesome':
        return [[F(...company.slice(0, 2), { ph: 'Company' }), F(place[0], place[1], { ph: 'Location' })], [F(title[0], title[1], { ph: 'Job title' }), D(b, e)]];
      case 'jakes':
        return [[F(title[0], title[1], { ph: 'Job title' }), D(b, e)], [F(company[0], company[1], { ph: 'Company' }), F(place[0], place[1], { ph: 'Location' })]];
      default:
        return [[F(title[0], title[1], { ph: 'Job title' }), D(b, e)], [J([company, place], ', '), '']];
    }
  }
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

function eduRows(t, e, i = 0) {
  const b = `education.${i}`;
  if (EDIT) {
    const school = F(`${b}.school`, e.school, { ph: 'School' });
    const degree = F(`${b}.degree`, e.degree, { ph: 'Degree' });
    const place = F(`${b}.location`, e.location, { ph: 'Location' });
    if (t.id === 'harvard' || t.id === 'awesome' || t.id === 'jakes') return [[school, place], [degree, D(b, e)]];
    return [[degree, D(b, e)], [J([[`${b}.school`, e.school, 'School'], [`${b}.location`, e.location, 'Location']], ', '), '']];
  }
  switch (t.id) {
    case 'harvard':
    case 'awesome':
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

/**
 * The CV on an A4 page in a template.
 * @param {object} [opts] { editable } draw every text as an editable field
 */
export function renderCV(cv, templateId = 'harvard', pickedAccent, { editable = false, font = '' } = {}) {
  const t = getTemplate(templateId);
  const accent = accentFor(t, pickedAccent);
  const page = h('article', { class: `cv-page tpl-${t.id} lay-${t.layout}${editable ? ' editing' : ''}`, style: `--cv-accent:${accent}` });
  applyFont(page, font);
  EDIT = editable;
  try {
    if (t.layout === 'sidebar') {
      page.append(sidebarPreview(cv, t));
      return page;
    }
    page.append(headerPreview(cv, t));
    for (const key of sectionsFor(cv, t)) page.append(sectionPreview(cv, t, key));
    return page;
  } finally {
    EDIT = false;
  }
}

function sectionPreview(cv, t, key) {
  const title = sectionTitle(cv, key);
  const body = [...bodyPreview(cv, t, key), ADD_LABEL[key] ? ctl('add', key, ADD_LABEL[key], 'ed-add') : ''];
  if (t.layout === 'single') return h('section', { class: 'cv-section' }, headingPreview(t, title, key), ...body);
  return h(
    'section',
    { class: 'cv-section cv-grid' },
    h('div', { class: 'cv-label' }, t.layout === 'datecol' ? h('span', { class: 'cv-bar' }) : F(`titles.${key}`, title)),
    h('div', {}, t.layout === 'datecol' ? headingPreview(t, title, key) : '', ...body),
  );
}

function nameNode(cv, t) {
  if (EDIT) return h('h2', {}, F('name', cv.name, { ph: 'Your name' }));
  const [first, last] = splitName(cv.name);
  return t.id === 'awesome' ? h('h2', {}, h('span', { class: 'light' }, first ? `${first} ` : ''), last) : h('h2', {}, cv.name || 'Your name');
}

const contactFields = (cv) => [
  ['contact.location', cv.contact.location, 'Location'],
  ['contact.email', cv.contact.email, 'Email'],
  ['contact.phone', cv.contact.phone, 'Phone'],
  ['contact.links', cv.contact.links.join(', '), 'Links', { list: ',' }],
];

function headerPreview(cv, t) {
  const name = nameNode(cv, t);
  const headline = P('p', 'cv-headline', 'headline', cv.headline, 'Headline');
  if (t.layout === 'europass') {
    const c = cv.contact;
    const rows = [
      ['Email', 'contact.email', c.email],
      ['Phone', 'contact.phone', c.phone],
      ['Location', 'contact.location', c.location],
      ['Links', 'contact.links', c.links.join(', ')],
    ].filter(([, , v]) => v || EDIT);
    return h(
      'header',
      { class: 'cv-head' },
      h('div', { class: 'cv-grid' }, h('div', { class: 'cv-label' }, 'Personal'), h('div', {}, name, headline)),
      ...rows.map(([k, path, v]) => h('div', { class: 'cv-grid cv-contact-row' }, h('div', { class: 'cv-label sub' }, k), h('div', {}, F(path, v, { ph: k, list: path === 'contact.links' ? ',' : '' })))),
    );
  }
  return h('header', { class: 'cv-head' }, name, headline, h('p', { class: 'cv-contact' }, J(contactFields(cv), t.sep)));
}

function headingPreview(t, title, key) {
  if (EDIT) return h('h3', {}, F(`titles.${key}`, title));
  if (t.id === 'awesome') return h('h3', {}, h('span', { class: 'acc' }, title.slice(0, 3)), title.slice(3));
  return h('h3', {}, title);
}

function rowsPreview(rows) {
  return rows
    .filter(([l, r]) => l || r)
    .map(([l, r], i) => h('div', { class: `cv-row r${i + 1}` }, h('span', { class: 'l' }, l || ''), r ? h('span', { class: 'r' }, r) : ''));
}

function bulletsPreview(base, bullets) {
  const items = bullets.filter((b) => EDIT || b);
  if (!items.length && !EDIT) return '';
  const list = (EDIT && !bullets.length ? [''] : bullets).map((b, j) => (EDIT ? F(`${base}.bullets.${j}`, b, { tag: 'li', ph: 'What you did and what came of it' }) : b ? h('li', {}, b) : ''));
  return h('ul', {}, ...list);
}

function bodyPreview(cv, t, key) {
  const dateCol = t.layout === 'datecol' || t.layout === 'europass';
  const entry = (rows, bullets, when, removeCtl) =>
    dateCol
      ? h('div', { class: 'cv-item cv-grid' }, h('div', { class: 'cv-label date' }, when), h('div', {}, ...rowsPreview(rows.map(([l]) => [l, ''])), bullets), removeCtl)
      : h('div', { class: 'cv-item' }, ...rowsPreview(rows), bullets, removeCtl);

  switch (key) {
    case 'summary':
      return [P('p', '', 'summary', cv.summary, 'A few lines about you', { multi: true })];
    case 'experience':
      return cv.experience.map((e, i) => {
        const b = `experience.${i}`;
        const rows = dateCol ? [[F(`${b}.title`, e.title, { ph: 'Job title' })], [J([[`${b}.company`, e.company, 'Company'], [`${b}.location`, e.location, 'Location']], ', ')]] : expRows(t, e, i);
        return entry(rows, bulletsPreview(b, e.bullets), D(b, e), ctl('remove', b, 'Remove this job'));
      });
    case 'education':
      return cv.education.map((e, i) => {
        const b = `education.${i}`;
        const details = P('p', 'cv-muted', `${b}.details`, e.details, 'Details (optional)');
        if (dateCol) return entry([[F(`${b}.degree`, e.degree, { ph: 'Degree' })], [J([[`${b}.school`, e.school, 'School'], [`${b}.location`, e.location, 'Location']], ', ')], [details]], '', D(b, e), ctl('remove', b, 'Remove this entry'));
        return h('div', { class: 'cv-item' }, ...rowsPreview(eduRows(t, e, i)), details, ctl('remove', b, 'Remove this entry'));
      });
    case 'projects':
      return cv.projects.map((pr, i) => {
        const b = `projects.${i}`;
        const link = EDIT ? F(`${b}.link`, pr.link, { ph: 'Link (optional)' }) : pr.link;
        return h(
          'div',
          { class: 'cv-item' },
          h('div', { class: 'cv-row r1' }, h('span', { class: 'l' }, F(`${b}.name`, pr.name, { ph: 'Project name' })), link ? h('span', { class: 'r' }, link) : ''),
          P('p', '', `${b}.description`, pr.description, 'What it is and what you did', { multi: true }),
          ctl('remove', b, 'Remove this project'),
        );
      });
    case 'skills':
      return cv.skills.map((s, i) =>
        h(
          'p',
          { class: 'cv-skill' },
          EDIT ? [h('strong', {}, F(`skills.${i}.label`, s.label, { ph: 'Group' })), h('strong', {}, ': ')] : s.label && h('strong', {}, `${s.label}: `),
          F(`skills.${i}.items`, s.items.join(', '), { ph: 'Skill, skill, skill', list: ',' }),
          ctl('remove', `skills.${i}`, 'Remove this group'),
        ),
      );
    case 'certifications':
      return [P('p', '', 'certifications', cv.certifications.join(EDIT ? ' · ' : t.sep.trim() === '|' ? '  |  ' : '  ·  '), 'Certificate · Certificate', { list: '·' })];
    case 'languages':
      return [P('p', '', 'languages', cv.languages.join(EDIT ? ' · ' : '  ·  '), 'Language (level) · Language (level)', { list: '·' })];
    default:
      return [];
  }
}

function sidebarPreview(cv, t) {
  const c = cv.contact;
  const T = (key) => (EDIT ? h('h4', {}, F(`titles.${key}`, sectionTitle(cv, key))) : h('h4', {}, sectionTitle(cv, key)));
  const contact = EDIT
    ? [F('contact.email', c.email, { tag: 'p', ph: 'Email' }), F('contact.phone', c.phone, { tag: 'p', ph: 'Phone' }), F('contact.location', c.location, { tag: 'p', ph: 'Location' }), F('contact.links', c.links.join(', '), { tag: 'p', ph: 'Links', list: ',' })]
    : [c.email, c.phone, c.location, ...c.links].filter(Boolean).map((x) => h('p', {}, x));
  const side = h(
    'aside',
    { class: 'cv-side' },
    T('contact'),
    ...contact,
    ...(cv.skills.length || EDIT
      ? [
          T('skills'),
          ...cv.skills.flatMap((s, i) => [
            EDIT ? F(`skills.${i}.label`, s.label, { tag: 'p', cls: 'side-label', ph: 'Group' }) : s.label ? h('p', { class: 'side-label' }, s.label) : '',
            F(`skills.${i}.items`, s.items.join(', '), { tag: 'p', ph: 'Skill, skill', list: ',' }),
          ]),
          ctl('add', 'skills', 'Add skill group', 'ed-add'),
        ]
      : []),
    ...(cv.education.length || EDIT
      ? [
          T('education'),
          ...cv.education.flatMap((e, i) => [
            EDIT ? F(`education.${i}.degree`, e.degree, { tag: 'p', cls: 'side-label', ph: 'Degree' }) : h('p', { class: 'side-label' }, e.degree),
            EDIT ? h('p', {}, F(`education.${i}.school`, e.school, { ph: 'School' }), ', ', D(`education.${i}`, e), ctl('remove', `education.${i}`, 'Remove this entry')) : h('p', {}, [e.school, dates(e)].filter(Boolean).join(', ')),
          ]),
          ctl('add', 'education', 'Add education', 'ed-add'),
        ]
      : []),
    ...(cv.languages.length || EDIT ? [T('languages'), EDIT ? F('languages', cv.languages.join(' · '), { tag: 'p', ph: 'Language (level)', list: '·' }) : cv.languages.map((l) => h('p', {}, l))] : []),
    ...(cv.certifications.length || EDIT ? [T('certifications'), EDIT ? F('certifications', cv.certifications.join(' · '), { tag: 'p', ph: 'Certificate', list: '·' }) : cv.certifications.map((l) => h('p', {}, l))] : []),
  );
  const main = h(
    'div',
    { class: 'cv-main' },
    h('header', { class: 'cv-head' }, nameNode(cv, t), P('p', 'cv-headline', 'headline', cv.headline, 'Headline')),
    ...sectionsFor(cv, t).map((key) => h('section', { class: 'cv-section' }, EDIT ? h('h3', {}, F(`titles.${key}`, sectionTitle(cv, key))) : h('h3', {}, sectionTitle(cv, key)), ...bodyPreview(cv, t, key), ADD_LABEL[key] ? ctl('add', key, ADD_LABEL[key], 'ed-add') : '')),
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

/** Build a PDF Blob from a pdfmake definition. `font`: a picked font id (FONT_CHOICES). */
export async function makePDF(definition, { font = '' } = {}) {
  await loadScript(PDFMAKE);
  await loadScript(OWN_FONTS);
  const extra = font && !fontChoice(font).builtin && fontChoice(font).id ? font : '';
  if (extra) await loadScript(`js/fonts/${extra}.js`);
  const pm = window.pdfMake;
  // addVirtualFileSystem replaces pdfmake's font set, so register ours (and any picked font) together.
  const want = ['base', ...Object.keys(window.VORA_FONTS || {})].join(',');
  if (pm.__ajhFonts !== want) {
    pm.addVirtualFileSystem(Object.assign({}, window.AJH_PDF_FONTS, ...Object.values(window.VORA_FONTS || {})));
    pm.__ajhFonts = want;
  }
  for (const id of Object.keys(window.VORA_FONTS || {})) {
    FONTS[id] ||= { normal: `${id}-Regular.ttf`, bold: `${id}-Bold.ttf`, italics: `${id}-Italic.ttf`, bolditalics: `${id}-BoldItalic.ttf` };
  }
  return new Promise((resolve, reject) => {
    try {
      pm.createPdf(definition, null, FONTS).getBlob(resolve);
    } catch (err) {
      reject(err);
    }
  });
}

function pdfLook(t, accent, font = '') {
  const serif = t.font === 'serif';
  const base = t.id === 'jakes' ? 9.5 : serif ? 10.5 : 10;
  return {
    font: fontChoice(font).id || FAMILY[t.font],
    picked: Boolean(fontChoice(font).id),
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
  const ul = (all) => {
    const items = all.filter((x) => String(x).trim());
    return items.length ? [{ ul: items, margin: [10, 2, 0, 2], markerColor: t.id === 'awesome' || t.id === 'modern' ? L.accent : INK }] : [];
  };
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
    return { text: [{ text: first ? `${first} ` : '', font: L.picked ? L.font : 'SourceSansLight', color: '#555555' }, { text: last, bold: true }], fontSize: L.nameSize, alignment: 'center' };
  }
  if (t.id === 'minimal') return { text: cv.name, font: L.picked ? L.font : 'SourceSansLight', fontSize: L.nameSize, color: INK };
  if (t.id === 'jakes') return { text: cv.name, fontSize: L.nameSize, alignment: 'center' };
  return { text: cv.name, bold: true, fontSize: L.nameSize, color: t.id === 'moderncv' ? '#333333' : t.id === 'modern' ? L.accent : '#111111', alignment: L.center ? 'center' : 'left' };
}

export function cvPDFDefinition(cv, templateId = 'harvard', pickedAccent, { font = '' } = {}) {
  const t = getTemplate(templateId);
  const L = pdfLook(t, accentFor(t, pickedAccent), font);
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

  for (const key of sectionsFor(cv, t)) content.push(...pdfHeading(t, L, sectionTitle(cv, key), width), ...pdfBody(cv, t, L, key));

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
    const title = sectionTitle(cv, key);
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
    sideHead(sectionTitle(cv, 'contact')),
    ...[c.email, c.phone, c.location, ...c.links].filter(Boolean).map((x) => sideText(x)),
    ...(cv.skills.length ? [sideHead(sectionTitle(cv, 'skills')), ...cv.skills.flatMap((s) => [...(s.label ? [sideText(s.label, { bold: true, color: '#ffffff' })] : []), sideText(s.items.join(', '))])] : []),
    ...(cv.education.length ? [sideHead(sectionTitle(cv, 'education')), ...cv.education.flatMap((e) => [sideText(e.degree, { bold: true, color: '#ffffff' }), sideText([e.school, dates(e)].filter(Boolean).join(', '))])] : []),
    ...(cv.languages.length ? [sideHead(sectionTitle(cv, 'languages')), ...cv.languages.map((l) => sideText(l))] : []),
    ...(cv.certifications.length ? [sideHead(sectionTitle(cv, 'certifications')), ...cv.certifications.map((l) => sideText(l))] : []),
  ];
  const mainWidth = A4_W - LEFT_MARGIN - SIDE_W - GAP - 36;
  const main = [
    { text: cv.name, bold: true, fontSize: L.nameSize, color: '#111111' },
    ...(cv.headline ? [{ text: cv.headline, color: L.accent, fontSize: L.base + 1.5, margin: [0, 2, 0, 0] }] : []),
    ...sectionsFor(cv, t).flatMap((key) => [...pdfHeading(t, L, sectionTitle(cv, key), mainWidth), ...pdfBody(cv, t, L, key)]),
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

// ===========================================================================
// Cover letter: the same eight designs, laid out as a business letter
// (letterhead, place and date, recipient, subject line, text).
// ===========================================================================

const LETTER_WORDS = {
  English: { locale: 'en-GB', subject: (t) => `Application for ${t}`, on: '' },
  German: { locale: 'de-CH', subject: (t) => `Bewerbung als ${t}`, on: '' },
  French: { locale: 'fr-CH', subject: (t) => `Candidature au poste de ${t}`, on: 'le ' },
  Italian: { locale: 'it-CH', subject: (t) => `Candidatura per la posizione di ${t}`, on: '' },
};

/**
 * The pieces around the letter text, in the letter's own language.
 * @param {object} meta { title, company, location, date }
 */
export function letterParts(cv, letterText, meta = {}) {
  const text = String(letterText || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim();
  const words = LETTER_WORDS[writtenIn(text) || 'English'] || LETTER_WORDS.English;
  const place = String(cv.contact?.location || '').split(',')[0].trim();
  let date = '';
  try {
    date = new Intl.DateTimeFormat(words.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(meta.date ? new Date(meta.date) : new Date());
  } catch {}
  // Lines the user retyped on the page win over the generated ones.
  const given = (v) => typeof v === 'string';
  return {
    dateLine: given(meta.dateLine) ? meta.dateLine : [place, `${words.on}${date}`].filter((x) => x.trim()).join(', '),
    recipient: given(meta.recipient) ? meta.recipient.split('\n').map((x) => x.trim()).filter(Boolean) : [meta.company, meta.location && !/remote/i.test(meta.location) ? meta.location : ''].filter(Boolean),
    subject: given(meta.subject) ? meta.subject : meta.title ? words.subject(meta.title) : '',
    // Short multi-line blocks (the sign-off and name) keep their line breaks.
    paragraphs: text
      .split(/\n{2,}/)
      .map((x) => {
        const lines = x.split('\n').map((l) => l.trim()).filter(Boolean);
        return lines.length <= 3 && lines.every((l) => l.length < 45) ? lines.join('\n') : lines.join(' ');
      })
      .filter(Boolean),
  };
}

function letterBodyPreview(parts) {
  if (EDIT) {
    return h(
      'div',
      { class: 'letter-body' },
      F('letter.date', parts.dateLine, { tag: 'p', cls: 'letter-date', ph: 'Place, date' }),
      F('letter.to', parts.recipient.join('\n'), { tag: 'div', cls: 'letter-to', ph: 'Company\nAddress', multi: true }),
      F('letter.subject', parts.subject, { tag: 'p', cls: 'letter-subject', ph: 'Subject' }),
      F('letter.body', parts.paragraphs.join('\n\n'), { tag: 'div', cls: 'letter-text', ph: 'Your letter', multi: true }),
    );
  }
  return h(
    'div',
    { class: 'letter-body' },
    parts.dateLine ? h('p', { class: 'letter-date' }, parts.dateLine) : '',
    parts.recipient.length ? h('div', { class: 'letter-to' }, ...parts.recipient.map((x) => h('p', {}, x))) : '',
    parts.subject ? h('p', { class: 'letter-subject' }, parts.subject) : '',
    ...parts.paragraphs.map((x) => h('p', {}, x)),
  );
}

/** On-screen cover letter in a template. */
export function renderLetter(cv, letterText, templateId = 'harvard', pickedAccent, meta = {}, { editable = false, font = '' } = {}) {
  const t = getTemplate(templateId);
  const accent = accentFor(t, pickedAccent);
  const parts = letterParts(cv, letterText, meta);
  const page = h('article', { class: `cv-page letter-page tpl-${t.id} lay-${t.layout}${editable ? ' editing' : ''}`, style: `--cv-accent:${accent}` });
  applyFont(page, font);
  EDIT = editable;
  try {
    if (t.layout === 'sidebar') {
      const c = cv.contact;
      const contact = EDIT
        ? [F('contact.email', c.email, { tag: 'p', ph: 'Email' }), F('contact.phone', c.phone, { tag: 'p', ph: 'Phone' }), F('contact.location', c.location, { tag: 'p', ph: 'Location' }), F('contact.links', c.links.join(', '), { tag: 'p', ph: 'Links', list: ',' })]
        : [c.email, c.phone, c.location, ...c.links].filter(Boolean).map((x) => h('p', {}, x));
      page.append(
        h(
          'div',
          { class: 'cv-sidebar-wrap' },
          h('aside', { class: 'cv-side' }, h('h4', {}, sectionTitle(cv, 'contact')), ...contact),
          h('div', { class: 'cv-main' }, h('header', { class: 'cv-head' }, nameNode(cv, t), P('p', 'cv-headline', 'headline', cv.headline, 'Headline')), letterBodyPreview(parts)),
        ),
      );
      return page;
    }
    page.append(headerPreview(cv, t), h('div', { class: 'letter-rule' }), letterBodyPreview(parts));
    return page;
  } finally {
    EDIT = false;
  }
}

/** Cover letter PDF matching renderLetter. */
export function letterPDFDefinition(cv, letterText, templateId = 'harvard', pickedAccent, meta = {}, { font = '' } = {}) {
  const t = getTemplate(templateId);
  const L = pdfLook(t, accentFor(t, pickedAccent), font);
  const parts = letterParts(cv, letterText, meta);
  const info = { title: `${cv.name} cover letter`, author: cv.name };
  const defaults = { font: L.font, fontSize: L.base + 0.5, lineHeight: 1.35, color: INK };
  const ruleColor = t.accents ? L.accent : '#9ca3af';
  const body = [
    ...(parts.dateLine ? [{ text: parts.dateLine, alignment: 'right', margin: [0, 0, 0, 14] }] : []),
    ...parts.recipient.map((x, i) => ({ text: x, bold: i === 0, margin: [0, 0, 0, 0] })),
    ...(parts.subject ? [{ text: parts.subject, bold: true, fontSize: L.base + 1.5, color: t.accents ? L.accent : INK, margin: [0, 16, 0, 12] }] : [{ text: '', margin: [0, 10, 0, 0] }]),
    ...parts.paragraphs.map((x) => ({ text: x, margin: [0, 0, 0, 9] })),
  ];

  if (t.layout === 'sidebar') {
    const LEFT_MARGIN = 26;
    const SIDE_W = 140;
    const GAP = 28;
    const c = cv.contact;
    const side = [
      { text: sectionTitle(cv, 'contact').toUpperCase(), bold: true, color: '#ffffff', fontSize: L.base - 0.5, characterSpacing: 1, margin: [0, 14, 0, 4] },
      ...[c.email, c.phone, c.location, ...c.links].filter(Boolean).map((x) => ({ text: x, color: '#e5e7eb', fontSize: L.base - 1, margin: [0, 1, 0, 1] })),
    ];
    const mainWidth = A4_W - LEFT_MARGIN - SIDE_W - GAP - 40;
    const main = [
      { text: cv.name, bold: true, fontSize: L.nameSize, color: '#111111' },
      ...(cv.headline ? [{ text: cv.headline, color: L.accent, fontSize: L.base + 1.5, margin: [0, 2, 0, 0] }] : []),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: mainWidth, y2: 0, lineWidth: 1.2, lineColor: L.accent }], margin: [0, 10, 0, 18] },
      ...body,
    ];
    return {
      pageSize: 'A4',
      pageMargins: [LEFT_MARGIN, 40, 40, 40],
      info,
      background: (_page, size) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: LEFT_MARGIN + SIDE_W + GAP / 2, h: size.height, color: L.accent }] }),
      content: [{ columns: [{ width: SIDE_W, stack: side }, { width: '*', stack: main }], columnGap: GAP }],
      defaultStyle: defaults,
    };
  }

  const margins = [60, 50, 60, 50];
  const width = A4_W - margins[0] - margins[2];
  const head = [];
  if (t.layout === 'europass') {
    const c = cv.contact;
    const label = (x) => ({ text: x, color: L.accent, alignment: 'right', fontSize: L.base - 0.5 });
    const row = (k, v) => ({ columns: [{ width: 96, ...label(k) }, { width: '*', text: v, fontSize: L.base }], columnGap: 14, margin: [0, 1, 0, 1] });
    head.push(
      { columns: [{ width: 96, ...label('Personal') }, { width: '*', stack: [{ text: cv.name, bold: true, fontSize: L.nameSize }, ...(cv.headline ? [{ text: cv.headline, color: '#374151' }] : [])] }], columnGap: 14, margin: [0, 0, 0, 4] },
      ...[['Email', c.email], ['Phone', c.phone], ['Location', c.location], ['Links', c.links.join(', ')]].filter(([, v]) => v).map(([k, v]) => row(k, v)),
    );
  } else {
    head.push({ ...pdfName(cv, t, L), fontSize: Math.min(L.nameSize, 24) });
    if (cv.headline) head.push({ text: t.id === 'awesome' ? cv.headline.toUpperCase() : cv.headline, color: t.id === 'awesome' ? L.accent : '#374151', fontSize: t.id === 'awesome' ? L.base - 1 : L.base + 1, characterSpacing: t.id === 'awesome' ? 1 : 0, alignment: L.center ? 'center' : 'left', margin: [0, 2, 0, 0] });
    head.push({ text: contactParts(cv).join(t.sep === '\n' ? '  ·  ' : t.sep), color: t.id === 'harvard' || t.id === 'jakes' ? INK : MUTED, fontSize: L.base - 0.5, alignment: L.center ? 'center' : 'left', margin: [0, 4, 0, 0] });
  }
  head.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: t.id === 'minimal' ? 0.4 : 0.8, lineColor: ruleColor }], margin: [0, 10, 0, 22] });
  return { pageSize: 'A4', pageMargins: margins, info, content: [...head, ...body], defaultStyle: defaults };
}
