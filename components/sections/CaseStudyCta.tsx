/* eslint-disable @next/next/no-img-element */
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Button } from "@/components/ui/Button";
import { ABOUT_CTA } from "@/lib/data";

/**
 * Closing CTA banner — "Become our next case study." A photographic backdrop
 * dimmed under the ink + gold wash, with a single primary action.
 */
export function CaseStudyCta() {
  return (
    <section className="relative px-6 py-16 sm:py-24">
      <Reveal className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10">
          {/* backdrop */}
          <img
            src={ABOUT_CTA.image}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-105 object-cover"
          />
          <div className="absolute inset-0 bg-ink/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/45" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(70%_100%_at_50%_100%,rgba(189,139,40,0.22),transparent)]" />
          <div className="absolute inset-0 bg-grid opacity-20" />

          {/* content */}
          <div className="relative z-10 flex flex-col items-center gap-7 px-6 py-20 text-center sm:px-12 sm:py-28">
            <Eyebrow>{ABOUT_CTA.eyebrow}</Eyebrow>
            <h2 className="max-w-3xl text-balance text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[58px]">
              {ABOUT_CTA.title}
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-3">
              {ABOUT_CTA.body}
            </p>
            <div className="mt-2">
              <Button href={ABOUT_CTA.ctaHref} variant="gold" icon>
                {ABOUT_CTA.cta}
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
