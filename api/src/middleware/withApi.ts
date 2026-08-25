import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ZodError } from "zod";
import { authenticate } from "./auth";
import type { RequestContext, UserRole } from "../types/auth";
import { AppError } from "../utils/errors";
import { json } from "../utils/response";

type ApiHandler = (request: HttpRequest, context: InvocationContext, auth: RequestContext) => Promise<HttpResponseInit>;

export function withApi(handler: ApiHandler, roles?: readonly UserRole[]) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await authenticate(request, roles);
      return await handler(request, context, auth);
    } catch (error) {
      if (error instanceof ZodError) {
        return json({ error: { code: "validation_error", message: error.issues[0]?.message || "Revise os dados informados.", fields: error.flatten() } }, 400);
      }
      if (error instanceof AppError) {
        return json({ error: { code: error.code, message: error.message, details: error.details } }, error.status);
      }
      const safeError = error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" };
      context.error("Falha não tratada na API.", { invocationId: context.invocationId, error: safeError });
      return json({ error: { code: "internal_error", message: "Não foi possível concluir a operação. Tente novamente." } }, 500);
    }
  };
}
