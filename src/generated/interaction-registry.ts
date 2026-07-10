/**
 * Generated from canonical loot, dialogue, and trade files with block references resolved to numeric IDs.
 * Interaction systems consume safe data graphs and never execute content-provided code.
 */

import { BlockId } from "../game/block-types";

/** LOOT_TABLES contains bounded independent drop chances for entity deaths. */
export const LOOT_TABLES = [
  { id: "vf:cartographer_loot", entries: [
    { blockId: BlockId.Clay, chance: 0.35, min: 1, max: 2 },
  ] },
  { id: "vf:stoneback_loot", entries: [
    { blockId: BlockId.Cobblestone, chance: 0.85, min: 1, max: 3 },
    { blockId: BlockId.IronOre, chance: 0.22, min: 1, max: 1 },
    { blockId: BlockId.EmeraldOre, chance: 0.12, min: 1, max: 1 },
  ] },
  { id: "vf:mossling_loot", entries: [
    { blockId: BlockId.Moss, chance: 0.7, min: 1, max: 2 },
  ] },
] as const;

/** DIALOGUE_DEFINITIONS contains validated finite conversation graphs. */
export const DIALOGUE_DEFINITIONS = [
  {
    id: "vf:cartographer_dialogue",
    startNodeId: "welcome",
    nodes: [
      { id: "welcome", text: "The land changes with every seed, but landmarks still tell a story.",
        choices: [{ text: "Any advice?", nextNodeId: "advice" }, { text: "Goodbye." }] },
      { id: "advice", text: "Follow stone ridges for ore, and carry blocks before crossing deep valleys.",
        choices: [{ text: "Thanks." }] },
    ],
  },
] as const;

/** TRADE_TABLES contains bounded block-for-block exchanges for NPC interaction. */
export const TRADE_TABLES = [
  {
    id: "vf:cartographer_trades",
    offers: [
      { costBlockId: BlockId.EmeraldOre, costCount: 1, resultBlockId: BlockId.Stone,
        resultCount: 12, maxUses: 8 },
      { costBlockId: BlockId.EmeraldOre, costCount: 1, resultBlockId: BlockId.Wood,
        resultCount: 8, maxUses: 6 },
      { costBlockId: BlockId.EmeraldOre, costCount: 2, resultBlockId: BlockId.PackedIce,
        resultCount: 6, maxUses: 4 },
    ],
  },
] as const;
