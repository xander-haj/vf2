/** Presents delegated, keyboard-accessible tooltips for static and dynamically generated editor controls. */

/** EditorTooltipManager owns one tooltip surface and discovers described controls through event delegation. */
export class EditorTooltipManager {
  private active: HTMLElement | null = null;
  private previousDescription: string | null = null;

  public constructor(
    private readonly documentRoot: Document,
    private readonly tooltip: HTMLElement,
  ) {
    documentRoot.addEventListener("mouseover", this.handleMouseOver);
    documentRoot.addEventListener("mouseout", this.handleMouseOut);
    documentRoot.addEventListener("focusin", this.handleFocusIn);
    documentRoot.addEventListener("focusout", this.handleFocusOut);
    documentRoot.addEventListener("scroll", this.reposition, true);
    window.addEventListener("resize", this.reposition);
  }

  /** Resolves the nearest described HTML control from a delegated event target. */
  private findTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>("[title], [data-editor-tooltip]");
    return element instanceof HTMLElement ? element : null;
  }

  /** Promotes a native title to persistent tooltip data so custom and native bubbles never overlap. */
  private readText(target: HTMLElement): string | null {
    const currentTitle = target.getAttribute("title");
    if (currentTitle !== null && currentTitle.trim().length > 0) {
      target.dataset.editorTooltip = currentTitle;
      target.removeAttribute("title");
    }
    const text = target.dataset.editorTooltip?.trim();
    return text === undefined || text.length === 0 ? null : text;
  }

  /** Opens or updates the shared tooltip and connects it to the active control for assistive technology. */
  private show(target: HTMLElement): void {
    const text = this.readText(target);
    if (text === null) return;
    if (this.active === target) {
      this.tooltip.textContent = text;
      this.reposition();
      return;
    }
    this.hide();
    this.active = target;
    this.previousDescription = target.getAttribute("aria-describedby");
    const descriptions = [this.previousDescription, this.tooltip.id].filter(Boolean).join(" ");
    target.setAttribute("aria-describedby", descriptions);
    this.tooltip.textContent = text;
    this.tooltip.hidden = false;
    this.reposition();
  }

  /** Positions the tooltip below its control, or above it when the viewport has insufficient lower space. */
  private readonly reposition = (): void => {
    if (this.active === null || this.tooltip.hidden) return;
    const anchor = this.active.getBoundingClientRect();
    const bubble = this.tooltip.getBoundingClientRect();
    const desiredLeft = anchor.left + anchor.width / 2 - bubble.width / 2;
    const left = Math.min(window.innerWidth - bubble.width - 8, Math.max(8, desiredLeft));
    const below = anchor.bottom + 8;
    const top = below + bubble.height <= window.innerHeight - 8
      ? below
      : Math.max(8, anchor.top - bubble.height - 8);
    this.tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  /** Hides the shared tooltip and restores the control's pre-existing accessible description. */
  private hide(): void {
    if (this.active !== null) {
      if (this.previousDescription === null) this.active.removeAttribute("aria-describedby");
      else this.active.setAttribute("aria-describedby", this.previousDescription);
    }
    this.active = null;
    this.previousDescription = null;
    this.tooltip.hidden = true;
    this.tooltip.textContent = "";
  }

  /** Shows help when a pointing device first enters a described control. */
  private readonly handleMouseOver = (event: MouseEvent): void => {
    const target = this.findTarget(event.target);
    if (target !== null) this.show(target);
  };

  /** Keeps child transitions inside one control open and hides help only after leaving the complete control. */
  private readonly handleMouseOut = (event: MouseEvent): void => {
    if (this.active === null) return;
    const related = event.relatedTarget;
    if (related instanceof Node && this.active.contains(related)) return;
    if (this.findTarget(event.target) === this.active) this.hide();
  };

  /** Shows the same contextual help for keyboard focus that pointer users receive on hover. */
  private readonly handleFocusIn = (event: FocusEvent): void => {
    const target = this.findTarget(event.target);
    if (target !== null) this.show(target);
  };

  /** Removes help when keyboard focus leaves the active described control. */
  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (this.findTarget(event.target) === this.active) this.hide();
  };

  /** Detaches delegated listeners and clears accessible state during editor teardown. */
  public dispose(): void {
    this.documentRoot.removeEventListener("mouseover", this.handleMouseOver);
    this.documentRoot.removeEventListener("mouseout", this.handleMouseOut);
    this.documentRoot.removeEventListener("focusin", this.handleFocusIn);
    this.documentRoot.removeEventListener("focusout", this.handleFocusOut);
    this.documentRoot.removeEventListener("scroll", this.reposition, true);
    window.removeEventListener("resize", this.reposition);
    this.hide();
  }
}
