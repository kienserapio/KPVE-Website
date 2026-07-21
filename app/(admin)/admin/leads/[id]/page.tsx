import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/dal/session";
import { getLead } from "@/lib/dal/leads";
import { listActiveStaff } from "@/lib/dal/staff";
import { formatDateTime } from "@/lib/utils";
import { Card, StatusBadge } from "@/components/admin/ui";
import { LeadEditor } from "@/components/admin/LeadEditor";

// Reject anything that isn't a UUID before it reaches the database.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifySession();

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [lead, staffOptions] = await Promise.all([getLead(id), listActiveStaff()]);
  if (!lead) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          ← Back to enquiries
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {lead.firstName} {lead.lastName}
          </h1>
          <StatusBadge status={lead.status} />
        </div>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Received {formatDateTime(lead.createdAt)} via{" "}
          <code className="rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-xs">
            {lead.source}
          </code>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
              Message
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
              {lead.message}
            </p>
          </Card>

          <LeadEditor lead={lead} staffOptions={staffOptions} />
        </div>

        <Card className="h-fit p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Contact
          </h2>
          <dl className="mt-4 flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Email</dt>
              <dd className="mt-0.5">
                <a
                  href={`mailto:${lead.email}`}
                  className="break-all text-[var(--admin-accent)] hover:underline"
                >
                  {lead.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Phone</dt>
              <dd className="mt-0.5">
                {lead.phone ? (
                  <a
                    href={`tel:${lead.phone}`}
                    className="text-[var(--admin-accent)] hover:underline"
                  >
                    {lead.phone}
                  </a>
                ) : (
                  <span className="text-[var(--admin-fg-subtle)]">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Assigned to</dt>
              <dd className="mt-0.5">
                {lead.assignedStaffName ?? (
                  <span className="text-[var(--admin-fg-subtle)]">Unassigned</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Last updated</dt>
              <dd className="mt-0.5 text-[var(--admin-fg-muted)]">
                {formatDateTime(lead.updatedAt)}
              </dd>
            </div>
          </dl>

          <a
            href={`mailto:${lead.email}?subject=${encodeURIComponent("Re: your enquiry with KPVE")}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--admin-accent)] px-4 py-2.5 text-sm font-medium text-[var(--admin-accent-fg)] transition hover:brightness-110"
          >
            Reply by email
          </a>
        </Card>
      </div>
    </div>
  );
}
