/** Resolves content-authored faction hostility into visible player or entity targets. */

import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";
import type { EntityTarget } from "./entity-model";
import { canPerceivePosition, type PerceptionWorld } from "./entity-perception";
import type { EntityManagerPlayer } from "./entity-runtime";

/** Returns a detached foot coordinate for a currently resolvable target. */
export function resolveTargetPosition(
  target: EntityTarget | null,
  entities: ReadonlyMap<string, EntityInstance>,
  player: EntityManagerPlayer,
): Vector3 | null {
  if (target?.kind === "player") return player.isAlive() ? player.getPosition().clone() : null;
  if (target?.kind !== "entity") return null;
  const entity = entities.get(target.id);
  return entity?.isAlive() === true ? entity.position.clone() : null;
}

/** Returns the eye coordinate used for line-of-sight checks against one target. */
export function resolveTargetEye(
  target: EntityTarget | null,
  entities: ReadonlyMap<string, EntityInstance>,
  player: EntityManagerPlayer,
): Vector3 | null {
  if (target?.kind === "player") return player.isAlive() ? player.getEyePosition(new Vector3()) : null;
  if (target?.kind !== "entity") return null;
  const entity = entities.get(target.id);
  if (entity === undefined || !entity.isAlive()) return null;
  const eye = entity.position.clone();
  eye.y += entity.definition.dimensions.height * 0.8;
  return eye;
}

/** Selects the nearest visible faction declared in hostileTo, including the player faction. */
export function findHostileTarget(
  seeker: EntityInstance,
  entities: Iterable<EntityInstance>,
  player: EntityManagerPlayer,
  world: PerceptionWorld,
): EntityTarget | null {
  let selected: EntityTarget | null = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  if (seeker.definition.hostileTo.includes("vf:player") && player.isAlive()) {
    const eye = player.getEyePosition(new Vector3());
    if (canPerceivePosition(seeker, eye, world)) {
      selected = { kind: "player" };
      selectedDistance = seeker.position.distanceTo(player.getPosition());
    }
  }
  for (const candidate of entities) {
    if (
      candidate.id === seeker.id
      || !candidate.active
      || !candidate.isAlive()
      || !seeker.definition.hostileTo.includes(candidate.definition.factionId)
    ) continue;
    const eye = candidate.position.clone();
    eye.y += candidate.definition.dimensions.height * 0.8;
    const distance = seeker.position.distanceTo(candidate.position);
    if (distance < selectedDistance && canPerceivePosition(seeker, eye, world)) {
      selected = { kind: "entity", id: candidate.id };
      selectedDistance = distance;
    }
  }
  return selected;
}
