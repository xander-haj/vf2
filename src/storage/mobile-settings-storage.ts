/**
 * Validates and persists touch-control placement and response independently from saved world data.
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

// The lower limit works with CSS safe-area clamping while allowing the joystick close to the screen edge.
export const MIN_VERTICAL_RATIO = 0.05;
export const MAX_VERTICAL_RATIO = 0.58;

// Joystick strength controls how quickly thumb travel reaches full movement speed.
export const MIN_JOYSTICK_STRENGTH = 0.4;
export const MAX_JOYSTICK_STRENGTH = 1.6;

// Camera strength scales both touch look modes without altering desktop mouse sensitivity.
export const MIN_CAMERA_SWIPE_STRENGTH = 0.4;
export const MAX_CAMERA_SWIPE_STRENGTH = 6;

/** MobileControlSettings stores viewport-relative placement so rotation and resizing remain stable. */
export interface MobileControlSettings {
  readonly joystickSize: number;
  readonly horizontalRatio: number;
  readonly verticalRatio: number;
  readonly joystickStrength: number;
  readonly cameraSwipeStrength: number;
  readonly cameraThumbstickEnabled: boolean;
}

// Defaults place a medium control comfortably above the hotbar near the lower-left thumb position.
export const DEFAULT_MOBILE_CONTROL_SETTINGS: MobileControlSettings = {
  joystickSize: 132,
  horizontalRatio: 0.19,
  verticalRatio: 0.28,
  joystickStrength: 1,
  cameraSwipeStrength: 1,
  cameraThumbstickEnabled: false,
};

/** Reports whether an unknown value is a finite number inside an inclusive preference boundary. */
function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/**
 * Validates placement and migrates strength fields omitted by earlier v1 preference snapshots.
 * Returns a complete settings object, or null when untrusted storage contains invalid values.
 */
function parseMobileControlSettings(value: unknown): MobileControlSettings | null {
  // Storage must contain a plain object before any property can be interpreted as a preference.
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<MobileControlSettings>;
  const joystickSize = candidate.joystickSize;
  const horizontalRatio = candidate.horizontalRatio;
  const verticalRatio = candidate.verticalRatio;
  const validPlacement =
    isBoundedNumber(joystickSize, MIN_JOYSTICK_SIZE, MAX_JOYSTICK_SIZE) &&
    isBoundedNumber(horizontalRatio, MIN_HORIZONTAL_RATIO, MAX_HORIZONTAL_RATIO) &&
    isBoundedNumber(verticalRatio, MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO);
  // Invalid legacy placement should never be forwarded into viewport CSS variables.
  if (!validPlacement) {
    return null;
  }

  // Missing strength fields identify the original v1 shape and migrate to neutral multipliers.
  const joystickStrength =
    candidate.joystickStrength === undefined
      ? DEFAULT_MOBILE_CONTROL_SETTINGS.joystickStrength
      : candidate.joystickStrength;
  const cameraSwipeStrength =
    candidate.cameraSwipeStrength === undefined
      ? DEFAULT_MOBILE_CONTROL_SETTINGS.cameraSwipeStrength
      : candidate.cameraSwipeStrength;
  const cameraThumbstickEnabled =
    candidate.cameraThumbstickEnabled === undefined
      ? DEFAULT_MOBILE_CONTROL_SETTINGS.cameraThumbstickEnabled
      : candidate.cameraThumbstickEnabled;
  const validStrength =
    isBoundedNumber(joystickStrength, MIN_JOYSTICK_STRENGTH, MAX_JOYSTICK_STRENGTH) &&
    isBoundedNumber(cameraSwipeStrength, MIN_CAMERA_SWIPE_STRENGTH, MAX_CAMERA_SWIPE_STRENGTH);
  // Explicit but out-of-range response values indicate corrupt or modified storage.
  if (!validStrength) {
    return null;
  }
  // Legacy snapshots omit the mode flag, while explicit non-Boolean values indicate invalid storage.
  if (typeof cameraThumbstickEnabled !== "boolean") {
    return null;
  }
  return {
    joystickSize,
    horizontalRatio,
    verticalRatio,
    joystickStrength,
    cameraSwipeStrength,
    cameraThumbstickEnabled,
  };
}

/** Loads validated preferences and falls back safely when storage is absent, corrupt, or blocked. */
export function loadMobileControlSettings(): MobileControlSettings {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (serialized === null) {
      return DEFAULT_MOBILE_CONTROL_SETTINGS;
    }
    const parsed: unknown = JSON.parse(serialized);
    const settings = parseMobileControlSettings(parsed);
    // Only a complete validated snapshot can leave the local-storage boundary.
    if (settings !== null) {
      return settings;
    }
    console.warn("[MobileSettings] Ignored invalid touch-control preferences.");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown storage error";
    console.error(`[MobileSettings] Preferences could not be loaded: ${message}`);
  }
  return DEFAULT_MOBILE_CONTROL_SETTINGS;
}

/** Saves one validated preference snapshot and reports whether browser storage accepted it. */
export function saveMobileControlSettings(settings: MobileControlSettings): boolean {
  // Reuse the storage parser so runtime callers cannot persist out-of-range values.
  if (parseMobileControlSettings(settings) === null) {
    console.error("[MobileSettings] Refused to save invalid touch-control preferences.");
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
