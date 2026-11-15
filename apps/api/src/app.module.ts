import { Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DemoRoleGuard } from "./common/demo-role.js";
import { NowProvider } from "./common/now-provider.js";
import { API_CONFIG, type ApiConfig } from "./config.js";
import { HealthModule } from "./health/health.module.js";
import { CommunicationsModule } from "./communications/communications.module.js";
import { CrewModule } from "./crew/crew.module.js";
import { MeasurementsModule } from "./measurements/measurements.module.js";
import { MissionsModule } from "./missions/missions.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({})
export class AppModule {
  /** The config is passed in (main.ts or the tests): no hidden reads of process.env. */
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [PrismaModule, HealthModule, CrewModule, MissionsModule, MeasurementsModule, CommunicationsModule],
      providers: [
        { provide: API_CONFIG, useValue: config },
        NowProvider,
        // X-Demo-Role on every route except those marked with @SkipDemoRole() (QA-703).
        { provide: APP_GUARD, useClass: DemoRoleGuard },
      ],
      exports: [API_CONFIG, NowProvider],
    };
  }
}
