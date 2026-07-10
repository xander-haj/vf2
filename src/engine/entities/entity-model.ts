/**
 * Defines the immutable entity content contracts and mutable runtime state shared by all entity systems.
 * Generated registries remain plain data while these interfaces enforce their complete runtime meaning.
 */

/** EntityCategory determines default faction and interaction behavior. */
export type EntityCategory = "npc" | "passive" | "hostile";

/** EntityDimensions describes the axis-aligned physical body in block units. */
export interface EntityDimensions {
  readonly width: number;
  readonly height: number;
}

/** EntityAttackDefinition controls melee reach, damage, and cooldown timing. */
export interface EntityAttackDefinition {
  readonly damage: number;
  readonly range: number;
  readonly cooldownSeconds: number;
}

/** EntityPerceptionDefinition controls bounded target acquisition and memory. */
export interface EntityPerceptionDefinition {
  readonly range: number;
  readonly fieldOfViewDegrees: number;
  readonly memorySeconds: number;
}

/** EntityDefinition is the complete immutable content record for one NPC or enemy type. */
export interface EntityDefinition {
  readonly id: string;
  readonly definitionVersion: number;
  readonly displayName: string;
  readonly category: EntityCategory;
  readonly factionId: string;
  readonly hostileTo: readonly string[];
  readonly persistence: "persistent" | "despawn";
  readonly modelAssetId: string;
  readonly animationSetId: string;
  readonly behaviorGraphId: string;
  readonly maxHealth: number;
  readonly dimensions: EntityDimensions;
  readonly speed: number;
  readonly attack: EntityAttackDefinition;
  readonly perception: EntityPerceptionDefinition;
  readonly spawnRuleId: string;
  readonly lootTableId: string;
  readonly dialogueId?: string;
  readonly tradeTableId?: string;
}

/** ProceduralAnimationState maps horizontal speed to a complete authored gait. */
export interface ProceduralAnimationState {
  readonly id: string;
  readonly speedMaximum: number;
  readonly cycleSeconds: number;
  readonly legSwingDegrees: number;
  readonly armSwingDegrees: number;
}

/** EntityAnimationSetDefinition controls movement, attack, and hurt motion without executable scripts. */
export interface EntityAnimationSetDefinition {
  readonly id: string;
  readonly states: readonly ProceduralAnimationState[];
  readonly attack: { readonly durationSeconds: number; readonly armSwingDegrees: number };
  readonly hurt: { readonly durationSeconds: number; readonly bodyTiltDegrees: number };
}

/** BehaviorNodeType enumerates the safe operations supported by authored behavior graphs. */
export type BehaviorNodeType =
  | "selector"
  | "sequence"
  | "condition"
  | "action"
  | "cooldown"
  | "repeat";

/** BehaviorNodeDefinition stores one typed graph node without executable content strings. */
export interface BehaviorNodeDefinition {
  readonly id: string;
  readonly type: BehaviorNodeType;
  readonly children?: readonly string[];
  readonly condition?: string;
  readonly action?: string;
  readonly seconds?: number;
  readonly count?: number;
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}

/** BehaviorGraphDefinition identifies the root of one validated, reusable behavior tree. */
export interface BehaviorGraphDefinition {
  readonly id: string;
  readonly rootNodeId: string;
  readonly nodes: readonly BehaviorNodeDefinition[];
}

/** EntitySpawnRule controls deterministic chunk populations and environmental eligibility. */
export interface EntitySpawnRule {
  readonly id: string;
  readonly salt: number;
  readonly entityId: string;
  readonly biomes: readonly string[];
  readonly minY: number;
  readonly maxY: number;
  readonly lightRange: readonly [number, number];
  readonly groupSize: readonly [number, number];
  readonly weight: number;
  readonly cap: number;
  readonly conditions: readonly string[];
}

/** LootEntry describes one bounded block drop chance. */
export interface LootEntry {
  readonly blockId: number;
  readonly chance: number;
  readonly min: number;
  readonly max: number;
}

/** LootTableDefinition groups deterministic drops for one entity death. */
export interface LootTableDefinition {
  readonly id: string;
  readonly entries: readonly LootEntry[];
}

/** DialogueChoice links visible player text to another authored node or a terminal response. */
export interface DialogueChoice {
  readonly text: string;
  readonly nextNodeId?: string;
}

/** DialogueNode contains one NPC line and its safe authored choices. */
export interface DialogueNode {
  readonly id: string;
  readonly text: string;
  readonly choices: readonly DialogueChoice[];
}

/** DialogueDefinition supplies a validated conversation graph for one NPC type. */
export interface DialogueDefinition {
  readonly id: string;
  readonly startNodeId: string;
  readonly nodes: readonly DialogueNode[];
}

/** TradeOffer exchanges bounded block quantities without introducing an incomplete inventory model. */
export interface TradeOffer {
  readonly costBlockId: number;
  readonly costCount: number;
  readonly resultBlockId: number;
  readonly resultCount: number;
  readonly maxUses: number;
}

/** TradeTableDefinition groups the offers exposed by one NPC definition. */
export interface TradeTableDefinition {
  readonly id: string;
  readonly offers: readonly TradeOffer[];
}

/** EntityTarget references either the player or another live entity. */
export type EntityTarget = { readonly kind: "player" } | { readonly kind: "entity"; readonly id: string };

/** EntityIntent is reset each frame and filled by behavior before physics and combat consume it. */
export interface EntityIntent {
  moveX: number;
  moveZ: number;
  lookX: number;
  lookZ: number;
  attack: boolean;
  rangedAttack: boolean;
  interact: boolean;
}

/** PersistedEntityStateV1 is retained solely for non-destructive state migration. */
export interface PersistedEntityStateV1 {
  readonly version: 1;
  readonly id: string;
  readonly definitionId: string;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly yaw: number;
  readonly health: number;
  readonly ageSeconds: number;
  readonly behaviorState: Readonly<Record<string, number | string | boolean>>;
}

/** PersistedEntityState is the complete current component snapshot stored with a world. */
export interface PersistedEntityState {
  readonly version: 2;
  readonly id: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly yaw: number;
  readonly health: number;
  readonly ageSeconds: number;
  readonly grounded: boolean;
  readonly target: EntityTarget | null;
  readonly targetMemorySeconds: number;
  readonly attackCooldownSeconds: number;
  readonly navigationCooldownSeconds: number;
  readonly behaviorAccumulatorSeconds: number;
  readonly hurtFeedbackSeconds: number;
  readonly attackAnimationSeconds: number;
  readonly requestedAnimationId: string | null;
  readonly requestedAnimationSeconds: number;
  readonly navigationPath: readonly (readonly [number, number, number])[];
  readonly behaviorState: Readonly<Record<string, number | string | boolean>>;
}

/** EntityDamageResult communicates whether damage landed and whether it caused death. */
export interface EntityDamageResult {
  readonly applied: boolean;
  readonly died: boolean;
}
