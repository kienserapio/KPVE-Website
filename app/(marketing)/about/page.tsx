import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AboutHero } from "@/components/sections/AboutHero";
import { FounderStory } from "@/components/sections/FounderStory";
import { JourneyTimeline } from "@/components/sections/JourneyTimeline";
import { Ethos } from "@/components/sections/Ethos";
import { Offers } from "@/components/sections/Offers";
import { Difference } from "@/components/sections/Difference";
import { Testimonials } from "@/components/sections/Testimonials";
import { CaseStudyCta } from "@/components/sections/CaseStudyCta";
import { Contact } from "@/components/sections/Contact";

export const metadata: Metadata = {
  title: "About — KPVE",
  description:
    "Kappatos Productions and Venture Enterprises is a senior, remote-first agency founded in 2012. Meet the team behind premium digital products built for growth.",
};

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="relative">
        <AboutHero />
        <FounderStory />
        <JourneyTimeline />
        <Ethos />
        <Offers />
        <Difference />
        <Testimonials />
        <CaseStudyCta />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
