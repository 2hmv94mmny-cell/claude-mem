// Job portals by country, with each portal's own search URL so the user can
// open the full listings for their search and location in one tap.
// {q} = keywords, {l} = location, {qs}/{ls} = hyphenated slugs.

const enc = encodeURIComponent;
const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const GLOBAL = [
  { name: 'LinkedIn', domain: 'linkedin.com', url: 'https://www.linkedin.com/jobs/search/?keywords={q}&location={l}' },
  { name: 'Google Jobs', domain: 'google.com', url: 'https://www.google.com/search?q={q}+jobs+{l}&ibp=htl;jobs', live: false },
  { name: 'Glassdoor', domain: 'glassdoor.com', url: 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword={q}' },
];

const indeed = (sub) => ({ name: 'Indeed', domain: `${sub === 'www' ? '' : sub + '.'}indeed.com`, url: `https://${sub}.indeed.com/jobs?q={q}&l={l}` });

export const COUNTRIES = {
  US: { name: 'United States', portals: [indeed('www'), { name: 'ZipRecruiter', domain: 'ziprecruiter.com', url: 'https://www.ziprecruiter.com/jobs-search?search={q}&location={l}' }, { name: 'Monster', domain: 'monster.com', url: 'https://www.monster.com/jobs/search?q={q}&where={l}' }, { name: 'Dice', domain: 'dice.com', url: 'https://www.dice.com/jobs?q={q}&location={l}' }, { name: 'USAJobs', domain: 'usajobs.gov', url: 'https://www.usajobs.gov/Search/Results?k={q}&l={l}' }, { name: 'SimplyHired', domain: 'simplyhired.com', url: 'https://www.simplyhired.com/search?q={q}&l={l}' }] },
  GB: { name: 'United Kingdom', portals: [indeed('uk'), { name: 'Reed', domain: 'reed.co.uk', url: 'https://www.reed.co.uk/jobs/{qs}-jobs-in-{ls}' }, { name: 'Totaljobs', domain: 'totaljobs.com', url: 'https://www.totaljobs.com/jobs/{qs}/in-{ls}' }, { name: 'CV-Library', domain: 'cv-library.co.uk', url: 'https://www.cv-library.co.uk/{qs}-jobs-in-{ls}' }, { name: 'Find a job (GOV.UK)', domain: 'findajob.dwp.gov.uk', url: 'https://findajob.dwp.gov.uk/search?q={q}&w={l}' }] },
  DE: { name: 'Germany', portals: [indeed('de'), { name: 'StepStone', domain: 'stepstone.de', url: 'https://www.stepstone.de/jobs/{qs}/in-{ls}' }, { name: 'Bundesagentur für Arbeit', domain: 'arbeitsagentur.de', url: 'https://www.arbeitsagentur.de/jobsuche/suche?was={q}&wo={l}' }, { name: 'XING', domain: 'xing.com', url: 'https://www.xing.com/jobs/search?keywords={q}&location={l}' }, { name: 'Jobware', domain: 'jobware.de', url: 'https://www.jobware.de/jobsuche?jw_jobname={q}&jw_jobort={l}' }] },
  NL: { name: 'Netherlands', portals: [indeed('nl'), { name: 'Nationale Vacaturebank', domain: 'nationalevacaturebank.nl', url: 'https://www.nationalevacaturebank.nl/vacature/zoeken?query={q}&location={l}' }, { name: 'Werk.nl', domain: 'werk.nl', url: 'https://www.werk.nl/vacatures/?zoekterm={q}&plaats={l}' }, { name: 'Monsterboard', domain: 'monsterboard.nl', url: 'https://www.monsterboard.nl/vacatures/zoeken?q={q}&where={l}' }, { name: 'Jobbird', domain: 'jobbird.com', url: 'https://www.jobbird.com/nl/vacature?s={q}&rad_location={l}' }] },
  BE: { name: 'Belgium', portals: [indeed('be'), { name: 'VDAB', domain: 'vdab.be', url: 'https://www.vdab.be/vindeenjob/vacatures?trefwoord={q}&locatie={l}' }, { name: 'StepStone', domain: 'stepstone.be', url: 'https://www.stepstone.be/jobs/{qs}/in-{ls}' }, { name: 'Jobat', domain: 'jobat.be', url: 'https://www.jobat.be/nl/jobs/results?keyword={q}&location={l}' }] },
  FR: { name: 'France', portals: [indeed('fr'), { name: 'France Travail', domain: 'francetravail.fr', url: 'https://candidat.francetravail.fr/offres/recherche?motsCles={q}' }, { name: 'Welcome to the Jungle', domain: 'welcometothejungle.com', url: 'https://www.welcometothejungle.com/fr/jobs?query={q}' }, { name: 'APEC', domain: 'apec.fr', url: 'https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles={q}' }, { name: 'HelloWork', domain: 'hellowork.com', url: 'https://www.hellowork.com/fr-fr/emploi/recherche.html?k={q}&l={l}' }] },
  ES: { name: 'Spain', portals: [indeed('es'), { name: 'InfoJobs', domain: 'infojobs.net', url: 'https://www.infojobs.net/jobsearch/search-results/list.xhtml?keyword={q}' }, { name: 'Tecnoempleo', domain: 'tecnoempleo.com', url: 'https://www.tecnoempleo.com/busqueda-empleo.php?te={q}' }] },
  IT: { name: 'Italy', portals: [indeed('it'), { name: 'InfoJobs', domain: 'infojobs.it', url: 'https://www.infojobs.it/offerte-lavoro?keyword={q}' }, { name: 'Subito Lavoro', domain: 'subito.it', url: 'https://www.subito.it/annunci-italia/vendita/offerte-lavoro/?q={q}' }] },
  PT: { name: 'Portugal', portals: [indeed('pt'), { name: 'Net-Empregos', domain: 'net-empregos.com', url: 'https://www.net-empregos.com/pesquisa-empregos.asp?chaves={q}' }] },
  CH: { name: 'Switzerland', portals: [indeed('ch'), { name: 'jobs.ch', domain: 'jobs.ch', url: 'https://www.jobs.ch/en/vacancies/?term={q}&location={l}' }, { name: 'jobup.ch', domain: 'jobup.ch', url: 'https://www.jobup.ch/en/jobs/?term={q}&location={l}' }, { name: 'XING', domain: 'xing.com', url: 'https://www.xing.com/jobs/search?keywords={q}&location={l}' }] },
  AT: { name: 'Austria', portals: [indeed('at'), { name: 'karriere.at', domain: 'karriere.at', url: 'https://www.karriere.at/jobs/{qs}/{ls}' }, { name: 'AMS', domain: 'ams.at', url: 'https://jobs.ams.at/public/emps/jobs?query={q}&location={l}' }, { name: 'StepStone', domain: 'stepstone.at', url: 'https://www.stepstone.at/jobs/{qs}/in-{ls}' }, { name: 'XING', domain: 'xing.com', url: 'https://www.xing.com/jobs/search?keywords={q}&location={l}' }] },
  IE: { name: 'Ireland', portals: [indeed('ie'), { name: 'IrishJobs', domain: 'irishjobs.ie', url: 'https://www.irishjobs.ie/jobs/{qs}/in-{ls}' }, { name: 'Jobs.ie', domain: 'jobs.ie', url: 'https://www.jobs.ie/jobs/{qs}/in-{ls}' }] },
  SE: { name: 'Sweden', portals: [indeed('se'), { name: 'Platsbanken', domain: 'arbetsformedlingen.se', url: 'https://arbetsformedlingen.se/platsbanken/annonser?q={q}' }] },
  DK: { name: 'Denmark', portals: [indeed('dk'), { name: 'Jobindex', domain: 'jobindex.dk', url: 'https://www.jobindex.dk/jobsoegning?q={q}' }] },
  NO: { name: 'Norway', portals: [indeed('no'), { name: 'FINN jobb', domain: 'finn.no', url: 'https://www.finn.no/job/fulltime/search.html?q={q}' }, { name: 'NAV', domain: 'arbeidsplassen.nav.no', url: 'https://arbeidsplassen.nav.no/stillinger?q={q}' }] },
  FI: { name: 'Finland', portals: [{ name: 'Duunitori', domain: 'duunitori.fi', url: 'https://duunitori.fi/tyopaikat?haku={q}&alue={l}' }, { name: 'Työmarkkinatori', domain: 'tyomarkkinatori.fi', url: 'https://tyomarkkinatori.fi/henkiloasiakkaat/avoimet-tyopaikat?q={q}' }] },
  PL: { name: 'Poland', portals: [indeed('pl'), { name: 'Pracuj.pl', domain: 'pracuj.pl', url: 'https://www.pracuj.pl/praca/{q};kw/{l};wp' }, { name: 'Just Join IT', domain: 'justjoin.it', url: 'https://justjoin.it/?keyword={q}' }] },
  CA: { name: 'Canada', portals: [indeed('ca'), { name: 'Job Bank', domain: 'jobbank.gc.ca', url: 'https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring={q}&locationstring={l}' }, { name: 'Workopolis', domain: 'workopolis.com', url: 'https://www.workopolis.com/jobsearch/find-jobs?ak={q}&l={l}' }] },
  AU: { name: 'Australia', portals: [indeed('au'), { name: 'SEEK', domain: 'seek.com.au', url: 'https://www.seek.com.au/{qs}-jobs/in-{ls}' }, { name: 'Jora', domain: 'jora.com', url: 'https://au.jora.com/j?q={q}&l={l}' }, { name: 'Workforce Australia', domain: 'workforceaustralia.gov.au', url: 'https://www.workforceaustralia.gov.au/individuals/jobs/search?searchText={q}' }] },
  NZ: { name: 'New Zealand', portals: [{ name: 'SEEK', domain: 'seek.co.nz', url: 'https://www.seek.co.nz/{qs}-jobs/in-{ls}' }, { name: 'Trade Me Jobs', domain: 'trademe.co.nz', url: 'https://www.trademe.co.nz/a/jobs/search?search_string={q}' }] },
  IN: { name: 'India', portals: [indeed('in'), { name: 'Naukri', domain: 'naukri.com', url: 'https://www.naukri.com/{qs}-jobs-in-{ls}' }, { name: 'foundit', domain: 'foundit.in', url: 'https://www.foundit.in/srp/results?query={q}&locations={l}' }, { name: 'Shine', domain: 'shine.com', url: 'https://www.shine.com/job-search/{qs}-jobs-in-{ls}' }] },
  SG: { name: 'Singapore', portals: [indeed('sg'), { name: 'MyCareersFuture', domain: 'mycareersfuture.gov.sg', url: 'https://www.mycareersfuture.gov.sg/search?search={q}' }, { name: 'JobStreet', domain: 'jobstreet.com.sg', url: 'https://www.jobstreet.com.sg/{qs}-jobs' }] },
  AE: { name: 'United Arab Emirates', portals: [indeed('ae'), { name: 'Bayt', domain: 'bayt.com', url: 'https://www.bayt.com/en/uae/jobs/{qs}-jobs/' }, { name: 'GulfTalent', domain: 'gulftalent.com', url: 'https://www.gulftalent.com/jobs/search?keywords={q}' }, { name: 'Naukrigulf', domain: 'naukrigulf.com', url: 'https://www.naukrigulf.com/{qs}-jobs' }] },
  ZA: { name: 'South Africa', portals: [indeed('za'), { name: 'PNet', domain: 'pnet.co.za', url: 'https://www.pnet.co.za/jobs/{qs}/in-{ls}' }, { name: 'Careers24', domain: 'careers24.com', url: 'https://www.careers24.com/jobs/kw-{qs}/' }] },
  BR: { name: 'Brazil', portals: [indeed('br'), { name: 'Catho', domain: 'catho.com.br', url: 'https://www.catho.com.br/vagas/{qs}/' }, { name: 'Vagas.com', domain: 'vagas.com.br', url: 'https://www.vagas.com.br/vagas-de-{qs}' }] },
  MX: { name: 'Mexico', portals: [indeed('mx'), { name: 'OCC', domain: 'occ.com.mx', url: 'https://www.occ.com.mx/empleos/de-{qs}/' }, { name: 'Computrabajo', domain: 'computrabajo.com', url: 'https://mx.computrabajo.com/trabajo-de-{qs}' }] },
};

export const REMOTE = [
  { name: 'Remotive', domain: 'remotive.com', url: 'https://remotive.com/remote-jobs?query={q}' },
  { name: 'We Work Remotely', domain: 'weworkremotely.com', url: 'https://weworkremotely.com/remote-jobs/search?term={q}' },
  { name: 'Wellfound', domain: 'wellfound.com', url: 'https://wellfound.com/role/{qs}' },
];

// Country names, common spellings and major cities → country code.
const ALIASES = {
  US: 'usa united states america new york nyc san francisco los angeles chicago boston seattle austin denver atlanta miami dallas houston washington dc philadelphia phoenix san diego portland',
  GB: 'uk united kingdom great britain england scotland wales london manchester birmingham leeds glasgow edinburgh bristol liverpool cambridge oxford belfast',
  DE: 'germany deutschland berlin munich münchen hamburg frankfurt cologne köln stuttgart düsseldorf dusseldorf leipzig dresden hannover nuremberg nürnberg',
  NL: 'netherlands nederland holland amsterdam rotterdam the hague den haag utrecht eindhoven groningen leiden haarlem arnhem nijmegen tilburg breda almere',
  BE: 'belgium belgië belgique brussels brussel bruxelles antwerp antwerpen ghent gent leuven liège bruges',
  FR: 'france paris lyon marseille toulouse nice nantes bordeaux lille strasbourg montpellier rennes',
  ES: 'spain españa madrid barcelona valencia seville sevilla bilbao malaga málaga',
  IT: 'italy italia rome roma milan milano turin torino naples napoli florence firenze bologna',
  PT: 'portugal lisbon lisboa porto braga',
  CH: 'switzerland schweiz suisse zurich zürich geneva genève basel bern lausanne zug',
  AT: 'austria österreich vienna wien graz linz salzburg innsbruck',
  IE: 'ireland dublin cork galway limerick',
  SE: 'sweden sverige stockholm gothenburg göteborg malmö malmo uppsala',
  DK: 'denmark danmark copenhagen københavn aarhus odense',
  NO: 'norway norge oslo bergen trondheim stavanger',
  FI: 'finland suomi helsinki espoo tampere turku',
  PL: 'poland polska warsaw warszawa krakow kraków wroclaw wrocław gdansk gdańsk poznan poznań',
  CA: 'canada toronto vancouver montreal montréal calgary ottawa edmonton winnipeg quebec',
  AU: 'australia sydney melbourne brisbane perth adelaide canberra',
  NZ: 'new zealand auckland wellington christchurch',
  IN: 'india bangalore bengaluru mumbai delhi new delhi hyderabad chennai pune kolkata gurgaon gurugram noida',
  SG: 'singapore',
  AE: 'uae united arab emirates dubai abu dhabi sharjah',
  ZA: 'south africa johannesburg cape town durban pretoria',
  BR: 'brazil brasil são paulo sao paulo rio de janeiro belo horizonte',
  MX: 'mexico méxico mexico city cdmx guadalajara monterrey',
};

const US_STATES = /\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)$/i;

