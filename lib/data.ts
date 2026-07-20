export type NavLink = { label: string; href: string };

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/#home" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Contact Us", href: "/contact" },
];

export const HERO_STATS = [
  { value: "14+", label: "Years of Experience" },
  { value: "3.5k+", label: "Satisfied Clients" },
  { value: "1.5k+", label: "Thriving Projects" },
] as const;

/** Hero copy for the dedicated /services page. */
export const SERVICES_HERO = {
  titleLead: "Services Built to",
  titleHighlight: "Scale with You",
  subtitle:
    "Seven premium practices, one senior team. Pick a starting point — we tailor every engagement to your business goals.",
  cta: "Start A Project With Us",
  ctaHref: "/contact",
} as const;

/* ---------------------------------------------------------------------------
   Contact page (/contact)
--------------------------------------------------------------------------- */

/** Hero copy for the dedicated /contact page. */
export const CONTACT_HERO = {
  titleLead: "Let's",
  titleHighlight: "Talk.",
  subtitle:
    "We typically reply within 24 hours. Tell us about your business and what you're trying to achieve.",
  cta: "Send Us A Message",
  /** in-page scroll to the contact form (Contact section renders id="contact") */
  ctaHref: "#contact",
} as const;

export type ContactChannel = {
  label: string;
  value: string;
  icon: string;
  /** clickable target (mailto:/tel:) — null renders a plain, static value */
  href: string | null;
};

export const CONTACT_INFO: ContactChannel[] = [
  {
    label: "Email",
    value: "info@kappatos.com",
    icon: "/icons/mail.svg",
    href: "mailto:info@kappatos.com",
  },
  {
    label: "Phone",
    value: "+1 (555) 010-2024",
    icon: "/icons/phone.svg",
    href: "tel:+15550102024",
  },
  {
    label: "Location",
    value: "Remote · Worldwide",
    icon: "/icons/location.svg",
    href: null,
  },
  {
    label: "Hours",
    value: "Mon–Fri · 9am–7pm",
    icon: "/icons/clock.svg",
    href: null,
  },
];

/** Global-presence section — one large world-map card with live pins. */
export const GLOBAL_PRESENCE = {
  eyebrow: "Find Us",
  title: "Remote-first, Globally",
  highlight: "Available",
  subtitle:
    "Our team operates across timezones — meeting you where you work.",
  caption: "Remote-first · Worldwide presence",
} as const;

/* ---------------------------------------------------------------------------
   About page (/about)
--------------------------------------------------------------------------- */

/** Hero copy for the dedicated /about page. */
export const ABOUT_HERO = {
  titleLead: "Helping Ambitious Teams Ship",
  titleHighlight: "Premium Digital Products",
  subtitle:
    "Kappatos Productions and Venture Enterprises is a senior, remote-first agency founded in 2012. We partner with founders and operators who care deeply about craft.",
  primaryCta: "Start A Project With Us",
  primaryHref: "/contact",
  secondaryCta: "Explore Our Services",
  secondaryHref: "/services",
} as const;

/** Founder story — "The Beginning". */
export const ABOUT_FOUNDER = {
  eyebrow: "The Beginning",
  title: "Started KPVE",
  since: "Est. 2012",
  image: "/about/founder.png",
  name: "Dimitrios Kappatos",
  role: "Founder & CEO",
  paragraphs: [
    "Dimitrios started KPVE in 2012 at the age of 17, during his final months of school. He understood that whatever path he took in life, the digital space would always be crucial.",
    "Over a decade later, we find ourselves in a world where technology has reshaped the marketplace and made it easier for businesses and consumers to transact. Dimitrios works personally with an array of medium to large enterprises, and continues to be the backbone of our company.",
  ],
} as const;

export type Milestone = { year: string; title: string; body: string };

