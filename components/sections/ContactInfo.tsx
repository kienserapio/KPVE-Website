import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { CONTACT_INFO, type ContactChannel } from "@/lib/data";

/** A single contact channel card — glass gold icon tile, label, value. */
function ChannelCard({ channel }: { channel: ContactChannel }) {
  const inner = (
    <SpotlightCard className="card-dots h-full rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6 transition-colors duration-300 group-hover/link:border-gold/30">
      <div className="flex flex-col gap-5">
        <span className="glass grid size-11 place-items-center rounded-2xl">
          <Icon src={channel.icon} tone="gold" className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="text-base font-medium text-white">
            {channel.label}
          </span>
          <span className="text-sm text-muted transition-colors duration-300 group-hover/link:text-muted-3">
            {channel.value}
          </span>
        </div>
      </div>
    </SpotlightCard>
  );

  return channel.href ? (
    <Link href={channel.href} className="group/link block h-full">
      {inner}
    </Link>
  ) : (
    <div className="group/link h-full">{inner}</div>
  );
}

/** Four contact channels (Email / Phone / Location / Hours). */
export function ContactInfo() {
  return (
    <section className="relative px-6 pb-12">
      <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CONTACT_INFO.map((channel, i) => (
          <Reveal key={channel.label} delay={i * 0.08} className="h-full">
            <ChannelCard channel={channel} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
