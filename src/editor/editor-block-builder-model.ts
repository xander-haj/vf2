/** Implements immutable, grid-aware procedural-model edits used by the visual block builder. */

import type { JsonObject, JsonValue } from "./editor-state";

export const BUILDER_GRID_STEP = 0.25;

/** BuilderShape defines one friendly reusable cuboid available in the piece tray. */
export interface BuilderShape {
  readonly id: string;
  readonly label: string;
  readonly size: readonly [number, number, number];
}

/** BuilderPart is the validated canonical box contract displayed and edited by the builder. */
export interface BuilderPart {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly color: string;
}

export const BUILDER_SHAPES: readonly BuilderShape[] = [
  { id: "cube", label: "Cube", size: [0.5, 0.5, 0.5] },
  { id: "wide", label: "Wide", size: [1, 0.5, 0.5] },
  { id: "tall", label: "Tall", size: [0.5, 1, 0.5] },
  { id: "long", label: "Long", size: [0.5, 0.5, 1] },
  { id: "slab", label: "Slab", size: [1, 0.25, 1] },
];

export const BUILDER_COLORS = [
  "#5f8fc2", "#75a84d", "#d5a94e", "#cf674f", "#9a6cc2", "#4eaaa5", "#d9d9d2", "#4c535c",
] as const;

/** Narrows canonical JSON to the procedural asset shape that supports direct block construction. */
export function isProceduralBuilderAsset(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && value.type === "procedural-entity-model" && Array.isArray(value.parts);
}

/** Converts one untrusted canonical part into a complete builder part or rejects malformed values. */
function readPart(value: JsonValue): BuilderPart | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.name !== "string" || typeof value.color !== "string") return null;
  if (!Array.isArray(value.size) || !Array.isArray(value.position)) return null;
  const size = value.size.map(Number);
  const position = value.position.map(Number);
  if (size.length !== 3 || position.length !== 3 || [...size, ...position].some((item) => !Number.isFinite(item))) {
    return null;
  }
  if (size.some((item) => item <= 0)) return null;
  return {
    name: value.name,
    size: [size[0] ?? 0, size[1] ?? 0, size[2] ?? 0],
    position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0],
    color: value.color,
  };
}

/** Returns every valid procedural part in authored order for stable picking and command indices. */
export function readBuilderParts(root: JsonObject): readonly BuilderPart[] {
  if (!Array.isArray(root.parts)) return [];
  return root.parts.map(readPart).filter((part): part is BuilderPart => part !== null);
}

/** Rounds visual-builder coordinates without changing the dimensions of pre-existing authored pieces. */
function snap(value: number): number {
  return Math.round(value / BUILDER_GRID_STEP) * BUILDER_GRID_STEP;
}

/** Reports whether one candidate cuboid intersects any part except an optional replaced index. */
function overlaps(
  parts: readonly BuilderPart[],
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  ignoredIndex = -1,
): boolean {
  return parts.some((part, index) => {
    if (index === ignoredIndex) return false;
    return Math.abs(part.position[0] - position[0]) < (part.size[0] + size[0]) / 2 - 0.0001
      && Math.abs(part.position[1] - position[1]) < (part.size[1] + size[1]) / 2 - 0.0001
      && Math.abs(part.position[2] - position[2]) < (part.size[2] + size[2]) / 2 - 0.0001;
  });
}

/** Creates a unique readable part name without renaming any existing animation-addressable pieces. */
function nextName(parts: readonly BuilderPart[]): string {
  const names = new Set(parts.map((part) => part.name));
  let index = parts.length + 1;
  while (names.has(`block_${index}`)) index += 1;
  return `block_${index}`;
}

/** Finds the first open grid position in expanding square rings at the requested base layer. */
function findOpenPosition(
  parts: readonly BuilderPart[],
  size: readonly [number, number, number],
  baseLayer: number,
): readonly [number, number, number] {
  const y = snap(Math.max(0, baseLayer)) + size[1] / 2;
  for (let radius = 0; radius <= 24; radius += 1) {
    for (let z = -radius; z <= radius; z += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (radius > 0 && Math.abs(x) !== radius && Math.abs(z) !== radius) continue;
        const position = [x * BUILDER_GRID_STEP, y, z * BUILDER_GRID_STEP] as const;
        if (!overlaps(parts, size, position)) return position;
      }
    }
  }
  return [0, y + size[1], 0];
}

