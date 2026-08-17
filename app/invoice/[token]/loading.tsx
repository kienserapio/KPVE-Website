import { PageLoader } from "@/components/PageLoader";

/**
 * The client's copy of an invoice. It is force-dynamic and reads live payment
 * state, so it always costs a round trip — exactly the case a fallback is for.
 * Light theme to match the sheet it becomes.
 */
export default function InvoiceLoading() {
  return (
    <main
      data-theme="light"
      className="min-h-screen bg-[var(--admin-bg)] px-4 py-8 text-[var(--admin-fg)]"
    >
      <PageLoader label="Loading invoice" />
    </main>
  );
}
