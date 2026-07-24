import { requireSession } from "@/lib/dal/session";
import { exportClients } from "@/lib/dal/clients";
import { clientFiltersSchema } from "@/lib/validation";
import { toCsv, csvDateStamp } from "@/lib/csv";
import {
  CATEGORY_LABELS,
  CLIENT_STATUS_LABELS,
  CLIENT_TYPE_LABELS,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = clientFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const rows = await exportClients(filters);

  const csv = toCsv(
    [
      "Name",
      "Type",
      "Contact person",
      "Company",
      "Owned by",
      "Email",
      "Phone",
      "Category",
      "Status",
      // Plain decimal, not a formatted string — this column gets summed in a
      // spreadsheet, and "$1,100.00" sums to nothing.
      "MRR",
      "Currency",
      "ARR",
      "Account owner",
      "Open tasks",
      "Created",
      "Updated",
    ],
    rows.map((r) => [
      r.name,
      CLIENT_TYPE_LABELS[r.clientType],
      r.contactName,
      r.company,
      r.parentName,
      r.email,
      r.phone,
      CATEGORY_LABELS[r.category],
      CLIENT_STATUS_LABELS[r.status],
      (r.mrrCents / 100).toFixed(2),
      r.mrrCurrency ?? "",
      ((r.mrrCents * 12) / 100).toFixed(2),
      r.assignedStaffName,
      r.openTasks,
      r.createdAt.toISOString(),
      r.updatedAt.toISOString(),
    ]),
  );

  const filename = `kpve-clients-${csvDateStamp(new Date())}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
