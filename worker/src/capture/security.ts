import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export class SecurityError extends Error { code = "BLOCKED_URL"; }
const blockedHostnames = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

export function isPrivateAddress(raw: string) {
  try {
    if (raw.includes("%")) return true;
    const address = ipaddr.parse(raw);
    if (address.range() !== "unicast") return true;
    if (address.kind() === "ipv6") {
      const a = address as ipaddr.IPv6;
      if (!a.match(ipaddr.parseCIDR("2000::/3"))) return true;
      for (const range of ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"]) {
        if (a.match(ipaddr.parseCIDR(range))) return true;
      }
    }
    return false;
  } catch { return true; }
}

export function normalizePublicHostname(raw: string) {
  return raw.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export async function resolvePublicHost(raw: string) {
  const hostname = normalizePublicHostname(raw);
  if (!hostname || blockedHostnames.has(hostname) || !hostname.includes(".") && !isIP(hostname) || /\.(localhost|local|internal|home|lan)$/.test(hostname)) {
    throw new SecurityError("Private or local network URLs are not allowed.");
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new SecurityError("Private or reserved network URLs are not allowed.");
    return { hostname, address: hostname, family: isIP(hostname) as 4 | 6 };
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout")), 5000); }),
    ]);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new SecurityError("Private or reserved network destinations are not allowed.");
    const chosen = addresses.find((a) => a.family === 4) ?? addresses[0];
    return { hostname, address: chosen.address, family: chosen.family as 4 | 6 };
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    throw new SecurityError("Could not resolve that public hostname within 5 seconds.");
  } finally { if (timer) clearTimeout(timer); }
}

export function parsePublicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SecurityError("Invalid URL."); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SecurityError("Only http:// and https:// URLs are allowed.");
  if (url.username || url.password) throw new SecurityError("URLs with embedded credentials are not allowed.");
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (![80, 443, 8080, 8443].includes(port)) throw new SecurityError("Only public web ports 80, 443, 8080 and 8443 are supported.");
  return url;
}

export async function validatePublicUrl(raw: string) {
  const url = parsePublicUrl(raw);
  await resolvePublicHost(url.hostname);
  return url;
}
