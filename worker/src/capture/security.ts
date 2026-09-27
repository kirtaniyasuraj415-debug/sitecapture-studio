import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SecurityError extends Error {
  code = "BLOCKED_URL";
}

const blockedHostnames = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

function isPrivateIPv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88 && parts[2] === 99) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string) {
  const value = ip.toLowerCase().split("%")[0];
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("::ffff:") || value.startsWith("2001:db8:");
}

export function isPrivateAddress(ip: string) {
  const type = isIP(ip);
  if (type === 4) return isPrivateIPv4(ip);
  if (type === 6) return isPrivateIPv6(ip);
  return true;
}

export async function validatePublicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SecurityError("Invalid URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SecurityError("Only http:// and https:// URLs are allowed.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || blockedHostnames.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new SecurityError("Private or local network URLs are not allowed.");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new SecurityError("Private or local network URLs are not allowed.");
    return url;
  }
  let addresses;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); } catch { throw new SecurityError("Could not resolve that hostname."); }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new SecurityError("Private or local network destinations are not allowed.");
  return url;
}
