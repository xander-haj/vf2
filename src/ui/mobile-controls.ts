/**
 * Owns the touch-only joystick, camera surface, action buttons, fullscreen control, and settings panel.
 * It exposes frame-consumable state while preventing touch UI events from leaking into desktop mouse input.
 */

import { MobileControlsSettings } from "./mobile-controls-settings";
import { MobileThumbstick } from "./mobile-thumbstick";

// Full camera-stick travel produces a comfortable base turn speed before the user strength multiplier is applied.
const CAMERA_THUMBSTICK_PIXELS_PER_SECOND = 900;

/** MobileMovement represents analog view-relative intent in the inclusive range from minus one to one. */
export interface MobileMovement {
  readonly forward: number;
  readonly right: number;
}

/** MobileLookDelta contains all camera drag movement accumulated since the previous simulation frame. */
export interface MobileLookDelta {
  readonly x: number;
  readonly y: number;
}

/** Retrieves a required mobile interface element and reports incomplete markup during initialization. */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required mobile interface element #${id} is missing.`);
  }
  return element as T;
}

/** Detects a touch-oriented layout without brittle user-agent matching. */
function detectTouchLayout(): boolean {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const compactTouchScreen = navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 1024;
  return coarsePointer || compactTouchScreen;
}

/** MobileControls translates simultaneous Pointer Events into movement and one-shot gameplay actions. */
export class MobileControls {
  private readonly events = new AbortController();
  private readonly root = requireElement<HTMLElement>("mobile-controls");
  private readonly lookZone = requireElement<HTMLElement>("mobile-look-zone");
  private readonly jumpButton = requireElement<HTMLButtonElement>("mobile-jump-button");
  private readonly placeButton = requireElement<HTMLButtonElement>("mobile-place-button");
  private readonly sprintButton = requireElement<HTMLButtonElement>("mobile-sprint-button");
  private readonly enabled = detectTouchLayout();
  private readonly settings = new MobileControlsSettings(this.root, () => this.clearTransientState());
  private readonly movementThumbstick = new MobileThumbstick(
    "mobile-joystick",
    "mobile-joystick-knob",
    () => this.active,
    this.events.signal,
  );
  private readonly cameraThumbstick = new MobileThumbstick(
    "mobile-camera-joystick",
    "mobile-camera-joystick-knob",
    () => this.active && this.settings.isCameraThumbstickEnabled(),
    this.events.signal,
  );
  private active = false;
  private lookPointerId: number | null = null;
  private jumpPointerId: number | null = null;
  private sprintPointerId: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private lookLastX = 0;
  private lookLastY = 0;
  private lookStartX = 0;
  private lookStartY = 0;
  private lookStartTime = 0;
  private primaryQueued = false;
  private secondaryQueued = false;

  public constructor() {
    document.documentElement.classList.toggle("mobile-controls-enabled", this.enabled);
    this.root.setAttribute("aria-hidden", String(!this.enabled));
    this.attachListeners();
  }

  /** Registers all Pointer Event and button listeners under one abortable lifetime. */
  private attachListeners(): void {
    const signal = this.events.signal;
    this.lookZone.addEventListener("pointerdown", this.handleLookDown, { signal });
    this.lookZone.addEventListener("pointermove", this.handleLookMove, { signal });
    this.lookZone.addEventListener("pointerup", this.handleLookEnd, { signal });
    this.lookZone.addEventListener("pointercancel", this.handleLookEnd, { signal });
    this.jumpButton.addEventListener("pointerdown", this.handleJumpDown, { signal });
    this.jumpButton.addEventListener("pointerup", this.handleJumpEnd, { signal });
    this.jumpButton.addEventListener("pointercancel", this.handleJumpEnd, { signal });
    this.sprintButton.addEventListener("pointerdown", this.handleSprintDown, { signal });
    this.sprintButton.addEventListener("pointerup", this.handleSprintEnd, { signal });
    this.sprintButton.addEventListener("pointercancel", this.handleSprintEnd, { signal });
    this.placeButton.addEventListener("pointerdown", this.handlePlace, { signal });
    window.addEventListener("blur", this.handleWindowBlur, { signal });
  }

  /** Starts one camera gesture and records its origin so a stationary quick tap can break a block. */
  private readonly handleLookDown = (event: PointerEvent): void => {
    if (!this.active || this.lookPointerId !== null) return;
    event.preventDefault();
    this.lookPointerId = event.pointerId;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
    this.lookStartX = event.clientX;
    this.lookStartY = event.clientY;
    this.lookStartTime = performance.now();
    this.lookZone.setPointerCapture(event.pointerId);
  };

