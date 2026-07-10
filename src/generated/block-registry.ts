/**
 * Generated from canonical block files; edits are replaced by the deterministic content compiler.
 * Numeric values remain append-only because chunk bytes and saved edits persist them directly.
 */

import type { CompiledBlockDefinition } from "../engine/content/content-model";

/** BlockId is the stable persisted byte vocabulary for all voxel content. */
export enum BlockId {
  Air = 0, Grass = 1, Dirt = 2, Stone = 3, Sand = 4, Wood = 5, Leaves = 6, Cobblestone = 7,
  Bedrock = 8, Gravel = 9, Clay = 10, Sandstone = 11, RedSand = 12, RedSandstone = 13,
  CoarseDirt = 14, Podzol = 15, Mycelium = 16, Mud = 17, Moss = 18, Snow = 19, Ice = 20,
  PackedIce = 21, BlueIce = 22, Granite = 23, Diorite = 24, Andesite = 25, Deepslate = 26,
  Tuff = 27, Calcite = 28, Dripstone = 29, Terracotta = 30, WhiteTerracotta = 31,
  OrangeTerracotta = 32, YellowTerracotta = 33, RedTerracotta = 34, BrownTerracotta = 35,
  LightGrayTerracotta = 36, CoalOre = 37, IronOre = 38, CopperOre = 39, GoldOre = 40,
  RedstoneOre = 41, LapisOre = 42, DiamondOre = 43, EmeraldOre = 44, DeepslateCoalOre = 45,
  DeepslateIronOre = 46, DeepslateCopperOre = 47, DeepslateGoldOre = 48,
  DeepslateRedstoneOre = 49, DeepslateLapisOre = 50, DeepslateDiamondOre = 51,
  DeepslateEmeraldOre = 52, Water = 53, Lava = 54,
}

type FaceTextures = CompiledBlockDefinition["textures"];

/** Creates the immutable compiled representation shared by gameplay and rendering. */
function block(
  id: BlockId,
  contentId: `${string}:${string}`,
  name: string,
  textures: FaceTextures,
  uiColor: string,
  solid = true,
  occludesFaces = true,
  renderLayer: CompiledBlockDefinition["renderLayer"] = "opaque",
): CompiledBlockDefinition {
  return { id, contentId, name, textures, uiColor, solid, occludesFaces, renderLayer };
}

/** Uses one tile on every cube face while keeping generated records compact and readable. */
function cube(
  id: BlockId,
  contentId: `${string}:${string}`,
  name: string,
  texture: string,
  uiColor: string,
): CompiledBlockDefinition {
  return block(id, contentId, name, { top: texture, bottom: texture, side: texture }, uiColor);
}

