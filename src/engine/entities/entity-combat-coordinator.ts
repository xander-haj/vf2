/** Routes one authored attack intent to its player or faction-entity target. */

import { EntityAnimationLibrary } from "./entity-animation-library";
import { updateEntityCombat, updateEntityCombatAgainstEntity } from "./entity-combat";
import type { EntityInstance } from "./entity-instance";
import type { EntityManagerPlayer, EntityManagerWorld } from "./entity-runtime";

/** CoordinatedCombatResult identifies the target class and any defeated entity. */
export interface CoordinatedCombatResult {
  readonly playerAttacked: boolean;
  readonly playerDefeated: boolean;
  readonly defeatedEntity: EntityInstance | null;
}

/** Resolves combat once against the target kind stored in the entity blackboard. */
export function updateCoordinatedCombat(
  attacker: EntityInstance,
  entities: ReadonlyMap<string, EntityInstance>,
  player: EntityManagerPlayer,
  world: EntityManagerWorld,
  animations: EntityAnimationLibrary,
): CoordinatedCombatResult {
  const entityTarget = attacker.target?.kind === "entity" ? entities.get(attacker.target.id) : undefined;
  if (entityTarget !== undefined) {
    const combat = updateEntityCombatAgainstEntity(
      attacker,
      entityTarget,
      world,
      animations.getHurtDuration(entityTarget.definition),
    );
    if (combat.attacked) attacker.attackAnimationSeconds = animations.getAttackDuration(attacker.definition);
    return {
      playerAttacked: false,
      playerDefeated: false,
      defeatedEntity: combat.targetDefeated ? entityTarget : null,
    };
  }
  const combat = updateEntityCombat(attacker, player, world);
  if (combat.attacked) attacker.attackAnimationSeconds = animations.getAttackDuration(attacker.definition);
  return {
    playerAttacked: combat.attacked,
    playerDefeated: combat.playerDefeated,
    defeatedEntity: null,
  };
}
