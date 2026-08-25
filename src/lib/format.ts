export const formatDate = (value?: unknown) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : "—";
export const formatNumber = (value?: unknown) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
export const text = (value?: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
export const today = () => new Date().toISOString().slice(0, 10);
export const currentTime = () => new Date().toTimeString().slice(0, 5);
export const onlyDigits = (value?: unknown) => String(value ?? "").replace(/\D/g, "");
export const formatCnpj = (value?: unknown) => {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};
