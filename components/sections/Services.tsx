import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SERVICES, SERVICES_CTA, type Service } from "@/lib/data";

function ServiceCard({ service }: { service: Service }) {
  return (
    <SpotlightCard
      radius={420}
      className="group/card card-dots h-full rounded-[20px] border border-line-3 bg-gradient-to-b from-white/[0.04] to-transparent p-8 transition-transform duration-300 hover:-translate-y-1.5 hover:border-gold/25"
    >
      <div className="relative z-10 flex h-full flex-col items-center gap-6 text-center">
        {/* layered icon */}
        <span className="grid place-items-center rounded-full border-2 border-line-3 bg-gradient-to-b from-surface-2 to-transparent p-3.5 transition-transform duration-300 group-hover/card:scale-105">
          <span className="grid place-items-center rounded-full border-2 border-line-3 bg-gradient-to-b from-surface-2 to-transparent p-4">
            <span className="grid place-items-center rounded-2xl border-2 border-line-3 bg-gradient-to-b from-surface-2 to-transparent p-3.5">
              <Icon src={service.icon} className="size-7" />
            </span>
          </span>
        </span>

        <h3 className="font-sora text-2xl font-semibold text-white">
          {service.title}
        </h3>
        <p className="font-sora text-[15px] leading-7 text-muted">
          {service.body}
        </p>
        <span className="mt-auto inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-surface-2 px-6 py-3 font-sora text-sm text-white transition-colors duration-300 group-hover/card:border-gold/40">
          Learn More
          <Icon
            src="/icons/arrow.svg"
            tone="white"
            className="size-4 transition-transform duration-300 group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5"
          />
        </span>
      </div>
    </SpotlightCard>
  );
}

export function Services() {
  return (
    <section id="services" className="relative py-24 sm:py-32">
      {/* full-bleed glass container — top border only, fades into the page below */}
      <div className="full-bleed relative overflow-hidden border-t border-white/12 bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />

        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
            <SectionHeading
              align="left"
              eyebrow="KPVE Capabilities"
              title="Services"
              highlight="We Offer"
              subtitle="We support organizations across a wide range of industries, giving us a unique insight into building successful businesses."
            />
            <Reveal delay={0.2} className="hidden md:block">
              <Button href="#contact" variant="glass">
                Explore More
              </Button>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service, i) => (
              <Reveal key={service.title} delay={(i % 3) * 0.08}>
                <ServiceCard service={service} />
              </Reveal>
            ))}

            {/* CTA occupies two card slots — centered, clean (no inner fill) */}
            <Reveal className="sm:col-span-2">
              <SpotlightCard className="card-dots relative flex h-full items-center justify-center rounded-[20px] border border-line-3 bg-gradient-to-b from-white/[0.04] to-transparent p-10">
                <div className="relative z-10 flex flex-col items-center gap-5 text-center">
                  <h3 className="max-w-lg text-3xl font-semibold leading-tight text-gold-gradient sm:text-4xl">
                    {SERVICES_CTA.title}
                  </h3>
                  <p className="max-w-xl font-sora text-[15px] leading-7 text-muted">
                    {SERVICES_CTA.body}
                  </p>
                  <p className="font-sora text-base text-white">
                    {SERVICES_CTA.note}
                  </p>
                  <Button href="#contact" variant="gold" icon>
                    {SERVICES_CTA.cta}
                  </Button>
                </div>
              </SpotlightCard>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
