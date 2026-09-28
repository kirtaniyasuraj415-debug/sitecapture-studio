export type CaptureMode = "screenshot" | "video";
export type DeviceKind = "desktop" | "tablet" | "mobile" | "custom";
export type ScreenshotType = "viewport" | "fullPage" | "selectedHeight";
export type JobStatus = "queued" | "opening" | "loading" | "rendering" | "capturing" | "processing" | "ready" | "error";

export type DevicePreset = {
  id: string;
  label: string;
  kind: Exclude<DeviceKind, "custom">;
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
};

export type CaptureJob = {
  id: string;
  type: CaptureMode;
  status: JobStatus;
  progress: number;
  message: string;
  createdAt: string;
  result?: {
    fileId: string;
    fileName: string;
    downloadUrl: string;
    previewUrl: string;
    format: string;
    width: number;
    height: number;
    fileSize: number;
    captureTimeMs: number;
    sourceUrl: string;
    finalUrl: string;
    deviceLabel: string;
    dpr: number;
    warnings?: string[];
    durationSeconds?: number;
    frameRate?: string;
    expiresAt?: string;
    secondaryFile?: { fileId: string; fileName: string; downloadUrl: string; format: string };
  };
  error?: { code: string; message: string };
};
