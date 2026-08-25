import { z } from "zod";

const SQL_GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SQL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const emptyValueToUndefined = (value: unknown): unknown =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

export const sqlGuid = z.string().trim().regex(SQL_GUID_PATTERN, "Identificador inválido");

export const optionalSqlGuid = z.preprocess(
  emptyValueToUndefined,
  sqlGuid.optional()
);

export const optionalSqlDate = z.preprocess(
  emptyValueToUndefined,
  z.iso.date().optional()
);

export const sqlTime = z.string().trim().regex(
  SQL_TIME_PATTERN,
  "Horário inválido. Use o formato HH:mm."
);

export function toSqlLocalDateTime(date: string, time: string): string {
  return `${z.iso.date().parse(date)}T${sqlTime.parse(time)}:00`;
}
