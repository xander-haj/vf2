/**
 * Owns joystick preference controls and the user-activated fullscreen button for the mobile interface.
 * Separating settings keeps pointer-heavy gameplay input below the project file-size ceiling.
 */

import {
  DEFAULT_MOBILE_CONTROL_SETTINGS,
  MAX_HORIZONTAL_RATIO,
  MAX_JOYSTICK_SIZE,
  MAX_VERTICAL_RATIO,
  MIN_HORIZONTAL_RATIO,
  MIN_JOYSTICK_SIZE,
  MIN_VERTICAL_RATIO,
  loadMobileControlSettings,
  saveMobileControlSettings,
  type MobileControlSettings,
} from "../storage/mobile-settings-storage";

/** Retrieves a required settings element and reports incomplete markup during initialization. */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required mobile settings element #${id} is missing.`);
  }
  return element as T;
}

/** Clamps a range-input value to the same boundary enforced by storage validation. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** MobileControlsSettings coordinates live preference previews, persistence, and fullscreen state. */
export class MobileControlsSettings {
  private readonly events = new AbortController();
  private readonly fullscreenButton = requireElement<HTMLButtonElement>("mobile-fullscreen-button");
  private readonly settingsButton = requireElement<HTMLButtonElement>("mobile-settings-button");
  private readonly settingsPanel = requireElement<HTMLElement>("mobile-settings-panel");
  private readonly settingsClose = requireElement<HTMLButtonElement>("mobile-settings-close");
  private readonly settingsReset = requireElement<HTMLButtonElement>("mobile-settings-reset");
  private readonly settingsStatus = requireElement<HTMLElement>("mobile-settings-status");
  private readonly sizeInput = requireElement<HTMLInputElement>("joystick-size-setting");
  private readonly horizontalInput = requireElement<HTMLInputElement>("joystick-horizontal-setting");
  private readonly verticalInput = requireElement<HTMLInputElement>("joystick-vertical-setting");

  public constructor(
    private readonly root: HTMLElement,
    private readonly onSettingsOpen: () => void,
  ) {
    this.applySettings(loadMobileControlSettings(), false);
    this.configureFullscreenAvailability();
    this.attachListeners();
  }

  /** Registers settings and fullscreen listeners under one abortable lifetime. */
  private attachListeners(): void {
    const signal = this.events.signal;
    this.fullscreenButton.addEventListener("click", this.handleFullscreen, { signal });
    document.addEventListener("fullscreenchange", this.handleFullscreenChange, { signal });
    this.settingsButton.addEventListener("click", this.openSettings, { signal });
    this.settingsClose.addEventListener("click", this.closeSettings, { signal });
    this.settingsReset.addEventListener("click", this.resetSettings, { signal });
    this.sizeInput.addEventListener("input", this.updateSettingsFromInputs, { signal });
    this.horizontalInput.addEventListener("input", this.updateSettingsFromInputs, { signal });
    this.verticalInput.addEventListener("input", this.updateSettingsFromInputs, { signal });
  }

  /** Opens the panel after asking gameplay input to release every captured control. */
  private readonly openSettings = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.onSettingsOpen();
    this.settingsPanel.classList.add("visible");
    this.settingsPanel.setAttribute("aria-hidden", "false");
    this.settingsClose.focus();
  };

  /** Closes settings without changing whether the surrounding mobile session remains active. */
  private readonly closeSettings = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.settingsPanel.classList.remove("visible");
    this.settingsPanel.setAttribute("aria-hidden", "true");
    this.settingsButton.focus();
  };

  /** Restores documented defaults, persists them, and updates the live joystick immediately. */
  private readonly resetSettings = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.applySettings(DEFAULT_MOBILE_CONTROL_SETTINGS, true);
  };

  /** Converts all range controls into one bounded settings snapshot and applies it live. */
  private readonly updateSettingsFromInputs = (): void => {
    const settings: MobileControlSettings = {
      joystickSize: clamp(Number(this.sizeInput.value), MIN_JOYSTICK_SIZE, MAX_JOYSTICK_SIZE),
      horizontalRatio: clamp(
        Number(this.horizontalInput.value),
        MIN_HORIZONTAL_RATIO,
        MAX_HORIZONTAL_RATIO,
      ),
      verticalRatio: clamp(Number(this.verticalInput.value), MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO),
    };
    this.applySettings(settings, true);
  };

  /** Synchronizes settings into range controls, CSS variables, and optional validated persistence. */
  private applySettings(settings: MobileControlSettings, persist: boolean): void {
    this.sizeInput.value = String(settings.joystickSize);
    this.horizontalInput.value = String(settings.horizontalRatio);
    this.verticalInput.value = String(settings.verticalRatio);
    this.root.style.setProperty("--joystick-size", `${settings.joystickSize}px`);
    this.root.style.setProperty("--joystick-left", `${settings.horizontalRatio * 100}vw`);
    this.root.style.setProperty("--joystick-bottom", `${settings.verticalRatio * 100}vh`);
    if (persist) {
      this.settingsStatus.textContent = saveMobileControlSettings(settings)
        ? "Settings saved on this device."
        : "Settings applied, but browser storage is unavailable.";
    }
  }

  /** Disables fullscreen interaction when the browser does not expose the standard capability. */
  private configureFullscreenAvailability(): void {
    const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
    this.fullscreenButton.disabled = !supported;
    this.fullscreenButton.title = supported
      ? "Enter fullscreen"
      : "Fullscreen is unavailable in this browser";
    this.handleFullscreenChange();
  }

  /** Toggles fullscreen directly from a user click and handles browser policy rejection explicitly. */
  private readonly handleFullscreen = async (event: MouseEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (document.fullscreenElement === null) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Fullscreen request was rejected";
      this.fullscreenButton.title = `Fullscreen unavailable: ${message}`;
      console.error(`[MobileControls] Fullscreen could not be changed: ${message}`);
    }
  };

  /** Mirrors browser fullscreen state into an accessible pressed state and concise button label. */
  private readonly handleFullscreenChange = (): void => {
    const fullscreen = document.fullscreenElement !== null;
    this.fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
    this.fullscreenButton.setAttribute("aria-label", fullscreen ? "Exit fullscreen" : "Enter fullscreen");
    this.fullscreenButton.classList.toggle("active", fullscreen);
  };

  /** Detaches all settings and fullscreen listeners during game disposal. */
  public dispose(): void {
    this.events.abort();
  }
}
