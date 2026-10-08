// What makes a CV and a cover letter work: how recruiters read them, how
// applicant tracking systems (ATS) parse them, and what each country and kind
// of job expects. Every writing and editing prompt gets the parts that apply,
// so Vora always works from the same, researched rules.
//
// Sources behind the rules (summarised, not quoted): TheLadders eye-tracking
// study (recruiters spend about 7 seconds on a first scan, most of it on name,
// current title and employer, dates and education); recruiter surveys by
// Resume Genius, Zety, ResumeLab and TopResume (most hiring managers read
// cover letters, want evidence of relevant experience tied to the posting,
// and reject generic or obviously templated letters); ATS vendor behaviour
// (Workday, Greenhouse, Lever, iCIMS, Taleo, SuccessFactors, SmartRecruiters,
// Personio, Umantis, Softgarden: literal keyword search, trouble with columns,
// tables, text boxes, headers/footers and icons); Google's "accomplished X as
// measured by Y by doing Z" bullet advice; career-service guidance for the
// DACH region, France (vous / moi / nous), Italy (GDPR consent line), the UK,
// the US and others.

// ---------------------------------------------------------------------------
// General rules
// ---------------------------------------------------------------------------

export const RECRUITER_FACTS = `
How CVs and letters are actually read:
- A recruiter's first pass on a CV takes seconds. Their eyes go to the name, the current or most recent job title and employer, the dates, and education, mostly down the left side and across the top. If the top third does not show "this person has done this job or close to it", the rest is rarely read.
- Most hiring managers do read cover letters, often before the CV, and decide on them. What they want: proof that the person has done the relevant work, connected to what the posting asks for, and a believable reason for wanting this job at this company. What they reject: generic letters that could be sent anywhere, repeating the CV, and text that reads as AI-written (stock phrases, flat rhythm, no specifics).
- Most applications pass through an ATS first. Recruiters search it like a database with the exact words from the posting (job title, tools, certifications, languages). A CV that says "container orchestration" is not found by a search for "Kubernetes". Missing keywords make a strong candidate invisible; stuffing them makes the CV unreadable and some systems penalise it.
`.trim();

export const ATS_RULES = `
ATS rules (the app's templates already handle the layout; you handle the words):
- Use the posting's exact terms for skills, tools, certifications and the job title wherever the CV truthfully supports them. Write an acronym and its full form once when both are common: "Search engine optimisation (SEO)".
- Put each important keyword where it is proven, inside a bullet about real work, and again in the skills section. A keyword that only appears in a skills list counts for less with recruiters.
- Standard section names only: Profile/Summary, Experience, Education, Skills, Certifications, Languages, Projects (or the usual equivalents in the CV's language). No creative headings.
- One clear job title per role, employer, place, and dates in one consistent format (e.g. "03/2021 – Present" or "March 2021 – Present"). Never leave dates out of jobs.
- Plain text only in fields: no emoji, symbols, icons, tables, ASCII art or text in images. Skills as short words or phrases, not ratings or bars.
- Spell out the language level (German C1, English fluent) and certifications with their exact official name.
- Tell the truth in a way that survives a follow-up question: every claim and number must come from the candidate's own CV.
`.trim();

