# KPVE

The KPVE website and the CRM behind it.

- **Marketing site** — home, services, case studies, about, contact. Statically
  prerendered, dark-only.
- **CRM** (`/admin`) — where enquiries from the contact form are worked into
  clients, put on services, billed, and tracked. Light/dark, staff-only.

Stack: Next.js 16 (App Router, Server Components + Server Actions) · Drizzle ORM
on Neon Postgres · Tailwind v4 · session-cookie auth.

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL and SESSION_SECRET
npm run db:migrate                # create the tables
npm run services:seed             # optional: seed the billable catalogue
npm run staff:create -- --email you@kpve.com --name "Your Name"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the site,
[/admin](http://localhost:3000/admin) for the CRM.

`SESSION_SECRET` must be generated with `openssl rand -base64 32`. Rotating it
signs every active session out.

**Payments run in simulated mode** until Stripe keys exist — payment links open
an in-app checkout that runs the real flow without moving money. Going live is
two environment variables and a webhook registration, with no code change. See
[`.env.example`](./.env.example) and [docs/CRM.md](./docs/CRM.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Drizzle Studio — browse the database |
| `npm run staff:create` | Create (or reset) a CRM login |
| `npm run services:seed` | Seed the billable service catalogue |
| `npm run revenue:snapshot` | Record this month's MRR — cron this daily |

## Layout

```
app/
  (marketing)/      public site — static
  (admin)/admin/    the CRM — overview, enquiries, clients, services, revenue, activity
  (auth)/login/     staff sign-in
  pay/              client-facing checkout pages
  api/              contact form, Stripe webhook
components/         admin/ (CRM), sections/ (marketing), ui/, layout/
lib/
  dal/              THE authorization boundary — nothing else touches the database
  actions/          server actions, one file per area
  payments/         payment providers: mock (simulated) and stripe
  db/               Drizzle schema + migrations
  billing.ts        money maths — the single source of truth for MRR
docs/               CRM.md (how it's built), USING-THE-CRM.md (how to use it)
scripts/            one-off and scheduled jobs
proxy.ts            optimistic cookie check (Next 16's renamed middleware)
```

## Docs

- **[docs/USING-THE-CRM.md](./docs/USING-THE-CRM.md)** — step-by-step guide for
  anyone using the dashboard. Start here if you're not writing code.
- **[docs/CRM.md](./docs/CRM.md)** — architecture, schema, security, payments.
- **[FEATURES.md](./FEATURES.md)** — what's built, what's next, and why.
- **[AGENTS.md](./AGENTS.md)** — read before writing code. This is Next.js 16;
  the docs shipped in `node_modules/next/dist/docs/` are the reference, not
  whatever you remember about earlier versions.

## Two rules worth keeping

**Nothing outside `lib/dal/` touches the database,** and every DAL call
authorizes. That makes access control a property of the system rather than
something each new page has to remember. `proxy.ts` only redirects on a missing
cookie — it makes no trust decisions.

**Money is integer cents and currencies are never summed together.** All of the
maths lives in `lib/billing.ts`, imported by the DAL, the actions and the UI, so
one change moves every number on screen at once.
