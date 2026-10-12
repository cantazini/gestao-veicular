import { formatDate } from "./format";

export function normalizeCredentialColor(color: unknown): string {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : "#0056A4";
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function getCredentialContrastText(color: unknown): string {
  const background = luminance(normalizeCredentialColor(color));
  const dark = luminance("#111827");
  const darkContrast = (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05);
  const whiteContrast = 1.05 / (background + 0.05);
  return whiteContrast >= darkContrast ? "#ffffff" : "#111827";
}

export interface Credential {
  vehicleId: string; driverId: string; plate: string; brand: string; model: string; vehicleType: string;
  clientId: string; clientName: string; clientLogoBlobPath?: string; companyId: string; companyName: string;
  driverName: string; registration: string; licenseCategory: string; licenseExpiry: string;
  accessProfileId: string; accessProfileName: string; accessProfileDescription?: string; accessProfileColor?: string;
  credentialCode: string; eligible: boolean; reasons: string[]; credentialValidUntil: string; inspectionDate?: string | null;
  approvalStatus: "none" | "pending" | "approved"; approvalId?: string | null; inspectionId?: string | null; canRequestApproval?: boolean; canIssue?: boolean;
}

export function credentialPresentation(card: Credential, linkedDriverNames: string[] = []) {
  const additionalDrivers = linkedDriverNames.filter((name) => name && name !== card.driverName).slice(0, 2);
  return {
    companyName: card.companyName || "—",
    plate: card.plate || "—",
    validUntil: formatDate(card.credentialValidUntil),
    credentialCode: card.credentialCode || "—",
    firstDriver: card.driverName || "",
    secondDriver: additionalDrivers[0] || "",
    thirdDriver: additionalDrivers[1] || "",
    inspectionDate: formatDate(card.inspectionDate)
  };
}
