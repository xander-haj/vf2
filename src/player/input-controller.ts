/**
 * Normalizes browser keyboard, mouse, wheel, and pointer-lock events into frame-consumable input.
 * Event ownership is centralized so game systems never attach overlapping global listeners.
 */

/** A consumed mouse delta represents all pointer movement accumulated since the previous frame. */
export interface MouseDelta {
  readonly x: number;
  readonly y: number;
}

/** InputController tracks continuous movement separately from one-shot gameplay actions. */
export class InputController {
  private readonly pressedKeys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private primaryQueued = false;
  private secondaryQueued = false;
  private requestedHotbarIndex: number | null = null;
  private hotbarDelta = 0;

  public constructor(private readonly canvas: HTMLCanvasElement) {
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
  };

  /** Clears state that must never survive focus loss or a pause transition. */
  private clearTransientState(): void {
    this.pressedKeys.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.primaryQueued = false;
    this.secondaryQueued = false;
    this.hotbarDelta = 0;
  }

  /** Requests pointer lock and reports a concise error if browser policy rejects it. */
  public requestPointerLock(): void {
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

  /** Reports whether the canvas currently receives relative mouse movement. */
  public isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Reports whether a continuous keyboard control is currently held. */
  public isKeyPressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  /** Returns and resets accumulated pointer movement for one simulation frame. */
  public consumeMouseDelta(): MouseDelta {
    const delta = { x: this.mouseX, y: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  /** Returns one queued breaking action and clears it to prevent unintended repeats. */
  public consumePrimaryAction(): boolean {
    const queued = this.primaryQueued;
    this.primaryQueued = false;
    return queued;
  }

  /** Returns one queued placement action and clears it to prevent unintended repeats. */
  public consumeSecondaryAction(): boolean {
    const queued = this.secondaryQueued;
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
  }
}

