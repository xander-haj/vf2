/**
 * Normalizes browser keyboard, mouse, wheel, and pointer-lock events into frame-consumable input.
 * Event ownership is centralized so game systems never attach overlapping global listeners.
 */

import { TOUCH_LOOK_MULTIPLIER } from "../game/game-config";
import { MobileControls } from "../ui/mobile-controls";

/** A consumed mouse delta represents all pointer movement accumulated since the previous frame. */
export interface MouseDelta {
  readonly x: number;
  readonly y: number;
}

/** MovementInput provides device-independent forward and right intent with analog magnitude preserved. */
export interface MovementInput {
  readonly forward: number;
  readonly right: number;
}

/** InputController tracks continuous movement separately from one-shot gameplay actions. */
export class InputController {
  private readonly mobile: MobileControls;
  private readonly pressedKeys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private primaryQueued = false;
  private secondaryQueued = false;
  private requestedHotbarIndex: number | null = null;
  private hotbarDelta = 0;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onGameplayStateChange: () => void,
  ) {
    this.mobile = new MobileControls();
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("contextmenu", this.handleContextMenu);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
  }

  /** Records held keys and converts number-row presses into zero-based hotbar requests. */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressedKeys.add(event.code);
    const match = /^Digit([1-7])$/.exec(event.code);
    if (match !== null) {
      const digit = Number(match[1]);
      this.requestedHotbarIndex = digit - 1;
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
  };

  /** Removes released keys so continuous movement ends even when multiple keys overlap. */
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  /** Clears held state when the browser loses focus to prevent stuck movement on return. */
  private readonly handleBlur = (): void => {
    this.clearTransientState();
  };

  /** Accumulates relative pointer movement only while this game's canvas owns pointer lock. */
  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked()) {
      return;
    }
    this.mouseX += event.movementX;
    this.mouseY += event.movementY;
  };

  /** Queues exactly one break or place action for each locked mouse-button press. */
  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.isPointerLocked()) {
      return;
    }
    if (event.button === 0) {
      this.primaryQueued = true;
    } else if (event.button === 2) {
      this.secondaryQueued = true;
    }
  };

  /** Converts wheel movement into discrete hotbar steps and blocks page scrolling during play. */
  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.isPointerLocked()) {
      return;
    }
    event.preventDefault();
    this.hotbarDelta += Math.sign(event.deltaY);
  };

  /** Prevents the browser context menu because right click is reserved for block placement. */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (event.target === this.canvas || this.isPointerLocked()) {
      event.preventDefault();
    }
  };

  /** Drops movement and queued actions as soon as the pointer unlocks and gameplay pauses. */
  private readonly handlePointerLockChange = (): void => {
    if (!this.isPointerLocked()) {
      this.clearTransientState();
    }
    this.onGameplayStateChange();
  };

  /** Clears state that must never survive focus loss or a pause transition. */
  private clearTransientState(): void {
    this.pressedKeys.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.primaryQueued = false;
    this.secondaryQueued = false;
    this.hotbarDelta = 0;
    this.mobile.clearTransientState();
  }

  /** Enters touch gameplay directly or requests pointer lock for a desktop session. */
  public requestGameplay(): void {
    if (this.mobile.isEnabled()) {
      this.mobile.setActive(true);
      this.onGameplayStateChange();
      return;
    }
    try {
      const request = this.canvas.requestPointerLock();
      if (request instanceof Promise) {
        void request.catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Pointer lock was rejected";
          console.error(`[InputController] Could not capture the pointer: ${message}`);
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Pointer lock is unavailable";
      console.error(`[InputController] Could not capture the pointer: ${message}`);
    }
  }

  /** Releases desktop or touch capture so modal entity interaction can receive pointer input. */
  public releaseGameplay(): void {
    if (this.mobile.isEnabled()) {
      this.mobile.setActive(false);
      this.clearTransientState();
      this.onGameplayStateChange();
      return;
    }
    if (this.isPointerLocked()) {
      document.exitPointerLock();
    }
  }

  /** Reports whether the canvas currently receives relative mouse movement. */
  public isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Reports whether either the desktop pointer or explicit mobile session currently owns gameplay. */
  public isGameplayActive(): boolean {
    return this.isPointerLocked() || this.mobile.isActive();
  }

  /** Reports whether touch-specific controls and messaging should be presented on this device. */
  public isMobileEnabled(): boolean {
    return this.mobile.isEnabled();
  }

  /** Reports whether a continuous keyboard control is currently held. */
  public isKeyPressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  /** Combines keyboard and joystick axes, clamping hybrid input to the normal analog range. */
  public getMovementInput(): MovementInput {
    const mobile = this.mobile.getMovement();
    const forward = Number(this.isKeyPressed("KeyW")) - Number(this.isKeyPressed("KeyS")) + mobile.forward;
    const right = Number(this.isKeyPressed("KeyD")) - Number(this.isKeyPressed("KeyA")) + mobile.right;
    return {
      forward: Math.max(-1, Math.min(1, forward)),
      right: Math.max(-1, Math.min(1, right)),
    };
  }

  /** Reports held jump intent from either the keyboard or the captured mobile action button. */
  public isJumpPressed(): boolean {
    return this.isKeyPressed("Space") || this.mobile.isJumpPressed();
  }

  /** Reports held sprint intent from either Shift key or the independent mobile action button. */
  public isSprintPressed(): boolean {
    return (
      this.isKeyPressed("ShiftLeft") ||
      this.isKeyPressed("ShiftRight") ||
      this.mobile.isSprintPressed()
    );
  }

  /** Returns and resets accumulated pointer movement for one simulation frame. */
  public consumeMouseDelta(): MouseDelta {
    const mobileDelta = this.mobile.consumeLookDelta();
    const delta = {
      x: this.mouseX + mobileDelta.x * TOUCH_LOOK_MULTIPLIER,
      y: this.mouseY + mobileDelta.y * TOUCH_LOOK_MULTIPLIER,
    };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  /** Returns one queued breaking action and clears it to prevent unintended repeats. */
  public consumePrimaryAction(): boolean {
    const mobileQueued = this.mobile.consumePrimaryAction();
    const queued = this.primaryQueued || mobileQueued;
    this.primaryQueued = false;
    return queued;
  }

  /** Returns one queued placement action and clears it to prevent unintended repeats. */
  public consumeSecondaryAction(): boolean {
    const mobileQueued = this.mobile.consumeSecondaryAction();
    const queued = this.secondaryQueued || mobileQueued;
    this.secondaryQueued = false;
    return queued;
  }

  /** Returns an absolute number-key selection once, or null when no number was pressed. */
  public consumeHotbarIndex(): number | null {
    const index = this.requestedHotbarIndex;
    this.requestedHotbarIndex = null;
    return index;
  }

  /** Returns the net wheel direction since the last frame and clears the accumulator. */
  public consumeHotbarDelta(): number {
    const delta = Math.sign(this.hotbarDelta);
    this.hotbarDelta = 0;
    return delta;
  }

  /** Detaches all browser listeners so a disposed game cannot continue receiving input. */
  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("contextmenu", this.handleContextMenu);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.mobile.dispose();
  }
}
