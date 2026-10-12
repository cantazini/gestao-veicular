/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { credentialPresentation, normalizeCredentialColor, getCredentialContrastText, type Credential } from "../lib/credentialPresentation";
import { VehicleCredential } from "./VehicleCredential";

const credential: Credential = {
  vehicleId: "vehicle-1", driverId: "driver-1", plate: "ABC1D23", brand: "Marca", model: "Modelo", vehicleType: "Van",
  clientId: "client-1", clientName: "Cliente", companyId: "company-1", companyName: "Empresa Exemplo Ltda.",
  driverName: "Primeiro Condutor", registration: "123", licenseCategory: "D", licenseExpiry: "2027-12-31",
  accessProfileId: "profile-1", accessProfileName: "Interno", credentialCode: "CRD-000001", eligible: true, reasons: [],
  credentialValidUntil: "2026-10-10", inspectionDate: "2026-08-27", approvalStatus: "approved"
};

describe("apresentação da credencial veicular", () => {
  it("mapeia os dados atuais para frente e verso", () => {
    expect(credentialPresentation(credential, ["Primeiro Condutor", "Segundo Condutor", "Terceiro Condutor"])).toEqual({
      companyName: "Empresa Exemplo Ltda.", plate: "ABC1D23", validUntil: "10/10/2026", credentialCode: "CRD-000001",
      firstDriver: "Primeiro Condutor", secondDriver: "Segundo Condutor", thirdDriver: "Terceiro Condutor", inspectionDate: "27/08/2026"
    });
  });

  it("mantém os condutores adicionais vazios e usa fallback para data inexistente", () => {
    expect(credentialPresentation({ ...credential, inspectionDate: null }, []).secondDriver).toBe("");
    expect(credentialPresentation({ ...credential, inspectionDate: null }, []).thirdDriver).toBe("");
    expect(credentialPresentation({ ...credential, inspectionDate: null }, []).inspectionDate).toBe("—");
  });
});

describe("cor da credencial", () => {
  it.each([
    ["#0056A4", "#ffffff"], ["#292929", "#ffffff"],
    ["#fda50d", "#111827"], ["#fafd44", "#111827"]
  ])("aplica %s com contraste %s no mesmo documento para tela e impressão", (color, contrast) => {
    expect(normalizeCredentialColor(color)).toBe(color);
    expect(getCredentialContrastText(color)).toBe(contrast);
    for (const printCard of [false, true]) {
      const html = renderToStaticMarkup(createElement(VehicleCredential, { card: { ...credential, accessProfileColor: color }, printCard }));
      expect(html).toContain(`--credential-accent:${color};--credential-accent-text:${contrast}`);
      expect(html).toContain("credential-front");
      expect(html).toContain("credential-back");
      expect(html).toContain("/assets/logo-meta-azul.png");
    }
  });
  it.each([undefined, null, "", " ", "blue", "#fff", "#12345g", "#12345678", "red;display:none"])("usa fallback para cor inválida %s", (color) => {
    expect(normalizeCredentialColor(color)).toBe("#0056A4");
    expect(getCredentialContrastText(color)).toBe("#ffffff");
  });
  it("aceita espaços externos e atualiza a apresentação quando o card muda de perfil", () => {
    expect(normalizeCredentialColor(" #Ab12Cd ")).toBe("#Ab12Cd");
    const render = (accessProfileId: string, accessProfileColor: string) => renderToStaticMarkup(createElement(VehicleCredential, { card: { ...credential, accessProfileId, accessProfileColor } }));
    expect(render("blue", "#0056A4")).toContain("--credential-accent:#0056A4");
    expect(render("yellow", "#fafd44")).toContain("--credential-accent:#fafd44");
  });
  it("preserva cores no CSS de impressão sem reintroduzir faixas azuis fixas", () => {
    const css = readFileSync(new URL("../credential.css", import.meta.url), "utf8");
    for (const selector of ["credential-front-banner", "credential-blue-footer", "credential-back-panel"]) {
      expect(css).toMatch(new RegExp(`\\.${selector} \\{[^}]*background: var\\(--credential-accent, #0056A4\\)`, "s"));
    }
    expect(css).toContain("-webkit-print-color-adjust: exact");
    expect(css).toContain("print-color-adjust: exact");
    expect(css).not.toContain("#365b9d");
  });
});
