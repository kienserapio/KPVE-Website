'use client'

import { useEffect } from 'react'
import Reveal from './Reveal'
import './CaseStudyPage.css'

/* ════════════════════════════════════════════════════════════════════════
   Case Study — a standalone, self-contained page documenting the design +
   build of Rare Gem Exchange. Rendered WITHOUT any site chrome
   (header/footer) so it can be dropped into any React app or portfolio.

   Zero external dependencies beyond React itself — no router, no UI kit.
   All design tokens and the reveal animation are bundled in the sibling
   CaseStudyPage.css. See README.md for drop-in instructions.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Edit these two footer links for your own site ──────────────────────
   The primary button used to be a react-router <Link to="/">; on a foreign
   site that would point at that site's home, so it's a real URL now. */
const LIVE_PRODUCT_URL = 'https://raregemexchange.com'  // "View the live product"
const SECONDARY_URL = '/' // "Explore KPVE" — home of this site

const META = [
  { k: 'Client', v: 'Rare Gem Exchange' },
  { k: 'Discipline', v: 'Brand · Product Design · Full-Stack' },
  { k: 'Timeline', v: '~2 Weeks · 13 Iterations' },
  { k: 'Deliverable', v: 'Marketing · Catalog · Concierge · Ops' },
]

const PERSONAS = [
  {
    tag: 'Persona 01',
    initials: 'PC',
    name: 'The Private Collector',
    line: 'Passion meets portfolio',
    profile:
      'A high-net-worth individual who buys for love of the stone as much as for long-term value. Discreet, relationship-driven, allergic to the hard sell.',
    goals: ['Acquire rare, verifiable stones', 'Discretion and a personal relationship', 'A curated view, not a catalog dump'],
    needs: ['Provenance & certification up front', 'Private viewings over “buy now”', 'Calm, unhurried presentation'],
    built: 'A trust-first home, a private-viewing concierge path, and spec pages that read like museum labels.',
  },
  {
    tag: 'Persona 02',
    initials: 'IA',
    name: 'The Institutional Allocator',
    line: 'Stones as tangible assets',
    profile:
      'A fund or family office treating coloured gemstones as an inflation hedge and a store of tangible wealth — allocating at scale and answerable to a committee.',
    goals: ['Allocate with grading rigour', 'Defensible comparables & pricing', 'Documented, insurable provenance'],
    needs: ['Dual-lab certificates & treatment status', 'Side-by-side value comparison', 'Escrow & secure logistics'],
    built: 'The “Your Gem vs. alternative” comparison widget, lab-report spec tables, and an escrow branch in the concierge.',
  },
  {
    tag: 'Persona 03',
    initials: 'SC',
    name: 'The Seller / Consignor',
    line: 'Liquidating with confidence',
    profile:
      'An estate or existing owner looking to divest a stone or a collection — needing a credible valuation and a secure, dignified process.',
    goals: ['A credible, fair valuation', 'A secure route to sale', 'Guidance, not a lowball offer'],
    needs: ['A clear valuation pathway', 'Documentation guidance', 'Trust that the counterparty is careful'],
    built: 'A dedicated selling / liquidation concierge branch, a valuation intake, and the private-placement service band.',
  },
]

const OBJECTIVES = [
  {
    t: 'Establish institutional credibility',
    d: 'Make a new brand feel as trustworthy as a century-old house — through structure, not claims.',
    metric: 'Trust funnel · 4 credibility sections before any ask',
  },
  {
    t: 'Convert intent into qualified leads',
    d: 'Capture serious buyers with the context the team needs to close, and filter out tyre-kickers.',
    metric: '2 capture paths · consent-gated · budget + intent captured',
  },
  {
    t: 'Present gems as investment assets',
    d: 'Give buyers the evidence to justify a six-figure decision to themselves — and to a committee.',
    metric: 'Lab-report specs · comparables · provenance on every stone',
  },
  {
    t: 'Hand the team an operations layer',
    d: 'Turn a marketing site into a working pipeline the team can watch and act on daily.',
    metric: 'Real-time dashboard · 5s polling · full transcripts',
  },
]

