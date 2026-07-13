"use client";

import Link from "next/link";
import { useRef } from "react";
import {
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

  const scaleRaw = useTransform(distance, [-140, 0, 140], [1, 1.22, 1]);
  const yRaw = useTransform(distance, [-140, 0, 140], [0, -4, 0]);
  const scale = useSpring(scaleRaw, { stiffness: 350, damping: 22, mass: 0.4 });
  const y = useSpring(yRaw, { stiffness: 350, damping: 22, mass: 0.4 });

  return (
    <motion.a
      ref={ref}
      href={href}
      style={{ scale, y }}
      className="relative rounded-full px-4 py-2 text-sm font-medium text-muted-3 transition-colors duration-200 hover:text-white"
    >
      <span className="relative z-10">{label}</span>
      <span className="absolute inset-0 rounded-full bg-white/0 transition-colors duration-200 hover:bg-white/5" />
    </motion.a>
  );
}

export function Navbar() {
  const mouseX = useMotionValue(Infinity);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > 40);
  });

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <nav
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className={`glass relative flex items-center gap-2 rounded-full py-2 pl-3 pr-2 transition-all duration-500 ${
          scrolled
            ? "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
            : ""
        }`}
      >
        {/* liquid glass sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/10 to-transparent opacity-60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />

        {/* logo */}
        <Link
          href="#home"
          className="relative z-10 flex items-center justify-center rounded-full p-1.5 transition-transform duration-300 hover:scale-105"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KPVE" className="size-8 object-contain" />
        </Link>

        {/* dock links */}
        <div className="relative z-10 hidden items-center md:flex">
          {NAV_LINKS.map((link) => (
            <DockItem
              key={link.label}
              mouseX={mouseX}
              label={link.label}
              href={link.href}
            />
          ))}
        </div>

        {/* CTA */}
        <Link
          href="#contact"
          className="relative z-10 ml-1 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-muted-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:text-white"
        >
          Let&rsquo;s Talk!
        </Link>
      </nav>
    </motion.header>
  );
}
