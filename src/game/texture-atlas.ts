/**
 * Generates original pixel-art block textures in memory and packs them into one GPU texture.
 * Runtime generation avoids copied game assets and keeps the repository entirely text-based.
 */

import {
  CanvasTexture,
  NearestFilter,
  NearestMipmapNearestFilter,
  SRGBColorSpace,
} from "three";
import type { TextureName } from "./block-types";

// Sixteen pixels per tile preserves a crisp voxel aesthetic without large image assets.
const TILE_SIZE = 16;

// Four columns fit the nine textures into a compact, power-of-two-friendly canvas width.
const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 4;

// Tile order is shared with UV generation and must remain stable across saved worlds.
const TEXTURE_ORDER: readonly TextureName[] = [
  "grass-top",
  "grass-side",
  "dirt",
  "stone",
  "sand",
  "wood-side",
  "wood-top",
  "leaves",
  "cobblestone",
];

/** Normalized atlas bounds describe the safe UV rectangle for one generated tile. */
export interface AtlasUvBounds {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

/** The atlas result combines the GPU texture with UV lookup needed by the chunk mesher. */
export interface TextureAtlas {
  readonly texture: CanvasTexture;
  getUvBounds(textureName: TextureName): AtlasUvBounds;
}

/** Produces a repeatable integer hash used to scatter texture pixels without Math.random. */
function pixelHash(x: number, y: number, salt: number): number {
  let value = Math.imul(x + salt, 374761393) ^ Math.imul(y - salt, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Paints noisy color flecks over a base color to give flat tiles natural variation. */
function paintNoise(
  context: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  baseColor: string,
  fleckColors: readonly string[],
  salt: number,
): void {
  const originX = tileX * TILE_SIZE;
  const originY = tileY * TILE_SIZE;
  context.fillStyle = baseColor;
  context.fillRect(originX, originY, TILE_SIZE, TILE_SIZE);

  // Every pixel receives deterministic variation so page reloads reproduce the same artwork.
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const hash = pixelHash(x, y, salt);
      if (hash % 5 !== 0) {
        continue;
      }
      const color = fleckColors[hash % fleckColors.length];
      if (color !== undefined) {
        context.fillStyle = color;
        context.fillRect(originX + x, originY + y, 1, 1);
      }
    }
  }
}

/** Draws one named texture with visual cues appropriate to its block material. */
function paintTexture(
  context: CanvasRenderingContext2D,
  textureName: TextureName,
  tileX: number,
  tileY: number,
): void {
  const originX = tileX * TILE_SIZE;
  const originY = tileY * TILE_SIZE;

  // Material-specific patterns distinguish block faces even when their base colors are similar.
  switch (textureName) {
    case "grass-top":
      paintNoise(context, tileX, tileY, "#6fa844", ["#82b94f", "#568d37", "#91c35a"], 11);
      break;
    case "grass-side":
      paintNoise(context, tileX, tileY, "#8a5a36", ["#74482d", "#9d6a42"], 23);
      context.fillStyle = "#6fa844";
      context.fillRect(originX, originY, TILE_SIZE, 4);
      context.fillStyle = "#568d37";
      for (let x = 0; x < TILE_SIZE; x += 2) {
        context.fillRect(originX + x, originY + 4, 1, 1 + (pixelHash(x, 0, 7) % 3));
      }
      break;
    case "dirt":
      paintNoise(context, tileX, tileY, "#895b39", ["#6f452c", "#a06b42", "#7d5031"], 31);
      break;
    case "stone":
      paintNoise(context, tileX, tileY, "#888b8d", ["#747779", "#9b9ea0", "#686b6d"], 43);
      break;
    case "sand":
      paintNoise(context, tileX, tileY, "#d8c47e", ["#ead995", "#c5af68", "#dfcb86"], 59);
      break;
    case "wood-side":
      paintNoise(context, tileX, tileY, "#8b643b", ["#76512f", "#a17a4a"], 71);
      context.fillStyle = "#6e4a2b";
      for (let x = 2; x < TILE_SIZE; x += 5) {
        context.fillRect(originX + x, originY, 1, TILE_SIZE);
      }
      break;
    case "wood-top":
      paintNoise(context, tileX, tileY, "#aa7d49", ["#95673a", "#bd925b"], 83);
      context.strokeStyle = "#79512f";
      context.strokeRect(originX + 3.5, originY + 3.5, 9, 9);
      context.strokeRect(originX + 6.5, originY + 6.5, 3, 3);
      break;
    case "leaves":
      paintNoise(context, tileX, tileY, "#477e3a", ["#599348", "#356b30", "#6aa653"], 97);
      break;
    case "cobblestone":
      paintNoise(context, tileX, tileY, "#707577", ["#5c6062", "#898d8f"], 109);
      context.strokeStyle = "#54595b";
      context.strokeRect(originX + 1.5, originY + 1.5, 6, 5);
      context.strokeRect(originX + 8.5, originY + 2.5, 6, 6);
      context.strokeRect(originX + 3.5, originY + 8.5, 8, 6);
      break;
  }
}

/** Builds the canvas texture and exposes inset UV bounds that prevent neighboring tile bleeding. */
export function createTextureAtlas(): TextureAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLUMNS * TILE_SIZE;
  canvas.height = ATLAS_ROWS * TILE_SIZE;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("This browser does not provide the Canvas 2D API required for block textures.");
  }
  context.imageSmoothingEnabled = false;

  // Tiles are laid out row-major so names map to stable indices and predictable UV rectangles.
  TEXTURE_ORDER.forEach((textureName, index) => {
    paintTexture(context, textureName, index % ATLAS_COLUMNS, Math.floor(index / ATLAS_COLUMNS));
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return {
    texture,
    getUvBounds(textureName: TextureName): AtlasUvBounds {
      const index = TEXTURE_ORDER.indexOf(textureName);
      if (index < 0) {
        throw new Error(`Texture atlas does not contain the requested tile: ${textureName}`);
      }
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      const insetU = 0.5 / canvas.width;
      const insetV = 0.5 / canvas.height;
      return {
        uMin: column / ATLAS_COLUMNS + insetU,
        uMax: (column + 1) / ATLAS_COLUMNS - insetU,
        vMin: 1 - (row + 1) / ATLAS_ROWS + insetV,
        vMax: 1 - row / ATLAS_ROWS - insetV,
      };
    },
  };
}

