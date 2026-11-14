import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.js";

// P3: abre una base SQLite de prueba con el adaptador y lee MissionClock.
// La base vive en el directorio temporal del sistema (nunca dentro del repo, M-11)
// y se migra con el CLI real (`prisma migrate deploy`).
const apiDir = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const prismaCli = path.join(path.dirname(require.resolve("prisma/package.json")), "build", "index.js");

describe("Prisma + SQLite adapter", () => {
  let tempDir: string;
  let dbFile: string;
  let prisma: PrismaClient;

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "astra-api-test-"));
    dbFile = path.join(tempDir, "test.db");
    const databaseUrl = `file:${dbFile.replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("migrates a test database and reads MissionClock (zero rows)", async () => {
    expect(existsSync(dbFile)).toBe(true);
    const rows = await prisma.missionClock.findMany();
    expect(rows).toEqual([]);
  });
});
