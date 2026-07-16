export type NavLink = { label: string; href: string };

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/#home" },
  { label: "About", href: "/#about" },
  { label: "Services", href: "/services" },
  { label: "Contact Us", href: "#contact" },
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
  ctaHref: "#contact",
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
};

export const SERVICES: Service[] = [
  {
    title: "Design",
    body: "When it comes to digital agency solutions, no one does it better than the pros at KPVE. Your brand needs a high-quality design that captures your story with an engaging call to action.",
    icon: "/icons/design.svg",
  },
  {
    title: "Web Development",
    body: "We build fast, resilient, and scalable web platforms with modern stacks — engineered for performance, accessibility, and effortless maintenance as you grow.",
    icon: "/icons/web.svg",
  },
  {
    title: "Hosting",
    body: "Secure, monitored, and always-on infrastructure. We handle deployment, uptime, and scaling so your product stays online through every traffic spike.",
    icon: "/icons/hosting.svg",
  },
  {
    title: "Support",
    body: "A dedicated team on standby. From quick fixes to strategic roadmapping, we keep your product healthy long after launch day.",
    icon: "/icons/support.svg",
  },
  {
    title: "Business",
    body: "Strategy, positioning, and go-to-market. We align product decisions with real business outcomes to unlock durable, compounding growth.",
    icon: "/icons/business.svg",
  },
  {
    title: "Media",
    body: "Motion, photography, and content that moves people. We produce assets that make your brand impossible to scroll past.",
    icon: "/icons/media.svg",
  },
  {
    title: "Social Media",
    body: "Always-on content and community management. We keep your brand present, consistent, and growing across every platform that matters.",
    icon: "/icons/social.svg",
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
  { label: "About Us", href: "/#about" },
  { label: "Services", href: "/services" },
  { label: "Contact", href: "#contact" },
];

export const SOCIAL_LINKS: NavLink[] = [
  { label: "Facebook", href: "#" },
  { label: "Twitter", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "Instagram", href: "#" },
];
