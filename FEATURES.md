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
- Sidebar nav: **Overview · Enquiries · Clients · Services · Revenue · Activity**,
  plus light/dark theme toggle.
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

### Revenue — `/admin/revenue`
The money view. The Overview says how things stand today; this says which way
they're going.
- **KPIs**: MRR · collected this month (with last month beside it) · outstanding
  (asked for, not paid) · net new MRR.
- **MRR, last 12 months** — solid bars are recorded snapshots, outlined bars are
  reconstructed from service start/cancel dates. The chart never passes an
  estimate off as a record.
- **This month's movement** — new MRR, churned MRR, net, with line counts.
- **Revenue by service** and **upcoming bills**, same as the Overview.
- **Payments** — every attempt to take money, newest first, with failures and
  their reasons.
- A banner names the payment mode: simulated, live, or the dangerous
  in-between (live keys, no webhook secret).

### Payments — payment links, simulated until Stripe is real
Every billing line can mint a payment link, copy it, or email it to the client.
- With no Stripe keys, links point at **`/pay/[ref]`** — an in-app checkout that
  runs the *real* flow: the service flips to Active, the bill date rolls, the
  payment is written to the ledger and the activity log. Nothing but the card is
  fake.
- With `STRIPE_SECRET_KEY` set, links become real Stripe Checkout sessions and
  the same thing happens when the webhook arrives. **No code changes** — see
  *Manual steps*.
- One rule underneath: `applyPaymentSucceeded()` is the only path that sets a
  service Active. The simulator and the webhook both call it, so what's being
  exercised today is what runs on the day a client actually pays.
- Retried webhooks are idempotent (unique index on `payments.provider_ref`), and
  pressing Pay twice on a simulated link is refused.

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
- **Onboarding checklist** per service: the steps owed to a client when they buy
  it, each with a day offset. Putting a client on the service creates them as
  dated tasks. Editing the checklist later never reaches back into a client's
  list — copies are ordinary tasks by then, same copy-at-attach rule as pricing.

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
    Cancelled), **Payment link** (copy / email / revoke), **Mark billed** to roll
    the cycle forward, inline edit, remove. Overdue bill dates flag red. Only
    **Active** lines count toward MRR.
  - **Payments** — what this client has actually paid, with the running total.
  - **Tasks & follow-ups** — the "what's next / reply back" list. Add a task with an
    optional due date, check it off, delete it. Overdue tasks flag red; completed
    tasks collapse. Each task records who added it. A service's onboarding
    checklist lands here automatically.
  - **Timeline** — dated, attributed entries: call, meeting, email, note,
    milestone. "When it happened" is separate from "when it was typed up", so
    Friday's write-up of a Tuesday call is still a Tuesday call.
  - **Documents** — links to the contract, brief or signed quote. Links, not
    uploads: the team works out of Drive, and a second copy here would be the
    stale one within a week.
  - Editor: name, company, email, phone, category, status, account owner, notes.
    Two-click delete (cascades to the client's tasks, services, timeline and
    documents).
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
- `payments` — one row per attempt to take money: `provider`, `provider_ref`
  (UNIQUE — the idempotency guarantee), `status`, `amount_cents`, `currency`,
  `paid_at`, `failure_reason`. `client_service_id` is ON DELETE SET NULL, so
  removing a billing line never erases the money collected against it.
- `client_notes` — the timeline: `kind`, `body`, `author_id`, `occurred_at`.
- `client_documents` — `label`, `url`, `kind`, `added_by`.
- `service_task_templates` — a service's checklist: `title`, `offset_days`,
  `position` (cascade-deletes with its service).
- `revenue_snapshots` — `period` + `currency` (unique together), `mrr_cents`,
  `arr_cents`, `one_off_cents`, `active_lines`, `paying_clients`.
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
   list, with the right price and cycle. Add it if not. While you're there, give
   it an **onboarding checklist** — those steps become dated tasks on every
   client you put on it.
2. **Clients → + New client**, or convert a won enquiry. Name and email is enough.
3. On the client page, **Add service** — pick from the catalogue, adjust the
   price or cycle for this client if needed, set the start date.
   - Not paid yet? Set the status to **Awaiting payment**. It won't count toward
     MRR until money clears.
   - Repeat for every line: Emails, Hosting, the build fee, whatever.
   - The service's checklist lands in Tasks automatically.
4. **Payment link** on the line → **Email it**. When the client pays, the line
   flips to Active by itself, the next bill date is set from the payment, and the
   payment shows up on the client page and on `/admin/revenue`. Don't set the
   status to Active by hand — if you do, you've recorded revenue nobody paid.
   - Until Stripe is connected the link opens a test checkout. Same flow, no
     money. `/admin/revenue` says which mode you're in.
