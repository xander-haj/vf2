/** Integrates content state, history, bridge operations, panels, and the production preview viewport. */

// Editor subsystems stay independent so bridge, preview, and form concerns can evolve separately.
import { EditorBehaviorPanel } from "./editor-behavior-panel";
import { EditorBlockAppearance } from "./editor-block-appearance";
import { EditorBlockBuilder } from "./editor-block-builder";
import { EditorCommandStack } from "./editor-command-stack";
import { EditorContentBrowser } from "./editor-content-browser";
import { EditorContentClient } from "./editor-content-client";
import { EditorEntityPanel } from "./editor-entity-panel";
import { EditorGuide } from "./editor-guide";
import { EditorInspector } from "./editor-inspector";
import { EditorState } from "./editor-state";
import { EditorTooltipManager } from "./editor-tooltip";
import { EditorValidationPanel } from "./editor-validation-panel";
import { EditorViewport } from "./editor-viewport";
import { EditorWorldgenPanel } from "./editor-worldgen-panel";

/** Retrieves one required shell element and fails before partial editor initialization can occur. */
function requiredElement<T extends Element>(selector: string, constructor: { new(): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) throw new Error(`Editor markup is missing ${selector}.`);
  return element;
}

/** Coordinates the local authoring session and never writes content except through the bridge client. */
export class EditorApp {
  private readonly state = new EditorState();
  private readonly commands = new EditorCommandStack(this.state);
  private readonly client = new EditorContentClient();
  private readonly guide = new EditorGuide(
    requiredElement("#editor-guide", HTMLButtonElement),
    requiredElement("#editor-guide-dialog", HTMLDialogElement),
    requiredElement("#editor-guide-close", HTMLButtonElement),
  );
  private readonly tooltips = new EditorTooltipManager(
    document,
    requiredElement("#editor-tooltip", HTMLElement),
  );
  private readonly browser: EditorContentBrowser;
  private readonly viewport: EditorViewport;
  private readonly context = requiredElement("#context-panel", HTMLElement);
  private readonly saveButton = requiredElement("#editor-save", HTMLButtonElement);
  private readonly undoButton = requiredElement("#editor-undo", HTMLButtonElement);
  private readonly redoButton = requiredElement("#editor-redo", HTMLButtonElement);
  private readonly revision = requiredElement("#editor-revision", HTMLElement);
  private readonly status = requiredElement("#editor-status", HTMLElement);
  private readonly worldgenPanel = new EditorWorldgenPanel();
  private readonly entityPanel = new EditorEntityPanel();
  private readonly behaviorPanel = new EditorBehaviorPanel();
  private readonly blockAppearance = new EditorBlockAppearance();
  private readonly blockBuilder = new EditorBlockBuilder();
  private validationTimer: number | undefined;
  private validationSequence = 0;
  private lastValidationSignature = "";
  private disposed = false;

  constructor() {
    this.browser = new EditorContentBrowser(
      requiredElement("#content-browser", HTMLElement),
      requiredElement("#content-count", HTMLElement),
      requiredElement("#content-search", HTMLInputElement),
      this.state,
    );
    new EditorInspector(
      requiredElement("#editor-inspector", HTMLFormElement),
      requiredElement("#inspector-title", HTMLElement),
      this.state,
      this.commands,
    );
    new EditorValidationPanel(
      requiredElement("#validation-panel", HTMLElement),
      requiredElement("#validation-tab", HTMLButtonElement),
      requiredElement("#changes-tab", HTMLButtonElement),
      requiredElement("#error-count", HTMLElement),
      requiredElement("#change-count", HTMLElement),
      this.state,
    );
    this.viewport = new EditorViewport(
      requiredElement("#editor-viewport", HTMLCanvasElement),
      requiredElement("#viewport-empty", HTMLElement),
      requiredElement("#viewport-title", HTMLElement),
      requiredElement("#viewport-help", HTMLElement),
      this.state,
    );
    this.bindActions();
    this.state.subscribe(() => this.render());
    this.commands.subscribe(() => this.render());
  }

  /** Loads the authoritative bridge snapshot and clears any history left from initialization. */
  async start(): Promise<void> {
    const snapshot = await this.client.load();
    if (this.disposed) return;
    this.state.load(snapshot);
    this.commands.clear();
    this.status.textContent = "Content loaded and validated.";
  }

  /** Stops pending validation and releases the editor's isolated WebGL resources. */
  dispose(): void {
    this.disposed = true;
    if (this.validationTimer !== undefined) window.clearTimeout(this.validationTimer);
    this.tooltips.dispose();
    this.guide.dispose();
    this.viewport.dispose();
  }

