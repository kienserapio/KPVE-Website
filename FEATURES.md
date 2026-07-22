# KPVE CRM — Features & Roadmap

Internal admin CRM for the KPVE marketing site. Website contact form feeds
enquiries (leads); staff triage, work, and convert them into clients, then track
ongoing work with tasks and follow-ups.

Stack: Next.js 16 (App Router, Server Components + Server Actions), Drizzle ORM
on Postgres (Neon), Tailwind. Auth via signed session cookie; every read/write
re-authorizes in the DAL layer.

---

## Current state (built)

### Access & shell
- `/admin` is gated by session cookie (`proxy.ts`) and re-verified per page/action.
- Sidebar nav: **Enquiries · Clients · Activity**, plus light/dark theme toggle.
- No public signup — staff are seeded via `scripts/create-staff-user.ts`.

### Enquiries (leads) — `/admin`
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
- **Enquiry detail** (`/admin/leads/[id]`): full message, contact card, reply-by-email,
  editor for status / category / priority / assignee / internal notes, and a
  **Convert to client** action.

### Clients — `/admin/clients`
- A won enquiry, promoted into an ongoing relationship. Separate lifecycle from
  leads: **Prospect / Active / On hold / Completed / Churned**.
- Contact details are **copied at conversion**, so editing a client never rewrites
  the original enquiry. The two stay linked both ways (client shows "View original
  enquiry"; enquiry shows "View client").
- List table: name/company, category, status, **open-task count**, deal value,
  last updated. Filters (status + category + search) and stats (Active · Prospects
  · Open tasks · Total).
- **+ New client** — add someone by hand, outside the enquiry pipeline
  (`/admin/clients/new`).
- **Client detail** (`/admin/clients/[id]`):
  - **Tasks & follow-ups** — the "what's next / reply back" list. Add a task with an
    optional due date, check it off, delete it. Overdue tasks flag red; completed
    tasks collapse. Each task records who added it.
  - Editor: name, company, email, phone, category, status, deal/value, account
    owner, notes. Two-click delete (cascades to the client's tasks).
  - Contact sidebar with reply-by-email and origin link.

### Activity — `/admin/activity`
- Audit trail of enquiry + client + task actions and sign-ins, newest first, with
  deep links to the entity.

### Data model
- `leads` — enquiry + `category`, `priority`, `status`, `assigned_staff_id`, notes.
- `clients` — `status`, `category`, `value`, `assigned_staff_id`, `notes`,
  `source_lead_id` (provenance).
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

---

## Roadmap / ideas (not built)

Prioritized against what the site actually is — a remote-first agency with 7
services, a contact form, case studies, and testimonials.

### Quick wins (high value, low effort)
- **Category on the contact form** — a "What do you need?" dropdown (+ optional
  budget/timeline) that pre-fills the enquiry category and removes manual triage.
- **Email notify on new lead** — the `api/contact/route.ts` handler already has a
  stubbed hook for Resend. Send staff an email + link on each submission.
- **Global "My tasks / Due today"** — tasks are per-client today; add a cross-client
  overdue + due-today view so follow-ups actually get done.
- **Response-time / aging** — flag "New" enquiries older than a threshold; track
  time-to-first-contact.
- **CSV export** and saved filters.

### Pipeline & reporting
- **Dashboard home** — `/admin` is just the list; add an overview with conversion
  rate, pipeline funnel, tasks due, and revenue.
- **Kanban pipeline** — drag enquiries across status columns.
- **Source attribution** — `leads.source` already stores the origin page; add
  UTM/referrer capture and report which service pages and channels convert.

### Revenue (agency-specific)
- **Numeric value + currency + MRR** — `clients.value` is freeform text today.
  Split one-off vs monthly retainer; forecast and total recurring revenue.
- **Quotes / proposals** — draft per service, track sent → accepted.

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

### Suggested next 4
1. Category dropdown on the contact form (closes the categorization loop).
2. Email notify on new lead (hook already stubbed).
3. Global due-today / overdue task view (makes the client tasks feature stick).
4. Numeric revenue + MRR reporting (the number the business cares about).
