import {
  Injectable,
  SetMetadata,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DemoRoleSchema, type DemoRole } from "@astra/contracts";
import { ApiErrorException } from "./api-error.exception.js";

// Demo mode: the role travels in `X-Demo-Role` on every request. It is NOT authentication (QA-703).

const SKIP_DEMO_ROLE = "astra:skipDemoRole";

/** Marks a route or controller that does not need `X-Demo-Role` (only /api/health). */
export const SkipDemoRole = () => SetMetadata(SKIP_DEMO_ROLE, true);

interface RequestWithRole {
  headers: Record<string, string | string[] | undefined>;
  demoRole?: DemoRole;
}

/** Global guard: missing or invalid `X-Demo-Role` -> 400 MISSING_OR_INVALID_ROLE. */
@Injectable()
export class DemoRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_DEMO_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip === true) return true;

    const request = context.switchToHttp().getRequest<RequestWithRole>();
    // Node lowercases header names. A repeated header arrives as an array and is rejected.
    const parsed = DemoRoleSchema.safeParse(request.headers["x-demo-role"]);
    if (!parsed.success) {
      throw new ApiErrorException(
        400,
        "MISSING_OR_INVALID_ROLE",
        "Header X-Demo-Role must be SHIP or EARTH (demo mode, not authentication)",
      );
    }
    request.demoRole = parsed.data;
    return true;
  }
}

/** Role already validated by DemoRoleGuard. */
export const CurrentDemoRole = createParamDecorator((_data: unknown, context: ExecutionContext): DemoRole => {
  const role = context.switchToHttp().getRequest<RequestWithRole>().demoRole;
  if (role === undefined) {
    // Only possible if the route skipped the guard: a programming error, answered as 500.
    throw new Error("CurrentDemoRole used on a route without DemoRoleGuard");
  }
  return role;
});
