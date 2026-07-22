import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/dal/session";
import { getClient } from "@/lib/dal/clients";
import { listActiveStaff } from "@/lib/dal/staff";
import { formatDateTime } from "@/lib/utils";
import {
  Card,
  CategoryBadge,
  ClientStatusBadge,
} from "@/components/admin/ui";
import { ClientEditor } from "@/components/admin/ClientEditor";
import { ClientTasks } from "@/components/admin/ClientTasks";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifySession();

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [client, staffOptions] = await Promise.all([getClient(id), listActiveStaff()]);
  if (!client) notFound();

  const openTasks = client.tasks.filter((t) => !t.done).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/clients"
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          ← Back to clients
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          <ClientStatusBadge status={client.status} />
          <CategoryBadge category={client.category} />
        </div>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          {client.company ? `${client.company} · ` : ""}
          Client since {formatDateTime(client.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                Tasks &amp; follow-ups
              </h2>
              <span className="text-xs text-[var(--admin-fg-subtle)]">
                {openTasks} open
              </span>
            </div>
            <div className="mt-4">
              <ClientTasks clientId={client.id} tasks={client.tasks} />
            </div>
          </Card>

          <ClientEditor client={client} staffOptions={staffOptions} />
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
                  href={`mailto:${client.email}`}
                  className="break-all text-[var(--admin-accent)] hover:underline"
                >
                  {client.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Phone</dt>
              <dd className="mt-0.5">
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="text-[var(--admin-accent)] hover:underline"
                  >
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-[var(--admin-fg-subtle)]">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Account owner</dt>
              <dd className="mt-0.5">
                {client.assignedStaffName ?? (
                  <span className="text-[var(--admin-fg-subtle)]">Unassigned</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Deal / value</dt>
              <dd className="mt-0.5">
                {client.value ?? (
                  <span className="text-[var(--admin-fg-subtle)]">Not set</span>
                )}
              </dd>
            </div>
            {client.sourceLeadId && (
              <div>
                <dt className="text-xs text-[var(--admin-fg-subtle)]">Origin</dt>
                <dd className="mt-0.5">
                  <Link
                    href={`/admin/leads/${client.sourceLeadId}`}
                    className="text-[var(--admin-accent)] hover:underline"
                  >
                    View original enquiry
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Last updated</dt>
              <dd className="mt-0.5 text-[var(--admin-fg-muted)]">
                {formatDateTime(client.updatedAt)}
              </dd>
            </div>
          </dl>

          <a
            href={`mailto:${client.email}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--admin-accent)] px-4 py-2.5 text-sm font-medium text-[var(--admin-accent-fg)] transition hover:brightness-110"
          >
            Reply by email
          </a>
        </Card>
      </div>
    </div>
  );
}
