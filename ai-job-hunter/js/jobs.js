// Job sources. The public boards below are free, need no key and allow
// cross-origin requests. Each source fails independently so one outage
// never breaks the search.

const SOURCES = {
  remotive: {
    label: 'Remotive',
    async search(q) {
      const url = `https://remotive.com/api/remote-jobs?limit=40${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const data = await getJSON(url);
      return (data.jobs || []).map((j) => ({
        id: `remotive:${j.id}`,
        source: 'Remotive',
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || 'Remote',
        remote: true,
        url: j.url,
        salary: j.salary || '',
        posted: j.publication_date ? j.publication_date.slice(0, 10) : '',
        tags: (j.tags || []).slice(0, 6),
        description: htmlToText(j.description),
      }));
    },
  },
  arbeitnow: {
    label: 'Arbeitnow',
    async search(q) {
      const data = await getJSON('https://www.arbeitnow.com/api/job-board-api');
      const terms = tokenize(q);
      return (data.data || [])
        .map((j) => ({
          id: `arbeitnow:${j.slug}`,
          source: 'Arbeitnow',
          title: j.title,
          company: j.company_name,
          location: j.location || (j.remote ? 'Remote' : ''),
          remote: Boolean(j.remote),
          url: j.url,
          salary: '',
          posted: j.created_at ? new Date(j.created_at * 1000).toISOString().slice(0, 10) : '',
          tags: (j.tags || []).slice(0, 6),
          description: htmlToText(j.description),
        }))
        .filter((j) => matches(j, terms));
    },
  },
};

export const SOURCE_IDS = Object.keys(SOURCES);
export const sourceLabel = (id) => SOURCES[id]?.label ?? id;

/**
 * Search all enabled sources in parallel.
 * @returns {Promise<{jobs: object[], errors: string[]}>}
 */
export async function searchJobs({ query = '', location = '', remoteOnly = false, sources = SOURCE_IDS }) {
  const results = await Promise.allSettled(sources.map((id) => SOURCES[id].search(query.trim())));
  const errors = [];
  let jobs = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') jobs.push(...r.value);
    else errors.push(`${sourceLabel(sources[i])} unavailable`);
  });

  if (jobs.length === 0 && errors.length === sources.length) {
    // Offline or all boards blocked: fall back to demo data so the app is still explorable.
    jobs = DEMO_JOBS.filter((j) => matches(j, tokenize(query)));
    errors.push('Showing demo listings');
  }

  const loc = location.trim().toLowerCase();
  if (loc) jobs = jobs.filter((j) => j.remote || (j.location || '').toLowerCase().includes(loc));
  if (remoteOnly) jobs = jobs.filter((j) => j.remote || /remote|anywhere|worldwide/i.test(j.location));

  // De-duplicate across boards by company + title.
  const seen = new Set();
  jobs = jobs.filter((j) => {
    const k = `${j.company}|${j.title}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { jobs, errors };
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Convert untrusted job-board HTML to plain text without ever executing it. */
export function htmlToText(html = '') {
  const doc = new DOMParser().parseFromString(
    String(html).replace(/<\/(p|div|li|h\d)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n'),
    'text/html',
  );
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function tokenize(q = '') {
  return q.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

function matches(job, terms) {
  if (!terms.length) return true;
  const hay = `${job.title} ${job.company} ${job.tags.join(' ')} ${job.description}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

const DEMO_JOBS = [
  {
    id: 'demo:1',
    source: 'Demo',
    title: 'Senior Frontend Engineer (React)',
    company: 'Northwind Labs',
    location: 'Remote (EU)',
    remote: true,
    url: '',
    salary: '€70k – €90k',
    posted: '',
    tags: ['react', 'typescript', 'design systems'],
    description:
      'Build and own our customer-facing web app. You will lead work on our React + TypeScript design system, improve performance and accessibility, and mentor two mid-level engineers. 5+ years of frontend experience required; testing (Playwright, Vitest) and GraphQL are a plus.',
  },
  {
    id: 'demo:2',
    source: 'Demo',
    title: 'Data Analyst',
    company: 'Greenfield Energy',
    location: 'London, UK (Hybrid)',
    remote: false,
    url: '',
    salary: '£45k – £55k',
    posted: '',
    tags: ['sql', 'python', 'tableau'],
    description:
      'Turn operational data into decisions. Own dashboards in Tableau, write production SQL against our warehouse, and partner with operations to model demand. Strong SQL and Python required; experience in energy or utilities is a bonus.',
  },
  {
    id: 'demo:3',
    source: 'Demo',
    title: 'Product Manager, Growth',
    company: 'Brightpath',
    location: 'Remote (US)',
    remote: true,
    url: '',
    salary: '$130k – $155k',
    posted: '',
    tags: ['product', 'experimentation', 'b2c'],
    description:
      'Own the activation and retention funnel for our consumer app. Define experiments, work with design and engineering to ship weekly, and report impact to leadership. 3+ years in product management with a track record of running A/B tests.',
  },
  {
    id: 'demo:4',
    source: 'Demo',
    title: 'Backend Engineer (Python / Django)',
    company: 'Ledgerly',
    location: 'Berlin, Germany',
    remote: false,
    url: '',
    salary: '€65k – €80k',
    posted: '',
    tags: ['python', 'django', 'postgres', 'fintech'],
    description:
      'Design and build APIs for our accounting platform. Python/Django, PostgreSQL, Celery, AWS. You care about correctness, observability and clean data models. Fintech experience welcome but not required.',
  },
  {
    id: 'demo:5',
    source: 'Demo',
    title: 'UX Designer',
    company: 'Civic Studio',
    location: 'Remote',
    remote: true,
    url: '',
    salary: '',
    posted: '',
    tags: ['figma', 'user research', 'accessibility'],
    description:
      'Design accessible digital services for public-sector clients. Run user research, prototype in Figma, and work closely with developers through delivery. A portfolio showing end-to-end process is essential.',
  },
  {
    id: 'demo:6',
    source: 'Demo',
    title: 'Customer Success Manager',
    company: 'Stackwise',
    location: 'Toronto, Canada (Hybrid)',
    remote: false,
    url: '',
    salary: 'CA$75k – CA$90k',
    posted: '',
    tags: ['saas', 'onboarding', 'retention'],
    description:
      'Own a portfolio of mid-market SaaS accounts. Lead onboarding, run quarterly business reviews, and drive renewals and expansion. 2+ years in customer success or account management at a SaaS company.',
  },
];
