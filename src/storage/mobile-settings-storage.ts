/**
 * Validates and persists joystick size and normalized placement independently from saved world data.
 * Invalid or unavailable browser storage falls back to safe defaults without blocking mobile play.
 */

// A separate namespaced key prevents interface preferences from invalidating world-save schema data.
const STORAGE_KEY = "voxel-frontier.mobile-controls.v1";

// Size bounds preserve a usable touch target without allowing the joystick to cover the whole viewport.
export const MIN_JOYSTICK_SIZE = 96;
export const MAX_JOYSTICK_SIZE = 180;

// Horizontal placement stays in the left half reserved for movement rather than camera look.
export const MIN_HORIZONTAL_RATIO = 0.1;
export const MAX_HORIZONTAL_RATIO = 0.42;

// Vertical placement avoids both the bottom hotbar and the upper status controls.
export const MIN_VERTICAL_RATIO = 0.16;
export const MAX_VERTICAL_RATIO = 0.58;

/** MobileControlSettings stores viewport-relative placement so rotation and resizing remain stable. */
export interface MobileControlSettings {
  readonly joystickSize: number;
  readonly horizontalRatio: number;
  readonly verticalRatio: number;
}

// Defaults place a medium control comfortably above the hotbar near the lower-left thumb position.
export const DEFAULT_MOBILE_CONTROL_SETTINGS: MobileControlSettings = {
  joystickSize: 132,
  horizontalRatio: 0.19,
  verticalRatio: 0.28,
};

/** Reports whether an unknown value is a finite number inside an inclusive preference boundary. */
function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/** Validates the complete settings object before any untrusted local-storage values reach CSS. */
function isMobileControlSettings(value: unknown): value is MobileControlSettings {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<MobileControlSettings>;
  return (
    isBoundedNumber(candidate.joystickSize, MIN_JOYSTICK_SIZE, MAX_JOYSTICK_SIZE) &&
    isBoundedNumber(candidate.horizontalRatio, MIN_HORIZONTAL_RATIO, MAX_HORIZONTAL_RATIO) &&
    isBoundedNumber(candidate.verticalRatio, MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO)
  );
}

/** Loads validated preferences and falls back safely when storage is absent, corrupt, or blocked. */
export function loadMobileControlSettings(): MobileControlSettings {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (serialized === null) {
      return DEFAULT_MOBILE_CONTROL_SETTINGS;
    }
    const parsed: unknown = JSON.parse(serialized);
    if (isMobileControlSettings(parsed)) {
      return parsed;
    }
    console.warn("[MobileSettings] Ignored invalid joystick preferences.");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown storage error";
    console.error(`[MobileSettings] Preferences could not be loaded: ${message}`);
  }
  return DEFAULT_MOBILE_CONTROL_SETTINGS;
}

/** Saves one validated preference snapshot and reports whether browser storage accepted it. */
export function saveMobileControlSettings(settings: MobileControlSettings): boolean {
  if (!isMobileControlSettings(settings)) {
    console.error("[MobileSettings] Refused to save invalid joystick preferences.");
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown storage error";
    console.error(`[MobileSettings] Preferences could not be saved: ${message}`);
    return false;
  }
}
