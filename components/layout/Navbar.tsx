"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/data";

/** A single dock item that magnifies based on cursor proximity. */
function DockItem({
  mouseX,
  label,
  href,
}: {
  mouseX: MotionValue<number>;
  label: string;
  href: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  // distance from cursor to the centre of this item
  const distance = useTransform(mouseX, (x) => {
    const bounds = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: 0,
    };
    return x - (bounds.x + bounds.width / 2);
  });

  const scaleRaw = useTransform(distance, [-140, 0, 140], [1, 1.18, 1]);
  const yRaw = useTransform(distance, [-140, 0, 140], [0, -3, 0]);
  const scale = useSpring(scaleRaw, { stiffness: 350, damping: 22, mass: 0.4 });
  const y = useSpring(yRaw, { stiffness: 350, damping: 22, mass: 0.4 });

  return (
    <motion.a
      ref={ref}
      href={href}
      style={{ scale, y }}
      className="relative rounded-full px-3 py-1.5 text-sm font-medium text-muted-3 transition-colors duration-200 hover:text-white"
    >
      <span className="relative z-10">{label}</span>
      <span className="absolute inset-0 rounded-full bg-white/0 transition-colors duration-200 hover:bg-white/5" />
    </motion.a>
  );
}

export function Navbar() {
  const mouseX = useMotionValue(Infinity);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > 40);
  });

  // lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-white/5 bg-ink/70 backdrop-blur-md" : ""
      }`}
    >
      <nav
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10"
      >
        {/* logo */}
        <Link
          href="/#home"
          className="flex items-center transition-transform duration-300 hover:scale-105"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KPVE" className="size-12 object-contain" />
        </Link>

        {/* dock links */}
        <div className="hidden items-center gap-6 md:flex lg:gap-10">
          {NAV_LINKS.map((link) => (
            <DockItem
              key={link.label}
              mouseX={mouseX}
              label={link.label}
              href={link.href}
            />
          ))}
        </div>

        {/* CTA — desktop only */}
        <Link
          href="/contact"
          className="hidden rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-muted-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:text-white md:inline-block"
        >
          Let&rsquo;s Talk!
        </Link>

        {/* hamburger — mobile only */}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="relative z-50 flex size-10 flex-col items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 md:hidden"
        >
          <motion.span
            animate={menuOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.25 }}
            className="block h-0.5 w-5 rounded-full bg-white"
          />
          <motion.span
            animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="block h-0.5 w-5 rounded-full bg-white"
          />
          <motion.span
            animate={menuOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.25 }}
            className="block h-0.5 w-5 rounded-full bg-white"
          />
        </button>
      </nav>

      {/* mobile side drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm md:hidden"
            />

            {/* panel */}
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed right-0 top-0 z-40 flex h-full w-72 max-w-[80%] flex-col gap-2 border-l border-white/10 bg-ink/95 px-6 pb-8 pt-24 backdrop-blur-md md:hidden"
            >
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
                >
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-4 py-3 text-base font-medium text-muted-3 transition-colors duration-200 hover:bg-white/5 hover:text-white"
                  >
                    {link.label}
                  </a>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + NAV_LINKS.length * 0.06, duration: 0.3 }}
                className="mt-4"
              >
                <Link
                  href="/contact"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-full border border-white/10 bg-white/5 px-6 py-3 text-center text-sm font-medium text-muted-3 transition-all duration-300 hover:border-gold/40 hover:text-white"
                >
                  Let&rsquo;s Talk!
                </Link>
              </motion.div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
