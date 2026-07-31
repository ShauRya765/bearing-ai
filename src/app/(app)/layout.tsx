import Shell from "@/components/Shell";

// Everything except the landing page renders inside the sidebar Shell. The
// landing page sits outside this group so it can go full-bleed — see
// src/app/page.tsx.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell>{children}</Shell>;
}
