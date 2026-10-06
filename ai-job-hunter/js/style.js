// Keeping AI-written CVs and letters sounding like the person who sends them.
//
// Three layers:
//   HUMAN_STYLE      - writing rules added to every CV and letter prompt
//   cleanText/cleanCV - removes dash punctuation the model still slips in
//   styleIssues      - finds stock phrases that make text read as machine-written,
//                      so the app can show them and offer a rewrite

export const HUMAN_STYLE = `
Write the way a capable person writes about their own work, not the way an AI or a template does:
- Punctuation: never use em dashes or en dashes, and never use a hyphen with spaces around it as a pause or separator. Use a comma, a full stop, or a new sentence instead. Only keep hyphens that are part of a normal word (e-commerce, full-time, part-time).
- Avoid stock CV and AI vocabulary: spearheaded, leveraged, utilized, orchestrated, synergy, seamless, robust, dynamic, cutting-edge, state-of-the-art, best-in-class, results-driven, detail-oriented, self-motivated, proven track record, fast-paced, thrive, delve, tapestry, testament, pivotal, foster, showcase, adept, meticulous, harness, empower, elevate, innovative, visionary, holistic, passionate about, honed, a wealth of, ever-evolving, unwavering, game-changer. Use the plain verb a person would say: led, built, ran, set up, wrote, fixed, cut, grew, sold, taught, looked after.
- Vary the rhythm. Mix short and longer sentences. Do not start every bullet with the same pattern or end every bullet with a percentage. Some bullets can be a plain statement of what the job involved. Only use a number when the CV gives it.
- Be specific and concrete: name the actual product, client type, tool, team size or place from the CV instead of general claims about qualities.
- Do not stack adjectives or use lists of three for effect. No "not only... but also". No rhetorical flourishes.
- Keep the candidate's own wording where it is already clear; it is their voice.
`.trim();

// Phrases that make text read as machine-written or templated. Each entry is
// matched as a whole word, case-insensitively.
const STOCK = [
  'spearheaded', 'spearheading', 'leveraged', 'leveraging', 'leverage', 'utilized', 'utilizing', 'utilize', 'utilised', 'utilise',
  'orchestrated', 'synergy', 'synergies', 'seamless', 'seamlessly', 'robust', 'cutting-edge', 'state-of-the-art', 'best-in-class',
  'results-driven', 'results-oriented', 'detail-oriented', 'self-motivated', 'proven track record', 'fast-paced', 'thrive', 'thrived',
  'delve', 'delved', 'tapestry', 'testament', 'pivotal', 'foster', 'fostered', 'fostering', 'showcase', 'showcased', 'showcasing',
  'adept', 'meticulous', 'meticulously', 'harness', 'harnessed', 'empower', 'empowered', 'elevate', 'elevated', 'innovative',
  'visionary', 'holistic', 'passionate about', 'honed', 'a wealth of', 'ever-evolving', 'unwavering', 'game-changer',
  'dynamic', 'go-getter', 'synergize', 'paradigm', 'transformative', 'commitment to excellence', 'hit the ground running',
  'i am writing to express', 'i am excited to apply', 'i am thrilled', 'in today\'s', 'plays a crucial role', 'dive into',
];

/** Replace dash punctuation with commas; keep number ranges and normal hyphenated words. */
export function cleanText(text = '') {
  return String(text)
    .replace(/^\s*[-–—•]\s+/gm, (m) => (m.includes('•') ? m : '')) // stray bullet dashes at line start
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1–$2') // protect 2019–2021 as a range
    .replace(/(\S)\s*—\s*(\S)/g, '$1, $2') // em dash between words
    .replace(/([^\d\s])\s+–\s+(\S)/g, '$1, $2') // spaced en dash between words
    .replace(/([^\d\s])\s+-\s+([^\d\s])/g, '$1, $2') // spaced hyphen used as a dash
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Clean every text field of a structured CV. */
export function cleanCV(cv) {
  const t = (s) => cleanText(s).trim();
  return {
    ...cv,
    headline: t(cv.headline),
    summary: t(cv.summary),
    skills: cv.skills.map((s) => ({ label: t(s.label), items: s.items.map(t) })),
    experience: cv.experience.map((e) => ({ ...e, title: t(e.title), company: t(e.company), bullets: e.bullets.map(t).filter(Boolean) })),
    education: cv.education.map((e) => ({ ...e, degree: t(e.degree), details: t(e.details) })),
    projects: cv.projects.map((p) => ({ ...p, name: t(p.name), description: t(p.description) })),
    certifications: cv.certifications.map(t),
    languages: cv.languages.map(t),
  };
}

/** All visible prose in a CV, for checking. */
export function cvProse(cv) {
  return [
    cv.headline,
    cv.summary,
    ...cv.skills.map((s) => s.items.join(', ')),
    ...cv.experience.flatMap((e) => e.bullets),
    ...cv.projects.map((p) => p.description),
    ...cv.education.map((e) => e.details),
  ]
    .filter(Boolean)
    .join('\n');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STOCK_RE = STOCK.map((p) => [p, new RegExp(`(^|[^a-z])${escapeRe(p)}(?![a-z])`, 'i')]);

/**
 * Find phrases that make text read as machine-written.
 * @returns {{phrases: string[], dashes: number}}
 */
export function styleIssues(text = '') {
  const phrases = STOCK_RE.filter(([, re]) => re.test(text)).map(([p]) => p);
  const dashes = (text.replace(/\d\s*[–—-]\s*\d/g, '').match(/—|\s–\s|\s-\s/g) || []).length;
  return { phrases, dashes };
}
