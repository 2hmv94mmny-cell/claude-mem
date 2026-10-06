// "Jobs for you" without AI.
//
// Everything here is plain rules that run on the device:
//   1. Read the CV: known skills, the job titles in it, years of experience
//      and languages, using the dictionaries below (English, German, French).
//   2. Search: in the Claude app, the Exa web-search connector is called
//      directly (a search engine, no language model) with one query per job
//      portal for the user's country. Standalone, the free job-board APIs are
//      used instead. Results are parsed from their text with patterns.
//   3. Score each posting 0-100 against the CV:
//        title    40  same role family, or shared words in the title
//        skills   35  share of the posting's skills found in the CV
//        place    15  in the user's city, remote, or at least the same country
//        level    10  seniority in the title vs. years of experience
//      minus penalties for a missing required language, an employment type
//      the user did not ask for, or an on-site role for a remote-only user.
//      The reason line is built from the same numbers, so it is always true.

import { portalsFor, portalForUrl, detectCountry } from './portals.js';
import { searchJobs } from './jobs.js';
import { caps, inArtifact, ready, SEARCH_SERVER, SEARCH_TOOL } from './runtime.js';

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Lower case, accents removed (ü → u), so German and French spellings match. */
export const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Compile a dictionary of [name, ...aliases] into matchers.
 * Long aliases also match inside German compounds ("Softwareentwickler"
 * contains "entwickler"); short ones need word boundaries. An alias written
 * as "=Go" is matched case-sensitively on the original text.
 */
function compile(dict, { compounds = false } = {}) {
  return dict.map(([name, ...aliases]) => {
    const all = [name, ...aliases];
    const plain = all.filter((a) => !a.startsWith('='));
    const exact = all.filter((a) => a.startsWith('=')).map((a) => a.slice(1));
    const parts = plain.map((a) => {
      const n = esc(norm(a));
      return compounds && a.length >= 7 ? n : `(?<![a-z0-9])${n}(?![a-z0-9+#])`;
    });
    return {
      name: name.replace(/^=/, ''),
      re: parts.length ? new RegExp(parts.join('|'), 'g') : null,
      cs: exact.length ? new RegExp(exact.map((a) => `(?<![A-Za-z0-9])${esc(a)}(?![A-Za-z0-9])`).join('|'), 'g') : null,
    };
  });
}

