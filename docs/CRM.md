# KPVE Leads CRM

Website enquiries are stored in Postgres and worked through a staff dashboard at `/admin`.

Before this existed, `components/sections/Contact.tsx` called `preventDefault()`, showed
"Message Sent", and discarded the submission. Nothing was stored or emailed.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL and SESSION_SECRET
npm run db:migrate             # create tables
npm run staff:create -- --email you@kpve.com --name "Your Name"
npm run dev
```

`SESSION_SECRET` must be generated with `openssl rand -base64 32`. Rotating it signs
every active session out.

### Deploying a schema change

**Migrate before you push.** Vercel deploys the moment `main` moves, so code that
reads a new column reaches production the instant it lands — and if the column
isn't there yet, every page touching that table dies with "An error occurred in
the Server Components render". Additive columns are safe to add ahead of the code
that uses them; the reverse ordering never is.

```bash
npm run db:migrate                 # against the production DATABASE_URL
# confirm it actually landed — drizzle-kit can still be working when it returns
psql "$DATABASE_URL" -c "\d client_services"
git push                           # only now
```

Testing against a local scratch database does not cover this: you migrated that
one yourself, so it always has the new column and cannot reproduce the failure.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/` `/about` `/services` `/contact` … | Public, static | Marketing site, unchanged |
| `POST /api/contact` | Public | Validates and stores an enquiry |
| `/login` | Public | Staff sign-in |
| `/admin` | Staff | Overview — revenue, pipeline, tasks due |
| `/admin/enquiries` · `/admin/leads/[id]` | Staff | Enquiry list and detail |
| `/admin/clients` · `/admin/clients/[id]` | Staff | Clients, billing, tasks, timeline, documents |
| `/admin/services` | Staff | Billable catalogue + onboarding checklists |
| `/admin/revenue` | Staff | MRR history, collected vs outstanding, payments |
| `/admin/invoices` · `/admin/invoices/[id]` | Staff | Tax invoices — list and the printable document |
| `/admin/settings` | Staff | KPVE's own details: ABN, address, bank, GST, invoice numbering |
| `/admin/activity` | Staff | Audit trail |
| `/pay/[ref]` | Public, unlisted | Simulated checkout — the link a client is sent |
| `/pay/complete` · `/pay/cancelled` | Public | Where Stripe returns the client |
| `/invoice/[token]` | Public, unlisted | The client's own copy of an invoice. The 32-hex token is the credential |
| `POST /api/stripe/webhook` | Signature-gated | Records payments. No session; the HMAC is the authorization |

Marketing pages stay statically prerendered. Only admin routes are dynamic, because
they read the session cookie.

## Architecture

```
Request
  └─ proxy.ts              optimistic cookie check, redirect only — no trust decisions
      └─ page / action / route handler
          └─ lib/dal/*     verifySession() + query. THE authorization boundary.
              └─ Drizzle → Neon Postgres
```

**Nothing outside `lib/dal/` touches the database.** The DAL authorizes on every call.
This is what makes access control a property of the system rather than something each
new page has to remember.

### Why proxy.ts is not the gate

Next 16 renamed `middleware.ts` to `proxy.ts`. Its runtime is always `nodejs` and
cannot be configured.

Server Actions are POSTs to their own page's route, so a proxy matcher that skips a
path also skips the actions on it. Proxy is a UX shortcut that avoids rendering a page
the user can't see. **Every server action calls `requireSession()` itself.** Verified:
a forged session cookie gets past proxy and is then rejected by the DAL.

## Schema

- **`staff_users`** — dashboard logins. No public signup; `scripts/create-staff-user.ts`
  is the only way an account is created. No `role` column yet — there is one entity type
  and nothing to permission.
