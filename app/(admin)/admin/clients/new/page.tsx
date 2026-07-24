import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listIndividualClients } from "@/lib/dal/clients";
import { listActiveStaff } from "@/lib/dal/staff";
import { ClientForm } from "@/components/admin/ClientForm";

export default async function NewClientPage() {
  await verifySession();
  // The individuals a new business can be owned by. Fetched even when the form
  // opens as "Individual" — the choice is one click away and re-fetching on it
  // would mean a round trip in the middle of typing.
  const [staffOptions, parentOptions] = await Promise.all([
    listActiveStaff(),
    listIndividualClients(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/admin/clients"
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          ← Back to clients
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">New client</h1>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Just who they are. You&apos;ll add what they pay for — services, prices
          and billing cycles — on their page next.
        </p>
      </div>

      <ClientForm staffOptions={staffOptions} parentOptions={parentOptions} />
    </div>
  );
}
