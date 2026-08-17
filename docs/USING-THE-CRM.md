# Using the CRM

A walkthrough of `/admin`, in the order you'd actually use it. No technical
knowledge assumed — for how it's built, see [CRM.md](./CRM.md).

The short version: **enquiries come in from the website, you triage them, the
ones you win become clients, clients go on services, services get paid, and the
numbers add themselves up.**

---

## Signing in

Go to `/login`. There's no signup — accounts are created by a developer running
`npm run staff:create`. Ask for one.

Once in, the sidebar has eight places:

**Overview · Enquiries · Clients · Services · Revenue · Invoices · Activity · Settings**

Top-right toggles light/dark. It sticks.

---

## Part 1 — Set up once

Do this before anything else. Ten minutes, and you never repeat it.

### 0. Fill in your business details — `/admin/settings`

This is who **you** are on an invoice. Until it's filled in, invoices print with
gaps and the page tells you which.

- **Business details** — legal name, ABN, address, `support@kpve.com`, phone.
  **An invoice with no ABN is not a tax invoice** — this is the one that matters.
- **Tax / GST** — off by default, which is correct and legal if KPVE isn't
  registered for GST. When you register, turn it on: leave **"Prices include
  tax"** ticked (the normal Australian setup) and *nothing you've already priced
  changes* — a $11 line stays $11 and the invoice just prints "Total includes GST
  of $1.00". The page shows a live preview so you can see exactly what a client
  will. Only untick "prices include tax" if you mean to add 10% **on top** of
  every price, and it warns you when that changes what clients pay.
- **Invoicing** — the invoice number prefix (`INV`), how many days until an
  invoice is due, a footer line, and your **bank details** for clients who pay by
  transfer instead of card.

You can come back and change any of it. Changing your address or bank details
only affects invoices you send *after* — the ones already sent keep what they said.

### 1. Build the catalogue — `/admin/services`

This is the list of everything KPVE charges for. Add each one:

- **Name** — "Emails", "Hosting", "Site build"
- **Unit price** and **Currency** — what *one* of them costs
- **Unit label** — optional: "mailbox", "seat", "page". This is what lets a line
  read "**4 mailboxes** × $11". Leave it blank for things you don't count.
- **Billed** — One-off / Weekly / Monthly / Quarterly / Annually
- **Description** — optional, what's included

Those prices are *defaults*. When you put a client on a service the price is
copied onto them, so changing the catalogue later **never** reprices an existing
client. Nobody gets a surprise invoice because someone edited a number here.

Two more things worth knowing:

- **Archive** hides a service from the picker but keeps its history.
- **Delete** is safe too — every client's line owns its own name and price, so
  deleting a catalogue entry doesn't change anybody's billing.

### 2. Give each service an onboarding checklist

On any service row, expand **Onboarding checklist**. Add the steps you owe a
client when they buy it, each with a "due in" day count:

| Step | Due in |
|---|---|
| Kickoff call | 0 days |
| Collect logos and copy | 3 days |
| DNS + credentials | 7 days |
| Go live | 14 days |

From then on, putting a client on that service creates all four as **dated tasks
on that client**, automatically. You write the checklist once; you never have to
remember it again.

Editing the checklist later doesn't touch clients who are already onboarded —
their tasks are their own by then.

---

## Part 2 — Every day

### 3. Start at the Overview — `/admin`

The landing page. Read it top to bottom:

- **Money row** — MRR · ARR · one-off booked · paying clients
- **Pipeline row** — new enquiries · high priority · active clients · conversion rate
- **Revenue by service** — where the recurring money comes from
- **Upcoming bills** — due in the next 30 days, overdue in red, each links to its client
- **Enquiries, last 8 weeks** — is the top of the funnel healthy?
- **Tasks due** — overdue and due today, across *every* client. **This is your
  to-do list for the day.**
- **Recent enquiries** — newest submissions

Everything is live on every visit. No stale numbers, no refresh button.

### 4. Work the enquiries — `/admin/enquiries`

Every website contact-form submission lands here. The table leads with *what
they want* — category and a line of their message — not their name, because you
triage by topic, not by person.

Click the message text to open one. On the detail page:

