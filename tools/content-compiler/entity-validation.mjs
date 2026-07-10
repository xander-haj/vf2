/**
 * Validates entity definitions, behavior graphs, animations, spawning, loot, dialogue, and trades.
 * Graph validation rejects arbitrary operation names, dangling children, and every reachable cycle.
 */

import {
  NAMESPACED_ID_PATTERN,
  requireArray,
  requireChoice,
  requireInteger,
  requireNumber,
  requireObject,
  requireRange,
  requireReference,
  requireString,
  requireUniqueId,
  validateSchema,
} from "./common-validation.mjs";

const ENTITY_FILES = ["content/entities/npcs.json", "content/entities/enemies.json", "content/entities/passive.json"];
const CONDITIONS = ["player_alive", "has_target", "can_see_player", "target_in_attack_range",
  "can_see_target", "health_below_ratio", "player_in_interaction_range", "is_hostile"];
const ACTIONS = ["idle", "acquire_player", "look_at_player", "random_stroll", "patrol", "chase_target",
  "flee_player", "melee_attack", "interact_player", "clear_target", "wait", "acquire_hostile",
  "look_at_target", "follow_target", "ranged_attack", "play_animation", "emit_event", "change_state"];

/** Validates all entity authoring domains and their complete reference graph. */
export function validateEntities(documents, indexes, collector) {
  const graphData = validateGraphs(documents, collector);
  const animationIds = validateAnimations(documents, collector);
  const spawnData = collectIdentified(documents, "content/spawn-rules/entity-spawns.json", "spawnRules",
    "spawn rule", collector);
  const lootData = collectIdentified(documents, "content/loot/entity-loot.json", "lootTables", "loot table",
    collector);
  const dialogueData = collectIdentified(documents, "content/dialogue/npc-dialogue.json", "dialogues", "dialogue",
    collector);
  const tradeData = collectIdentified(documents, "content/trading/npc-trades.json", "tradeTables", "trade table",
    collector);
  const entityIds = new Set();
  const factionIds = new Set(["vf:player"]);
  const entities = [];
  for (const file of ENTITY_FILES) {
    const document = validateSchema(documents.get(file), collector, file);
    requireArray(document?.entities, collector, file, "$.entities").forEach((value, index) => {
      const path = `$.entities[${index}]`;
      const entity = requireObject(value, collector, file, path);
      if (entity === null) return;
      const id = requireString(entity.id, collector, file, `${path}.id`, NAMESPACED_ID_PATTERN);
      requireUniqueId(id, entityIds, collector, file, `${path}.id`, "entity");
      requireInteger(entity.definitionVersion, collector, file, `${path}.definitionVersion`, 1);
      requireString(entity.displayName, collector, file, `${path}.displayName`);
      requireChoice(entity.category, ["npc", "passive", "hostile"], collector, file, `${path}.category`);
      requireString(entity.factionId, collector, file, `${path}.factionId`, NAMESPACED_ID_PATTERN);
      if (typeof entity.factionId === "string") factionIds.add(entity.factionId);
      requireArray(entity.hostileTo, collector, file, `${path}.hostileTo`).forEach((faction, factionIndex) =>
        requireString(faction, collector, file, `${path}.hostileTo[${factionIndex}]`, NAMESPACED_ID_PATTERN));
      if (Array.isArray(entity.hostileTo) && new Set(entity.hostileTo).size !== entity.hostileTo.length) {
        collector.add(file, `${path}.hostileTo`, "duplicate-faction", "hostileTo cannot repeat a faction ID.");
      }
      requireChoice(entity.persistence, ["persistent", "despawn"], collector, file, `${path}.persistence`);
      requireReference(entity.modelAssetId, indexes.assetIds, collector, file, `${path}.modelAssetId`, "asset");
      requireReference(entity.behaviorGraphId, graphData.ids, collector, file, `${path}.behaviorGraphId`,
        "behavior graph");
      requireReference(entity.animationSetId, animationIds, collector, file, `${path}.animationSetId`, "animation");
      requireReference(entity.spawnRuleId, spawnData.ids, collector, file, `${path}.spawnRuleId`, "spawn rule");
      requireReference(entity.lootTableId, lootData.ids, collector, file, `${path}.lootTableId`, "loot table");
      if (entity.dialogueId !== undefined) requireReference(entity.dialogueId, dialogueData.ids, collector, file,
        `${path}.dialogueId`, "dialogue");
      if (entity.tradeTableId !== undefined) requireReference(entity.tradeTableId, tradeData.ids, collector, file,
        `${path}.tradeTableId`, "trade table");
      if (entity.tradeTableId !== undefined && entity.dialogueId === undefined) collector.add(file,
        `${path}.tradeTableId`, "inaccessible-trade", "A trading entity must also define dialogueId.");
      requireInteger(entity.maxHealth, collector, file, `${path}.maxHealth`, 1, 100000);
      requireNumber(entity.speed, collector, file, `${path}.speed`, 0, 32);
      validateEntityProperties(entity, collector, file, path);
      entities.push(entity);
    });
  }
  for (const entity of entities) {
    const rule = spawnData.records.find((candidate) => candidate.id === entity.spawnRuleId);
    if (rule !== undefined && rule.entityId !== entity.id) collector.add("content/entities",
      `$.entities.${entity.id}.spawnRuleId`, "spawn-owner-mismatch",
      `Spawn rule ${rule.id} belongs to ${String(rule.entityId)}, not ${entity.id}.`);
  }
  for (const entity of entities) for (const faction of Array.isArray(entity.hostileTo) ? entity.hostileTo : []) {
    if (!factionIds.has(faction)) collector.add("content/entities", `$.entities.${entity.id}.hostileTo`,
      "missing-reference", `Unknown faction ID ${faction}.`);
  }
  validateSpawnRules(spawnData.records, entityIds, indexes.biomeIds, collector);
  validateLoot(lootData.records, indexes.blockIds, collector);
  validateDialogue(dialogueData.records, collector);
  validateTrades(tradeData.records, indexes.blockIds, collector);
  return { entities, graphs: graphData.records, spawnRules: spawnData.records };
}

