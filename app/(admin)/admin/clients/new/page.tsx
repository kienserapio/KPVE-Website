import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listActiveStaff } from "@/lib/dal/staff";
import { ClientForm } from "@/components/admin/ClientForm";

export default async function NewClientPage() {
  await verifySession();
  const staffOptions = await listActiveStaff();

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
          Add someone you&apos;re working with outside the enquiry pipeline.
        </p>
      </div>

      <ClientForm staffOptions={staffOptions} />
    </div>
  );
}
