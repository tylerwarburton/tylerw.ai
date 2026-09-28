// ============================================================
//  SITE CONTENT — edit everything here. One file, plain text.
//  Projects live in ./projects.ts.
// ============================================================

export const site = {
  // — Identity ————————————————————————————————————————————————
  name: 'Tyler Warburton',
  domain: 'tylerw.ai',
  eyebrow: 'Founder · Fractional CTO',
  headline: 'I build companies with AI.',
  tagline:
    'Founder of CipherPlay and co-founder of RandAO. I ship SaaS, crypto protocols, and hardware, and I step in as a fractional CTO for teams that need to move fast.',
  description:
    'Tyler Warburton: founder and fractional CTO. AI, SaaS, crypto, and hardware products, shipped.',

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

  // — Companies —————————————————————————————————————————————
  companies: [
    {
      name: 'CipherPlay',
      role: 'Founder',
      years: '2024 to now',
      href: 'https://cipherplay.net',
      note: 'Cybersecurity, blockchain, and AI studio. Home of HeyHauler, BreederOps, Paralith, and Opportunity.',
    },
    {
      name: 'AutoGrow',
      role: 'Founder',
      years: '2026 to now',
      href: 'https://github.com/CipherPlayLabs/Auto-Grow-releases',
      note: 'LinkedIn growth automation with an AI research marketplace.',
    },
    {
      name: 'RandAO',
      role: 'Co-founder & CTO',
      years: '2024 to now',
      href: 'https://randao.net',
      note: 'Decentralized verifiable randomness for AO.',
    },
    {
      name: 'American Technical Consultants',
      role: 'Fractional CTO',
      years: 'Aug 2026 to now',
      note: 'Leading technology strategy, engineering, and AI adoption.',
    },
    {
      name: 'Lockheed Martin',
      role: 'Senior Software Engineer · Program Management',
      years: 'Prior',
      note: 'Led cybersecurity work on critical programs and ran complex technical programs end to end.',
    },
  ],

  // — Public work: talks, education, community ——————————————
  speaking: {
    intro:
      'I give talks and run hands-on education sessions on getting real work done with AI, for business leaders, builders, and anyone ready to move faster.',
    items: [
      {
        kind: 'Talk',
        title: 'Smoke and Mirrors: AI for business leaders',
        where: 'Live event',
        href: 'https://www.linkedin.com/posts/tyler-warburton_smoke-and-mirrors-ai-for-business-leaders-activity-7444375795164307457-7LBo',
      },
      {
        kind: 'Article',
        title: "You wouldn't download a waterfall. So I coded one with Claude.",
        where: 'Medium · dev.to',
        href: 'https://medium.com/@tylerw9954/claude-cad-design-a18a928a21f6',
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
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
}
