/** Presents canonical content files and their addressable definitions as a searchable tree. */

import {
  CONTENT_KIND_INFO,
  kindForContent,
  kindMatchesWorkspace,
  type EditorContentKind,
  type EditorWorkspace,
} from "./editor-content-kind";
import { createEntryIcon } from "./editor-entry-icon";
import type { EditorSelection, EditorState, JsonObject, JsonValue } from "./editor-state";
import { escapePointerSegment } from "./editor-state";

interface BrowserEntry extends EditorSelection {
  readonly kind: EditorContentKind;
  readonly search: string;
}

/** Narrows JSON values before reading definition metadata fields. */
function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Chooses a stable human label while allowing display names to differ from persisted identifiers. */
function labelFor(value: JsonValue, fallback: string): string {
  if (!isObject(value)) return fallback;
  for (const key of ["displayName", "name", "id", "typeId", "profileId"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return fallback;
}

/** Discovers editable definitions without depending on one content file's physical grouping. */
function entriesForFile(path: string, root: JsonValue): BrowserEntry[] {
  const entries: BrowserEntry[] = [];
  if (isObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      if (!Array.isArray(value)) continue;
      value.forEach((item, index) => {
        if (!isObject(item)) return;
        const label = labelFor(item, `${key} ${index + 1}`);
        const kind = kindForContent(path, key);
        const info = CONTENT_KIND_INFO[kind];
        entries.push({
          file: path,
          pointer: `/${escapePointerSegment(key)}/${index}`,
          label,
          kind,
          search: `${label} ${info.label} ${info.category} ${path}`.toLowerCase(),
        });
      });
    }
  }
  if (entries.length === 0) {
    const label = path.split("/").at(-1)?.replace(/\.json$/u, "") ?? path;
    const kind = kindForContent(path);
    const info = CONTENT_KIND_INFO[kind];
    entries.push({
      file: path,
      pointer: "",
      label,
      kind,
      search: `${label} ${info.label} ${info.category} ${path}`.toLowerCase(),
    });
  }
  return entries;
}

export class EditorContentBrowser {
  private query = "";
  private workspace: EditorWorkspace = "content";

  constructor(
    private readonly container: HTMLElement,
    private readonly count: HTMLElement,
    private readonly search: HTMLInputElement,
    private readonly state: EditorState,
  ) {
    this.search.addEventListener("input", () => {
      this.query = this.search.value.trim().toLowerCase();
      this.render();
    });
    this.state.subscribe(() => this.render());
  }

  /** Rebuilds filtered file groups and preserves selection highlighting from shared state. */
  render(): void {
    const entries = this.state.fileEntries()
      .flatMap(([path, root]) => entriesForFile(path, root))
      .filter((entry) => entry.search.includes(this.query) && kindMatchesWorkspace(entry.kind, this.workspace))
      .sort((left, right) => {
        const kindOrder = CONTENT_KIND_INFO[left.kind].order - CONTENT_KIND_INFO[right.kind].order;
        return kindOrder === 0 ? left.label.localeCompare(right.label) : kindOrder;
      });
    this.count.textContent = String(entries.length);
    this.container.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "browser-empty";
      empty.textContent = "Nothing here matches that search.";
      this.container.append(empty);
      return;
    }
    const graphical = entries.filter((entry) => CONTENT_KIND_INFO[entry.kind].graphical);
    const data = entries.filter((entry) => !CONTENT_KIND_INFO[entry.kind].graphical);
    this.renderZone("Visual objects", "Cube icons always open a graphical preview.", graphical);
    this.renderZone("Rules & data", "Document and logic icons do not pretend to be 3D objects.", data);
  }

  /** Changes the logical workspace without mutating or discarding the working snapshot. */
  setWorkspace(workspace: EditorWorkspace): void {
    this.workspace = workspace;
    this.render();
  }

  /** Renders friendly content categories inside one visual or data zone without exposing file-oriented groups. */
  private renderZone(title: string, description: string, entries: readonly BrowserEntry[]): void {
    if (entries.length === 0) return;
    const zone = document.createElement("section");
    zone.className = "browser-zone";
    zone.setAttribute("role", "group");
    const heading = document.createElement("h2");
    heading.textContent = title;
    const help = document.createElement("p");
    help.textContent = description;
    zone.append(heading, help);
    const categories = new Map<string, BrowserEntry[]>();
    for (const entry of entries) {
      const category = CONTENT_KIND_INFO[entry.kind].category;
      const categoryEntries = categories.get(category) ?? [];
      categoryEntries.push(entry);
      categories.set(category, categoryEntries);
    }
    for (const [category, categoryEntries] of categories) {
      const group = document.createElement("section");
      group.className = "browser-group";
      const groupHeading = document.createElement("h3");
      groupHeading.textContent = category;
      group.append(groupHeading);
      for (const entry of categoryEntries) group.append(this.createEntry(entry));
      zone.append(group);
    }
    this.container.append(zone);
  }

  /** Creates one accessible tree entry whose click selects an exact JSON Pointer. */
  private createEntry(entry: BrowserEntry): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "browser-entry";
    button.setAttribute("role", "treeitem");
    if (this.state.selection?.file === entry.file && this.state.selection.pointer === entry.pointer) {
      button.classList.add("selected");
    }
    const info = CONTENT_KIND_INFO[entry.kind];
    const label = document.createElement("span");
    label.className = "browser-entry-label";
    label.textContent = entry.label;
    button.title = info.graphical
      ? `Open the graphical ${info.label.toLowerCase()} preview. Source: ${entry.file}${entry.pointer}`
      : `Open ${info.label.toLowerCase()} settings. This entry has no graphical preview. Source: `
        + `${entry.file}${entry.pointer}`;
    button.setAttribute(
      "aria-label",
      `${entry.label}, ${info.label}, ${info.graphical ? "graphical object" : "rules or data only"}`,
    );
    const kind = document.createElement("span");
    kind.className = "browser-kind";
    kind.textContent = info.graphical ? "Object" : info.label;
    button.append(createEntryIcon(info), label, kind);
    button.addEventListener("click", () => this.state.select(entry));
    return button;
  }
}