export const CV_RULES = `
What a strong CV has:
- Top third: name, a target title that matches the posting's title when truthful, contact line (city, phone, email, LinkedIn or portfolio), then a 2-4 line profile written for this job: who they are professionally, years and area of experience, the 2-3 strengths this job needs most, proven with something concrete. No objective statements, no "hard-working team player".
- Experience in reverse chronological order. Most recent and relevant roles get 3-6 bullets, older ones 1-3, roles older than about 10-15 years can be one line or dropped unless they matter for this job.
- Bullets show outcomes, not duties: what changed because of this person. Good shape (vary it, do not force it): result + how it was measured + how they did it, e.g. "Cut month-end closing from 8 to 5 days by automating reconciliations in Excel and SAP". Start with a strong plain verb. Use numbers only when the CV gives them (team size, budget, volume, %, time saved, customers, revenue). Where there is no number, name the scope or the concrete result.
- The first bullet of each role is the one most relevant to this job.
- Skills grouped under short labels (e.g. Languages, Tools, Methods), most relevant to the posting first. Hard skills the posting names come first.
- Education: degree, school, place, year; add thesis, grade or honours only when it helps (early career, academic or regulated jobs).
- Length: as short as the evidence allows. Early career 1 page; experienced 2 pages; academic, medical and senior executive CVs can be longer where that is the local norm.
- Remove what hurts: unrelated hobbies, outdated tools, "References available on request", full street address (city is enough unless the country expects it), personal data that the country does not expect.
- Gaps, career changes and short jobs: state them plainly and briefly in a way that shows what was gained (e.g. "Career break: caring for family, completed X certificate"). Never hide dates.
`.trim();

export const LETTER_RULES = `
What a strong cover letter has (it is a short argument, not a CV in prose):
- One page. Usually 250-350 words, 3-5 short paragraphs. A recruiter reads it in about 30 seconds.
- Greeting to a named person when the posting names one (with the right title and form for the language), otherwise the standard neutral greeting of that language.
- Opening (2-3 sentences): the role, and one specific reason this company and this job fit the candidate. Use a real fact about the company or the posting (what they build, a project, a value or challenge the posting mentions, recent news if given). Never open with "I am writing to apply", "I am excited", "My name is", or a quote.
- Proof (1-2 paragraphs): pick the 2-3 most important requirements of the posting and answer each with concrete evidence from the CV: what the candidate did, where, with what result. Mirror the posting's key terms naturally. Do not retell the whole CV.
- Fit and value: what they would bring to the team or problem in the first months, and why this employer (not just any employer). Short and specific.
- Close: one or two sentences, confident not pushy, inviting a conversation. Add only what the posting asks for (earliest start date, notice period, salary expectation, work permit) and only from the candidate's data.
- Sign-off in the standard form for the language, then the candidate's name.
- Tone: like a capable person talking about their work. First person, active voice, short sentences, some variation. No flattery, no exaggeration, no clichés, no apologising for missing skills. A missing requirement can be bridged honestly with related experience or how fast they learned something similar.
- Career changers: lead with transferable results and why the change now. Graduates: lead with the most relevant project, internship, thesis or job, and learning speed. Senior people: lead with scope and outcomes (team, budget, growth, turnarounds).
`.trim();

const AI_TELLS = `
Things that make recruiters think "AI wrote this" (avoid all of them): generic openings ("I am writing to express my interest", "I am thrilled"), empty adjectives ("passionate", "dynamic", "results-driven", "detail-oriented"), buzzwords (leverage, spearhead, synergy, delve, foster, robust), three-item lists used for rhythm, every bullet ending in a percentage, the same sentence pattern repeated, praise of the company that could fit any company, and claims without a concrete example.
`.trim();

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

