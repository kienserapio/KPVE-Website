"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
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

export function Contact() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
    setTimeout(() => setSent(false), 3500);
  }

  return (
    <section id="contact" className="relative overflow-hidden px-6 py-24 sm:py-32">
      {/* seamless gold radial glows in the background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-10 size-[480px] rounded-full bg-gold/15 blur-[90px]" />
        <div className="absolute -right-32 bottom-0 size-[420px] rounded-full bg-gold/10 blur-[90px]" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* visual panel */}
        <Reveal className="relative hidden lg:block">
          <Image
            src="/contact-mockup.png"
            alt="KPVE work"
            width={700}
            height={560}
            className="w-full max-w-xl object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
          />
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
