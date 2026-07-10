/**
 * Owns pointer capture, circular clamping, and visual feedback for one reusable mobile thumbstick.
 * Movement and camera controls share this input primitive while interpreting its normalized vector independently.
 */

/** MobileThumbstickVector describes a direction inside the normalized unit circle. */
export interface MobileThumbstickVector {
  readonly forward: number;
  readonly right: number;
}

/** Retrieves required thumbstick markup and reports incomplete mobile UI initialization. */
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required mobile thumbstick element #${id} is missing.`);
  }
  return element;
}

/** Clamps a normalized axis so floating-point edge cases cannot escape the public input contract. */
function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** MobileThumbstick converts one captured pointer into a held direction and matching knob position. */
export class MobileThumbstick {
  private readonly element: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private forward = 0;
  private right = 0;

  public constructor(
    elementId: string,
    knobId: string,
    private readonly isAvailable: () => boolean,
    signal: AbortSignal,
  ) {
    this.element = requireElement(elementId);
    this.knob = requireElement(knobId);
    this.element.addEventListener("pointerdown", this.handleDown, { signal });
    this.element.addEventListener("pointermove", this.handleMove, { signal });
    this.element.addEventListener("pointerup", this.handleEnd, { signal });
    this.element.addEventListener("pointercancel", this.handleEnd, { signal });
  }

  /** Captures an available pointer and immediately updates direction from its local position. */
  private readonly handleDown = (event: PointerEvent): void => {
    if (!this.isAvailable() || this.pointerId !== null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.pointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    this.update(event);
  };

  /** Updates direction only for the pointer that currently owns this thumbstick. */
  private readonly handleMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.update(event);
  };

  /** Releases pointer ownership and returns both input and visual feedback to neutral. */
  private readonly handleEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.clear();
  };

  /** Maps a pointer coordinate into the thumbstick's circular travel area and moves its knob. */
  private update(event: PointerEvent): void {
    const bounds = this.element.getBoundingClientRect();
    const radius = bounds.width / 2;
    const knobRadius = this.knob.getBoundingClientRect().width / 2;
    const maximumDistance = Math.max(1, radius - knobRadius * 0.6);
    const rawX = event.clientX - (bounds.left + radius);
    const rawY = event.clientY - (bounds.top + radius);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maximumDistance ? maximumDistance / distance : 1;
    const offsetX = rawX * scale;
    const offsetY = rawY * scale;
    this.right = clampAxis(offsetX / maximumDistance);
    this.forward = clampAxis(-offsetY / maximumDistance);
    this.knob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
  }

  /** Returns the held normalized vector without consuming it so continuous controls remain active. */
  public getVector(): MobileThumbstickVector {
    return { forward: this.forward, right: this.right };
  }

  /** Clears captured ownership and restores the centered visual state during pause or focus loss. */
  public clear(): void {
    this.pointerId = null;
    this.forward = 0;
    this.right = 0;
    this.knob.style.transform = "translate(-50%, -50%)";
  }
}