5. The header now shows their MRR and next bill date; the Overview and Revenue
   pages roll it into the business-wide totals.
6. Log the kickoff call in the **Timeline** and link the **contract** under
   Documents, so the next person on this account doesn't have to ask.
7. Each cycle, hit **Mark billed** on a line to roll its due date forward — or
   let a real Stripe subscription do it for you. Billing a few days late doesn't
   shift the whole schedule: the roll is from the due date, not from today.

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
- ✅ **Payment links + webhook + payments ledger** — simulated end to end, one
  config switch from live Stripe. (CRM Prio P3)
- ✅ **Revenue history** — 12-month MRR trend, new vs churned, collected vs
  outstanding, `/admin/revenue`. (CRM Prio P4)
- ✅ **Onboarding checklists, notes timeline, documents** — (CRM Prio P5)

### Revenue (agency-specific)
- **Quotes / proposals** — draft per service, track sent → accepted.
- **Tax / GST** — Australian clients are 10% GST if KPVE is registered. Decide
  tax-inclusive pricing vs a tax line before invoicing for real. Nothing in the
  billing model knows about tax yet: amounts are what the client is charged.

### Relationship
- **Company / contact linking** — collapse multiple enquiries from the same
  email/company into one record with history (dedup).
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

> **Status: P0–P5 are built on `feat/crm`.** The CRM models money properly, the
> catalogue is staff-editable, the client form is identity-only, payments run
> end to end, revenue has history, and onboarding produces its own checklist.
>
> **Payments run in simulated mode** until a Stripe account exists. That is a
> mode, not a stub: links, checkout, the flip to Active, the bill-date roll and
> the payment ledger are all real code taking the real path — only the card is
> fake. Switching to live Stripe is two environment variables and one dashboard
> entry, with no code change. See *Manual steps* at the bottom.
>
> P6 (accounts + contacts, opportunities, roles, client portal) is not started
> and shouldn't be until the above has carried a real client.

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

## ✅ P3 — Payments — BUILT (simulated; Stripe is a config switch)

One interface in `lib/payments/`, two implementations behind it. `mock` runs
with no keys; `stripe` runs the moment `STRIPE_SECRET_KEY` exists. Nothing above
that layer — DAL, actions, UI, webhook — knows which is live.

1. **Payment link** — per `client_services` row. Mint it, copy it, email it,
   revoke it. A draft line moves to *Awaiting payment*; it will not count toward
   MRR until money clears.
2. **Simulated checkout** (`/pay/[ref]`) — the link a client opens when there
   are no Stripe keys. Pressing Pay calls the same function the webhook does, so
   the whole path is exercised now: service → Active, `next_bill_at` rolled from
   the payment, `payments` row written, activity logged. The ref is 32 random
   hex characters — the link *is* the credential, exactly as a Stripe Checkout
   URL is.
3. **Webhook** (`app/api/stripe/webhook/route.ts`) — HMAC verified against the
   **raw** body, timing-safe, five-minute replay window, and mandatory: a
   missing secret returns 503 rather than silently swallowing a real payment.
   Handles `checkout.session.completed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.deleted`. Anything
   understood returns 200 — a non-2xx makes Stripe retry for days.
4. **Subscriptions** — recurring lines create Stripe subscriptions (inline
   `price_data`, so no Product/Price to pre-create). `clients.billing_customer_id`
   and `client_services.external_subscription_id` mirror what Stripe holds; our
   ids ride along in the subscription metadata so a renewal invoice months later
   still maps back to the right line.
5. **`payments` table** — amount, currency, status, paid_at, provider ids.
   Feeds the client page and the Revenue page's collected-vs-outstanding.

No `stripe` npm dependency: the three calls needed are `fetch` against a pinned
API version. Idempotency is a UNIQUE index on `payments.provider_ref`, not
application logic — Stripe retries, and two retries can land at once.

**Verified:** webhook accepts a valid signature and rejects tampered, unsigned
and stale ones; a replayed event produces one payment, not two; a monthly line
goes `pending_payment → active` with the bill date rolled a month; a one-off
goes active with no next bill; the simulator refuses a second press and refuses
any ref that isn't `mock_`.

**Left for the day Stripe is real:** the two env vars and the dashboard endpoint.
That's it.

## ✅ P4 — Revenue view — BUILT

