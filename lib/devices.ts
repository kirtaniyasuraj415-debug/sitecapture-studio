export { DEVICE_PRESETS } from "@/shared/devices";
import { DEVICE_PRESETS } from "@/shared/devices";
export const deviceById = (id: string) => DEVICE_PRESETS.find((d) => d.id === id) ?? DEVICE_PRESETS[0];
