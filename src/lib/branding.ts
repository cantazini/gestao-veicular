export const KLABIN_LOGO_ASSET = "/assets/logo-klabin.png";

export function resolveClientLogo(clientName: unknown, currentLogoUrl?: string | null): string {
  if (currentLogoUrl) return currentLogoUrl;
  return String(clientName || "").trim().toLowerCase() === "klabin" ? KLABIN_LOGO_ASSET : "";
}
