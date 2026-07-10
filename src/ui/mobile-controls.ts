/**
 * Owns the touch-only joystick, camera surface, action buttons, fullscreen control, and settings panel.
 * It exposes frame-consumable state while preventing touch UI events from leaking into desktop mouse input.
 */

import { MobileControlsSettings } from "./mobile-controls-settings";

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

/** Clamps a normalized joystick coordinate to its allowed movement range. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
  private readonly joystick = requireElement<HTMLElement>("mobile-joystick");
  private readonly joystickKnob = requireElement<HTMLElement>("mobile-joystick-knob");
  private readonly lookZone = requireElement<HTMLElement>("mobile-look-zone");
  private readonly jumpButton = requireElement<HTMLButtonElement>("mobile-jump-button");
  private readonly placeButton = requireElement<HTMLButtonElement>("mobile-place-button");
  private readonly sprintButton = requireElement<HTMLButtonElement>("mobile-sprint-button");
  private readonly enabled = detectTouchLayout();
  private readonly settings = new MobileControlsSettings(this.root, () => this.clearTransientState());
  private active = false;
  private joystickPointerId: number | null = null;
  private lookPointerId: number | null = null;
  private jumpPointerId: number | null = null;
  private sprintPointerId: number | null = null;
  private joystickForward = 0;
  private joystickRight = 0;
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
    this.joystick.addEventListener("pointerdown", this.handleJoystickDown, { signal });
    this.joystick.addEventListener("pointermove", this.handleJoystickMove, { signal });
    this.joystick.addEventListener("pointerup", this.handleJoystickEnd, { signal });
    this.joystick.addEventListener("pointercancel", this.handleJoystickEnd, { signal });
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

  /** Captures the movement finger so the joystick remains responsive beyond its circular boundary. */
  private readonly handleJoystickDown = (event: PointerEvent): void => {
    if (!this.active || this.joystickPointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    this.joystickPointerId = event.pointerId;
    this.joystick.setPointerCapture(event.pointerId);
    this.updateJoystick(event);
  };

  /** Recomputes analog movement only for the finger that owns the joystick. */
  private readonly handleJoystickMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) return;
    event.preventDefault();
    this.updateJoystick(event);
  };

  /** Releases joystick ownership and returns movement to neutral on lift or cancellation. */
  private readonly handleJoystickEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) return;
    event.preventDefault();
    this.joystickPointerId = null;
    this.joystickForward = 0;
    this.joystickRight = 0;
    this.joystickKnob.style.transform = "translate(-50%, -50%)";
  };

  /** Converts a pointer coordinate into a circularly clamped joystick vector and visual knob offset. */
  private updateJoystick(event: PointerEvent): void {
    const bounds = this.joystick.getBoundingClientRect();
    const radius = bounds.width / 2;
    const knobRadius = this.joystickKnob.getBoundingClientRect().width / 2;
    const maximumDistance = Math.max(1, radius - knobRadius * 0.6);
    const rawX = event.clientX - (bounds.left + radius);
    const rawY = event.clientY - (bounds.top + radius);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maximumDistance ? maximumDistance / distance : 1;
    const offsetX = rawX * scale;
    const offsetY = rawY * scale;
    this.joystickRight = clamp(offsetX / maximumDistance, -1, 1);
    this.joystickForward = clamp(-offsetY / maximumDistance, -1, 1);
    this.joystickKnob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
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

  /** Returns the current analog joystick vector without consuming held movement. */
  public getMovement(): MobileMovement {
    return { forward: this.joystickForward, right: this.joystickRight };
  }

  /** Reports whether the captured jump control remains held. */
  public isJumpPressed(): boolean {
    return this.jumpPointerId !== null;
  }

  /** Reports whether the captured sprint control remains held. */
  public isSprintPressed(): boolean {
    return this.sprintPointerId !== null;
  }

  /** Returns and resets all camera movement accumulated since the previous frame. */
  public consumeLookDelta(): MobileLookDelta {
    const delta = { x: this.lookX, y: this.lookY };
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
    this.joystickPointerId = null;
    this.lookPointerId = null;
    this.jumpPointerId = null;
    this.sprintPointerId = null;
    this.joystickForward = 0;
    this.joystickRight = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.primaryQueued = false;
    this.secondaryQueued = false;
    this.joystickKnob.style.transform = "translate(-50%, -50%)";
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
