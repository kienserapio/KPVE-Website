# KPVE CRM — Features & Roadmap

The CRM for the business. The website contact form feeds enquiries (leads);
staff triage them, convert them into clients, put those clients on services,
and track the recurring revenue and follow-ups that come out of it.

Stack: Next.js 16 (App Router, Server Components + Server Actions), Drizzle ORM
on Postgres (Neon), Tailwind. Auth via signed session cookie; every read/write
re-authorizes in the DAL layer.

---

## Current state (built)

### Access & shell
- `/admin` is gated by session cookie (`proxy.ts`) and re-verified per page/action.
- Sidebar nav: **Overview · Enquiries · Clients · Services · Activity**, plus
  light/dark theme toggle.
- No public signup — staff are seeded via `scripts/create-staff-user.ts`.

### Overview dashboard — `/admin`
The landing page. A live, at-a-glance read of the whole CRM (server-rendered on
every visit; no stale numbers).
- **Revenue KPIs** (top row): MRR · ARR · One-off booked · Paying clients.
- **Pipeline KPIs**: New enquiries · High priority (open) · Active clients ·
  Conversion rate (won / all-time enquiries).
- **Revenue by service**: monthly-equivalent bar per service, biggest first.
- **Upcoming bills**: what's due in the next 30 days across all clients, overdue
  flagged red, each linking to its client.
- **Enquiries — last 8 weeks**: weekly volume bar chart.
- **Pipeline**: enquiries by status (New → … → Archived), horizontal bars.
- **By category**: enquiry volume per service category.
- **Tasks due**: overdue + due-today follow-ups across *all* clients, each linking
  to its client. This is the daily "what needs doing" list.
- **Recent enquiries**: newest submissions with quick links.
- Charts are hand-rolled SVG/CSS — no chart dependency, theme-aware (light/dark),
  and directly labelled so they need no legend or hover to read.

### Enquiries (leads) — `/admin/enquiries`
- Every website contact-form submission lands here.
- **Topic-led table**: leads with **Category** + message excerpt (what they want),
  not the person's name. Name/email are a secondary "From" column.
- **Category** — one of: General, Design, Web Development, Hosting, Support,
  Business, Media, Social Media (mirrors the 7 site services + a default).
  Staff-set during triage; the public form does not send it yet.
- **Priority** — High / Medium / Low, staff-set.
- **Status pipeline** — New → Contacted → Qualified → Converted → Archived.
- Filters: status pills + category dropdown + debounced search (name/email/message).
- Stat cards: New · High priority (open) · This week · Total.
- **Export CSV** — respects the active filters (BOM for Excel, formula-injection-safe).
- **Enquiry detail** (`/admin/leads/[id]`): full message, contact card, reply-by-email,
  editor for status / category / priority / assignee / internal notes, and a
  **Convert to client** action.

### Services — `/admin/services`
The billable catalogue: what KPVE charges for. **Staff-created — adding "Emails,
$11/month" is a form submission, not a migration and a deploy.**
- Each entry has a name, description, default amount, currency and billing cycle
  (One-off / Weekly / Monthly / Quarterly / Annually).
- Those are *defaults*. They're copied onto a client when the client is put on
  the service, so repricing the catalogue never silently reprices existing
  clients.
- **Archive** keeps history and hides it from the picker; **Delete** is safe too —
  each client's line owns its own name and price, so deleting a catalogue entry
  never changes anyone's billing.
- Shows how many clients are on each service.
- Seeded with the 7 site services + Emails via `npm run services:seed`.

This is deliberately **not** the same list as the enquiry `category` enum. That
one mirrors the seven marketing service pages and exists for triage; this one is
what gets invoiced and changes whenever the business changes.

### Clients — `/admin/clients`
- A won enquiry, promoted into an ongoing relationship. Separate lifecycle from
  leads: **Prospect / Active / On hold / Completed / Churned**.