/** Collects one identified array and rejects duplicate namespaced IDs. */
function collectIdentified(documents, file, property, category, collector) {
  const document = validateSchema(documents.get(file), collector, file);
  const sourceRecords = requireArray(document?.[property], collector, file, `$.${property}`);
  const records = [];
  const ids = new Set();
  sourceRecords.forEach((value, index) => {
    const record = requireObject(value, collector, file, `$.${property}[${index}]`);
    if (record === null) return;
    const id = requireString(record.id, collector, file, `$.${property}[${index}].id`, NAMESPACED_ID_PATTERN);
    requireUniqueId(id, ids, collector, file, `$.${property}[${index}].id`, category);
    records.push(record);
  });
  return { file, property, records, ids };
}

/** Validates physical, combat, and perception values consumed directly by simulation loops. */
function validateEntityProperties(entity, collector, file, path) {
  const dimensions = requireObject(entity.dimensions, collector, file, `${path}.dimensions`);
  requireNumber(dimensions?.width, collector, file, `${path}.dimensions.width`, 0.1, 8);
  requireNumber(dimensions?.height, collector, file, `${path}.dimensions.height`, 0.1, 16);
  const attack = requireObject(entity.attack, collector, file, `${path}.attack`);
  requireNumber(attack?.damage, collector, file, `${path}.attack.damage`, 0, 10000);
  requireNumber(attack?.range, collector, file, `${path}.attack.range`, 0, 32);
  requireNumber(attack?.cooldownSeconds, collector, file, `${path}.attack.cooldownSeconds`, 0.05, 60);
  const perception = requireObject(entity.perception, collector, file, `${path}.perception`);
  requireNumber(perception?.range, collector, file, `${path}.perception.range`, 0, 128);
  requireNumber(perception?.fieldOfViewDegrees, collector, file, `${path}.perception.fieldOfViewDegrees`, 1, 360);
  requireNumber(perception?.memorySeconds, collector, file, `${path}.perception.memorySeconds`, 0, 300);
}

