import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import type { ServiceProcess } from "@/lib/data";

/**
 * Horizontal numbered process timeline. Steps sit on a connector line and
 * carry a gold-gradient number, title, and copy. Content-driven for reuse.
 */
export function Process({ data }: { data: ServiceProcess }) {
  return (
    <section className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={data.eyebrow}
          title={data.title}
          highlight={data.highlight}
          subtitle={data.subtitle}
        />

        <div className="relative mt-16">
          {/* connector line — desktop only, sits behind the number badges */}
          <div className="pointer-events-none absolute inset-x-[12%] top-[35px] hidden h-px bg-white/10 lg:block" />

          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            {data.steps.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.1}>
                <div className="flex flex-col items-center gap-10 text-center">
                  <span className="relative grid size-[70px] place-items-center rounded-[15px] border border-white/12 bg-surface">
                    <span className="text-[36px] font-semibold leading-none text-gold-gradient">
                      {step.num}
                    </span>
                  </span>
                  <div className="flex flex-col gap-4">
                    <h3 className="text-[22px] font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="text-base leading-7 text-white/70">
                      {step.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
