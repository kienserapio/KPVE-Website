import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CaseStudyPage from "../_components/CaseStudyPage";

/* Registry of published case studies, keyed by URL slug. Add an entry (and,
   when a study needs its own bespoke layout, its own component) to publish a
   new one at /case-study/<slug>. */
const CASE_STUDIES: Record<
  string,
  { title: string; description: string; component: () => React.JSX.Element }
> = {
  "rare-gem": {
    title: "Rare Gem Exchange — Case Study | KPVE",
    description:
      "How we designed and built a private exchange for investment-grade gemstones — an experience that earns trust before it asks, qualifies six-figure buyers, and gives the team a pipeline to run the business from.",
    component: CaseStudyPage,
  },
};

export function generateStaticParams() {
  return Object.keys(CASE_STUDIES).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const study = CASE_STUDIES[slug];
  if (!study) return {};
  return { title: study.title, description: study.description };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const study = CASE_STUDIES[slug];
  if (!study) notFound();

  const Study = study.component;
  return <Study />;
}
