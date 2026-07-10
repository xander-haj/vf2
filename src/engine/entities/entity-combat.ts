/**
 * Resolves authored entity melee intent against the player with range and cooldown enforcement.
 * Damage application remains behind a narrow target interface so AI cannot mutate player internals directly.
 */

import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";
import { hasLineOfSight, type PerceptionWorld } from "./entity-perception";

/** PlayerCombatTarget exposes only the state required for entity melee attacks. */
export interface PlayerCombatTarget {
  getPosition(): Vector3;
  getEyePosition(target: Vector3): Vector3;
  isAlive(): boolean;
  takeDamage(amount: number): boolean;
}

/** CombatUpdate reports whether an attack landed and whether it defeated the player. */
export interface CombatUpdate {
  readonly attacked: boolean;
  readonly playerDefeated: boolean;
}

/** EntityCombatUpdate reports generic faction-target damage and death. */
export interface EntityCombatUpdate {
  readonly attacked: boolean;
  readonly targetDefeated: boolean;
}

/** Applies one eligible melee attack after behavior, movement, and final distance resolution. */
export function updateEntityCombat(
  entity: EntityInstance,
  player: PlayerCombatTarget,
  world: PerceptionWorld,
): CombatUpdate {
  if (
    !entity.isAlive() ||
    (!entity.intent.attack && !entity.intent.rangedAttack) ||
    entity.target?.kind !== "player" ||
    entity.attackCooldownSeconds > 0 ||
    !player.isAlive()
  ) {
    return { attacked: false, playerDefeated: false };
  }
  const distance = entity.position.distanceTo(player.getPosition());
  if (distance > entity.definition.attack.range) {
    return { attacked: false, playerDefeated: false };
  }
  const attackerEye = entity.position.clone();
  attackerEye.y += entity.definition.dimensions.height * 0.8;
  if (!hasLineOfSight(world, attackerEye, player.getEyePosition(new Vector3()))) {
    return { attacked: false, playerDefeated: false };
  }
  const applied = player.takeDamage(entity.definition.attack.damage);
  if (!applied) {
    return { attacked: false, playerDefeated: false };
  }
  entity.attackCooldownSeconds = entity.definition.attack.cooldownSeconds;
  return { attacked: true, playerDefeated: !player.isAlive() };
}

/** Resolves one visible faction-authorized attack against another live entity body. */
export function updateEntityCombatAgainstEntity(
  attacker: EntityInstance,
  target: EntityInstance,
  world: PerceptionWorld,
  hurtFeedbackSeconds: number,
): EntityCombatUpdate {
  if (
    !attacker.isAlive()
    || (!attacker.intent.attack && !attacker.intent.rangedAttack)
    || attacker.target?.kind !== "entity"
    || attacker.target.id !== target.id
    || attacker.attackCooldownSeconds > 0
    || !target.isAlive()
    || !attacker.definition.hostileTo.includes(target.definition.factionId)
  ) return { attacked: false, targetDefeated: false };
  if (attacker.position.distanceTo(target.position) > attacker.definition.attack.range) {
    return { attacked: false, targetDefeated: false };
  }
  const attackerEye = attacker.position.clone();
  attackerEye.y += attacker.definition.dimensions.height * 0.8;
  const targetEye = target.position.clone();
  targetEye.y += target.definition.dimensions.height * 0.8;
  if (!hasLineOfSight(world, attackerEye, targetEye)) {
    return { attacked: false, targetDefeated: false };
  }
  const damage = target.takeDamage(attacker.definition.attack.damage, hurtFeedbackSeconds);
  if (!damage.applied) return { attacked: false, targetDefeated: damage.died };
  attacker.attackCooldownSeconds = attacker.definition.attack.cooldownSeconds;
  return { attacked: true, targetDefeated: damage.died };
}
