import { describe, expect, it } from "vitest";
import { resetConfigForTests } from "../config";
import { createUploadUrl, parseStorageConnectionString } from "../services/storage";

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
});