/** Journey timeline — a section the original design didn't have. */
export const ABOUT_JOURNEY: {
  eyebrow: string;
  title: string;
  highlight: string;
  subtitle: string;
  milestones: Milestone[];
} = {
  eyebrow: "Our Journey",
  title: "A Decade of",
  highlight: "Compounding Craft",
  subtitle:
    "From a one-person studio to a global senior team — every year built deliberately.",
  milestones: [
    {
      year: "2012",
      title: "The first line of code",
      body: "Dimitrios founds KPVE at 17, betting his future on the digital space.",
    },
    {
      year: "2016",
      title: "From solo to studio",
      body: "First enterprise clients arrive; the team grows around a craft-first culture.",
    },
    {
      year: "2020",
      title: "Remote-first, globally",
      body: "We go fully distributed — designers, engineers, and operators across timezones.",
    },
    {
      year: "Today",
      title: "A senior partner at scale",
      body: "Trusted by medium-to-large enterprises to design, build, and grow what matters.",
    },
  ],
};

export type EthosTier = {
  key: string;
  label: string;
  body: string;
  icon: string;
};

/** Our Story / Mission / Vision — the "pyramid" reimagined as a layered ethos. */
export const ABOUT_ETHOS: {
  eyebrow: string;
  title: string;
  highlight: string;
  paragraphs: string[];
  tiers: EthosTier[];
} = {
  eyebrow: "Our Story",
  title: "A studio built on craft,",
  highlight: "not headcount.",
  paragraphs: [
    "We've spent over a decade refining what 'premium' means in digital — not flashy, just right. Every engagement is a conversation between a senior team and a team that cares.",
    "Today we are a global team of designers, engineers, strategists, and operators. We treat your business like our own — slow when it matters, fast when it counts.",
  ],
  tiers: [
    {
      key: "vision",
      label: "Our Vision",
      body: "Set the bar for what premium means in digital — craft that compounds.",
      icon: "/icons/growth.svg",
    },
    {
      key: "mission",
      label: "Our Mission",
      body: "Treat every client's business like our own — slow when it matters, fast when it counts.",
      icon: "/icons/innovation.svg",
    },
    {
      key: "story",
      label: "Our Story",
      body: "From one person in 2012 to a global senior team — built deliberately, never by headcount.",
      icon: "/icons/team.svg",
    },
  ],
};

export type Offer = { title: string; body: string; icon: string };

/** KPVE Offers — the two flagship engagement models. */
export const ABOUT_OFFERS: {
  eyebrow: string;
  title: string;
  highlight: string;
  items: Offer[];
} = {
  eyebrow: "KPVE Offers",
  title: "Two ways we plug",
  highlight: "straight into your team",
  items: [
    {
      title: "24/7 Backend Tech Support",
      body: "Round-the-clock engineering for your team, company, or business — including sales and admin support that keeps operations moving.",
      icon: "/icons/support.svg",
    },
    {
      title: "Product Management & Sourcing",
      body: "End-to-end product management and overseas sourcing, paired with hands-on product development that ships.",
      icon: "/icons/business.svg",
    },
  ],
};

export type Difference = { title: string; body: string; icon: string };

/** The KPVE difference — three reasons teams stay. */
export const ABOUT_DIFFERENCE: {
  eyebrow: string;
  title: string;
  highlight: string;
  subtitle: string;
  items: Difference[];
} = {
  eyebrow: "Why Us",
  title: "The KPVE",
  highlight: "difference",
  subtitle: "No junior-led teams. No reseller pricing. Just senior people doing the work.",
  items: [
    {
      title: "Senior team only",
      body: "Every engagement is led by people with 10+ years in their craft.",
      icon: "/icons/team.svg",
    },
    {
      title: "Fast & opinionated",
      body: "We move quickly with strong opinions, weakly held — and we explain our work.",
      icon: "/icons/innovation.svg",
    },
    {
      title: "Long-term partners",
      body: "We stay long after the launch, building with you on what's next.",
      icon: "/icons/person-circle.svg",
    },
  ],
};

/** Closing CTA banner — "Become our next case study". */
export const ABOUT_CTA = {
  eyebrow: "Let's Build",
  title: "Become our next case study.",
  body: "Let's craft a seamless digital experience designed to elevate your brand, engage your audience, and drive measurable growth for your business.",
  cta: "Let's Talk",
  ctaHref: "/contact",
  image: "/background.jpeg",
} as const;

export type ProcessStep = {
  step: string;
  title: string;
  body: string;
  icon: string;
};

