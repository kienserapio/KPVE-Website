# AutoPay

A client saves a card once, and their invoices pay themselves on the day they
fall due.

Built on `feat/autopay`. Off by default: three separate switches have to be on
before any card is charged, and they are described under **Turning it on**.

---

## How it works

Three moving parts. Only the first two touch Stripe.

1. **Saving the card.** The client ticks the authorisation on `/portal/autopay`
   and is sent to a Stripe Checkout Session in `mode=setup` — a card form with
   no amount on it. Consent is recorded when they press the button; AutoPay
   itself only switches on when a card comes back on the webhook.
2. **Charging it.** `/api/cron/autopay` runs nightly. It emails a notice for
   invoices coming due, then charges the ones that are due and were noticed at
   least a day ago, with `off_session=true, confirm=true`.
3. **Saying so.** Notice before, receipt after, and a "we couldn't charge your
   card, here's a link" when it fails.

Invoices stay ours. Stripe Billing subscriptions were rejected: they would
generate a second invoice document with its own number, alongside the
`INV-2026-xxxx` this CRM already issues, prints and files.

### The pieces

| What | Where |
| --- | --- |
| What to charge, as a pure function | `lib/autopay/select.ts` (+ `select.test.ts`) |
| The run itself — notices, then charges | `lib/autopay/run.ts` |
| Scheduled entry point | `app/api/cron/autopay/route.ts`, `vercel.json` |
| Reads/writes with a session (portal, CRM) | `lib/dal/autopay.ts` |
| Reads/writes without one (cron, webhook) | `lib/dal/autopay-run.ts` |
| Save-a-card and off-session charge | `lib/payments/stripe.ts`, `lib/payments/mock.ts` |
| The words the client agrees to | `lib/autopay/consent.ts` |
| Client-facing | `/portal/autopay`, plus a strip on `/portal` |
| Staff-facing | AutoPay card on the client page, master switch in `/admin/settings` |

### Tables

`client_autopay` — one row per client, holding the switch, the `pm_…` handle,
the four card digits worth showing, and the consent record (text, timestamp, IP,
user agent, which portal login). One row per *client*, not per login: several
people can hold logins to one account, and the card belongs to the business.

`autopay_attempts` — one row per charge we try, **written before the money
moves**. `unique (invoice_id, attempt_no)` is the double-charge guard, and the
`idempotency_key` on it (`autopay_{invoice_id}_{attempt_no}`) is sent to Stripe
so a retried request returns the original PaymentIntent rather than making a
second one.

Also: `invoices.autopay_notice_sent_at`, and five `org_settings` columns for the
master switch and the caps.

---

## What gets charged

`planAutopayRun()` decides, from rows, with no database and no clock in it. It
is the only part of this feature whose bugs move money, which is why it is the
part with tests. An invoice is charged when **all** of:

- `status = 'sent'` — never a draft, never a void, never one already paid
- `due_date` is set and has passed
- something is still owed (`total_cents - amount_paid_cents > 0`)
- the client has AutoPay on and a saved card
- fewer than 3 declines in a row on that card
- no attempt for this invoice is still `started`
- **no attempt has been made against this invoice before** — one try per
  invoice, ever. A failed charge is not retried; the client gets a payment link
  instead, which is what the consent text and the failure email both promise.
- **no live checkout link for it.** A client can be sitting on Stripe's payment
  page right now — the link lasts 24 hours — and charging underneath them is two
  real charges for one debt.
- **the notice went out on an earlier day.** Re-enabling AutoPay or saving a new
  card clears the stamp on every open invoice, so a months-old notice naming a
  different card can never unlock a charge.
- the balance is within the per-invoice cap

Everything refused is counted by reason in the run summary — `notice_not_sent`,
`notice_too_recent`, `previous_attempt_failed`, `checkout_in_flight`,
`too_many_failures`, `attempt_in_flight` and the rest.
Nothing is dropped silently.

Then the run caps apply: at most 25 invoices and $5,000 per run by default, and
anything they cut is reported as `held` rather than skipped, because it is
correct-but-not-today. A normal night is a handful of invoices; the caps exist
so that the failure mode of a bad query is a stopped run and a loud log rather
than four hundred charged clients.

### When it fails

- `authentication_required` — the bank wanted the client to confirm and nobody
  was there. **No retry**: the same charge fails the same way. They get the
  ordinary payment link by email.
- `card_declined` / `insufficient_funds` — same, and the failure streak goes up.
  Three in a row switches AutoPay off for that client and tells them why.
- A charge that throws leaves its attempt row `started`, which blocks that
  invoice until a human looks. A charge that may have taken the money is not
  something to guess about.

---

## Turning it on

All three, or nothing happens:

1. `CRON_SECRET` in the environment. Vercel sends it as a bearer token on its
   own cron invocations. Without it the route answers 503.
2. The schedule in `vercel.json` (21:00 UTC — morning in Sydney, so a failed
   charge lands in business hours where someone can act on it).
3. **AutoPay switched on in `/admin/settings`.** The kill switch lives in the
   database, not the env, so it can be flipped at eleven at night without a
   deploy — which is exactly when someone will want to.

Stripe also needs four more webhook events registered:
`payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_method.automatically_updated`, `payment_method.detached`.

The caps and the notice lead time are columns on `org_settings` with sensible
defaults. There is no UI for editing them yet — change them in SQL if you ever
need to, which should be roughly never.

---

## Testing it

`npm test` runs the selection tests — 33 cases, every one of them a way a client
could be charged wrongly.

For the whole path, `PAYMENTS_PROVIDER=mock` gives a simulated setup page at
`/pay/setup/[ref]` offering four cards that decide how the next charge behaves:

| Card | What it does |
| --- | --- |
| Visa 4242 | charges succeed |
| Visa 3184 | fails `authentication_required` |
| Visa 0002 | fails `card_declined` |
| Mastercard 3178 | fails `insufficient_funds` |

Driving a run by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/autopay?dryRun=1"
```

`?asOf=YYYY-MM-DD` moves the run's idea of today. It is refused when real keys
are in play unless `AUTOPAY_ALLOW_AS_OF=1`: a future date turns "invoices due
today" into "every invoice due this year", and nobody holding the cron token
should be able to bring a quarter's billing forward with a query string.

Against real Stripe in test mode, the equivalents are `4242 4242 4242 4242`,
`4000 0027 6000 3184` (fails off-session with `authentication_required`),
`4000 0082 6000 3178` and `4000 0000 0000 9995`. Webhooks locally with
`stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### What has been exercised

On `feat/autopay`, in simulated mode, against the seeded `ZZ Test Client`:

- consent refused without the box ticked
- card saved through the setup flow, AutoPay switched on, portal showing it
- dry run and real run, cron route rejecting a missing and a wrong token
- the notice gate: notice sent, charge withheld as `notice_too_recent`
- a real charge settling an invoice — `sent` → `paid`, payment row, attempt row
- three declines in a row auto-suspending AutoPay, invoice untouched throughout
- two concurrent runs producing one attempt, one payment, one paid invoice
- a declined charge NOT being retried on the following run
- an invoice with a live checkout link being left alone
- saving a new card clearing the stale notices and preserving the original
  consent date

Not yet exercised: the staff-facing screens in a browser (no staff login was
available), and anything against live keys.

### Before live keys

Raise a $1 invoice against a real client record, use your own card, and run the
whole loop once — save, notice, charge, webhook, receipt, refund. That is the
last check that no test-mode assumption leaked through.
