export type DevicePreset = {
  id: string;
  label: string;
  kind: "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
};

const mobileUA = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const tabletUA = "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "desktop-1920", label: "Desktop 1920 × 1080", kind: "desktop", width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { id: "desktop-1440", label: "Desktop 1440 × 900", kind: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { id: "desktop-1366", label: "Desktop 1366 × 768", kind: "desktop", width: 1366, height: 768, isMobile: false, hasTouch: false },
  { id: "tablet-1024", label: "Tablet 1024 × 1366", kind: "tablet", width: 1024, height: 1366, isMobile: true, hasTouch: true, userAgent: tabletUA },
  { id: "tablet-834", label: "Tablet 834 × 1194", kind: "tablet", width: 834, height: 1194, isMobile: true, hasTouch: true, userAgent: tabletUA },
  { id: "mobile-390", label: "Mobile 390 × 844", kind: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, userAgent: mobileUA },
  { id: "mobile-430", label: "Mobile 430 × 932", kind: "mobile", width: 430, height: 932, isMobile: true, hasTouch: true, userAgent: mobileUA },
  { id: "mobile-360", label: "Mobile 360 × 800", kind: "mobile", width: 360, height: 800, isMobile: true, hasTouch: true, userAgent: mobileUA },
];

export function resolveDevice(input: { deviceId?: string; width?: number; height?: number; isMobile?: boolean; hasTouch?: boolean; userAgent?: string }) {
  const preset = input.deviceId ? DEVICE_PRESETS.find((d) => d.id === input.deviceId) : undefined;
  if (preset) {
    const isMobile = input.isMobile ?? preset.isMobile;
    const userAgent = input.userAgent || preset.userAgent || (isMobile ? (preset.width > 600 ? tabletUA : mobileUA) : undefined);
    return { ...preset, isMobile, hasTouch: input.hasTouch ?? preset.hasTouch, userAgent };
  }
  const width = input.width ?? 1920;
  const height = input.height ?? 1080;
  return {
    id: "custom",
    label: `Custom ${width} × ${height}`,
    kind: input.isMobile ? "mobile" as const : "desktop" as const,
    width,
    height,
    isMobile: Boolean(input.isMobile),
    hasTouch: Boolean(input.hasTouch),
    userAgent: input.userAgent || (input.isMobile ? (width > 600 ? tabletUA : mobileUA) : undefined),
  };
}
