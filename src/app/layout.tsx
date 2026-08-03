import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import { IS_INDEXABLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
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
  // metadataBase is what turns every relative URL below — canonicals, OG image,
  // sitemap references — into the absolute URLs crawlers require. Without it
  // Next warns and falls back to localhost.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Bearing West — Know where you actually stand",
    template: "%s — Bearing West",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_CA",
    url: "/",
    title: "Bearing West — Know where you actually stand",
    description: SITE_DESCRIPTION,
  },
  // Card type only. Setting twitter:title/description here would be inherited by
  // every child route and silently override their own OG titles on X; leaving
  // them unset makes X fall back to each page's og:title and og:description.
  twitter: { card: "summary_large_image" },
  // Indexing stays off until NEXT_PUBLIC_SITE_URL names the real domain, so a
  // preview deploy can't be indexed under a host we don't intend to keep.
  robots: IS_INDEXABLE
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      }
    : { index: false, follow: false },
  category: "immigration",
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