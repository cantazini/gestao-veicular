export function digits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function normalizePlate(value: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function normalizeSearch(value: string): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

export function safeFileName(value: string): string {
  const extension = String(value || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${crypto.randomUUID()}.${extension.slice(0, 5)}`;
}
