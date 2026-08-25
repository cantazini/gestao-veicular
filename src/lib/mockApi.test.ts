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
