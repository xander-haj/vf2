/**
 * Generates original pixel-art block textures in memory and packs them into one GPU texture.
 * Runtime generation avoids copied game assets and supplies stable UVs for every terrain material.
 */

import { CanvasTexture, NearestFilter, NearestMipmapNearestFilter, SRGBColorSpace } from "three";
import { BLOCK_TEXTURE_RECIPES, type TextureRecipe } from "./block-texture-recipes";
import { TEXTURE_NAMES, type TextureName } from "./block-model";

// Sixteen pixels per tile preserves a crisp voxel aesthetic without large image assets.
const TILE_SIZE = 16;

// A square power-of-two atlas retains efficient mipmaps while expanding automatically with the catalog.
const ATLAS_COLUMNS = 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(TEXTURE_NAMES.length))));
const ATLAS_ROWS = ATLAS_COLUMNS;

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

/** Paints deterministic color flecks over a base color so flat tiles retain natural variation. */
function paintNoise(
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  recipe: TextureRecipe,
): void {
  context.fillStyle = recipe.baseColor;
  context.fillRect(originX, originY, TILE_SIZE, TILE_SIZE);

  // Every pixel is considered through a stable hash so reloads reproduce identical original artwork.
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const hash = pixelHash(x, y, recipe.salt);
      if (hash % 5 !== 0) {
        continue;
      }
      const color = recipe.fleckColors[hash % recipe.fleckColors.length];
      if (color !== undefined) {
        context.fillStyle = color;
        context.fillRect(originX + x, originY + y, 1, 1);
      }
    }
  }
}

/** Draws material structure over base noise using the recipe's reusable pattern category. */
function paintPattern(
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  recipe: TextureRecipe,
): void {
  const accent = recipe.accentColor ?? recipe.fleckColors[0] ?? recipe.baseColor;

  // Each case adds only the visual structure that distinguishes this family of materials.
  switch (recipe.pattern) {
    case "cap-side":
      context.fillStyle = accent;
      context.fillRect(originX, originY, TILE_SIZE, 4);
      for (let x = 0; x < TILE_SIZE; x += 2) {
        context.fillRect(originX + x, originY + 4, 1, 1 + (pixelHash(x, 0, recipe.salt) % 3));
      }
      break;
    case "wood-side":
      context.fillStyle = accent;
      for (let x = 2; x < TILE_SIZE; x += 5) {
        context.fillRect(originX + x, originY, 1, TILE_SIZE);
      }
      break;
    case "wood-top":
      context.strokeStyle = accent;
      context.strokeRect(originX + 3.5, originY + 3.5, 9, 9);
      context.strokeRect(originX + 6.5, originY + 6.5, 3, 3);
      break;
    case "cobblestone":
      context.strokeStyle = accent;
      context.strokeRect(originX + 1.5, originY + 1.5, 6, 5);
      context.strokeRect(originX + 8.5, originY + 2.5, 6, 6);
      context.strokeRect(originX + 3.5, originY + 8.5, 8, 6);
      break;
    case "strata":
      context.fillStyle = accent;
      for (let y = 3; y < TILE_SIZE; y += 5) {
        context.fillRect(originX, originY + y, TILE_SIZE, 1);
      }
      break;
    case "ice":
      context.strokeStyle = accent;
      context.beginPath();
      context.moveTo(originX + 2, originY + 13);
      context.lineTo(originX + 7, originY + 8);
      context.lineTo(originX + 10, originY + 9);
      context.lineTo(originX + 14, originY + 4);
      context.stroke();
      break;
    case "ore":
      context.fillStyle = accent;
      for (let index = 0; index < 8; index += 1) {
        const hash = pixelHash(index, recipe.salt, 487);
        context.fillRect(originX + (hash % 14), originY + ((hash >>> 8) % 14), 2, 2);
      }
      break;
    case "bedrock":
      context.fillStyle = accent;
      for (let index = 0; index < 10; index += 1) {
        const hash = pixelHash(index, recipe.salt, 491);
        context.fillRect(originX + (hash % 15), originY + ((hash >>> 8) % 15), 2, 2);
      }
      break;
    case "noise":
      break;
  }
}

/** Paints one named tile from its complete procedural recipe. */
function paintTexture(
  context: CanvasRenderingContext2D,
  textureName: TextureName,
  tileX: number,
  tileY: number,
): void {
  const recipe = BLOCK_TEXTURE_RECIPES[textureName];
  const originX = tileX * TILE_SIZE;
  const originY = tileY * TILE_SIZE;
  paintNoise(context, originX, originY, recipe);
  paintPattern(context, originX, originY, recipe);
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

  // Row-major placement ties every stable texture name to one predictable UV rectangle.
  TEXTURE_NAMES.forEach((textureName, index) => {
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
      const index = TEXTURE_NAMES.indexOf(textureName);
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
