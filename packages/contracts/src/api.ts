import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema, type Direction } from "./common.js";
import { AstronautIdSchema, AstronautSchema } from "./crew.js";
import { EnvironmentProfileSchema } from "./environment.js";
import { IncidentEventSchema, IncidentStateSchema, type Actor } from "./incident.js";
import { MeasurementSchema } from "./measurement.js";
import { MessageSchema } from "./message.js";
import { ClockFactorSchema, MissionClockSchema } from "./mission-clock.js";
import {
  TransmissionSchema,
  TransportStatusSchema,
  transmissionMismatches,
  type TransmissionMismatch,
} from "./transmission.js";

// Response schemas of the nine routes of T-005 §5.1 (D-20). Requests of the batch are in sync.ts.

function reportMismatches(
  mismatches: TransmissionMismatch[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
): void {
  for (const mismatch of mismatches) {
    ctx.addIssue({ code: "custom", message: mismatch.message, path: [...basePath, mismatch.path] });
  }
}

/** A ship event travels SHIP_TO_EARTH; an Earth review travels EARTH_TO_SHIP. */
function directionForActor(actor: Actor): Direction {
  return actor === "SHIP" ? "SHIP_TO_EARTH" : "EARTH_TO_SHIP";
}

/** GET /api/health */
export const HealthResponseSchema = z.object({ status: z.literal("ok") }).strict();
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** GET /api/mission/config */
export const MissionConfigResponseSchema = z
  .object({
    clock: MissionClockSchema,
    profile: EnvironmentProfileSchema,
    serverSimNow: IsoDateTimeSchema,
  })
  .strict();
export type MissionConfigResponse = z.infer<typeof MissionConfigResponseSchema>;

/** POST /api/mission/clock/factor (request) */
export const SetClockFactorRequestSchema = z.object({ factor: ClockFactorSchema }).strict();
export type SetClockFactorRequest = z.infer<typeof SetClockFactorRequestSchema>;

/** POST /api/mission/clock/factor (response): the re-anchored clock, `clockVersion + 1`. */
export const SetClockFactorResponseSchema = z.object({ clock: MissionClockSchema }).strict();
export type SetClockFactorResponse = z.infer<typeof SetClockFactorResponseSchema>;

/** GET /api/crew (no `serverSimNow`, as in the T-005 §5.1 table, Q7). */
export const CrewResponseSchema = z.object({ crew: z.array(AstronautSchema) }).strict();
export type CrewResponse = z.infer<typeof CrewResponseSchema>;

/** Measurement with its transmission: MEASUREMENT, same id, SHIP_TO_EARTH (M-10, Q6). */
export const MeasurementWithTransmissionSchema = z
  .object({
    measurement: MeasurementSchema,
    transmission: TransmissionSchema,
    transportStatus: TransportStatusSchema,
  })
  .strict()
  .superRefine((item, ctx) => {
    reportMismatches(
      transmissionMismatches(item.transmission, {
        contentKind: "MEASUREMENT",
        contentId: item.measurement.id,
        direction: "SHIP_TO_EARTH",
      }),
      ctx,
      ["transmission"],
    );
  });
export type MeasurementWithTransmission = z.infer<typeof MeasurementWithTransmissionSchema>;

/** GET /api/measurements?astronautId= */
export const MeasurementsResponseSchema = z
  .object({
    serverSimNow: IsoDateTimeSchema,
    items: z.array(MeasurementWithTransmissionSchema),
  })
  .strict();
export type MeasurementsResponse = z.infer<typeof MeasurementsResponseSchema>;

/** Incident event with its transmission: INCIDENT_EVENT, same id, direction by actor (M-10, Q6). */
export const IncidentEventWithTransmissionSchema = z
  .object({
    event: IncidentEventSchema,
    transmission: TransmissionSchema,
    transportStatus: TransportStatusSchema,
  })
  .strict()
  .superRefine((item, ctx) => {
    reportMismatches(
      transmissionMismatches(item.transmission, {
        contentKind: "INCIDENT_EVENT",
        contentId: item.event.id,
        direction: directionForActor(item.event.actor),
      }),
      ctx,
      ["transmission"],
    );
  });
export type IncidentEventWithTransmission = z.infer<typeof IncidentEventWithTransmissionSchema>;

/**
 * Incident projected for the querying role. `state` is `null` while Earth does not see the
 * INCIDENT_OPENED yet. Every event belongs to this incident and astronaut (Q6).
 */
export const ProjectedIncidentSchema = z
  .object({
    incidentId: UuidSchema,
    astronautId: AstronautIdSchema,
    state: IncidentStateSchema.nullable(),
    events: z.array(IncidentEventWithTransmissionSchema),
  })
  .strict()
  .superRefine((incident, ctx) => {
    incident.events.forEach((item, index) => {
      if (item.event.incidentId !== incident.incidentId) {
        ctx.addIssue({
          code: "custom",
          message: "event.incidentId must equal incidentId",
          path: ["events", index, "event", "incidentId"],
        });
      }
      if (item.event.astronautId !== incident.astronautId) {
        ctx.addIssue({
          code: "custom",
          message: "event.astronautId must equal astronautId",
          path: ["events", index, "event", "astronautId"],
        });
      }
    });
  });
export type ProjectedIncident = z.infer<typeof ProjectedIncidentSchema>;

/** GET /api/incidents?astronautId= */
export const IncidentsResponseSchema = z
  .object({
    serverSimNow: IsoDateTimeSchema,
    incidents: z.array(ProjectedIncidentSchema),
  })
  .strict();
export type IncidentsResponse = z.infer<typeof IncidentsResponseSchema>;

/** Message with its transmission: MESSAGE, same id, same direction (M-10, Q6). */
export const MessageWithTransmissionSchema = z
  .object({
    message: MessageSchema,
    transmission: TransmissionSchema,
    transportStatus: TransportStatusSchema,
  })
  .strict()
  .superRefine((item, ctx) => {
    reportMismatches(
      transmissionMismatches(item.transmission, {
        contentKind: "MESSAGE",
        contentId: item.message.id,
        direction: item.message.direction,
      }),
      ctx,
      ["transmission"],
    );
  });
export type MessageWithTransmission = z.infer<typeof MessageWithTransmissionSchema>;

/** GET /api/messages?astronautId= */
export const MessagesResponseSchema = z
  .object({
    serverSimNow: IsoDateTimeSchema,
    items: z.array(MessageWithTransmissionSchema),
  })
  .strict();
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;

/** POST /api/demo/reset: the initial clock (only when DEMO_RESET_ENABLED=true). */
export const DemoResetResponseSchema = z.object({ clock: MissionClockSchema }).strict();
export type DemoResetResponse = z.infer<typeof DemoResetResponseSchema>;
