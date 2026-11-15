import { Injectable } from "@nestjs/common";
import { CrewResponseSchema, type CrewResponse } from "@astra/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CrewService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CrewResponse> {
    const astronauts = await this.prisma.astronaut.findMany({ orderBy: { id: "asc" } });
    return CrewResponseSchema.parse({ crew: astronauts });
  }
}
