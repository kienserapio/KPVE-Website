import { requireSession } from "@/lib/dal/session";
import { exportLeads } from "@/lib/dal/leads";
import { leadFiltersSchema } from "@/lib/validation";
import { toCsv, csvDateStamp } from "@/lib/csv";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Route handlers aren't covered by proxy.ts — authorize here.
  try {
    await requireSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = leadFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const rows = await exportLeads(filters);

  const csv = toCsv(
    [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "Category",
      "Priority",
      "Status",
      "Source",
      "Assigned to",
      "Message",
      "Received",
    ],
    rows.map((r) => [
      r.firstName,
      r.lastName,
      r.email,
      r.phone,
      CATEGORY_LABELS[r.category],
      PRIORITY_LABELS[r.priority],
      STATUS_LABELS[r.status],
      r.source,
      r.assignedStaffName,
      r.message,
      r.createdAt.toISOString(),
    ]),
  );

  const filename = `kpve-enquiries-${csvDateStamp(new Date())}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
