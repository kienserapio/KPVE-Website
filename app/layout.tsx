import type { Metadata } from "next";
import { Bricolage_Grotesque, Sora } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KPVE — Kappatos Productions and Venture Enterprises",
  description:
    "Built for Growth. Designed for Scale. We partner with forward-thinking businesses to design, develop, and scale solutions that drive sustainable growth.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${sora.variable}`}>
      <body className="min-h-screen bg-ink text-white antialiased">
        {children}
      </body>
    </html>
  );
}
