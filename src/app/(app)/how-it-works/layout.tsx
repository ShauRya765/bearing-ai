import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How True Bearing scores an Express Entry profile: a deterministic engine computes every CRS point from versioned IRCC tables, and the assistant only explains rules it can cite from the indexed corpus.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How it works — True Bearing",
    description:
      "A deterministic engine computes every CRS point from versioned IRCC tables; the assistant only explains rules it can cite.",
    url: "/how-it-works",
  },
};

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
