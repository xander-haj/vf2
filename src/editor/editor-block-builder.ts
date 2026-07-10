/** Presents a Gummi-inspired, mouse-first block construction surface for procedural entity models. */

import type { EditorCommandStack } from "./editor-command-stack";
import {
  addBuilderPart,
  addBuilderPartAt,
  BUILDER_COLORS,
  BUILDER_GRID_STEP,
  BUILDER_SHAPES,
  deleteBuilderPart,
  duplicateBuilderPart,
  isProceduralBuilderAsset,
  moveBuilderPart,
  paintBuilderPart,
  readBuilderParts,
  rotateBuilderPart,
} from "./editor-block-builder-model";
import type { EditorSelection, JsonObject, JsonValue } from "./editor-state";
import type { EditorViewport } from "./editor-viewport";
import type { AssetBuilderPick } from "./editor-viewport-builder";

/** EditorBlockBuilder retains simple tool choices while all model mutations remain reversible commands. */
export class EditorBlockBuilder {
  private readonly selectedParts = new Map<string, number>();
  private shapeId = BUILDER_SHAPES[0]?.id ?? "cube";
  private color = BUILDER_COLORS[0] ?? "#5f8fc2";
  private layer = 0;

  /** Removes asset-specific picking when the current selection is not a buildable procedural model. */
  public detach(viewport: EditorViewport): void {
    viewport.setAssetBuilderInteraction(null, 0);
    viewport.setAssetPartSelection(null);
  }

  /** Renders the piece tray, palette, direct viewport placement, part selection, movement, and deletion tools. */
  public render(
    container: HTMLElement,
    selection: EditorSelection,
    value: JsonValue,
    commands: EditorCommandStack,
    viewport: EditorViewport,
  ): boolean {
    if (selection.kind !== "asset") return false;
    if (!isProceduralBuilderAsset(value)) {
      this.renderExternalAsset(container, viewport);
      return true;
    }
    const assetId = typeof value.id === "string" ? value.id : `${selection.file}${selection.pointer}`;
    const parts = readBuilderParts(value);
    const selectedIndex = Math.min(this.selectedParts.get(assetId) ?? 0, Math.max(0, parts.length - 1));
    this.selectedParts.set(assetId, selectedIndex);
    viewport.setAssetPartSelection(selectedIndex);

    const card = document.createElement("section");
    card.className = "context-card block-builder-card";
    const heading = document.createElement("div");
    heading.className = "builder-heading";
    const title = document.createElement("h3");
    title.textContent = "Build this model";
    const count = document.createElement("span");
    count.textContent = `${parts.length} pieces`;
    heading.append(title, count);
    const hint = document.createElement("p");
    hint.className = "builder-hint";
    hint.textContent = "Pick a shape, then click an empty spot in the picture. Click a piece to select it.";

    const status = document.createElement("p");
    status.className = "builder-status";
    status.setAttribute("role", "status");
    const updateStatus = (message: string): void => { status.textContent = message; };
    const handlePick = (pick: AssetBuilderPick): void => {
      if (pick.partIndex !== null) {
        this.selectPart(assetId, pick.partIndex, card, viewport, status);
        return;
      }
      if (pick.point === null) return;
      if (parts.length >= 64) {
        updateStatus("This model already has the maximum of 64 pieces.");
        return;
      }
      const shape = BUILDER_SHAPES.find((item) => item.id === this.shapeId) ?? BUILDER_SHAPES[0];
      if (shape === undefined) return;
      const next = addBuilderPartAt(value, shape, this.color, pick.point);
      if (next === value) {
        updateStatus("That space is full. Click another empty spot.");
        return;
      }
      this.selectedParts.set(assetId, parts.length);
      commands.execute(selection.file, selection.pointer, next, `Place ${shape.label.toLowerCase()} piece`);
    };
    viewport.setAssetBuilderInteraction(handlePick, this.layer);

    card.append(heading, hint);
    card.append(this.createShapeTray());
    card.append(this.createPalette());
    card.append(this.createLayerControls(viewport, handlePick));
    card.append(this.createAddButton(value, selection, assetId, commands));
    card.append(this.createPartTray(parts, assetId, selectedIndex, viewport, status));
    card.append(this.createSelectedControls(value, selection, assetId, selectedIndex, commands, status));
    const selectedPart = parts[selectedIndex];
    status.textContent = selectedPart === undefined
      ? "Choose a shape and add the first piece."
      : `Selected ${selectedPart.name}.`;
    card.append(status);
    container.append(card);
    return true;
  }

  /** Explains that local GLB assets render but are edited in their source modeling application. */
  private renderExternalAsset(container: HTMLElement, viewport: EditorViewport): void {
    this.detach(viewport);
    const card = document.createElement("section");
    card.className = "context-card block-builder-card";
    const title = document.createElement("h3");
    title.textContent = "Linked 3D model";
    const text = document.createElement("p");
    text.textContent = "This object previews here, but its GLB geometry is edited in the original modeling file.";
    card.append(title, text);
    container.append(card);
  }