export const PROCESS_STEPS: ProcessStep[] = [
  {
    step: "Step 1",
    title: "Team",
    body: "We begin by understanding your goals, target audience, and brand to align the design with your vision.",
    icon: "/icons/team.svg",
  },
  {
    step: "Step 2",
    title: "Innovation",
    body: "We translate insight into bold, functional ideas — prototyping fast and refining until it feels effortless.",
    icon: "/icons/innovation.svg",
  },
  {
    step: "Step 3",
    title: "Growth",
    body: "We ship, measure, and scale — turning a launch into a compounding engine for sustainable growth.",
    icon: "/icons/growth.svg",
  },
];

export type Service = {
  title: string;
  body: string;
  icon: string;
  /** URL slug for the dedicated /services/<slug> detail page */
  slug: string;
};

export const SERVICES: Service[] = [
  {
    title: "Design",
    body: "When it comes to digital agency solutions, no one does it better than the pros at KPVE. Your brand needs a high-quality design that captures your story with an engaging call to action.",
    icon: "/icons/design.svg",
    slug: "design",
  },
  {
    title: "Web Development",
    body: "We build fast, resilient, and scalable web platforms with modern stacks — engineered for performance, accessibility, and effortless maintenance as you grow.",
    icon: "/icons/web.svg",
    slug: "web-development",
  },
  {
    title: "Hosting",
    body: "Secure, monitored, and always-on infrastructure. We handle deployment, uptime, and scaling so your product stays online through every traffic spike.",
    icon: "/icons/hosting.svg",
    slug: "hosting",
  },
  {
    title: "Support",
    body: "A dedicated team on standby. From quick fixes to strategic roadmapping, we keep your product healthy long after launch day.",
    icon: "/icons/support.svg",
    slug: "support",
  },
  {
    title: "Business",
    body: "Strategy, positioning, and go-to-market. We align product decisions with real business outcomes to unlock durable, compounding growth.",
    icon: "/icons/business.svg",
    slug: "business",
  },
  {
    title: "Media",
    body: "Motion, photography, and content that moves people. We produce assets that make your brand impossible to scroll past.",
    icon: "/icons/media.svg",
    slug: "media",
  },
  {
    title: "Social Media",
    body: "Always-on content and community management. We keep your brand present, consistent, and growing across every platform that matters.",
    icon: "/icons/social.svg",
    slug: "social-media",
  },
];

export const SERVICES_CTA = {
  title: "Designing & Developing Real-World Solutions",
  body: "Take a closer look at the projects we've delivered for startups and businesses across multiple industries. Our work highlights clean design, seamless user experiences, and scalable development — crafted to support growth and performance.",
  note: "Trusted by 20+ startups, turning ideas into polished digital products.",
  cta: "Get In Touch",
};

export type Project = {
  title: string;
  tags: string[];
  body: string;
  image: string;
  /** case-study slug — when set, the card links to /case-study/<slug> */
  caseStudy?: string;
};

