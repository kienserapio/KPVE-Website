"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";

function Field({
  label,
  placeholder,
  type = "text",
  name,
}: {
  label: string;
  placeholder: string;
  type?: string;
  name: string;
}) {
  return (
    <label className="group flex flex-col gap-3">
      <span className="text-lg font-medium text-white">
        {label} <span className="text-gold">*</span>
      </span>
      <input
        required
        name={name}
        type={type}
        placeholder={placeholder}
        className="peer border-b border-white/15 bg-transparent pb-3 text-muted-3 outline-none transition-colors duration-300 placeholder:text-white/25 focus:border-gold"
      />
      <span className="h-px w-0 bg-gold transition-all duration-300 peer-focus:w-full" />
    </label>
  );
}

/** Creative visual: a radar "signal" broadcasting from the KPVE mark. */
function SignalPanel() {
  return (
    <div className="card-dots relative flex aspect-square w-full max-w-md flex-col justify-between overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8">
      {/* rotating ambient glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[130%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 0deg, transparent, rgba(189,139,40,0.18), transparent 40%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />

      {/* availability badge */}
      <div className="relative z-10 flex items-center gap-2 self-start rounded-full border border-white/10 bg-black/30 px-3.5 py-2 backdrop-blur-sm">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-xs font-medium text-white/80">
          Available for new projects
        </span>
      </div>

      {/* radar rings + mark */}
      <div className="relative z-10 grid flex-1 place-items-center">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute rounded-full border border-gold/40"
            style={{ width: 96, height: 96 }}
            initial={{ scale: 0.5, opacity: 0.6 }}
            animate={{ scale: 3.6, opacity: 0 }}
            transition={{
              duration: 4,
              delay: i * 1,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}
        <motion.div
          className="relative grid size-24 place-items-center rounded-full border border-white/10 bg-black/40 shadow-[0_0_60px_-10px_rgba(189,139,40,0.6)] backdrop-blur-sm"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KPVE" className="size-12 object-contain" />
        </motion.div>
      </div>

      {/* brand + tagline */}
      <div className="relative z-10 border-t border-white/10 pt-5">
        <div className="text-4xl font-bold tracking-tight text-white">KPVE</div>
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
          Let&rsquo;s build something your customers will remember. Tell us where
          you want to go — we&rsquo;ll map the path.
        </p>
      </div>
    </div>
  );
}

export function Contact() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
    setTimeout(() => setSent(false), 3500);
  }

  return (
    <section id="contact" className="relative overflow-hidden px-6 py-24 sm:py-32">
      {/* soft, seamless ambient wash (no harsh blobs) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 bottom-[-20%] h-[70%] bg-[radial-gradient(60%_100%_at_50%_100%,rgba(189,139,40,0.10),transparent)]" />
        <div className="absolute inset-0 bg-grid opacity-20 mask-fade-y" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
        {/* creative visual */}
        <Reveal className="hidden justify-center lg:flex">
          <SignalPanel />
        </Reveal>

        {/* form */}
        <div>
          <Reveal>
            <Eyebrow>Contact Us</Eyebrow>
            <h2 className="mt-6 text-4xl font-medium leading-tight text-white sm:text-5xl">
              Let&rsquo;s Work <span className="text-gold-gradient">Together!</span>
            </h2>
            <p className="mt-4 text-muted">
              Work with us and let&rsquo;s make your business streamlined and
              digitalized.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-8">
              <div className="grid gap-8 sm:grid-cols-2">
                <Field name="firstName" label="First Name" placeholder="Enter your name" />
                <Field name="lastName" label="Last Name" placeholder="Enter your last name" />
                <Field name="phone" label="Phone Number" placeholder="Your phone number" type="tel" />
                <Field name="email" label="Email Address" placeholder="Enter your email address" type="email" />
              </div>
              <Field name="message" label="How can we help you?" placeholder="Message" />

              <button
                type="submit"
                disabled={sent}
                className="group/btn mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-gold-gradient px-7 py-4 text-sm font-medium text-black shadow-[0_10px_30px_-8px_rgba(189,139,40,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 active:scale-95"
              >
                {sent ? (
                  <>
                    Message Sent
                    <Icon src="/icons/check.svg" tone="black" className="size-4" />
                  </>
                ) : (
                  <>
                    Send Message
                    <Icon
                      src="/icons/arrow.svg"
                      tone="black"
                      className="size-4 transition-transform duration-300 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
                    />
                  </>
                )}
              </button>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
