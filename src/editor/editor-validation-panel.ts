/** Displays compiler diagnostics and the exact canonical files changed by the working snapshot. */

import type { EditorState } from "./editor-state";

export class EditorValidationPanel {
  private mode: "validation" | "changes" = "validation";

  constructor(
    private readonly container: HTMLElement,
    private readonly validationTab: HTMLButtonElement,
    private readonly changesTab: HTMLButtonElement,
    private readonly errorCount: HTMLElement,
    private readonly changeCount: HTMLElement,
    private readonly state: EditorState,
  ) {
    this.validationTab.addEventListener("click", () => this.setMode("validation"));
    this.changesTab.addEventListener("click", () => this.setMode("changes"));
    this.state.subscribe(() => this.render());
  }

  /** Renders either compiler diagnostics or field-level semantic changes from the current snapshot. */
  render(): void {
    const errors = this.state.diagnostics.filter((item) => item.severity === "error").length;
    const changes = this.state.changeDetails();
    this.errorCount.textContent = String(errors);
    this.changeCount.textContent = String(changes.length);
    this.container.replaceChildren();
    if (this.mode === "changes") {
      if (changes.length === 0) return this.showEmpty("The working snapshot matches the saved content.");
      for (const change of changes) {
        const row = document.createElement("div");
        row.className = "change-entry";
        const status = document.createElement("strong");
        status.textContent = "Modified";
        const label = document.createElement("span");
        label.textContent = `${change.file}${change.pointer || "/"}`;
        const values = document.createElement("span");
        values.textContent = `${change.before} → ${change.after}`;
        row.append(status, label, values);
        this.container.append(row);
      }
      return;
    }
    if (this.state.diagnostics.length === 0) return this.showEmpty("No content validation issues.");
    for (const diagnostic of this.state.diagnostics) {
      const row = document.createElement("div");
      row.className = `diagnostic diagnostic-${diagnostic.severity}`;
      const severity = document.createElement("strong");
      severity.textContent = diagnostic.severity;
      const message = document.createElement("span");
      message.textContent = `[${diagnostic.code}] ${diagnostic.message}`;
      const path = document.createElement("span");
      path.className = "diagnostic-path";
      path.textContent = `${diagnostic.path ?? "project"}${diagnostic.pointer ?? ""}`;
      row.append(severity, message, path);
      this.container.append(row);
    }
  }

  /** Switches bottom-panel mode while retaining diagnostics and change information in state. */
  private setMode(mode: "validation" | "changes"): void {
    this.mode = mode;
    this.validationTab.classList.toggle("active", mode === "validation");
    this.changesTab.classList.toggle("active", mode === "changes");
    this.render();
  }

  /** Shows an explicit empty state so a blank panel is never mistaken for a loading failure. */
  private showEmpty(message: string): void {
    const empty = document.createElement("p");
    empty.className = "validation-empty";
    empty.textContent = message;
    this.container.append(empty);
  }
}
