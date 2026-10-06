// Search suggestions ("did you mean…" as you type) for the What and Where
// fields. Runs on the device from built-in lists plus the user's own data:
// their target roles, skills and location, companies they saved, and their
// recent searches, which rank first.

import { h } from './ui.js';
import { store } from './store.js';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TITLES = `
Software Engineer|Software Developer|Senior Software Engineer|Full Stack Developer|Frontend Developer|Backend Developer|Web Developer|Mobile Developer|iOS Developer|Android Developer
DevOps Engineer|Site Reliability Engineer|Cloud Engineer|Platform Engineer|Security Engineer|Cybersecurity Analyst|Network Engineer|System Administrator|IT Support Specialist|Helpdesk Technician
Data Analyst|Data Scientist|Data Engineer|Machine Learning Engineer|AI Engineer|Business Intelligence Analyst|Business Analyst|Database Administrator|QA Engineer|Test Engineer
Product Manager|Product Owner|Project Manager|Program Manager|Scrum Master|Agile Coach|IT Project Manager|Technical Lead|Engineering Manager|CTO
UX Designer|UI Designer|UX/UI Designer|Product Designer|Graphic Designer|Web Designer|Motion Designer|Art Director|Creative Director|Copywriter
Marketing Manager|Digital Marketing Specialist|Online Marketing Manager|Social Media Manager|Content Manager|SEO Specialist|Performance Marketing Manager|Brand Manager|Communications Specialist|PR Manager
Sales Manager|Account Manager|Key Account Manager|Sales Representative|Business Development Manager|Inside Sales|Customer Success Manager|Sales Assistant|Store Manager|Retail Sales Associate
Customer Service Representative|Call Center Agent|Receptionist|Office Manager|Administrative Assistant|Executive Assistant|Personal Assistant|Office Administrator|Data Entry Clerk|Secretary
Accountant|Bookkeeper|Financial Analyst|Controller|Finance Manager|Payroll Specialist|Auditor|Tax Advisor|Treasury Analyst|CFO
HR Manager|HR Business Partner|HR Specialist|Recruiter|Talent Acquisition Specialist|Payroll Administrator|Training Coordinator|People Operations|HR Assistant|Head of HR
Logistics Coordinator|Supply Chain Manager|Warehouse Worker|Forklift Driver|Truck Driver|Delivery Driver|Dispatcher|Purchasing Agent|Procurement Specialist|Operations Manager
Nurse|Registered Nurse|Care Assistant|Medical Assistant|Pharmacist|Pharmacy Assistant|Physiotherapist|Doctor|Dental Assistant|Laboratory Technician
Teacher|Primary School Teacher|Kindergarten Teacher|Teaching Assistant|Tutor|Social Worker|Childcare Worker|Caregiver|Psychologist|Lecturer
Chef|Cook|Kitchen Assistant|Waiter|Waitress|Barista|Bartender|Restaurant Manager|Hotel Receptionist|Housekeeper
Electrician|Mechanic|Car Mechanic|Plumber|Carpenter|Painter|Construction Worker|Site Manager|Architect|Civil Engineer
Mechanical Engineer|Electrical Engineer|Process Engineer|Production Worker|Machine Operator|Quality Manager|Quality Assurance Specialist|Maintenance Technician|Technician|Draftsman
Lawyer|Paralegal|Legal Counsel|Compliance Officer|Risk Manager|Consultant|Management Consultant|Analyst|Research Assistant|Scientist
Cleaner|Security Guard|Janitor|Gardener|Hairdresser|Beautician|Fitness Trainer|Photographer|Translator|Interpreter
Softwareentwickler|Informatiker|Applikationsentwickler|Fullstack Entwickler|Systemtechniker|ICT-Supporter|Projektleiter|Kaufmann|Kauffrau|Sachbearbeiter
Buchhalter|Personalfachmann|Verkäufer|Kundenberater|Logistiker|Lagermitarbeiter|Chauffeur|Pflegefachfrau|Pflegefachmann|Fachfrau Gesundheit
Polymechaniker|Elektroinstallateur|Automatiker|Koch|Servicemitarbeiter|Detailhandelsfachmann|Medizinische Praxisassistentin|Lehrer|Hauswart|Reinigungskraft
Développeur|Ingénieur logiciel|Chef de projet|Comptable|Assistant administratif|Vendeur|Infirmier|Infirmière|Employé de commerce|Responsable marketing
Sviluppatore software|Impiegato di commercio|Contabile|Infermiere|Venditore|Project manager|Addetto alle vendite|Cameriere|Cuoco|Magazziniere
`
  .trim()
  .split(/\n/)
  .flatMap((l) => l.split('|'))
  .map((x) => x.trim())
  .filter(Boolean);

