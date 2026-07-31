import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "700"],
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "TrueBearing — Know where you actually stand",
    template: "%s — TrueBearing",
  },
  description:
    "A Canadian Express Entry CRS calculator that computes every point from IRCC's published tables, cites its sources, and never benchmarks you against a draw you aren't eligible for.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
          {children}
      </body>
    </html>
  );
}