const COUNTRIES = {
  CH: {
    name: 'Switzerland',
    cv: 'Swiss CV (Lebenslauf / CV): tabular, reverse chronological, usually 2 pages. A professional photo is common and expected by many employers. Personal details usually include date of birth or age, nationality and, for non-Swiss, the residence/work permit (e.g. "Permit B"). Language skills with levels are important (often German, French, English). No signature on the CV. Arbeitszeugnisse/diplomas are attached separately, not summarised in the CV.',
    letter: 'Swiss letter (Motivationsschreiben / lettre de motivation): one page, polite and factual, not flowery. Formal address ("Sehr geehrte Frau Muster" / "Madame, Monsieur"); German in Switzerland uses "ss" instead of "ß". If the posting asks, state salary expectation (annual gross, in CHF) and the earliest start date or notice period in the closing paragraph. Sign-off "Freundliche Grüsse" (German-speaking) or "Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées" (French).',
  },
  DE: {
    name: 'Germany',
    cv: 'German Lebenslauf: tabular, reverse chronological, 1-2 pages. Photo optional (not required by law since 2006) but still common; leave it to the candidate. Date of birth optional. Place and date plus signature at the end is traditional but optional for online applications. Use "Berufserfahrung", "Ausbildung", "Kenntnisse".',
    letter: 'German Anschreiben: one page, subject line "Bewerbung als …" (the app sets it), greeting "Sehr geehrte Frau …," / "Sehr geehrter Herr …," or "Sehr geehrte Damen und Herren,", Sie-form, factual and modest. If the posting asks, give Gehaltsvorstellung (annual gross) and frühestmöglicher Eintrittstermin or Kündigungsfrist in the closing paragraph. Sign-off "Mit freundlichen Grüßen".',
  },
  AT: {
    name: 'Austria',
    cv: 'Austrian Lebenslauf: like Germany; photo common; academic titles (Mag., DI, Dr.) matter and are written out.',
    letter: 'Austrian letter: like Germany, address with academic titles if known ("Sehr geehrte Frau Mag. …"). Salary in annual or monthly gross (14 salaries are standard). Sign-off "Mit freundlichen Grüßen".',
  },
  UK: {
    name: 'the United Kingdom',
    cv: 'UK CV: usually 2 A4 pages, opens with a 3-4 line personal statement. No photo, no date of birth, no marital status (Equality Act). British spelling (organise, centre). Dates like "June 2019". Degree class for graduates. Add a plain right-to-work or visa line only if the candidate needs sponsorship.',
    letter: 'UK cover letter: about one page, "Dear Ms Smith," with "Yours sincerely," or "Dear Hiring Manager," with "Kind regards,". Direct and confident, understated, British spelling.',
  },
  IE: { name: 'Ireland', cv: 'Irish CV: like the UK (2 pages, no photo, no date of birth), British/Irish spelling.', letter: 'Irish cover letter: like the UK.' },
  US: {
    name: 'the United States',
    cv: 'US resume: 1 page for early career, up to 2 pages for experienced, Letter or A4 is fine online. No photo, no date of birth, no nationality or marital status. Summary optional; results-heavy bullets. American spelling. Dates like "Jun 2019" or "06/2019".',
    letter: 'US cover letter: 250-350 words, "Dear Hiring Manager," or the person\'s name, "Sincerely," or "Best regards,". Direct, energetic but concrete, results first.',
  },
  CA: { name: 'Canada', cv: 'Canadian resume: like the US, 1-2 pages, no photo or personal data. Bilingual (English/French) is a plus to state.', letter: 'Canadian cover letter: like the US.' },
  FR: {
    name: 'France',
    cv: 'French CV: usually 1 page (1.5 at most), a short title line at the top stating the target job, reverse chronological. Photo optional and increasingly left out. Languages with levels (CECR).',
    letter: 'French lettre de motivation: one page, structure "vous / moi / nous": first the company and its needs (vous), then what the candidate brings with proof (moi), then what they will build together (nous). Formal: "Madame, Monsieur," and a formal closing such as "Je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées." Vouvoiement throughout.',
  },
  BE: { name: 'Belgium', cv: 'Belgian CV: 1-2 pages, languages (French, Dutch, English, German) with levels are very important; photo optional.', letter: 'Belgian letter: French style (vous/moi/nous) in French, Dutch style (short, direct) in Dutch.' },
  LU: { name: 'Luxembourg', cv: 'Luxembourg CV: 1-2 pages, languages with levels essential (Luxembourgish, French, German, English); photo common.', letter: 'Luxembourg letter: formal French or German conventions, depending on the posting language.' },
  NL: { name: 'the Netherlands', cv: 'Dutch CV: 1-2 pages, direct and factual, photo optional, personal data minimal.', letter: 'Dutch motivatiebrief: short and very direct (half a page to one page), no flattery, "Geachte heer/mevrouw …" and "Met vriendelijke groet,".' },
  IT: {
    name: 'Italy',
    cv: 'Italian CV: 2 pages typical, Europass format is accepted but a clean modern CV is preferred in the private sector. Photo common. Add the data-processing consent line at the bottom when the CV is for an Italian employer: "Autorizzo il trattamento dei dati personali contenuti nel mio curriculum vitae ai sensi del Regolamento UE 2016/679 (GDPR)." (only if the candidate has not removed it).',
    letter: 'Italian lettera di presentazione: formal ("Gentile Dott.ssa …" / "Spettabile Azienda"), lei-form, one page, closing "Distinti saluti".',
  },
  ES: { name: 'Spain', cv: 'Spanish CV: 1-2 pages, photo still common, languages with levels.', letter: 'Spanish carta de presentación: formal ("Estimado/a Sr./Sra. …"), usted-form, one page, "Atentamente,".' },
  PT: { name: 'Portugal', cv: 'Portuguese CV: 1-2 pages, Europass is common in the public sector, photo optional.', letter: 'Portuguese carta de apresentação: formal ("Exmo./Exma. Sr./Sra. …"), one page, "Com os melhores cumprimentos,".' },
  NORDIC: { name: 'the Nordic countries', cv: 'Nordic CV: 1-2 pages, factual, modest tone, photo optional (common in Sweden), personal interests briefly are fine.', letter: 'Nordic letter: short, modest and personal, first names are fine, focus on how they work with others.' },
  DEFAULT: { name: 'an international employer', cv: 'International CV: 1-2 pages, reverse chronological, no photo or personal data unless the posting asks.', letter: 'International cover letter: one page, polite and direct.' },
};

