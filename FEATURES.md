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
- Sidebar nav: **Overview · Enquiries · Clients · Services · Revenue · Invoices ·
  Activity · Settings**, plus light/dark theme toggle.
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

### AutoPay — invoices that pay themselves
A client saves a card once on **`/portal/autopay`**, and the nightly job at
`/api/cron/autopay` charges their invoices off-session on the day each one falls
due. Full write-up in `docs/AUTOPAY.md`.
- **Consent is the client's to give.** Staff can turn AutoPay *off* for someone
  who rings up and asks; there is deliberately no button that turns it on, since
  a CRM that could manufacture the consent record would make the record
  worthless. The exact words agreed to are stored with the timestamp and IP.
- **Nobody is charged without warning.** A notice email goes out first, and the
  charge is refused until that notice has been out for a full day.
- **The double-charge guard is a row, not a rule.** `autopay_attempts` is
  written *before* the provider is called, `unique (invoice_id, attempt_no)`
  settles two overlapping runs into one charge, and the same key goes to Stripe
  as an `Idempotency-Key`.
- **Three declines in a row switches it off** and emails both sides. A card that
  has said no three times is not going to say yes on the fourth, and retrying it
  looks like card testing to the network.
- Settles through `applyPaymentSucceeded()` like everything else, so an AutoPay
  payment and a client pressing Pay now produce the same ledger row and the same
  invoice status.
- Off until three switches are on: `CRON_SECRET`, the schedule in `vercel.json`,
  and the master switch in `/admin/settings` — which lives in the database so it
  can be pulled without a deploy.

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
- ✅ **Client portal — sign-in** — clients sign in at `/portal` with their email and a
  KPVE-issued access code. Separate cookie, separate secret, own DAL.
- **Client portal — the pages** — services, invoices, payments, receipts, Pay now.
- ✅ **Client portal — staff UI** — the Portal access card on a client's page:
  give someone access, reissue a code, disable/re-enable, unlock a throttled
  login, remove one created by mistake. Code shown once, copy + email it.
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
- **Client portal** — the client logs in: status, invoices, tasks. *Sign-in is built; the
  views are not.*

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

**Switching test → LIVE on Vercel** — still no code change, all environment:

7. In Stripe, flip the dashboard out of test mode and **register a second
   webhook endpoint** at `https://kpve.com/api/stripe/webhook` with the same
   four events. Live and test endpoints are separate objects with separate
   signing secrets; the test one does not carry over.
8. In **Vercel → Settings → Environment Variables**, set
   `STRIPE_SECRET_KEY` (`sk_live_…`),
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`),
   `STRIPE_WEBHOOK_SECRET` (the live `whsec_…`) and `NEXT_PUBLIC_APP_URL`
   (`https://kpve.com`) — scoped to **Production only**, leaving the test keys
   on Preview and Development so a preview build can never charge a real card.
9. **Redeploy.** Vercel injects env vars at build time and `NEXT_PUBLIC_*` are
   compiled into the bundle, so an existing deployment keeps the old values.
10. `update clients set billing_customer_id = null;` — test-mode customer ids
    don't exist in live mode. The code self-heals (it retries as a new customer)
    but clearing them is tidier. Make sure `PAYMENTS_PROVIDER` is **not** set to
    `mock` in Production: it would settle invoices without taking any money.

**Ongoing:**

11. **Daily snapshot.** Cron `npm run revenue:snapshot` (or a Vercel cron) so the
    MRR trend is recorded rather than reconstructed. It also runs on the first
    Revenue page view of the day, which covers most of it.
12. **GST decision** — Australian clients are 10% if KPVE is registered. Decide
    tax-inclusive pricing vs a tax line *before* invoicing for real; retrofitting
    it across issued invoices is the expensive version of this decision.
13. **Catalogue prices.** `npm run services:seed` puts placeholders in. Real ones
    need typing at `/admin/services` by someone who knows them.
14. **Onboarding checklists.** Write the real steps per service at
    `/admin/services` — the mechanism is built, the content is yours.

Optional, unrelated to Stripe: a **Resend API key** switches on the new-lead
email that's already stubbed in `app/api/contact/route.ts`.

---

# CRM Prio — Round 2 (23 Jul 26 call)