/** Validates safe operation names, child references, roots, and cycles for every behavior graph. */
function validateGraphs(documents, collector) {
  const data = collectIdentified(documents, "content/behaviors/entity-behaviors.json", "graphs",
    "behavior graph", collector);
  for (const graph of data.records) {
    const nodes = requireArray(graph.nodes, collector, data.file, `$.graphs.${graph.id}.nodes`);
    const nodeIds = new Set();
    const nodeMap = new Map();
    nodes.forEach((node, index) => {
      const path = `$.graphs.${graph.id}.nodes[${index}]`;
      const id = requireString(node?.id, collector, data.file, `${path}.id`, /^[a-z][a-z0-9-]*$/);
      requireUniqueId(id, nodeIds, collector, data.file, `${path}.id`, "behavior node");
      if (id !== null) nodeMap.set(id, node);
      const type = requireChoice(node?.type, ["selector", "sequence", "condition", "action", "cooldown", "repeat"],
        collector, data.file, `${path}.type`);
      if (type === "condition") requireChoice(node.condition, CONDITIONS, collector, data.file, `${path}.condition`);
      if (type === "condition") validateConditionParameters(node, collector, data.file, path);
      if (type === "action") requireChoice(node.action, ACTIONS, collector, data.file, `${path}.action`);
      if (type === "action") validateActionParameters(node, collector, data.file, path);
      if (["selector", "sequence", "cooldown", "repeat"].includes(type)) {
        const children = requireArray(node.children, collector, data.file, `${path}.children`);
        if ((type === "selector" || type === "sequence") && children.length === 0) collector.add(data.file,
          `${path}.children`, "empty-composite", "Selector and sequence nodes require at least one child.");
        if ((type === "cooldown" || type === "repeat") && children.length !== 1) collector.add(data.file,
          `${path}.children`, "invalid-decorator", "Decorator nodes require exactly one child.");
      }
      if (type === "cooldown") requireNumber(node.seconds, collector, data.file, `${path}.seconds`, 0, 3600);
      if (type === "repeat") requireInteger(node.count, collector, data.file, `${path}.count`, 1, 16);
    });
    requireString(graph.rootNodeId, collector, data.file, `$.graphs.${graph.id}.rootNodeId`);
    if (!nodeIds.has(graph.rootNodeId)) collector.add(data.file, `$.graphs.${graph.id}.rootNodeId`,
      "missing-root", "Behavior root must reference a node in the same graph.");
    for (const [id, node] of nodeMap) for (const child of node.children ?? []) {
      if (!nodeIds.has(child)) collector.add(data.file, `$.graphs.${graph.id}.nodes.${id}.children`,
        "missing-child", `Unknown behavior child ${child}.`);
    }
    detectGraphCycle(graph, nodeMap, collector, data.file);
    validateGraphReachability(graph, nodeMap, collector, data.file);
  }
  return data;
}

/** Validates bounded parameters used by conditions with authored thresholds. */
function validateConditionParameters(node, collector, file, path) {
  const parameters = node.parameters === undefined ? {} : requireObject(node.parameters, collector, file,
    `${path}.parameters`);
  if (parameters === null) return;
  if (node.condition === "health_below_ratio") requireNumber(parameters.ratio, collector, file,
    `${path}.parameters.ratio`, 0, 1);
  if (node.condition === "player_in_interaction_range") requireNumber(parameters.range, collector, file,
    `${path}.parameters.range`, 0.1, 64);
}

/** Rejects orphaned nodes because editor-visible logic must participate in the executed root graph. */
function validateGraphReachability(graph, nodeMap, collector, file) {
  const reachable = new Set();
  const visit = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const child of nodeMap.get(id)?.children ?? []) visit(child);
  };
  visit(graph.rootNodeId);
  for (const id of nodeMap.keys()) if (!reachable.has(id)) collector.add(file,
    `$.graphs.${graph.id}.nodes.${id}`, "unreachable-node", `Behavior node ${id} is unreachable from the root.`);
}

/** Validates the parameter contract for actions that carry authored data beyond their allowlisted name. */
function validateActionParameters(node, collector, file, path) {
  const parameters = node.parameters === undefined ? {} : requireObject(node.parameters, collector, file,
    `${path}.parameters`);
  if (parameters === null) return;
  if (node.action === "wait") requireNumber(parameters.seconds, collector, file,
    `${path}.parameters.seconds`, 0.05, 3600);
  if (node.action === "random_stroll" || node.action === "patrol") {
    requireNumber(parameters.intervalSeconds, collector, file, `${path}.parameters.intervalSeconds`, 0.5, 300);
    requireNumber(parameters.idleChance, collector, file, `${path}.parameters.idleChance`, 0, 1);
  }
  if (node.action === "play_animation") {
    requireString(parameters.animationId, collector, file, `${path}.parameters.animationId`,
      /^[a-z][a-z0-9_-]*$/);
    requireNumber(parameters.durationSeconds, collector, file, `${path}.parameters.durationSeconds`, 0.05, 60);
  }
  if (node.action === "emit_event") requireString(parameters.eventId, collector, file,
    `${path}.parameters.eventId`, NAMESPACED_ID_PATTERN);
  if (node.action === "change_state") {
    requireString(parameters.key, collector, file, `${path}.parameters.key`, /^[a-z][a-z0-9_.-]*$/);
    if (!["string", "number", "boolean"].includes(typeof parameters.value)) collector.add(file,
      `${path}.parameters.value`, "invalid-state-value", "State values must be strings, finite numbers, or booleans.");
    if (typeof parameters.value === "number" && !Number.isFinite(parameters.value)) collector.add(file,
      `${path}.parameters.value`, "invalid-state-value", "Numeric state values must be finite.");
  }
}

