import { Injectable } from "@nestjs/common";

/**
 * Source of the real "now". Injected so tests can control time without waiting
 * (`overrideProvider(NowProvider).useValue(...)`).
 */
@Injectable()
export class NowProvider {
  now(): Date {
    return new Date();
  }
}
