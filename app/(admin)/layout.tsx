import type { Metadata } from "next";
import { cookies } from "next/headers";

import { verifySession } from "@/lib/dal/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Dashboard — KPVE",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layouts do not re-render on every navigation under Partial Rendering, so
  // this check alone is not sufficient — each page and action re-verifies.
  // It is here to render the shell with the signed-in user's details.
  const staff = await verifySession();

  // Read server-side so the correct theme is in the first HTML response.
  // No inline script, no flash of the wrong theme.
  const theme =
    (await cookies()).get("kpve_theme")?.value === "light" ? "light" : "dark";

  return (
    <AdminShell staff={staff} theme={theme}>
      {children}
    </AdminShell>
  );
}
