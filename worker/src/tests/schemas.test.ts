import { describe, expect, it } from "vitest";
import { screenshotSchema, videoSchema } from "../lib/schemas.js";

describe("capture schemas", () => {
  it("defaults screenshot to PNG at DPR 2", () => {
    const value = screenshotSchema.parse({ url: "https://example.com" });
    expect(value.format).toBe("png");
    expect(value.dpr).toBe(2);
  });
  it("rejects selected-height capture without a height", () => {
    expect(() => screenshotSchema.parse({ url: "https://example.com", screenshotType: "selectedHeight" })).toThrow();
  });
  it("caps video duration", () => {
    expect(() => videoSchema.parse({ url: "https://example.com", durationSeconds: 31 })).toThrow();
  });
});
