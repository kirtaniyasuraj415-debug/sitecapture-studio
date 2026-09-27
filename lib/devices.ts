import type { DevicePreset } from "./types";

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "desktop-1920", label: "Desktop 1920 × 1080", kind: "desktop", width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { id: "desktop-1440", label: "Desktop 1440 × 900", kind: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { id: "desktop-1366", label: "Desktop 1366 × 768", kind: "desktop", width: 1366, height: 768, isMobile: false, hasTouch: false },
  { id: "tablet-1024", label: "Tablet 1024 × 1366", kind: "tablet", width: 1024, height: 1366, isMobile: true, hasTouch: true },
  { id: "tablet-834", label: "Tablet 834 × 1194", kind: "tablet", width: 834, height: 1194, isMobile: true, hasTouch: true },
  { id: "mobile-390", label: "Mobile 390 × 844", kind: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
  { id: "mobile-430", label: "Mobile 430 × 932", kind: "mobile", width: 430, height: 932, isMobile: true, hasTouch: true },
  { id: "mobile-360", label: "Mobile 360 × 800", kind: "mobile", width: 360, height: 800, isMobile: true, hasTouch: true },
];

export const deviceById = (id: string) => DEVICE_PRESETS.find((d) => d.id === id) ?? DEVICE_PRESETS[0];
