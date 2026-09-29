// ============================================================
//  SITE CONTENT — edit everything here. One file, plain text.
//  Projects live in ./projects.ts.
// ============================================================

export const site = {
  // — Identity ————————————————————————————————————————————————
  name: 'Tyler Warburton',
  domain: 'tylerw.ai',
  eyebrow: 'Fractional CTO · AI & Security',
  headline: 'I build companies with AI.',
  tagline:
    'I help companies adopt AI securely. Founder of CipherPlay, fractional CTO at ATC, AutoGrow, and RandAO, ex-Lockheed Martin. I ship SaaS, crypto protocols, and hardware.',
  description:
    'Tyler Warburton: fractional CTO helping companies adopt AI securely. Founder of CipherPlay; fractional CTO at ATC, AutoGrow, and RandAO. Two-time ISACA CommunITy Day keynote speaker. Ex-Lockheed Martin.',

  // — Primary call to action —————————————————————————————————
  cta: { label: 'Book a call', href: '#book' },

  // — AI token usage (lifetime, approximate) —————————————————
  //   value is raw tokens, shown as "at least" (e.g. 400B+).
  tokens: {
    asOf: 'Sep 2026',
    sources: [
      { key: 'claude', label: 'Claude', value: 400e9, color: '#d97757' },
      { key: 'openai', label: 'OpenAI', value: 200e9, color: '#5b8def' },
      { key: 'openrouter', label: 'OpenRouter', value: 750e6, color: '#a78bfa' },
      { key: 'local', label: 'Local models', value: 300e6, color: '#4ade80' },
    ],
  },

  // — Experience fallback ——————————————————————————————————
  //   Used until a LinkedIn Positions.csv is dropped in src/data/linkedin/.
  //   `href`, `linkedin`, and `note` also enrich matching rows by company name.
  companies: [
    {
      name: 'American Technical Consultants',
      role: 'CTO (Fractional)',
      start: 'Aug 2026',
      end: '',
      linkedin: 'https://www.linkedin.com/company/108616645/',
      note: 'Leading technology strategy, engineering, and secure AI adoption.',
    },
    {
      name: 'AutoGrow',
      role: 'CTO (Fractional)',
      start: 'Mar 2026',
      end: '',
      href: 'https://useautogrow.com',
      linkedin: 'https://www.linkedin.com/company/144697947/',
      note: 'Research agents and hyper-personalized outreach: find the right people, then reach them.',
    },
    {
      name: 'CipherPlay',
      role: 'Founder',
      start: '2024',
      end: '',
      href: 'https://cipherplay.net',
      linkedin: 'https://www.linkedin.com/company/105990131/',
      note: 'Building secure, fair systems for the modern web. Home of HeyHauler, BreederOps, Paralith, and Opportunity.',
    },
    {
      name: 'RandAO',
      role: 'CTO (Fractional)',
      start: '2024',
      end: '',
      href: 'https://randao.net',
      note: 'Decentralized verifiable randomness for AO.',
    },
    {
      name: 'Lockheed Martin',
      role: 'Senior Software Developer',
      start: '',
      end: '',
      note: 'Led DevSecOps on mission-critical defense systems with the U.S. Navy.',
    },
    {
      name: 'Lockheed Martin',
      role: 'Software Engineering Intern',
      start: '',
      end: '',
      note: 'Where it started: intern to senior developer.',
    },
  ],

  // — Public work: talks, education, community ——————————————
  speaking: {
    intro:
      'Two-time keynote speaker at ISACA CommunITy Day. I speak about AI around Richmond and teach people to use it well: what is real, what is hype, and where the security risks are. For business leaders, builders, and teams.',
    items: [
      {
        kind: 'Keynote · 2×',
        title: 'Keynote speaker, ISACA CommunITy Day',
        where: 'Two-time keynote on AI and security',
      },
      {
        kind: 'Talk',
        title: 'Smoke and Mirrors: AI for business leaders',
        where: 'Live event',
        href: 'https://www.linkedin.com/posts/tyler-warburton_smoke-and-mirrors-ai-for-business-leaders-activity-7444375795164307457-7LBo',
      },
      {
        kind: 'Workshops',
        title: 'AI education sessions for teams and organizations',
        where: 'On request',
        href: '#book',
      },
    ],
  },

  // — Token Maxers: the AI meetup ————————————————————————————
  group: {
    name: 'Token Maxers',
    label: 'Join Token Maxers',
    href: 'https://whop.com/token-maxers',
    blurb:
      'The AI meetup group I run. Motivated people sharing real workflows, shipping together, and keeping each other honest.',
  },

  // — Cal.com booking link (used by the inline embed) ——————————————
  cal: {
    link: 'tyler-warburton/token-max',
    namespace: 'token-max',
  },

  // — Contact / links ——————————————————————————————————————————
  email: 'tylerw9954@gmail.com',
  github: 'https://github.com/tylerwarburton',
  linkedin: 'https://www.linkedin.com/in/tyler-warburton/',
  linkedinSlug: 'tyler-warburton',
  socials: [
    { icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/tyler-warburton/' },
    { icon: 'x', label: 'X', href: 'https://x.com/tylerw_ai' },
    { icon: 'github', label: 'GitHub', href: 'https://github.com/tylerwarburton' },
  ],
} as const;

export type Site = typeof site;

/** 1_234_000_000 -> "1.2B" */
export function compact(n: number): string {
  if (n >= 1e12) return `${+(n / 1e12).toFixed(1)}T`;
  if (n >= 1e11) return `${Math.floor(n / 1e9)}B`;
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
}
