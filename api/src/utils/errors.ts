export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, message, "validation_error", details);
export const unauthorized = (message = "Autenticação necessária.") => new AppError(401, message, "unauthorized");
export const forbidden = (message = "Você não possui permissão para esta operação.") => new AppError(403, message, "forbidden");
export const notFound = (message = "Registro não encontrado.") => new AppError(404, message, "not_found");
export const conflict = (message: string) => new AppError(409, message, "conflict");
