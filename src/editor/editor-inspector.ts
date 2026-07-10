/** Builds type-safe controls directly from the selected canonical JSON value. */

import type { EditorCommandStack } from "./editor-command-stack";
import type { EditorState, JsonObject, JsonValue } from "./editor-state";
import { escapePointerSegment } from "./editor-state";

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  shape: ["scatter", "walk", "blob", "sheet", "stratum", "vein"],
  distribution: ["uniform", "triangular", "gaussian", "noise-gated", "fixed-grid"],
  severity: ["info", "warning", "error"],
  persistence: ["never", "changed", "always"],
  pattern: ["noise", "cap-side", "wood-side", "wood-top", "cobblestone", "strata", "ice", "ore", "bedrock"],
  type: ["selector", "sequence", "condition", "action", "cooldown", "repeat"],
};

/** Narrows canonical JSON before recursive object controls are constructed. */
function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Creates a schema-shaped new array entry by cloning the first existing entry's value types. */
function defaultLike(value: JsonValue | undefined, key: string): JsonValue {
  if (value === null) return null;
  if (typeof value === "string") return "";
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return [];
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, defaultLike(child, name)]));
  }
  if (key === "nodes") return { id: "node", type: "action", action: "idle" };
  if (key === "transitions") return { from: "", to: "", condition: "always", priority: 0 };
  return "";
}

/** Appends one escaped segment to an existing RFC 6901 pointer. */
function joinPointer(base: string, segment: string | number): string {
  return `${base}/${escapePointerSegment(String(segment))}`;
}

export class EditorInspector {
  private readonly advancedOpen = new Map<string, boolean>();

  constructor(
    private readonly form: HTMLFormElement,
    private readonly title: HTMLElement,
    private readonly state: EditorState,
    private readonly commands: EditorCommandStack,
  ) {
    this.form.addEventListener("submit", (event) => event.preventDefault());
    this.state.subscribe(() => this.render());
  }

  /** Rebuilds controls from the selected value so undo, redo, and external panel changes stay synchronized. */
  render(): void {
    this.form.replaceChildren();
    const selection = this.state.selection;
    const value = this.state.selectedValue();
    if (selection === null || value === undefined) {
      this.title.textContent = "Inspector";
      const empty = document.createElement("p");
      empty.className = "empty-inspector";
      empty.textContent = "Select a definition in the content browser.";
      this.form.append(empty);
      return;
    }
    const readOnly = isObject(value) && (value.id === "vf:legacy_v1" || value.generatorVersion === 1);
    this.title.textContent = `${selection.label}${readOnly ? " · protected" : ""}`;
    const details = document.createElement("details");
    details.className = "advanced-inspector";
    const selectionKey = `${selection.file}${selection.pointer}`;
    const simpleKinds = ["block", "asset", "entity", "worldgen", "biome", "behavior"];
    details.open = this.advancedOpen.get(selectionKey) ?? !simpleKinds.includes(selection.kind);
    details.addEventListener("toggle", () => this.advancedOpen.set(selectionKey, details.open));
    const summary = document.createElement("summary");
    const summaryTitle = document.createElement("strong");
    summaryTitle.textContent = "All settings";
    const badge = document.createElement("span");
    badge.textContent = "Advanced";
    summary.append(summaryTitle, badge);
    const explanation = document.createElement("p");
    explanation.className = "advanced-explanation";
    explanation.textContent = readOnly
      ? "This compatibility content is protected so old saved worlds remain exact."
      : "Every canonical field remains available here for precise expert editing.";
    const fields = document.createElement("div");
    fields.className = "advanced-fields";
    fields.append(this.createControl(value, selection.pointer, selection.label, selection.file, 0, readOnly));
    details.append(summary, explanation, fields);
    this.form.append(details);
  }

  /** Dispatches each JSON value to its matching recursive, ordered-list, or primitive editor. */
  private createControl(
    value: JsonValue,
    pointer: string,
    key: string,
    file: string,
    depth: number,
    readOnly: boolean,
  ): HTMLElement {
    if (Array.isArray(value)) return this.createArray(value, pointer, key, file, depth, readOnly);
    if (isObject(value)) return this.createObject(value, pointer, key, file, depth, readOnly);
    return this.createPrimitive(value, pointer, key, file, readOnly);
  }

