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
| `/admin` | Staff | Enquiry list, filters, search, stats |
| `/admin/leads/[id]` | Staff | Detail — status, assignment, internal notes |
| `/admin/activity` | Staff | Audit trail |

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