const CHALLENGES_BIZ = [
  {
    n: '01',
    t: 'A sale with no checkout',
    d: 'Six-figure stones close over private conversation, not a cart. The site had to qualify and capture, then get out of the way of a human relationship.',
  },
  {
    n: '02',
    t: 'A credibility gap',
    d: 'A young brand competing with houses that have traded for a century. Credibility had to be engineered into every surface — labs, standards, provenance, documentation.',
  },
  {
    n: '03',
    t: 'Global, multi-currency buyers',
    d: 'Collectors and funds across continents, each thinking in their own currency and budget band — the experience had to localise without friction.',
  },
  {
    n: '04',
    t: 'A tiny team, no CRM',
    d: 'No enterprise tooling and no ops staff. Leads couldn’t vanish into an inbox — the team needed to see, read, and act on every inquiry in one place.',
  },
]

const PROCESS = [
  {
    n: '01',
    phase: 'Discovery',
    t: 'Learn the buyer’s world',
    d: 'We studied how high-value stones actually trade — auction houses, private banking, Swiss gem labs, museum provenance dossiers. The insight that reframed everything: at this tier, the product is trust, and the sale closes offline.',
  },
  {
    n: '02',
    phase: 'Strategy',
    t: 'Reframe the site as a trust funnel',
    d: 'Not a sales funnel. We mapped three personas and their journeys, then decided the home page would spend its first four sections earning credibility — and ask for nothing until the case was made.',
  },
  {
    n: '03',
    phase: 'Architecture',
    t: 'Keep it shallow and legible',
    d: 'A deliberately flat five-route map. One data module as the single source of truth for the catalog. The home page sequenced as a narrative: credibility → understanding → evidence → capture.',
  },
  {
    n: '04',
    phase: 'Wireframes',
    t: 'Prove the sequence and the density',
    d: 'Low-fidelity skeletons validated two bets before a single pixel of polish: that the trust-first sequence held attention, and that a lab-report level of spec density would read as rigour, not clutter.',
  },
  {
    n: '05',
    phase: 'Visual Design',
    t: 'Design the private-banking language',
    d: 'We built the estate aesthetic from the tokens up — the dark vault canvas, the single gold accent, the engraved serif type, the atmospheric gradients — so every future screen would inherit the same restraint.',
  },
  {
    n: '06',
    phase: 'Build',
    t: 'Hand-roll everything on tokens',
    d: 'React + Vite on the front, Express + PostgreSQL on the back. Zero UI libraries — every element built against the design system so the brand stayed bespoke and the bundle stayed lean.',
  },
  {
    n: '07',
    phase: 'Operate',
    t: 'Give the business a cockpit',
    d: 'A real-time admin console, a lead pipeline, and full concierge transcripts — so the marketing site became a working instrument the team runs the business from.',
  },
]

const GRADIENTS = [
  {
    label: 'Vault atmosphere',
    css: 'background.jpeg + rgba(5,5,5,.72) scrim',
    style: {
      backgroundImage:
        'linear-gradient(rgba(5,5,5,0.72), rgba(5,5,5,0.72)), url(/background.jpeg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    },
    note: 'A dark mineral photograph fixed behind everything, dimmed 72% so it reads as depth, not decoration.',
  },
  {
    label: 'Warm radial glow',
    css: 'radial-gradient(…, rgba(216,160,122,.08), transparent)',
    style: {
      background:
        'radial-gradient(120% 80% at 50% 30%, rgba(216,160,122,0.16), transparent 60%), #080808',
    },
    note: 'Simulates a single light source catching gold — the same warmth behind every hero.',
  },
  {
    label: 'Surface sheen',
    css: 'linear-gradient(160deg, #fff2, #0004)',
    style: {
      background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(0,0,0,0.4)), #0c0c0c',
    },
    note: 'A lit top edge on cards so surfaces feel raised without a heavy border.',
  },
  {
    label: 'Accent bar',
    css: 'linear-gradient(90deg, gold, gold-light)',
    style: { background: 'linear-gradient(90deg, #d8a07a, #f6b99a)' },
    note: 'A 2px rule that marks the principle cards — the only place colour runs edge to edge.',
  },
]

const SWATCHES = [
  { name: 'Accent Gold', hex: '#d8a07a', fg: '#4c2711' },
  { name: 'Gold Light', hex: '#f6b99a', fg: '#4c2711' },
  { name: 'Gold Deep', hex: '#4c2711', fg: '#f6b99a' },
  { name: 'Cream', hex: '#f2eee9', fg: '#080808' },
  { name: 'Canvas', hex: '#080808', fg: '#a8a29e' },
  { name: 'Muted', hex: '#a8a29e', fg: '#080808' },
]

