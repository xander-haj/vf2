/** Owns the accessible in-editor documentation dialog and returns focus to its toolbar trigger on close. */

/** EditorGuide binds one toolbar button to one native modal without coupling documentation to editor state. */
export class EditorGuide {
  public constructor(
    private readonly trigger: HTMLButtonElement,
    private readonly dialog: HTMLDialogElement,
    private readonly closeButton: HTMLButtonElement,
  ) {
    this.trigger.addEventListener("click", this.open);
    this.closeButton.addEventListener("click", this.close);
    this.dialog.addEventListener("click", this.closeFromBackdrop);
    this.dialog.addEventListener("close", this.restoreFocus);
  }

  /** Opens the modal guide once and lets the browser move focus inside the accessible dialog. */
  private readonly open = (): void => {
    if (!this.dialog.open) this.dialog.showModal();
  };

  /** Closes the modal through its native lifecycle so focus restoration runs consistently. */
  private readonly close = (): void => {
    if (this.dialog.open) this.dialog.close();
  };

  /** Treats only a click on the dialog backdrop itself as a close request, preserving clicks in the guide card. */
  private readonly closeFromBackdrop = (event: MouseEvent): void => {
    if (event.target === this.dialog) this.close();
  };

  /** Returns keyboard focus to the Guide button after button, backdrop, or Escape-key dismissal. */
  private readonly restoreFocus = (): void => {
    this.trigger.focus();
  };

  /** Removes all owned listeners and closes the dialog during application teardown. */
  public dispose(): void {
    this.trigger.removeEventListener("click", this.open);
    this.closeButton.removeEventListener("click", this.close);
    this.dialog.removeEventListener("click", this.closeFromBackdrop);
    this.dialog.removeEventListener("close", this.restoreFocus);
    this.close();
  }
}