  /** Creates large shape choices that determine the next placed cuboid. */
  private createShapeTray(): HTMLElement {
    const section = document.createElement("section");
    section.className = "builder-section";
    const label = document.createElement("h4");
    label.textContent = "1. Pick a shape";
    const tray = document.createElement("div");
    tray.className = "builder-shape-tray";
    for (const shape of BUILDER_SHAPES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "builder-shape";
      button.classList.toggle("active", shape.id === this.shapeId);
      button.setAttribute("aria-pressed", String(shape.id === this.shapeId));
      button.title = `Use a ${shape.label.toLowerCase()} piece for the next placement.`;
      const shapeIcon = document.createElement("span");
      shapeIcon.className = `builder-shape-icon builder-shape-${shape.id}`;
      const text = document.createElement("span");
      text.textContent = shape.label;
      button.append(shapeIcon, text);
      button.addEventListener("click", () => {
        this.shapeId = shape.id;
        tray.querySelectorAll("button").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
      });
      tray.append(button);
    }
    section.append(label, tray);
    return section;
  }

  /** Creates a friendly color palette used by new pieces and the explicit paint action. */
  private createPalette(): HTMLElement {
    const section = document.createElement("section");
    section.className = "builder-section";
    const label = document.createElement("h4");
    label.textContent = "2. Pick a color";
    const palette = document.createElement("div");
    palette.className = "builder-palette";
    for (const color of BUILDER_COLORS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "builder-color";
      button.style.setProperty("--piece-color", color);
      button.classList.toggle("active", color === this.color);
      button.setAttribute("aria-label", `Use color ${color}`);
      button.setAttribute("aria-pressed", String(color === this.color));
      button.title = `Use ${color} for new pieces or Paint selected.`;
      button.addEventListener("click", () => {
        this.color = color;
        palette.querySelectorAll("button").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
      });
      palette.append(button);
    }
    section.append(label, palette);
    return section;
  }

  /** Creates layer buttons for placing blocks above or below the current construction plane. */
  private createLayerControls(
    viewport: EditorViewport,
    handler: (pick: AssetBuilderPick) => void,
  ): HTMLElement {
    const controls = document.createElement("div");
    controls.className = "builder-layer-controls";
    const down = this.actionButton("−", "Move the placement layer down.");
    const up = this.actionButton("+", "Move the placement layer up.");
    const value = document.createElement("strong");
    const update = (): void => {
      value.textContent = `Layer ${Math.round(this.layer / BUILDER_GRID_STEP)}`;
      down.disabled = this.layer <= 0;
      up.disabled = this.layer >= 6;
      viewport.setAssetBuilderInteraction(handler, this.layer);
    };
    down.addEventListener("click", () => { this.layer = Math.max(0, this.layer - BUILDER_GRID_STEP); update(); });
    up.addEventListener("click", () => { this.layer = Math.min(6, this.layer + BUILDER_GRID_STEP); update(); });
    controls.append(down, value, up);
    update();
    return controls;
  }

  /** Adds the selected piece automatically for users who prefer buttons over clicking the 3D grid. */
  private createAddButton(
    value: JsonObject,
    selection: EditorSelection,
    assetId: string,
    commands: EditorCommandStack,
  ): HTMLButtonElement {
    const button = this.actionButton("Add piece", "Place the selected shape in the first open grid space.");
    button.classList.add("builder-add");
    button.disabled = readBuilderParts(value).length >= 64;
    button.addEventListener("click", () => {
      const shape = BUILDER_SHAPES.find((item) => item.id === this.shapeId) ?? BUILDER_SHAPES[0];
      if (shape === undefined) return;
      const parts = readBuilderParts(value);
      this.selectedParts.set(assetId, parts.length);
      commands.execute(
        selection.file,
        selection.pointer,
        addBuilderPart(value, shape, this.color, this.layer),
        `Add ${shape.label.toLowerCase()} piece`,
      );
    });
    return button;
  }

  /** Creates large selectable part chips synchronized with direct clicks in the production viewport. */
  private createPartTray(
    parts: readonly { readonly name: string; readonly color: string }[],
    assetId: string,
    selectedIndex: number,
    viewport: EditorViewport,
    status: HTMLElement,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "builder-section";
    const label = document.createElement("h4");
    label.textContent = "3. Pick a piece to change";
    const tray = document.createElement("div");
    tray.className = "builder-part-tray";
    parts.forEach((part, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "builder-part-button";
      button.dataset.partIndex = String(index);
      button.classList.toggle("active", index === selectedIndex);
      button.setAttribute("aria-pressed", String(index === selectedIndex));
      button.title = `Select ${part.name} in the model.`;
      const cube = document.createElement("span");
      cube.style.setProperty("--piece-color", part.color);
      const text = document.createElement("span");
      text.textContent = part.name.replaceAll("_", " ");
      button.append(cube, text);
      button.addEventListener("click", () => this.selectPart(assetId, index, section, viewport, status));
      tray.append(button);
    });
    section.append(label, tray);
    return section;
  }