// The numeric key keeps block lookup constant-time in collision, meshing, UI, and persistence code.
export const BLOCK_DEFINITIONS: Readonly<Record<BlockId, CompiledBlockDefinition>> = {
  [BlockId.Air]: block(BlockId.Air, "vf:air", "Air", { top: "dirt", bottom: "dirt", side: "dirt" },
    "#000000", false, false, "invisible"),
  [BlockId.Grass]: block(BlockId.Grass, "vf:grass", "Grass",
    { top: "grass-top", bottom: "dirt", side: "grass-side" }, "#6fa640"),
  [BlockId.Dirt]: cube(BlockId.Dirt, "vf:dirt", "Dirt", "dirt", "#8b5a35"),
  [BlockId.Stone]: cube(BlockId.Stone, "vf:stone", "Stone", "stone", "#888888"),
  [BlockId.Sand]: cube(BlockId.Sand, "vf:sand", "Sand", "sand", "#d9c27a"),
  [BlockId.Wood]: block(BlockId.Wood, "vf:wood", "Wood",
    { top: "wood-top", bottom: "wood-top", side: "wood-side" }, "#8a6238"),
  [BlockId.Leaves]: cube(BlockId.Leaves, "vf:leaves", "Leaves", "leaves", "#477f3a"),
  [BlockId.Cobblestone]: cube(BlockId.Cobblestone, "vf:cobblestone", "Cobblestone", "cobblestone", "#6f7374"),
  [BlockId.Bedrock]: cube(BlockId.Bedrock, "vf:bedrock", "Bedrock", "bedrock", "#343434"),
  [BlockId.Gravel]: cube(BlockId.Gravel, "vf:gravel", "Gravel", "gravel", "#777473"),
  [BlockId.Clay]: cube(BlockId.Clay, "vf:clay", "Clay", "clay", "#9ca8b3"),
  [BlockId.Sandstone]: cube(BlockId.Sandstone, "vf:sandstone", "Sandstone", "sandstone", "#d5bd73"),
  [BlockId.RedSand]: cube(BlockId.RedSand, "vf:red_sand", "Red Sand", "red-sand", "#b85f2e"),
  [BlockId.RedSandstone]: cube(BlockId.RedSandstone, "vf:red_sandstone", "Red Sandstone", "red-sandstone",
    "#a94f28"),
  [BlockId.CoarseDirt]: cube(BlockId.CoarseDirt, "vf:coarse_dirt", "Coarse Dirt", "coarse-dirt", "#79543a"),
  [BlockId.Podzol]: block(BlockId.Podzol, "vf:podzol", "Podzol",
    { top: "podzol-top", bottom: "dirt", side: "podzol-side" }, "#705039"),
  [BlockId.Mycelium]: block(BlockId.Mycelium, "vf:mycelium", "Mycelium",
    { top: "mycelium-top", bottom: "dirt", side: "mycelium-side" }, "#786c76"),
  [BlockId.Mud]: cube(BlockId.Mud, "vf:mud", "Mud", "mud", "#3e4148"),
  [BlockId.Moss]: cube(BlockId.Moss, "vf:moss", "Moss", "moss", "#596f2f"),
  [BlockId.Snow]: cube(BlockId.Snow, "vf:snow", "Snow", "snow", "#eef4f5"),
  [BlockId.Ice]: cube(BlockId.Ice, "vf:ice", "Ice", "ice", "#9dcaf4"),
  [BlockId.PackedIce]: cube(BlockId.PackedIce, "vf:packed_ice", "Packed Ice", "packed-ice", "#69a5dc"),
  [BlockId.BlueIce]: cube(BlockId.BlueIce, "vf:blue_ice", "Blue Ice", "blue-ice", "#4c82cf"),
  [BlockId.Granite]: cube(BlockId.Granite, "vf:granite", "Granite", "granite", "#96624d"),
  [BlockId.Diorite]: cube(BlockId.Diorite, "vf:diorite", "Diorite", "diorite", "#c7c7c3"),
  [BlockId.Andesite]: cube(BlockId.Andesite, "vf:andesite", "Andesite", "andesite", "#858786"),
  [BlockId.Deepslate]: cube(BlockId.Deepslate, "vf:deepslate", "Deepslate", "deepslate", "#4c5052"),
  [BlockId.Tuff]: cube(BlockId.Tuff, "vf:tuff", "Tuff", "tuff", "#6d756c"),
  [BlockId.Calcite]: cube(BlockId.Calcite, "vf:calcite", "Calcite", "calcite", "#dedbd0"),
  [BlockId.Dripstone]: cube(BlockId.Dripstone, "vf:dripstone", "Dripstone Block", "dripstone", "#8a654f"),
  [BlockId.Terracotta]: cube(BlockId.Terracotta, "vf:terracotta", "Terracotta", "terracotta", "#985f48"),
  [BlockId.WhiteTerracotta]: cube(BlockId.WhiteTerracotta, "vf:white_terracotta", "White Terracotta",
    "white-terracotta", "#d0b4a1"),
  [BlockId.OrangeTerracotta]: cube(BlockId.OrangeTerracotta, "vf:orange_terracotta", "Orange Terracotta",
    "orange-terracotta", "#a65425"),
  [BlockId.YellowTerracotta]: cube(BlockId.YellowTerracotta, "vf:yellow_terracotta", "Yellow Terracotta",
    "yellow-terracotta", "#ba8524"),
  [BlockId.RedTerracotta]: cube(BlockId.RedTerracotta, "vf:red_terracotta", "Red Terracotta",
    "red-terracotta", "#8e3f32"),
  [BlockId.BrownTerracotta]: cube(BlockId.BrownTerracotta, "vf:brown_terracotta", "Brown Terracotta",
    "brown-terracotta", "#724632"),
  [BlockId.LightGrayTerracotta]: cube(BlockId.LightGrayTerracotta, "vf:light_gray_terracotta",
    "Light Gray Terracotta", "light-gray-terracotta", "#876b62"),
  [BlockId.CoalOre]: cube(BlockId.CoalOre, "vf:coal_ore", "Coal Ore", "coal-ore", "#5a5a58"),
  [BlockId.IronOre]: cube(BlockId.IronOre, "vf:iron_ore", "Iron Ore", "iron-ore", "#b28b72"),
  [BlockId.CopperOre]: cube(BlockId.CopperOre, "vf:copper_ore", "Copper Ore", "copper-ore", "#b06f52"),
  [BlockId.GoldOre]: cube(BlockId.GoldOre, "vf:gold_ore", "Gold Ore", "gold-ore", "#d4bb41"),
  [BlockId.RedstoneOre]: cube(BlockId.RedstoneOre, "vf:redstone_ore", "Redstone Ore", "redstone-ore", "#a52c28"),
  [BlockId.LapisOre]: cube(BlockId.LapisOre, "vf:lapis_ore", "Lapis Ore", "lapis-ore", "#3157a2"),
  [BlockId.DiamondOre]: cube(BlockId.DiamondOre, "vf:diamond_ore", "Diamond Ore", "diamond-ore", "#59bfc1"),
  [BlockId.EmeraldOre]: cube(BlockId.EmeraldOre, "vf:emerald_ore", "Emerald Ore", "emerald-ore", "#3ca866"),
  [BlockId.DeepslateCoalOre]: cube(BlockId.DeepslateCoalOre, "vf:deepslate_coal_ore", "Deepslate Coal Ore",
    "deepslate-coal-ore", "#414446"),
  [BlockId.DeepslateIronOre]: cube(BlockId.DeepslateIronOre, "vf:deepslate_iron_ore", "Deepslate Iron Ore",
    "deepslate-iron-ore", "#8f7465"),
  [BlockId.DeepslateCopperOre]: cube(BlockId.DeepslateCopperOre, "vf:deepslate_copper_ore",
    "Deepslate Copper Ore", "deepslate-copper-ore", "#8a5b4d"),
  [BlockId.DeepslateGoldOre]: cube(BlockId.DeepslateGoldOre, "vf:deepslate_gold_ore", "Deepslate Gold Ore",
    "deepslate-gold-ore", "#b6a23b"),
  [BlockId.DeepslateRedstoneOre]: cube(BlockId.DeepslateRedstoneOre, "vf:deepslate_redstone_ore",
    "Deepslate Redstone Ore", "deepslate-redstone-ore", "#8c2928"),
  [BlockId.DeepslateLapisOre]: cube(BlockId.DeepslateLapisOre, "vf:deepslate_lapis_ore",
    "Deepslate Lapis Ore", "deepslate-lapis-ore", "#2d4d8f"),
  [BlockId.DeepslateDiamondOre]: cube(BlockId.DeepslateDiamondOre, "vf:deepslate_diamond_ore",
    "Deepslate Diamond Ore", "deepslate-diamond-ore", "#50a9ad"),
  [BlockId.DeepslateEmeraldOre]: cube(BlockId.DeepslateEmeraldOre, "vf:deepslate_emerald_ore",
    "Deepslate Emerald Ore", "deepslate-emerald-ore", "#37945d"),
  [BlockId.Water]: block(BlockId.Water, "vf:water", "Water",
    { top: "water", bottom: "water", side: "water" }, "#397fcb", false, false, "translucent"),
  [BlockId.Lava]: block(BlockId.Lava, "vf:lava", "Lava",
    { top: "lava", bottom: "lava", side: "lava" }, "#e66a18", false, false, "translucent"),
};

/** BLOCK_ID_BY_CONTENT_ID resolves authored references to their persisted numeric meaning. */
export const BLOCK_ID_BY_CONTENT_ID = new Map<string, BlockId>(
  Object.values(BLOCK_DEFINITIONS).map((definition) => [definition.contentId, definition.id]),
);

/** HOTBAR_BLOCKS preserves the original seven-slot creative selection order. */
export const HOTBAR_BLOCKS: readonly BlockId[] = [
  BlockId.Grass, BlockId.Dirt, BlockId.Stone, BlockId.Sand, BlockId.Wood, BlockId.Leaves,
  BlockId.Cobblestone,
];
