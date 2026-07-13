import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { FOOTER_LINKS, SOCIAL_LINKS } from "@/lib/data";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line px-6 pt-16 pb-8">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute -bottom-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-gold/10 blur-[100px]" />
      </div>

      <div className="mx-auto max-w-7xl">
        {/* main row: brand + link columns (room for more sublinks) */}
        <div className="grid gap-12 border-b border-white/10 pb-12 md:grid-cols-[1.4fr_1fr_1fr] lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* brand */}
          <div className="flex flex-col gap-5">
            <Link href="#home" className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="KPVE" className="size-11 object-contain" />
              <span className="text-xl font-semibold tracking-tight text-white">
                KPVE
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-6 text-muted">
              Built for growth. Designed for scale. We design, develop, and grow
              products people love.
            </p>
            <a
              href="mailto:info@kpve.com"
              className="group inline-flex items-center gap-2 text-sm font-medium text-white transition-colors hover:text-gold"
            >
              info@kpve.com
              <Icon
                src="/icons/mail.svg"
                tone="gold"
                className="size-4 transition-transform duration-300 group-hover:scale-110"
              />
            </a>
          </div>

          {/* navigation */}
          <FooterColumn title="Navigation" links={FOOTER_LINKS} />

          {/* company (placeholder sublinks, ready to extend) */}
          <FooterColumn
            title="Company"
            links={[
              { label: "About Us", href: "#about" },
              { label: "Services", href: "#services" },
              { label: "Projects", href: "#projects" },
              { label: "FAQs", href: "#faq" },
            ]}
          />

          {/* social */}
          <FooterColumn title="Social" links={SOCIAL_LINKS} />
        </div>

        {/* bottom bar */}
        <div className="flex flex-col items-center justify-between gap-3 pt-6 sm:flex-row">
          <p className="text-sm text-muted">
            Copyright © 2026 KPVE. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="#" className="text-sm text-muted-3 transition-colors hover:text-white">
              Privacy Policy
            </Link>
            <Link href="#" className="text-sm text-muted-3 transition-colors hover:text-white">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">
        {title}
      </span>
      <nav className="flex flex-col gap-3">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="w-fit text-sm text-muted-3 transition-colors duration-200 hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
