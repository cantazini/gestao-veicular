import { z } from "zod";

const schema = z.object({
  environment: z.string(),
  sqlConnectionString: z.string().min(1, "SQL_CONNECTION_STRING é obrigatória."),
  storageConnectionString: z.string().min(1, "AZURE_STORAGE_CONNECTION_STRING é obrigatória."),
  storageContainer: z.string().default("appfiles"),
  devAuth: z.boolean(),
  devAuthUserId: z.string().optional(),
  devAuthEmail: z.string().optional(),
  devAuthName: z.string().optional()
}).superRefine((value, context) => {
  if (value.devAuth && value.environment !== "Development") {
    context.addIssue({ code: "custom", message: "DEV_AUTH só pode ser usado em Development." });
  }
});

export type AppConfig = z.infer<typeof schema>;
let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  cached = schema.parse({
    environment: process.env.AZURE_FUNCTIONS_ENVIRONMENT || "Production",
    sqlConnectionString: process.env.SQL_CONNECTION_STRING,
    storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    storageContainer: process.env.AZURE_STORAGE_CONTAINER || "appfiles",
    devAuth: process.env.DEV_AUTH === "true",
    devAuthUserId: process.env.DEV_AUTH_USER_ID,
    devAuthEmail: process.env.DEV_AUTH_EMAIL,
    devAuthName: process.env.DEV_AUTH_NAME
  });
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
