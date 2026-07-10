/**
 * Generated registry that combines canonical texture recipe files in stable authored order.
 * The atlas consumes this module so content JSON, rather than handwritten gameplay code, owns artwork.
 */

import geologySource from "../../content/textures/geology-textures.json";
import oreSource from "../../content/textures/ore-textures.json";
import surfaceSource from "../../content/textures/surface-textures.json";
import type { CompiledTextureRecipe, TexturePattern } from "../engine/content/content-model";

/** TextureName is a validated canonical atlas tile identifier. */
export type TextureName = string;

/** TextureRecipe is the compiled procedural painter input used by texture-atlas.ts. */
export type TextureRecipe = CompiledTextureRecipe;

interface AuthoredTextureRecipe {
  readonly id: string;
  readonly baseColor: string;
  readonly fleckColors: readonly string[];
  readonly salt: number;
  readonly pattern: string;
  readonly accentColor?: string;
}

// File order and array order are compatibility data because atlas UV cells follow this sequence.
const AUTHORED_TEXTURES: readonly AuthoredTextureRecipe[] = [
  ...surfaceSource.textures,
  ...geologySource.textures,
  ...oreSource.textures,
];

/** Converts validated authored recipes to the narrow runtime type without changing their order. */
function compileRecipe(source: AuthoredTextureRecipe): TextureRecipe {
  return {
    baseColor: source.baseColor,
    fleckColors: source.fleckColors,
    salt: source.salt,
    pattern: source.pattern as TexturePattern,
    ...(source.accentColor === undefined ? {} : { accentColor: source.accentColor }),
  };
}

/** TEXTURE_NAMES fixes the row-major atlas placement for all generated tiles. */
export const TEXTURE_NAMES: readonly TextureName[] = AUTHORED_TEXTURES.map((texture) => texture.id);

/** BLOCK_TEXTURE_RECIPES provides constant-time painter lookup by canonical tile name. */
export const BLOCK_TEXTURE_RECIPES: Readonly<Record<TextureName, TextureRecipe>> = Object.fromEntries(
  AUTHORED_TEXTURES.map((texture) => [texture.id, compileRecipe(texture)]),
);

/** TEXTURE_OWNERSHIP records the project-original provenance inherited by each recipe collection. */
export const TEXTURE_OWNERSHIP = [
  { file: "content/textures/surface-textures.json", ...surfaceSource.ownership },
  { file: "content/textures/geology-textures.json", ...geologySource.ownership },
  { file: "content/textures/ore-textures.json", ...oreSource.ownership },
] as const;
