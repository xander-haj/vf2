/** Builds graphical entity and procedural-model previews from the complete unsaved editor snapshot. */

import { BoxGeometry, Color, Mesh, MeshStandardMaterial, Object3D } from "three";
import type { EditorState, JsonObject, JsonValue } from "./editor-state";

/** Narrows arbitrary canonical values before model and entity metadata is inspected. */
function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reads one finite numeric property while respecting an ordered list of compatible field names. */
function readNumber(root: JsonValue, names: readonly string[], fallback: number): number {
  if (!isObject(root)) return fallback;
  for (const name of names) {
    const value = root[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

/** Reads one rendering string while retaining a visible safe fallback. */
function readString(root: JsonValue, names: readonly string[], fallback: string): string {
  if (!isObject(root)) return fallback;
  for (const name of names) {
    const value = root[name];
    if (typeof value === "string") return value;
  }
  return fallback;
}

/** Builds exact procedural parts or a collider-scaled body for a linked entity definition. */
export function createEditorEntityPreview(value: JsonValue): Object3D {
  const root = new Object3D();
  if (isObject(value) && Array.isArray(value.parts)) {
    value.parts.forEach((part, index) => {
      if (!isObject(part) || !Array.isArray(part.size) || !Array.isArray(part.position)) return;
      const size = part.size.map(Number);
      const position = part.position.map(Number);
      if (size.length !== 3 || position.length !== 3 || [...size, ...position].some(Number.isNaN)) return;
      const [width = 0, height = 0, depth = 0] = size;
      const [x = 0, y = 0, z = 0] = position;
      const material = new MeshStandardMaterial({
        color: new Color(typeof part.color === "string" ? part.color : "#7aa3c4"),
        roughness: 0.72,
      });
      const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.userData.assetPartIndex = index;
      root.add(mesh);
    });
    if (root.children.length > 0) return root;
  }
  const color = new Color(readString(value, ["uiColor", "color", "tint"], "#7aa3c4"));
  const material = new MeshStandardMaterial({ color, roughness: 0.72 });
  const width = Math.max(0.3, Math.min(2, readNumber(value, ["width", "radius"], 0.7)));
  const height = Math.max(0.5, Math.min(4, readNumber(value, ["height"], 1.8)));
  const body = new Mesh(new BoxGeometry(width, height * 0.55, width * 0.55), material);
  body.position.y = height * 0.55;
  const head = new Mesh(new BoxGeometry(width * 0.72, width * 0.72, width * 0.72), material);
  head.position.y = height * 0.55 + height * 0.36;
  root.add(body, head);
  for (const direction of [-1, 1]) {
    const leg = new Mesh(new BoxGeometry(width * 0.25, height * 0.45, width * 0.25), material);
    leg.position.set(direction * width * 0.2, height * 0.225, 0);
    root.add(leg);
  }
  return root;
}

/** Resolves a namespaced reference across all unsaved canonical files for linked previews. */
export function findEditorDefinition(state: EditorState, identifier: string): JsonValue | undefined {
  const visit = (value: JsonValue): JsonValue | undefined => {
    if (isObject(value)) {
      if (value.id === identifier) return value;
      for (const child of Object.values(value)) {
        const result = visit(child);
        if (result !== undefined) return result;
      }
    } else if (Array.isArray(value)) {
      for (const child of value) {
        const result = visit(child);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  };
  for (const [, root] of state.fileEntries()) {
    const result = visit(root);
    if (result !== undefined) return result;
  }
  return undefined;
}
