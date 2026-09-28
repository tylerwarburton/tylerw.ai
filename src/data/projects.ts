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
  featured?: boolean;
}

export const projects: Project[] = [
  // — AI & SaaS ——————————————————————————————————————————————
  {
    slug: 'autogrow',
    name: 'AutoGrow',
    category: 'ai',
    tagline: 'LinkedIn growth on autopilot, with a paid research marketplace.',
    summary:
      'A desktop app that automates LinkedIn outreach and growth for founders and sales teams. It includes a marketplace where customers buy AI research briefs on leads, markets, and companies.',
    role: 'Founder & lead engineer',
    involvement:
      'Built the product from the first commit: the desktop app, the server, billing, and the research worker fleet that fulfils briefs.',
    stack: ['TypeScript', 'Electron', 'Node', 'Postgres', 'Docker'],
    years: '2026 to now',
    status: 'Live',
    company: 'AutoGrow',
    links: [{ label: 'Releases', href: 'https://github.com/CipherPlayLabs/Auto-Grow-releases' }],
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
    tagline: 'Operations software for roll-off and junk-hauling companies.',
    summary:
      'Runs a hauling business end to end: bin orders, drivers and shifts, yards and disposal, scale tickets, invoicing, and payments, all multi-tenant. Crews work from their phones and owners see the whole book in one console.',
    role: 'Founder & lead engineer',
    involvement:
      'Built the platform, the design system, the multi-org model, and an AI simulation that drives a live business day against the real app.',
    stack: ['Next.js', 'TypeScript', 'Postgres', 'Drizzle', 'Docker'],
    years: '2026 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [{ label: 'heyhauler.com', href: 'https://heyhauler.com' }],
    featured: true,
  },
  {
    slug: 'breederops',
    name: 'BreederOps',
    category: 'ai',
    tagline: 'Colony and breeding management you can run by voice.',
    summary:
      'Management software for animal breeding operations: racks and tubs, breeders and harems, litters, grow-outs, health, and mortality. Owners walk the room and talk, and the AI turns what they say into records they confirm.',
    role: 'Founder & lead engineer',
    involvement:
      'Built the colony model, the voice console, and the guided check-in walk where the AI only asks about what you have not already said.',
    stack: ['Next.js', 'TypeScript', 'Postgres', 'Claude'],
    years: '2026 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [{ label: 'breederops.com', href: 'https://breederops.com' }],
  },
  {
    slug: 'gauntlet',
    name: 'Gauntlet',
    category: 'ai',
    tagline: 'Live team quizzes built into your slide deck.',
    summary:
      'A presentation platform where the audience joins teams by QR code and competes on speed and accuracy in real time. Presenters build decks in an admin studio with several question types and printable team labels.',
    role: 'Founder & lead engineer',
    involvement: 'Built it from the initial scaffold: real-time engine, studio, and deployment.',
    stack: ['Next.js', 'Socket.IO', 'Redis', 'Prisma', 'Postgres'],
    years: '2026 to now',
    status: 'Active',
    company: 'CipherPlay',
    links: [],
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
  },

  // — Crypto & Web3 ——————————————————————————————————————————
  {
    slug: 'randao',
    name: 'RandAO',
    category: 'crypto',
    tagline: 'Decentralized, verifiable randomness for AO.',
    summary:
      'A randomness protocol where a network of providers commits and reveals entropy, backed by a verifiable delay function, so apps on AO get random numbers nobody can rig. It includes the RAND token, a provider network, a JavaScript SDK, and dashboards.',
    role: 'Co-founder & CTO',
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
    featured: true,
  },
  {
    slug: 'paralith',
    name: 'Paralith Markets',
    category: 'crypto',
    tagline: 'Bridge, trade, and play on AO.',
    summary:
      'An orderbook exchange, a cross-chain stablecoin bridge from Base, Solana, and Sui, and the Rune Realm game, all on AO. PUSD is minted one-for-one against stablecoins locked on the source chain.',
    role: 'Lead engineer',
    involvement:
      'Built the orderbook, the bridge contracts on three chains and their relayer, the app, and the docs. Rune Realm, which it absorbed, was a project I built from 2024.',
    stack: ['Lua', 'TypeScript', 'Solidity', 'Rust', 'three.js', 'HyperBEAM'],
    years: '2024 to now',
    status: 'Live',
    company: 'CipherPlay',
    links: [{ label: 'Docs', href: 'https://docs.paralithmarkets.com' }],
    featured: true,
  },
  {
    slug: 'opportunity',
    name: 'Opportunity',
    category: 'crypto',
    tagline: 'Collateral-backed options on Robinhood Chain.',
    summary:
      'An options platform where issuers lock ERC-20 collateral and mint a transferable NFT option right. It is live on Robinhood Chain testnet.',
    role: 'Lead engineer',
    involvement: 'Building the contracts, tests, and issuing app.',
    stack: ['Solidity', 'Foundry', 'OpenZeppelin'],
    years: '2026',
    status: 'Testnet',
    company: 'CipherPlay',
    links: [
      { label: 'App', href: 'https://app.opportunitytrade.com' },
      { label: 'Contracts', href: 'https://github.com/CipherPlayLabs/opportunity-options-contracts' },
    ],
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
    tagline: 'Infrastructure as a service to help AO scale.',
    summary:
      'Hosted infrastructure and tooling for teams running on AO. It shipped with its own docs and explorer tooling.',
    role: 'Engineer',
    involvement: 'Built the landing site and the docs.',
    stack: ['React', 'TypeScript', 'Docusaurus'],
    years: '2025',
    status: 'Shipped',
    links: [
      { label: 'Landing', href: 'https://github.com/InfrAOLabs/Infrao-landingpage' },
      { label: 'Docs', href: 'https://github.com/InfrAOLabs/InfrAO-Docs' },
    ],
  },

  // — Hardware & Firmware ————————————————————————————————————
  {
    slug: 'hyperbeam-os',
    name: 'HyperBEAM OS',
    category: 'hardware',
    tagline: 'A purpose-built OS for running HyperBEAM nodes.',
    // TODO: confirm with Tyler, written from the name only.
    summary:
      'An operating system image and toolchain for running HyperBEAM (AO) nodes on dedicated hardware. It sits between firmware and the node, so a machine boots straight into being part of the network.',
    role: 'Lead engineer',
    involvement: 'Building the OS image, boot flow, and node fleet tooling.',
    stack: ['Linux', 'Erlang', 'Shell', 'HyperBEAM'],
    years: '2026',
    status: 'In development',
    company: 'CipherPlay',
    links: [],
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