// "City, Country" plus other spellings people type.
const PLACES = `
Basel, Switzerland=Bâle Basilea|Zürich, Switzerland=Zurich Zurigo|Bern, Switzerland=Berne Berna|Geneva, Switzerland=Genf Genève Ginevra|Lausanne, Switzerland|Lucerne, Switzerland=Luzern Lucerna|Lugano, Switzerland|Winterthur, Switzerland|St. Gallen, Switzerland=St Gallen Saint-Gall|Biel/Bienne, Switzerland=Biel Bienne
Thun, Switzerland|Zug, Switzerland=Zoug|Aarau, Switzerland|Baden, Switzerland|Olten, Switzerland|Solothurn, Switzerland=Soleure|Schaffhausen, Switzerland|Chur, Switzerland|Fribourg, Switzerland=Freiburg|Neuchâtel, Switzerland=Neuenburg
Sion, Switzerland=Sitten|Liestal, Switzerland|Allschwil, Switzerland|Pratteln, Switzerland|Muttenz, Switzerland|Riehen, Switzerland|Reinach BL, Switzerland|Bellinzona, Switzerland|Montreux, Switzerland|Yverdon-les-Bains, Switzerland
Berlin, Germany|Munich, Germany=München|Hamburg, Germany|Frankfurt, Germany=Frankfurt am Main|Cologne, Germany=Köln|Stuttgart, Germany|Düsseldorf, Germany|Leipzig, Germany|Dresden, Germany|Freiburg im Breisgau, Germany
Hanover, Germany=Hannover|Nuremberg, Germany=Nürnberg|Karlsruhe, Germany|Mannheim, Germany|Bonn, Germany|Lörrach, Germany|Konstanz, Germany|Essen, Germany|Dortmund, Germany|Bremen, Germany
Vienna, Austria=Wien|Graz, Austria|Linz, Austria|Salzburg, Austria|Innsbruck, Austria|Paris, France|Lyon, France|Marseille, France|Toulouse, France|Strasbourg, France
Mulhouse, France|Saint-Louis, France|Lille, France|Bordeaux, France|Nantes, France|Nice, France|Milan, Italy=Milano|Rome, Italy=Roma|Turin, Italy=Torino|Como, Italy
Madrid, Spain|Barcelona, Spain|Valencia, Spain|Seville, Spain=Sevilla|Lisbon, Portugal=Lisboa|Porto, Portugal|Braga, Portugal|London, United Kingdom|Manchester, United Kingdom|Edinburgh, United Kingdom
Amsterdam, Netherlands|Rotterdam, Netherlands|The Hague, Netherlands=Den Haag|Utrecht, Netherlands|Eindhoven, Netherlands|Brussels, Belgium=Bruxelles Brussel|Antwerp, Belgium=Antwerpen|Dublin, Ireland|Copenhagen, Denmark=København|Stockholm, Sweden
Oslo, Norway|Helsinki, Finland|Warsaw, Poland=Warszawa|Kraków, Poland=Krakow|Prague, Czechia=Praha|Budapest, Hungary|Luxembourg, Luxembourg|New York, United States|San Francisco, United States|Los Angeles, United States
Chicago, United States|Boston, United States|Seattle, United States|Austin, United States|Toronto, Canada|Vancouver, Canada|Montreal, Canada=Montréal|Sydney, Australia|Melbourne, Australia|Auckland, New Zealand
São Paulo, Brazil=Sao Paulo|Rio de Janeiro, Brazil|Belo Horizonte, Brazil|Mexico City, Mexico=Ciudad de México CDMX|Dubai, United Arab Emirates|Abu Dhabi, United Arab Emirates|Singapore, Singapore|Bangalore, India=Bengaluru|Mumbai, India|Cape Town, South Africa
Switzerland=Schweiz Suisse Svizzera|Germany=Deutschland Allemagne|Austria=Österreich|France=Frankreich|Italy=Italien Italia|Spain=Spanien España|Portugal|United Kingdom=UK England|Netherlands=Niederlande|Belgium=Belgien
Ireland|Denmark|Sweden|Norway|Finland|Poland|United States=USA|Canada|Australia|Brazil=Brasil
Remote=Homeoffice Home office Télétravail Remoto
`
  .trim()
  .split(/\n/)
  .flatMap((l) => l.split('|'))
  .map((x) => {
    const [label, alt = ''] = x.split('=');
    return { label: label.trim(), alt: alt.trim() };
  })
  .filter((x) => x.label);

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** 0 = no match; higher = better. Whole-string prefix > word prefix > inside a word. */
function score(text, q) {
  const t = norm(text);
  if (!q) return 1;
  if (t.startsWith(q)) return 4;
  if (t.split(/[\s,/()-]+/).some((w) => w.startsWith(q))) return 3;
  // Every typed word starts a word in the text ("full dev" → "Full Stack Developer").
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => t.split(/[\s,/()-]+/).some((x) => x.startsWith(w)))) return 2.5;
  if (q.length >= 3 && t.includes(q)) return 2;
  return 0;
}

