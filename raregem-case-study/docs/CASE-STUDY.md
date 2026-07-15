# Rare Gem Exchange — Case Study

**Designing and building a luxury e‑commerce concierge experience for investment‑grade gemstones.**

---

## Table of Contents

1. [Project Snapshot](#1-project-snapshot)
2. [Overview](#2-overview)
3. [The Brief & the Challenge](#3-the-brief--the-challenge)
4. [Goals & Success Criteria](#4-goals--success-criteria)
5. [Audience](#5-audience)
6. [Discovery & Strategy](#6-discovery--strategy)
7. [Information Architecture](#7-information-architecture)
8. [Design Direction](#8-design-direction)
9. [Technical Architecture](#9-technical-architecture)
10. [Feature Deep‑Dives](#10-feature-deep-dives)
11. [Process & Workflow](#11-process--workflow)
12. [Challenges & Solutions](#12-challenges--solutions)
13. [Accessibility & Performance](#13-accessibility--performance)
14. [Security & Data Handling](#14-security--data-handling)
15. [Outcomes](#15-outcomes)
16. [What We Learned](#16-what-we-learned)
17. [Roadmap](#17-roadmap)
18. [Appendix — Facts & Figures](#18-appendix--facts--figures)

---

## 1. Project Snapshot

| | |
|---|---|
| **Project** | Rare Gem Exchange — marketing site, gem catalog & concierge platform |
| **Type** | Luxury e‑commerce / lead‑generation web application |
| **Voice** | Studio project (design + full‑stack build) |
| **Timeline** | ~2 weeks of active development (13 iterations over the build window) |
| **Frontend** | React 19 · Vite · React Router 7 · vanilla CSS with a design‑token system |
| **Backend** | Node.js · Express · PostgreSQL (Neon) |
| **Hosting** | Vercel (static frontend) · Render (API + keep‑alive) |
| **Scope** | 5 public/app routes · 8‑item gem catalog · rule‑based AI concierge · lead‑capture pipeline · password‑protected admin dashboard |
| **Codebase** | ~11,300 lines of frontend source · ~500 lines of backend · ~40 components |

---

## 2. Overview

Rare Gem Exchange (RGE) positions itself as a private exchange for investment‑grade coloured gemstones and fancy‑colour diamonds — Ceylon sapphires, Burmese rubies, and natural fancy pink/yellow diamonds priced from ~$12,900 to $145,000. The brand needed a digital presence that behaves less like a shop and more like a private bank: high‑trust, evidence‑heavy, and quietly persuasive.

The engagement delivered a complete product, not just a landing page:

- A **marketing home page** that establishes credibility (certifications, standards, endorsements) before it ever asks for a sale.
- A **filterable collection** and **rich gem detail pages** with spec sheets, a value‑comparison widget, and a light/dark reading mode.
- A **concierge chatbot** — a deterministic, on‑brand assistant gated behind a lead‑capture form.
- A **back‑office admin dashboard** for the client to monitor leads, waitlist signups, and full concierge transcripts in real time.
- A hardened **Express + PostgreSQL backend** that captures leads with server‑side validation, rate limiting, and injection‑safe queries.

The result reads as a single, cohesive luxury system across every surface: marketing, catalog, conversation, and operations.

---

## 3. The Brief & the Challenge

At this tier of the market, **the product is not the object — it is the trust**. A collector spending six figures on a single unheated sapphire is not persuaded by discounts or urgency banners; they are persuaded by provenance, certification, and the sense that the counterparty is more careful than they are.

That reframed the entire problem. The core challenges were:

1. **Communicate rarity and rigour without gimmicks.** No stock‑photo glamour, no countdown timers. Credibility had to be structural.
2. **Support a high‑consideration, offline‑closing sale.** Purchases of this size complete over private conversation, not a checkout button. The site's job is to *qualify and capture the lead*, then hand it to a human.
3. **Make specifications legible.** Investment buyers read gem reports like financial instruments — carat, treatment status, certificate lab, cut/polish/symmetry, measurements. The detail pages had to present this data with the density of a spec sheet and the calm of a museum label.
4. **Feel bespoke on a lean stack.** No heavyweight component library, no CMS, no design debt — a fast, self‑contained build that one small team could own end‑to‑end.

---

## 4. Goals & Success Criteria

| Goal | How it was met |
|---|---|
| Establish institutional trust | Certification ribbon (GIA/GRS/SSEF/IGI), a three‑pillar "Our Standards" section, and an endorsements marquee — all above the fold-to-mid scroll, before any ask |
| Convert intent into qualified leads | Two capture paths: a "Coming Soon" waitlist (email only) and a concierge intake form (name, contact, location, budget range, consent) |
| Present gems as investment assets | Structured three‑column spec tables, a "Your Gem vs. alternative" value‑comparison widget, and SKU/price/shipping metadata |
| Give the client operational visibility | A real‑time admin dashboard polling every 5 seconds with stats, lead tables, and readable chat transcripts |
| Keep the experience fast and self‑hosted | Vite build, no UI framework dependency, hand‑rolled CSS design system, static‑first deployment |

> **Note on metrics:** figures in this case study are derived directly from the delivered codebase (routes, components, catalog size, lines of code, feature counts). No traffic or conversion analytics are asserted, as those are the client's to measure post‑launch.

---

## 5. Audience

Three overlapping personas shaped every decision:

- **The private collector** — buys for passion and portfolio; needs provenance and discretion; values a "private viewing" over a "buy now."
- **The institutional allocator** — a fund or family office treating stones as tangible, inflation‑hedging assets; needs grading rigour, comparables, and documentation.
- **The seller / consignor** — an estate or existing owner looking to liquidate; needs a credible valuation and escrow pathway.

The concierge's decision tree is explicitly branched around these three intents — **Buying / Acquisition**, **Selling / Liquidation**, and **Authenticity & Trust** — so every visitor finds a path written for them.

---

## 6. Discovery & Strategy

The strategy crystallised into three product principles that the whole build honours:

**1. Earn the ask.** The home page is sequenced as a trust funnel, not a sales funnel:

`Hero → Certifications → About → Standards → Endorsements → Featured Gems → FAQ → Coming Soon (capture)`

Credibility (labs, standards, testimonials) is front‑loaded; the only capture moment sits at the very bottom, after the case has been made.

**2. Human‑in‑the‑loop, not human‑replaced.** The chatbot is a *concierge*, not a salesperson. It answers structured questions, then routes anything ambiguous — or any explicit request — to "an estate representative." The lead is always the goal; the bot is the qualifier.

**3. Data as a design material.** Gem specifications aren't hidden behind tabs or marketing copy. They're laid out like a laboratory report because, to this audience, the report *is* the product.

---

## 7. Information Architecture

Five routes, deliberately shallow, registered in a single router:

| Route | Purpose | In nav? |
|---|---|---|
| `/` | Marketing home + trust funnel + capture | Yes |
| `/gems` | Full catalog with search & faceted filters | Yes ("Our Gems") |
| `/gems/:id` | Individual gem detail (specs, compare, similar, inquire) | Via cards |
| `/team` | People / founder story (trust reinforcement) | Yes |
| `/admin` | Password‑protected operations dashboard | **No** — unlisted, direct‑URL only |

The app shell (`App.jsx`) conditionally strips the public chrome — header, footer, and floating concierge — on the `/admin` route, so the back office renders as a standalone full‑screen application layered above the marketing site.

A single data module (`src/data/gems.js`) is the source of truth for all eight gems, exporting the catalog plus helpers (`getGemById`, `getSimilarGems`, `formatPrice`). Both the collection grid and the detail pages read from it — no duplication, no fetch for catalog data.

---

## 8. Design Direction

The visual language is **"estate / private‑banking luxury"**: near‑black surfaces, a restrained rose‑gold accent, high‑tracking serif display type, and hard (near‑zero‑radius) edges that read as engraved rather than soft.

Anchor decisions:

- **Palette** — a single warm gold family (`#d8a07a` → `#f6b99a`) against an almost‑pure‑black canvas (`#080808`), with a graded ladder of warm‑grey text tones. A muted green appears in exactly one place — the "Your Gem" cell of the comparison widget — to quietly signal "this is yours."
- **Type** — *Cinzel* (serif, engraved capitals) for display and headings; *Montserrat* for body; *Plus Jakarta Sans* for UI labels and buttons; *Great Vibes* for the founder's handwritten signature. Letter‑spacing is treated as a first‑class token — headings run up to `0.25em` tracking to feel monumental.
- **Motion** — one shared easing curve (`cubic-bezier(0.16, 1, 0.3, 1)`) governs everything. A reusable `Reveal` component slides content up on scroll via `IntersectionObserver`, with staggered delays. Every animation degrades to nothing under `prefers-reduced-motion`.
- **Depth** — soft, long, low‑opacity shadows (e.g. `0 24px 60px -28px rgba(216,160,122,.45)`) create lift on hover without ever looking glassy or "webby."

The full token set, type scale, component recipes, and motion spec are documented separately in **`DESIGN-SYSTEM.md`**.

---

## 9. Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND  (Vercel — static SPA)                             │
│  React 19 · Vite · React Router 7 · vanilla CSS + tokens     │
│                                                              │
│   Public site            Concierge            Admin app      │
│   Home / Gems / Team     rule-based chatbot   /admin overlay │
│        │                      │                    │         │
│        └───── apiUrl() ───────┴────────────────────┘         │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │  HTTPS / JSON
┌──────────────────────────┼───────────────────────────────────┐
│  BACKEND  (Render — Node web service)                        │
│  Express · express-rate-limit · pg                           │
│   /api/waitlist   /api/customers   /api/customers/:id/chat   │
│   /api/admin/*  (login, stats, customers, waitlists)         │
│   + 14-min self-ping keep-alive (free-tier anti-sleep)       │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    PostgreSQL (Neon) — customers · waitlists
```

**Frontend.** A Vite‑built single‑page app. No UI component library — every element is hand‑built against a CSS custom‑property design system, keeping the bundle lean and the aesthetic fully bespoke. Routing is client‑side; a Vercel rewrite (`vercel.json`) sends all paths to `index.html` so deep links like `/admin` and `/gems/:id` resolve correctly.

**Backend.** A small, focused Express service. Tables (`customers`, `waitlists`) are created and migrated idempotently on boot, so the schema self‑installs on a fresh database. The API origin is injected at build time via `VITE_API_URL`, with a relative‑`/api` fallback handled by the Vite dev proxy locally.

**Configuration discipline.** No secrets in source. The database connection string, admin password, and API URL are all read from the environment; `.env` files are git‑ignored, and the server refuses to start without `DATABASE_URL`.

**Free‑tier resilience.** Render's free web services sleep after ~15 minutes idle, which would cause a cold‑start delay on the first lead of the day. A small keep‑alive module self‑pings `/api/health` every 14 minutes using Render's injected external URL, staying disabled automatically in local/dev where that variable is absent.

---

## 10. Feature Deep‑Dives

### 10.1 The Concierge Chatbot

The concierge is the product's most distinctive feature — and a deliberate engineering choice. It is **fully client‑side, deterministic, and rule‑based**: no LLM, no per‑message network calls, no unpredictable output. For a luxury brand where every word matters, that predictability is a feature, not a limitation.

**Architecture** — a clean four‑layer split across ~2,550 lines:

- **Data** (`knowledgeBase.js`) — a 16‑node conversational decision tree stored as a flat map, plus curated welcome prompts and a keyword‑to‑intent map. Copy only, no logic.
- **Engine** (`chatbotEngine.js`) — pure, side‑effect‑free functions: text normalisation (diacritic stripping, punctuation folding), a keyword‑scoring intent matcher, tree resolution, and loader timing. No React, no DOM — trivially testable.
- **State** (`useChatbot.js`) — a hook that owns the transcript, the user's position in the tree, loading state, and the simulated‑async control flow.
- **View** — the launcher, window, message bubbles, quick replies, typing indicator, and intake form.

**How matching works.** Free‑text input is normalised and scored against each node's keyword list — single‑word keywords match whole tokens, multi‑word phrases match as substrings, each hit adds one point, highest score wins, ties broken by declaration order (so high‑signal intents like *selling* and *buying* are prioritised). No match → a graceful fallback that apologises, re‑offers the curated topics, and always adds a "speak to a representative" escape hatch.

**The "thinking" illusion.** Responses are instant, but that would feel robotic. The engine inserts a randomised 1.5–2.5 s delay while cycling through domain‑flavoured loading phrases ("Consulting appraisal parameters…", "Reviewing exchange policies…"). The result feels considered and human without any actual latency cost.

**Lead gating.** The concierge is gated behind an intake form — the visitor provides name, contact (email *or* WhatsApp), location, budget range, and consent before the conversation opens. That form:

- Validates on the client and re‑validates authoritatively on the server.
- **Auto‑detects the visitor's currency** from their IP (via `ipapi.co`, with a 4‑second timeout and an AUD fallback), while never overriding a manual selection.
- Persists the lead, then attaches the full conversation to that record — debounced during chat and flushed on close/navigation via a `keepalive` request so no transcript is lost.

Marketing CTAs across the site ("Inquire Privately", "Inquire About This Gem", "Inquire About Services") all dispatch a single `rge:open-intake` window event, letting any button summon the concierge through one decoupled channel.

### 10.2 The Gem Detail Page

The most information‑dense surface in the product, composed of seven stacked modules: breadcrumb → hero → specs → included‑with‑order → comparison → similar → private‑placement CTA.

Highlights:

- **Thumbnail gallery hero** — a 7:5 split with an interactive image switcher, SKU, price, shipping estimate, and the primary "Inquire" action.
- **Three‑column spec table** — Gemstone Information, Precision & Quality, Physical Dimensions — separated by hairline rules, collapsing to a single column on mobile. This reads like a lab report by design.
- **Value‑comparison widget** — places "Your Gem" beside an alternative (e.g. *more sparkle*, *unheated*, *higher clarity*) with a highlighted price delta, teaching the buyer how colour, clarity, and treatment move value.
- **Per‑page light/dark reading mode** — a fixed toggle that flips the entire page's theme by **redefining the `--rg-*` tokens** on a single class, cascading instantly to every child component, with a 220 ms cross‑fade.
- **Scroll‑snap "Similar Gems" carousel** — ref‑driven arrow navigation over a horizontally snapping track.

### 10.3 The Collection

A search‑plus‑faceted‑filter catalog: a live text search across name/type/cut, category pills (Diamond / Ruby / Sapphire), and carat‑weight ranges — all computed client‑side over the in‑memory catalog with `useMemo`, so filtering is instant and offline. A responsive 3→2→1 column grid, staggered reveals, hover lift, and a considered empty state.

### 10.4 The Admin Dashboard

A standalone, full‑viewport operations console reachable only by direct URL:

- **Auth** — a password gate that posts to the server and persists the credential in `sessionStorage`; the server compares it in constant time and gates every admin endpoint behind an `x‑admin‑password` header.
- **Live data** — polls stats and the active tab every 5 seconds, with a "Live" indicator, skeleton loaders, and a manual refresh.
- **Stat cards** — total customers, waitlist size, share of inquiries with chat, and new‑this‑week counts.
- **Lead tables** — sortable, searchable customer and waitlist tables with consent badges, budget formatting, and mailto links.
- **Transcript viewer** — a read‑only modal that renders any lead's full concierge conversation as chat bubbles, so the client sees exactly what was asked.

At ~1,120 lines, the admin stylesheet is the single largest file in the project — a reminder that the "invisible" back office was treated as a first‑class product surface, not an afterthought.

---

## 11. Process & Workflow

The build progressed in clearly staged iterations, visible in the commit history:

1. **Foundation** — Vite + React scaffold, brand type, hero.
2. **Marketing narrative** — sections, responsiveness, typographic tuning, and the concierge chatbot.
3. **Catalog & detail** — the collection page and gem detail pages, including the light/dark variants.
4. **Backend & data** — Express + PostgreSQL, the customers/waitlist schema, and the admin dashboard.
5. **Integration & polish** — IP‑based currency detection, form revisions, the Vercel SPA rewrite, and wiring every "Inquire" CTA to the concierge.

Design decisions were encoded directly into the token layer and reusable primitives (`Reveal`, `rg-section`, `rg-heading`, `rg-eyebrow`), so consistency was enforced by the system rather than by discipline alone. Component CSS lives beside each component, keeping styling co‑located and the token file authoritative.

---

## 12. Challenges & Solutions

| Challenge | Solution |
|---|---|
| **A luxury sale doesn't have a checkout.** | Reframed the whole site around *lead qualification*. Two capture paths (waitlist + concierge intake) and a bot that hands off to humans. |
| **Chatbots feel cheap and go off‑message.** | Built a deterministic decision tree over an LLM. Every word is brand‑approved; a curated fallback and human‑handoff cover the unknown. |
| **Instant bot replies feel robotic.** | Added a randomised "thinking" delay with domain‑specific loader phrases — perceived thoughtfulness at zero real latency. |
| **Global buyers, one currency field.** | IP‑based currency auto‑detection with graceful timeout/ad‑blocker fallback to AUD, never overriding a manual choice. |
| **Two visual moods (marketing vs. reading).** | Runtime theming by token override — light mode is a single class that redefines the design tokens, not a duplicated stylesheet. |
| **Free‑tier backend cold starts.** | A 14‑minute self‑ping keep‑alive that resets the host's idle timer, disabled automatically off‑platform. |
| **Deep links 404 on a static SPA.** | A catch‑all Vercel rewrite to `index.html` so `/admin` and `/gems/:id` resolve. |
| **Lead data is sensitive.** | Parameterised queries, per‑route body caps, per‑IP rate limits, mandatory consent, and secrets kept strictly in the environment. |

---

## 13. Accessibility & Performance

- **Reduced motion** is honoured everywhere — the `Reveal` animation, card hovers, marquee, and modal transitions all fall back to static under `prefers-reduced-motion`.
- **Semantic structure & ARIA** — dialogs use `role="dialog"`/`aria-modal`, the concierge log is an `aria-live` region, accordions wire `aria-expanded`/`aria-controls`, nav states expose `aria-current`, and icon buttons carry labels.
- **Keyboard support** — Escape closes the concierge and modals, focus is managed on open, and visible focus rings use the brand accent.
- **Performance posture** — no UI framework dependency, static‑first hosting on a CDN, fonts preconnected, images `object-fit`‑cover‑cropped, and catalog filtering done in memory (zero network round‑trips).

---

## 14. Security & Data Handling

The backend was built defensively from the first commit:

- **SQL injection** — every write uses parameterised queries; values are never interpolated into SQL.
- **Rate limiting** — per‑IP caps tuned per endpoint (waitlist 5 / 10 min, customers 15 / 15 min, chat 120 / min, admin login 10 / 15 min).
- **Input validation** — email/phone format checks, numeric budget bounds (`max ≥ min`), currency whitelisting, and mandatory contact consent before any lead is stored.
- **Body caps** — small forms are capped at 12 KB; the chat‑history endpoint gets 256 KB, both scoped per‑route.
- **Admin auth** — constant‑time password comparison, a header‑gated admin surface, and a documented hardening path (hashing, JWTs, IP allowlist) for production.
- **Secret hygiene** — connection strings and passwords live only in the environment; the app fails fast if the database URL is missing.

---

## 15. Outcomes

The engagement delivered a **complete, production‑shaped product** rather than a single marketing page. Concretely, what shipped:

- **5 routes** spanning marketing, catalog, detail, team, and operations.
- **~11,300 lines** of frontend source across **~40 components** — with **zero** third‑party UI libraries.
- An **8‑gem catalog** with full spec, comparison, and "similar" relationships modelled in data.
- A **16‑node concierge** with keyword intent‑matching, human handoff, and full transcript capture.
- A **7‑endpoint API** on PostgreSQL with validation, rate limiting, and idempotent migrations.
- A **real‑time admin dashboard** giving the client end‑to‑end visibility from first click to captured lead.
- A **documented design system** (tokens, type scale, components, motion) that makes future sections cheap to add on‑brand.

Every surface — marketing, catalog, conversation, and back office — resolves to one coherent luxury identity, which was the defining objective of the brief.

---

## 16. What We Learned

- **Constraints sharpen luxury.** Choosing a deterministic chatbot and a hand‑rolled CSS system — instead of an LLM and a component kit — produced a *more* controlled, more on‑brand result, not a lesser one.
- **Perceived experience is designable.** The fake "thinking" delay is a reminder that responsiveness and *feeling considered* are different goals, and the second sometimes wins.
- **Tokens are the real deliverable.** Because theming, spacing, type, and motion were centralised early, features like per‑page light mode became a few lines rather than a refactor.
- **The back office is a product.** Treating the admin dashboard with the same craft as the home page is what makes the whole thing feel trustworthy to the people who run it.

---

## 17. Roadmap

Natural next steps beyond the delivered scope:

- Real gem photography and multi‑angle galleries (the thumbnail slots are already modelled).
- Wishlist / comparison persistence (currently non‑functional placeholders by design).
- Server‑side sessions and hashed admin credentials for production hardening.
- Analytics instrumentation to measure the conversion funnel the architecture already supports.
- A lightweight CMS or headless data source to let the client edit the catalog without a deploy.

---

## 18. Appendix — Facts & Figures

**Stack**

- Frontend: React 19, Vite, React Router 7, plain CSS with `--rg-*` design tokens
- Backend: Node.js, Express, `express-rate-limit`, `pg` (PostgreSQL / Neon)
- Hosting: Vercel (frontend), Render (backend)

**Scope by the numbers**

| Metric | Value |
|---|---|
| Public/app routes | 5 |
| React components (approx.) | ~40 |
| Frontend source lines | ~11,300 |
| Backend source lines | ~500 |
| Gem catalog items | 8 |
| Concierge decision‑tree nodes | 16 |
| Chatbot subsystem lines | ~2,550 |
| Pages subsystem lines | ~4,700 |
| API endpoints | 7 |
| Database tables | 2 (`customers`, `waitlists`) |
| UI dependencies | 0 |
| Active build window | ~2 weeks / 13 iterations |

**API surface**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check (keep‑alive) |
| POST | `/api/waitlist` | Save a "coming soon" email |
| POST | `/api/customers` | Save a concierge intake lead (upsert) |
| PATCH | `/api/customers/:id/chat` | Attach the concierge transcript |
| POST | `/api/admin/login` | Admin password auth |
| GET | `/api/admin/stats` | Dashboard metrics |
| GET | `/api/admin/customers` · `/api/admin/waitlists` | Lead tables |

**Typography**

- Display / headings: **Cinzel**
- Body: **Montserrat**
- UI / labels / buttons: **Plus Jakarta Sans**
- Signature accent: **Great Vibes**

**Core palette**

- Accent gold: `#d8a07a` / `#f6b99a`
- Canvas: `#080808`
- Text ladder: `#f2eee9` → `#8f8a85`

---

*This document describes the delivered build of Rare Gem Exchange. All figures are derived from the project's source code and configuration. Companion document: `DESIGN-SYSTEM.md`.*
