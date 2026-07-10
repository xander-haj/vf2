/**
 * Declares the behavior, face textures, names, and interface colors for every supported block.
 * Terrain, meshing, collision, persistence, and selection all consume this single authoritative catalog.
 */

import { BlockId, type BlockDefinition, type TextureName } from "./block-model";

/** Creates metadata for an opaque cube that uses the same atlas tile on all six faces. */
function cube(id: BlockId, name: string, texture: TextureName, uiColor: string): BlockDefinition {
  return {
    id,
    name,
    solid: true,
    occludesFaces: true,
    textures: { top: texture, bottom: texture, side: texture },
    uiColor,
  };
}

/** Creates metadata for a capped cube whose top, bottom, and side communicate different strata. */
function capped(
  id: BlockId,
  name: string,
  top: TextureName,
  bottom: TextureName,
  side: TextureName,
  uiColor: string,
): BlockDefinition {
  return {
    id,
    name,
    solid: true,
    occludesFaces: true,
    textures: { top, bottom, side },
    uiColor,
  };
}

// Block IDs are append-only so worlds saved by earlier releases retain the meaning of every stored byte.
export const BLOCK_DEFINITIONS: Readonly<Record<BlockId, BlockDefinition>> = {
  [BlockId.Air]: {
    id: BlockId.Air,
    name: "Air",
    solid: false,
    occludesFaces: false,
    textures: { top: "dirt", bottom: "dirt", side: "dirt" },
    uiColor: "#000000",
  },
  [BlockId.Grass]: capped(BlockId.Grass, "Grass", "grass-top", "dirt", "grass-side", "#6fa640"),
  [BlockId.Dirt]: cube(BlockId.Dirt, "Dirt", "dirt", "#8b5a35"),
  [BlockId.Stone]: cube(BlockId.Stone, "Stone", "stone", "#888888"),
  [BlockId.Sand]: cube(BlockId.Sand, "Sand", "sand", "#d9c27a"),
  [BlockId.Wood]: capped(BlockId.Wood, "Wood", "wood-top", "wood-top", "wood-side", "#8a6238"),
  [BlockId.Leaves]: cube(BlockId.Leaves, "Leaves", "leaves", "#477f3a"),
  [BlockId.Cobblestone]: cube(BlockId.Cobblestone, "Cobblestone", "cobblestone", "#6f7374"),
  [BlockId.Bedrock]: cube(BlockId.Bedrock, "Bedrock", "bedrock", "#343434"),
  [BlockId.Gravel]: cube(BlockId.Gravel, "Gravel", "gravel", "#777473"),
  [BlockId.Clay]: cube(BlockId.Clay, "Clay", "clay", "#9ca8b3"),
  [BlockId.Sandstone]: cube(BlockId.Sandstone, "Sandstone", "sandstone", "#d5bd73"),
  [BlockId.RedSand]: cube(BlockId.RedSand, "Red Sand", "red-sand", "#b85f2e"),
  [BlockId.RedSandstone]: cube(BlockId.RedSandstone, "Red Sandstone", "red-sandstone", "#a94f28"),
  [BlockId.CoarseDirt]: cube(BlockId.CoarseDirt, "Coarse Dirt", "coarse-dirt", "#79543a"),
  [BlockId.Podzol]: capped(BlockId.Podzol, "Podzol", "podzol-top", "dirt", "podzol-side", "#705039"),
  [BlockId.Mycelium]: capped(
    BlockId.Mycelium,
    "Mycelium",
    "mycelium-top",
    "dirt",
    "mycelium-side",
    "#786c76",
  ),
  [BlockId.Mud]: cube(BlockId.Mud, "Mud", "mud", "#3e4148"),
  [BlockId.Moss]: cube(BlockId.Moss, "Moss", "moss", "#596f2f"),
  [BlockId.Snow]: cube(BlockId.Snow, "Snow", "snow", "#eef4f5"),
  [BlockId.Ice]: cube(BlockId.Ice, "Ice", "ice", "#9dcaf4"),
  [BlockId.PackedIce]: cube(BlockId.PackedIce, "Packed Ice", "packed-ice", "#69a5dc"),
  [BlockId.BlueIce]: cube(BlockId.BlueIce, "Blue Ice", "blue-ice", "#4c82cf"),
  [BlockId.Granite]: cube(BlockId.Granite, "Granite", "granite", "#96624d"),
  [BlockId.Diorite]: cube(BlockId.Diorite, "Diorite", "diorite", "#c7c7c3"),
  [BlockId.Andesite]: cube(BlockId.Andesite, "Andesite", "andesite", "#858786"),
  [BlockId.Deepslate]: cube(BlockId.Deepslate, "Deepslate", "deepslate", "#4c5052"),
  [BlockId.Tuff]: cube(BlockId.Tuff, "Tuff", "tuff", "#6d756c"),
  [BlockId.Calcite]: cube(BlockId.Calcite, "Calcite", "calcite", "#dedbd0"),
  [BlockId.Dripstone]: cube(BlockId.Dripstone, "Dripstone Block", "dripstone", "#8a654f"),
  [BlockId.Terracotta]: cube(BlockId.Terracotta, "Terracotta", "terracotta", "#985f48"),
  [BlockId.WhiteTerracotta]: cube(BlockId.WhiteTerracotta, "White Terracotta", "white-terracotta", "#d0b4a1"),
  [BlockId.OrangeTerracotta]: cube(
    BlockId.OrangeTerracotta,
    "Orange Terracotta",
    "orange-terracotta",
    "#a65425",
  ),
  [BlockId.YellowTerracotta]: cube(
    BlockId.YellowTerracotta,
    "Yellow Terracotta",
    "yellow-terracotta",
    "#ba8524",
  ),
  [BlockId.RedTerracotta]: cube(BlockId.RedTerracotta, "Red Terracotta", "red-terracotta", "#8e3f32"),
  [BlockId.BrownTerracotta]: cube(
    BlockId.BrownTerracotta,
    "Brown Terracotta",
    "brown-terracotta",
    "#724632",
  ),
  [BlockId.LightGrayTerracotta]: cube(
    BlockId.LightGrayTerracotta,
    "Light Gray Terracotta",
    "light-gray-terracotta",
    "#876b62",
  ),
  [BlockId.CoalOre]: cube(BlockId.CoalOre, "Coal Ore", "coal-ore", "#5a5a58"),
  [BlockId.IronOre]: cube(BlockId.IronOre, "Iron Ore", "iron-ore", "#b28b72"),
  [BlockId.CopperOre]: cube(BlockId.CopperOre, "Copper Ore", "copper-ore", "#b06f52"),
  [BlockId.GoldOre]: cube(BlockId.GoldOre, "Gold Ore", "gold-ore", "#d4bb41"),
  [BlockId.RedstoneOre]: cube(BlockId.RedstoneOre, "Redstone Ore", "redstone-ore", "#a52c28"),
  [BlockId.LapisOre]: cube(BlockId.LapisOre, "Lapis Ore", "lapis-ore", "#3157a2"),
  [BlockId.DiamondOre]: cube(BlockId.DiamondOre, "Diamond Ore", "diamond-ore", "#59bfc1"),
  [BlockId.EmeraldOre]: cube(BlockId.EmeraldOre, "Emerald Ore", "emerald-ore", "#3ca866"),
  [BlockId.DeepslateCoalOre]: cube(
    BlockId.DeepslateCoalOre,
    "Deepslate Coal Ore",
    "deepslate-coal-ore",
    "#414446",
  ),
  [BlockId.DeepslateIronOre]: cube(
    BlockId.DeepslateIronOre,
    "Deepslate Iron Ore",
    "deepslate-iron-ore",
    "#8f7465",
  ),
  [BlockId.DeepslateCopperOre]: cube(
    BlockId.DeepslateCopperOre,
    "Deepslate Copper Ore",
    "deepslate-copper-ore",
    "#8a5b4d",
  ),
  [BlockId.DeepslateGoldOre]: cube(
    BlockId.DeepslateGoldOre,
    "Deepslate Gold Ore",
    "deepslate-gold-ore",
    "#b6a23b",
  ),
  [BlockId.DeepslateRedstoneOre]: cube(
    BlockId.DeepslateRedstoneOre,
    "Deepslate Redstone Ore",
    "deepslate-redstone-ore",
    "#8c2928",
  ),
  [BlockId.DeepslateLapisOre]: cube(
    BlockId.DeepslateLapisOre,
    "Deepslate Lapis Ore",
    "deepslate-lapis-ore",
    "#2d4d8f",
  ),
  [BlockId.DeepslateDiamondOre]: cube(
    BlockId.DeepslateDiamondOre,
    "Deepslate Diamond Ore",
    "deepslate-diamond-ore",
    "#50a9ad",
  ),
  [BlockId.DeepslateEmeraldOre]: cube(
    BlockId.DeepslateEmeraldOre,
    "Deepslate Emerald Ore",
    "deepslate-emerald-ore",
    "#37945d",
  ),
};

// The compact creative hotbar remains stable so number keys and existing player habits do not change.
export const HOTBAR_BLOCKS: readonly BlockId[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Wood,
  BlockId.Leaves,
  BlockId.Cobblestone,
];