- Read the full message, see their contact details
- **Reply by email** — opens your mail client, addressed and ready
- Set **Category** (Design, Hosting, Web Development…), **Priority**
  (High/Medium/Low), **Status**, and an **assignee**
- Add **internal notes** — the client never sees these

**The status pipeline:**

`New` → `Contacted` → `Qualified` → `Converted` → `Archived`

Move an enquiry along as it progresses. New means nobody has touched it yet, so
keeping that number low is the whole game.

Back on the list: filter by status or category, search names/emails/message
text, and **Export CSV** (respects whatever filters you have on).

### 5. Won it? Convert to a client

On the enquiry detail page, scroll to the editor card. Under **"Won this
enquiry?"** click **Convert to client**.

- Copies name, email, phone, category and assignee across
- Marks the enquiry **Converted**
- Links the two both ways — the client shows "View original enquiry", the
  enquiry shows "View client"
- Takes you straight to the new client page

Safe to click once. If a client already exists for that enquiry, the button says
**View client →** instead of making a duplicate.

It asks nothing about money on purpose. You add that next, once you know what
they're actually buying.

> Client came from somewhere else — a referral, a phone call? **Clients → + New
> client**. Name and email is enough; it's a fifteen-second job.

### Individual or company?

When you make a new client (or edit one), the first choice is **Individual** or
**Company**. It changes the rest of the form:

- **Individual** — a person. Their name is the record.
- **Company** — the **business name** is the record ("Rare Gem Exchange Pty Ltd"),
  and you add the **contact person** separately ("Dimitrios"). You can also set
  **Owned by** to link the company to an individual you already have — which is
  how one person who runs several businesses becomes one relationship. Open that
  individual and a **Businesses** card lists every company they own and the
  combined monthly total.

Either way, expand **Billing details** to set the legal name, **ABN**, billing
email and address that appear on invoices. When you invoice a company, its ABN is
what lets them claim the expense — so a company with no ABN gets a quiet warning
until you add one. Converting a won enquiry always makes an *individual* (a person
filled in the form); attach their company afterwards.

---

## Part 3 — Onboarding a client

Open the client (`/admin/clients/[id]`). The header shows what they're worth:
**MRR · ARR · services · next bill date**.

### 6. Add what they're paying for

Click **+ Add service**:

1. **Service** — pick from the catalogue. Unit price and cycle prefill.
2. **Shows on this client as** — rename if useful ("Hosting (staging + prod)").
3. **Unit price × Qty** — the price of one, times how many. The total works
   itself out beside them: `$11.00 × 4 = $44.00/mo`. You never type the total, so
   you can't fat-finger it. Four mailboxes is quantity **4**, not a retyped $44.
4. **Currency / Billed** — override for this client if the deal is different.
5. **Starts** — the start date. The next bill date is worked out from it.
6. **Status** — **Awaiting payment** if they haven't paid yet.

Repeat for every line. One client can have as many as you like: Emails $44/mo
(4 × $11) + Hosting $30/mo + a one-off $2,500 build is three lines.

**Only "Active" lines count toward MRR.** That's the rule that keeps the revenue
numbers honest.

**What was actually set up.** Under each line is a **Provisioned** list — the real
things you delivered. On the Emails line, add the four addresses
(`dimitrios@raregem.com.au`, `accounts@…`); on Hosting, the domains. These get
printed on the invoice, so the client sees exactly what they're paying for. If the
number of things listed doesn't match the quantity you're billing (four addresses
but billed for three), a one-click **"set quantity to 4"** prompt appears — it
never changes the number behind your back.

If the service had a checklist, its tasks are now sitting in **Tasks &
follow-ups**, already dated.

### 7. Get them to pay

On the billing line, click **Subscription link** (it says **Payment link** on a
one-off). It shows you exactly what will be charged — the amount, and whether it
repeats — and you confirm before anything is created. Then you get a link, plus:

- **Copy** — puts it on your clipboard
- **Email it** — opens a pre-written email to that client with the link in it
- **Revoke** — kills the link

> **A link off a billing line always bills ONE cycle.** On a $88/year line it
> takes $88 now and $88 every year after, until cancelled. There is no way to
> tell it "two years" — that's what an **invoice** is for (7b below). Editing the
> next bill date doesn't change it either; that field is only the CRM's reminder,
> not what the client gets charged.