- **`leads`** — enquiries. `source` records which page produced it.
- **`clients`** — a won enquiry, promoted. Contact details copied at conversion.
  `client_type` is `individual` or `company`; a company carries its trading name in
  `name` and the human in `contact_name`, and `parent_client_id` points a company at the
  individual who owns it (self-reference, `ON DELETE SET NULL` — deleting the owner orphans
  the companies, never deletes them; they're still being billed). One level only, enforced
  in the DAL. The billing profile (`billing_name`/`billing_abn`/`billing_email`/
  `billing_address`) is what prints on an invoice, falling back to the contact details when
  blank.
- **`services`** — the billable catalogue, staff-created. `unit_label` ("mailbox", "seat")
  is what makes a line read "4 mailboxes × $11". `client_services` — one billable line on a
  client; amount/currency/interval are copied at attach time so repricing the catalogue
  never reprices existing clients. `unit_amount_cents` × `quantity` is the price; **`amount_cents`
  stays the line total** and is always written as the product, because it's what the MRR SQL,
  `summarize()`, the snapshots and Stripe all read — keeping it the total is what stops them
  disagreeing. `client_service_items` holds the actual provisioned things (the four mailbox
  addresses), snapshotted onto an invoice line at issue.
- **`org_settings`** — a single self-seeding row: KPVE's legal name, ABN, address, bank
  details, GST registration + rate, and invoice numbering. A table not env vars for the same
  reason the catalogue is: an ABN changing must not be a deploy, and the read is unauthenticated
  so a public invoice can print the seller's ABN.
- **`invoices`** / **`invoice_lines`** — an issued tax invoice. Both parties, the lines, the
  tax rate and the provisioned items are **snapshotted at issue** — an invoice is a record of a
  moment and must not change when KPVE's address does next year. `number` is UNIQUE (that index
  is the numbering guarantee); `public_token` is the client's 32-hex link, the same trust model
  as `/pay/[ref]`.
- **`payments`** — every attempt to take money. `provider_ref` is UNIQUE: that index, not
  the code around it, is what makes a retried webhook idempotent. `invoice_id` (SET NULL)
  joins a cleared payment to the document it settled.
- **`client_notes`** / **`client_documents`** — relationship timeline and document links.
- **`service_task_templates`** — a service's onboarding checklist, copied onto a client as
  dated tasks when the service is attached.
- **`revenue_snapshots`** — one row per month per currency. The live tables only describe
  *now*; this is what makes "MRR last month" answerable.
- **`activity_log`** — audit trail. Generic `entityType`/`entityId` so future entities
  log through it without a schema change.

## Security

| Control | Where |
|---|---|
| Session JWT, HS256, algorithm pinned | `lib/auth/session.ts` |
| `httpOnly` + `sameSite=lax` + `secure` in prod | `lib/auth/session.ts` |
| Deactivated accounts rejected even with a valid token | `lib/dal/session.ts` |
| bcrypt cost 12 | `lib/auth/password.ts` |
| Timing-equalised login (`dummyCompare`) | `lib/auth/password.ts` |
| Identical error for unknown user / wrong password / disabled | `lib/actions/auth.ts` |
| Open-redirect guard on the `next` param | `lib/actions/auth.ts` |
| Input validation at every boundary | `lib/validation.ts` |
| Rate limits — 5/hr contact, 10/15min login | `lib/rate-limit.ts` |
| Honeypot, checked before validation so bots get no signal | `app/api/contact/route.ts` |
| Body size cap, UUID format check before DB lookup | route + page |
| `import "server-only"` on db/dal/auth | throughout |
| Webhook HMAC verified on the **raw** body, timing-safe, 5-min replay window | `lib/payments/stripe.ts` |
| Payment refs are 32 hex chars — a checkout link is a credential | `lib/payments/mock.ts` |
| Document links restricted to `http:`/`https:` (no `javascript:`) | `lib/validation.ts` |
| Simulator refuses any ref that isn't `mock_` — it can't settle a real invoice | `lib/dal/payments.ts` |

The rate limiter is per-instance and in-memory. On Vercel each lambda holds its own
counter, so the effective limit is looser than the number suggests. That is fine for a
contact form. Swap in Upstash Redis if it ever needs to be exact.

## Two behaviours worth preserving

**The form must fail honestly.** If the database is unreachable, `/api/contact` returns
500 and the form shows an error plus a mailto fallback. It must never show success for
a submission that wasn't stored — that was the original bug.