export const PROJECTS: Project[] = [
  {
    title: "Rare Gem Exchange",
    tags: ["Web Development", "Branding"],
    body: "A premium marketplace for collectors — real-time bidding, verified provenance, and a checkout experience engineered to build trust at every step.",
    image: "/projects/rare-gem.png",
    caseStudy: "rare-gem",
  },
  {
    title: "Hikka Surf Point",
    tags: ["Product Design", "Branding"],
    body: "A boutique beachfront retreat brought online — an immersive, atmospheric launch page that turned curiosity into a waitlist.",
    image: "/projects/ashby.png",
  },
  {
    title: "Colney & Co.",
    tags: ["Web Development", "SEO"],
    body: "A modern property company platform — listings, lead capture, and a multi-device experience that scales from desktop to pocket.",
    image: "/projects/delrey.png",
  },
  {
    title: "SDA Leasing",
    tags: ["Web App", "Dashboard"],
    body: "A specialist leasing agency portal — accessible, trustworthy, and engineered to connect tenants with the right home faster.",
    image: "/projects/ega.png",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  avatar: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "KPVE turned our business around! Their strategy helped us reach new customers and increase revenue by 30% within just a few months. Highly recommended!",
    name: "Sarah Thompson",
    role: "CEO of BlueBloom Fashion",
    avatar: "https://i.pravatar.cc/160?img=47",
  },
  {
    quote:
      "The most detail-obsessed team we've worked with. Every handoff was clean, every deadline was met, and the final product felt genuinely premium.",
    name: "Marcus Lee",
    role: "Founder, Northpeak Labs",
    avatar: "https://i.pravatar.cc/160?img=12",
  },
  {
    quote:
      "They didn't just build what we asked for — they challenged it and made it better. Our conversion rate nearly doubled after the relaunch.",
    name: "Priya Nair",
    role: "Head of Growth, Vantage",
    avatar: "https://i.pravatar.cc/160?img=32",
  },
  {
    quote:
      "Working with KPVE felt like adding a senior team overnight. Responsive, sharp, and deeply invested in the outcome, not just the deliverable.",
    name: "David Okafor",
    role: "CTO, Loop Financial",
    avatar: "https://i.pravatar.cc/160?img=59",
  },
  {
    quote:
      "From brand to build, everything finally feels cohesive. Customers keep telling us the site feels expensive — in the best possible way.",
    name: "Elena Rossi",
    role: "Owner, Casa Rossi",
    avatar: "https://i.pravatar.cc/160?img=45",
  },
  {
    quote:
      "A rare partner that understands both design and business. They shipped fast without ever cutting the corners that matter.",
    name: "James Carter",
    role: "VP Product, Skyward",
    avatar: "https://i.pravatar.cc/160?img=15",
  },
];

export type Faq = { question: string; answer: string };

export const FAQS: Faq[] = [
  {
    question: "How long does it take to complete a web development project?",
    answer:
      "Timelines vary with scope and complexity. A focused landing page can ship in 2–3 weeks, while a full platform typically runs 6–12 weeks. We share a clear milestone plan up front so you always know what's next.",
  },
  {
    question: "Can you handle large-scale mobile app development projects?",
    answer:
      "Yes. We've built and scaled apps serving hundreds of thousands of users. We architect for performance and maintainability from day one, so the product keeps up as your audience grows.",
  },
  {
    question:
      "Do you offer maintenance services for sites built by other companies?",
    answer:
      "Absolutely. We start with an audit to map the existing codebase, then offer ongoing maintenance, performance tuning, and feature work — even on projects we didn't originally build.",
  },
  {
    question: "How do you ensure the security of user data?",
    answer:
      "Security is built in, not bolted on. We follow least-privilege access, encrypt data in transit and at rest, run regular dependency audits, and align with modern compliance standards for every build.",
  },
  {
    question: "Can you create a responsive design that looks great on all devices?",
    answer:
      "Every project is designed mobile-first and tested across real devices and breakpoints. Your experience will feel intentional and polished on phones, tablets, and desktops alike.",
  },
  {
    question: "What digital marketing strategies do you use to drive traffic?",
    answer:
      "We combine technical SEO, content strategy, and conversion-rate optimization, backed by analytics. The goal is durable, compounding traffic — not short-lived spikes.",
  },
  {
    question: "Can you integrate third-party APIs into our product?",
    answer:
      "Yes — payments, CRMs, analytics, AI services, and more. We build resilient integrations with proper error handling and fallbacks so third-party services never take your product down.",
  },
  {
    question: "How do you ensure cross-platform compatibility?",
    answer:
      "We test across browsers, operating systems, and screen sizes as part of our standard QA. You get a consistent, dependable experience wherever your customers are.",
  },
];