When the client pays, everything happens by itself:

- The line flips to **Active**
- The next bill date is set from the payment
- The payment appears under **Payments** on the client and on `/admin/revenue`
- MRR updates everywhere

> **Don't set a line to Active by hand to mean "they paid".** If you do, you've
> recorded revenue nobody sent you. Let the payment do it.

**Right now payments are in test mode.** Links open a checkout page inside our
own site, and pressing Pay runs the whole flow without money moving. Once a
Stripe account is connected, the same button produces a real Stripe link and
nothing else about your job changes. The Revenue page always says which mode
you're in.

### 7b. Send them an invoice

A payment link takes money. An **invoice** is the document their accountant files
to claim the expense — different job, and the one a business actually asks for.

On the client page, the **Invoices** card → **New invoice**:

1. **Tick the lines** to bill. The active ones are pre-ticked; a line you've
   already invoiced is tagged but still available (reissuing is fine).
2. **Bill for** — how long this invoice covers. Leave it on *One billing cycle*
   for the normal monthly invoice, or pick **1 year**, **2 years**, **3 years**,
   or **Custom…** for any number of months. See below.
3. Optionally set the **issue date**, **due date** (defaults to your payment
   terms), a **PO number** and **notes**.
4. **Create** — it lands as a **draft** so you can check it before it's a document.

**Billing two years up front.** Pick *2 years* and each recurring line is
multiplied by however many of its own cycles fit: a $44/mo line becomes 24
charges — $1,056 — and an annual line becomes 2. A one-off is never multiplied;
a project fee doesn't repeat. The builder shows the working per line, the total,
and puts that total on the **Create draft** button, so the number you're about
to commit to is never more than a glance away. The invoice then prints "24 ×
1 Sep 2026 – 31 Aug 2028" against the line plus the period in the header.

*Custom…* opens a box with a **months / years** selector next to it — set the
unit to match what you typed. Typing `2` while it says *months* means two
months, not two years.

Their **rate never changes**. The client is still on $44/mo, MRR still counts $44
— you've collected two years of it early, not signed them onto a bigger plan. And
when they pay, that line's next bill date jumps to the day after the period ends,
so they won't turn up in next month's upcoming bills.

Got the duration wrong? While it's still a **draft**, change *Bill for* at the
top of the invoice. It shows you the new line-by-line total before you commit;
press **Apply new duration** and every line and the GST re-price. Once it's sent
it's frozen like any other invoice: void and reissue.

The invoice opens. It carries **your** ABN and address, the **client's** (the
company's, when you invoiced a company), every line with its quantity and the
provisioned addresses, and the GST treatment from Settings. While it's a draft you
can edit or delete it. Then:

- **Send** — marks it sent. Now **Copy client link** or **Email it** — the client
  gets a read-only page at `/invoice/…` with a **Pay now** button (and your bank
  details for transfers). Pressing it shows them the amount, the period it
  covers and that it's a single payment; only **Continue to secure checkout**
  sends them to Stripe. It charges the invoice **balance**, once — the whole
  $1,056 on a two-year invoice, not $44 a month. The link never expires: the
  checkout is created the moment they press the button, so an invoice opened
  three weeks later still works.
- **Print** — your browser's *Save as PDF* produces the file. It's the same
  document the client sees.
- When they pay the link, the invoice marks itself **Paid**. Or click **Mark
  paid** yourself if they paid another way.
- A sent invoice can't be edited — that's deliberate, an issued invoice is a
  record. If it's wrong, **Void** it and make a new one.

The full list lives at **Invoices** in the sidebar, with a collections view:
anything sent and past due flags red.

> **A tax invoice needs your ABN.** If Settings is missing one, the invoice says
> so at the top instead of quietly printing something the client's accountant will
> reject. Fill in `/admin/settings` once and it's done.

### 8. Keep the record

Further down the client page:

- **Tasks & follow-ups** — tick off the checklist as you go. Add anything else
  you owe them, with a due date. Overdue goes red; done tasks collapse out of
  the way. Everything with a due date also shows on the Overview.