P0–P5 built the machine. Dimitrios then took a **real client** through it and it
broke in four places, all of them the same underlying mistake: **the model
assumes a client is one person buying one of a thing.** A real client is a
person who owns several companies, each company is billed in its own name for
the tax office, and one of those lines is "four mailboxes at $11", not "emails".

> **Status: P7.1–P7.6 built.** The public site shows one correct address; a
> client can be an individual who owns companies; each client and KPVE itself
> carry billing details; a billable line has a quantity and a list of what was
> provisioned; and the CRM issues real, printable, GST-aware tax invoices with an
> unguessable client link. Every change was additive — existing clients kept
> working untouched (migration `0004` backfills `unit_amount_cents = amount_cents`,
> `quantity = 1`, `client_type = individual`).
>
> **One manual step before use:** run `npm run db:migrate` to apply `0004`, then
> fill `/admin/settings` (ABN, address, bank). The GST switch is off by default.

## What the call actually asked for

| Ask | What it means in the model |
|---|---|
| "support@kpve.com" | One correct public address. `info@kappatos.com` / `info@kpve.com` are wrong and are on the live site. |
| "onboarding this client as an individual, i should be able to attach their business or company — this client has multiple business' and companies that we manage" | A client record can **own other client records**. One individual, many companies, one relationship. |
| "better to have an option when making a new client, either as an individual or company" | `client_type` on the client. The create form asks first, and changes shape after. |
| "if i choose a company, then it should be their business name as their name … a text box so i can assign an individual or person" | For a company, `name` **is** the trading name; the human is a separate `contact_name` field, not the record's identity. |
| "when we invoice the company, it should have their company information so that they are billed correctly. That company invoice should be reflective so they can claim the expense" | A **billing profile** per client (legal name, ABN, address) and a **real invoice object** that prints an ATO-compliant tax invoice. A payment link is not an invoice — you can't claim a Stripe receipt as a business expense with no ABN on it. |
| "4 emails with us … add the QTY … calculate $11 x 4" | **Quantity** on a billable line. Unit price × qty, not a retyped total. |
| "put the email service that has been setup so its attached to the invoice" | Per-line **provisioned items** — the actual mailbox addresses — snapshotted onto the invoice so the client can see what they're paying for. |

Consequence: two structural changes. **A client can be a company owned by
another client**, and **a billable line has a quantity and a list of what was
provisioned**. Invoicing is what makes both of them visible to the client.

---

## ✅ P7.1 — `support@kpve.com` — BUILT

The public site advertises two addresses and both are wrong:
`lib/data.ts` says `info@kappatos.com` (the old brand), `Footer.tsx` says
`info@kpve.com`. `components/sections/Contact.tsx` falls back to the kappatos
one if the lookup ever misses.

- Single value in `lib/data.ts` (`CONTACT_INFO`), everything else reads from it —
  including the Contact section fallback, which stops being a second copy of the
  address and becomes the same one.
- `EMAIL_FROM` in `.env.example` moves to `KPVE <support@kpve.com>` so the
  new-lead notification, when Resend lands, comes from somewhere a reply reaches.
- `you@kpve.com` in the README / `scripts/create-staff-user.ts` stays — that's a
  "type your own address here" placeholder for a staff login, not a contact.

## ✅ P7.2 — Individual vs company, and the link between them — BUILT

The ask is **accounts and contacts** (P6) arriving early because a real client
needed it. It does **not** need the full Salesforce shape to be useful.

**Rejected:** a separate `companies` table. Every company here is billed, has
services, tasks, documents, a timeline and an owner — it *is* a client. A second
entity would duplicate all of that and then need joining back together on every
page. The cheap, correct version is one table that can point at itself.

**`clients` gains three columns:**
- `client_type` — `individual | company`. Existing rows default to `individual`,
  which is what they already are.
- `contact_name` — the person at a company ("Dimitrios Kappatos" on
  "Rare Gem Exchange Pty Ltd"). Null on an individual, where `name` is the person.
- `parent_client_id` — self-reference, `ON DELETE SET NULL`. A company points at
  the individual who owns it. Deleting the individual must orphan the companies,
  never cascade — those companies are still being billed.

**One level only.** A company cannot own a company. Enforced in the DAL, not by
a constraint, and stated here so nobody adds a third level by accident: a tree
of arbitrary depth means every roll-up becomes a recursive query for a case
nobody has.