/** Best guess at the country code for a free-text location, or null. */
export function detectCountry(location = '') {
  const loc = ` ${location.toLowerCase().replace(/[,()/]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (!loc.trim()) return null;
  // Longest alias first so "new zealand" beats "new" style partials.
  let best = null;
  for (const [code, list] of Object.entries(ALIAS_LISTS)) {
    for (const a of list) {
      if (loc.includes(` ${a} `) && (!best || a.length > best.len)) best = { code, len: a.length };
    }
  }
  if (best) return best.code;
  const tail = location.trim().split(/[\s,]+/).pop();
  if (tail && tail.length === 2 && US_STATES.test(tail)) return 'US';
  return null;
}

// Multi-word aliases are listed explicitly; everything else is single words.
const MULTI = ['united states', 'new york', 'san francisco', 'los angeles', 'washington dc', 'san diego', 'united kingdom', 'great britain', 'the hague', 'den haag', 'new delhi', 'abu dhabi', 'united arab emirates', 'cape town', 'south africa', 'new zealand', 'são paulo', 'sao paulo', 'rio de janeiro', 'belo horizonte', 'mexico city'];
const ALIAS_LISTS = Object.fromEntries(
  Object.entries(ALIASES).map(([code, words]) => {
    let rest = ` ${words} `;
    const list = [];
    for (const m of MULTI) {
      if (rest.includes(` ${m} `)) {
        list.push(m);
        rest = rest.replace(` ${m} `, ' ');
      }
    }
    list.push(...rest.trim().split(/\s+/).filter(Boolean));
    return [code, list];
  }),
);

function fill(template, q, l) {
  return template
    .replaceAll('{q}', enc(q))
    .replaceAll('{l}', enc(l))
    .replaceAll('{qs}', slug(q) || 'jobs')
    .replaceAll('{ls}', slug(l));
}

/**
 * Portals to search for a query and location.
 * @returns {{country: string|null, countryName: string, portals: {name, domain, url, live}[]}}
 */
export function portalsFor(query, location, { remote = false, country } = {}) {
  const code = country || detectCountry(location);
  const local = code && COUNTRIES[code] ? COUNTRIES[code].portals : [];
  const list = [...local, ...GLOBAL, ...(remote || !code ? REMOTE : [])];
  const seen = new Set();
  return {
    country: code,
    countryName: code && COUNTRIES[code] ? COUNTRIES[code].name : '',
    portals: list
      .filter((p) => !seen.has(p.name) && seen.add(p.name))
      .map((p) => {
        // Slug URLs need a location; fall back to a keyword-only search.
        const url = !location && p.url.includes('{ls}') ? p.url.replace(/[-/]?in-\{ls\}|\/\{ls\}/, '') : p.url;
        return { name: p.name, domain: p.domain, url: fill(url, query, location), live: p.live !== false };
      }),
  };
}

/** Name of the portal a job URL belongs to, from the known list. */
export function portalForUrl(url) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
  for (const c of Object.values(COUNTRIES)) {
    for (const p of c.portals) if (host === p.domain || host.endsWith('.' + p.domain)) return p.name;
  }
  for (const p of [...GLOBAL, ...REMOTE]) if (host === p.domain || host.endsWith('.' + p.domain)) return p.name;
  if (host.includes('indeed.')) return 'Indeed';
  if (/greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|recruitee\.com|personio\.(de|com)|teamtailor\.com/.test(host)) return 'Company careers page';
  return host;
}