  /** Accumulates camera motion for the active look finger without affecting simultaneous action pointers. */
  private readonly handleLookMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) return;
    event.preventDefault();
    this.lookX += event.clientX - this.lookLastX;
    this.lookY += event.clientY - this.lookLastY;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
  };

  /** Ends camera ownership and maps only a short, unmoved gesture to the desktop primary action. */
  private readonly handleLookEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) return;
    event.preventDefault();
    const movement = Math.hypot(event.clientX - this.lookStartX, event.clientY - this.lookStartY);
    const duration = performance.now() - this.lookStartTime;
    if (event.type === "pointerup" && movement <= 12 && duration <= 350) {
      this.primaryQueued = true;
    }
    this.lookPointerId = null;
  };

  /** Holds jump for the owning pointer so the existing grounded gate controls when an impulse occurs. */
  private readonly handleJumpDown = (event: PointerEvent): void => {
    if (!this.active || this.jumpPointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    this.jumpPointerId = event.pointerId;
    this.jumpButton.setPointerCapture(event.pointerId);
    this.jumpButton.classList.add("pressed");
  };

  /** Clears jump only when the pointer that started it is released or cancelled. */
  private readonly handleJumpEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.jumpPointerId) return;
    event.preventDefault();
    this.jumpPointerId = null;
    this.jumpButton.classList.remove("pressed");
  };

  /** Holds sprint independently so movement and camera fingers can remain active at the same time. */
  private readonly handleSprintDown = (event: PointerEvent): void => {
    if (!this.active || this.sprintPointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    this.sprintPointerId = event.pointerId;
    this.sprintButton.setPointerCapture(event.pointerId);
    this.sprintButton.classList.add("pressed");
  };

  /** Clears sprint only for its captured pointer, including browser gesture cancellation. */
  private readonly handleSprintEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.sprintPointerId) return;
    event.preventDefault();
    this.sprintPointerId = null;
    this.sprintButton.classList.remove("pressed");
  };

  /** Queues one placement without relying on a synthetic right-click that touch browsers cannot produce. */
  private readonly handlePlace = (event: PointerEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    event.stopPropagation();
    this.secondaryQueued = true;
    this.placeButton.classList.add("pressed");
    window.setTimeout(this.clearPlaceFeedback, 100);
  };

  /** Removes short placement feedback after the queued action has been visually acknowledged. */
  private readonly clearPlaceFeedback = (): void => {
    this.placeButton.classList.remove("pressed");
  };

  /** Neutralizes held controls when browser focus changes so movement cannot become stuck. */
  private readonly handleWindowBlur = (): void => {
    this.clearTransientState();
  };

  /** Reports whether this device should use touch gameplay rather than desktop pointer lock. */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /** Shows or hides gameplay controls while retaining the top-level fullscreen entry point. */
  public setActive(active: boolean): void {
    if (!this.enabled) return;
    this.active = active;
    this.root.classList.toggle("active", active);
    if (!active) this.clearTransientState();
  }

  /** Reports whether mobile gameplay currently advances simulation. */
  public isActive(): boolean {
    return this.enabled && this.active;
  }

  /** Returns held movement scaled by the live joystick response setting and clamped to valid axes. */
  public getMovement(): MobileMovement {
    const strength = this.settings.getJoystickStrength();
    const movement = this.movementThumbstick.getVector();
    const magnitude = Math.hypot(movement.forward, movement.right);
    // A neutral stick cannot be normalized, and should remain exactly neutral regardless of strength.
    if (magnitude === 0) {
      return { forward: 0, right: 0 };
    }
    // Radial scaling preserves direction while higher strengths reach full movement with less thumb travel.
    const scaledMagnitude = Math.min(1, magnitude * strength);
    const scale = scaledMagnitude / magnitude;
    return {
      forward: movement.forward * scale,
      right: movement.right * scale,
    };
  }

  /** Reports whether the captured jump control remains held. */
  public isJumpPressed(): boolean {
    return this.jumpPointerId !== null;
  }

  /** Reports whether the captured sprint control remains held. */
  public isSprintPressed(): boolean {
    return this.sprintPointerId !== null;
  }

  /**
   * Combines swipe and frame-rate-independent camera-stick motion for one frame, then consumes swipe movement.
   * The deltaSeconds parameter is clamped after long stalls so a held stick cannot cause a disorienting jump.
   */
  public consumeLookDelta(deltaSeconds: number): MobileLookDelta {
    const strength = this.settings.getCameraStrength();
    const camera = this.settings.isCameraThumbstickEnabled()
      ? this.cameraThumbstick.getVector()
      : { forward: 0, right: 0 };
    const frameSeconds = Number.isFinite(deltaSeconds)
      ? Math.max(0, Math.min(0.1, deltaSeconds))
      : 0;
    const continuousDistance = CAMERA_THUMBSTICK_PIXELS_PER_SECOND * frameSeconds;
    const delta = {
      x: (this.lookX + camera.right * continuousDistance) * strength,
      y: (this.lookY - camera.forward * continuousDistance) * strength,
    };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  /** Returns one queued tap-to-break action and clears it to prevent delayed edits. */
  public consumePrimaryAction(): boolean {
    const queued = this.primaryQueued;
    this.primaryQueued = false;
    return queued;
  }

  /** Returns one queued placement-button action and clears it to prevent repeats. */
  public consumeSecondaryAction(): boolean {
    const queued = this.secondaryQueued;
    this.secondaryQueued = false;
    return queued;
  }

  /** Clears every held and queued touch state at pause, focus loss, or settings entry. */
  public clearTransientState(): void {
    this.movementThumbstick.clear();
    this.cameraThumbstick.clear();
    this.lookPointerId = null;
    this.jumpPointerId = null;
    this.sprintPointerId = null;
    this.lookX = 0;
    this.lookY = 0;
    this.primaryQueued = false;
    this.secondaryQueued = false;
    this.jumpButton.classList.remove("pressed");
    this.sprintButton.classList.remove("pressed");
  }

  /** Detaches all listeners and removes capability classes during game disposal. */
  public dispose(): void {
    this.events.abort();
    this.settings.dispose();
    this.clearTransientState();
    document.documentElement.classList.remove("mobile-controls-enabled");
  }
}
