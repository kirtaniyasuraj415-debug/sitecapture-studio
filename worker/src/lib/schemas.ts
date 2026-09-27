import { z } from "zod";

const common = z.object({
  url: z.string().url().max(2048),
  deviceId: z.string().max(64).optional(),
  width: z.number().int().min(320).max(3840).optional(),
  height: z.number().int().min(480).max(6000).optional(),
  isMobile: z.boolean().optional(),
  hasTouch: z.boolean().optional(),
  userAgent: z.string().max(512).optional(),
  dpr: z.number().int().min(1).max(3).default(2),
  waitSeconds: z.number().min(0).max(10).default(2),
  colorScheme: z.enum(["dark", "light", "no-preference"]).default("no-preference"),
  hideScrollbars: z.boolean().default(false),
  keepAnimations: z.boolean().default(true),
  removeCookiePopup: z.boolean().default(false),
  transparentBackground: z.boolean().default(false),
});

export const screenshotSchema = common.extend({
  screenshotType: z.enum(["viewport", "fullPage", "selectedHeight"]).default("viewport"),
  selectedHeight: z.number().int().min(480).max(12000).optional(),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
  quality: z.number().int().min(60).max(100).default(92),
}).superRefine((value, ctx) => {
  if (value.screenshotType === "selectedHeight" && !value.selectedHeight) ctx.addIssue({ code: "custom", path: ["selectedHeight"], message: "Selected height is required." });
});

export const videoSchema = common.extend({
  recordingMode: z.enum(["static", "autoScroll"]).default("autoScroll"),
  durationSeconds: z.number().int().min(3).max(30).default(10),
  scrollSpeed: z.enum(["slow", "normal", "fast"]).default("normal"),
  output: z.enum(["mp4", "webm", "both"]).default("mp4"),
  videoPreset: z.enum(["device", "1080p", "1440p", "4k"]).default("device"),
});

export type ScreenshotInput = z.infer<typeof screenshotSchema>;
export type VideoInput = z.infer<typeof videoSchema>;
