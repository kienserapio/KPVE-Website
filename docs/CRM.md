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
| `/admin/activity` | Staff | Audit trail |
| `/pay/[ref]` | Public, unlisted | Simulated checkout — the link a client is sent |
| `/pay/complete` · `/pay/cancelled` | Public | Where Stripe returns the client |
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
- **`services`** — the billable catalogue, staff-created. `client_services` — one billable
  line on a client; amount/currency/interval are copied at attach time so repricing the
  catalogue never reprices existing clients.
- **`payments`** — every attempt to take money. `provider_ref` is UNIQUE: that index, not
  the code around it, is what makes a retried webhook idempotent.
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
client pays                  →  webhook | simulator        →  applyPaymentSucceeded()
```

`applyPaymentSucceeded()` is the only path that moves a service to `active`. Both the
Stripe webhook and the simulated `/pay/[ref]` page call it, so the flow being exercised
today is the one that runs when a real card clears — flip the keys and the behaviour is
already proven. Nobody sets "paid" by hand; the ledger and the status can't disagree.

**Going live** is two environment variables and a dashboard entry — no code change:

1. `STRIPE_SECRET_KEY` (Stripe → Developers → API keys)
2. `STRIPE_WEBHOOK_SECRET`, from an endpoint registered at
   `<NEXT_PUBLIC_APP_URL>/api/stripe/webhook` subscribed to
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`
3. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

Keys without the webhook secret means links work and payments are never recorded — the
Revenue page warns when it sees that combination. There is no `stripe` npm dependency;
the three calls needed are plain `fetch` against a pinned API version.

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