- Contact details are **copied at conversion**, so editing a client never rewrites
  the original enquiry. The two stay linked both ways (client shows "View original
  enquiry"; enquiry shows "View client").
- List table: name/company, category, status, **open-task count**, **MRR**, last
  updated. Filters (status + category + search) and stats (MRR · Active · Open
  tasks · Total).
- **+ New client** (`/admin/clients/new`) — name, company, email, phone, owner,
  notes. Nothing else. Creating a client is a fifteen-second job; what they pay
  for is attached afterwards, because one client has many services.
- **Export CSV** — respects the active filters. MRR/ARR export as plain decimals
  so the column actually sums in a spreadsheet.
- **Client detail** (`/admin/clients/[id]`):
  - **Money header**: MRR · ARR · active service count · next bill date.
  - **Services & billing** — every line the client pays for. Add from the
    catalogue (price + cycle prefill, all overridable) or as a custom line.
    Per line: status dropdown (Draft / Awaiting payment / Active / Paused /
    Cancelled), **Mark billed** to roll the cycle forward, inline edit, remove.
    Overdue bill dates flag red. Only **Active** lines count toward MRR.
  - **Tasks & follow-ups** — the "what's next / reply back" list. Add a task with an
    optional due date, check it off, delete it. Overdue tasks flag red; completed
    tasks collapse. Each task records who added it.
  - Editor: name, company, email, phone, category, status, account owner, notes.
    Two-click delete (cascades to the client's tasks and services).
  - Contact sidebar with reply-by-email and origin link.

### How the money maths works
One place, `lib/billing.ts`, imported by the DAL, the actions and the UI:
- Amounts are **integer cents**, never floats. Currency is stored per line.
- MRR: weekly × 52/12 · monthly × 1 · quarterly ÷ 3 · annually ÷ 12. ARR = MRR × 12.
- Weekly is 52/12, not ×4 — "×4" under-reports weekly revenue by 8%.
- One-offs are excluded from MRR and reported separately as booked revenue.
- **Currencies are never summed together.** Totals group by currency; where more
  than one is in play the UI shows the largest and says so.
- Month arithmetic clamps to end-of-month, so a service started on the 31st
  doesn't skip February.

### Activity — `/admin/activity`
- Audit trail of enquiry, client, task and billing actions plus sign-ins, newest
  first, with deep links to the entity.

### Data model
- `leads` — enquiry + `category`, `priority`, `status`, `assigned_staff_id`, notes.
- `clients` — `status`, `category`, `assigned_staff_id`, `notes`, `source_lead_id`
  (provenance). The old freeform `value` column is kept read-only as
  `legacyValue` and shown as a note where set; it's superseded by
  `client_services`.
- `services` — the catalogue: `name`, `slug` (unique), `description`,
  `default_amount_cents`, `default_currency`, `default_interval`, `is_active`.
- `client_services` — one billable line: `client_id` (cascade), `service_id`
  (nullable, ON DELETE SET NULL), `label`, `amount_cents`, `currency`,
  `interval`, `status`, `started_at`, `next_bill_at`, `cancelled_at`, `notes`.
- `client_tasks` — `title`, `done`, `due_at`, `created_by`, `completed_at`
  (cascade-deletes with its client).
- `activity_log` — generic audit table.
- `staff_users` — dashboard logins (no roles yet — single entity type).

---

## How to convert an enquiry into a client

1. Open **Enquiries** (`/admin`).
2. Click the enquiry (the message text is the link).
3. On the enquiry detail page, scroll to the editor card. At the bottom, under
   **"Won this enquiry?"**, click **Convert to client**.
4. You're taken straight to the new client page. The enquiry is marked
   **Converted** and linked to the client.

Notes:
- Conversion copies name, email, phone, category and assignee onto the new client
  and sets its status to **Active**.
- It's safe to click once — if a client already exists for that enquiry, the button
  is replaced by **View client →** instead of creating a duplicate.
- Origin is preserved: the client's sidebar links back to the original enquiry.
- Conversion does **not** ask about money. Add services on the client page once
  you know what they're actually buying.

---

## How to onboard a client end to end

1. **Services** (`/admin/services`) — make sure what you're selling is on the
   list, with the right price and cycle. Add it if not.
2. **Clients → + New client**, or convert a won enquiry. Name and email is enough.
3. On the client page, **Add service** — pick from the catalogue, adjust the
   price or cycle for this client if needed, set the start date.
   - Not paid yet? Set the status to **Awaiting payment**. It won't count toward
     MRR until you flip it to Active.
   - Repeat for every line: Emails, Hosting, the build fee, whatever.
4. The header now shows their MRR and next bill date; the Overview rolls it into
   the business-wide MRR and the upcoming-bills list.
5. Add **tasks** for the onboarding steps you owe them.
6. Each cycle, hit **Mark billed** on a line to roll its due date forward. Billing
   a few days late doesn't shift the whole schedule — the roll is from the due
   date, not from today.

---

## Roadmap / ideas (not built)

Prioritized against what the site actually is — a remote-first agency with 7
services, a contact form, case studies, and testimonials.

### Quick wins (high value, low effort)
- **Category on the contact form** — a "What do you need?" dropdown (+ optional
  budget/timeline) that pre-fills the enquiry category and removes manual triage.
- **Email notify on new lead** — the `api/contact/route.ts` handler already has a
  stubbed hook for Resend. Send staff an email + link on each submission.
- **Response-time / aging** — flag "New" enquiries older than a threshold; track
  time-to-first-contact.
- **Saved filters** — pin common views (e.g. "High priority, New").

### Pipeline & reporting
- **Kanban pipeline** — drag enquiries across status columns.
- **Source attribution** — `leads.source` already stores the origin page; add
  UTM/referrer capture and report which service pages and channels convert.
- **Revenue trend over time** — MRR by month, new vs churned MRR. Needs a history
  table or an event log; today's numbers are a point-in-time snapshot.

### Done since first draft
- ✅ **Overview dashboard** — KPIs, weekly-volume chart, pipeline + category charts,
  global tasks-due list, recent enquiries. (`/admin`)
- ✅ **CSV export** — enquiries and clients, filter-aware, injection-safe.
- ✅ **Global tasks-due view** — overdue + due-today across all clients, on the
  Overview.
- ✅ **Numeric value + currency + MRR** — replaced the freeform `clients.value`
  with the `services` catalogue and `client_services` lines. (CRM Prio P0)
- ✅ **Staff-created service categories** — `/admin/services`. (CRM Prio P1)
- ✅ **Slim client form + add-on services** — (CRM Prio P2)
- ✅ **Revenue on the dashboard** — MRR/ARR/one-off tiles, revenue-by-service
  chart, upcoming-bills list.

### Revenue (agency-specific)
- **Quotes / proposals** — draft per service, track sent → accepted.
- **Tax / GST** — Australian clients are 10% GST if KPVE is registered. Decide
  tax-inclusive pricing vs a tax line before invoicing for real.

### Relationship
- **Company / contact linking** — collapse multiple enquiries from the same
  email/company into one record with history (dedup).
- **Notes timeline** — replace the single notes blob with a threaded log of calls,
  meetings, and updates (who / when).
- **Testimonial request** — the site has a testimonials section; on a client moving
  to Completed, auto-request a review.
- **Case-study pipeline** — the site has a "become our next case study" CTA; track
  candidate clients → permission → published.

### Bigger bets
- **Staff roles** — Admin vs Member, "my leads", round-robin assignment.
- **Recurring task templates** — auto-create an onboarding checklist per new client
  per service.
- **Client portal** — clients log in to see project status, tasks, invoices.
- **In-app notifications** — bell + daily email digest.

---

# CRM Prio

The direction changed after the 22 Jul call. This is no longer "a dashboard for
the website's contact form" — it's **the CRM for the business**. Enquiries are
one input; the product is the client record and everything we bill, do, and owe
them after that. Reference point is Salesforce/HubSpot shape, built for one
agency, not a general product.

**North star (Dimitrios):** *"I'd love to be able to onboard a client totally — a
real client."* Everything below is ordered so that end-to-end path closes as
early as possible. Ship in phases, each phase usable on its own.

> **Status: P0, P1 and P2 are built and live on `feat/crm`.** The CRM now
> models money properly, the catalogue is staff-editable, and the client form is
> identity-only with services attached afterwards. P3 (Stripe) is next and is
> the first phase that needs work outside the codebase — see *Manual steps*
> at the bottom.

## What the call actually asked for

| Ask | What it means in the model |
|---|---|
| "deal or value should be amount + weekly/monthly/annually dropdown, so we can calculate" | Kill the free-text `clients.value`. Money = integer minor units + currency + billing interval. Normalize to MRR/ARR. |
| "we should be able to create categories ourselves — Emails, charged monthly, $11/month" | Service categories become **data, not a Postgres enum**. Staff create them, each with a default price + interval. |
| "really this form should be just to add them as a new client" | `/admin/clients/new` slims to identity only. No money fields on the create form. |
| "an add-on if we want to create a billing cycle or service for them" | Billing is a **separate object attached to a client** (many per client), added after creation — not a column on the client. |
| "we might need to send them a payment link via Stripe" | Each service subscription can mint a Stripe payment link / subscription and track paid state. |
| "it's a CRM for our business… good to do step by step" | Phase it. No big-bang rewrite. |

Consequence: **one client can have many billable services** (Emails $11/mo +
Hosting $30/mo + a one-off $2,500 site build). A single `value` column can never
express that. This is the core structural change; everything else follows.

---

## ✅ P0 — Money that computes — BUILT

Replaced `clients.value` (free text) with a real money model. Nothing else in
this list works until this lands.

**New table `services`** — the staff-created catalog ("Emails", "Hosting",
"Retainer", "Site build"):
- `name`, `slug`, `description`
- `default_amount_cents` (integer, never float), `default_currency` (ISO 4217)
- `default_interval` — `one_off | weekly | monthly | quarterly | annually`
- `is_active`, `created_by`, timestamps

**New table `client_services`** — an instance of a service sold to a client:
- `client_id` (cascade), `service_id` (nullable — allows a bespoke line)
- `label` (defaults from service, overridable per client)
- `amount_cents`, `currency`, `interval` (copied from catalog at attach time so
  a later catalog price change doesn't silently reprice existing clients —
  same copy-at-conversion rule already used for lead → client)
- `status` — `draft | pending_payment | active | paused | cancelled`
- `started_at`, `next_bill_at`, `cancelled_at`, `notes`

**Normalization (single source of truth, `lib/billing.ts`):**
```
MRR = weekly × 52 / 12 · monthly × 1 · quarterly ÷ 3 · annually ÷ 12
ARR = MRR × 12
one_off is excluded from MRR/ARR — it's booked revenue, reported separately
```
The same factors are duplicated once, as SQL, in `lib/dal/clients.ts` so the
list page stays a single query instead of N+1. The two implementations are
cross-checked in testing and must be changed together.

**Migration:** kept `clients.value` read-only as `legacyValue` (shown as a muted
note on the client detail) rather than parsing free text into money. The DB
column is still called `value` — renaming it buys nothing and costs a migration.
Staff re-enter real numbers as they touch each client; drop it once empty.

**Done:** a client detail page lists its services with amounts, and the client's
MRR is computed, not typed.

## ✅ P1 — Staff-created categories — BUILT

`service_category` is a `pgEnum` — adding "Emails" would have meant a migration
and a deploy. That is exactly what the call rejected.

- Catalogue CRUD at `/admin/services` — name, description, price, currency,
  cycle, archive/restore, delete.
- Leads keep the enum for triage (it mirrors the 7 marketing service pages and
  shouldn't drift). The **billable** catalogue is the new table. Two different
  concepts that happen to share a word; not merged.
- Seeded from the 7 existing services + Emails: `npm run services:seed`.

**Done:** Dimitrios can add "Emails — $11/month" himself, with no deploy.

## ✅ P2 — Slim client form + "Add service" add-on — BUILT

- `/admin/clients/new` = name, company, email, phone, owner, notes. That's it.
- Client detail has an inline **Add service** panel: pick from the catalogue →
  price + cycle prefill → override if needed → attach. Repeatable.
- Client header shows **MRR · ARR · services · next bill date**.
- Lead → client conversion stays as-is and does *not* ask for money.
- Extras that came with it because the panel would feel half-built without them:
  **Mark billed** (rolls the cycle forward from the due date, not from today),
  per-line status dropdown, inline edit, overdue flagging, and the Overview's
  upcoming-bills list.

**Done:** the create form has zero money fields and services are attached after
the fact, many per client.

## P3 — Stripe (next)

The schema is already shaped for this: `client_services.status` has
`pending_payment`, and `next_bill_at` is the field a webhook would stamp.

Per `client_services` row, in ascending order of effort:
1. **Payment link** — generate a Stripe Payment Link for the amount/interval,
   store `stripe_payment_link_url`, copy-to-clipboard + email it from the client
   page. Cheapest path to actually taking money.
2. **Webhook** (`app/api/stripe/webhook/route.ts`) — on
   `checkout.session.completed` / `invoice.paid`, flip the service
   `pending_payment → active`, stamp `next_bill_at`, write `activity_log`.
3. **Real subscriptions** — Stripe Customer per client
   (`clients.stripe_customer_id`), Price per catalog service, Subscription per
   `client_services` row. Stripe becomes the source of truth for billing state;
   we mirror it.
4. **`payments` table** — amount, currency, status, paid_at, stripe ids, so the
   client page shows payment history and the dashboard can show collected vs
   expected.

Signature verification on the webhook is mandatory; treat all Stripe ids as
untrusted input until verified.

**Done when:** a real client receives a link, pays, and the CRM knows — without
anyone editing a status by hand.

## P4 — Revenue view (partly built)

The Overview is no longer lead-shaped — it leads with MRR · ARR · one-off booked
· paying clients, plus revenue-by-service and upcoming bills. Still to come:
- **New MRR this month / churned MRR** — needs history. Today's numbers are a
  point-in-time snapshot; there's no record of what MRR was last month.
- **Revenue trend, 12 months** — same dependency.
- **Outstanding** — needs the `payments` table from P3.

## P5 — Onboard one real client, end to end

The acceptance test for P0–P4, not a separate feature. Walk one real client
(e.g. Rare Gem Exchange) through: enquiry → convert → attach services → Stripe
link → paid → onboarding tasks → active, and fix whatever breaks. Everything
except the Stripe step works today. Supporting pieces this will surface:
- **Onboarding checklist templates** — per catalogue service, auto-create tasks
  on attach (kickoff call, assets, DNS, credentials, go-live).
- **Notes timeline** — replace the notes blob with dated entries (who/when).
- **Documents** — contract/brief per client.

## P6 — Salesforce shape (only if the above holds)

- **Accounts + contacts** — a company with multiple people, instead of one
  name/email per client.
- **Deals / opportunities** — value + stage + close date, separate from lead
  triage, so the pipeline is money-weighted.
- **Roles** — Admin vs Member, "my clients", assignment.
- **Client portal** — the client logs in: status, invoices, tasks.

---

### Build order (one line)

`✅ P0 money model → ✅ P1 catalogue → ✅ P2 slim form + add-on → P3 Stripe link → P5 onboard one real client → P3 webhooks/subscriptions → P4 revenue history → P6`

Earlier roadmap items still stand but rank below this: contact-form category
dropdown and new-lead email notify are cheap and can slot in anywhere.

---

## Manual steps (not code — someone has to go and do these)

Everything in P0–P2 needed nothing outside the repo. P3 does:

1. **Create and activate a Stripe account.** Australian business, so ABN, bank
   account and ID verification. Can take days — start it before the code is
   needed, not after.
2. **Keys** into `.env.local` and the host's env: `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`. Test keys (`sk_test_…`) until a real client pays.
   Never commit them.
3. **Stripe CLI** for local webhook testing: `brew install stripe/stripe-cli/stripe`,
   `stripe login`, then `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. **Deploy first.** `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` today, and
   Stripe can't deliver webhooks to localhost. The production webhook endpoint
   has to be registered against a real URL.
5. **GST decision** — see the Revenue roadmap item above.
6. **Catalogue prices.** `npm run services:seed` puts placeholder prices in.
   Real ones need to be typed at `/admin/services` by someone who knows them.

Optional, unrelated to Stripe: a **Resend API key** switches on the new-lead
email that's already stubbed in `app/api/contact/route.ts`.