**UI**
- `/admin/clients/new` opens with a two-button choice: **Individual** /
  **Company**. Everything below re-labels: "Name" becomes "Business name",
  "Contact person" appears, and a **"Owned by"** picker lists individual clients.
- The choice is on the create form *and* the editor — a client entered as an
  individual that turns out to be a company is a one-field fix, not a re-entry.
- **Individual detail page** gains a **Businesses** card: each company they own,
  its status, its MRR, and the group total. This is the answer to "this client
  has multiple businesses that we manage" — one screen, all of it.
- **Company detail page** shows "Part of **<individual>** →" in the sidebar,
  next to the origin-enquiry link that's already there.
- Clients list: a type badge, a type filter beside status/category, and
  `Type` / `Contact` / `Owned by` columns in the CSV export.
- Converting a lead still creates an **individual** — a contact form is filled in
  by a person. Attaching their company is the next click, on the client page.

**Deliberately not done:** merging duplicate clients, contacts as their own
table with many-per-company, per-contact email. One person per company is what
was asked for and covers the real client.

## ✅ P7.3 — Billing profile, business details, and GST — BUILT

An invoice a client can claim needs facts the CRM has never stored: who KPVE is,
who the client legally is, and whether there's GST in the number.

**`clients` gains a billing profile** — all optional, all falling back to the
contact details when blank:
- `billing_name` (legal entity: "Rare Gem Exchange Pty Ltd" where the trading
  name differs), `billing_abn`, `billing_email` (accounts@, which is rarely the
  person we talk to), `billing_address` (multiline text — addresses are not a
  schema problem worth solving).

**New table `org_settings`** — a single row, KPVE's own details:
- Identity: `legal_name`, `trading_name`, `abn`, `address`, `email`
  (defaults to support@kpve.com), `phone`, `website`.
- Tax: `gst_registered` (default **false**), `tax_rate_bps` (default `1000` =
  10%), `prices_include_tax` (default **true**).
- Invoicing: `invoice_prefix` (default `INV`), `payment_terms_days` (default 14),
  `invoice_footer`, and EFT details (`bank_name`, `bsb`, `account_name`,
  `account_number`) for clients who won't use a card.

Why a table and not env vars: it's the same argument that made the service
catalogue a table. An ABN or a bank account changing must not be a deploy, and
the person who knows the right value is not the person with access to the host's
environment. Edited at **`/admin/settings`**.

**The GST decision, made** (it was manual step 8, and invoicing forces it):
- `gst_registered = false` — the default — prints no tax line at all. Total is
  the subtotal. Correct, and legal, for a business that isn't registered.
- `gst_registered = true` with `prices_include_tax = true` — the Australian norm.
  **Stored amounts do not change.** `$11` stays `$11`; the invoice prints
  *"Total includes GST of $1.00"*. Nothing in `client_services`, MRR, the payment
  links or the ledger moves, which is exactly why this is the default when
  registration happens.
- `prices_include_tax = false` adds 10% on top of the line total. Offered for
  completeness; switching it after invoices exist changes what clients pay, so
  the settings page says so out loud.
- Maths lives in `lib/billing.ts` beside the MRR factors — one file, integer
  cents, rounding at the invoice total rather than per line so the parts always
  sum to the whole.

An **ATO tax invoice** needs: the words "Tax invoice", KPVE's identity and ABN,
the issue date, a description of what was sold with quantities and prices, the
GST amount (or a statement that the total includes it), and the buyer's identity
or ABN once the total is $1,000 or more. The print view produces all of it, and
the invoice screen warns when a field it needs is blank rather than printing a
document the client's accountant will bounce.

## ✅ P7.4 — Quantity, and what was actually provisioned — BUILT

**"4 emails at $11" is one line, not four, and not a retyped $44.**

**`client_services` gains:**
- `unit_amount_cents` — the price of one.
- `quantity` — integer ≥ 1, default 1.
- `amount_cents` **stays the line total** and is written as `unit × quantity`.

That last point is the whole design. `amount_cents` is read by the MRR SQL in
`lib/dal/clients.ts`, by `summarize()`, by the revenue snapshots, by the CSV
export, by the Stripe `price_data` and by the upcoming-bills list. Keeping it
the total means **none of them change** and none of them can disagree about what
a line is worth. The invariant is enforced in one place — the DAL write path —
and is stated on the column, because a stored derived value that drifts is worse
than no column. Backfill: `unit_amount_cents = amount_cents`, `quantity = 1`.

