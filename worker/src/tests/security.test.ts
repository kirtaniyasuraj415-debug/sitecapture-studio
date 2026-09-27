import { describe, expect, it } from "vitest";
import { isPrivateAddress, validatePublicUrl } from "../capture/security.js";

describe("SSRF protection", () => {
  it("blocks private IPv4 ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.1.1", "169.254.169.254"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
  it("blocks unsafe protocols", async () => {
    await expect(validatePublicUrl("file:///etc/passwd")).rejects.toThrow();
  });
  it("blocks localhost", async () => {
    await expect(validatePublicUrl("http://localhost:3000")).rejects.toThrow();
  });
});
