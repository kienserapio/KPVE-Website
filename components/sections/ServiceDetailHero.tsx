"use client";

import { useEffect, useRef } from "react";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { HERO_STATS, type ServiceHero } from "@/lib/data";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.3 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 34 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

/**
 * Hero for an individual service detail page (/services/<slug>). Shares the
 * homepage Hero treatment (background video, overlays, 3-up stats card) with a
 * primary + secondary CTA. Content is fed via props so every service reuses it.
 */
export function ServiceDetailHero({ hero }: { hero: ServiceHero }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.05 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="home"
      className="relative flex min-h-screen flex-col justify-end overflow-hidden pt-32 pb-16"
    >
      {/* ---- background video ---- */}
      <video
        ref={videoRef}
        className="absolute inset-0 -z-20 h-full w-full object-cover opacity-20"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>

      {/* ---- gradient overlays ---- */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[45vh] bg-gradient-to-b from-gold/20 via-gold/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[55vh] bg-gradient-to-t from-ink via-ink/85 to-transparent" />
        <div className="absolute inset-0 bg-grid opacity-30 mask-fade-y" />
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-8 sm:px-12 lg:px-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid items-end gap-10 lg:grid-cols-[1fr_auto] lg:gap-20"
        >
          {/* -------- left column -------- */}
          <div>
            <motion.h1
              variants={item}
              className="text-[clamp(2.1rem,4.6vw,3.9rem)] font-normal leading-[1.08] tracking-tight text-white"
            >
              <span className="block whitespace-normal sm:whitespace-nowrap">
                {hero.titleLead}
              </span>
              {hero.titleHighlight && (
                <span className="block whitespace-normal text-gold-gradient sm:whitespace-nowrap">
                  {hero.titleHighlight}
                </span>
              )}
            </motion.h1>

            {hero.tagline && (
              <motion.p
                variants={item}
                className="mt-3 text-[clamp(1.4rem,3vw,2.3rem)] font-medium leading-tight tracking-tight text-white"
              >
                {hero.tagline}
                {hero.taglineHighlight && (
                  <span className="text-gold-gradient">
                    {hero.taglineHighlight}
                  </span>
                )}
              </motion.p>
            )}

            <motion.p
              variants={item}
              className="mt-7 max-w-xl text-lg leading-8 text-muted-3"
            >
              {hero.subtitle}
            </motion.p>

            <motion.div
              variants={item}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Button href={hero.primaryHref} variant="gold" icon>
                {hero.primaryCta}
              </Button>
              <Button href={hero.secondaryHref} variant="glass">
                {hero.secondaryCta}
              </Button>
            </motion.div>
          </div>

          {/* -------- right column: horizontal 3-up stats card -------- */}
          <motion.div
            variants={item}
            className="glass grid grid-cols-3 divide-x divide-white/10 rounded-3xl lg:justify-self-end"
          >
            {HERO_STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1.5 px-5 py-7 text-center sm:px-7"
              >
                <span className="text-3xl font-medium text-gold-gradient sm:text-4xl">
                  {stat.value}
                </span>
                <span className="text-xs text-muted sm:text-sm">
                  {stat.label}
                </span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