export const FOOTER_LINKS: NavLink[] = [
  { label: "Home", href: "/#home" },
  { label: "About Us", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Contact", href: "/contact" },
];

export const SOCIAL_LINKS: NavLink[] = [
  { label: "Facebook", href: "#" },
  { label: "Twitter", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "Instagram", href: "#" },
];

/* ---------------------------------------------------------------------------
   Service detail pages (/services/<slug>)
   Data-driven so every service page reuses the same section components.
--------------------------------------------------------------------------- */

export type ServiceHero = {
  /** big first line of the title */
  titleLead: string;
  /** gold accent rendered as a second big line (when there's no tagline) */
  titleHighlight?: string;
  /** optional smaller second line below the main title */
  tagline?: string;
  /** gold portion of the tagline */
  taglineHighlight?: string;
  subtitle: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
};

export type ServiceBenefits = {
  eyebrow: string;
  title: string;
  highlight?: string;
  body: string;
  cta: string;
  ctaHref: string;
  /** checklist of outcomes */
  items: string[];
};

export type ServiceCapability = { title: string; body: string; icon: string };

export type ServiceCapabilities = {
  eyebrow: string;
  title: string;
  highlight?: string;
  subtitle: string;
  items: ServiceCapability[];
};

export type ServiceProcessStep = { num: string; title: string; body: string };

export type ServiceProcess = {
  eyebrow: string;
  title: string;
  highlight?: string;
  subtitle: string;
  steps: ServiceProcessStep[];
};

export type ServiceWhyChooseUs = {
  eyebrow: string;
  title: string;
  highlight?: string;
  body: string;
};

export type ServicePage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  hero: ServiceHero;
  benefits: ServiceBenefits;
  capabilities: ServiceCapabilities;
  process: ServiceProcess;
  whyChooseUs: ServiceWhyChooseUs;
};

/** Process + trust bands are shared verbatim across every service page. */
const SHARED_PROCESS: ServiceProcess = {
  eyebrow: "How We Work",
  title: "Clear Focused",
  highlight: "Process",
  subtitle: "Four phrases. No surprises.",
  steps: [
    {
      num: "01",
      title: "Discover",
      body: "We start with deep listening — uncovering goals, audiences, and constraints to set a sharp direction.",
    },
    {
      num: "02",
      title: "Design",
      body: "We translate strategy into focused, premium artifacts — built to scale with your brand.",
    },
    {
      num: "03",
      title: "Develop",
      body: "Senior engineers ship clean, modern code with quality gates at every milestone.",
    },
    {
      num: "04",
      title: "Deliver",
      body: "We launch carefully, measure outcomes, and stay on as long-term partners for iteration.",
    },
  ],
};

const SHARED_WHY_CHOOSE_US: ServiceWhyChooseUs = {
  eyebrow: "Why Choose Us",
  title: "A Senior Team",
  highlight: "You Can Trust",
  body: "We don't do junior-led teams or reseller pricing. You work with the people doing the actual work.",
};

