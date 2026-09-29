// ============================================================
//  PROJECTS — every entry becomes a card on /projects and its
//  own page at /projects/<slug>. Order within a category = order
//  shown. Keep summaries to ~2 sentences.
// ============================================================

export type CategoryKey = 'ai' | 'crypto' | 'hardware';

export const categories: Record<CategoryKey, { label: string; short: string; blurb: string }> = {
  ai: {
    label: 'AI & SaaS',
    short: 'AI & SaaS',
    blurb: 'Products for real businesses: automation, research agents, and operations software.',
  },
  crypto: {
    label: 'Crypto & Web3',
    short: 'Crypto',
    blurb: 'Protocols, markets, and infrastructure on AO, Arweave, EVM chains, and Secret Network.',
  },
  hardware: {
    label: 'Hardware & Firmware',
    short: 'Hardware',
    blurb: 'OS images, node appliances, and the machines that run everything else.',
  },
};

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Brand {
  /** Primary brand colour, used for the card edge, glow, and page accent. */
  color: string;
  /** Logo under /public/brands. */
  logo?: string;
  /** Tile behind the logo: 'dark' (default) or 'light' for dark line art. */
  tile?: 'light' | 'dark';
  /** Screenshot of the live product under /public/shots (1280x800). */
  shot?: string;
}

export interface Project {
  slug: string;
  name: string;
  category: CategoryKey;
  /** One line for cards. */
  tagline: string;
  /** Two sentences: what it is. */
  summary: string;
  /** What Tyler did. */
  role: string;
  involvement: string;
  stack: string[];
  years: string;
  status: 'Live' | 'Active' | 'Testnet' | 'Shipped' | 'In development';
  company?: string;
  links: ProjectLink[];
  brand?: Brand;
  featured?: boolean;
}

