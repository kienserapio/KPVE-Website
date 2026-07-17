import Image from "next/image";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PROJECTS, type Project } from "@/lib/data";

function ProjectCard({ project }: { project: Project }) {
  const card = (
    <SpotlightCard className="group/proj card-dots relative h-full overflow-hidden rounded-[20px] border border-line-2 bg-gradient-to-b from-surface-2/60 to-transparent p-6 transition-transform duration-300 hover:-translate-y-1.5 hover:border-gold/25 sm:p-7">
      {/* preview */}
      <div className="relative z-10 aspect-[16/11] overflow-hidden rounded-2xl border border-line-2 bg-ink-soft">
        <Image
          src={project.image}
          alt={project.title}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-top transition-transform duration-700 ease-out group-hover/proj:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
        {/* floating view button */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-3 opacity-0 transition-all duration-300 group-hover/proj:translate-y-0 group-hover/proj:opacity-100">
          <span className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white">
            View Project Details
            <Icon src="/icons/arrow.svg" tone="white" className="size-4" />
          </span>
        </div>
      </div>

      {/* meta */}
      <div className="relative z-10 mt-7 flex flex-col gap-4">
        <h3 className="text-2xl font-medium text-gold-gradient sm:text-3xl">
          {project.title}
        </h3>
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs text-muted-3"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-[15px] leading-7 text-muted">{project.body}</p>
      </div>
    </SpotlightCard>
  );

  if (project.caseStudy) {
    return (
      <Link
        href={`/case-study/${project.caseStudy}`}
        aria-label={`${project.title} — view case study`}
        className="block h-full rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        {card}
      </Link>
    );
  }

  return card;
}

export function Projects() {
  return (
    <section id="projects" className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <SectionHeading
            align="left"
            eyebrow="What KPVE Builds"
            title="Our Recent"
            highlight="Projects"
            subtitle="Explore our most recent projects where thoughtful design, robust development, and strategic thinking come together to create real impact."
          />
          <Reveal delay={0.2} className="hidden md:block">
            <Button href="/contact" variant="glass">
              Explore More
            </Button>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {PROJECTS.map((project, i) => (
            <Reveal key={project.title} delay={(i % 2) * 0.1}>
              <ProjectCard project={project} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-12 flex justify-center">
          <Button href="/contact" variant="ghost" icon>
            View All Projects
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
