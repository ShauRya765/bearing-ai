import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluation — how well retrieval actually works",
  description:
    "The measured retrieval quality behind every answer: recall@k over a fixed question set, scored separately for adversarial questions, with the misses listed and the refusal rate on questions the corpus doesn't cover.",
  alternates: { canonical: "/eval" },
  openGraph: {
    title: "Evaluation — Bearing West",
    description:
      "Recall@k over a fixed question set, adversarial questions scored separately, misses published rather than hidden.",
    url: "/eval",
  },
};

export default function EvalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
