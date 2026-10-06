// Structured CV documents: one JSON shape, rendered three ways.
//   renderCV(data, template)   -> DOM preview (paper-style page)
//   cvToMarkdown(data)         -> plain text for copying / pasting into forms
//   cvToPDF(data, template)    -> real-text PDF (ATS-readable), via pdfmake
//
// CV data shape (all fields optional):
// {
//   name, headline,
//   contact: { email, phone, location, links: [string] },
//   summary,
//   skills: [{ label, items: [string] }],
//   experience: [{ title, company, location, start, end, bullets: [string] }],
//   education: [{ degree, school, location, start, end, details }],
//   projects: [{ name, description, link }],
//   certifications: [string],
//   languages: [string],
//   changes: [string],   // what was tailored for this job (shown in the app, not on the CV)
//   keywords: [string],  // job keywords the CV now covers (shown in the app)
// }

import { h } from './ui.js';
import { loadScript } from './files.js';

export const TEMPLATES = [
  { id: 'modern', label: 'Modern', accent: '#3b3ad6' },
  { id: 'classic', label: 'Classic', accent: '#1f2937' },
  { id: 'compact', label: 'Compact', accent: '#0f766e' },
];

const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const str = (v) => (v == null ? '' : String(v).trim());
const dates = (e) => [str(e.start), str(e.end)].filter(Boolean).join(' – ');

/** Make sure model output has the expected shape before rendering. */
export function normalizeCV(raw = {}) {
  const c = raw.contact || {};
  return {
    name: str(raw.name),
    headline: str(raw.headline),
    contact: {
      email: str(c.email),
      phone: str(c.phone),
      location: str(c.location),
      links: arr(c.links).map(str).filter(Boolean),
    },
    summary: str(raw.summary),
    skills: arr(raw.skills)
      .map((s) => (typeof s === 'string' ? { label: '', items: [s] } : { label: str(s.label), items: arr(s.items).map(str).filter(Boolean) }))
      .filter((s) => s.items.length),
    experience: arr(raw.experience).map((e) => ({
      title: str(e.title),
      company: str(e.company),
      location: str(e.location),
      start: str(e.start),
      end: str(e.end),
      bullets: arr(e.bullets).map(str).filter(Boolean),
    })),
    education: arr(raw.education).map((e) => ({
      degree: str(e.degree),
      school: str(e.school),
      location: str(e.location),
      start: str(e.start),
      end: str(e.end),
      details: str(e.details),
    })),
    projects: arr(raw.projects).map((p) => ({ name: str(p.name), description: str(p.description), link: str(p.link) })),
    certifications: arr(raw.certifications).map(str).filter(Boolean),
    languages: arr(raw.languages).map(str).filter(Boolean),
    changes: arr(raw.changes).map(str).filter(Boolean),
    keywords: arr(raw.keywords).map(str).filter(Boolean),
  };
}

function contactParts(cv) {
  const c = cv.contact;
  return [c.location, c.email, c.phone, ...c.links].filter(Boolean);
}

// ---------------------------------------------------------------------------
// On-screen preview
// ---------------------------------------------------------------------------

