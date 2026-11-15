import { Injectable } from "@nestjs/common";
import { MissionClockSchema } from "@astra/contracts";
import { NowProvider } from "../common/now-provider.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedDatabase } from "../seed/seed.js";

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService, private readonly nowProvider: NowProvider) {}

  /** This is the only API operation allowed to erase demo data. */
  async reset(): Promise<{ clock: ReturnType<typeof MissionClockSchema.parse> }> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.measurement.deleteMany();
      await transaction.incidentEvent.deleteMany();
      await transaction.message.deleteMany();
      await transaction.transmission.deleteMany();
      await transaction.astronaut.deleteMany();
      await transaction.environmentProfile.deleteMany();
      await transaction.missionClock.deleteMany();
    });

    await seedDatabase(this.prisma, this.nowProvider.now());
    const row = await this.prisma.missionClock.findUniqueOrThrow({ where: { id: 1 } });
    return {
      clock: MissionClockSchema.parse({
        simEpoch: row.simEpoch.toISOString(),
        realEpoch: row.realEpoch.toISOString(),
        factor: row.factor,
        clockVersion: row.clockVersion,
      }),
    };
  }
}
