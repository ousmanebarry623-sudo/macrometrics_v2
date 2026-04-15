"use client";
import { useBreakpoint } from "@/lib/use-breakpoint";
import DailyBiasCard from "./DailyBiasCard";
import FearGreedCard from "./FearGreedCard";
import MarketSessionsCard from "./MarketSessionsCard";

export default function ResponsiveRow1() {
  const { isMobile, isTablet } = useBreakpoint();

  // Mobile : 1 colonne | Tablet : 2 colonnes (Sessions pleine largeur) | Desktop : 3 colonnes fixes
  const gridStyle: React.CSSProperties = isMobile
    ? { display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }
    : isTablet
    ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }
    : { display: "grid", gridTemplateColumns: "1fr 220px 300px", gap: 16, marginBottom: 16 };

  const sessionsStyle: React.CSSProperties = isTablet
    ? { gridColumn: "1 / -1" }
    : {};

  return (
    <div style={gridStyle} suppressHydrationWarning>
      <DailyBiasCard />
      <FearGreedCard />
      <div style={sessionsStyle} suppressHydrationWarning>
        <MarketSessionsCard />
      </div>
    </div>
  );
}
