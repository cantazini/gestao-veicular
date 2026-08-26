import { describe, expect, it } from "vitest";
import { resetConfigForTests } from "../config";
import { createUploadUrl, parseStorageConnectionString, validateFile } from "../services/storage";

describe("configuração do Blob Storage", () => {
  it("extrai conta, chave e endpoint sem perder o padding Base64", () => {
    const accountKey = Buffer.alloc(32, 7).toString("base64");
    const parsed = parseStorageConnectionString(
      `DefaultEndpointsProtocol=https;AccountName=contateste;AccountKey=${accountKey};EndpointSuffix=core.windows.net`
    );

    expect(parsed.accountName).toBe("contateste");
    expect(parsed.accountKey).toBe(accountKey);
    expect(parsed.serviceUrl).toBe("https://contateste.blob.core.windows.net");
  });

  it("rejeita connection string sem chave de conta", () => {
    expect(() => parseStorageConnectionString("AccountName=contateste")).toThrow(/AccountName e AccountKey/);
  });

  it("gera no backend uma SAS temporária restrita à escrita do blob", async () => {
    const accountKey = Buffer.alloc(32, 11).toString("base64");
    process.env.SQL_CONNECTION_STRING = "Server=localhost;Database=test;User Id=test;Password=test";
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      `DefaultEndpointsProtocol=https;AccountName=contateste;AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
    process.env.AZURE_STORAGE_CONTAINER = "appfiles";
    process.env.DEV_AUTH = "false";
    resetConfigForTests();

    const sas = new URL(await createUploadUrl("inspections/inspection-id/photos/photo-id.jpg"));
    expect(sas.hostname).toBe("contateste.blob.core.windows.net");
    expect(sas.pathname).toBe("/appfiles/inspections/inspection-id/photos/photo-id.jpg");
    expect(sas.searchParams.get("sp")).toBe("cw");
    expect(sas.searchParams.get("spr")).toBe("https");
    expect(sas.searchParams.get("se")).toBeTruthy();
    expect(sas.searchParams.get("sig")).toBeTruthy();
  });

  it("aceita somente extensão e MIME coerentes para documentos", () => {
    expect(() => validateFile("company-document", "contrato.pdf", "application/pdf", 1000)).not.toThrow();
    expect(() => validateFile("driver-document", "cnh.exe", "application/pdf", 1000)).toThrow(/PDF, JPG, JPEG ou PNG/);
    expect(() => validateFile("vehicle-document", "crlv.png", "image/jpeg", 1000)).toThrow(/não corresponde/);
  });

  it("limita a identidade visual do cliente a 5 MB", () => {
    expect(() => validateFile("client-branding", "logo.png", "image/png", 5 * 1024 * 1024 + 1)).toThrow(/5 MB/);
  });
});