const COUNTRY_HINTS = [
  ['CH', /\b(schweiz|switzerland|suisse|svizzera|zürich|zurich|basel|bern|berne|genève|geneva|lausanne|luzern|lucerne|winterthur|st\.? ?gallen|lugano|zug|aarau|biel|bienne|fribourg|neuchâtel|chur|thun|schaffhausen|solothurn|baden|olten|sion|reinach)\b|\.ch\b|\bchf\b/i],
  ['AT', /\b(österreich|austria|wien|vienna|graz|linz|salzburg|innsbruck|klagenfurt)\b|\.at\b/i],
  ['DE', /\b(deutschland|germany|berlin|münchen|munich|hamburg|köln|cologne|frankfurt|stuttgart|düsseldorf|leipzig|dresden|hannover|nürnberg|bremen|essen|dortmund|freiburg|karlsruhe|mannheim)\b|\.de\b/i],
  ['UK', /\b(united kingdom|england|scotland|wales|london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|liverpool|cambridge|oxford)\b|\buk\b|\.co\.uk\b/i],
  ['IE', /\b(ireland|dublin|cork|galway|limerick)\b|\.ie\b/i],
  ['US', /\b(united states|usa|new york|san francisco|los angeles|chicago|seattle|boston|austin|denver|atlanta|miami|washington,? dc)\b|, (ca|ny|tx|wa|ma|il|fl|co|ga)\b/i],
  ['CA', /\b(canada|toronto|vancouver|montreal|montréal|ottawa|calgary)\b/i],
  ['FR', /\b(france|paris|lyon|marseille|toulouse|bordeaux|lille|nantes|strasbourg|nice)\b|\.fr\b/i],
  ['BE', /\b(belgium|belgique|belgië|brussels|bruxelles|brussel|antwerp|anvers|gent|ghent|liège)\b|\.be\b/i],
  ['LU', /\b(luxembourg|luxemburg)\b|\.lu\b/i],
  ['NL', /\b(netherlands|nederland|amsterdam|rotterdam|utrecht|den haag|the hague|eindhoven)\b|\.nl\b/i],
  ['IT', /\b(italia|italy|milano|milan|roma|rome|torino|turin|napoli|bologna|firenze|bolzano|verona)\b|\.it\b/i],
  ['ES', /\b(españa|spain|madrid|barcelona|valencia|sevilla|bilbao|málaga)\b|\.es\b/i],
  ['PT', /\b(portugal|lisboa|lisbon|porto)\b|\.pt\b/i],
  ['NORDIC', /\b(sweden|sverige|stockholm|göteborg|denmark|danmark|copenhagen|københavn|norway|norge|oslo|finland|suomi|helsinki)\b/i],
];