**`services` (the catalogue) gains `unit_label`** — "mailbox", "seat", "page",
null for things not counted. It's what makes the line read *"Emails — 4 ×
$11.00/mo"* instead of *"Emails — 4 × $11.00/mo"* with no idea what four means.

**New table `client_service_items`** — the actual things set up under a line:
- `client_service_id` (cascade), `label`, `position`.
- On the Emails line: `dimitrios@raregem.com.au`, `accounts@…`, one row each.
  On Hosting: the domains. On a build: the deliverables.

Why a table and not a text blob: these get added and removed one at a time over
the life of an account (a fifth mailbox in March), they're snapshotted onto
invoices individually, and "the fourth line of a textarea" is not a thing you
can delete safely.

**UI**
- The add/edit service form becomes **Unit price × Qty**, with the total computed
  live beside it — `$11.00 × 4 = $44.00/mo`. Nobody types the total; nobody can
  typo it.
- Picking from the catalogue prefills the unit price, as it does today.
- Under each line, a **Provisioned** editor: add an address, remove one. When
  items are present the form offers **"Set quantity to 4 (matching the items)"**
  rather than silently overwriting a number a person chose — billed quantity and
  provisioned count *should* match, and when they don't it's usually a mistake
  worth showing, not fixing behind their back.
- The line renders `Emails · 4 × $11.00/mo · $44.00/mo` with the addresses under
  it, so the client page answers "what are they paying for" without opening
  anything.

## ✅ P7.5 — Invoices — BUILT

The missing object. Today the CRM can *take* money (payment links) and *record*
it (the ledger), but it cannot produce the document a business needs to book the
expense. That's the gap the call was actually describing.

**New table `invoices`** — one issued document:
- `client_id` (cascade), `number` (UNIQUE — `INV-2026-0001`), `status`
  (`draft | sent | paid | void`), `issue_date`, `due_date`, `currency`.
- Money: `subtotal_cents`, `tax_cents`, `total_cents`, `amount_paid_cents`,
  plus the `tax_rate_bps` and `tax_mode` in force when it was issued.
- **Snapshots of both parties** — `seller_name`, `seller_abn`, `seller_address`,
  `seller_email` and `bill_to_name`, `bill_to_abn`, `bill_to_email`,
  `bill_to_address`. Same copy-at-conversion rule this codebase uses everywhere:
  an issued invoice is a record of a moment. Changing KPVE's address next year
  must not rewrite last year's invoices — and an invoice that changes after
  issue is a compliance problem, not a convenience.
- `public_token` (UNIQUE, 32 hex) — the client's own link, exactly as
  `/pay/[ref]` works. The link *is* the credential.
- `notes`, `po_number`, `sent_at`, `paid_at`, `voided_at`, `created_by`.

**New table `invoice_lines`:**
- `invoice_id` (cascade), `client_service_id` (SET NULL — deleting a billing
  line must not gut an issued invoice), `label`, `description`,
- `unit_amount_cents`, `quantity`, `amount_cents`,
- `details` — the provisioned items, flattened at issue time,
- `period_start` / `period_end` — "1 Aug – 31 Aug", which is what makes a
  recurring invoice make sense to whoever files it,
- `position`.

**`payments` gains `invoice_id`** (nullable, SET NULL) so money and document
join up. Paying an invoice's link marks it paid through the same
`applyPaymentSucceeded()` path that already exists — no second way to record
revenue, ever.

**Numbering.** `INV-<year>-<0001>`, prefix from settings, counter per year. The
UNIQUE index on `number` is the guarantee; allocation is max+1 with a bounded
retry, the same pattern as `uniqueSlug()`. Two people pressing "Create invoice"
at once get two numbers, not one number and a 500.

**Screens**
- **`/admin/invoices`** — every invoice: number, client, issued, due, total,
  status. Filters by status and client. Overdue (`sent`, past `due_date`) flags
  red, and that list is the closest thing an agency has to a collections queue.
- **`/admin/invoices/[id]`** — the document. Prints properly: `@media print`
  rules, no chrome, KPVE's details and ABN, bill-to block, the lines with
  quantities and provisioned items, subtotal / GST / total, payment terms and
  EFT details. No PDF dependency — the browser's Print to PDF produces the file,
  and it's the same file the client sees.