  /** Connects toolbar, keyboard, workspace, and unload interactions to reversible editor operations. */
  private bindActions(): void {
    this.undoButton.addEventListener("click", () => this.commands.undo());
    this.redoButton.addEventListener("click", () => this.commands.redo());
    this.saveButton.addEventListener("click", () => void this.save());
    requiredElement("#viewport-reset", HTMLButtonElement).addEventListener("click", () => this.viewport.resetView());
    for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-workspace]")) {
      tab.addEventListener("click", () => {
        const workspace = tab.dataset.workspace;
        if (workspace !== "content" && workspace !== "worldgen" && workspace !== "entities" &&
            workspace !== "behaviors") return;
        document.querySelectorAll("[data-workspace]").forEach((item) => item.classList.remove("active"));
        tab.classList.add("active");
        this.browser.setWorkspace(workspace);
      });
    }
    window.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!this.saveButton.disabled) void this.save();
      } else if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        this.commands.redo();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        this.commands.undo();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (!this.state.dirty) return;
      event.preventDefault();
    });
  }

  /** Refreshes command availability, revision state, contextual tools, and delayed validation. */
  private render(): void {
    this.saveButton.disabled = !this.state.dirty || this.state.hasErrors || this.state.saving ||
      this.state.validating;
    this.undoButton.disabled = !this.commands.canUndo;
    this.redoButton.disabled = !this.commands.canRedo;
    this.undoButton.title = this.commands.undoLabel ?? "Nothing to undo";
    this.redoButton.title = this.commands.redoLabel ?? "Nothing to redo";
    this.saveButton.title = this.state.hasErrors
      ? "Resolve validation errors before saving."
      : this.state.dirty
        ? "Validate, generate registries, and atomically save all content changes."
        : "Make a content change before saving.";
    this.revision.textContent = `Revision ${this.state.revision}${this.state.dirty ? " · modified" : ""}`;
    this.renderContextPanel();
    const signature = JSON.stringify(this.state.snapshot());
    if (this.state.dirty && !this.state.saving && !this.state.validating &&
        signature !== this.lastValidationSignature) this.scheduleValidation();
  }

  /** Selects the specialized panel that can safely augment the current definition type. */
  private renderContextPanel(): void {
    this.context.replaceChildren();
    this.blockBuilder.detach(this.viewport);
    const selection = this.state.selection;
    const value = this.state.selectedValue();
    if (selection === null || value === undefined) return;
    this.blockAppearance.render(this.context, selection, value, this.commands, this.state);
    this.blockBuilder.render(this.context, selection, value, this.commands, this.viewport);
    this.worldgenPanel.render(this.context, selection, value, this.commands, this.state, this.viewport);
    this.entityPanel.render(this.context, selection, value, this.commands, this.viewport);
    this.behaviorPanel.render(this.context, selection, value, this.commands, this.viewport, this.state);
  }

  /** Debounces full-snapshot compiler validation while the user is editing fields. */
  private scheduleValidation(): void {
    if (this.validationTimer !== undefined) window.clearTimeout(this.validationTimer);
    const sequence = ++this.validationSequence;
    this.validationTimer = window.setTimeout(() => void this.validate(sequence), 350);
  }

  /** Validates the captured snapshot and ignores responses superseded by newer edits. */
  private async validate(sequence: number): Promise<void> {
    const signature = JSON.stringify(this.state.snapshot());
    this.state.setActivity("validating", true);
    this.status.textContent = "Validating working content…";
    try {
      const result = await this.client.validate(this.state.snapshot());
      if (sequence !== this.validationSequence || this.disposed) return;
      this.lastValidationSignature = signature;
      this.state.setDiagnostics(result.diagnostics);
      const errors = result.diagnostics.filter((item) => item.severity === "error").length;
      this.status.textContent = errors === 0 ? "Working content is valid." : `${errors} validation errors.`;
    } catch (error: unknown) {
      this.lastValidationSignature = signature;
      this.status.textContent = error instanceof Error ? error.message : "Content validation failed.";
      console.error(`[VoxelFrontierEditor] Validation request failed at ${new Date().toISOString()}.`);
    } finally {
      if (sequence === this.validationSequence) this.state.setActivity("validating", false);
    }
  }

  /** Sends a revision-checked snapshot through validation, generation, and atomic source saving. */
  private async save(): Promise<void> {
    if (!this.state.dirty || this.state.hasErrors || this.state.saving) return;
    const changesGeneration = this.state.changedFiles().some((path) => path.startsWith("content/worldgen/"));
    let generationDecision: "migrate" | null = null;
    if (changesGeneration) {
      const confirmation = window.prompt(
        "World-generation changes alter untouched engine-v2 terrain for existing seeds. "
        + "Type MIGRATE to explicitly migrate engine-v2 worlds to this content revision.",
      );
      if (confirmation !== "MIGRATE") {
        this.status.textContent = "World-generation save cancelled; migration was not confirmed.";
        return;
      }
      generationDecision = "migrate";
    }
    if (this.validationTimer !== undefined) window.clearTimeout(this.validationTimer);
    this.validationSequence += 1;
    this.state.setActivity("saving", true);
    this.status.textContent = "Validating, generating, and saving content…";
    try {
      const result = await this.client.save(
        this.state.snapshot(),
        this.state.revision,
        this.state.hash,
        generationDecision,
      );
      this.state.acceptSave(result.revision, result.hash, result.diagnostics);
      this.commands.clear();
      this.status.textContent = `Saved ${result.writtenFiles.length} files atomically.`;
    } catch (error: unknown) {
      this.status.textContent = error instanceof Error ? error.message : "Content save failed.";
      console.error(`[VoxelFrontierEditor] Save transaction failed at ${new Date().toISOString()}.`);
    } finally {
      this.state.setActivity("saving", false);
    }
  }
}
