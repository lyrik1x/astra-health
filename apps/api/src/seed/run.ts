import "reflect-metadata";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";
import { seedDatabase } from "./seed.js";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Missing DATABASE_URL (see apps/api/.env.example)");

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  try {
    await seedDatabase(prisma, new Date());
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error: unknown) => {
  console.error("Database seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
