export function digits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function isValidCnpj(value: string): boolean {
  const normalized = digits(value);
  if (normalized.length !== 14 || /^(\d)\1{13}$/.test(normalized)) return false;
  const calculateDigit = (length: number): number => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(normalized[index]) * weight;
      weight -= 1;
      if (weight === 1) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculateDigit(12) === Number(normalized[12]) && calculateDigit(13) === Number(normalized[13]);
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