/** Uses depth-first traversal states to report any cycle reachable from any authored graph node. */
function detectGraphCycle(graph, nodeMap, collector, file) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      collector.add(file, `$.graphs.${graph.id}.nodes.${id}`, "graph-cycle", `Behavior graph cycles through ${id}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of nodeMap.get(id)?.children ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodeMap.keys()) visit(id);
}

/** Validates animation state thresholds and bounded procedural motion amplitudes. */
function validateAnimations(documents, collector) {
  const data = collectIdentified(documents, "content/animations/entity-animations.json", "animationSets",
    "animation set", collector);
  for (const set of data.records) {
    const states = requireArray(set.states, collector, data.file, `$.animationSets.${set.id}.states`);
    if (states.length === 0) collector.add(data.file, `$.animationSets.${set.id}.states`, "empty-animation",
      "Animation sets require at least one locomotion state.");
    const stateIds = new Set();
    let priorMaximum = -1;
    states.forEach((state, index) => {
      const record = requireObject(state, collector, data.file, `$.animationSets.${set.id}.states[${index}]`);
      if (record === null) return;
      const path = `$.animationSets.${set.id}.states[${index}]`;
      const id = requireString(record.id, collector, data.file, `${path}.id`, /^[a-z][a-z0-9_-]*$/);
      requireUniqueId(id, stateIds, collector, data.file, `${path}.id`, "animation state");
      const maximum = requireNumber(record.speedMaximum, collector, data.file, `${path}.speedMaximum`, 0, 64);
      if (maximum !== null && maximum < priorMaximum) collector.add(data.file, `${path}.speedMaximum`,
        "unordered-animation-speed", "Animation speedMaximum values must ascend in declaration order.");
      if (maximum !== null) priorMaximum = maximum;
      requireNumber(record.cycleSeconds, collector, data.file,
        `${path}.cycleSeconds`, 0.05, 60);
      requireNumber(record.legSwingDegrees, collector, data.file, `${path}.legSwingDegrees`, 0, 180);
      requireNumber(record.armSwingDegrees, collector, data.file, `${path}.armSwingDegrees`, 0, 180);
    });
    const attack = requireObject(set.attack, collector, data.file, `$.animationSets.${set.id}.attack`);
    requireNumber(attack?.durationSeconds, collector, data.file,
      `$.animationSets.${set.id}.attack.durationSeconds`, 0.05, 60);
    requireNumber(attack?.armSwingDegrees, collector, data.file,
      `$.animationSets.${set.id}.attack.armSwingDegrees`, 0, 180);
    const hurt = requireObject(set.hurt, collector, data.file, `$.animationSets.${set.id}.hurt`);
    requireNumber(hurt?.durationSeconds, collector, data.file,
      `$.animationSets.${set.id}.hurt.durationSeconds`, 0.05, 60);
    requireNumber(hurt?.bodyTiltDegrees, collector, data.file,
      `$.animationSets.${set.id}.hurt.bodyTiltDegrees`, 0, 90);
  }
  return data.ids;
}

/** Validates spawn ranges, probabilities, salt isolation, and entity ownership. */
function validateSpawnRules(records, entityIds, biomeIds, collector) {
  const file = "content/spawn-rules/entity-spawns.json";
  const salts = new Set();
  records.forEach((rule, index) => {
    const path = `$.spawnRules[${index}]`;
    requireReference(rule.entityId, entityIds, collector, file, `${path}.entityId`, "entity");
    requireArray(rule.biomes, collector, file, `${path}.biomes`).forEach((biome, biomeIndex) =>
      requireReference(biome, biomeIds, collector, file, `${path}.biomes[${biomeIndex}]`, "biome"));
    const salt = requireInteger(rule.salt, collector, file, `${path}.salt`, 1, Number.MAX_SAFE_INTEGER);
    requireUniqueId(salt, salts, collector, file, `${path}.salt`, "spawn salt");
    requireInteger(rule.minY, collector, file, `${path}.minY`, 0, 511);
    requireInteger(rule.maxY, collector, file, `${path}.maxY`, 0, 511);
    requireRange(rule.lightRange, collector, file, `${path}.lightRange`, 0, 1);
    requireRange(rule.groupSize, collector, file, `${path}.groupSize`, 1, 32);
    if (Array.isArray(rule.groupSize) && !rule.groupSize.every(Number.isInteger)) collector.add(file,
      `${path}.groupSize`, "invalid-integer-range", "Spawn group bounds must be integers.");
    if (Number.isInteger(rule.minY) && Number.isInteger(rule.maxY) && rule.minY > rule.maxY) collector.add(file,
      path, "invalid-height-range", "Spawn minY cannot exceed maxY.");
    requireNumber(rule.weight, collector, file, `${path}.weight`, 0, 1);
    requireInteger(rule.cap, collector, file, `${path}.cap`, 1, 1000);
    requireArray(rule.conditions, collector, file, `${path}.conditions`).forEach((condition, conditionIndex) =>
      requireChoice(condition, ["on_surface", "underground", "requires_sky"], collector, file,
        `${path}.conditions[${conditionIndex}]`));
  });
}

/** Validates block drops and bounded counts. */
function validateLoot(records, blockIds, collector) {
  const file = "content/loot/entity-loot.json";
  records.forEach((table, index) => requireArray(table.entries, collector, file,
    `$.lootTables[${index}].entries`).forEach((value, entryIndex) => {
    const path = `$.lootTables[${index}].entries[${entryIndex}]`;
    const entry = requireObject(value, collector, file, path);
    if (entry === null) return;
    requireReference(entry.blockId, blockIds, collector, file, `${path}.blockId`, "block");
    requireNumber(entry.chance, collector, file, `${path}.chance`, 0, 1);
    requireInteger(entry.min, collector, file, `${path}.min`, 0, 64);
    requireInteger(entry.max, collector, file, `${path}.max`, 0, 64);
    if (Number.isInteger(entry.min) && Number.isInteger(entry.max) && entry.min > entry.max) collector.add(file,
      path, "invalid-count-range", "Loot minimum count cannot exceed maximum count.");
  }));
}

/** Validates dialogue node references and start nodes. */
function validateDialogue(records, collector) {
  const file = "content/dialogue/npc-dialogue.json";
  for (const dialogue of records) {
    const nodes = requireArray(dialogue.nodes, collector, file, `$.dialogues.${dialogue.id}.nodes`);
    const ids = new Set();
    nodes.forEach((value, index) => {
      const path = `$.dialogues.${dialogue.id}.nodes[${index}]`;
      const node = requireObject(value, collector, file, path);
      if (node === null) return;
      const id = requireString(node.id, collector, file, `${path}.id`, /^[a-z][a-z0-9-]*$/);
      requireUniqueId(id, ids, collector, file, `${path}.id`, "dialogue node");
      requireString(node.text, collector, file, `${path}.text`);
    });
    requireString(dialogue.startNodeId, collector, file, `$.dialogues.${dialogue.id}.startNodeId`);
    if (!ids.has(dialogue.startNodeId)) collector.add(file, `$.dialogues.${dialogue.id}.startNodeId`,
      "missing-start", "Dialogue startNodeId must reference a node in the same dialogue.");
    nodes.forEach((value, nodeIndex) => {
      const nodePath = `$.dialogues.${dialogue.id}.nodes[${nodeIndex}]`;
      const node = requireObject(value, collector, file, nodePath);
      if (node === null) return;
      requireArray(node.choices, collector, file, `${nodePath}.choices`).forEach((choice, choiceIndex) => {
        const choicePath = `${nodePath}.choices[${choiceIndex}]`;
        const record = requireObject(choice, collector, file, choicePath);
        if (record === null) return;
        requireString(record.text, collector, file, `${choicePath}.text`);
        if (record.nextNodeId !== undefined) {
          const next = requireString(record.nextNodeId, collector, file, `${choicePath}.nextNodeId`);
          if (next !== null && !ids.has(next)) collector.add(file, `${choicePath}.nextNodeId`,
            "missing-choice-target", `Unknown dialogue node ${next}.`);
        }
      });
    });
  }
}

/** Validates all trade currencies, results, quantities, and use limits. */
function validateTrades(records, blockIds, collector) {
  const file = "content/trading/npc-trades.json";
  for (const table of records) for (const value of requireArray(table.offers, collector, file,
    `$.tradeTables.${table.id}.offers`)) {
    const offer = requireObject(value, collector, file, `$.tradeTables.${table.id}.offers`);
    if (offer === null) continue;
    requireReference(offer.costBlockId, blockIds, collector, file, `$.tradeTables.${table.id}.costBlockId`, "block");
    requireReference(offer.resultBlockId, blockIds, collector, file,
      `$.tradeTables.${table.id}.resultBlockId`, "block");
    for (const key of ["costCount", "resultCount", "maxUses"]) requireInteger(offer[key], collector, file,
      `$.tradeTables.${table.id}.${key}`, 1, 10000);
  }
}