export function renderCV(cv, template = 'modern') {
  const section = (title, ...body) => h('section', { class: 'cv-section' }, h('h3', {}, title), ...body);
  const parts = [];

  parts.push(
    h(
      'header',
      { class: 'cv-head' },
      h('h2', {}, cv.name || 'Your name'),
      cv.headline && h('p', { class: 'cv-headline' }, cv.headline),
      h('p', { class: 'cv-contact' }, contactParts(cv).join('  ·  ')),
    ),
  );
  if (cv.summary) parts.push(section('Profile', h('p', {}, cv.summary)));
  if (cv.skills.length) {
    parts.push(
      section(
        'Skills',
        h(
          'div',
          { class: 'cv-skills' },
          ...cv.skills.map((s) => h('p', {}, s.label && h('strong', {}, `${s.label}: `), s.items.join(', '))),
        ),
      ),
    );
  }
  if (cv.experience.length) {
    parts.push(
      section(
        'Experience',
        ...cv.experience.map((e) =>
          h(
            'div',
            { class: 'cv-item' },
            h(
              'div',
              { class: 'cv-item-head' },
              h('p', {}, h('strong', {}, e.title), e.company && ` · ${e.company}`, e.location && h('span', { class: 'cv-muted' }, ` · ${e.location}`)),
              h('span', { class: 'cv-dates' }, dates(e)),
            ),
            e.bullets.length ? h('ul', {}, ...e.bullets.map((b) => h('li', {}, b))) : '',
          ),
        ),
      ),
    );
  }
  if (cv.projects.length) {
    parts.push(
      section(
        'Projects',
        ...cv.projects.map((p) => h('div', { class: 'cv-item' }, h('p', {}, h('strong', {}, p.name), p.link && h('span', { class: 'cv-muted' }, ` · ${p.link}`)), p.description && h('p', {}, p.description))),
      ),
    );
  }
  if (cv.education.length) {
    parts.push(
      section(
        'Education',
        ...cv.education.map((e) =>
          h(
            'div',
            { class: 'cv-item' },
            h('div', { class: 'cv-item-head' }, h('p', {}, h('strong', {}, e.degree), e.school && ` · ${e.school}`), h('span', { class: 'cv-dates' }, dates(e))),
            e.details && h('p', { class: 'cv-muted' }, e.details),
          ),
        ),
      ),
    );
  }
  const extras = [
    cv.certifications.length && ['Certifications', cv.certifications.join(' · ')],
    cv.languages.length && ['Languages', cv.languages.join(' · ')],
  ].filter(Boolean);
  if (extras.length) parts.push(section('More', ...extras.map(([k, v]) => h('p', {}, h('strong', {}, `${k}: `), v))));

  return h('article', { class: `cv-page t-${template}` }, ...parts);
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function cvToMarkdown(cv) {
  const out = [`# ${cv.name}`];
  if (cv.headline) out.push(cv.headline);
  out.push(contactParts(cv).join(' · '), '');
  if (cv.summary) out.push('## Profile', cv.summary, '');
  if (cv.skills.length) out.push('## Skills', ...cv.skills.map((s) => `- ${s.label ? `**${s.label}:** ` : ''}${s.items.join(', ')}`), '');
  if (cv.experience.length) {
    out.push('## Experience');
    for (const e of cv.experience) {
      out.push(`### ${[e.title, e.company].filter(Boolean).join(' · ')}${dates(e) ? ` (${dates(e)})` : ''}`);
      if (e.location) out.push(e.location);
      out.push(...e.bullets.map((b) => `- ${b}`), '');
    }
  }
  if (cv.projects.length) out.push('## Projects', ...cv.projects.map((p) => `- **${p.name}**${p.description ? `: ${p.description}` : ''}${p.link ? ` (${p.link})` : ''}`), '');
  if (cv.education.length) {
    out.push('## Education', ...cv.education.map((e) => `- **${e.degree}**${e.school ? `, ${e.school}` : ''}${dates(e) ? ` (${dates(e)})` : ''}${e.details ? ` · ${e.details}` : ''}`), '');
  }
  if (cv.certifications.length) out.push('## Certifications', ...cv.certifications.map((c) => `- ${c}`), '');
  if (cv.languages.length) out.push('## Languages', cv.languages.join(' · '), '');
  return out.join('\n').trim();
}

// ---------------------------------------------------------------------------
// PDF (pdfmake)
// ---------------------------------------------------------------------------

const PDFMAKE = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/pdfmake.min.js';
const PDFFONTS = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/vfs_fonts.js';

async function pdfMake() {
  await loadScript(PDFMAKE);
  await loadScript(PDFFONTS);
  return window.pdfMake;
}

function pdfStyles(template) {
  const t = TEMPLATES.find((x) => x.id === template) || TEMPLATES[0];
  const compact = template === 'compact';
  const base = compact ? 9 : 10;
  return {
    accent: t.accent,
    compact,
    centered: template === 'classic',
    styles: {
      name: { fontSize: compact ? 18 : 22, bold: true, color: template === 'modern' ? t.accent : '#111827' },
      headline: { fontSize: base + 1.5, color: '#374151', margin: [0, 2, 0, 0] },
      contact: { fontSize: base - 0.5, color: '#4b5563', margin: [0, 4, 0, 0] },
      h: {
        fontSize: base + 1,
        bold: true,
        color: template === 'classic' ? '#111827' : t.accent,
        characterSpacing: template === 'classic' ? 1 : 0.3,
        margin: [0, compact ? 8 : 12, 0, 3],
      },
      body: { fontSize: base, lineHeight: 1.25, color: '#1f2937' },
      muted: { fontSize: base - 0.5, color: '#6b7280' },
    },
  };
}

export function cvPDFDefinition(cv, template = 'modern') {
  const s = pdfStyles(template);
  const width = 595.28 - 2 * 48;
  const rule = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.6, lineColor: template === 'classic' ? '#9ca3af' : s.accent }], margin: [0, 0, 0, 4] };
  const heading = (t) => [{ text: template === 'classic' ? t.toUpperCase() : t, style: 'h' }, rule];
  const content = [];
  const align = s.centered ? 'center' : 'left';

  content.push({ text: cv.name || '', style: 'name', alignment: align });
  if (cv.headline) content.push({ text: cv.headline, style: 'headline', alignment: align });
  content.push({ text: contactParts(cv).join('   ·   '), style: 'contact', alignment: align });

  if (cv.summary) content.push(...heading('Profile'), { text: cv.summary, style: 'body' });
  if (cv.skills.length) {
    content.push(
      ...heading('Skills'),
      ...cv.skills.map((k) => ({ text: [k.label ? { text: `${k.label}: `, bold: true } : '', k.items.join(', ')], style: 'body', margin: [0, 0, 0, 2] })),
    );
  }
  if (cv.experience.length) {
    content.push(...heading('Experience'));
    for (const e of cv.experience) {
      content.push({
        columns: [
          { text: [{ text: e.title, bold: true }, e.company ? ` · ${e.company}` : '', e.location ? { text: ` · ${e.location}`, color: '#6b7280' } : ''], style: 'body', width: '*' },
          { text: dates(e), style: 'muted', width: 'auto', alignment: 'right' },
        ],
        columnGap: 8,
        margin: [0, s.compact ? 3 : 6, 0, 2],
      });
      if (e.bullets.length) content.push({ ul: e.bullets, style: 'body', margin: [8, 0, 0, 0] });
    }
  }
  if (cv.projects.length) {
    content.push(...heading('Projects'));
    for (const p of cv.projects) {
      content.push({ text: [{ text: p.name, bold: true }, p.link ? { text: ` · ${p.link}`, color: '#6b7280' } : '', p.description ? `\n${p.description}` : ''], style: 'body', margin: [0, 2, 0, 2] });
    }
  }
  if (cv.education.length) {
    content.push(...heading('Education'));
    for (const e of cv.education) {
      content.push({
        columns: [
          { text: [{ text: e.degree, bold: true }, e.school ? ` · ${e.school}` : '', e.details ? { text: `\n${e.details}`, color: '#6b7280' } : ''], style: 'body', width: '*' },
          { text: dates(e), style: 'muted', width: 'auto', alignment: 'right' },
        ],
        columnGap: 8,
        margin: [0, 2, 0, 2],
      });
    }
  }
  if (cv.certifications.length) content.push(...heading('Certifications'), { text: cv.certifications.join('  ·  '), style: 'body' });
  if (cv.languages.length) content.push(...heading('Languages'), { text: cv.languages.join('  ·  '), style: 'body' });

  return {
    pageSize: 'A4',
    pageMargins: [48, 44, 48, 44],
    info: { title: `${cv.name} – CV`, author: cv.name },
    content,
    styles: s.styles,
    defaultStyle: { font: 'Roboto' },
  };
}

