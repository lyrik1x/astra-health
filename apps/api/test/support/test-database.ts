import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client.js";

// S4: test SQLite database in the system temp directory (never inside the repo, M-11),
// migrated with the real CLI (`prisma migrate deploy`). Each test inserts its own data.
const apiDir = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const prismaCli = path.join(path.dirname(require.resolve("prisma/package.json")), "build", "index.js");

export interface TestDatabase {
  databaseUrl: string;
  prisma: PrismaClient;
  cleanup(): Promise<void>;
}

export function createTestDatabase(): TestDatabase {
  const tempDir = mkdtempSync(path.join(tmpdir(), "astra-api-test-"));
  const databaseUrl = `file:${path.join(tempDir, "test.db").replaceAll("\\", "/")}`;
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  return {
    databaseUrl,
    prisma,
    async cleanup() {
      await prisma.$disconnect();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
