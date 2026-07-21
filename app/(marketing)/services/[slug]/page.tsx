import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ServiceDetailHero } from "@/components/sections/ServiceDetailHero";
import { Benefits } from "@/components/sections/Benefits";
import { Capabilities } from "@/components/sections/Capabilities";
import { Process } from "@/components/sections/Process";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { Projects } from "@/components/sections/Projects";
import { Testimonials } from "@/components/sections/Testimonials";
import { Faq } from "@/components/sections/Faq";
import { Contact } from "@/components/sections/Contact";
import { SERVICE_PAGES } from "@/lib/data";

export function generateStaticParams() {
  return Object.keys(SERVICE_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = SERVICE_PAGES[slug];
  if (!page) return {};
  return { title: page.metaTitle, description: page.metaDescription };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = SERVICE_PAGES[slug];
  if (!page) notFound();

  return (
    <>
      <Navbar />
      <main className="relative">
        <ServiceDetailHero hero={page.hero} />
        <Benefits data={page.benefits} />
        <Capabilities data={page.capabilities} />
        <Process data={page.process} />
        <WhyChooseUs data={page.whyChooseUs} />
        <Projects />
        <Testimonials />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
