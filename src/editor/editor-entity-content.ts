/** Adapts unsaved canonical entities, behaviors, and spawn rules to production EntityManager contracts. */

// Generated block identities and production entity interfaces define the adapter's exact runtime output.
import { BLOCK_ID_BY_CONTENT_ID } from "../generated/block-registry";
import type { EntityRuntimeContent } from "../engine/entities/entity-runtime";
import type { EntityAssetDefinition, ProceduralModelPart } from "../engine/entities/entity-asset-loader";
import type {
  BehaviorGraphDefinition,
  BehaviorNodeDefinition,
  EntityDefinition,
  EntityAnimationSetDefinition,
  EntitySpawnRule,
  LootTableDefinition,
  DialogueDefinition,
  TradeTableDefinition,
} from "../engine/entities/entity-model";
import type { JsonObject, JsonValue } from "./editor-state";

/** Narrows required canonical records before simulation values are read. */
function object(value: JsonValue | undefined, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

/** Reads a required finite number from one canonical record. */
function number(source: JsonObject, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
  return value;
}

/** Reads a required non-empty string from one canonical record. */
function string(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string.`);
  return value;
}

/** Reads a homogeneous string list used by factions, biomes, children, and spawn conditions. */
function strings(source: JsonObject, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${key} must contain only strings.`);
  }
  return value as string[];
}

/** Reads an exact two-number range tuple. */
function pair(source: JsonObject, key: string): [number, number] {
  const value = source[key];
  if (!Array.isArray(value) || value.length !== 2 || value.some((entry) => typeof entry !== "number")) {
    throw new Error(`${key} must contain two numbers.`);
  }
  return [value[0] as number, value[1] as number];
}