- **Timeline** — click **+ Log a call, meeting or note**. Pick the type, write
  what happened, and optionally set *when* it happened (a Friday write-up of a
  Tuesday call is still a Tuesday call). Every entry is dated and signed. This is
  what makes an account handoverable — the next person doesn't have to ask you
  what was agreed.

- **Documents** — link the contract, brief, proposal or invoice. Links, not
  uploads: it points at the Drive file the team already works from, so it can't
  go stale.

- **Editor** — change name, company, email, phone, category, status, owner or
  notes. Client status is separate from the enquiry pipeline:
  `Prospect / Active / On hold / Completed / Churned`.

### 9. Each billing cycle

On a recurring line, click **Mark billed** once you've invoiced. It moves the
due date on by one cycle.

It rolls from the **due date**, not from today — so invoicing three days late
doesn't push every future cycle three days later with it.

(With a real Stripe subscription connected, this happens on its own.)

---

## Part 4 — Watching the money

### 10. Revenue — `/admin/revenue`

- **MRR** — recurring revenue per month, and ARR beside it
- **Collected this month** — money actually received, with last month for comparison
- **Outstanding** — sent a payment link, not been paid
- **Net new MRR** — what you gained minus what you lost this month

Then:

- **MRR, last 12 months.** Solid bars are recorded snapshots. Outlined bars are
  estimates worked back from service start and cancel dates — used only for
  months from before the CRM was recording. They're drawn differently on purpose:
  an estimate should never look like a fact.
- **This month's movement** — new MRR, churned MRR, net
- **Payments** — every payment, newest first, with failures and their reasons

### 11. Activity — `/admin/activity`

Everything anyone did, newest first: enquiry changes, client edits, billing
changes, payments, sign-ins. Each row links to the record. This is how you answer
"who changed that, and when".

---

## The short daily loop

1. **Overview** → clear anything in **Tasks due**
2. **Enquiries** → triage anything marked **New**, reply, set status
3. Won one? **Convert to client** → add services → send the payment link or an invoice
4. **Overview** → anything in **Upcoming bills** due? Invoice it, hit **Mark billed**
5. **Invoices** → anything sent and overdue (red)? Chase it
6. Spoke to a client? Log it in their **Timeline** before you forget

## Weekly / monthly

- **Revenue** — is MRR going the right way? Anything **Outstanding** to chase?
- **Clients** — anyone on **Prospect** who's gone quiet? Any failed payments?
- **Services** — prices still right? Any checklist step you keep doing manually
  that should be on the list?

---

## Things that trip people up

**"I set the line to Active but no money arrived."**
Active means paying. Use **Awaiting payment** until it actually clears, or the
MRR on the dashboard is fiction.

**"I changed a price in the catalogue and nothing happened to my clients."**
Correct, and deliberate. Catalogue prices are defaults for the *next* client.
To reprice an existing client, edit the line on their page.

**"I deleted a service and panicked."**
Nothing happened to anyone's billing. Each client's line carries its own name
and price. If you only wanted it out of the dropdown, **Archive** does that and
keeps it recoverable.

**"Two clients are in different currencies and the totals look wrong."**
They're never added together. Totals group by currency and the headline shows
the largest, and says so. Adding AUD to USD would be a lie, so it isn't done.

**"An enquiry and a client have different details."**
Also deliberate. Details are copied at conversion, so editing a client never
rewrites the enquiry they came from. The enquiry is a record of what they sent.

**"Weekly billing looks higher than I expected."**
A weekly charge is counted as 52/12 per month, not ×4. There are 52 weeks in a
year, not 48 — "×4" would under-report weekly revenue by 8%.

**"I wanted to bill 2 years and Stripe only showed 1."**
You used the **link on the billing line**. That always bills one cycle and then
repeats — it has no idea what "2 years" is. Raise an **invoice** on that line
with **Bill for → 2 years** instead; the client's Pay now takes the whole amount
in one payment. Pushing the next bill date out to 2028 doesn't do it either —
that field only moves the CRM's reminder, not the charge.

**"I typed 2 in the custom duration and got one year."**
The box next to it was set to **months**. Two months on an annual line rounds to
one charge. Switch the selector to **years**, or use the *2 years* preset. The
breakdown under the picker always shows the real total before you create.