`/admin/revenue`, plus the Overview's money row from P2.
- **MRR, 12 months.** `revenue_snapshots` records one row per month per currency
  — written by `npm run revenue:snapshot` and by the first Revenue page view of
  the day. Months with no snapshot are reconstructed from service start/cancel
  dates and drawn as outlined bars, because a reconstruction cannot see a pause
  or a mid-month reprice and must not be dressed up as a record.
- **New / churned / net MRR this month**, from the lines themselves — a service
  that started on the 3rd is new revenue on the 3rd, not at month end.
- **Collected this month vs last**, from the `payments` ledger.
- **Outstanding** — face value of every line sitting on *Awaiting payment*.

## ✅ P5 — Onboarding, end to end — BUILT

The supporting pieces are in; walking a real client through is now a task for a
person, not for the codebase.
- **Onboarding checklist templates** — per catalogue service, on
  `/admin/services`. Attaching the service creates the steps as dated tasks
  (`offset_days` from the start date, due 9am local so a task due today doesn't
  read as overdue all day).
- **Notes timeline** — dated, attributed entries with their own "when it
  happened". The old notes blob stays as standing background, which is what it
  was always good for.
- **Documents** — contract, brief, proposal, invoice as links. `http`/`https`
  only: this is the one field where untrusted-looking text becomes something a
  staff member clicks.

**The acceptance test remains:** walk one real client (e.g. Rare Gem Exchange)
through enquiry → convert → attach services → payment link → paid → onboarding
tasks → active, and fix whatever it surfaces.

## P6 — Salesforce shape (only if the above holds)

- **Accounts + contacts** — a company with multiple people, instead of one
  name/email per client.
- **Deals / opportunities** — value + stage + close date, separate from lead
  triage, so the pipeline is money-weighted.
- **Roles** — Admin vs Member, "my clients", assignment.
- **Client portal** — the client logs in: status, invoices, tasks.

---

### Build order (one line)

`✅ P0 money model → ✅ P1 catalogue → ✅ P2 slim form + add-on → ✅ P3 payments (simulated, Stripe-ready) → ✅ P4 revenue history → ✅ P5 onboarding pieces → activate Stripe → onboard one real client → P6`

Earlier roadmap items still stand but rank below this: contact-form category
dropdown and new-lead email notify are cheap and can slot in anywhere.

---

## Manual steps (not code — someone has to go and do these)

The code for P0–P5 is done. Everything below is account admin and judgement.

**To turn payments from simulated into real** — no code changes, in this order:

1. **Create and activate a Stripe account.** Australian business, so ABN, bank
   account and ID verification. Can take days — start it before it's needed.
2. **Deploy first.** Stripe can't deliver webhooks to `localhost`, so the
   endpoint has to be registered against a real URL. Set `NEXT_PUBLIC_APP_URL`
   to it — payment links are built from that value.
3. **`STRIPE_SECRET_KEY`** into `.env.local` and the host's env. Test keys
   (`sk_test_…`) until a real client pays. Never commit them.
4. **Register the webhook** at `<NEXT_PUBLIC_APP_URL>/api/stripe/webhook`,
   subscribed to `checkout.session.completed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.deleted`. Put the signing
   secret it gives you in **`STRIPE_WEBHOOK_SECRET`**.
   - Setting the key without the webhook secret means links work and payments
     are never recorded. The Revenue page shows a warning if it sees that.
5. **Test locally against real Stripe** with the CLI:
   `brew install stripe/stripe-cli/stripe`, `stripe login`, then
   `stripe listen --forward-to localhost:3000/api/stripe/webhook` (it prints a
   `whsec_…` to use as the local secret).
6. Pay one test invoice with card `4242 4242 4242 4242` and check the line goes
   Active on its own. `PAYMENTS_PROVIDER=mock` puts the simulator back if you
   want to demo without touching Stripe.

**Ongoing:**

7. **Daily snapshot.** Cron `npm run revenue:snapshot` (or a Vercel cron) so the
   MRR trend is recorded rather than reconstructed. It also runs on the first
   Revenue page view of the day, which covers most of it.
8. **GST decision** — Australian clients are 10% if KPVE is registered. Decide
   tax-inclusive pricing vs a tax line *before* invoicing for real; retrofitting
   it across issued invoices is the expensive version of this decision.
9. **Catalogue prices.** `npm run services:seed` puts placeholders in. Real ones
   need typing at `/admin/services` by someone who knows them.
10. **Onboarding checklists.** Write the real steps per service at
    `/admin/services` — the mechanism is built, the content is yours.

Optional, unrelated to Stripe: a **Resend API key** switches on the new-lead
email that's already stubbed in `app/api/contact/route.ts`.
