/**
 * Supplies compact procedural color recipes for every atlas tile used by the block catalog.
 * Data-driven recipes keep the expanded terrain artwork complete without copied binary assets.
 */

import type { TextureName } from "./block-model";

/** Pattern names select a small reusable overlay after deterministic base noise is painted. */
export type TexturePattern =
  | "noise"
  | "cap-side"
  | "wood-side"
  | "wood-top"
  | "cobblestone"
  | "strata"
  | "ice"
  | "ore"
  | "bedrock";

/** A recipe defines the palette and optional structural accent for one original pixel texture. */
export interface TextureRecipe {
  readonly baseColor: string;
  readonly fleckColors: readonly string[];
  readonly salt: number;
  readonly pattern: TexturePattern;
  readonly accentColor?: string;
}

/** Creates a complete immutable recipe while defaulting ordinary blocks to deterministic noise. */
function recipe(
  baseColor: string,
  fleckColors: readonly string[],
  salt: number,
  pattern: TexturePattern = "noise",
  accentColor?: string,
): TextureRecipe {
  return { baseColor, fleckColors, salt, pattern, accentColor };
}

// Salts differ per material so similarly colored tiles do not repeat the same fleck arrangement.
export const BLOCK_TEXTURE_RECIPES: Readonly<Record<TextureName, TextureRecipe>> = {
  "grass-top": recipe("#6fa844", ["#82b94f", "#568d37", "#91c35a"], 11),
  "grass-side": recipe("#8a5a36", ["#74482d", "#9d6a42"], 23, "cap-side", "#6fa844"),
  dirt: recipe("#895b39", ["#6f452c", "#a06b42", "#7d5031"], 31),
  stone: recipe("#888b8d", ["#747779", "#9b9ea0", "#686b6d"], 43),
  sand: recipe("#d8c47e", ["#ead995", "#c5af68", "#dfcb86"], 59),
  "wood-side": recipe("#8b643b", ["#76512f", "#a17a4a"], 71, "wood-side", "#6e4a2b"),
  "wood-top": recipe("#aa7d49", ["#95673a", "#bd925b"], 83, "wood-top", "#79512f"),
  leaves: recipe("#477e3a", ["#599348", "#356b30", "#6aa653"], 97),
  cobblestone: recipe("#707577", ["#5c6062", "#898d8f"], 109, "cobblestone", "#54595b"),
  bedrock: recipe("#3b3b3b", ["#222222", "#555555", "#696969"], 127, "bedrock", "#181818"),
  gravel: recipe("#7c7977", ["#5f5c5a", "#999491", "#6d6968"], 139),
  clay: recipe("#9da8b2", ["#8996a3", "#b2bbc2", "#929da8"], 149),
  sandstone: recipe("#d7c27c", ["#c6ae68", "#ead795"], 163, "strata", "#bda35e"),
  "red-sand": recipe("#b96130", ["#a44c24", "#cd7139", "#98502c"], 173),
  "red-sandstone": recipe("#ad552a", ["#963f21", "#c26734"], 181, "strata", "#84391e"),
  "coarse-dirt": recipe("#76513a", ["#9a7654", "#564032", "#b08b61"], 193),
  "podzol-top": recipe("#6e4b32", ["#85603f", "#4f382a", "#9b774d"], 211),
  "podzol-side": recipe("#875a38", ["#70472d", "#9d6a42"], 223, "cap-side", "#705039"),
  "mycelium-top": recipe("#766d79", ["#938797", "#5f5865", "#a59aa8"], 227),
  "mycelium-side": recipe("#875a38", ["#70472d", "#9d6a42"], 233, "cap-side", "#786c76"),
  mud: recipe("#41434a", ["#33363d", "#53555d", "#2c3036"], 239),
  moss: recipe("#596f31", ["#6d843c", "#465c28", "#79934a"], 251),
  snow: recipe("#edf3f4", ["#ffffff", "#d9e4e8", "#e5eef1"], 263),
  ice: recipe("#9bc9f2", ["#b8dcfa", "#79b2e5"], 269, "ice", "#d8efff"),
  "packed-ice": recipe("#6aa5dc", ["#84b8e5", "#548fca"], 277, "ice", "#b4d8f3"),
  "blue-ice": recipe("#4b82ce", ["#6096dc", "#376db9"], 281, "ice", "#8ab7ed"),
  granite: recipe("#96644e", ["#784b3e", "#b17b61", "#835544"], 293),
  diorite: recipe("#c5c5c1", ["#a8aaa8", "#e0ded7", "#8f9290"], 307),
  andesite: recipe("#858786", ["#6f7272", "#9a9c99", "#777a79"], 311),
  deepslate: recipe("#4b4f52", ["#383c3e", "#606467", "#424648"], 317, "strata", "#34383a"),
  tuff: recipe("#6c746b", ["#59615b", "#81897c", "#626a62"], 331),
  calcite: recipe("#dedbd1", ["#c9c7bf", "#efede4", "#d4d0c5"], 337),
  dripstone: recipe("#8b6650", ["#724e3d", "#a47c60", "#795744"], 347, "strata", "#684434"),
  terracotta: recipe("#985f49", ["#87513e", "#ad7158"], 349, "strata", "#7e4937"),
  "white-terracotta": recipe("#d0b4a1", ["#bea08f", "#dec5b2"], 353, "strata", "#b79683"),
  "orange-terracotta": recipe("#a65326", ["#8d431f", "#bd6531"], 359, "strata", "#7c391b"),
  "yellow-terracotta": recipe("#ba8524", ["#a5721e", "#cf9a2e"], 367, "strata", "#936019"),
  "red-terracotta": recipe("#8e3f32", ["#773228", "#a34e3e"], 373, "strata", "#682820"),
  "brown-terracotta": recipe("#724632", ["#5d3527", "#895842"], 379, "strata", "#4e2b21"),
  "light-gray-terracotta": recipe("#876b62", ["#745951", "#9b7f74"], 383, "strata", "#644b45"),
  "coal-ore": recipe("#85888a", ["#717476", "#96999b"], 389, "ore", "#262626"),
  "iron-ore": recipe("#85888a", ["#717476", "#96999b"], 397, "ore", "#b7886c"),
  "copper-ore": recipe("#85888a", ["#717476", "#96999b"], 401, "ore", "#b26747"),
  "gold-ore": recipe("#85888a", ["#717476", "#96999b"], 409, "ore", "#e1c33d"),
  "redstone-ore": recipe("#85888a", ["#717476", "#96999b"], 419, "ore", "#bd2727"),
  "lapis-ore": recipe("#85888a", ["#717476", "#96999b"], 421, "ore", "#2852ad"),
  "diamond-ore": recipe("#85888a", ["#717476", "#96999b"], 431, "ore", "#4fc5c7"),
  "emerald-ore": recipe("#85888a", ["#717476", "#96999b"], 433, "ore", "#30b66a"),
  "deepslate-coal-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 439, "ore", "#202020"),
  "deepslate-iron-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 443, "ore", "#ad8067"),
  "deepslate-copper-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 449, "ore", "#aa6245"),
  "deepslate-gold-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 457, "ore", "#dfbf37"),
  "deepslate-redstone-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 461, "ore", "#b92727"),
  "deepslate-lapis-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 463, "ore", "#2952a8"),
  "deepslate-diamond-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 467, "ore", "#4bbec1"),
  "deepslate-emerald-ore": recipe("#4b4f52", ["#383c3e", "#606467"], 479, "ore", "#31aa64"),
};