  /** Creates a fieldset that preserves canonical object key order and nested pointer identity. */
  private createObject(
    value: JsonObject,
    pointer: string,
    key: string,
    file: string,
    depth: number,
    readOnly: boolean,
  ): HTMLElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "object-field";
    if (depth > 0) {
      const legend = document.createElement("legend");
      legend.textContent = key;
      fieldset.append(legend);
    }
    for (const [childKey, child] of Object.entries(value)) {
      fieldset.append(this.createControl(child, joinPointer(pointer, childKey), childKey, file, depth + 1, readOnly));
    }
    return fieldset;
  }

  /** Creates ordered entry controls plus reversible add and remove operations for one array. */
  private createArray(
    value: JsonValue[],
    pointer: string,
    key: string,
    file: string,
    depth: number,
    readOnly: boolean,
  ): HTMLElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "object-field";
    const legend = document.createElement("legend");
    legend.textContent = `${key} (${value.length})`;
    fieldset.append(legend);
    const toolbar = document.createElement("div");
    toolbar.className = "array-toolbar";
    const note = document.createElement("span");
    note.textContent = value.length === 0 ? "Empty list" : "Ordered list";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add";
    add.title = `Append a new schema-shaped entry to ${key}`;
    add.disabled = readOnly;
    add.addEventListener("click", () => {
      const next = [...value, defaultLike(value[0], key)];
      this.commands.execute(file, pointer, next, `Add ${key} entry`);
    });
    toolbar.append(note, add);
    fieldset.append(toolbar);
    value.forEach((child, index) => {
      const item = document.createElement("div");
      item.className = "array-item";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "array-remove";
      remove.textContent = "×";
      remove.title = `Remove ${key} ${index + 1}`;
      remove.disabled = readOnly;
      remove.addEventListener("click", () => {
        const next = value.filter((_entry, entryIndex) => entryIndex !== index);
        this.commands.execute(file, pointer, next, `Remove ${key} entry`);
      });
      item.append(
        remove,
        this.createControl(child, joinPointer(pointer, index), String(index + 1), file, depth + 1, readOnly),
      );
      fieldset.append(item);
    });
    return fieldset;
  }

  /** Wraps one primitive control with an addressable label and command-producing change listener. */
  private createPrimitive(
    value: string | number | boolean | null,
    pointer: string,
    key: string,
    file: string,
    readOnly: boolean,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "field-row";
    const label = document.createElement("label");
    const inputId = `field-${file}-${pointer}`.replace(/[^a-z0-9_-]/giu, "-");
    label.htmlFor = inputId;
    label.textContent = key;
    const input = this.createInput(value, key);
    input.id = inputId;
    input.title = readOnly
      ? `${key} is frozen compatibility data and cannot be edited.`
      : `Edit ${key}; the change remains in memory until Save changes succeeds.`;
    input.disabled = readOnly;
    input.addEventListener("change", () => {
      const next = this.readInput(input, value);
      this.commands.execute(file, pointer, next, `Edit ${key}`);
    });
    row.append(label, input);
    return row;
  }

  /** Selects checkbox, enum, numeric, color, or constrained text controls from current value metadata. */
  private createInput(value: string | number | boolean | null, key: string): HTMLInputElement | HTMLSelectElement {
    if (typeof value === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value;
      return input;
    }
    const choices = ENUMS[key];
    if (typeof value === "string" && choices?.includes(value)) {
      const select = document.createElement("select");
      for (const choice of choices) {
        const option = document.createElement("option");
        option.value = choice;
        option.textContent = choice;
        option.selected = choice === value;
        select.append(option);
      }
      return select;
    }
    const input = document.createElement("input");
    input.type = typeof value === "number" ? "number" : "text";
    if (typeof value === "number") {
      input.value = String(value);
      input.step = Number.isInteger(value) ? "1" : "any";
    } else {
      input.value = value ?? "";
      if (typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value) && key.toLowerCase().includes("color")) {
        input.type = "color";
      }
      if ((key === "id" || key.endsWith("Id")) && typeof value === "string") {
        input.pattern = value.includes(":")
          ? "[a-z][a-z0-9_-]*:[a-z0-9_.-]+"
          : "[a-z0-9][a-z0-9_.-]*";
      }
      if (key.toLowerCase().includes("color")) input.pattern = "#[0-9a-fA-F]{6,8}";
    }
    return input;
  }

  /** Parses a browser control back into the previous JSON primitive type without permitting NaN. */
  private readInput(
    input: HTMLInputElement | HTMLSelectElement,
    previous: string | number | boolean | null,
  ): JsonValue {
    if (input instanceof HTMLInputElement && input.type === "checkbox") return input.checked;
    if (typeof previous === "number") {
      const numeric = Number(input.value);
      return Number.isFinite(numeric) ? numeric : previous;
    }
    if (previous === null && input.value === "") return null;
    return input.value;
  }
}
