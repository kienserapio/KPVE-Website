import {
  Cinzel,
  Montserrat,
  Plus_Jakarta_Sans,
  Great_Vibes,
} from "next/font/google";

/* The case-study design system uses four Google Fonts. Self-hosted via
   next/font and exposed as CSS variables the scoped CaseStudyPage.css reads
   (--rg-font-* → these). Kept out of the root layout so the rest of the site
   never pays for them. */
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-great-vibes",
  display: "swap",
});

export default function CaseStudyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${cinzel.variable} ${montserrat.variable} ${jakarta.variable} ${greatVibes.variable}`}
    >
      {children}
    </div>
  );
}
