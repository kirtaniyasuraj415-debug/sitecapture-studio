import { SecurityError } from "../capture/security.js";

export class CaptureError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function toPublicError(error: unknown) {
  if (error instanceof CaptureError || error instanceof SecurityError) return { code: (error as CaptureError).code || "BLOCKED_URL", message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  if (/Timeout/i.test(message)) return { code: "TIMEOUT", message: "Website timed out while loading. Try increasing wait time." };
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(message)) return { code: "DNS_ERROR", message: "Website hostname could not be resolved." };
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET/i.test(message)) return { code: "CONNECTION_ERROR", message: "Website refused or reset the connection." };
  if (/Target page, context or browser has been closed|browser.*closed/i.test(message)) return { code: "BROWSER_CRASH", message: "Browser closed unexpectedly. Retry the capture." };
  return { code: "CAPTURE_FAILED", message: "Capture failed. The website may block automated browsers or use unsupported behavior." };
}
