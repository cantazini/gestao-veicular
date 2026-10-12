import { describe, expect, it } from "vitest";
import type { Entity, PageResult } from "../types";
import { mockRequest } from "./mockApi";

describe("fluxo de clientes no modo de demonstração", () => {
  it("cria, lista, edita e desativa um cliente", async () => {
    const created = await mockRequest<Entity>("/clients", {
      method: "POST",
      body: JSON.stringify({ name: "Cliente Teste", legalName: "Cliente Teste Ltda.", document: "04.252.011/0001-10", active: true })
    });
    expect(created.id).toBeTruthy();

    const listed = await mockRequest<PageResult<Entity>>("/clients");
    expect(listed.items.some((item) => item.id === created.id)).toBe(true);

    const updated = await mockRequest<Entity>(`/clients/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Cliente Atualizado", active: false })
    });
    expect(updated.name).toBe("Cliente Atualizado");
    expect(updated.active).toBe(false);

    const reactivated = await mockRequest<Entity>(`/clients/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: true })
    });
    expect(reactivated.active).toBe(true);
  });

  it("impede CNPJ duplicado", async () => {
    const payload = JSON.stringify({ name: "Duplicado", legalName: "Duplicado Ltda.", document: "40.688.134/0001-61", active: true });
    await mockRequest("/clients", { method: "POST", body: payload });
    await expect(mockRequest("/clients", { method: "POST", body: payload })).rejects.toThrow(/já existe um cliente/i);
  });
});

describe("dependências dos cadastros", () => {
  it("impede criar projeto para um cliente inexistente", async () => {
    await expect(mockRequest("/projects", {
      method: "POST",
      body: JSON.stringify({ clientId: crypto.randomUUID(), name: "Projeto inválido", code: "INV", active: true })
    })).rejects.toThrow(/cliente ativo e válido/i);
  });

  it("impede criar empresa sem cliente e veículo sem empresa", async () => {
    await expect(mockRequest("/companies", {
      method: "POST",
      body: JSON.stringify({ clientId: crypto.randomUUID(), legalName: "Empresa sem cliente", document: "04.252.011/0001-10", contractType: "direct", projectIds: [], active: true })
    })).rejects.toThrow(/cliente ativo e válido/i);

    await expect(mockRequest("/vehicles", {
      method: "POST",
      body: JSON.stringify({ companyId: crypto.randomUUID(), projectId: crypto.randomUUID(), plate: "INV1A23", brand: "Marca", model: "Modelo", year: 2026, type: "Carro", mileage: 0, ownership: "owned", active: true })
    })).rejects.toThrow(/empresa ativa e válida/i);
  });

  it("mantém o fluxo cliente, projeto, empresa, motorista e veículo", async () => {
    const clients = await mockRequest<PageResult<Entity>>("/clients");
    const client = clients.items[0];
    const project = await mockRequest<Entity>("/projects", { method: "POST", body: JSON.stringify({ clientId: client.id, name: "Projeto Integrado", code: `PI-${Date.now()}`, active: true }) });
    const company = await mockRequest<Entity>("/companies", { method: "POST", body: JSON.stringify({ clientId: client.id, legalName: "Empresa Integrada Ltda.", document: "52.399.931/0001-44", contractType: "direct", projectIds: [project.id], active: true }) });
    const driver = await mockRequest<Entity>("/drivers", { method: "POST", body: JSON.stringify({ companyId: company.id, name: "Motorista Integrado", registration: `MI-${Date.now()}`, licenseCategory: "D", licenseExpiry: "2028-12-31", active: true }) });
    const profiles = await mockRequest<PageResult<Entity>>("/accessProfiles");
    const vehicle = await mockRequest<Entity>("/vehicles", { method: "POST", body: JSON.stringify({ companyId: company.id, projectId: project.id, accessProfileId: profiles.items[0].id, plate: "TST1A23", brand: "Marca", model: "Modelo", year: 2026, type: "Caminhão", mileage: 0, ownership: "owned", driverIds: [driver.id], active: true }) });

    expect(vehicle.companyId).toBe(company.id);
    expect(vehicle.projectId).toBe(project.id);
    expect(vehicle.driverIds).toEqual([driver.id]);
  });
});

describe("Histórico e Reprovações", () => {
  it("mantém aprovações no Histórico e fora de Reprovações", async () => {
    const history = await mockRequest<PageResult<import("../types").Inspection>>("/inspections?pageSize=100");
    const rejected = await mockRequest<PageResult<import("../types").Inspection>>("/inspections?pageSize=100&result=REPROVADO");
    expect(history.items.some((item) => item.result === "APROVADO")).toBe(true);
    expect(rejected.items.every((item) => item.result === "REPROVADO")).toBe(true);
  });
});

