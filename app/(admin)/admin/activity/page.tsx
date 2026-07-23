import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listActivity } from "@/lib/dal/activity";
import { formatDateTime } from "@/lib/utils";
import { Card, EmptyState, Table, Td, Th } from "@/components/admin/ui";

const ACTION_LABELS: Record<string, string> = {
  "lead.created": "New enquiry received",
  "lead.updated": "Enquiry updated",
  "lead.deleted": "Enquiry deleted",
  "client.created": "Client added",
  "client.updated": "Client updated",
  "client.deleted": "Client deleted",
  "task.created": "Task added",
  "service.created": "Service added to catalogue",
  "service.updated": "Service updated",
  "service.deleted": "Service removed from catalogue",
  "client_service.added": "Client put on a service",
  "client_service.updated": "Client service changed",
  "client_service.billed": "Service marked billed",
  "client_service.removed": "Client service removed",
  "login.success": "Signed in",
  "login.failed": "Failed sign-in attempt",
  logout: "Signed out",
};

export default async function ActivityPage() {
  await verifySession();
  const items = await listActivity();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Audit trail of enquiry changes and sign-ins.
        </p>
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Actions taken in the dashboard will be recorded here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>By</Th>
                <Th>Entity</Th>
                <Th className="text-right">When</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="transition hover:bg-[var(--admin-surface-2)]">
                  <Td className="font-medium">
                    {ACTION_LABELS[item.action] ?? item.action}
                  </Td>
                  <Td className="text-[var(--admin-fg-muted)]">
                    {item.actorName ?? (item.actorType === "system" ? "System" : "—")}
                  </Td>
                  <Td>
                    {item.entityType === "lead" && item.entityId ? (
                      <Link
                        href={`/admin/leads/${item.entityId}`}
                        className="text-[var(--admin-accent)] hover:underline"
                      >
                        View enquiry
                      </Link>
                    ) : item.entityType === "client" && item.entityId ? (
                      <Link
                        href={`/admin/clients/${item.entityId}`}
                        className="text-[var(--admin-accent)] hover:underline"
                      >
                        View client
                      </Link>
                    ) : item.entityType === "service" ? (
                      <Link
                        href="/admin/services"
                        className="text-[var(--admin-accent)] hover:underline"
                      >
                        View services
                      </Link>
                    ) : (
                      <span className="text-[var(--admin-fg-subtle)]">
                        {item.entityType}
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-[var(--admin-fg-subtle)]">
                    {formatDateTime(item.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
