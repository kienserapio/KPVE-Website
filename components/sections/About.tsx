import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PROCESS_STEPS } from "@/lib/data";

export function About() {
  return (
    <section id="about" className="relative py-24 sm:py-32">
      {/* full-bleed glass container — top border only, fades into the page below */}
      <div className="full-bleed relative overflow-hidden border-t border-white/12 bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />

        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="About KPVE"
            title="Built for Growth."
            highlight="Designed for Scale"
            subtitle="A clear, proven process — from first conversation to compounding results."
          />

          {/* process cards */}
          <div className="mt-16 grid gap-5 lg:grid-cols-3">
            {PROCESS_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1}>
                <SpotlightCard className="card-dots h-full rounded-2xl border-t border-white/12 bg-white/[0.05] p-7 transition-transform duration-300 hover:-translate-y-1">
                  <div className="relative z-10 flex h-full flex-col gap-7">
                    <span className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                      <Icon src={step.icon} className="size-6" />
                    </span>
                    <h3 className="text-2xl font-medium text-white">
                      {step.title}
                    </h3>
                    <p className="text-[15px] leading-7 text-white/70">
                      {step.body}
                    </p>
                    <div className="mt-auto flex flex-col gap-6">
                      <span className="h-px w-full bg-white/10" />
                      <span className="w-fit rounded-full border border-white/20 bg-black/20 px-3.5 py-1.5 text-xs text-white">
                        {step.step}
                      </span>
                    </div>
                  </div>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>

          {/* building since bar */}
          <Reveal delay={0.1} className="mt-6">
            <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-6 rounded-2xl border-t border-white/12 bg-white/[0.05] px-6 py-6 sm:flex-row sm:px-8">
              <div className="flex flex-col gap-2 text-center sm:text-left">
                <span className="flex items-center justify-center gap-2 text-lg font-medium text-gold-gradient sm:justify-start">
                  <Icon src="/icons/clock.svg" className="size-5" />
                  Building Since 2012
                </span>
                <span className="text-[15px] text-white/70">
                  An integral part of our clients&rsquo; business operations.
                </span>
              </div>
              <Button href="#services" variant="glass">
                Learn More
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
