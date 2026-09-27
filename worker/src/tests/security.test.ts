import { describe, expect, it } from "vitest";
import { isPrivateAddress, validatePublicUrl } from "../capture/security.js";

 describe("SSRF protection", () => {
  it("blocks private IPv4 ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.1.1", "169.254.169.254", "198.51.100.10", "203.0.113.10"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
  it("blocks private IPv6 and mapped IPv4", () => {
    for (const ip of ["::1", "fc00::1", "fe80::1", "::ffff:c0a8:101", "2001:db8::1"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
  it("blocks unsafe protocols", async () => {
    await expect(validatePublicUrl("file:///etc/passwd")).rejects.toThrow();
  });
  it("blocks localhost", async () => {
    await expect(validatePublicUrl("http://localhost:3000")).rejects.toThrow();
  });
});
