export interface ApiConfig {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
}

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

  return { port, databaseUrl: requireVar(env, "DATABASE_URL"), corsOrigins };
}