/** The country whose conventions apply: the job's location first, then the candidate's. */
export function countryFor(job = {}, profile = {}) {
  for (const text of [job.location, job.company, job.url, job.description?.slice(0, 1500), profile.location]) {
    if (!text) continue;
    for (const [code, re] of COUNTRY_HINTS) if (re.test(text)) return code;
  }
  return 'DEFAULT';
}

// ---------------------------------------------------------------------------
// Kinds of jobs
// ---------------------------------------------------------------------------

const ROLES = [
  ['software', /\b(software|developer|entwickler\w*|engineer(?!ing manager)|programmer|frontend|front-end|backend|back-end|full.?stack|devops|sre|mobile|ios|android|web ?dev|qa|tester|cloud|architect|informatiker\w*|applikationsentwickler\w*)\b/i, 'Software and IT: name the stack exactly as the posting does (languages, frameworks, cloud, databases, CI/CD), with versions only if relevant. Show what was built, for how many users, performance or reliability gains, delivery speed, code quality practices (tests, reviews), and collaboration with product and design. Link GitHub or portfolio if available. Skills grouped by Languages, Frameworks, Cloud & DevOps, Tools.'],
  ['data', /\b(data|analyst|analytics|bi\b|business intelligence|machine learning|ml\b|ai engineer|scientist|statistic|controller|reporting)\b/i, 'Data and analytics: name tools (SQL, Python, R, Power BI, Tableau, dbt, Spark), the decisions the analysis changed, data volumes, automation that saved time, and stakeholders served.'],
  ['product', /\b(product (manager|owner|designer)|ux|ui designer|user research|scrum master|agile coach)\b/i, 'Product and design: outcomes for users and the business (adoption, conversion, retention, satisfaction), discovery methods, collaboration with engineering, shipped features. Portfolio link for designers.'],
  ['sales', /\b(sales|account (manager|executive)|business development|vertrieb\w*|verkauf\w*|key account|aussendienst\w*|customer success|inside sales|commercial)\b/i, 'Sales and account management: quota and attainment, revenue, new logos, deal size, pipeline, retention/upsell, territory or segment, CRM (Salesforce, HubSpot). Numbers matter most here, but only real ones.'],
  ['marketing', /\b(marketing|seo|sem|content|social media|brand|campaign|growth|communications|kommunikation\w*|pr\b)\b/i, 'Marketing and communications: channels and tools, campaign results (reach, leads, CAC, conversion, ROAS), budgets managed, content produced, brand work. Portfolio or examples if available.'],
  ['finance', /\b(finance|financial|accountant|accounting|buchhalt\w*|treuhand\w*|audit|tax|steuer\w*|treasury|fp&a|payroll|lohn\w*|bank|credit|risk|compliance)\b/i, 'Finance and accounting: standards and systems (IFRS, Swiss GAAP FER, HGB, US GAAP, SAP, Abacus, Excel), closing speed, accuracy, audits passed, savings found, controls improved, certifications (CPA, ACCA, Treuhänder, Fachausweis).'],
  ['health', /\b(nurse|nursing|pflege\w*|fage|arzt|ärztin|doctor|physician|medical|medizin\w*|therap\w*|pharma|caregiver|spitex|spital\w*|hospital|klinik\w*|care)\b/i, 'Healthcare and care: registrations and licences with exact titles (e.g. Pflegefachfrau HF, FaGe EFZ), specialties, ward or setting, patient load, procedures, quality and safety, teamwork across shifts, empathy shown through a real example.'],
  ['education', /\b(teacher|lehrer\w*|lehrperson\w*|teaching|tutor|trainer|dozent|educator|kita|kindergarten|fabe|sozialpädagog\w*)\b/i, 'Education and training: levels and subjects taught, class sizes, results or progress of learners, methods, parent and colleague collaboration, diplomas required by the canton/state.'],
  ['engineering', /\b(mechanical|electrical|civil|process|manufacturing|production|produktion\w*|maschinenbau\w*|elektro\w*|konstrukteur\w*|cad|plc|automation|quality engineer|qualität\w*|lean|six sigma)\b/i, 'Engineering and manufacturing: tools and standards (CAD, PLC, ISO 9001, GMP, lean, six sigma), projects delivered, cost or scrap reduced, uptime, safety, certifications.'],
  ['trades', /\b(electrician|elektriker\w*|installateur\w*|monteur\w*|mechaniker\w*|mechanic|plumber|sanitär|schreiner|carpenter|maler|logistik\w*|logistics|lager\w*|warehouse|driver|fahrer|chauffeur|polymechaniker|efz|eba)\b/i, 'Trades and logistics: certificates and licences first (EFZ/EBA, driving licence categories, forklift), the kinds of jobs and equipment handled, safety record, reliability, working independently and on schedule. Keep language simple and concrete.'],
  ['hospitality', /\b(hotel|restaurant|koch|cook|chef|service|kellner|barista|reception|rezeption|front office|housekeeping|retail|verkäufer\w*|store|filial|cashier|kasse)\b/i, 'Hospitality and retail: guest or customer volume, service quality and feedback, upselling, team and shift responsibilities, hygiene and cash handling, languages spoken with guests.'],
  ['legal', /\b(lawyer|anwalt\w*|rechtsanw\w*|jurist|legal|paralegal|counsel|notar)\b/i, 'Legal: admissions, practice areas, types of matters and clients, drafting and negotiation, languages of practice. Precise, formal tone.'],
  ['hr', /\b(hr\b|human resources|personal|recruit|talent|people (partner|operations)|hr business partner)\b/i, 'HR and recruiting: hires made, time-to-hire, processes built, HR systems (Workday, SAP SuccessFactors, Personio), employee relations, labour law knowledge for the country, certifications (HR-Fachfrau/-mann).'],
  ['admin', /\b(assistant|assistenz\w*|admin|office|sachbearbeit\w*|kaufm\w*|kauff\w*|clerk|secretary|sekretär\w*|reception|back office|customer service|kundendienst\w*)\b/i, 'Administration and customer service: volume handled (calls, cases, invoices), systems (MS Office, SAP, CRM), accuracy, organisation, languages, and how they made things run smoother.'],
  ['management', /\b(head of|director|\w*leiter\w*|lead\b|manager|cto|cfo|ceo|coo|vp\b|vice president|geschäftsführ\w*)\b/i, 'Leadership: team size and scope, budget, strategy set and delivered, growth or turnaround results, people developed, stakeholders and boards. Fewer, bigger bullets; outcomes over tasks.'],
];