**The honeypot must stay silent.** A filled `website` field returns a normal `201`. It
is checked *before* validation so the response is identical no matter what else is in
the body. Returning a validation error naming the field would tell a bot exactly what
caught it.

## Payments

One interface, two implementations (`lib/payments/`): `mock` runs by default, `stripe`
runs the moment `STRIPE_SECRET_KEY` exists. Nothing above that layer knows which is live.

```
staff clicks "Payment link"  →  provider.createCheckout()  →  link stored on the line
client clicks "Pay now"      →  createInvoiceCheckout()    →  redirect to the session
client pays                  →  webhook | simulator        →  applyPaymentSucceeded()
```

`applyPaymentSucceeded()` is the only path that moves a service to `active`. Both the
Stripe webhook and the simulated `/pay/[ref]` page call it, so the flow being exercised
today is the one that runs when a real card clears — flip the keys and the behaviour is
already proven. Nobody sets "paid" by hand; the ledger and the status can't disagree.

**Two kinds of checkout**, told apart by the metadata on the event:

| | Service checkout | Invoice checkout |
|---|---|---|
| Started by | staff, "Payment link" on a billing line | the client, "Pay now" on their invoice |
| Charges | the line's rate, recurring → a real subscription | the invoice **balance**, once |
| Metadata | `client_service_id` | `kpve_invoice_id` |
| Settles | that one line | the document, and every line under it |

An invoice is a **fixed amount due**, so its checkout is always a single charge. Handing a
client the line's monthly subscription link to settle a two-year invoice would collect $44
against a $1,056 document — which is exactly what the old single-line `payUrl` did.

The invoice session is minted **when the client presses the button**, not when staff press
Send. A Stripe Checkout Session expires in 24 hours and an invoice does not; baking a URL
into the emailed page would send a button that is dead before anyone reaches it.

**Going live** is environment variables and a dashboard entry — no code change:

1. `STRIPE_SECRET_KEY` (Stripe → Developers → API keys)
2. `STRIPE_WEBHOOK_SECRET`, from an endpoint registered at
   `<NEXT_PUBLIC_APP_URL>/api/stripe/webhook` subscribed to
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`
3. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

Keys without the webhook secret means links work and payments are never recorded — the
Revenue page warns when it sees that combination. There is no `stripe` npm dependency;
the three calls needed are plain `fetch` against a pinned API version.

**Test → live keeps the database.** A `cus_…` stored in `clients.billing_customer_id`
during test mode does not exist in live mode, and the two are indistinguishable by prefix.
Rather than leave that client unable to pay, `StripePaymentProvider.createCheckout()`
catches the `resource_missing` on `customer`, retries once as a new customer and flags
`replacedCustomer` so the DAL overwrites the stale id. Clearing them up front
(`update clients set billing_customer_id = null;`) is still tidier if the test data was
throwaway.

## Invoices and GST

An invoice is the document a client's accountant files — a payment link is not one, and
you can't claim a Stripe receipt with no ABN on it. It's a separate object from the
payment ledger, built on the copy-at-issue rule used everywhere else here.

```
staff picks lines on a client  →  createInvoiceFromServices()  →  draft (editable)
draft  →  Send  →  sent  →  Paid | Void        (transitions enforced in the DAL)
```

- **Numbering** — `INV-<year>-<0001>`, prefix from `org_settings`, counter per year.
  Allocation is `max+1` with a bounded retry against the UNIQUE index (same shape as
  `uniqueSlug()`), so two simultaneous "Create invoice" clicks get two numbers, not a 500.
- **Snapshots** — seller and bill-to identities, every line, the tax rate and the
  provisioned items are frozen onto the invoice at issue. Editing a sent invoice is refused;
  it's void-and-reissue, which is how invoices work. Only a **draft** is editable or deletable
  (deleting an issued one would punch a hole in the number sequence).
- **Term** (`client_services.term_count`) — how many `interval` cycles ONE CHARGE
  covers. A domain registered for two years recurs, just not yearly, and neither
  "annually" nor "one-off" could say so. It EXTENDS THE CYCLE rather than changing
  the rate: `amount_cents = unit × quantity × term_count` is the amount of one
  charge, the effective cycle is `interval × term_count`, and it becomes Stripe's
  `interval_count` — a genuine every-two-years subscription, not a yearly one.
  MRR therefore divides by it (all **three** copies of the rule: `monthlyCents()`,
  the SQL in `lib/dal/clients.ts`, and `scripts/snapshot-revenue.ts`), because
  $176 every two years *is* $88 a year *is* $7.33 a month — collecting early is
  cash flow, not a bigger deal. Clamped by `clampTerm()` to Stripe's three-year
  billing-period ceiling, which differs per interval: 3 on annual, 36 on monthly.
- **Duration** (`invoices.cover_months`, `invoice_lines.periods`). An invoice can bill
  more than one cycle: pick "2 years" (or any custom number of months) in the builder and
  each recurring line is multiplied by however many of ITS cycles fit — 24 on a monthly
  line, 2 on an annual one, never anything on a one-off. The multiplier is frozen onto the
  line at issue (`amount_cents = unit × qty × periods`) and the client's **rate never
  moves**: the line is still $44/mo and still contributes $44 to MRR, because two years
  collected up front is still monthly revenue recognised monthly. A **draft** can be
  re-priced for a different duration (`setInvoiceDuration()`); a sent one cannot, like
  every other edit. When such an invoice is paid, each covered line's `next_bill_at` rolls
  to the day after its `period_end` — so a client who paid to 2028 is not in next month's
  upcoming-bills list.
- **One path to revenue, still.** Paying an invoice's link runs the same
  `applyPaymentSucceeded()` as everything else. Reconciliation lives in `lib/dal/invoices.ts`
  (imported by `payments.ts`, never the reverse — no cycle) and is **best-effort**: it's
  wrapped in try/catch so an invoice edge case can never fail a payment that has cleared. It
  marks an invoice paid only when the invoice is entirely the one line just paid and the money
  covers the total — it will not close a multi-line invoice off a single line's payment.
- **GST** (`org_settings.gst_registered`, default off). Off prints no tax line — legal for an
  unregistered business. On with `prices_include_tax` (the Australian norm, the default when
  registered) **changes no stored amount**: `$11` stays `$11` and the invoice prints "Total
  includes GST of $1.00", so MRR, the payment links and the ledger are untouched. Prices-exclusive
  adds 10% on top. The maths is in `lib/billing.ts` beside the MRR factors, integer cents,
  rounded once at the total so the printed parts always sum to the printed whole.
- **Printing** — no PDF dependency. The document is one server component (`InvoiceDocument`)
  shared by the admin view and the client's `/invoice/[token]` copy; `@media print` in
  `app/globals.css` isolates it and forces a light ink-on-paper palette, so Print → Save as PDF
  produces the same file for both. The admin view warns when a field an ATO tax invoice needs is
  blank (no seller ABN; total ≥ $1,000 with no buyer ABN) rather than printing something the
  accountant will bounce.

## Revenue history

`revenue_snapshots` is written by `npm run revenue:snapshot` (cron it daily) and by the
first Revenue page view of the day. Months without a snapshot are reconstructed from
service start/cancel dates and drawn as outlined bars — a reconstruction can't see a
pause or a mid-month reprice, so it is never presented as a recorded number.

## Theme

The admin area supports light and dark; the marketing site is dark-only. The theme is
read from the `kpve_theme` cookie server-side in `app/(admin)/layout.tsx` and applied as
`data-theme` on the shell — so the first HTML response is already correct and there is
no flash. Marketing pages never read that cookie, which is what keeps them static.

Tailwind's `dark:` variant does not apply here. Use the `--admin-*` CSS variables in
`app/globals.css`.

## Not built yet

Email notification is deliberately absent. `/api/contact` has the hook point marked.
When Resend is added, the send must be wrapped so a failure cannot fail a lead that is
already saved — free tier is 3,000/month, 100/day, and needs a verified sending domain.

Seams left open for a future client portal: the DAL pattern, the `(marketing)`/`(admin)`
route groups, the generic `activity_log`, and `leads.status = 'converted'`.