export const SERVICE_PAGES: Record<string, ServicePage> = {
  design: {
    slug: "design",
    metaTitle: "Design — KPVE",
    metaDescription:
      "Designing premium products, brand & UX. From identity systems to dashboard UI, our design practice combines strategic clarity with craft-led execution.",
    hero: {
      titleLead: "Designing Premium Products,",
      titleHighlight: "Brand & UX",
      subtitle:
        "We craft high-quality graphic design that captures your brand voice and accelerates business outcomes.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Design",
      body: "From identity systems to dashboard UI, our design practice combines strategic clarity with craft-led execution. Every pixel earns its place.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "Distinctive brand systems that scale across products and channels",
        "Conversion-focused interfaces grounded in research and data",
        "Reusable design systems that accelerate engineering velocity",
        "Iterative testing to validate decisions before they ship",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete design practice — strategy through delivery.",
      items: [
        {
          title: "Brand Identity",
          body: "Logos, marks, typography systems, and visual languages built to last.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Design Systems",
          body: "Tokenized, component-driven libraries that ship faster across teams.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Product Design",
          body: "End-to-end UX — research, flows, prototypes, and pixel-perfect UI.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "UI Engineering",
          body: "Polished interactions and motion that make products feel alive.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Marketing Design",
          body: "Landing pages, ads, decks, and assets that convert.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Conversion Optimization",
          body: "Data-led iteration loops to lift activation, retention and revenue.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },

  "web-development": {
    slug: "web-development",
    metaTitle: "Web Development — KPVE",
    metaDescription:
      "Modern web platforms built to scale. We build fast, secure, and scalable digital solutions tailored to your business needs.",
    hero: {
      titleLead: "Web Development",
      tagline: "Modern Web Platforms ",
      taglineHighlight: "Built to Scale",
      subtitle:
        "We build fast, secure, and scalable digital solutions tailored to your business needs.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Web Development",
      body: "Our engineering team delivers production-grade web platforms — from marketing sites to complex SaaS — with senior craftsmanship and obsessive attention to performance.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "Enterprise-grade architectures built for growth from day one",
        "Performance budgets that keep your site lightning-fast",
        "SEO-ready, accessible, and resilient to traffic spikes",
        "CI/CD pipelines and automated testing for confident shipping",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete design practice — strategy through delivery.",
      items: [
        {
          title: "Marketing Sites",
          body: "Conversion-focused websites with CMS workflows your team will love.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "SaaS Platforms",
          body: "Multi-tenant applications with auth, billing, and analytics out of the box.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Mobile-First",
          body: "Pixel-perfect responsive experiences across every device.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "SEO & Performance",
          body: "Core Web Vitals, structured data, and search-ready architecture.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Headless CMS",
          body: "Composable content stacks with editorial workflows.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "AI Integrations",
          body: "LLM-powered features wired into your product surfaces.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Edge & Delivery",
          body: "Globally distributed apps with sub-50ms response times.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Secure by Default",
          body: "OWASP-aligned best practices baked into every build.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },

  hosting: {
    slug: "hosting",
    metaTitle: "Hosting — KPVE",
    metaDescription:
      "Stable, encrypted, multi-region hosting. We architect and operate the infrastructure your product depends on — secure, observable, and globally distributed.",
    hero: {
      titleLead: "Hosting",
      tagline: "Stable, Encrypted, ",
      taglineHighlight: "Multi-Region Hosting",
      subtitle:
        "Hosting solutions designed for velocity, security, and scale across regions.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Hosting",
      body: "We architect and operate the infrastructure your product depends on — secure, observable, and globally distributed.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "Zero-downtime deploys with rollback safety nets",
        "Compliance-ready setup (SOC2, GDPR, HIPAA paths)",
        "24/7 monitoring with on-call response times under 15 minutes",
        "Cost-optimized cloud architecture from day one",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete hosting practice — strategy through delivery.",
      items: [
        {
          title: "Managed Cloud",
          body: "AWS, GCP, Cloudflare — architected and operated end-to-end.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Auto-scaling",
          body: "Capacity that grows and shrinks with your traffic.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Database Ops",
          body: "Backups, replication, and zero-loss disaster recovery.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Security Hardening",
          body: "WAF, secrets management, and continuous vulnerability scanning.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Observability",
          body: "Logs, metrics, and tracing wired in from day one.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Edge & CDN",
          body: "Globally cached delivery with intelligent routing.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },

  support: {
    slug: "support",
    metaTitle: "Support — KPVE",
    metaDescription:
      "Ongoing technical support to keep you moving. Our support practice acts as an extension of your team — proactive, accountable, and grounded in deep product knowledge.",
    hero: {
      titleLead: "Support",
      tagline: "Ongoing Technical Support ",
      taglineHighlight: "to Keep You Moving",
      subtitle:
        "Continuous technical support to keep your systems running and your team unblocked.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Support",
      body: "Our support practice acts as an extension of your team — proactive, accountable, and grounded in deep product knowledge.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "Dedicated engineers who know your stack inside-out",
        "SLA-backed response times you can plan around",
        "Proactive maintenance that prevents incidents before they happen",
        "Transparent reporting and monthly health reviews",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete support practice — strategy through delivery.",
      items: [
        {
          title: "24/7 Support",
          body: "Always-on coverage for mission-critical systems.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Proactive Monitoring",
          body: "We catch issues before your users do.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Iterative Improvements",
          body: "Continuous improvement, not just break-fix.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Security Patches",
          body: "Timely updates for dependencies, frameworks, and runtimes.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Backup & Recovery",
          body: "Tested recovery plans, documented and rehearsed.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Team Training",
          body: "We level up your in-house team as we go.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },

  business: {
    slug: "business",
    metaTitle: "Business — KPVE",
    metaDescription:
      "Operational strategy & digital transformation. We pair strategy with execution — turning operational ambition into shipped systems, dashboards, and processes.",
    hero: {
      titleLead: "Business",
      tagline: "Operational Strategy & ",
      taglineHighlight: "Digital Transformation",
      subtitle:
        "We help you build operational excellence and bring a strong, data-driven foundation to your business.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Business",
      body: "We pair strategy with execution — turning operational ambition into shipped systems, dashboards, and processes.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "Faster decisions with reliable, real-time data",
        "Streamlined operations that reduce cost-to-serve",
        "Process automation that frees up senior time",
        "Stakeholder-ready reporting and governance",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete business practice — strategy through delivery.",
      items: [
        {
          title: "Operational Strategy",
          body: "Roadmaps that connect tech investment to business outcomes.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Analytics & BI",
          body: "From raw data to executive-ready dashboards.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Forecasting",
          body: "Revenue, growth, and capacity models you can plan with.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Process Automation",
          body: "Automate the repetitive, free your team for the strategic.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Compliance & Risk",
          body: "Frameworks to keep growth and governance aligned.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Org Enablement",
          body: "Tooling and training for high-performing internal teams.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },

  media: {
    slug: "media",
    metaTitle: "Media — KPVE",
    metaDescription:
      "High-quality visual content that performs. Cinematic, on-brand storytelling — from product photography to launch films — produced end-to-end by a senior creative team.",
    hero: {
      titleLead: "Media",
      tagline: "High-Quality Visual Content ",
      taglineHighlight: "That Performs",
      subtitle:
        "We produce premium photography and video that elevates your brand and drives engagement.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Media",
      body: "Cinematic, on-brand storytelling — from product photography to launch films — produced end-to-end by a senior creative team.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "On-brand visual systems that scale across channels",
        "Cinematic storytelling that earns attention",
        "Repeatable production pipelines for ongoing content",
        "Performance-tested creative for paid media",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete media practice — strategy through delivery.",
      items: [
        {
          title: "Photography",
          body: "Product, lifestyle, and editorial photography in-studio or on-location.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Video Production",
          body: "From concept to delivery — directed, shot, and edited end-to-end.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Brand Films",
          body: "Narrative films that connect your brand to its audience.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Post Production",
          body: "Color, sound, and finishing at broadcast quality.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Motion & 3D",
          body: "Type, character, and product motion that elevates your story.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Social Cuts",
          body: "Short-form variants tuned to every platform.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },

  "social-media": {
    slug: "social-media",
    metaTitle: "Social Media — KPVE",
    metaDescription:
      "Audience-first social strategy & content. We build audiences through strategic social media, content creation, and brand storytelling.",
    hero: {
      titleLead: "Social Media",
      tagline: "Audience-First Social ",
      taglineHighlight: "Strategy & Content",
      subtitle:
        "We help you build audiences through strategic social media, content creation, and brand storytelling.",
      primaryCta: "Start A Project With Us",
      primaryHref: "/contact",
      secondaryCta: "Explore Our Services",
      secondaryHref: "/services",
    },
    benefits: {
      eyebrow: "Business Benefits",
      title: "Why Teams Choose Us for",
      highlight: "Social Media",
      body: "We turn always-on social into a growth channel — strategy, premium creative, and community management, run by a senior team.",
      cta: "Learn More",
      ctaHref: "/contact",
      items: [
        "Channel strategy aligned to your business goals",
        "Premium creative across short-form video, image, and copy",
        "Always-on community management & engagement",
        "Reporting tied to acquisition, not just impressions",
      ],
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "Everything",
      highlight: "Included",
      subtitle: "A complete social media practice — strategy through delivery.",
      items: [
        {
          title: "Content Strategy",
          body: "Editorial calendars built around audiences and outcomes.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Short-form Video",
          body: "Reels, Shorts, TikTok creative engineered for the algorithm.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Community",
          body: "Authentic, on-brand community engagement at scale.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Paid Social",
          body: "Performance-tested creative paired with rigorous campaign ops.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Influencer",
          body: "Vetted partnerships and end-to-end campaign management.",
          icon: "/icons/person-circle.svg",
        },
        {
          title: "Account Management",
          body: "A senior strategist as your single point of accountability.",
          icon: "/icons/person-circle.svg",
        },
      ],
    },
    process: SHARED_PROCESS,
    whyChooseUs: SHARED_WHY_CHOOSE_US,
  },
};

/** True when a service slug has a dedicated detail page. */
export function hasServicePage(slug: string): boolean {
  return slug in SERVICE_PAGES;
}
