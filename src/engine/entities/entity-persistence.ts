/** Restores and collects durable entity state without coupling storage to simulation ownership. */

import { isBlockId } from "../../game/block-types";
import type { EntityInstance } from "./entity-instance";
import type { EntityDefinition, PersistedEntityState } from "./entity-model";
import type { PlayerInventory } from "./loot-system";

/** EntityPersistenceReader is the read side of the world-owned entity save boundary. */
export interface EntityPersistenceReader {
  getEntityStates(): readonly PersistedEntityState[];
  getInventoryState(): Readonly<Record<string, number>>;
}

/** Restores known actor snapshots and validated inventory quantities into their runtime owners. */
export function restoreEntityPersistence(
  persistence: EntityPersistenceReader,
  definitions: ReadonlyMap<string, EntityDefinition>,
  sleeping: Map<string, PersistedEntityState>,
  inventory: PlayerInventory,
): void {
  persistence.getEntityStates().forEach((state) => {
    if (definitions.has(state.definitionId)) sleeping.set(state.id, state);
  });
  Object.entries(persistence.getInventoryState()).forEach(([key, count]) => {
    const blockId = Number(key);
    if (isBlockId(blockId) && Number.isInteger(count) && count > 0) inventory.add(blockId, count);
  });
}

/** Collects living persistent actors plus durable sleeping and death-tombstone snapshots. */
export function collectPersistentEntityStates(
  sleeping: ReadonlyMap<string, PersistedEntityState>,
  entities: Iterable<EntityInstance>,
): readonly PersistedEntityState[] {
  const states = [...sleeping.values()];
  for (const entity of entities) {
    if (entity.definition.persistence === "persistent" && entity.isAlive()) states.push(entity.serialize());
  }
  return states;
}
