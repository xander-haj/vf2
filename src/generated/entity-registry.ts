/**
 * Generated from canonical NPC, enemy, and animation content.
 * Definitions remain plain readonly data so simulation systems can provide their own structural typing.
 */

/** ENTITY_DEFINITIONS contains every spawnable actor type. */
export const ENTITY_DEFINITIONS = [
  {
    id: "vf:cartographer",
    definitionVersion: 1,
    displayName: "Frontier Cartographer",
    category: "npc",
    factionId: "vf:settlers",
    hostileTo: [],
    persistence: "persistent",
    modelAssetId: "vf:cartographer_model",
    animationSetId: "vf:humanoid_motion",
    behaviorGraphId: "vf:cartographer_behavior",
    spawnRuleId: "vf:cartographer_spawn",
    maxHealth: 24,
    dimensions: { width: 0.72, height: 2.08 },
    speed: 1.8,
    attack: { damage: 1, range: 1.5, cooldownSeconds: 1.2 },
    perception: { range: 14, fieldOfViewDegrees: 150, memorySeconds: 6 },
    dialogueId: "vf:cartographer_dialogue",
    tradeTableId: "vf:cartographer_trades",
    lootTableId: "vf:cartographer_loot",
  },
  {
    id: "vf:stoneback",
    definitionVersion: 1,
    displayName: "Stoneback",
    category: "hostile",
    factionId: "vf:stonebacks",
    hostileTo: ["vf:player", "vf:settlers"],
    persistence: "despawn",
    modelAssetId: "vf:stoneback_model",
    animationSetId: "vf:brute_motion",
    behaviorGraphId: "vf:stoneback_behavior",
    spawnRuleId: "vf:stoneback_spawn",
    maxHealth: 32,
    dimensions: { width: 1.15, height: 1.8 },
    speed: 3.6,
    attack: { damage: 5, range: 1.7, cooldownSeconds: 1.35 },
    perception: { range: 18, fieldOfViewDegrees: 125, memorySeconds: 8 },
    lootTableId: "vf:stoneback_loot",
  },
  {
    id: "vf:mossling",
    definitionVersion: 1,
    displayName: "Mossling",
    category: "passive",
    factionId: "vf:wildlife",
    hostileTo: [],
    persistence: "persistent",
    modelAssetId: "vf:mossling_model",
    animationSetId: "vf:mossling_motion",
    behaviorGraphId: "vf:mossling_behavior",
    spawnRuleId: "vf:mossling_spawn",
    maxHealth: 12,
    dimensions: { width: 0.78, height: 1.25 },
    speed: 2.1,
    attack: { damage: 0, range: 1, cooldownSeconds: 1 },
    perception: { range: 11, fieldOfViewDegrees: 220, memorySeconds: 5 },
    lootTableId: "vf:mossling_loot",
  },
] as const;

/** ENTITY_ANIMATION_SETS configures deterministic procedural motion by simulation state. */
export const ENTITY_ANIMATION_SETS = [
  {
    id: "vf:humanoid_motion",
    states: [
      { id: "idle", speedMaximum: 0.08, cycleSeconds: 2.4, legSwingDegrees: 2, armSwingDegrees: 3 },
      { id: "walk", speedMaximum: 2.4, cycleSeconds: 0.82, legSwingDegrees: 28, armSwingDegrees: 24 },
      { id: "run", speedMaximum: 10, cycleSeconds: 0.48, legSwingDegrees: 42, armSwingDegrees: 38 },
    ],
    attack: { durationSeconds: 0.55, armSwingDegrees: 75 },
    hurt: { durationSeconds: 0.3, bodyTiltDegrees: 9 },
  },
  {
    id: "vf:brute_motion",
    states: [
      { id: "idle", speedMaximum: 0.08, cycleSeconds: 2.8, legSwingDegrees: 1, armSwingDegrees: 4 },
      { id: "walk", speedMaximum: 2.2, cycleSeconds: 0.9, legSwingDegrees: 24, armSwingDegrees: 30 },
      { id: "run", speedMaximum: 10, cycleSeconds: 0.52, legSwingDegrees: 38, armSwingDegrees: 46 },
    ],
    attack: { durationSeconds: 0.7, armSwingDegrees: 95 },
    hurt: { durationSeconds: 0.36, bodyTiltDegrees: 12 },
  },
  {
    id: "vf:mossling_motion",
    states: [
      { id: "idle", speedMaximum: 0.08, cycleSeconds: 2.1, legSwingDegrees: 1, armSwingDegrees: 0 },
      { id: "walk", speedMaximum: 1.8, cycleSeconds: 0.72, legSwingDegrees: 18, armSwingDegrees: 0 },
      { id: "run", speedMaximum: 10, cycleSeconds: 0.4, legSwingDegrees: 32, armSwingDegrees: 0 },
    ],
    attack: { durationSeconds: 0.4, armSwingDegrees: 0 },
    hurt: { durationSeconds: 0.28, bodyTiltDegrees: 8 },
  },
] as const;
