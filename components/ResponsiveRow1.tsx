"use client";
import { useBreakpoint } from "@/lib/use-breakpoint";
import DailyBiasCard from "./DailyBiasCard";
import MarketSessionsCard from "./MarketSessionsCard";

export default function ResponsiveRow1() {
  const { isMobile, isTablet } = useBreakpoint();

  // Mobile : 1 colonne | Tablet : 2 colonnes | Desktop : 2 colonnes fixes
  const gridStyle: React.CSSProperties = isMobile
    ? { display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }
    : { display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 };

  return (
    <div style={gridStyle} suppressHydrationWarning>
      <DailyBiasCard />
      <MarketSessionsCard />
    </div>
  );
}