describe("documentos integrados", () => {
  it.each([["company", "companies"], ["driver", "drivers"], ["vehicle", "vehicles"]] as const)("cria metadata de documento de %s e exibe na central", async (kind, source) => {
    const entities = await mockRequest<PageResult<Entity>>(`/${source}`);
    const related = entities.items[0];
    const created = await mockRequest<{ id: string }>("/files/complete", { method: "POST", body: JSON.stringify({
      kind: `${kind}-document`, entityId: related.id, blobPath: `mock/${related.id}/arquivo.pdf`, fileName: "arquivo.pdf",
      mimeType: "application/pdf", size: 1000, documentType: "other", label: `Documento ${kind}`,
      issueDate: "2026-01-01", expiryDate: "2027-01-01", observation: "Teste"
    }) });
    const listed = await mockRequest<import("../types").DocumentRecord[]>(`/documents?entityType=${kind}&entityId=${related.id}`);
    expect(listed.some((document) => document.id === created.id)).toBe(true);

    await mockRequest(`/documents/${created.id}`, { method: "PUT", body: JSON.stringify({ observation: "Atualizado" }) });
    const updated = await mockRequest<import("../types").DocumentRecord[]>(`/documents?entityType=${kind}&entityId=${related.id}`);
    expect(updated.find((document) => document.id === created.id)?.observation).toBe("Atualizado");

    await mockRequest(`/files/${created.id}`, { method: "DELETE" });
    const removed = await mockRequest<import("../types").DocumentRecord[]>(`/documents?entityType=${kind}&entityId=${related.id}`);
    expect(removed.some((document) => document.id === created.id)).toBe(false);
  });

  it("substitui e remove a logo do cliente sem gravar SAS permanente", async () => {
    const clients = await mockRequest<PageResult<Entity>>("/clients");
    const client = clients.items[0];
    await mockRequest("/files/complete", { method: "POST", body: JSON.stringify({ kind: "client-branding", entityId: client.id, blobPath: `clients/${client.id}/branding/logo.png`, fileName: "logo.png", mimeType: "image/png", size: 1000 }) });
    expect((await mockRequest<PageResult<Entity>>("/clients")).items.find((item) => item.id === client.id)?.logoBlobPath).toBe("/assets/logo-klabin.png");
    await mockRequest(`/clients/${client.id}/logo`, { method: "DELETE" });
    expect((await mockRequest<PageResult<Entity>>("/clients")).items.find((item) => item.id === client.id)?.logoBlobPath).toBeNull();
  });

  it("substitui e remove a logo opcional da empresa", async () => {
    const companies = await mockRequest<PageResult<Entity>>("/companies");
    const company = companies.items[0];
    const logoPath = `companies/${company.id}/branding/logo.png`;
    await mockRequest("/files/complete", { method: "POST", body: JSON.stringify({ kind: "company-branding", entityId: company.id, blobPath: logoPath, fileName: "logo.png", mimeType: "image/png", size: 1000 }) });
    expect((await mockRequest<PageResult<Entity>>("/companies")).items.find((item) => item.id === company.id)?.logoBlobPath).toBe(logoPath);
    await mockRequest(`/companies/${company.id}/logo`, { method: "DELETE" });
    expect((await mockRequest<PageResult<Entity>>("/companies")).items.find((item) => item.id === company.id)?.logoBlobPath).toBeNull();
  });

  it("adiciona, substitui e remove a foto de capa opcional do veículo", async () => {
    const vehicles = await mockRequest<PageResult<Entity>>("/vehicles");
    const vehicle = vehicles.items[0];
    const firstPath = `vehicles/${vehicle.id}/cover/primeira.jpg`;
    const replacementPath = `vehicles/${vehicle.id}/cover/substituta.png`;
    await mockRequest("/files/complete", { method: "POST", body: JSON.stringify({ kind: "vehicle-cover", entityId: vehicle.id, blobPath: firstPath, fileName: "primeira.jpg", mimeType: "image/jpeg", size: 1000 }) });
    expect((await mockRequest<PageResult<Entity>>("/vehicles")).items.find((item) => item.id === vehicle.id)?.coverBlobPath).toBe(firstPath);
    await mockRequest("/files/complete", { method: "POST", body: JSON.stringify({ kind: "vehicle-cover", entityId: vehicle.id, blobPath: replacementPath, fileName: "substituta.png", mimeType: "image/png", size: 1000 }) });
    expect((await mockRequest<PageResult<Entity>>("/vehicles")).items.find((item) => item.id === vehicle.id)?.coverBlobPath).toBe(replacementPath);
    await mockRequest(`/vehicles/${vehicle.id}/cover`, { method: "DELETE" });
    expect((await mockRequest<PageResult<Entity>>("/vehicles")).items.find((item) => item.id === vehicle.id)?.coverBlobPath).toBeNull();
  });
});

describe("credenciais com vínculos cadastrados", () => {
  it("consulta veículo e perfil por ID real, sem usar placa como chave", async () => {
    const vehicles = await mockRequest<PageResult<Entity>>("/vehicles");
    const vehicle = vehicles.items[0];
    const companies = await mockRequest<PageResult<Entity>>("/companies");
    const company = companies.items.find((item) => item.id === vehicle.companyId)!;
    const result = await mockRequest<Array<{ vehicleId: string; accessProfileId: string; plate: string }>>(`/credentials/eligibility?clientId=${company.clientId}&companyId=${company.id}&vehicleId=${vehicle.id}&accessProfileId=${vehicle.accessProfileId}`);
    expect(result[0]).toMatchObject({ vehicleId: vehicle.id, accessProfileId: vehicle.accessProfileId, plate: vehicle.plate });
  });

  it("não retorna credencial para perfil diferente do vínculo do veículo", async () => {
    const vehicles = await mockRequest<PageResult<Entity>>("/vehicles");
    const result = await mockRequest<unknown[]>(`/credentials/eligibility?vehicleId=${vehicles.items[0].id}&accessProfileId=${crypto.randomUUID()}`);
    expect(result).toEqual([]);
  });
});
