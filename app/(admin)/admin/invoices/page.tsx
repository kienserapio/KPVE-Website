import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listInvoices, getInvoiceStats } from "@/lib/dal/invoices";
import type { InvoiceStatus } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/billing";
import {
  Card,
  EmptyState,
  InvoiceStatusBadge,
  Money,
  StatCard,
  Table,
  Td,
  Th,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUSES,
} from "@/components/admin/ui";
import { InvoiceFilters } from "@/components/admin/InvoiceFilters";
import { InvoiceRowDelete } from "@/components/admin/InvoiceRowDelete";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseStatus(value: string | string[] | undefined): InvoiceStatus | undefined {
  return typeof value === "string" && (INVOICE_STATUSES as string[]).includes(value)
    ? (value as InvoiceStatus)
    : undefined;
}

function parseClient(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verifySession();

  const params = await searchParams;
  const status = parseStatus(params.status);
  const client = parseClient(params.client);

  const [stats, invoices] = await Promise.all([
    getInvoiceStats(),
    listInvoices({ status, clientId: client }),
  ]);

  // The client name for the "filtered to…" line comes off the rows themselves —
  // every one carries it, so no extra lookup just to label the filter.
  const clientName = client ? invoices[0]?.clientName : undefined;
  const hasFilters = Boolean(status || client);

  // Where a row delete lands: this same view, filters and all. Pruning a
  // filtered queue shouldn't dump staff back at the unfiltered top of the list.
  const filterQuery = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(client ? { client } : {}),
  }).toString();
  const returnTo = `/admin/invoices${filterQuery ? `?${filterQuery}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Every tax invoice raised. Overdue ones flag red — that&apos;s the
          collections queue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Draft" value={stats.draft} hint="Not sent yet" />
        <StatCard
          label="Outstanding"
          value={formatMoney(stats.outstandingCents, stats.currency)}
          accent
          hint={`${stats.sent} sent, awaiting payment`}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          hint={stats.overdue > 0 ? "Sent, past due date" : "Nothing past due"}
        />
        <StatCard
          label="Paid this month"
          value={formatMoney(stats.paidThisMonthCents, stats.currency)}
          hint="Marked paid since the 1st"
        />
      </div>

      <Card>
        <div className="border-b border-[var(--admin-border)] p-4">
          <InvoiceFilters
            currentStatus={status}
            currentClient={client}
            currentClientName={clientName}
          />
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No matching invoices" : "No invoices yet"}
            description={
              hasFilters
                ? "Try a different status, or clear the filter."
                : "Invoices are raised from a client page — open a client, pick the lines to bill, and a draft lands here."
            }
          >
            {hasFilters ? (
              <Link
                href="/admin/invoices"
                className="mt-2 text-sm font-medium text-[var(--admin-accent)] hover:underline"
              >
                Clear filters
              </Link>
            ) : (
              <Link
                href="/admin/clients"
                className="mt-2 text-sm font-medium text-[var(--admin-accent)] hover:underline"
              >
                Go to clients
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Client</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="group transition hover:bg-[var(--admin-surface-2)]"
                  >
                    <Td>
                      <Link
                        href={`/admin/invoices/${invoice.id}`}
                        className="font-medium tabular-nums hover:text-[var(--admin-accent)] hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/clients/${invoice.clientId}`}
                        className="hover:text-[var(--admin-accent)] hover:underline"
                      >
                        {invoice.clientName}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-[var(--admin-fg-muted)]">
                      {formatDate(invoice.issueDate)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {invoice.dueDate ? (
                        // Overdue is the one thing this table exists to surface —
                        // the due date carries the red, same treatment as an
                        // overdue billing line.
                        <span
                          className={
                            invoice.overdue
                              ? "font-medium text-red-500"
                              : "text-[var(--admin-fg-muted)]"
                          }
                        >
                          {formatDate(invoice.dueDate)}
                        </span>
                      ) : (
                        <span className="text-[var(--admin-fg-subtle)]">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Money className="font-medium">
                        {formatMoney(invoice.totalCents, invoice.currency)}
                      </Money>
                    </Td>
                    <Td>
                      <InvoiceStatusBadge status={invoice.status} />
                    </Td>
                    {/* Prunable straight from the list, so clearing out drafts
                        and voided records doesn't mean opening each one. Same
                        two rules as everywhere else, and the DAL enforces them
                        either way: a draft isn't a document yet, and a void one
                        is already a closed record. Sent and paid have no Delete
                        here at all — they are voided first, on their own page. */}
                    <Td className="text-right">
                      {(invoice.status === "draft" || invoice.status === "void") && (
                        <InvoiceRowDelete invoiceId={invoice.id} redirectTo={returnTo} />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="p-4 text-sm text-[var(--admin-fg-muted)]">
              {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
              {status ? ` · ${INVOICE_STATUS_LABELS[status]}` : ""}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";
