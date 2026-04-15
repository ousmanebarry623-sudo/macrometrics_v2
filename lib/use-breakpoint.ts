"use client";
import { useState, useEffect } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

export function useBreakpoint(): {
  bp: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
} {
  // null during SSR — prevents hydration mismatch
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    // Set real width on first client render, then track resize
    setWidth(window.innerWidth);
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Default to desktop during SSR/hydration, real value once mounted
  const w = width ?? 1280;
  const bp: Breakpoint = w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";

  return {
    bp,
    isMobile:  bp === "mobile",
    isTablet:  bp === "tablet",
    isDesktop: bp === "desktop",
    width: w,
  };
}
