import { describe, expect, it } from "vitest";
import { formatCnpj, onlyDigits } from "./format";

describe("formatação de CNPJ", () => {
  it("aplica a máscara durante a digitação", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("remove caracteres de apresentação antes do envio", () => {
    expect(onlyDigits("11.222.333/0001-81")).toBe("11222333000181");
  });
});
