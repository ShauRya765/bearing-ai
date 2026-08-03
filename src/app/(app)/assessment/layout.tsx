import type { Metadata } from "next";

// The page itself is "use client" (it holds the whole form's state), and client
// components cannot export metadata. This layout exists purely to carry it.
export const metadata: Metadata = {
  title: "CRS score calculator",
  description:
    "Work out your Comprehensive Ranking System score from IRCC's published tables — age, education, language, work experience, spouse factors and skill transferability, with every point traced to the rule that produced it.",
  alternates: { canonical: "/assessment" },
  openGraph: {
    title: "CRS score calculator — Bearing West",
    description:
      "Work out your Comprehensive Ranking System score from IRCC's published tables, with every point traced to the rule that produced it.",
    url: "/assessment",
  },
};

export default function AssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
