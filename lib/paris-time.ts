// Paris time utilities (CET = UTC+1, CEST = UTC+2)
export const PARIS_TZ = "Europe/Paris";

export function parisNow(): Date {
  return new Date();
}

export function formatParis(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    ...options,
  }).format(date);
}

export function parisTimeString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function parisDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getParisOffset(): string {
  const now = new Date();
  const parisStr = now.toLocaleString("en-US", { timeZone: PARIS_TZ });
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const diff = (new Date(parisStr).getTime() - new Date(utcStr).getTime()) / 3600000;
  return diff >= 0 ? `UTC+${diff}` : `UTC${diff}`;
}

// Convert UTC session times to Paris time
export function utcToParis(utcHHMM: string): string {
  const [h, m] = utcHHMM.split(":").map(Number);
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  return d.toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
