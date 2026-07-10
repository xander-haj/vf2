/** Reproduces the runtime procedural tile painter for immediate unsaved texture previews. */

import {
  CanvasTexture,
  NearestFilter,
  NearestMipmapNearestFilter,
  SRGBColorSpace,
} from "three";
import type { JsonObject, JsonValue } from "./editor-state";

/** Narrows editor JSON to a keyed object before recipe fields are inspected. */
function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Produces the same stable pixel scatter used by the production procedural atlas. */
function pixelHash(x: number, y: number, salt: number): number {
  let value = Math.imul(x + salt, 374761393) ^ Math.imul(y - salt, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Paints an optional material-specific structure over the shared deterministic color noise. */
function paintPattern(
  context: CanvasRenderingContext2D,
  pattern: JsonValue | undefined,
  accent: string,
  salt: number,
): void {
  context.fillStyle = accent;
  context.strokeStyle = accent;
  // Pattern branches intentionally match the runtime atlas so the editor is visually authoritative.
  switch (pattern) {
    case "cap-side":
      context.fillRect(0, 0, 16, 4);
      for (let x = 0; x < 16; x += 2) context.fillRect(x, 4, 1, 1 + pixelHash(x, 0, salt) % 3);
      break;
    case "wood-side":
      for (let x = 2; x < 16; x += 5) context.fillRect(x, 0, 1, 16);
      break;
    case "wood-top":
      context.strokeRect(3.5, 3.5, 9, 9);
      context.strokeRect(6.5, 6.5, 3, 3);
      break;
    case "cobblestone":
      context.strokeRect(1.5, 1.5, 6, 5);
      context.strokeRect(8.5, 2.5, 6, 6);
      context.strokeRect(3.5, 8.5, 8, 6);
      break;
    case "strata":
      for (let y = 3; y < 16; y += 5) context.fillRect(0, y, 16, 1);
      break;
    case "ice":
      context.beginPath();
      context.moveTo(2, 13);
      context.lineTo(7, 8);
      context.lineTo(10, 9);
      context.lineTo(14, 4);
      context.stroke();
      break;
    case "ore":
      // Ore accents use the runtime's fixed eight deposits to make previews exact and repeatable.
      for (let index = 0; index < 8; index += 1) {
        const hash = pixelHash(index, salt, 487);
        context.fillRect(hash % 14, (hash >>> 8) % 14, 2, 2);
      }
      break;
    case "bedrock":
      // Bedrock uses a denser fixed scatter so it remains distinct from ordinary stone noise.
      for (let index = 0; index < 10; index += 1) {
        const hash = pixelHash(index, salt, 491);
        context.fillRect(hash % 15, (hash >>> 8) % 15, 2, 2);
      }
      break;
  }
}

/** Converts one validated recipe-shaped JSON object into a GPU-ready nearest-filtered tile. */
export function createEditorTexture(value: JsonValue): CanvasTexture | null {
  // A non-recipe selection is intentionally declined so the viewport can use its block fallback.
  if (!isObject(value) || typeof value.baseColor !== "string" || !Array.isArray(value.fleckColors)) return null;
  const flecks = value.fleckColors.filter((color): color is string => typeof color === "string");
  const salt = typeof value.salt === "number" ? value.salt : 1;
  const accent = typeof value.accentColor === "string" ? value.accentColor : flecks[0] ?? value.baseColor;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  // Browsers without Canvas 2D cannot produce the same procedural artwork as the runtime.
  if (context === null) return null;
  context.imageSmoothingEnabled = false;
  context.fillStyle = value.baseColor;
  context.fillRect(0, 0, 16, 16);
  // Each pixel is sampled through the stable hash used by the game, never through Math.random.
  if (flecks.length > 0) {
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const hash = pixelHash(x, y, salt);
        if (hash % 5 !== 0) continue;
        context.fillStyle = flecks[hash % flecks.length] ?? value.baseColor;
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  paintPattern(context, value.pattern, accent, salt);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
