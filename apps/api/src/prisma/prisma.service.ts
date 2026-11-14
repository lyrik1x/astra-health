import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { API_CONFIG, type ApiConfig } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Prisma client with the SQLite adapter. It connects lazily on the first query,
 * so routes that do not use the database (e.g. /api/health) never open it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    super({ adapter: new PrismaBetterSqlite3({ url: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