const FEATURES = [
  {
    img: '/case-study/concierge.jpg',
    eyebrow: 'What we built · Signature',
    title: 'A concierge that qualifies',
    body: 'The brand needed to greet six-figure buyers the way a private banker would — attentive, discreet, never pushy. We built a fully client-side, rule-based concierge (no LLM, no unpredictable output) gated behind a lead-capture form that auto-detects the visitor’s currency from their IP.',
    points: [
      'A 16-node decision tree branched by buyer intent — buy, sell, verify',
      'A randomised 1.5–2.5s “thinking” pause for perceived care',
      'Every dead end offers a real estate representative',
      'The full transcript is captured for the team to read before they call back',
    ],
    flip: false,
  },
  {
    img: '/case-study/gem-light.jpg',
    eyebrow: 'What we built · Evidence',
    title: 'Detail pages that read like reports',
    body: 'To justify the price, we presented each stone the way a lab presents a certificate: a thumbnail-gallery hero, a three-column spec table, a value-comparison widget, and a reading mode that flips the whole page’s theme by redefining the design tokens on a single class.',
    points: [
      'SKU, price, provenance and shipping on every stone',
      '“Your Gem vs. alternative” with a highlighted price delta',
      'Runtime light/dark — one class, not a second stylesheet',
      'Scroll-snap “Similar Gems” to keep buyers exploring',
    ],
    flip: true,
  },
  {
    img: '/case-study/collection.jpg',
    eyebrow: 'What we built · Discovery',
    title: 'A catalog that feels curated',
    body: 'Rather than a dense retail grid, the collection reads as a considered selection — instant search, category and carat facets, all computed client-side so browsing is fast, offline, and calm.',
    points: [
      'Instant in-memory filtering — zero network round-trips',
      'Category & carat-range facets with a graceful empty state',
      'Staggered reveals, hover lift, and image zoom',
    ],
    flip: false,
  },
  {
    img: '/case-study/admin.jpg',
    eyebrow: 'What we built · Operations',
    title: 'A cockpit for the team',
    body: 'A standalone, password-gated console reachable only by direct URL. It polls leads and stats every five seconds and includes a read-only viewer for any lead’s full concierge conversation — so the team acts on real context, not guesses.',
    points: [
      'Constant-time auth, header-gated endpoints',
      'Live 5-second polling with skeleton loaders',
      'Searchable lead tables and a transcript viewer',
    ],
    flip: true,
  },
]

const OPERATE = [
  {
    t: 'Every lead, captured with context',
    d: 'Waitlist and concierge inquiries land in PostgreSQL with consent, budget, location, currency, and the full conversation — never lost in an inbox.',
  },
  {
    t: 'A live view of demand',
    d: 'The admin console polls every five seconds: who inquired, what they asked, what they can spend. The team reads the transcript before they ever pick up the phone.',
  },
  {
    t: 'Localised for the buyer, normalised for the team',
    d: 'IP-based currency detection shows buyers their own currency; the backend stores clean, comparable data with a sensible fallback.',
  },
  {
    t: 'Zero-ops resilience',
    d: 'Migrations self-install on boot and a 14-minute keep-alive keeps the free-tier backend warm — the first lead of the day never hits a cold start.',
  },
]

const CHALLENGES = [
  ['A luxury sale has no checkout.', 'Reframed the site around lead qualification — two capture paths plus a bot that hands off to humans.'],
  ['Chatbots feel cheap and go off-message.', 'Chose a deterministic decision tree over an LLM — every word brand-approved, with a curated fallback.'],
  ['Instant bot replies feel robotic.', 'Added a randomised “thinking” delay with domain phrases — perceived care at zero real latency.'],
  ['Global buyers, one currency field.', 'IP-based currency auto-detection with a graceful AUD fallback that never overrides a manual choice.'],
  ['Two moods: marketing vs. reading.', 'Runtime theming by token override — light mode is a single class redefining the tokens.'],
  ['Free-tier backend cold starts.', 'A 14-minute self-ping keep-alive that resets the host’s idle timer, disabled automatically off-platform.'],
]

