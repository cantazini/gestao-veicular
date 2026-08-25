import { z } from "zod";

const SQL_GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
