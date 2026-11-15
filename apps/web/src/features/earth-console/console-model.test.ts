import { describe, expect, it } from "vitest";
import { IncidentsResponseSchema, MeasurementsResponseSchema } from "@astra/contracts";
import {
  deliveredReport,
  formatMeasurementValue,
  formatSimTime,
  ownReviews,
  shipEvents,
  sortMeasurements,
} from "./console-model";
import { incident, measurementItem, reviewEvent, shipEvent } from "./test-fixtures";

describe("test fixtures", () => {
  it("follow the shared contracts", () => {
    const items = [measurementItem(), measurementItem({ indicator: "BLOOD_PRESSURE", value: { systolic: 120, diastolic: 80 }, unit: "mmHg" })];
    expect(MeasurementsResponseSchema.safeParse({ serverSimNow: "2031-03-01T00:10:00.000Z", items }).success).toBe(true);
    const incidents = [incident("AWAITING_REVIEW", [shipEvent("INCIDENT_OPENED", 1), shipEvent("REPORT_SUBMITTED", 2), reviewEvent("IN_TRANSIT")])];
    expect(IncidentsResponseSchema.safeParse({ serverSimNow: "2031-03-01T00:10:00.000Z", incidents }).success).toBe(true);
  });
});

describe("sortMeasurements", () => {
  it("puts the newest capturedAtSim first, then the newest deliverAt, then by id", () => {
    const old = measurementItem({ capturedAtSim: "2031-03-01T00:00:10.000Z" });
    const newest = measurementItem({ capturedAtSim: "2031-03-01T00:09:00.000Z" });
    const tieEarlyDelivery = measurementItem({ id: "aaaaaaaa-0000-4000-8000-000000000002", capturedAtSim: "2031-03-01T00:05:00.000Z" }, "2031-03-01T00:06:00.000Z");
    const tieLateDelivery = measurementItem({ id: "aaaaaaaa-0000-4000-8000-000000000003", capturedAtSim: "2031-03-01T00:05:00.000Z" }, "2031-03-01T00:08:00.000Z");
    const tieById = measurementItem({ id: "aaaaaaaa-0000-4000-8000-000000000001", capturedAtSim: "2031-03-01T00:05:00.000Z" }, "2031-03-01T00:06:00.000Z");

    const input = [old, tieEarlyDelivery, newest, tieById, tieLateDelivery];
    const sorted = sortMeasurements(input);

    expect(sorted).toEqual([newest, tieLateDelivery, tieById, tieEarlyDelivery, old]);
    expect(input[0]).toBe(old);
  });
});

describe("incident helpers", () => {
  it("finds the delivered REPORT_SUBMITTED (the alert)", () => {
    const report = shipEvent("REPORT_SUBMITTED", 2);
    expect(deliveredReport(incident("AWAITING_REVIEW", [shipEvent("INCIDENT_OPENED", 1), report]))).toBe(report);
  });

  it("shows no alert while the report is not delivered", () => {
    const inTransit = shipEvent("REPORT_SUBMITTED", 2, "IN_TRANSIT");
    expect(deliveredReport(incident("ACTIVE", [shipEvent("INCIDENT_OPENED", 1), inTransit]))).toBeUndefined();
  });

  it("lists Earth reviews with their transport state, and ship events by sequence", () => {
    const opened = shipEvent("INCIDENT_OPENED", 1);
    const report = shipEvent("REPORT_SUBMITTED", 2);
    const sent = reviewEvent("IN_TRANSIT");
    const arrived = reviewEvent("DELIVERED");
    const target = incident("AWAITING_REVIEW", [report, sent, opened, arrived]);

    expect(ownReviews(target).map((review) => review.transportStatus)).toEqual(["IN_TRANSIT", "DELIVERED"]);
    expect(shipEvents(target)).toEqual([opened, report]);
  });
});

describe("formatting", () => {
  it("formats simulated time as YYYY-MM-DD HH:mm UTC", () => {
    expect(formatSimTime("2031-03-01T07:05:59.999Z")).toBe("2031-03-01 07:05 UTC");
  });

  it("shows blood pressure as systolic/diastolic and other values as the number", () => {
    const pressure = measurementItem({ indicator: "BLOOD_PRESSURE", value: { systolic: 120, diastolic: 80 }, unit: "mmHg" });
    expect(formatMeasurementValue(pressure.measurement)).toBe("120/80");
    expect(formatMeasurementValue(measurementItem({ value: 72 }).measurement)).toBe("72");
  });
});
