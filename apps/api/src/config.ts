/** Nest injection token for the loaded ApiConfig (provided by AppModule.forRoot). */
export const API_CONFIG = Symbol("API_CONFIG");

export interface ApiConfig {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  /** Max JSON body size, in body-parser format (e.g. `1mb`). */
  bodyLimit: string;
  /** Demo data reset endpoint; disabled unless explicitly set to "true". */
  demoResetEnabled: boolean;
}

/** Body size accepted by body-parser: an integer followed by b, kb or mb (case-insensitive). */
const BODY_LIMIT_PATTERN = /^\d+(b|kb|mb)$/i;

function requireVar(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (see apps/api/.env.example)`);
  }
  return value;
}

/** Reads the API configuration from environment variables. No defaults: fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const portText = requireVar(env, "PORT");
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portText}`);
  }

  const corsOrigins = requireVar(env, "CORS_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must list at least one origin");
  }

  const bodyLimit = requireVar(env, "BODY_LIMIT");
  if (!BODY_LIMIT_PATTERN.test(bodyLimit)) {
    throw new Error(`Invalid BODY_LIMIT: ${bodyLimit} (expected e.g. 1mb, 512kb)`);
  }

  // Optional: only the exact value "true" enables the destructive demo reset route.
  const demoResetEnabled = env.DEMO_RESET_ENABLED === "true";

  return { port, databaseUrl: requireVar(env, "DATABASE_URL"), corsOrigins, bodyLimit, demoResetEnabled };
}