// Recent searches, newest first.
const RECENT_KEY = 'ajh:recent';
function recent() {
  try {
    return { what: [], where: [], ...JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') };
  } catch {
    return { what: [], where: [] };
  }
}
/** Remember a search so it is suggested first next time. */
export function rememberSearch({ query = '', location = '' }) {
  const r = recent();
  const add = (list, v) => (v ? [v, ...list.filter((x) => norm(x) !== norm(v))].slice(0, 8) : list);
  r.what = add(r.what, query.trim());
  r.where = add(r.where, location.trim());
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch {}
}

const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Suggestions for the What field: [{ text, tag }] */
function whatSuggestions(input) {
  const q = norm(input.trim());
  const s = store.get();
  const companies = [...new Set(Object.values(s.jobs).map((j) => j.company).filter(Boolean))];
  const pools = [
    [recent().what, 'Recent', 3],
    [split(s.profile.targetRoles), 'Your roles', 2.5],
    [split(s.profile.skills), 'Skill', 1],
    [companies, 'Company', 0.5],
    [TITLES, '', 0],
  ];
  return rank(pools, q, input);
}

/** Suggestions for the Where field. */
function whereSuggestions(input) {
  const q = norm(input.trim());
  const own = store.get().profile.location;
  const pools = [
    [recent().where, 'Recent', 3],
    [own ? [own] : [], 'Your location', 2.5],
    [PLACES, '', 0],
  ];
  // "Basel" and "Basel, Switzerland" are the same place.
  return rank(pools, q, input, (t) => norm(t).split(',')[0].trim());
}

function rank(pools, q, raw, keyOf = norm) {
  const seen = new Set();
  const out = [];
  for (const [items, tag, boost] of pools) {
    for (const item of items) {
      const text = typeof item === 'string' ? item : item.label;
      const alt = typeof item === 'string' ? '' : item.alt;
      const key = keyOf(text);
      if (!text || seen.has(key)) continue;
      // With an empty field only the user's own items are offered.
      if (!q && !tag) continue;
      const sc = Math.max(score(text, q), alt ? score(alt, q) * 0.95 : 0);
      if (!sc) continue;
      seen.add(key);
      out.push({ text, tag, sc: sc + boost });
    }
  }
  // Don't suggest exactly what is already typed and nothing else.
  const list = out.sort((a, b) => b.sc - a.sc || a.text.length - b.text.length).slice(0, 7);
  return list.length === 1 && norm(list[0].text) === norm(raw.trim()) ? [] : list;
}

// ---------------------------------------------------------------------------
// Combobox
// ---------------------------------------------------------------------------

let uid = 0;

/**
 * Turn a text input into a combobox with a suggestion list.
 * @param {HTMLInputElement} input
 * @param {'what'|'where'} kind
 * @param {(text: string) => void} [onPick]
 */
export function attachSuggest(input, kind, onPick) {
  const id = `sg-${++uid}`;
  const list = h('ul', { class: 'suggest', id, role: 'listbox', hidden: true });
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-expanded', 'false');
  input.after(list);

  let items = [];
  let active = -1;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function highlight(text, q) {
    const i = q ? norm(text).indexOf(q) : -1;
    if (i < 0) return text;
    return [text.slice(0, i), h('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }
  function open() {
    const value = input.value;
    items = kind === 'what' ? whatSuggestions(value) : whereSuggestions(value);
    if (!items.length) return close();
    const q = norm(value.trim());
    active = -1;
    list.replaceChildren(
      ...items.map((it, i) => {
        const li = h(
          'li',
          { id: `${id}-${i}`, role: 'option', 'aria-selected': 'false' },
          h('span', { class: 'suggest-text', translate: 'no' }, highlight(it.text, q)),
          it.tag ? h('span', { class: 'suggest-tag' }, it.tag) : '',
        );
        // pointerdown, not click: picks before the input loses focus.
        li.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          pick(i);
        });
        return li;
      }),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function move(step) {
    if (list.hidden) open();
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', `${id}-${active}`);
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  function pick(i) {
    const it = items[i];
    if (!it) return;
    input.value = it.text;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onPick?.(it.text);
  }

  input.addEventListener('input', (e) => {
    if (e.isTrusted) open();
  });
  input.addEventListener('focus', open);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter' && !list.hidden && active >= 0) {
      e.preventDefault(); // take the suggestion, don't submit yet
      pick(active);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab' && !list.hidden && active >= 0) {
      pick(active);
    }
  });
  return { close };
}