/** Replaces the canonical parts collection while preserving every unrelated asset field. */
function withParts(root: JsonObject, parts: readonly BuilderPart[]): JsonObject {
  const copy = structuredClone(root);
  copy.parts = parts.map((part) => ({
    name: part.name,
    size: [...part.size],
    position: [...part.position],
    color: part.color,
  }));
  return copy;
}

/** Adds one selected tray shape at the first available position on the active layer. */
export function addBuilderPart(
  root: JsonObject,
  shape: BuilderShape,
  color: string,
  baseLayer: number,
): JsonObject {
  const parts = readBuilderParts(root);
  if (parts.length >= 64) return root;
  const position = findOpenPosition(parts, shape.size, baseLayer);
  return withParts(root, [...parts, { name: nextName(parts), size: shape.size, position, color }]);
}

/** Adds one selected tray shape at a clicked grid position when that cell volume is available. */
export function addBuilderPartAt(
  root: JsonObject,
  shape: BuilderShape,
  color: string,
  point: readonly [number, number, number],
): JsonObject {
  const parts = readBuilderParts(root);
  if (parts.length >= 64) return root;
  const x = snap(Math.max(-6, Math.min(6, point[0])));
  const y = snap(Math.max(0, Math.min(6, point[1]))) + shape.size[1] / 2;
  const z = snap(Math.max(-6, Math.min(6, point[2])));
  const position = [x, y, z] as const;
  if (overlaps(parts, shape.size, position)) return root;
  return withParts(root, [...parts, { name: nextName(parts), size: shape.size, position, color }]);
}

/** Duplicates one selected piece at the nearest open position while retaining its shape and color. */
export function duplicateBuilderPart(root: JsonObject, index: number, baseLayer: number): JsonObject {
  const parts = readBuilderParts(root);
  if (parts.length >= 64) return root;
  const source = parts[index];
  if (source === undefined) return root;
  const position = findOpenPosition(parts, source.size, baseLayer);
  return withParts(root, [...parts, { ...source, name: nextName(parts), position }]);
}

/** Moves a selected part by one grid step only when the result remains above ground and collision-free. */
export function moveBuilderPart(
  root: JsonObject,
  index: number,
  offset: readonly [number, number, number],
): JsonObject {
  const parts = readBuilderParts(root);
  const source = parts[index];
  if (source === undefined) return root;
  const position = source.position.map((value, axis) => snap(value + (offset[axis] ?? 0))) as [number, number, number];
  position[0] = Math.max(-6, Math.min(6, position[0]));
  position[1] = Math.max(source.size[1] / 2, Math.min(8, position[1]));
  position[2] = Math.max(-6, Math.min(6, position[2]));
  if (overlaps(parts, source.size, position, index)) return root;
  const next = parts.map((part, partIndex) => partIndex === index ? { ...part, position } : part);
  return withParts(root, next);
}

/** Rotates a cuboid around the vertical axis by swapping width and depth when space permits. */
export function rotateBuilderPart(root: JsonObject, index: number): JsonObject {
  const parts = readBuilderParts(root);
  const source = parts[index];
  if (source === undefined) return root;
  const size = [source.size[2], source.size[1], source.size[0]] as const;
  if (overlaps(parts, size, source.position, index)) return root;
  return withParts(root, parts.map((part, partIndex) => partIndex === index ? { ...part, size } : part));
}

/** Paints one selected cuboid without changing its animation-addressable name or physical transform. */
export function paintBuilderPart(root: JsonObject, index: number, color: string): JsonObject {
  const parts = readBuilderParts(root);
  if (parts[index] === undefined) return root;
  return withParts(root, parts.map((part, partIndex) => partIndex === index ? { ...part, color } : part));
}

/** Deletes one selected cuboid while preserving the validator's requirement for at least one model part. */
export function deleteBuilderPart(root: JsonObject, index: number): JsonObject {
  const parts = readBuilderParts(root);
  if (parts.length <= 1 || parts[index] === undefined) return root;
  return withParts(root, parts.filter((_part, partIndex) => partIndex !== index));
}