/** Reads an exact three-number model vector. */
function triple(source: JsonObject, key: string): [number, number, number] {
  const value = source[key];
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "number")) {
    throw new Error(`${key} must contain three numbers.`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

/** Resolves interaction block references through the same append-only generated block map as gameplay. */
function block(source: JsonObject, key: string): number {
  const identifier = string(source, key);
  const blockId = BLOCK_ID_BY_CONTENT_ID.get(identifier);
  if (blockId === undefined) throw new Error(`${key} references unknown block ${identifier}.`);
  return blockId;
}

/** Returns a canonical file document by stable path suffix. */
function file(files: Readonly<Record<string, JsonValue>>, suffix: string): JsonObject {
  const entry = Object.entries(files).find(([path]) => path.endsWith(suffix));
  if (entry === undefined) throw new Error(`Editor snapshot is missing ${suffix}.`);
  return object(entry[1], suffix);
}

/** Returns all object entries from one canonical collection. */
function records(document: JsonObject, key: string): JsonObject[] {
  const value = document[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array.`);
  return value.map((entry, index) => object(entry, `${key}[${index}]`));
}

/** Restricts behavior parameters to the runtime's non-executable primitive blackboard values. */
function primitiveRecord(source: JsonObject): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`Behavior parameter ${key} must be a string, number, or Boolean.`);
    }
    result[key] = value;
  }
  return result;
}

/** Compiles flat canonical entity properties to immutable production definitions. */
function compileEntities(files: Readonly<Record<string, JsonValue>>): EntityDefinition[] {
  const sources = ["entities/npcs.json", "entities/enemies.json", "entities/passive.json"];
  return sources.flatMap((suffix) => records(file(files, suffix), "entities")).map((entity) => {
    const dimensions = object(entity.dimensions, "dimensions");
    const attack = object(entity.attack, "attack");
    const perception = object(entity.perception, "perception");
    const category = string(entity, "category");
    const persistence = string(entity, "persistence");
    if (category !== "npc" && category !== "passive" && category !== "hostile") {
      throw new Error(`Entity ${string(entity, "id")} has an invalid category.`);
    }
    if (persistence !== "persistent" && persistence !== "despawn") {
      throw new Error(`Entity ${string(entity, "id")} has an invalid persistence policy.`);
    }
    return {
      id: string(entity, "id"), definitionVersion: number(entity, "definitionVersion"),
      displayName: string(entity, "displayName"), category,
      factionId: string(entity, "factionId"), hostileTo: strings(entity, "hostileTo"), persistence,
      modelAssetId: string(entity, "modelAssetId"), animationSetId: string(entity, "animationSetId"),
      behaviorGraphId: string(entity, "behaviorGraphId"), spawnRuleId: string(entity, "spawnRuleId"),
      lootTableId: string(entity, "lootTableId"), maxHealth: number(entity, "maxHealth"),
      dimensions: { width: number(dimensions, "width"), height: number(dimensions, "height") },
      speed: number(entity, "speed"),
      attack: {
        damage: number(attack, "damage"), range: number(attack, "range"),
        cooldownSeconds: number(attack, "cooldownSeconds"),
      },
      perception: {
        range: number(perception, "range"), fieldOfViewDegrees: number(perception, "fieldOfViewDegrees"),
        memorySeconds: number(perception, "memorySeconds"),
      },
      ...(typeof entity.dialogueId === "string" ? { dialogueId: entity.dialogueId } : {}),
      ...(typeof entity.tradeTableId === "string" ? { tradeTableId: entity.tradeTableId } : {}),
    };
  });
}

/** Compiles unsaved procedural and local glTF asset references for the production loader. */
function compileAssets(files: Readonly<Record<string, JsonValue>>): EntityAssetDefinition[] {
  return records(file(files, "assets/assets.json"), "assets").map((asset) => {
    const type = string(asset, "type");
    if (type !== "procedural-entity-model" && type !== "gltf") {
      throw new Error(`Asset ${string(asset, "id")} has an unsupported type.`);
    }
    const parts = asset.parts === undefined ? undefined : records(asset, "parts").map((part): ProceduralModelPart => ({
      name: string(part, "name"), size: triple(part, "size"), position: triple(part, "position"),
      color: string(part, "color"),
    }));
    return {
      id: string(asset, "id"), type,
      ...(typeof asset.source === "string" ? { source: asset.source } : {}),
      ...(typeof asset.scale === "number" ? { scale: asset.scale } : {}),
      ...(parts === undefined ? {} : { parts }),
    };
  });
}

/** Compiles unsaved locomotion, attack, and hurt animation controls for the production renderer. */
function compileAnimations(files: Readonly<Record<string, JsonValue>>): EntityAnimationSetDefinition[] {
  return records(file(files, "animations/entity-animations.json"), "animationSets").map((set) => {
    const attack = object(set.attack, "attack");
    const hurt = object(set.hurt, "hurt");
    return {
      id: string(set, "id"),
      states: records(set, "states").map((state) => ({
        id: string(state, "id"), speedMaximum: number(state, "speedMaximum"),
        cycleSeconds: number(state, "cycleSeconds"), legSwingDegrees: number(state, "legSwingDegrees"),
        armSwingDegrees: number(state, "armSwingDegrees"),
      })),
      attack: {
        durationSeconds: number(attack, "durationSeconds"),
        armSwingDegrees: number(attack, "armSwingDegrees"),
      },
      hurt: {
        durationSeconds: number(hurt, "durationSeconds"),
        bodyTiltDegrees: number(hurt, "bodyTiltDegrees"),
      },
    };
  });
}

/** Compiles safe typed graph nodes without admitting values outside JSON primitives and child references. */
function compileBehaviors(files: Readonly<Record<string, JsonValue>>): BehaviorGraphDefinition[] {
  return records(file(files, "behaviors/entity-behaviors.json"), "graphs").map((graph) => ({
    id: string(graph, "id"), rootNodeId: string(graph, "rootNodeId"),
    nodes: records(graph, "nodes").map((node): BehaviorNodeDefinition => {
      const parameters = node.parameters === undefined ? undefined : object(node.parameters, "parameters");
      const type = string(node, "type");
      if (type !== "selector" && type !== "sequence" && type !== "condition" && type !== "action" &&
          type !== "cooldown" && type !== "repeat") throw new Error(`Behavior node ${string(node, "id")} is invalid.`);
      return {
        id: string(node, "id"), type,
        ...(node.children === undefined ? {} : { children: strings(node, "children") }),
        ...(typeof node.condition === "string" ? { condition: node.condition } : {}),
        ...(typeof node.action === "string" ? { action: node.action } : {}),
        ...(typeof node.seconds === "number" ? { seconds: node.seconds } : {}),
        ...(typeof node.count === "number" ? { count: node.count } : {}),
        ...(parameters === undefined ? {} : { parameters: primitiveRecord(parameters) }),
      };
    }),
  }));
}

/** Compiles deterministic spawn salt, environment, population, and grouping controls. */
function compileSpawns(files: Readonly<Record<string, JsonValue>>): EntitySpawnRule[] {
  return records(file(files, "spawn-rules/entity-spawns.json"), "spawnRules").map((rule) => ({
    id: string(rule, "id"), salt: number(rule, "salt"), entityId: string(rule, "entityId"),
    biomes: strings(rule, "biomes"), minY: number(rule, "minY"), maxY: number(rule, "maxY"),
    lightRange: pair(rule, "lightRange"), groupSize: pair(rule, "groupSize"),
    weight: number(rule, "weight"), cap: number(rule, "cap"), conditions: strings(rule, "conditions"),
  }));
}

/** Compiles unsaved deterministic drop tables with resolved runtime block identifiers. */
function compileLoot(files: Readonly<Record<string, JsonValue>>): LootTableDefinition[] {
  return records(file(files, "loot/entity-loot.json"), "lootTables").map((table) => ({
    id: string(table, "id"),
    entries: records(table, "entries").map((entry) => ({
      blockId: block(entry, "blockId"), chance: number(entry, "chance"),
      min: number(entry, "min"), max: number(entry, "max"),
    })),
  }));
}

/** Compiles unsaved finite dialogue graphs for isolated NPC interaction tests. */
function compileDialogues(files: Readonly<Record<string, JsonValue>>): DialogueDefinition[] {
  return records(file(files, "dialogue/npc-dialogue.json"), "dialogues").map((dialogue) => ({
    id: string(dialogue, "id"), startNodeId: string(dialogue, "startNodeId"),
    nodes: records(dialogue, "nodes").map((node) => ({
      id: string(node, "id"), text: string(node, "text"),
      choices: records(node, "choices").map((choice) => ({
        text: string(choice, "text"),
        ...(typeof choice.nextNodeId === "string" ? { nextNodeId: choice.nextNodeId } : {}),
      })),
    })),
  }));
}

/** Compiles unsaved bounded block-for-block offers for isolated NPC trade tests. */
function compileTrades(files: Readonly<Record<string, JsonValue>>): TradeTableDefinition[] {
  return records(file(files, "trading/npc-trades.json"), "tradeTables").map((table) => ({
    id: string(table, "id"),
    offers: records(table, "offers").map((offer) => ({
      costBlockId: block(offer, "costBlockId"), costCount: number(offer, "costCount"),
      resultBlockId: block(offer, "resultBlockId"), resultCount: number(offer, "resultCount"),
      maxUses: number(offer, "maxUses"),
    })),
  }));
}

/** Returns the exact manager content with unsaved simulation graphs and rules plus compiled interaction registries. */
export function compileEditorEntityContent(
  files: Readonly<Record<string, JsonValue>>,
): EntityRuntimeContent {
  return {
    assets: compileAssets(files),
    definitions: compileEntities(files),
    animationSets: compileAnimations(files),
    behaviors: compileBehaviors(files),
    spawnRules: compileSpawns(files),
    lootTables: compileLoot(files),
    dialogues: compileDialogues(files),
    trades: compileTrades(files),
  };
}
