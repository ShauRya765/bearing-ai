import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// Shared by Open Graph and Twitter — twitter.card falls back to the OG image
// when no twitter-image file exists, so one file covers both.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Bearing West — a Canadian Express Entry CRS calculator that shows where every point came from";

// Design tokens are duplicated as literals rather than imported from
// globals.css: ImageResponse renders through satori, which sees no stylesheet
// and no CSS variables. Keep these in step with --background / --primary.
const BACKGROUND = "#0b0b0d";
const CARD = "#141416";
const INK = "#fafafa";
const MUTED = "#a1a1aa";
const AMBER = "#f59e0b";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BACKGROUND,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ fontSize: 34, fontWeight: 700, color: INK }}>
            {SITE_NAME}
          </span>
          <span style={{ fontSize: 34, fontWeight: 700, color: AMBER }}>.</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Know exactly where you</span>
            <span>stand in the pool.</span>
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: MUTED,
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            Every CRS point computed from IRCC&apos;s published tables — never
            benchmarked against a draw you can&apos;t be picked from.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: CARD,
              border: "1px solid #26262a",
              borderRadius: 999,
              padding: "10px 22px",
              fontSize: 24,
              color: MUTED,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: AMBER,
              }}
            />
            Express Entry · CRS calculator
          </div>
        </div>
      </div>
    ),
    size,
  );
}
