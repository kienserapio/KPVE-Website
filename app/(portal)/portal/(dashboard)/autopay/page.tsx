import type { Metadata } from "next";

import { AutopayPanel } from "@/components/portal/AutopayPanel";
import { Banner, PageHeader, SectionCard } from "@/components/portal/ui";
import { getPortalAutopay } from "@/lib/dal/autopay";

export const metadata: Metadata = {
  title: "AutoPay — KPVE",
  robots: { index: false, follow: false },
};

// Read on every visit. A page about whether money is about to leave someone's
// account is the last place to serve a cached answer.
export const dynamic = "force-dynamic";

export default async function PortalAutopayPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; cancelled?: string }>;
}) {
  const [{ saved, cancelled }, autopay] = await Promise.all([
    searchParams,
    getPortalAutopay(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AutoPay"
        subtitle="Let your invoices pay themselves on the day they fall due."
      />

      {/* Stripe redirects here the moment the card form is submitted, but the
          card itself arrives on a webhook a beat later. Saying "saved" when the
          panel below still says "off" would read as a bug, so this says what is
          actually true. */}
      {saved === "1" && !autopay.enabled ? (
        <Banner tone="warning" title="Just finishing up">
          Your card is being saved. Give it a few seconds and refresh this page.
        </Banner>
      ) : null}

      {saved === "1" && autopay.enabled ? (
        <Banner tone="success" title="AutoPay is on">
          We&rsquo;ll take it from here.
        </Banner>
      ) : null}

      {cancelled === "1" ? (
        <Banner tone="neutral" title="Nothing saved">
          You backed out before saving a card, so nothing has changed.
        </Banner>
      ) : null}

      <SectionCard title="Your card" subtitle="Used only for the invoices we issue you">
        <AutopayPanel autopay={autopay} />
      </SectionCard>

      <p className="text-xs leading-relaxed text-[var(--admin-fg-subtle)]">
        Questions about a charge? Reply to any invoice email and a person will answer.
      </p>
    </div>
  );
}