export const projects: Project[] = [
  // — AI & SaaS ——————————————————————————————————————————————
  {
    slug: 'autogrow',
    name: 'AutoGrow',
    category: 'ai',
    tagline: 'Find the right people, then reach them.',
    summary:
      'AutoGrow combines multiple research agents, intent signals, and private databases to find the people most likely to care. Then it turns what it learned into hyper-personalized outreach built around each person.',
    role: 'CTO (Fractional) & lead engineer',
    involvement:
      'Built the product from the first commit: the app, the server, billing, and the research worker fleet that powers every campaign.',
    stack: ['TypeScript', 'Electron', 'Node', 'Postgres', 'Docker'],
    years: '2026 to now',
    status: 'Live',
    company: 'AutoGrow',
    links: [
      { label: 'useautogrow.com', href: 'https://useautogrow.com' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/company/144697947/' },
    ],
    brand: { color: '#5B8DEF', logo: '/brands/autogrow.svg', shot: '/shots/autogrow.webp' },
    featured: true,
  },
  {
    slug: 'deep-research-engine',
    name: 'Deep Research Engine',
    category: 'ai',
    tagline: 'A multi-agent research pipeline that verifies what it finds.',
    summary:
      'A research agent that plans, searches, dedupes, scores, reads, verifies, and enriches results before anything reaches a customer. It runs on Claude or on local models on a private GPU box, and powers AutoGrow research briefs.',
    role: 'Sole author',
    involvement:
      'Designed the squad pipeline, the wire protocol with AutoGrow, the MCP tool hub, and the fleet admin dashboard.',
    stack: ['Node', 'MCP', 'Claude', 'Ollama / Qwen', 'Docker'],
    years: '2026 to now',
    status: 'Active',
    company: 'CipherPlay',
    links: [],
    featured: true,
  },
  {
    slug: 'heyhauler',
    name: 'HeyHauler',
    category: 'ai',
    tagline: 'Roll-off dispatch, billing, and fleet control.',
    summary: 'Software for companies that haul things, like roll-off dumpsters: orders, drivers, yards, disposal, invoicing, and payments. Clients request and track their jobs in the same system the crew runs on.',
    role: 'Founder & lead engineer',
    involvement:
      'Built the platform, the design system, the multi-org model, and an AI simulation that drives a live business day against the real app.',
    stack: ['Next.js', 'TypeScript', 'Postgres', 'Drizzle', 'Docker'],
    years: '2026 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [{ label: 'heyhauler.com', href: 'https://heyhauler.com' }],
    brand: { color: '#D9D400', logo: '/brands/heyhauler.svg', shot: '/shots/heyhauler.webp' },
    featured: true,
  },
  {
    slug: 'breederops',
    name: 'BreederOps',
    category: 'ai',
    tagline: 'Run the breeding business. All in one place.',
    summary: 'Management software for agricultural animal raising, starting with rodents bred for pets and reptile food: racks, breeders, litters, health, and output. Incubator tracking for reptiles and support for dog breeders are next, so it becomes the one place to run any breeding operation.',
    role: 'Founder & lead engineer',
    involvement:
      'Built the colony model, the voice console, and the guided check-in walk where the AI only asks about what you have not already said.',
    stack: ['Next.js', 'TypeScript', 'Postgres', 'Claude'],
    years: '2026 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [{ label: 'breederops.com', href: 'https://breederops.com' }],
    brand: { color: '#A3E635', logo: '/brands/breederops.webp', shot: '/shots/breederops.webp' },
  },
  {
    slug: 'gauntlet',
    name: 'Gauntlet',
    category: 'ai',
    tagline: 'Interactive presentations for company leadership and education.',
    summary:
      'Presenters click through a deck on the projector while everyone in the room follows on their phone, answers when a slide is a question, and is scored on speed and accuracy. Individual and team leaderboards roll up live; attendees join with a short code, no accounts.',
    role: 'Founder & lead engineer',
    involvement:
      'Built it from the initial scaffold: the real-time engine, the authoring studio, question types, scoring, and deployment. A product for The Cyber Space.',
    stack: ['Next.js', 'Socket.IO', 'Redis', 'Prisma', 'Postgres'],
    years: '2026 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [{ label: 'gauntlet.tylerw.ai', href: 'https://gauntlet.tylerw.ai' }],
    brand: { color: '#A6FF00', logo: '/brands/gauntlet.webp', shot: '/shots/gauntlet.webp' },
  },
  {
    slug: 'sprite-core',
    name: 'SpriteCore',
    category: 'ai',
    tagline: 'Animated pixel avatars with a voice, for any AI agent.',
    summary:
      'A plugin and cross-language SDK that gives AI agents an animated sprite avatar with streaming text-to-speech and speech-to-text. It also ships an MCP App server, so Claude, ChatGPT, or VS Code can show the avatar.',
    role: 'Author',
    involvement: 'Designed and built the plugin, the TypeScript, Kotlin, and Swift SDKs, and the MCP server.',
    stack: ['TypeScript', 'Kotlin', 'Swift', 'MCP'],
    years: '2026',
    status: 'Shipped',
    links: [
      { label: 'GitHub', href: 'https://github.com/tylerwarburton/sprite-core' },
      { label: 'npm', href: 'https://www.npmjs.com/package/@tylerwarburton/sprite-core' },
    ],
    brand: { color: '#2f81f7' },
  },

  // — Crypto & Web3 ——————————————————————————————————————————
  {
    slug: 'randao',
    name: 'RandAO',
    category: 'crypto',
    tagline: 'Decentralized, verifiable randomness for AO.',
    summary:
      'A randomness protocol where a network of providers commits and reveals entropy, backed by a verifiable delay function, so apps on AO get random numbers nobody can rig. It includes the RAND token, a provider network, a JavaScript SDK, and dashboards.',
    role: 'CTO (Fractional)',
    involvement:
      'Led the technology: the provider node, the SDK, the dashboards, the docs, and the hardware miner program.',
    stack: ['Lua', 'TypeScript', 'Go', 'Docker', 'AO'],
    years: '2024 to now',
    status: 'Live',
    company: 'RandAO',
    links: [
      { label: 'randao.net', href: 'https://randao.net' },
      { label: 'GitHub', href: 'https://github.com/RandAOLabs' },
      { label: 'ao-js-sdk', href: 'https://github.com/RandAOLabs/ao-js-sdk' },
    ],
    brand: { color: '#e8e8e8', logo: '/brands/randao.webp' },
    featured: true,
  },
  {
    slug: 'paralith',
    name: 'Paralith Markets',
    category: 'crypto',
    tagline: 'Bridge. Trade. Play. All on AO.',
    summary:
      'An orderbook exchange, a cross-chain stablecoin bridge from Base, Solana, and Sui, and the Rune Realm game, all on AO. PUSD is minted one-for-one against stablecoins locked on the source chain.',
    role: 'Lead engineer',
    involvement:
      'Built the orderbook, the bridge contracts on three chains and their relayer, the app, and the docs. Rune Realm, which it absorbed, was a project I built from 2024.',
    stack: ['Lua', 'TypeScript', 'Solidity', 'Rust', 'three.js', 'HyperBEAM'],
    years: '2024 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [
      { label: 'paralithmarkets.com', href: 'https://paralithmarkets.com' },
      { label: 'Docs', href: 'https://docs.paralithmarkets.com' },
    ],
    brand: { color: '#967AFF', logo: '/brands/paralith.svg', shot: '/shots/paralith.webp' },
    featured: true,
  },
  {
    slug: 'opportunity',
    name: 'Opportunity',
    category: 'crypto',
    tagline: 'Options on all your favorite assets, on Robinhood Chain.',
    summary: 'An options platform for tokenized stocks on Robinhood Chain. Issuers lock collateral and mint transferable option contracts that anyone can trade, exercise, or let expire.',
    role: 'Technical lead',
    involvement: 'Lead the technical side: the collateral-backed options contracts, their test suite, and the issuing app.',
    stack: ['Solidity', 'Foundry', 'OpenZeppelin'],
    years: '2026',
    status: 'Testnet',
    company: 'CipherPlay',
    links: [
      { label: 'opportunitytrade.com', href: 'https://opportunitytrade.com' },
      { label: 'App', href: 'https://app.opportunitytrade.com' },
      { label: 'Contracts', href: 'https://github.com/CipherPlayLabs/opportunity-options-contracts' },
    ],
    brand: { color: '#3559E8', logo: '/brands/opportunity.svg', shot: '/shots/opportunity.webp' },
    featured: true,
  },
  {
    slug: 'arns-rewind',
    name: 'ARNS Rewind',
    category: 'crypto',
    tagline: 'A Wayback Machine for Arweave names. Grant funded.',
    summary:
      'A history explorer for Arweave Name System names, covering both the AO and Solana eras. It was funded by a $15k AR.IO ecosystem grant, which was accepted and completed.',
    role: 'Grant lead & engineer',
    involvement: 'Wrote the grant, led delivery, and rebuilt the history indexing in-house.',
    stack: ['TypeScript', 'React', 'AO', 'Arweave'],
    years: '2025 to 2026',
    status: 'Live',
    company: 'RandAO',
    links: [
      { label: 'rewind.arweave.net', href: 'https://rewind.arweave.net' },
      { label: 'GitHub', href: 'https://github.com/RandAOLabs/rewind' },
      { label: 'Grant', href: 'https://github.com/ar-io/ar-io-grants/issues/36' },
    ],
    brand: { color: '#84e9e4', logo: '/brands/rewind.webp' },
  },
  {
    slug: 'arcao',
    name: 'ArcAO',
    category: 'crypto',
    tagline: 'A decentralized game-dev guild and accelerator on AO.',
    summary:
      'A hub, dashboards, NFT tooling, and templates for games built on AO, plus an accelerator that funded Rune Realm and RandAO. It set the front-end and process templates many AO projects deploy from.',
    role: 'Core engineer',
    involvement: 'Built the hub, dashboards, NFT and deploy tooling, and the shared templates.',
    stack: ['React', 'TypeScript', 'Lua', 'AO', 'ArNS'],
    years: '2025 to 2026',
    status: 'Shipped',
    links: [
      { label: 'arcao.xyz', href: 'https://arcao.xyz' },
      { label: 'GitHub', href: 'https://github.com/ArcAOGaming' },
    ],
    brand: { color: '#f5f5f5', logo: '/brands/arcao.webp', tile: 'light' },
  },
  {
    slug: 'satoshis-palace',
    name: "Satoshi's Palace",
    category: 'crypto',
    tagline: 'Provably fair, privacy-preserving gaming.',
    summary:
      'A privacy-preserving casino and prediction platform that started on Secret Network and moved to AO. It launched Bull or Bear on mainnet.',
    role: 'Engineer',
    involvement: 'Built game templates, multiplayer, and the original ArcAO hub.',
    stack: ['Rust', 'CosmWasm', 'TypeScript', 'Lua'],
    years: '2024 to 2025',
    status: 'Shipped',
    links: [
      { label: 'satoshispalace.casino', href: 'https://satoshispalace.casino' },
      { label: 'GitHub', href: 'https://github.com/SatoshisPalace' },
    ],
  },
  {
    slug: 'infrao',
    name: 'InfrAO',
    category: 'crypto',
    tagline: 'High-performance gateways and validators for Arweave.',
    summary:
      'Heavily optimized blockchain gateways and validator nodes for the Arweave network and AO. Built and operated for the Arweave team and Forward Research.',
    role: 'Builder & operator',
    involvement:
      'Designed, built, and maintained the gateway and validator fleet, plus the public site, docs, and explorer tooling.',
    stack: ['Arweave', 'AO', 'Linux', 'Docker', 'TypeScript'],
    years: '2025 to now',
    status: 'Live',
    links: [
      { label: 'Landing', href: 'https://github.com/InfrAOLabs/Infrao-landingpage' },
      { label: 'Docs', href: 'https://github.com/InfrAOLabs/InfrAO-Docs' },
    ],
    brand: { color: '#d9d9d9', logo: '/brands/infrao.webp' },
  },

  // — Hardware & Firmware ————————————————————————————————————
  {
    slug: 'hyperbeam-os',
    name: 'HyperBEAM OS',
    category: 'hardware',
    tagline: 'Customized blockchain infrastructure on HyperBEAM.',
    summary:
      'My customized, performance-tuned build of HyperBEAM, the AO-Core node from Forward Research, running on dedicated hardware. It powers the blockchain infrastructure I operate.',
    role: 'Lead engineer',
    involvement: 'Built and maintain the fork, its optimizations, and the hardware it runs on.',
    stack: ['Erlang', 'Linux', 'Shell', 'HyperBEAM'],
    years: '2025 to now',
    status: 'Active',
    company: 'CipherPlay',
    links: [{ label: 'GitHub', href: 'https://github.com/tylerwarburton/HyperBEAM' }],
    featured: true,
  },
  {
    slug: 'randao-hardware-miner',
    name: 'RandAO Hardware Miner',
    category: 'hardware',
    tagline: 'Plug in a Raspberry Pi, become a randomness provider.',
    summary:
      'Custom OS images that turn a Raspberry Pi or Orange Pi into a plug-and-play RandAO provider node. It includes first-boot Wi-Fi setup, so it runs with no keyboard or screen.',
    role: 'Lead engineer',
    involvement: 'Built the OS images, the setup flow, and the Wi-Fi selector.',
    stack: ['Python', 'Shell', 'pi-gen', 'Armbian', 'Go'],
    years: '2025',
    status: 'Shipped',
    company: 'RandAO',
    links: [
      { label: 'HardwareMiner', href: 'https://github.com/RandAOLabs/HardwareMiner' },
      { label: 'pifigo', href: 'https://github.com/ToddE/pifigo' },
    ],
    brand: { color: '#e8e8e8', logo: '/brands/randao.webp' },
  },
  {
    slug: 'spark-console',
    name: 'Spark Console',
    category: 'hardware',
    tagline: 'An appliance console for a local AI GPU box.',
    summary:
      'Turns a local GPU machine into an appliance that serves private models to the rest of the stack. It is what runs the local side of the Deep Research Engine.',
    role: 'Author',
    involvement: 'Built the console and the model-serving setup.',
    stack: ['Python', 'Ollama', 'Linux'],
    years: '2026',
    status: 'Active',
    links: [],
  },
];

export const projectsByCategory = (key: CategoryKey) => projects.filter((p) => p.category === key);
