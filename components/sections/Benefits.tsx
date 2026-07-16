import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { ServiceBenefits } from "@/lib/data";

/**
 * Split "business benefits" section — left column carries the heading + CTA,
 * right column stacks a checklist of outcomes. Content-driven for reuse across
 * service detail pages.
 */
export function Benefits({ data }: { data: ServiceBenefits }) {
  return (
    <section className="relative py-24 sm:py-32">
      {/* full-bleed glass band */}
      <div className="full-bleed relative overflow-hidden border-t border-white/12 bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* left — heading + cta */}
          <div className="flex flex-col items-start gap-8">
            <SectionHeading
              align="left"
              eyebrow={data.eyebrow}
              title={data.title}
              highlight={data.highlight}
              subtitle={data.body}
            />
            <Reveal delay={0.2}>
              <Button href={data.ctaHref} variant="gold" icon>
                {data.cta}
              </Button>
            </Reveal>
          </div>

          {/* right — checklist */}
          <div className="flex flex-col gap-4">
            {data.items.map((item, i) => (
              <Reveal key={item} delay={i * 0.08}>
                <div className="flex items-center gap-6 rounded-2xl border-t border-white/[0.08] bg-gradient-to-l from-white/[0.08] to-transparent px-6 py-6">
                  <span className="grid shrink-0 place-items-center rounded-full border-t border-white/[0.08] bg-white/[0.05] p-3">
                    <Icon src="/icons/check-circle.svg" className="size-6" />
                  </span>
                  <p className="font-medium text-[17px] leading-6 text-white/85">
                    {item}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
