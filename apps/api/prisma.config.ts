import { defineConfig, env } from "prisma/config";

// Prisma 7 no carga .env por su cuenta; se usa la función nativa de Node (sin dotenv).
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
