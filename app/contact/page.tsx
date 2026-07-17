import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ContactHero } from "@/components/sections/ContactHero";
import { Contact } from "@/components/sections/Contact";
import { ContactInfo } from "@/components/sections/ContactInfo";
import { GlobalPresence } from "@/components/sections/GlobalPresence";

export const metadata: Metadata = {
  title: "Contact Us — KPVE",
  description:
    "Let's talk. We typically reply within 24 hours. Tell us about your business and what you're trying to achieve — email, call, or drop us a message.",
};

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="relative">
        <ContactHero />
        <Contact />
        <ContactInfo />
        <GlobalPresence />
      </main>
      <Footer />
    </>
  );
}