  /** Creates move, rotate, duplicate, paint, and erase controls for the selected block. */
  private createSelectedControls(
    value: JsonObject,
    selection: EditorSelection,
    assetId: string,
    selectedIndex: number,
    commands: EditorCommandStack,
    status: HTMLElement,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "builder-section builder-edit-section";
    const label = document.createElement("h4");
    label.textContent = "4. Move or change it";
    const controls = document.createElement("div");
    controls.className = "builder-move-grid";
    const moves: readonly [string, readonly [number, number, number], string][] = [
      ["←", [-BUILDER_GRID_STEP, 0, 0], "Move left"],
      ["→", [BUILDER_GRID_STEP, 0, 0], "Move right"],
      ["↑", [0, 0, -BUILDER_GRID_STEP], "Move back"],
      ["↓", [0, 0, BUILDER_GRID_STEP], "Move forward"],
      ["Up", [0, BUILDER_GRID_STEP, 0], "Move up one layer"],
      ["Down", [0, -BUILDER_GRID_STEP, 0], "Move down one layer"],
    ];
    for (const [text, offset, title] of moves) {
      const button = this.actionButton(text, title);
      button.addEventListener("click", () => {
        const next = moveBuilderPart(value, this.selectedParts.get(assetId) ?? selectedIndex, offset);
        this.executeIfChanged(value, next, selection, commands, title, status);
      });
      controls.append(button);
    }
    const actions = document.createElement("div");
    actions.className = "builder-piece-actions";
    const rotate = this.actionButton("Rotate", "Turn the selected cuboid by 90 degrees.");
    rotate.addEventListener("click", () => {
      const next = rotateBuilderPart(value, this.selectedParts.get(assetId) ?? selectedIndex);
      this.executeIfChanged(value, next, selection, commands, "Rotate model piece", status);
    });
    const duplicate = this.actionButton("Copy", "Duplicate the selected piece into the nearest open space.");
    duplicate.disabled = readBuilderParts(value).length >= 64;
    duplicate.addEventListener("click", () => {
      const index = this.selectedParts.get(assetId) ?? selectedIndex;
      this.selectedParts.set(assetId, readBuilderParts(value).length);
      commands.execute(
        selection.file,
        selection.pointer,
        duplicateBuilderPart(value, index, this.layer),
        "Duplicate model piece",
      );
    });
    const paint = this.actionButton("Paint", "Apply the chosen palette color to the selected piece.");
    paint.addEventListener("click", () => {
      const next = paintBuilderPart(value, this.selectedParts.get(assetId) ?? selectedIndex, this.color);
      this.executeIfChanged(value, next, selection, commands, "Paint model piece", status);
    });
    const erase = this.actionButton("Erase", "Delete the selected piece; one piece must remain.");
    erase.classList.add("danger");
    erase.disabled = readBuilderParts(value).length <= 1;
    erase.addEventListener("click", () => {
      const index = this.selectedParts.get(assetId) ?? selectedIndex;
      const nextIndex = Math.max(0, Math.min(index, readBuilderParts(value).length - 2));
      this.selectedParts.set(assetId, nextIndex);
      commands.execute(selection.file, selection.pointer, deleteBuilderPart(value, index), "Erase model piece");
    });
    actions.append(rotate, duplicate, paint, erase);
    section.append(label, controls, actions);
    return section;
  }

  /** Updates selected-part chips, viewport highlighting, and plain-language status without editing content. */
  private selectPart(
    assetId: string,
    index: number,
    root: HTMLElement,
    viewport: EditorViewport,
    status: HTMLElement,
  ): void {
    this.selectedParts.set(assetId, index);
    viewport.setAssetPartSelection(index);
    root.querySelectorAll<HTMLButtonElement>(".builder-part-button").forEach((button) => {
      const active = Number(button.dataset.partIndex) === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    status.textContent = `Selected piece ${index + 1}.`;
  }

  /** Commits a changed transformation or explains why collision or ground bounds rejected it. */
  private executeIfChanged(
    before: JsonObject,
    after: JsonObject,
    selection: EditorSelection,
    commands: EditorCommandStack,
    label: string,
    status: HTMLElement,
  ): void {
    if (after === before) {
      status.textContent = "That move is blocked by another piece or the ground.";
      return;
    }
    commands.execute(selection.file, selection.pointer, after, label);
  }

  /** Creates one consistent large builder action with native and custom tooltip support. */
  private actionButton(text: string, title: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    return button;
  }
}
