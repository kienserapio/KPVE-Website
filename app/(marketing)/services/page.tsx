import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ServicesHero } from "@/components/sections/ServicesHero";
import { Services } from "@/components/sections/Services";
import { Projects } from "@/components/sections/Projects";
import { Testimonials } from "@/components/sections/Testimonials";
import { Faq } from "@/components/sections/Faq";
import { Contact } from "@/components/sections/Contact";

export const metadata: Metadata = {
  title: "Services — KPVE",
  description:
    "Seven premium practices, one senior team. Explore the services KPVE offers to design, develop, and scale solutions built for growth.",
};

export default function ServicesPage() {
  return (
    <>
      <Navbar />
      <main className="relative">
        <ServicesHero />
        <Services />
        <Projects />
        <Testimonials />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
