/** Defines the generated content and narrow world/player/storage boundaries consumed by EntityManager. */

import type { Vector3 } from "three";
import type { EntityAssetDefinition } from "./entity-asset-loader";
import type { PlayerCombatTarget } from "./entity-combat";
import type {
  BehaviorGraphDefinition,
  DialogueDefinition,
  EntityAnimationSetDefinition,
  EntityDefinition,
  EntitySpawnRule,
  LootTableDefinition,
  PersistedEntityState,
  TradeTableDefinition,
} from "./entity-model";
import type { EntityCollisionWorld } from "./entity-physics";
import type { EntitySpawnWorld } from "./entity-spawner";

/** EntityManagerPlayer exposes the complete player boundary required by perception and combat. */
export interface EntityManagerPlayer extends PlayerCombatTarget {
  getEyePosition(target: Vector3): Vector3;
}

/** EntityManagerWorld combines voxel collision, perception, and deterministic spawning facts. */
export interface EntityManagerWorld extends EntityCollisionWorld, EntitySpawnWorld {}

/** EntityPersistenceBoundary owns validated actor and collected-inventory snapshots. */
export interface EntityPersistenceBoundary {
  getEntityStates(): readonly PersistedEntityState[];
  getInventoryState(): Readonly<Record<string, number>>;
  recordEntityState(
    states: readonly PersistedEntityState[],
    inventory: Readonly<Record<string, number>>,
  ): boolean;
}

/** EntityRuntimeContent is the complete generated content snapshot needed by phases E and F. */
export interface EntityRuntimeContent {
  readonly assets: readonly EntityAssetDefinition[];
  readonly definitions: readonly EntityDefinition[];
  readonly animationSets: readonly EntityAnimationSetDefinition[];
  readonly behaviors: readonly BehaviorGraphDefinition[];
  readonly spawnRules: readonly EntitySpawnRule[];
  readonly lootTables: readonly LootTableDefinition[];
  readonly dialogues: readonly DialogueDefinition[];
  readonly trades: readonly TradeTableDefinition[];
}

/** EntityInteractionResult reports whether an actor consumed a player ray action. */
export interface EntityInteractionResult {
  readonly handled: boolean;
  readonly message: string | null;
}
