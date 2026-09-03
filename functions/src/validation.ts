import { z } from "zod";

export const firestoreId = z.string().trim().min(1, "Identificador obrigatório.").max(128, "Identificador inválido.");
export const optionalFirestoreId = z.preprocess((value) => value === "" || value === null ? undefined : value, firestoreId.optional());
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato YYYY-MM-DD.").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Data inválida.");
export const optionalDateOnly = z.preprocess((value) => value === "" || value === null ? undefined : value, dateOnly.optional());
export const timeOnly = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use um horário válido no formato HH:mm.");

export const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
export const normalizePlate = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
export const normalizeCode = (value: unknown) => String(value ?? "").trim().toUpperCase();

export function isValidCnpj(value: string): boolean {
  const cnpj = digits(value);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const check = (length: number) => {
    let factor = length - 7;
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += Number(cnpj[index]) * factor--;
      if (factor < 2) factor = 9;
    }
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

export const cnpj = z.string().transform(digits).refine((value) => isValidCnpj(value), "Informe um CNPJ válido.");
export const active = z.boolean().default(true);
