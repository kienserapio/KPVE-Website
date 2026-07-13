"use client";

import { useState } from "react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { FAQS, type Faq as FaqType } from "@/lib/data";

function FaqRow({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqType;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border ${
        isOpen ? "border-gold/25 bg-white/[0.04]" : "border-line-2"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-5 p-6 text-left sm:p-7"
      >
        <span className="flex-1 text-lg font-medium text-white">
          {item.question}
        </span>
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${
            isOpen ? "bg-gold-gradient" : "bg-surface-2"
          }`}
        >
          <Icon
            src="/icons/plus.svg"
            tone={isOpen ? "black" : "white"}
            className={`size-4 ${isOpen ? "rotate-45" : ""}`}
          />
        </span>
      </button>

      {/* only mount when open → one cheap reflow, then a composited fade.
          no per-frame height animation, so the page's blur layers never
          re-rasterize mid-transition (that was the source of the lag). */}
      {isOpen && (
        <div className="animate-faq-in overflow-hidden">
          <p className="px-6 pb-7 pr-14 text-[15px] leading-7 text-muted sm:px-7 sm:pr-16">
            {item.answer}
          </p>
        </div>
      )}
    </div>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number>(0);

  const columns = [FAQS.slice(0, 4), FAQS.slice(4)];

  return (
    <section id="faq" className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="FAQs about KPVE"
          title="Frequently Asked"
          highlight="Questions"
          singleLine
          subtitle="Learn more about how we operate as an agency."
        />

        <Reveal className="mt-16 grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-4">
              {col.map((item, ri) => {
                const index = ci * 4 + ri;
                return (
                  <FaqRow
                    key={item.question}
                    item={item}
                    isOpen={open === index}
                    onToggle={() => setOpen(open === index ? -1 : index)}
                  />
                );
              })}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
