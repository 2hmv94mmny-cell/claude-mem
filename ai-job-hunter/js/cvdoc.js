// Structured CV data: one JSON shape the AI fills in, normalised here and
// turned into plain text. The visual templates (preview + PDF) live in
// templates.js.
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

const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const str = (v) => (v == null ? '' : String(v).trim());
export const dates = (e) => [str(e.start), str(e.end)].filter(Boolean).join(' – ');

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
    // Section titles the user retyped on the page (e.g. "Berufserfahrung").
    titles: Object.fromEntries(Object.entries(raw.titles && typeof raw.titles === 'object' ? raw.titles : {}).map(([k, v]) => [k, str(v)]).filter(([, v]) => v)),
  };
}

export function contactParts(cv) {
  const c = cv.contact;
  return [c.location, c.email, c.phone, ...c.links].filter(Boolean);
}

/** Plain text for pasting into application forms: no Markdown symbols, "•" bullets. */
export function cvToText(cv) {
  const out = [cv.name];
  if (cv.headline) out.push(cv.headline);
  out.push(contactParts(cv).join(' · '), '');
  const head = (t) => out.push(t.toUpperCase());
  if (cv.summary) head('Profile'), out.push(cv.summary, '');
  if (cv.skills.length) head('Skills'), out.push(...cv.skills.map((s) => `${s.label ? `${s.label}: ` : ''}${s.items.join(', ')}`), '');
  if (cv.experience.length) {
    head('Experience');
    for (const e of cv.experience) {
      out.push([e.title, e.company, e.location].filter(Boolean).join(', ') + (dates(e) ? ` (${dates(e)})` : ''));
      out.push(...e.bullets.map((b) => `• ${b}`), '');
    }
  }
  if (cv.projects.length) head('Projects'), out.push(...cv.projects.map((p) => `• ${p.name}${p.description ? `: ${p.description}` : ''}${p.link ? ` (${p.link})` : ''}`), '');
  if (cv.education.length) {
    head('Education');
    out.push(...cv.education.map((e) => `${e.degree}${e.school ? `, ${e.school}` : ''}${dates(e) ? ` (${dates(e)})` : ''}${e.details ? `. ${e.details}` : ''}`), '');
  }
  if (cv.certifications.length) head('Certifications'), out.push(...cv.certifications.map((c) => `• ${c}`), '');
  if (cv.languages.length) head('Languages'), out.push(cv.languages.join(' · '), '');
  return out.join('\n').trim();
}

/** Minimal CV header details from the profile, for letters when no tailored CV exists yet. */
export function cvFromProfile(p) {
  return normalizeCV({ name: p.name, headline: p.headline, contact: { email: p.email, phone: p.phone, location: p.location } });
}
