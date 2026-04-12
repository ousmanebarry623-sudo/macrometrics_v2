import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Ticker from "@/components/Ticker";

export const metadata: Metadata = {
  title: "MacroMetrics — Analyse Institutionnelle",
  description: "COT 2 ans · Sentiment retail · G8 28 paires · Saisonnalité · TradingView · Heure de Paris",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: "#060610", color: "#f1f5f9", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Header />
        <Ticker />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