const SENIORITY = [
  ['intern', /\b(intern|internship|praktik\w*|trainee|werkstudent|working student|stagiaire|stage|apprentice|lehrling\w*|lehrstelle\w*|ausbildung)\b/i],
  ['graduate', /\b(graduate|junior|entry.?level|berufseinsteig\w*|absolvent\w*|jr\.?)\b/i],
  ['senior', /\b(senior|sr\.?|principal|staff|expert|lead)\b/i],
  ['executive', /\b(head of|director|vp\b|vice president|chief|cto|cfo|ceo|coo|geschäftsführ\w*|managing director)\b/i],
];

const SENIORITY_RULES = {
  intern: 'Early career / internship: education, projects, internships, part-time jobs and volunteering are the evidence. Show learning speed, reliability and genuine interest in this field. One page CV.',
  graduate: 'Junior / graduate: lead with the most relevant degree, thesis, projects and internships; show what they did themselves and results, even small ones. One page CV is ideal.',
  mid: 'Experienced professional: lead with recent results in similar work; trim early or unrelated jobs.',
  senior: 'Senior: lead with scope (systems, teams, budgets), ownership and impact, mentoring others; show depth in the posting\'s core areas.',
  executive: 'Executive: lead with organisational results (growth, profitability, transformation), leadership of leaders, board and stakeholder work. Strategy plus proof of delivery.',
};