- **`/invoice/[token]`** — the client's read-only copy, same document, with a
  **Pay now** button for the outstanding balance (see P7.7).
- **On the client page** — an **Invoices** card and a **New invoice** action that
  preselects the lines due, sets the period from each line's cycle, pulls the
  bill-to from the billing profile (the company's, when invoicing a company),
  and lands on a **draft** so it can be checked before it's a document. Draft is
  editable and deletable; **sent** is not — it's void-and-reissue after that,
  which is how invoices work.
- **Email it** — mailto with the number, total, due date and the token link,
  matching the existing payment-link button.

**Invoicing a company owned by an individual** is the case that started this:
the invoice is raised against the **company** record, carries the company's
legal name and ABN, and the individual's page lists it under their businesses.
That is the whole "so they can claim the expense" requirement.

## ✅ P7.7 — Billing duration, and an invoice that actually collects — BUILT

Two things a real CRM does that this one didn't.

**Bill more than one cycle.** `invoices.cover_months` + `invoice_lines.periods`.
The builder offers 3 / 6 months, 1 / 2 / 3 years or any custom number of months,
and each recurring line is multiplied by however many of *its own* cycles fit —
24 on a monthly line, 2 on an annual one, never anything on a one-off, because a
project fee doesn't repeat. Duration is carried in **months**, not cycles, because
one invoice can hold lines on different cycles and "24 months" is the only unit
that means the same thing to both.

The multiplier is frozen onto the line at issue
(`amount_cents = unit × qty × periods`) and the **rate never moves**: the client
is still on $44/mo and still contributes $44 to MRR. Two years collected up front
is monthly revenue recognised monthly, not a bigger plan. A **draft** can be
re-priced for a different duration (`setInvoiceDuration()`) — every line is
re-derived from its own unit price, never by multiplying the stored total, so
1 year → 2 years → 1 year returns to where it started.

**An invoice that can be paid.** `invoices.checkout_ref` / `checkout_url` /
`payment_provider`, and a second kind of checkout distinguished by the
`kpve_invoice_id` metadata. It charges the invoice **balance, once**. The old
`payUrl` handed the client the underlying line's *subscription* link, which on a
two-year invoice would have collected $44 against a $1,056 document.

The session is minted when the client presses **Pay now**, not when staff press
Send: a Stripe Checkout Session expires in 24 hours and an invoice does not. When
it settles, `applyInvoicePaymentSucceeded()` writes the ledger row (idempotent on
`provider_ref` like everything else), marks the invoice paid, and rolls every
covered line's `next_bill_at` to the day after its `period_end` — so a client who
paid to 2028 is not in next month's upcoming bills. The simulator settles invoice
refs through the identical path, so the flow is proven before the live keys land.

**Test → live customer ids.** A `cus_…` stored during test mode does not exist in
live mode and is indistinguishable by prefix. `StripePaymentProvider` catches the
`resource_missing`, retries once as a new customer and flags `replacedCustomer`
so the DAL overwrites the stale id, rather than leaving that client permanently
unable to pay.

## ✅ P7.6 — Docs — BUILT

`docs/USING-THE-CRM.md` and `docs/CRM.md` get the new walkthrough: create a
company under an individual, fill the billing profile, add "Emails × 4" with the
four addresses, raise the invoice, send it, take payment. Plus the settings page
and the GST switch.

---

### Build order

`✅ P7.1 emails → ✅ P7.2 individual/company → ✅ P7.3 billing profile + org settings + GST → ✅ P7.4 quantity + provisioned items → ✅ P7.5 invoices → ✅ P7.6 docs`

P7.1 is independent. P7.2–P7.4 share one migration and can be built in parallel
once it lands. P7.5 needs all three: it prints the company's details (P7.2/P7.3),
the quantities (P7.4), and the tax (P7.3).

### Manual steps this adds

11. **Fill `/admin/settings`** — ABN, address, bank details. An invoice without
    an ABN is not a tax invoice, and the page says so.
12. **Decide GST registration.** Off by default. Turning it on changes every
    invoice printed after that, and not any invoice printed before it.
13. **Set `support@kpve.com` up as a real mailbox** that someone reads, since
    it's now the only address on the site.
