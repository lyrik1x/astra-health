import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import type { DemoRole, SyncBatchResponse } from "@astra/contracts";
import { CurrentDemoRole } from "../common/demo-role.js";
import { parseSyncEnvelope } from "./sync-envelope.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** POST /api/sync/batch (T-005 §5.2). 200 with one result per item (Nest would answer 201). */
  @Post("batch")
  @HttpCode(200)
  batch(@Body() body: unknown, @CurrentDemoRole() role: DemoRole): Promise<SyncBatchResponse> {
    return this.sync.processBatch(parseSyncEnvelope(body), role);
  }
}
