/**
 * Defines the stable identifiers and metadata shapes shared by every block-aware game system.
 * Keeping the model separate lets the larger block catalog remain modular without circular imports.
 */

/** Numeric block identifiers are stored directly in chunk byte arrays and persisted player edits. */
export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Wood = 5,
  Leaves = 6,
  Cobblestone = 7,
  Bedrock = 8,
  Gravel = 9,
  Clay = 10,
  Sandstone = 11,
  RedSand = 12,
  RedSandstone = 13,
  CoarseDirt = 14,
  Podzol = 15,
  Mycelium = 16,
  Mud = 17,
  Moss = 18,
  Snow = 19,
  Ice = 20,
  PackedIce = 21,
  BlueIce = 22,
  Granite = 23,
  Diorite = 24,
  Andesite = 25,
  Deepslate = 26,
  Tuff = 27,
  Calcite = 28,
  Dripstone = 29,
  Terracotta = 30,
  WhiteTerracotta = 31,
  OrangeTerracotta = 32,
  YellowTerracotta = 33,
  RedTerracotta = 34,
  BrownTerracotta = 35,
  LightGrayTerracotta = 36,
  CoalOre = 37,
  IronOre = 38,
  CopperOre = 39,
  GoldOre = 40,
  RedstoneOre = 41,
  LapisOre = 42,
  DiamondOre = 43,
  EmeraldOre = 44,
  DeepslateCoalOre = 45,
  DeepslateIronOre = 46,
  DeepslateCopperOre = 47,
  DeepslateGoldOre = 48,
  DeepslateRedstoneOre = 49,
  DeepslateLapisOre = 50,
  DeepslateDiamondOre = 51,
  DeepslateEmeraldOre = 52,
}

// Atlas names remain stable because their order determines the UV cell assigned to every block face.
export const TEXTURE_NAMES = [
  "grass-top", "grass-side", "dirt", "stone", "sand", "wood-side", "wood-top", "leaves",
  "cobblestone", "bedrock", "gravel", "clay", "sandstone", "red-sand", "red-sandstone",
  "coarse-dirt", "podzol-top", "podzol-side", "mycelium-top", "mycelium-side", "mud", "moss",
  "snow", "ice", "packed-ice", "blue-ice", "granite", "diorite", "andesite", "deepslate", "tuff",
  "calcite", "dripstone", "terracotta", "white-terracotta", "orange-terracotta", "yellow-terracotta",
  "red-terracotta", "brown-terracotta", "light-gray-terracotta", "coal-ore", "iron-ore", "copper-ore",
  "gold-ore", "redstone-ore", "lapis-ore", "diamond-ore", "emerald-ore", "deepslate-coal-ore",
  "deepslate-iron-ore", "deepslate-copper-ore", "deepslate-gold-ore", "deepslate-redstone-ore",
  "deepslate-lapis-ore", "deepslate-diamond-ore", "deepslate-emerald-ore",
] as const;

/** TextureName restricts block faces and atlas lookups to tiles that are actually generated. */
export type TextureName = (typeof TEXTURE_NAMES)[number];

/** Face categories let capped terrain blocks choose distinct upper, lower, and side textures. */
export type BlockFace = "top" | "bottom" | "side";

/** Shared metadata defines how a block behaves and appears throughout the game. */
export interface BlockDefinition {
  readonly id: BlockId;
  readonly name: string;
  readonly solid: boolean;
  readonly occludesFaces: boolean;
  readonly textures: Readonly<Record<BlockFace, TextureName>>;
  readonly uiColor: string;
}
