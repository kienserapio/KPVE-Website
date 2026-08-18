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
  "client_service.item_added": "Provisioned item added",
  "client_service.item_removed": "Provisioned item removed",
  "payment.link_created": "Payment link created",
  "payment.link_revoked": "Payment link revoked",
  "payment.succeeded": "Payment received",
  "payment.failed": "Payment failed",
  "payment.subscription_cancelled": "Subscription cancelled at the provider",
  "note.added": "Timeline entry added",
  "note.deleted": "Timeline entry deleted",
  "document.added": "Document linked",
  "document.removed": "Document unlinked",
  "checklist.item_added": "Checklist step added",
  "checklist.item_removed": "Checklist step removed",
  "settings.updated": "Business settings updated",
  "invoice.created": "Invoice drafted",
  "invoice.sent": "Invoice sent",
  "invoice.paid": "Invoice paid",
  "invoice.void": "Invoice voided",
  "invoice.deleted": "Draft invoice deleted",
  "login.success": "Signed in",
  "login.failed": "Failed sign-in attempt",
  logout: "Signed out",
  "portal.login.success": "Client signed in to the portal",
  "portal.login.failed": "Failed client portal sign-in",
  "portal.logout": "Client signed out of the portal",
  "portal_access.issued": "Portal login created",
  "portal_access.code_reissued": "Portal access code reissued",
  "portal_access.disabled": "Portal login disabled",
  "portal_access.enabled": "Portal login re-enabled",
  "portal_access.unlocked": "Portal login unlocked",
  "portal_access.removed": "Portal login removed",
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
                    ) : item.entityType === "invoice" && item.entityId ? (
                      <Link
                        href={`/admin/invoices/${item.entityId}`}
                        className="text-[var(--admin-accent)] hover:underline"
                      >
                        View invoice
                      </Link>
                    ) : item.entityType === "settings" ? (
                      <Link
                        href="/admin/settings"
                        className="text-[var(--admin-accent)] hover:underline"
                      >
                        View settings
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