export function letterPDFDefinition(cv, letterText, template = 'modern') {
  const s = pdfStyles(template);
  const paragraphs = letterText
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .split(/\n{2,}/)
    .map((p) => ({ text: p.replace(/\n/g, ' ').trim(), style: 'body', margin: [0, 0, 0, 9] }))
    .filter((p) => p.text);
  return {
    pageSize: 'A4',
    pageMargins: [60, 54, 60, 54],
    info: { title: `${cv.name} – Cover letter`, author: cv.name },
    content: [
      { text: cv.name || '', style: 'name', alignment: s.centered ? 'center' : 'left' },
      { text: contactParts(cv).join('   ·   '), style: 'contact', alignment: s.centered ? 'center' : 'left', margin: [0, 4, 0, 26] },
      ...paragraphs,
    ],
    styles: { ...s.styles, body: { ...s.styles.body, fontSize: 10.5, lineHeight: 1.35 } },
    defaultStyle: { font: 'Roboto' },
  };
}

/** Build a PDF Blob from a pdfmake definition. */
export async function makePDF(definition) {
  const pm = await pdfMake();
  return new Promise((resolve, reject) => {
    try {
      pm.createPdf(definition).getBlob(resolve);
    } catch (err) {
      reject(err);
    }
  });
}

/** Minimal CV header details from the profile, for letters when no tailored CV exists yet. */
export function cvFromProfile(p) {
  return normalizeCV({ name: p.name, headline: p.headline, contact: { email: p.email, phone: p.phone, location: p.location } });
}