const STATS = [
  { n: '5', l: 'Routes' },
  { n: '~40', l: 'Components' },
  { n: '~11.3k', l: 'Frontend LOC' },
  { n: '8', l: 'Catalog gems' },
  { n: '16', l: 'Concierge nodes' },
  { n: '7', l: 'API endpoints' },
  { n: '2', l: 'DB tables' },
  { n: '0', l: 'UI dependencies' },
]

const LEARNINGS = [
  ['Constraints sharpen luxury.', 'A deterministic chatbot and a hand-rolled CSS system produced a more controlled, more on-brand result — not a lesser one.'],
  ['Perceived experience is designable.', 'The fake “thinking” delay is a reminder that responsiveness and feeling considered are different goals.'],
  ['Tokens are the real deliverable.', 'Centralising theme, type, and motion early made features like per-page light mode a few lines, not a refactor.'],
  ['The back office is a product.', 'Treating the admin dashboard with home-page craft is what makes the whole system feel trustworthy to operate.'],
]

/* ── Lo-fi wireframe primitives (CSS skeletons, not real assets) ─────── */

function WFHome() {
  return (
    <div className="wf" aria-label="Home page wireframe">
      <div className="wf-nav">
        <span className="wf-line w40" />
        <div className="wf-nav-r"><span className="wf-line w30" /><span className="wf-line w30" /><span className="wf-btn" /></div>
      </div>
      <div className="wf-hero">
        <span className="wf-circle" />
        <span className="wf-bar w70 tall" />
        <span className="wf-line w40" />
        <span className="wf-line w30" />
        <span className="wf-btn wide" />
      </div>
      <div className="wf-row4">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="wf-chip" />)}</div>
      <div className="wf-2col">
        <span className="wf-box sq" />
        <div className="wf-stack"><span className="wf-line w60" /><span className="wf-line w90" /><span className="wf-line w80" /><span className="wf-line w50" /></div>
      </div>
      <div className="wf-row3">{Array.from({ length: 3 }).map((_, i) => <span key={i} className="wf-card" />)}</div>
      <span className="wf-box wide-strip" />
      <div className="wf-row3">{Array.from({ length: 3 }).map((_, i) => <span key={i} className="wf-box tall-img" />)}</div>
      <div className="wf-cap">Home — trust funnel</div>
    </div>
  )
}

function WFGem() {
  return (
    <div className="wf" aria-label="Gem detail wireframe">
      <span className="wf-line w30" />
      <div className="wf-2col gem">
        <div className="wf-stack">
          <span className="wf-box big-img" />
          <div className="wf-row4 thumbs">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="wf-thumb" />)}</div>
        </div>
        <div className="wf-stack">
          <span className="wf-bar w80" /><span className="wf-line w40" /><span className="wf-line w30 gold" />
          <span className="wf-line w90" /><span className="wf-line w80" />
          <span className="wf-btn wide dark" /><span className="wf-btn wide" />
        </div>
      </div>
      <div className="wf-row3 specs">{Array.from({ length: 3 }).map((_, c) => (
        <div key={c} className="wf-stack sm">{Array.from({ length: 5 }).map((_, r) => <span key={r} className="wf-line w90" />)}</div>
      ))}</div>
      <div className="wf-2col compare"><span className="wf-box sq dark" /><span className="wf-box sq" /></div>
      <div className="wf-row4">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="wf-box tall-img sm" />)}</div>
      <div className="wf-cap">Gem detail — the evidence</div>
    </div>
  )
}

function WFAdmin() {
  return (
    <div className="wf" aria-label="Admin dashboard wireframe">
      <div className="wf-admin">
        <div className="wf-side">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="wf-line w80" />)}</div>
        <div className="wf-main">
          <div className="wf-row4 stats">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="wf-stat" />)}</div>
          <div className="wf-tabs"><span className="wf-btn sm gold" /><span className="wf-btn sm" /></div>
          <div className="wf-table">{Array.from({ length: 5 }).map((_, i) => <span key={i} className="wf-tr" />)}</div>
        </div>
      </div>
      <div className="wf-cap">Admin — the cockpit</div>
    </div>
  )
}

