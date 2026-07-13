/* eslint-disable @next/next/no-img-element */
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Marquee } from "@/components/ui/Marquee";
import { Icon } from "@/components/ui/Icon";
import { TESTIMONIALS, type Testimonial } from "@/lib/data";

function TestimonialCard({ item }: { item: Testimonial }) {
  return (
    <figure className="mx-3 flex w-[380px] shrink-0 flex-col gap-6 sm:w-[440px]">
      {/* bubble */}
      <div className="card-dots relative overflow-hidden rounded-[20px] border border-line-2 bg-gradient-to-b from-surface-2 to-transparent p-8">
        <div className="relative z-10">
          <span className="mb-4 flex size-11 items-center justify-center rounded-lg border border-line-2 bg-surface-2">
            <Icon src="/icons/quote.svg" tone="gold" className="size-5" />
          </span>
          <blockquote className="text-[17px] leading-7 text-white/90">
            {item.quote}
          </blockquote>
        </div>
        {/* speech tip */}
        <span className="absolute -bottom-2 left-10 z-10 size-4 rotate-45 border-b border-r border-line-2 bg-[#141414]" />
      </div>
      {/* author */}
      <figcaption className="flex items-center gap-4 pl-1">
        <img
          src={item.avatar}
          alt={item.name}
          className="size-14 rounded-full object-cover ring-1 ring-white/10"
          loading="lazy"
        />
        <div>
          <div className="text-lg font-medium text-white">{item.name}</div>
          <div className="text-sm text-muted-2">{item.role}</div>
        </div>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  const rowA = TESTIMONIALS.slice(0, 3);
  const rowB = TESTIMONIALS.slice(3);

  return (
    <section id="testimonials" className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="KPVE Testimonials"
          title="What Our"
          highlight="Customers Say"
          subtitle="Real words from the people and brands we&rsquo;ve had the privilege to build with."
        />
      </div>

      {/* marquee rows — never pause */}
      <div className="relative mt-16 flex flex-col gap-8 mask-fade-x">
        <Marquee duration={55} pauseOnHover={false}>
          {rowA.map((item, i) => (
            <TestimonialCard key={`a-${i}`} item={item} />
          ))}
        </Marquee>
        <Marquee duration={55} reverse pauseOnHover={false}>
          {rowB.map((item, i) => (
            <TestimonialCard key={`b-${i}`} item={item} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}
