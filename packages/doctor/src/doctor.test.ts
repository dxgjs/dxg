import { describe, test, expect } from "vitest";

describe("doctor package", () => {
  test("placeholder test - doctor package exports should be loadable", async () => {
    const doctor = await import("./index");
    expect(doctor).toBeDefined();
    expect(typeof doctor.runDoctor).toBe("function");
  });
});