export default function CaseStudyPage() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="csp">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="csp-topbar">
        <span className="csp-topbar-brand">Rare Gem Exchange</span>
        <span className="csp-topbar-tag">Case Study</span>
      </div>

      {/* ── Hero ────────────────────────────────────────────── */}
      <header className="csp-hero">
        <div className="csp-hero-inner">
          <Reveal as="p" className="csp-hero-eyebrow" delay={0.05}>
            Brand · Product Design · Full-Stack Build
          </Reveal>
          <Reveal as="h1" className="csp-hero-title" delay={0.12}>
            RARE GEM<br />EXCHANGE
          </Reveal>
          <div className="csp-hero-divider" aria-hidden="true">
            <span className="csp-hero-line" />
            <span className="csp-hero-diamond">◇</span>
            <span className="csp-hero-line" />
          </div>
          <Reveal as="p" className="csp-hero-sub" delay={0.22}>
            How we designed and built a private exchange for investment-grade gemstones —
            an experience that earns trust before it asks, qualifies six-figure buyers, and
            gives the team a pipeline to run the business from.
          </Reveal>

          <Reveal className="csp-hero-meta" delay={0.32}>
            {META.map((m) => (
              <div key={m.k} className="csp-meta-item">
                <span className="csp-meta-k">{m.k}</span>
                <span className="csp-meta-v">{m.v}</span>
              </div>
            ))}
          </Reveal>
        </div>

        {/* Product screenshot — anchored at the bottom, cut off */}
        <div className="csp-hero-shot" aria-hidden="true">
          <div className="csp-window">
            <div className="csp-window-bar">
              <span className="csp-dot" /><span className="csp-dot" /><span className="csp-dot" />
              <span className="csp-window-url">raregemexchange.com</span>
            </div>
            <img src="/case-study/hero.jpg" alt="" className="csp-window-img" loading="eager" />
          </div>
        </div>
      </header>

      {/* ── Overview / the client ───────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-lead-wrap">
          <p className="csp-kicker">The Client</p>
          <p className="csp-lead">
            Rare Gem Exchange is a private exchange for investment-grade coloured gemstones and
            fancy-colour diamonds — Ceylon sapphires, Burmese rubies, natural pink and yellow
            diamonds — priced from roughly $12,900 to $145,000 a stone.
          </p>
          <p className="csp-body">
            They came to us needing more than a website. They needed a digital presence that
            behaves like a private bank rather than a shop: high-trust, evidence-heavy, and quietly
            persuasive — and, behind it, a way to actually capture and act on the handful of serious
            buyers a brand like this lives on. We designed and built the whole system: brand
            expression, marketing site, catalog, concierge, and the operations layer that ties it
            together.
          </p>
        </Reveal>
      </section>

      {/* ── Problem statement ───────────────────────────────── */}
      <section className="csp-section csp-section--feature">
        <Reveal className="csp-problem">
          <p className="csp-kicker">Problem Statement</p>
          <h2 className="csp-problem-t">
            How do you sell a six-figure stone to someone who will never click “add to cart”?
          </h2>
          <p className="csp-body">
            This market runs on trust, provenance, and discretion — not discounts or urgency. Rare
            Gem Exchange needed to establish institutional credibility as a young brand, capture the
            small number of genuinely serious buyers, and give a lean team visibility into who was
            inquiring — all on a self-owned stack with no CMS and no CRM. The brief, distilled:
            <em> earn trust before asking, qualify the serious few, and hand the team a pipeline.</em>
          </p>
        </Reveal>
      </section>

      {/* ── Business challenges ─────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Business Challenges</p>
          <h2 className="csp-h2">What made this hard</h2>
        </Reveal>
        <div className="csp-grid csp-grid-2">
          {CHALLENGES_BIZ.map((c, i) => (
            <Reveal key={c.n} className="csp-bizc" delay={0.05 + i * 0.06}>
              <span className="csp-bizc-n">{c.n}</span>
              <div>
                <h3 className="csp-card-t">{c.t}</h3>
                <p className="csp-card-d">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── User personas ───────────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Who We Designed For</p>
          <h2 className="csp-h2">Three buyers, three journeys</h2>
          <p className="csp-body csp-narrow">
            Every decision traces back to one of three people. The concierge’s decision tree is
            branched around exactly these intents — buying, selling, and verifying — so each visitor
            meets a path written for them.
          </p>
        </Reveal>
        <div className="csp-personas">
          {PERSONAS.map((p, i) => (
            <Reveal key={p.name} className="csp-persona" delay={0.05 + i * 0.08}>
              <div className="csp-persona-head">
                <span className="csp-persona-avatar" aria-hidden="true">{p.initials}</span>
                <div>
                  <span className="csp-persona-tag">{p.tag}</span>
                  <h3 className="csp-persona-name">{p.name}</h3>
                  <p className="csp-persona-line">{p.line}</p>
                </div>
              </div>
              <p className="csp-persona-profile">{p.profile}</p>
              <div className="csp-persona-cols">
                <div>
                  <p className="csp-persona-label">Goals</p>
                  <ul className="csp-mini">{p.goals.map((g) => <li key={g}>{g}</li>)}</ul>
                </div>
                <div>
                  <p className="csp-persona-label">Needs</p>
                  <ul className="csp-mini">{p.needs.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
              </div>
              <div className="csp-persona-built">
                <span className="csp-persona-built-tag">What we built</span>
                {p.built}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Goals & objectives ──────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Goals & Objectives</p>
          <h2 className="csp-h2">What success had to look like</h2>
        </Reveal>
        <div className="csp-objectives">
          {OBJECTIVES.map((o, i) => (
            <Reveal key={o.t} className="csp-obj" delay={0.04 + i * 0.06}>
              <div className="csp-obj-main">
                <h3 className="csp-obj-t">{o.t}</h3>
                <p className="csp-card-d">{o.d}</p>
              </div>
              <div className="csp-obj-metric">{o.metric}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Process ─────────────────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">The Process</p>
          <h2 className="csp-h2">From understanding to operating</h2>
          <p className="csp-body csp-narrow">
            Seven phases, each answering a question the last one raised — from “how does this market
            actually work?” to “how does the team run it every day?”
          </p>
        </Reveal>
        <div className="csp-process">
          {PROCESS.map((p, i) => (
            <Reveal key={p.n} className="csp-step" delay={0.03 + i * 0.05}>
              <div className="csp-step-rail" aria-hidden="true">
                <span className="csp-step-n">{p.n}</span>
              </div>
              <div className="csp-step-body">
                <span className="csp-step-phase">{p.phase}</span>
                <h3 className="csp-step-t">{p.t}</h3>
                <p className="csp-card-d">{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Wireframes ──────────────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Wireframes</p>
          <h2 className="csp-h2">Structure before surface</h2>
          <p className="csp-body csp-narrow">
            Before any visual polish, low-fidelity skeletons let us test the two bets the whole
            project rested on: that a trust-first sequence would hold attention, and that
            lab-report density would read as rigour. Layout first, decoration later.
          </p>
        </Reveal>
        <div className="csp-wires">
          <Reveal className="csp-wire" delay={0.05}>
            <WFHome />
            <ul className="csp-mini csp-wire-notes">
              <li>Credibility stacked above the fold — labs, standards, endorsements.</li>
              <li>A single capture moment, deliberately last.</li>
            </ul>
          </Reveal>
          <Reveal className="csp-wire" delay={0.13}>
            <WFGem />
            <ul className="csp-mini csp-wire-notes">
              <li>Gallery hero paired with a spec block, not marketing copy.</li>
              <li>Comparison and “similar” to keep serious buyers exploring.</li>
            </ul>
          </Reveal>
          <Reveal className="csp-wire" delay={0.21}>
            <WFAdmin />
            <ul className="csp-mini csp-wire-notes">
              <li>Stats, then a switchable table, then a transcript view.</li>
              <li>Designed as its own product, not a bolt-on.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── Design thinking ─────────────────────────────────── */}
      <section className="csp-section csp-section--feature">
        <div className="csp-think">
          <Reveal className="csp-think-l">
            <p className="csp-kicker">Design Thinking</p>
            <h2 className="csp-h2">How we arrived at the look</h2>
          </Reveal>
          <Reveal className="csp-think-r" delay={0.1}>
            <p className="csp-body">
              We started from the buyer’s world, not from web trends. The reference points were
              private banking, auction-house catalogues, museum labels, and Swiss gem-lab reports —
              places where restraint signals seriousness. Retail e-commerce patterns (bright,
              promotional, dense) were the anti-brief.
            </p>
            <p className="csp-body">
              That led to a single organising idea: the site should feel like a vault at night,
              where the stones are the only source of colour. Everything downstream — the
              near-black canvas, the one gold accent, the engraved type, the atmospheric
              gradients — follows from that image.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Design decisions: background & atmosphere ───────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Design Decisions · Atmosphere</p>
          <h2 className="csp-h2">The vault, built from light</h2>
        </Reveal>
        <div className="csp-atmos">
          <Reveal className="csp-atmos-visual" delay={0.05}>
            <div className="csp-atmos-img" />
            <span className="csp-pair-cap">background.jpeg · fixed · 72% black scrim</span>
          </Reveal>
          <Reveal className="csp-atmos-text" delay={0.12}>
            <p className="csp-body">
              A single dark mineral photograph sits <em>fixed</em> behind the entire site, dimmed by
              a <code>rgba(5,5,5,0.72)</code> scrim. Fixed position means content floats over a
              stable, deep backdrop as you scroll — a subterranean, vault-like calm rather than a
              busy hero image. The scrim is doing the real work: it pushes the photograph back into
              atmosphere so it never competes with the stones or the type.
            </p>
            <p className="csp-body">
              Over that base we layer <em>gradients as lighting</em>, not decoration. Warm radial
              glows imply a single light source catching gold; a soft top-sheen lifts each card;
              one gold bar is the only place colour ever runs edge to edge. Every value is
              low-opacity, so nothing reads as “webby.”
            </p>
          </Reveal>
        </div>

        <Reveal className="csp-grads" delay={0.1}>
          {GRADIENTS.map((g) => (
            <div key={g.label} className="csp-grad">
              <span className="csp-grad-swatch" style={g.style} />
              <span className="csp-grad-label">{g.label}</span>
              <code className="csp-grad-css">{g.css}</code>
              <span className="csp-grad-note">{g.note}</span>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── Design decisions: palette & type ────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Design Decisions · System</p>
          <h2 className="csp-h2">One accent, engraved type, hard edges</h2>
          <p className="csp-body csp-narrow">
            A single warm gold carries every emphasis, so attention is always earned. Cinzel’s
            inscriptional capitals bring gravitas; wide tracking makes them monumental. Corners stay
            hard — <code>0</code> radius on the marketing side reads as chiselled, like a certificate
            or a vault door.
          </p>
        </Reveal>

        <Reveal className="csp-swatches" delay={0.08}>
          {SWATCHES.map((s) => (
            <div key={s.name} className="csp-swatch" style={{ background: s.hex, color: s.fg }}>
              <span className="csp-swatch-name">{s.name}</span>
              <span className="csp-swatch-hex">{s.hex}</span>
            </div>
          ))}
        </Reveal>

        <Reveal className="csp-type" delay={0.14}>
          <div className="csp-type-row">
            <span className="csp-type-label">Cinzel — Display</span>
            <span className="csp-type-sample csp-type-serif">RARE GEM EXCHANGE</span>
          </div>
          <div className="csp-type-row">
            <span className="csp-type-label">Montserrat — Body</span>
            <span className="csp-type-sample csp-type-body">Investment-grade gemstones, documented like financial instruments.</span>
          </div>
          <div className="csp-type-row">
            <span className="csp-type-label">Plus Jakarta — UI</span>
            <span className="csp-type-sample csp-type-ui">EXPLORE THE COLLECTION · INQUIRE PRIVATELY</span>
          </div>
          <div className="csp-type-row">
            <span className="csp-type-label">Great Vibes — Accent</span>
            <span className="csp-type-sample csp-type-sig">Julien Marchand</span>
          </div>
        </Reveal>
      </section>

      {/* ── Endorsements strip ──────────────────────────────── */}
      <Reveal className="csp-strip">
        <img src="/case-study/endorsements.jpg" alt="Industry endorsements marquee" className="csp-strip-img" loading="lazy" />
        <span className="csp-strip-cap">Trust, front-loaded — the endorsements marquee</span>
      </Reveal>

      {/* ── Feature deep-dives ──────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">What We Delivered</p>
          <h2 className="csp-h2">Four surfaces, one identity</h2>
        </Reveal>

        <div className="csp-features">
          {FEATURES.map((f) => (
            <Reveal key={f.title} className={`csp-feature${f.flip ? ' csp-feature--flip' : ''}`}>
              <div className="csp-feature-media">
                <img src={f.img} alt={f.title} className="csp-feature-img" loading="lazy" />
              </div>
              <div className="csp-feature-text">
                <p className="csp-kicker">{f.eyebrow}</p>
                <h3 className="csp-feature-t">{f.title}</h3>
                <p className="csp-card-d">{f.body}</p>
                <ul className="csp-check">
                  {f.points.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Dark/light pairing ──────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Runtime Theming</p>
          <h2 className="csp-h2">One page, two moods</h2>
          <p className="csp-body csp-narrow">
            The gem detail page ships a reading-mode toggle. Light mode is implemented by redefining
            the <code>--rg-*</code> tokens on a single class — the whole subtree recolours through
            the cascade. No duplicated stylesheet.
          </p>
        </Reveal>
        <div className="csp-pair">
          <Reveal className="csp-pair-item" delay={0.05}>
            <img src="/case-study/gem-dark.jpg" alt="Gem detail — dark mode" loading="lazy" />
            <span className="csp-pair-cap">Dark — default tokens</span>
          </Reveal>
          <Reveal className="csp-pair-item" delay={0.14}>
            <img src="/case-study/gem-light.jpg" alt="Gem detail — light mode" loading="lazy" />
            <span className="csp-pair-cap">Light — token override</span>
          </Reveal>
        </div>
      </section>

      {/* ── How we help them operate ────────────────────────── */}
      <section className="csp-section csp-section--feature">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">How We Help Them Operate</p>
          <h2 className="csp-h2">Not just a storefront — an instrument</h2>
          <p className="csp-body csp-narrow">
            The most valuable thing we handed over isn’t a page. It’s the pipeline behind it — the
            layer that turns a visitor into a captured, contextualised, actionable lead the team can
            work the same day.
          </p>
        </Reveal>
        <div className="csp-grid csp-grid-2">
          {OPERATE.map((o, i) => (
            <Reveal key={o.t} className="csp-card" delay={0.05 + i * 0.06}>
              <h3 className="csp-card-t">{o.t}</h3>
              <p className="csp-card-d">{o.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Challenges & solutions ──────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">Challenges & Solutions</p>
          <h2 className="csp-h2">Where the problem reshaped the build</h2>
        </Reveal>
        <div className="csp-cs">
          {CHALLENGES.map(([c, s], i) => (
            <Reveal key={c} className="csp-cs-row" delay={0.03 + i * 0.05}>
              <p className="csp-cs-c">{c}</p>
              <p className="csp-cs-s">{s}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── By the numbers ──────────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">By the Numbers</p>
          <h2 className="csp-h2">What shipped</h2>
        </Reveal>
        <div className="csp-stats">
          {STATS.map((s, i) => (
            <Reveal key={s.l} className="csp-stat-cell" delay={0.03 + i * 0.04}>
              <span className="csp-stat-n">{s.n}</span>
              <span className="csp-stat-l">{s.l}</span>
            </Reveal>
          ))}
        </div>
        <Reveal className="csp-mobile-row" delay={0.1}>
          <img src="/case-study/mobile.jpg" alt="Responsive mobile home" className="csp-mobile-img" loading="lazy" />
          <div className="csp-mobile-text">
            <h3 className="csp-feature-t">Responsive to the pixel</h3>
            <p className="csp-card-d">
              Nine bespoke breakpoints from 1024 down to 360px. Every step reduces type size,
              tracking, and padding together — the layout is re-composed, never merely reflowed —
              and every animation degrades gracefully under <code>prefers-reduced-motion</code>.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── Learnings ───────────────────────────────────────── */}
      <section className="csp-section">
        <Reveal className="csp-section-head">
          <p className="csp-kicker">What We Learned</p>
          <h2 className="csp-h2">Takeaways</h2>
        </Reveal>
        <div className="csp-grid csp-grid-2">
          {LEARNINGS.map(([t, d], i) => (
            <Reveal key={t} className="csp-learn" delay={0.05 + i * 0.06}>
              <h3 className="csp-card-t">{t}</h3>
              <p className="csp-card-d">{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA / footer ────────────────────────────────────── */}
      <footer className="csp-cta">
        <Reveal className="csp-cta-inner">
          <p className="csp-kicker">Let’s build something rare</p>
          <h2 className="csp-cta-title">Have a high-trust product<br />that deserves this level of craft?</h2>
          <div className="csp-cta-actions">
            <a
              href={LIVE_PRODUCT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="csp-btn csp-btn--primary"
            >
              View the live product
            </a>
            <a
              href={SECONDARY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="csp-btn csp-btn--ghost"
            >
              Explore KPVE
            </a>
          </div>
          <p className="csp-cta-foot">Rare Gem Exchange · Design & Full-Stack Case Study</p>
        </Reveal>
      </footer>
    </div>
  )
}
