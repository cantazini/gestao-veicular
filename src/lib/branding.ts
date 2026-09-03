export function resolveClientLogo(_clientName: unknown, currentLogoUrl?: string | null): string {
  if (currentLogoUrl) return currentLogoUrl;
  return "";
}
