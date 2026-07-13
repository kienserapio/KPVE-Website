import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { FOOTER_LINKS, SOCIAL_LINKS } from "@/lib/data";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line px-6 pt-20 pb-10">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute -bottom-40 left-1/2 size-[620px] -translate-x-1/2 rounded-full bg-gold/10 blur-[100px]" />
      </div>

      <div className="mx-auto max-w-7xl">
        {/* top row */}
        <div className="flex flex-col justify-between gap-8 border-b border-white/10 pb-10 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3">
            <span className="text-sm text-muted">Contact Us:</span>
            <a
              href="mailto:info@kpve.com"
              className="group inline-flex items-center gap-3 text-2xl font-medium text-white transition-colors hover:text-gold"
            >
              info@kpve.com
              <Icon
                src="/icons/mail.svg"
                tone="gold"
                className="size-6 transition-transform duration-300 group-hover:scale-110"
              />
            </a>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-muted-3 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* wordmark */}
        <Reveal className="flex items-center justify-center gap-5 py-16 sm:gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="KPVE"
            className="size-20 object-contain sm:size-28"
          />
          <span className="bg-gradient-to-b from-white to-white/30 bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-8xl lg:text-9xl">
            Kappatos
          </span>
        </Reveal>

        {/* bottom row */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-sm text-muted">
            Copyright © 2026 KPVE. All rights reserved.
          </p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {SOCIAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-muted-3 transition-colors duration-200 hover:text-gold"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