/** The kinds of job this posting is, most specific first. */
export function rolesFor(job = {}) {
  const title = job.title || '';
  const text = `${title} ${(job.description || '').slice(0, 1200)}`;
  const found = ROLES.filter(([, re]) => re.test(title));
  // The title decides; the description only helps when the title says nothing ("Mitarbeiter/in 80%").
  if (!found.length) for (const r of ROLES) if (found.length < 1 && r[1].test(text)) found.push(r);
  return found.slice(0, 2);
}

export function seniorityFor(job = {}) {
  const title = job.title || '';
  for (const [level, re] of SENIORITY) if (re.test(title)) return level;
  return 'mid';
}

/** ATS from the posting link: some read layouts and keywords more strictly. */
export function atsFor(url = '') {
  const u = String(url).toLowerCase();
  const known = [
    ['Workday', /myworkdayjobs|workday/],
    ['Greenhouse', /greenhouse\.io/],
    ['Lever', /lever\.co/],
    ['SmartRecruiters', /smartrecruiters/],
    ['SAP SuccessFactors', /successfactors|jobs\.sap|career\d*\.successfactors/],
    ['Oracle Taleo', /taleo/],
    ['iCIMS', /icims/],
    ['Personio', /personio/],
    ['Umantis (Abacus)', /umantis/],
    ['Softgarden', /softgarden/],
    ['Recruitee', /recruitee/],
    ['Teamtailor', /teamtailor/],
    ['JOIN', /join\.com/],
    ['Workable', /workable/],
  ];
  return known.find(([, re]) => re.test(u))?.[0] || '';
}

// ---------------------------------------------------------------------------
// Putting it together for a prompt
// ---------------------------------------------------------------------------

/**
 * The rules for writing this document for this job.
 * @param {'cv'|'letter'} kind
 */
