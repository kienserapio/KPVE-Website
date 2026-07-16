import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Icon } from "@/components/ui/Icon";
import type { ServiceCapabilities } from "@/lib/data";

/**
 * "Everything included" capabilities grid — icon + title + copy cards.
 * Content-driven for reuse across service detail pages.
 */
export function Capabilities({ data }: { data: ServiceCapabilities }) {
  return (
    <section className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={data.eyebrow}
          title={data.title}
          highlight={data.highlight}
          subtitle={data.subtitle}
        />

        {/* flex-wrap + justify-center so an incomplete last row stays centered */}
        <div className="mt-16 flex flex-wrap justify-center gap-5">
          {data.items.map((item, i) => (
            <Reveal
              key={item.title}
              delay={(i % 3) * 0.08}
              className="w-full sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
            >
              <SpotlightCard className="h-full rounded-[15px] border-t border-white/12 bg-white/[0.05] p-7 transition-transform duration-300 hover:-translate-y-1.5">
                <div className="relative z-10 flex h-full flex-col gap-7">
                  <Icon src={item.icon} className="size-8" />
                  <h3 className="text-[22px] font-medium text-white">
                    {item.title}
                  </h3>
                  <p className="text-base leading-7 text-white/75">
                    {item.body}
                  </p>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
