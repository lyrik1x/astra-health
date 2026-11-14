import { describe, expect, it } from "vitest";
import {
  CrewResponseSchema,
  DemoResetResponseSchema,
  HealthResponseSchema,
  IncidentsResponseSchema,
  MeasurementsResponseSchema,
  MessagesResponseSchema,
  MissionConfigResponseSchema,
  SetClockFactorRequestSchema,
  SetClockFactorResponseSchema,
} from "./index.js";
import { IDS, T, clock, events, measurements, message, parses, profile, transmission } from "./test-fixtures.js";

const measurementItem = {
  measurement: measurements.HEART_RATE,
  transmission: transmission("MEASUREMENT", IDS.measurement, "SHIP_TO_EARTH"),
  transportStatus: "DELIVERED",
};

const shipEventItem = {
  event: events.opened,
  transmission: transmission("INCIDENT_EVENT", IDS.event, "SHIP_TO_EARTH"),
  transportStatus: "IN_TRANSIT",
};

const reviewItem = {
  event: events.earthReview,
  transmission: transmission("INCIDENT_EVENT", IDS.review, "EARTH_TO_SHIP"),
  transportStatus: "DELIVERED",
};

const messageItem = {
  message,
  transmission: transmission("MESSAGE", IDS.message, "SHIP_TO_EARTH"),
  transportStatus: "IN_TRANSIT",
};

const incident = {
  incidentId: IDS.incident,
  astronautId: "sam",
  state: "AWAITING_REVIEW",
  events: [shipEventItem, reviewItem],
};

describe("simple responses", () => {
  it("health, mission config, clock factor, crew and demo reset accept their shape", () => {
    expect(parses(HealthResponseSchema, { status: "ok" })).toBe(true);
    expect(parses(MissionConfigResponseSchema, { clock, profile, serverSimNow: T })).toBe(true);
    expect(parses(SetClockFactorRequestSchema, { factor: 120 })).toBe(true);
    expect(parses(SetClockFactorResponseSchema, { clock: { ...clock, clockVersion: 2 } })).toBe(true);
    expect(parses(CrewResponseSchema, { crew: [{ id: "sam", displayName: "Sam" }] })).toBe(true);
    expect(parses(CrewResponseSchema, { crew: [] })).toBe(true);
    expect(parses(DemoResetResponseSchema, { clock })).toBe(true);
  });

  it("reject wrong shapes", () => {
    expect(parses(HealthResponseSchema, { status: "degraded" })).toBe(false);
    expect(parses(MissionConfigResponseSchema, { clock, profile })).toBe(false);
    expect(parses(SetClockFactorRequestSchema, { factor: 0 })).toBe(false);
    expect(parses(SetClockFactorRequestSchema, { factor: 3601 })).toBe(false);
    expect(parses(SetClockFactorRequestSchema, { factor: 60, clockVersion: 2 })).toBe(false);
    expect(parses(CrewResponseSchema, { crew: [{ id: "Sam", displayName: "Sam" }] })).toBe(false);
    expect(parses(CrewResponseSchema, { crew: [], serverSimNow: T })).toBe(false);
    expect(parses(DemoResetResponseSchema, { clock: { ...clock, factor: -1 } })).toBe(false);
  });
});

describe("MeasurementsResponseSchema (M-10)", () => {
  it("accepts a measurement with its MEASUREMENT transmission", () => {
    expect(parses(MeasurementsResponseSchema, { serverSimNow: T, items: [measurementItem] })).toBe(true);
  });

  it("rejects a measurement with a MESSAGE transmission", () => {
    const item = { ...measurementItem, transmission: { ...measurementItem.transmission, contentKind: "MESSAGE" } };
    expect(parses(MeasurementsResponseSchema, { serverSimNow: T, items: [item] })).toBe(false);
  });

  it("rejects another contentId, EARTH_TO_SHIP direction, QUEUED status and no serverSimNow (Q6)", () => {
    const tx = measurementItem.transmission;
    const response = (item: unknown) => ({ serverSimNow: T, items: [item] });
    expect(parses(MeasurementsResponseSchema, response({ ...measurementItem, transmission: { ...tx, contentId: IDS.message } }))).toBe(false);
    expect(parses(MeasurementsResponseSchema, response({ ...measurementItem, transmission: { ...tx, direction: "EARTH_TO_SHIP" } }))).toBe(false);
    expect(parses(MeasurementsResponseSchema, response({ ...measurementItem, transportStatus: "QUEUED" }))).toBe(false);
    expect(parses(MeasurementsResponseSchema, { items: [measurementItem] })).toBe(false);
  });
});

describe("IncidentsResponseSchema", () => {
  it("accepts ship events and Earth reviews with their transmissions", () => {
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [incident] })).toBe(true);
  });

  it("accepts state null (Earth does not see INCIDENT_OPENED yet)", () => {
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [{ ...incident, state: null, events: [] }] })).toBe(true);
  });

  it("rejects an event with a MEASUREMENT transmission (M-10)", () => {
    const item = { ...shipEventItem, transmission: { ...shipEventItem.transmission, contentKind: "MEASUREMENT" } };
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [{ ...incident, events: [item] }] })).toBe(false);
  });

  it("rejects a direction that does not match the actor (Q6)", () => {
    const item = { ...reviewItem, transmission: { ...reviewItem.transmission, direction: "SHIP_TO_EARTH" } };
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [{ ...incident, events: [item] }] })).toBe(false);
  });

  it("rejects an event of another incident or astronaut (Q6)", () => {
    const otherIncident = { ...incident, incidentId: IDS.message };
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [otherIncident] })).toBe(false);
    const otherAstronaut = { ...incident, astronautId: "alex" };
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [otherAstronaut] })).toBe(false);
  });

  it("rejects an unknown state", () => {
    expect(parses(IncidentsResponseSchema, { serverSimNow: T, incidents: [{ ...incident, state: "OPEN" }] })).toBe(false);
  });
});

describe("MessagesResponseSchema", () => {
  it("accepts a message with its MESSAGE transmission in the same direction", () => {
    expect(parses(MessagesResponseSchema, { serverSimNow: T, items: [messageItem] })).toBe(true);
  });

  it("rejects a MEASUREMENT transmission (M-10) and a different direction (Q6)", () => {
    const tx = messageItem.transmission;
    expect(parses(MessagesResponseSchema, { serverSimNow: T, items: [{ ...messageItem, transmission: { ...tx, contentKind: "MEASUREMENT" } }] })).toBe(false);
    expect(parses(MessagesResponseSchema, { serverSimNow: T, items: [{ ...messageItem, transmission: { ...tx, direction: "EARTH_TO_SHIP" } }] })).toBe(false);
  });
});
