"use client";

import { useEffect, useRef } from "react";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { HERO_STATS, CONTACT_HERO } from "@/lib/data";

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
 * Hero for the dedicated /contact page. Shares the homepage Hero's visual
 * treatment (background video, gradient overlays, 3-up stats card) but carries
 * contact-specific copy and a single primary CTA that scrolls to the form.
 */
export function ContactHero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  // pause the background video while the hero is off-screen so it stops
  // decoding/compositing and doesn't tax paints elsewhere on the page
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
            <motion.p
              variants={item}
              className="mb-6 text-sm font-medium tracking-[0.25em] text-muted-3"
            >
              GET IN TOUCH
            </motion.p>

            <motion.h1
              variants={item}
              className="text-[clamp(2.1rem,4.6vw,3.9rem)] font-normal leading-[1.08] tracking-tight text-white"
            >
              <span className="block whitespace-normal sm:whitespace-nowrap">
                {CONTACT_HERO.titleLead}
              </span>
              <span className="block whitespace-normal text-gold-gradient sm:whitespace-nowrap">
                {CONTACT_HERO.titleHighlight}
              </span>
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-7 max-w-xl text-lg leading-8 text-muted-3"
            >
              {CONTACT_HERO.subtitle}
            </motion.p>

            <motion.div
              variants={item}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Button href={CONTACT_HERO.ctaHref} variant="gold" icon>
                {CONTACT_HERO.cta}
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