/** Names from a compiled dictionary found in a text, with hit counts and first position. */
function find(compiled, text) {
  const n = norm(text);
  const out = new Map();
  for (const m of compiled) {
    let count = 0;
    let first = Infinity;
    for (const [re, hay] of [[m.re, n], [m.cs, text]]) {
      if (!re) continue;
      re.lastIndex = 0;
      for (const hit of hay.matchAll(re)) {
        count++;
        first = Math.min(first, hit.index);
      }
    }
    if (count) out.set(m.name, { count, first });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const SKILLS = compile([
  // Software
  ['JavaScript', 'js', 'ecmascript'], ['TypeScript'], ['React', 'react.js', 'reactjs'], ['Angular', 'angularjs'], ['Vue', 'vue.js', 'vuejs'],
  ['Svelte'], ['Next.js', 'nextjs'], ['Node.js', 'nodejs', 'node'], ['Express.js', 'expressjs'], ['HTML', 'html5'], ['CSS', 'css3', 'scss', 'sass'],
  ['Tailwind', 'tailwindcss'], ['Java'], ['Spring', 'spring boot'], ['Kotlin'], ['Swift', 'swiftui'], ['Python'], ['Django'], ['Flask'], ['FastAPI'],
  ['Ruby'], ['Rails', 'ruby on rails'], ['PHP'], ['Laravel'], ['Symfony'], ['C#', 'csharp'], ['.NET', 'dotnet', 'asp.net', '.net core'], ['C++', 'cpp'],
  ['Rust'], ['=Go', 'golang'], ['Scala'], ['SQL', 't-sql', 'tsql'], ['PostgreSQL', 'postgres'], ['MySQL', 'mariadb'], ['Oracle', 'pl/sql', 'plsql'],
  ['MongoDB'], ['Redis'], ['Elasticsearch'], ['GraphQL'], ['REST API', 'rest', 'restful', 'web api', 'web-apis'], ['Docker'], ['Kubernetes', 'k8s', 'openshift'],
  ['Terraform'], ['Ansible'], ['AWS', 'amazon web services'], ['Azure'], ['Google Cloud', 'gcp'], ['Linux', 'unix'], ['Git', 'github', 'gitlab', 'bitbucket'],
  ['CI/CD', 'jenkins', 'github actions', 'gitlab ci'], ['DevOps'], ['Microservices', 'microservice'], ['Kafka'], ['Spark', 'pyspark'], ['Airflow'],
  ['dbt'], ['Snowflake'], ['Databricks'], ['WebGL', 'three.js'], ['Android'], ['iOS'], ['Flutter', 'dart'], ['React Native'], ['Unity'],
  ['Jest', 'vitest'], ['Cypress'], ['Playwright'], ['Selenium'], ['Test automation', 'testautomatisierung', 'automated testing'],
  ['Cybersecurity', 'it security', 'informationssicherheit', 'it-sicherheit', 'security'], ['Networking', 'netzwerk', 'cisco', 'tcp/ip'],
  ['Windows Server', 'active directory'], ['ITIL'], ['Helpdesk', '1st level', '2nd level', 'service desk', 'first level', 'second level'],
  ['APEX', 'oracle apex'],
  // Data and AI
  ['Power BI', 'powerbi'], ['Tableau'], ['Excel', 'ms excel'], ['VBA'], ['MATLAB'], ['SAS'], ['SPSS'], ['pandas'], ['NumPy'], ['TensorFlow'], ['PyTorch'],
  ['scikit-learn', 'sklearn'], ['Machine learning', 'maschinelles lernen'], ['Deep learning'], ['NLP'], ['LLM', 'llms', 'generative ai', 'genai'],
  ['Data analysis', 'datenanalyse', 'data analytics'], ['Statistics', 'statistik', 'statistique'], ['ETL'], ['Data warehouse', 'data warehousing'],
  // Design
  ['Figma'], ['Sketch'], ['Adobe XD'], ['Photoshop'], ['Illustrator'], ['InDesign'], ['Adobe Creative Cloud', 'adobe creative suite'],
  ['UX design', 'user experience', 'ux'], ['UI design', 'user interface design'], ['User research', 'usability testing'],
  ['Accessibility', 'wcag', 'barrierefreiheit', 'a11y'],
  // Ways of working and tools
  ['Agile', 'agil', 'agilen'], ['Scrum'], ['Kanban'], ['Jira'], ['Confluence'], ['Microsoft Office', 'ms office', 'office 365', 'microsoft 365', 'm365'],
  ['PowerPoint'], ['Word', 'ms word'], ['SAP', 'sap s/4hana', 's/4hana'], ['Salesforce'], ['HubSpot'], ['ServiceNow'], ['Shopify'], ['WordPress'],
  ['CRM'], ['ERP'],
  // Business
  ['Project management', 'projektmanagement', 'projektleitung', 'gestion de projet'], ['Product management', 'produktmanagement'],
  ['Stakeholder management'], ['Budgeting', 'budgetierung', 'budgetverantwortung'], ['Accounting', 'buchhaltung', 'rechnungswesen', 'comptabilite'],
  ['Controlling'], ['IFRS'], ['Payroll', 'lohnbuchhaltung', 'lohnadministration'], ['Recruiting', 'rekrutierung', 'recruitment', 'talent acquisition'],
  ['Sales', 'verkauf', 'vertrieb', 'vente'], ['Key account management', 'key account'], ['Customer service', 'kundendienst', 'kundenservice', 'kundenbetreuung', 'customer support'],
  ['Negotiation', 'verhandlung', 'verhandlungsgeschick'], ['Business development'], ['SEO'], ['Google Ads', 'sea'], ['Social media', 'social-media'],
  ['Content marketing', 'content creation'], ['Online marketing', 'digital marketing', 'performance marketing'],
  ['Logistics', 'logistik', 'logistique'], ['Supply chain'], ['Procurement', 'einkauf', 'beschaffung', 'purchasing'], ['Warehouse', 'lager', 'lagerbewirtschaftung'],
  ['Forklift licence', 'staplerfahrausweis', 'stapler', 'forklift'], ['Driving licence', 'fuhrerschein', 'fuhrerausweis', "driver's license", 'driving license'],
  ['Nursing', 'pflege', 'krankenpflege'], ['First aid', 'erste hilfe'], ['Teaching', 'unterricht', 'didaktik'], ['GMP'], ['Regulatory affairs'],
  ['Quality management', 'qualitatsmanagement', 'iso 9001'], ['Lean', 'six sigma', 'kaizen'], ['Leadership', 'fuhrungserfahrung', 'teamfuhrung', 'people management'],
]);

// Knowing the first means knowing the second.
const IMPLIES = [
  ['PostgreSQL', 'SQL'], ['MySQL', 'SQL'], ['Oracle', 'SQL'], ['TypeScript', 'JavaScript'], ['React', 'JavaScript'], ['Angular', 'JavaScript'],
  ['Vue', 'JavaScript'], ['Next.js', 'React'], ['Spring', 'Java'], ['Django', 'Python'], ['Flask', 'Python'], ['FastAPI', 'Python'], ['pandas', 'Python'],
  ['Laravel', 'PHP'], ['Rails', 'Ruby'], ['Kubernetes', 'Docker'], ['Scrum', 'Agile'], ['Kanban', 'Agile'], ['Power BI', 'Data analysis'], ['Tableau', 'Data analysis'],
];

const LANGUAGES = compile([
  ['English', 'englisch', 'anglais', 'inglese'], ['German', 'deutsch', 'allemand', 'tedesco'], ['French', 'franzosisch', 'francais', 'francese'],
  ['Italian', 'italienisch', 'italien', 'italiano'], ['Spanish', 'spanisch', 'espagnol', 'espanol'], ['Portuguese', 'portugiesisch', 'portugais', 'portugues'],
  ['Dutch', 'niederlandisch', 'nederlands'],
]);

// Role families: a posting and a CV match when they name the same family.
const ROLES = compile(
  [
    ['Full Stack Developer', 'full stack', 'fullstack', 'full-stack'],
    ['Frontend Developer', 'frontend', 'front-end', 'front end', 'web developer', 'webentwickler', 'ui developer', 'ui engineer'],
    ['Backend Developer', 'backend', 'back-end', 'back end'],
    ['Mobile Developer', 'mobile developer', 'ios developer', 'android developer', 'app developer', 'app-entwickler', 'appentwickler'],
    ['Software Developer', 'software developer', 'software engineer', 'softwareentwickler', 'software-entwickler', 'softwareingenieur', 'programmer',
      'programmierer', 'developer', 'entwickler', 'applikationsentwickler', 'application developer', 'informatiker', 'developpeur', 'ingenieur logiciel'],
    ['DevOps Engineer', 'devops', 'site reliability', 'sre', 'platform engineer', 'cloud engineer'],
    ['Data Scientist', 'data scientist', 'machine learning engineer', 'ml engineer', 'ai engineer'],
    ['Data Engineer', 'data engineer'],
    ['Data Analyst', 'data analyst', 'datenanalyst', 'bi analyst', 'reporting analyst', 'business intelligence'],
    ['Business Analyst', 'business analyst', 'requirements engineer', 'business-analyst'],
    ['IT Support', 'it support', 'it-support', 'helpdesk', 'service desk', 'support engineer', 'ict-supporter', 'it-supporter', 'systemtechniker', 'ict supporter'],
    ['System Administrator', 'system administrator', 'systemadministrator', 'sysadmin', 'systems engineer', 'system engineer', 'netzwerktechniker', 'network engineer'],
    ['QA Engineer', 'qa engineer', 'test engineer', 'tester', 'testautomation', 'software tester', 'quality engineer'],
    ['UX/UI Designer', 'ux designer', 'ui designer', 'product designer', 'ux/ui', 'ui/ux', 'interaction designer', 'ux-designer'],
    ['Graphic Designer', 'graphic designer', 'grafiker', 'grafikdesigner', 'mediengestalter', 'polygraf'],
    ['Product Manager', 'product manager', 'product owner', 'produktmanager'],
    ['Project Manager', 'project manager', 'projektleiter', 'projektleiterin', 'projektmanager', 'project lead', 'chef de projet'],
    ['Marketing Manager', 'marketing manager', 'marketing specialist', 'online marketing', 'digital marketing', 'marketingfachmann', 'marketingfachfrau',
      'content manager', 'social media manager', 'marketing'],
    ['Sales Manager', 'sales manager', 'account manager', 'key account manager', 'sales representative', 'verkaufer', 'verkauferin', 'aussendienst',
      'vertriebsmitarbeiter', 'business developer', 'business development', 'kundenberater'],
    ['Customer Service', 'customer service', 'kundendienst', 'call center', 'customer support', 'kundenservice', 'customer success'],
    ['Office Administrator', 'kaufmann', 'kauffrau', 'kaufmannische', 'sachbearbeiter', 'sachbearbeiterin', 'office manager', 'administrator', 'assistent',
      'assistentin', 'assistant', 'sekretar', 'sekretarin', 'empfang', 'receptionist'],
    ['Accountant', 'accountant', 'buchhalter', 'buchhalterin', 'controller', 'finanzbuchhalter', 'treasury', 'comptable'],
    ['HR Specialist', 'recruiter', 'human resources', 'hr specialist', 'hr manager', 'hr business partner', 'personalfachmann', 'personalfachfrau', 'hr-fachmann'],
    ['Logistics', 'logistiker', 'logistikerin', 'logistics', 'lagerist', 'lagermitarbeiter', 'warehouse', 'disponent', 'einkaufer', 'supply chain'],
    ['Driver', 'chauffeur', 'fahrer', 'driver', 'lkw-fahrer'],
    ['Nurse', 'pflegefachfrau', 'pflegefachmann', 'nurse', 'pflegehelfer', 'fachfrau gesundheit', 'fachmann gesundheit', 'infirmier', 'infirmiere'],
    ['Teacher', 'lehrer', 'lehrerin', 'teacher', 'lehrperson', 'enseignant'],
    ['Cook', 'koch', 'kochin', 'chef de partie', 'cook', 'commis'],
    ['Service Staff', 'servicemitarbeiter', 'servicefachfrau', 'kellner', 'waiter', 'waitress', 'barista', 'gastronomie'],
    ['Electrician', 'elektriker', 'elektroinstallateur', 'electrician', 'montage-elektriker'],
    ['Mechanic', 'mechaniker', 'polymechaniker', 'mechanic', 'automatiker', 'mechatroniker'],
    ['Engineer', 'maschineningenieur', 'mechanical engineer', 'electrical engineer', 'elektroingenieur', 'konstrukteur', 'process engineer'],
    ['Lab Technician', 'laborant', 'laborantin', 'lab technician', 'chemist', 'chemiker', 'biologist', 'scientist'],
    ['Consultant', 'consultant', 'berater', 'beraterin', 'consultante'],
    ['Team Lead', 'team lead', 'teamleiter', 'teamleiterin', 'head of', 'gruppenleiter', 'abteilungsleiter'],
  ],
  { compounds: true },
);

// Words that carry no meaning in a job title.
const TITLE_NOISE = new Set(
  'm w d f h x all genders gender mwd wmd 100 80 90 70 60 50 % und and or oder the der die das a an in at bei for fur of de et la le du job jobs stelle position'.split(' '),
);
const TITLE_SYNONYMS = { entwickler: 'developer', entwicklerin: 'developer', programmierer: 'developer', ingenieur: 'engineer', fullstack: 'full stack', 'full-stack': 'full stack', 'front-end': 'frontend', 'back-end': 'backend', leiter: 'lead', leiterin: 'lead' };

function titleWords(title) {
  const words = norm(title)
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9+#.-]+/)
    .map((w) => TITLE_SYNONYMS[w] || w)
    .join(' ')
    .split(' ')
    .filter((w) => w.length > 1 && !TITLE_NOISE.has(w));
  return new Set(words);
}

// ---------------------------------------------------------------------------
// 1. Read the CV
// ---------------------------------------------------------------------------

const EDU_WORDS = /ausbildung|education|studium|studies|schule|school|universit|hochschule|bachelor|master|lehre|apprenticeship|gymnasium|matura|diplom|formation|ecole/;
const MONTHS = 'jan|feb|mar|mär|apr|may|mai|jun|jul|aug|sep|oct|okt|nov|dec|dez|janv|fevr|mars|avr|juin|juil|aout|sept|déc';
const RANGE = new RegExp(
  `(?:(\\d{1,2})[./]\\s*|(?:${MONTHS})[a-zä]*\\.?\\s+)?((?:19|20)\\d{2})\\s*(?:-|–|—|bis|to|until|à|au)\\s*(?:(?:(\\d{1,2})[./]\\s*|(?:${MONTHS})[a-zä]*\\.?\\s+)?((?:19|20)\\d{2})|(heute|present|now|today|aktuell|current|currently|laufend|jetzt|date|dato|aujourd'hui|ongoing))`,
  'gi',
);

/** Years of work experience from the date ranges in a CV (school and studies left out). */
export function yearsOfExperience(cv) {
  const lines = String(cv || '').split('\n');
  const now = new Date();
  const spans = [];
  lines.forEach((line, i) => {
    RANGE.lastIndex = 0;
    for (const m of line.matchAll(RANGE)) {
      const context = norm([lines[i - 1], line, lines[i + 1], lines[i + 2]].filter(Boolean).join(' '));
      if (EDU_WORDS.test(context)) continue;
      const start = Number(m[2]) * 12 + (Number(m[1]) || 1) - 1;
      const end = m[5] ? now.getFullYear() * 12 + now.getMonth() : Number(m[4]) * 12 + (Number(m[3]) || 12) - 1;
      if (end >= start && end - start < 50 * 12) spans.push([start, end]);
    }
  });
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let cur = null;
  for (const s of spans) {
    if (!cur || s[0] > cur[1]) {
      if (cur) months += cur[1] - cur[0] + 1;
      cur = [...s];
    } else cur[1] = Math.max(cur[1], s[1]);
  }
  if (cur) months += cur[1] - cur[0] + 1;
  return Math.round((months / 12) * 10) / 10;
}

const COMMON_WORDS = {
  German: /\b(und|der|die|das|mit|fur|bei|von|ich|als|im)\b/g,
  French: /\b(et|les|des|pour|avec|dans|une|du|je|au)\b/g,
  English: /\b(and|the|with|for|of|in|to|my|as|at)\b/g,
  Italian: /\b(e|il|di|per|con|della|nel|una|che)\b/g,
};
function writtenIn(text) {
  const t = norm(text).slice(0, 8000);
  if (t.length < 200) return null;
  const counts = Object.entries(COMMON_WORDS).map(([lang, re]) => [lang, (t.match(re) || []).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] >= 8 ? counts[0][0] : null;
}

const LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead'];
const levelFromYears = (y) => (y < 1 ? 'entry' : y < 2.5 ? 'junior' : y < 5 ? 'mid' : y < 10 ? 'senior' : 'lead');

/**
 * Everything the matcher knows about the candidate.
 * @returns {{roles: string[], families: string[], skills: Set<string>, languages: Set<string>, years: number, level: string}}
 */
export function readProfile(p) {
  const cv = String(p.cv || '');
  const own = `${p.skills || ''}\n${p.headline || ''}\n${p.targetRoles || ''}`;
  const skills = new Set([...find(SKILLS, `${cv}\n${own}`).keys()]);
  for (const s of String(p.skills || '').split(',').map((x) => x.trim()).filter(Boolean)) skills.add(s);
  for (const [specific, general] of IMPLIES) if (skills.has(specific)) skills.add(general);
  const languages = new Set([...find(LANGUAGES, `${cv}\n${p.languages || ''}`).keys()]);
  // The language a CV is written in is one the candidate speaks.
  const written = writtenIn(cv);
  if (written) languages.add(written);

  // Role families in the CV: earlier mentions (the latest job) and short lines
  // (job titles rather than prose) count more.
  const scored = new Map();
  cv.split('\n').forEach((line, i, all) => {
    const short = line.trim().length < 70;
    for (const [name, { count }] of find(ROLES, line)) {
      const weight = count * (short ? 3 : 1) * (1 + 2 * (1 - i / Math.max(all.length, 1)));
      scored.set(name, (scored.get(name) || 0) + weight);
    }
  });
  for (const [name] of find(ROLES, p.headline || '')) scored.set(name, (scored.get(name) || 0) + 20);
  // "Software Developer" is the catch-all; prefer a more specific developer family when both appear.
  const families = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (families[0] === 'Software Developer' && families.some((f) => /Full Stack|Frontend|Backend|Mobile/.test(f))) {
    families.push(families.shift());
  }

  const given = String(p.targetRoles || '').split(',').map((r) => r.trim()).filter(Boolean);
  const roles = given.length ? given.slice(0, 2) : families.slice(0, 2);
  const familiesForRoles = given.length ? [...new Set(given.flatMap((r) => [...find(ROLES, r).keys()]))] : [];

  const years = yearsOfExperience(cv);
  return {
    roles: roles.length ? roles : p.headline ? [p.headline.trim()] : [],
    families: [...new Set([...familiesForRoles, ...families])].slice(0, 4),
    skills,
    languages,
    years,
    level: cv.trim() ? levelFromYears(years) : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Search
// ---------------------------------------------------------------------------

/** Text from an MCP tool result, whatever shape the host gives it. */
function payloadText(v) {
  if (typeof v?.payload === 'string') return v.payload;
  if (Array.isArray(v?.content)) return v.content.map((c) => c?.text || '').join('\n');
  if (typeof v?.payload?.text === 'string') return v.payload.text;
  return JSON.stringify(v?.payload ?? v ?? '');
}

const LIST_TITLE = /^\d[\d.,']*\+?\s.*\b(jobs?|stellen|stellenangebote|vacancies|offres|emplois)\b|\bjobs? in\b|\bstellenangebote in\b|\bjobs?, employment\b|\boffres d'emploi\b|\bjob search\b/i;
const LIST_URL = /[?&](term|q|keywords?|query|search|was|k)=|\/(jobs|vacancies|stellenangebote|stellen|search|jobsuche|emplois|careers|karriere)\/?$/i;
const POSTING_URL = /detail|\/job\/|\/jobs\/view|viewjob|[?&]jk=|\/stellenangebot|\/stelle\/|\/vacanc(y|ies)\/[^?]+|\/position|greenhouse\.io|lever\.co|myworkdayjobs|smartrecruiters|ashbyhq|personio|recruitee|teamtailor|workable|\/offre|\/job-|\/jobs\/\d|\/jobs\/[a-z0-9-]{12,}/i;

/** Split a page title into the job title and company. */
function splitTitle(raw, url) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  let m = t.match(/^(.*?)\s+[-–|]\s+(?:Stellenangebot bei|Job Offer at|Jobangebot bei|Job bei|Offre d'emploi chez|Offre d'emploi|Annonce chez)\s+(.+?)(?:\s+[-–|]\s+[^-–|]+)?$/i);
  if (m) return { title: m[1], company: m[2] };
  m = t.match(/^(.+?) hiring (.+?)(?: in (.+?))? \| LinkedIn/i);
  if (m) return { title: m[2], company: m[1], location: m[3] };
  m = t.match(/^Job Application for (.+?) at (.+)$/i);
  if (m) return { title: m[1], company: m[2] };
  const parts = t.split(/\s+[-–|]\s+/).filter(Boolean);
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {}
  const site = host.split('.')[0];
  while (parts.length > 1 && (/\.(com|ch|de|at|fr|co|net|org|io)\b|indeed|linkedin|glassdoor|careers?|karriere|jobs?$/i.test(parts.at(-1)) || norm(parts.at(-1)).includes(site))) parts.pop();
  if (parts.length === 1) {
    const at = parts[0].match(/^(.+?) at (.+)$/i);
    if (at) return { title: at[1], company: at[2] };
  }
  return { title: parts[0] || t, company: parts[1] || '', location: parts[2] || '' };
}

const DATE_LINE = /^(?:[-*•]\s*)?(\d{1,2}\.?\s+[A-Za-zäéû]+\s+20\d{2}|20\d{2}-\d{2}-\d{2})\s*$/;
const WORKLOAD = /^(?:[-*•]\s*)?(\d{2,3}\s*(?:[-–]\s*\d{2,3}\s*)?%)\s*$/;

/** Parse Exa's text results into job postings. */
export function parseSearchResults(text, { city = '' } = {}) {
  const jobs = [];
  for (const block of String(text).split(/\n-{3,}\n/)) {
    const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
    const url = block.match(/^URL:\s*(\S+)/m)?.[1]?.trim();
    if (!title || !/^https?:\/\//.test(url || '')) continue;
    if (LIST_TITLE.test(title) || (LIST_URL.test(url) && !POSTING_URL.test(url))) continue;
    const body = (block.split(/^Highlights:\s*$/m)[1] || block.split(/^Text:\s*$/m)[1] || '').trim();
    const looksLikeRole = find(ROLES, title).size > 0;
    if (!POSTING_URL.test(url) && !looksLikeRole) continue;

    const parts = splitTitle(title, url);
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const published = block.match(/^Published:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || '';
    let posted = published;
    let workload = '';
    let location = parts.location || '';
    for (const l of lines.slice(0, 14)) {
      const d = l.match(DATE_LINE);
      if (d && !posted) posted = d[1];
      const w = l.match(WORKLOAD);
      if (w && !workload) workload = w[1].replace(/\s+/g, '');
      if (!location) {
        const pc = l.match(/\b\d{4,5}\s+([A-ZÄÖÜ][\wäöüéèà.-]+(?:\s[A-ZÄÖÜ][\wäöüéèà.-]+)?)\s*$/);
        if (pc) location = pc[1];
        else if (/^(?:[-*•]\s*)?[A-ZÄÖÜ][\wäöüéèà .,-]{2,40}$/.test(l) && city && norm(l).includes(norm(city))) location = l.replace(/^[-*•]\s*/, '');
      }
    }
    if (!location && city && norm(`${title} ${body}`).includes(norm(city))) location = city;
    const remote = /\b(remote|home ?office|homeoffice|telearbeit|teletravail|work from home)\b/i.test(`${title}\n${body}`);

    const description = lines
      .filter((l) => !/^#*\s*$/.test(l) && norm(l) !== norm(title) && !l.startsWith('...'))
      .map((l) => l.replace(/^#+\s*/, ''))
      .join('\n')
      .slice(0, 3000);

    jobs.push({
      id: `web:${hash(url)}`,
      source: portalForUrl(url) || 'Web',
      title: parts.title.trim(),
      company: parts.company.trim(),
      location: location || (remote ? 'Remote' : ''),
      remote,
      url,
      salary: '',
      posted,
      tags: workload ? [workload] : [],
      description,
      _text: `${title}\n${body}`.slice(0, 6000),
    });
  }
  return jobs;
}

async function searchPortals(roles, location, remote, signal) {
  const where = remote ? 'remote' : location;
  const { portals, country } = portalsFor(roles[0], where, { remote });
  const live = portals.filter((x) => x.live).slice(0, 4);
  const place = where ? ` in ${where}` : '';
  const queries = roles.flatMap((role) => [
    { query: `open job posting ${role}${place}`, objective: `Find currently open job postings for "${role}"${place}. Direct posting pages only; exclude articles, salary guides and lists of jobs.` },
    ...live.map((x) => ({
      query: `${role} job${place} site ${x.domain}`,
      objective: `Find currently open job postings for "${role}"${place} on ${x.name} (${x.domain}). Only return single posting pages hosted on ${x.domain}.`,
    })),
  ]);
  const settled = await Promise.allSettled(queries.map((q) => caps.mcp.callTool(SEARCH_SERVER, SEARCH_TOOL, { ...q, numResults: 10 }, { signal })));
  const city = location.split(',')[0].trim();
  const jobs = [];
  let error = null;
  for (const r of settled) {
    if (r.status === 'fulfilled') jobs.push(...parseSearchResults(payloadText(r.value), { city }));
    else error ??= r.reason;
  }
  if (!jobs.length && error) throw error;
  return { jobs, country };
}

async function searchBoards(roles, location, remote) {
  const results = await Promise.all(roles.map((role) => searchJobs({ query: role, location: remote ? '' : location, remoteOnly: remote })));
  const jobs = results.flatMap((r) => r.jobs).filter((j) => j.source !== 'Demo');
  return { jobs: jobs.map((j) => ({ ...j, _text: `${j.title}\n${j.tags.join(' ')}\n${j.description}` })), country: detectCountry(location) };
}

// ---------------------------------------------------------------------------
// 3. Score
// ---------------------------------------------------------------------------

const JOB_LEVEL = [
  [/\b(intern|internship|praktikum|praktikant|praktikantin|stage|stagiaire|werkstudent|working student|trainee|lehrstelle|lernende|apprentice)\b/, 'entry'],
  [/\b(junior|jr\.?|einsteiger|graduate|berufseinsteiger)\b/, 'junior'],
  [/\b(head of|director|chief|vp|principal|abteilungsleiter|bereichsleiter)\b/, 'lead'],
  [/\b(senior|sr\.?|lead|staff|expert|experte|teamleiter|teamleiterin)\b/, 'senior'],
];

function jobLevel(title, text) {
  const t = norm(title);
  for (const [re, level] of JOB_LEVEL) if (re.test(t)) return level;
  const years = norm(text).match(/(\d{1,2})\s*\+?\s*(?:years|jahre|jahren|ans|annees)/);
  if (years) return levelFromYears(Number(years[1]));
  return null;
}

const TYPE_WORDS = {
  Internship: /\b(intern|internship|praktikum|stage|werkstudent)\b/,
  Freelance: /\b(freelance|freiberuflich|freelancer)\b/,
  Contract: /\b(contract|befristet|temporar|temporary|cdd|interim)\b/,
  'Part-time': /\b(part[- ]time|teilzeit|temps partiel)\b|\b[1-7]0\s*%/,
  'Full-time': /\b(full[- ]time|vollzeit|festanstellung|permanent|unbefristet|cdi)\b|\b(80|90|100)\s*%/,
};

/**
 * Score one posting for the candidate.
 * @returns {{score: number, reason: string}}
 */
export function scoreJob(job, me, prefs = {}, location = '') {
  const text = job._text || `${job.title}\n${job.description}`;
  const reasons = [];
  const gaps = [];

  // Title (40)
  const jobFamilies = new Set(find(ROLES, job.title).keys());
  const wanted = new Set(me.roles.flatMap((r) => [...find(ROLES, r).keys()]));
  let title = 0;
  if ([...wanted].some((f) => jobFamilies.has(f))) title = 40;
  else if (me.families.some((f) => jobFamilies.has(f))) title = 30;
  const tw = titleWords(job.title);
  for (const r of me.roles) {
    const rw = titleWords(r);
    const shared = [...rw].filter((w) => tw.has(w)).length;
    if (rw.size) title = Math.max(title, Math.round((40 * shared) / rw.size));
  }
  if (title >= 30) reasons.push('your kind of role');

  // Skills (35)
  const jobSkills = [...find(SKILLS, text).keys()];
  const mine = new Set([...me.skills].map(norm));
  const have = jobSkills.filter((s) => mine.has(norm(s)));
  const miss = jobSkills.filter((s) => !mine.has(norm(s)));
  const skills = jobSkills.length ? Math.round(35 * Math.min(1, have.length / Math.min(jobSkills.length, 6))) : 14;
  if (have.length) reasons.push(`you have ${have.slice(0, 3).join(', ')}`);
  if (miss.length && have.length < jobSkills.length) gaps.push(`asks for ${miss.slice(0, 2).join(', ')}`);

  // Place (15)
  const city = norm(location.split(',')[0].trim());
  const wantsRemote = (prefs.workModes || []).includes('Remote');
  const remoteOnly = (prefs.workModes || []).length === 1 && wantsRemote;
  const jobPlace = norm(`${job.location} ${text.slice(0, 1500)}`);
  let place = 6;
  if (city && jobPlace.includes(city)) {
    place = 15;
    reasons.push(`in ${location.split(',')[0].trim()}`);
  } else if (job.remote && (wantsRemote || !city)) {
    place = 13;
    reasons.push('remote');
  } else if (job.location) {
    const theirs = detectCountry(job.location);
    const ours = detectCountry(location);
    place = theirs && ours && theirs !== ours ? 0 : 6;
  }

  // Level (10)
  const need = jobLevel(job.title, text);
  let level = 7;
  if (need && me.level) {
    const gap = LEVELS.indexOf(need) - LEVELS.indexOf(me.level);
    level = gap === 0 ? 10 : Math.abs(gap) === 1 ? 6 : 0;
    if (gap >= 2) gaps.push(`aimed at ${need} level`);
    if (gap <= -2) gaps.push(`more junior than you`);
    if (gap === 0) reasons.push(`fits your ${me.years >= 1 ? `${Math.round(me.years)} years` : 'level'}`);
  }

  // Penalties
  let penalty = 0;
  // Languages the posting names that the CV does not show.
  if (me.languages.size) {
    const asked = [...find(LANGUAGES, text).keys()].filter((l) => !me.languages.has(l));
    if (asked.length) {
      penalty += Math.min(15, asked.length * 8);
      gaps.push(`needs ${asked.slice(0, 2).join(' and ')}`);
    }
  }
  const types = prefs.types || [];
  if (types.length) {
    const t = norm(`${job.title} ${job.tags.join(' ')} ${text.slice(0, 800)}`);
    const offered = Object.entries(TYPE_WORDS).filter(([, re]) => re.test(t)).map(([k]) => k);
    if (offered.length && !offered.some((o) => types.includes(o))) {
      penalty += 10;
      gaps.push(`${offered[0].toLowerCase()}`);
    }
  }
  if (remoteOnly && !job.remote) {
    penalty += 15;
    gaps.push('not remote');
  }

  const score = Math.max(0, Math.min(100, title + skills + place + level - penalty));
  const good = reasons.slice(0, 3).join(', ');
  const bad = gaps.slice(0, 2).join(', ');
  const reason = [good && good[0].toUpperCase() + good.slice(1), bad && `but ${bad}`].filter(Boolean).join(' ');
  return { score, reason: reason || 'Partly matches your profile' };
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/**
 * Find and rank jobs near the user from their CV and profile. No AI involved.
 * @returns {Promise<{jobs: object[], roles: string[], country: string|null, via: string}>}
 */
export async function jobsForYou(profile, { signal } = {}) {
  await ready;
  const me = readProfile(profile);
  if (!me.roles.length) throw new Error('Add your CV or the roles you want in Profile first.');
  const location = String(profile.location || '').trim();
  const remote = Boolean(profile.remoteOnly);

  let found;
  let via = 'job boards';
  if (inArtifact && caps.mcp) {
    try {
      found = await searchPortals(me.roles, location, remote, signal);
      via = 'job portals';
    } catch (err) {
      if (err?.code === 'cancelled') throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
      found = null;
    }
  }
  found ??= await searchBoards(me.roles, location, remote);

  // De-duplicate: same link, or same title at the same company.
  const seen = new Set();
  const unique = found.jobs.filter((j) => {
    const keys = [j.url, `${norm(j.title)}|${norm(j.company)}`].filter((k) => k && k !== '|');
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });

  const ranked = unique
    .map((j) => {
      const match = scoreJob(j, me, profile.prefs || {}, location);
      const { _text, ...job } = j;
      void _text;
      return { ...job, match };
    })
    .filter((j) => j.match.score >= 35)
    .sort((a, b) => b.match.score - a.match.score);

  return { jobs: ranked, roles: me.roles, country: found.country, via };
}

// ---------------------------------------------------------------------------
// About the company, from the posting itself
// ---------------------------------------------------------------------------

const ABOUT_HEADING = /^(?:#+\s*)?(?:uber uns|about us|about the company|about the team|wer wir sind|who we are|a propos(?: de nous)?|qui sommes-nous|unser unternehmen|das unternehmen|the company|company description|company overview|unternehmensprofil|uber (?:die|das|den)?\s*\S+|about \S+)\s*:?/;
const COMPANY_FACT = /gegrundet|founded|fondee|mitarbeitende|mitarbeiter|employees|collaborateurs|hauptsitz|headquarter|siege|standorte|locations|marktfuhrer|market leader|weltweit|worldwide|international|familienunternehmen|family[- ]owned|kotiert|listed|seit \d{4}|since \d{4}/;

/**
 * The posting's own words about the employer (its "About us" part), or ''.
 * Plain pattern matching, no AI.
 */
export function aboutFromPosting(job) {
  const lines = String(job.description || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const name = norm(String(job.company || '').split(/\s+/)[0] || '');
  // 1. A heading like "Über uns" / "About us" / "Über Medartis", and what follows it.
  for (let i = 0; i < lines.length; i++) {
    const n = norm(lines[i]);
    if (!ABOUT_HEADING.test(n)) continue;
    if (/^uber (?:die|das|den)?\s*\S+/.test(n) && name && !n.includes(name) && !/^uber uns/.test(n)) continue;
    // The heading may be glued to the text ("Über MedartisBei Medartis …").
    const glued = lines[i].replace(/^#+\s*/, '').replace(/^(?:Über|About|À propos de)\s+\S+?(?=[A-ZÄÖÜ][a-zäöü])/, '');
    const out = [];
    if (glued.length > 60) out.push(glued);
    for (let j = i + 1; j < lines.length && out.join(' ').length < 700; j++) {
      const l = lines[j];
      if (l.length < 45 && !/[.!]$/.test(l) && out.length) break; // next heading
      if (l.length >= 45) out.push(l.replace(/^[-*•]\s*/, ''));
    }
    if (out.length) return out.join(' ').slice(0, 900);
  }
  // 2. Sentences that state company facts and name the company.
  const facts = lines.filter((l) => l.length > 60 && COMPANY_FACT.test(norm(l)) && (!name || norm(l).includes(name) || /\b(wir|we|nous)\b/.test(norm(l))));
  return facts.slice(0, 2).join(' ').slice(0, 900);
}
