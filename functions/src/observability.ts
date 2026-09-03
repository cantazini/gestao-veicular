import { logger } from "firebase-functions";

export function logOperation(operation: string, context: Record<string, unknown>) {
  logger.info(operation, { operation, ...context });
}
