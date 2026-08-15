import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ask the Express Entry rules",
  description:
    "Ask a question about Express Entry eligibility, CRS points, provincial nomination or category-based selection and get an answer drawn only from indexed IRCC and provincial rules, with citations — or a refusal when the corpus doesn't cover it.",
  alternates: { canonical: "/rules" },
  openGraph: {
    title: "Ask the Express Entry rules — True Bearing",
    description:
      "Answers drawn only from indexed IRCC and provincial rules, with citations — or a refusal when the corpus doesn't cover it.",
    url: "/rules",
  },
};

export default function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