export function playbookFor(kind, job = {}, profile = {}) {
  const c = COUNTRIES[countryFor(job, profile)] || COUNTRIES.DEFAULT;
  const roles = rolesFor(job);
  const level = seniorityFor(job);
  const ats = atsFor(job.url);
  return [
    '<hiring_playbook>',
    RECRUITER_FACTS,
    '',
    kind === 'cv' ? CV_RULES : LETTER_RULES,
    '',
    kind === 'cv' ? ATS_RULES : 'ATS: the letter is often stored with the CV and searched too. Use the posting\'s exact key terms where they fit naturally, never as a list.',
    '',
    `Conventions for ${c.name}: ${kind === 'cv' ? c.cv : c.letter} (Follow the language of the posting; where the candidate's data or the posting asks for something different, they win.)`,
    roles.length ? `\nFor this kind of job:\n${roles.map(([, , rule]) => `- ${rule}`).join('\n')}` : '',
    `\nLevel: ${SENIORITY_RULES[level]}`,
    ats ? `\nThis employer uses ${ats} (from the posting link). It searches CVs by exact keywords and job titles, so mirror the posting's terms where they are true.` : '',
    '',
    AI_TELLS,
    '</hiring_playbook>',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

/** The brief (from jobBrief) as a block for the writer. */
export function briefBlock(brief) {
  if (!brief) return '';
  const list = (label, v) => (Array.isArray(v) && v.length ? `${label}: ${v.join('; ')}` : '');
  return [
    '<job_brief>',
    brief.realNeed ? `What they really need: ${brief.realNeed}` : '',
    list('Must-haves', brief.mustHave),
    list('Nice to have', brief.niceToHave),
    list('Exact keywords to mirror where true', brief.keywords),
    list('Soft skills and ways of working they ask for', brief.softSkills),
    list('What they say about themselves (values, mission, team)', brief.companySignals),
    list('The letter should mention if asked in the posting', brief.letterMustAnswer),
    brief.contactPerson ? `Contact person named in the posting: ${brief.contactPerson}` : '',
    list('Candidate strengths to lead with', brief.leadWith),
    list('Gaps to bridge honestly (do not claim them)', brief.gaps),
    '</job_brief>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Facts about the company (from the company lookup) for the letter's "why this company". */
export function companyBlock(c) {
  if (!c) return '';
  const lines = [
    c.oneLiner || c.whatTheyDo ? `What they do: ${c.oneLiner || c.whatTheyDo}` : '',
    c.products?.length ? `Products/services: ${c.products.join('; ')}` : '',
    c.culture?.length ? `Culture: ${c.culture.join('; ')}` : '',
    c.news?.length ? `Recent news: ${c.news.map((n) => `${n.title}${n.date ? ` (${n.date})` : ''}`).join('; ')}` : '',
    c.talkingPoints?.length ? `Talking points: ${c.talkingPoints.join('; ')}` : '',
  ].filter(Boolean);
  return lines.length ? `<company_research>\nVerified facts about the employer, use one or two only if they genuinely connect to the candidate:\n${lines.join('\n')}\n</company_research>` : '';
}

/** What the candidate has told Vora to always do (learned from their edit requests). */
export function memoryBlock(memory = []) {
  const items = (memory || []).map((m) => (typeof m === 'string' ? m : m.rule)).filter(Boolean);
  if (!items.length) return '';
  return `<candidate_preferences>\nThe candidate asked for these before. Always follow them unless they ask otherwise now:\n${items.map((r) => `- ${r}`).join('\n')}\n</candidate_preferences>`;
}

// ---------------------------------------------------------------------------
// Checking a draft (no AI): what a recruiter or an ATS would notice
// ---------------------------------------------------------------------------

const has = (text, term) => {
  const t = String(term).toLowerCase().trim();
  if (!t) return true;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
};

/** Problems in a letter that are worth one more pass. */
export function checkLetter(text, job = {}, brief = null) {
  const issues = [];
  const words = (text.match(/\S+/g) || []).length;
  if (words > 420) issues.push(`It has ${words} words. Cut it to 250-350 words: keep the strongest proof, drop repetition.`);
  if (words < 150) issues.push(`It has only ${words} words. Add concrete proof from the CV for the main requirements (aim for 250-350 words).`);
  const company = String(job.company || '').trim();
  if (company && company.length > 2 && !text.toLowerCase().includes(company.toLowerCase().split(/\s+/)[0])) issues.push(`It never names ${company}. Name the company and give one specific reason for this employer.`);
  if (/^\s*(dear[^\n]*\n+\s*)?(i am writing|i\'m writing|my name is|ich bewerbe mich|hiermit bewerbe|mit grossem interesse|mit großem interesse|je me permets|je vous écris)/i.test(text)) issues.push('The opening is generic. Start with something specific about this role or company and why it fits.');
  if (/\[(company|name|position|job title|firma|name)\]|\{\{|lorem ipsum|xx+\b/i.test(text)) issues.push('It contains a placeholder. Use the real details or leave the part out.');
  if (brief?.keywords?.length) {
    const missing = brief.keywords.slice(0, 10).filter((k) => !has(text, k));
    if (missing.length >= Math.ceil(Math.min(brief.keywords.length, 10) * 0.7)) issues.push(`Few of the posting's key terms appear. Where the CV truly supports them, work in: ${missing.slice(0, 5).join(', ')}.`);
  }
  return issues;
}

/** Keyword coverage of a CV against the brief, for the score shown to the user. */
export function keywordCoverage(cvText, brief) {
  const kws = (brief?.keywords || []).filter(Boolean);
  if (!kws.length) return null;
  const found = kws.filter((k) => has(cvText, k));
  return { found, missing: kws.filter((k) => !found.includes(k)), pct: Math.round((found.length / kws.length) * 100) };
}
