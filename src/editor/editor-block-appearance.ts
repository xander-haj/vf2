/** Provides a simple face-painting surface for voxel blocks while preserving complete advanced fields. */

import type { EditorCommandStack } from "./editor-command-stack";
import type { EditorSelection, EditorState, JsonObject, JsonValue } from "./editor-state";

/** TextureChoice combines a canonical texture ID with its representative editor color. */
interface TextureChoice {
  readonly id: string;
  readonly color: string;
}

/** Narrows canonical JSON before block and texture values are inspected. */
function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Collects every authored procedural texture once for friendly face selection. */
function collectTextures(state: EditorState): readonly TextureChoice[] {
  const choices = new Map<string, TextureChoice>();
  for (const [, root] of state.fileEntries()) {
    if (!isObject(root) || !Array.isArray(root.textures)) continue;
    for (const texture of root.textures) {
      if (!isObject(texture) || typeof texture.id !== "string") continue;
      const color = typeof texture.baseColor === "string" ? texture.baseColor : "#7b8c96";
      choices.set(texture.id, { id: texture.id, color });
    }
  }
  return [...choices.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** EditorBlockAppearance turns face texture IDs into three large, visual paint choices. */
export class EditorBlockAppearance {
  /** Renders top, side, and bottom face selectors for graphical block definitions only. */
  public render(
    container: HTMLElement,
    selection: EditorSelection,
    value: JsonValue,
    commands: EditorCommandStack,
    state: EditorState,
  ): boolean {
    if (selection.kind !== "block" || !isObject(value) || !isObject(value.textures)) return false;
    const choices = collectTextures(state);
    const card = document.createElement("section");
    card.className = "context-card block-appearance-card";
    const title = document.createElement("h3");
    title.textContent = "Paint this block";
    const hint = document.createElement("p");
    hint.textContent = "Choose what the top, sides, and bottom look like. The block picture updates immediately.";
    card.append(title, hint);
    const faces = [["top", "Top"], ["side", "Sides"], ["bottom", "Bottom"]] as const;
    for (const [face, label] of faces) {
      card.append(this.createFaceChoice(face, label, choices, value, selection, commands));
    }
    container.append(card);
    return true;
  }

  /** Creates one color-backed face picker and writes only that face through the reversible command stack. */
  private createFaceChoice(
    face: "top" | "side" | "bottom",
    label: string,
    choices: readonly TextureChoice[],
    value: JsonObject,
    selection: EditorSelection,
    commands: EditorCommandStack,
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "block-face-choice";
    const name = document.createElement("strong");
    name.textContent = label;
    const swatch = document.createElement("span");
    swatch.className = "block-face-swatch";
    const select = document.createElement("select");
    const textures = value.textures;
    const current = isObject(textures) && typeof textures[face] === "string"
      ? textures[face] as string
      : "";
    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = choice.id;
      option.textContent = choice.id.replaceAll("-", " ");
      option.selected = choice.id === current;
      select.append(option);
    }
    const updateSwatch = (): void => {
      const color = choices.find((choice) => choice.id === select.value)?.color ?? "#7b8c96";
      swatch.style.setProperty("--face-color", color);
    };
    select.title = `Choose the procedural texture used by the block's ${label.toLowerCase()}.`;
    select.addEventListener("change", () => {
      const next = structuredClone(value);
      const nextTextures = next.textures;
      if (!isObject(nextTextures)) return;
      nextTextures[face] = select.value;
      updateSwatch();
      commands.execute(selection.file, selection.pointer, next, `Paint block ${label.toLowerCase()}`);
    });
    updateSwatch();
    row.append(swatch, name, select);
    return row;
  }
}
