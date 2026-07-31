"use client";

import { useEffect, useRef } from "react";
import type { MetricName } from "@/lib/metrics";

/**
 * Fire-and-forget counter bump. Never throws, never awaited, never blocks
 * rendering — if the request fails the page carries on unaffected.
 *
 * `keepalive` so a bump issued as someone navigates away still gets sent.
 */
export function track(name: MetricName) {
  try {
    void fetch("/api/metric", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics is never worth an error in front of a visitor.
  }
}

/**
 * Counts one page view on mount. Drop it anywhere in a page's tree.
 *
 * The ref guard matters: React StrictMode mounts effects twice in development,
 * which would double every count locally. Production mounts once.
 */
export function TrackView({ name }: { name: MetricName }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(name);
  }, [name]);

  return null;
}
